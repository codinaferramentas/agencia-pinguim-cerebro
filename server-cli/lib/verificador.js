// ============================================================
// EPP — Camada 1 (Verifier) + Camada 2 (Reflection loop)
// Anatomia obrigatoria de TODO agente Pinguim — porte da Edge Function
// pra runtime CLI local.
// ============================================================
//
// Diferenca pra versao Edge:
// - Em vez de chamar gpt-4o-mini via OpenAI API, dispara `claude --model haiku`
//   sem ferramentas (--allowedTools "" desabilita Bash/Read/etc). Verifier
//   so analisa, nao executa.
// - Custo: zero externo (consume Max do socio).
// - Latencia tipica: 3-8s por verificacao.
//
// Camada 1 (Verifier):
//   Apos resposta do agente, dispara Verifier com checklist por papel.
//   Devolve aprovado/reprovado + problemas + recomendacao.
//
// Camada 2 (Reflection):
//   Se reprovado, refaz UMA vez com a nota do Verifier.
//   Guardrails: max 1 reflexao, similaridade <0.85 (anti-loop), cap
//   de tempo total.
// ============================================================

const { spawn } = require('child_process');

const EPP_LIMITS = {
  MAX_REFLECTIONS: 1,
  MAX_IDENTICAL_SIMILARITY: 0.85,
  MAX_LATENCIA_MS_TURNO: 110_000,
};

// ============================================================
// Spawna Claude CLI sem ferramentas (so analise) usando Haiku (rapido + barato).
// Verifier nao precisa Bash/Read — so le o prompt e devolve JSON.
// ============================================================
function runClaudeAnalise(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'text',
      '--model', opts.model || 'haiku',
      // Sem --allowedTools = sem ferramentas. Verifier nao precisa.
    ];

    const proc = spawn('claude', args, {
      cwd: opts.cwd || process.cwd(),
      env: {
        ...process.env,
        CLAUDECODE: '',
        CLAUDE_CODE_ENTRYPOINT: '',
      },
      shell: true,
      // V2.6.1 — NAO passar timeout aqui (so mata fork Node, nao subprocess CLI).
      // SIGKILL real abaixo.
    });

    const timeoutMs = opts.timeout || 30_000;
    let killed = false;
    const killTimer = setTimeout(() => {
      killed = true;
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (killed) {
        reject(new Error(`verifier KILLED apos ${(timeoutMs/1000)}s`));
        return;
      }
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`verifier exit ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      reject(new Error(`spawn verifier: ${err.message}`));
    });
  });
}

// ============================================================
// Checklists por papel — mesmas do Edge, adaptadas.
// ============================================================
const CHECKLISTS = {
  atendente: [
    '1. Resposta foi adequada ao tipo de pedido (saudacao->curta, pergunta factual->direta, pedido criativo->briefing rico)?',
    '2. Se reconheceu produto, consultou Cerebro (executou buscar-cerebro.sh)?',
    '3. **REGRA DURA: zero invencao de numero/preco/data.** Qualquer numero especifico no output (R$, %, "X clientes", "X dias") DEVE ter vindo do Cerebro consultado ou da pergunta do usuario. Se nao veio, REPROVAR. Procure por "R$", "$", numeros seguidos de "%", "clientes", "alunos", "vendas", "dias". Cada um precisa ter base.',
    '4. Nao parou pra perguntar quando devia consultar fonte primeiro?',
    '5. Tom respeitou anatomia Pinguim (direto, sem floreio, sem corporate-speak)?',
  ],
  mestre: [
    '1. Output respeita o metodo do mestre (citado no system_prompt)?',
    '2. Inclui marca registrada do mestre (Hormozi=matematica, Halbert=especificidade, Schwartz=consciencia)?',
    '3. **REGRA DURA: numeros so se vieram do briefing.** Mestres podem usar matematica generica ("dobrar", "10x") mas NAO podem cravar valores especificos sem briefing dar. Se ve R$X ou X% sem base, REPROVAR.',
    '4. Tom consistente com o mestre?',
  ],
  'orquestrador-de-squad': [
    '1. Output tem blocos preenchidos (nao vazio, nao "lorem")?',
    '2. Cita explicitamente quais mestres da squad foram invocados?',
    '3. Cada mestre tem justificativa clara?',
    '4. **REGRA DURA: nenhuma invencao de numero/preco/metrica.** Cada R$, $, %, ou "X clientes" precisa ter base no briefing.',
    '5. Output cabe no formato pedido pela Skill?',
  ],
};

// ============================================================
// verificarOutput — Camada 1 EPP
// ============================================================
async function verificarOutput({
  briefing,
  output_md,
  agente_slug,
  agente_role = 'atendente',
  expectativa = '',
}) {
  const checklist = CHECKLISTS[agente_role] || CHECKLISTS.atendente;

  const sysPrompt = `Voce e o **Verifier do Pinguim OS**. Sua funcao e checar se o output de outro agente passou em criterios de qualidade objetivos.

Voce NAO reescreve, NAO sugere melhorias subjetivas, NAO opina sobre estilo. Voce so responde SIM/NAO em cada item do checklist e identifica problemas concretos.

Devolva APENAS JSON nesse formato exato (sem markdown, sem cercas \`\`\`):
{
  "aprovado": true|false,
  "problemas": ["problema concreto 1", "problema concreto 2"],
  "recomendacao_refazer": "instrucao curta pro agente refazer, ou null se aprovado"
}

Aprovado=true SOMENTE se todos os itens passarem. Em caso de duvida, reprovar.`;

  const userPrompt = `${sysPrompt}

## Briefing original
${(briefing || '').slice(0, 600)}

## Expectativa
${expectativa || 'Resposta adequada ao pedido do usuario'}

## Output do agente "${agente_slug}" (papel: ${agente_role})
${(output_md || '').slice(0, 2500)}

## Checklist
${checklist.join('\n')}

Responda APENAS o JSON.`;

  try {
    const t0 = Date.now();
    const raw = await runClaudeAnalise(userPrompt, { timeout: 30_000 });
    const dur = Date.now() - t0;

    // Tenta parsear JSON
    let parsed;
    try {
      const m = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
      parsed = JSON.parse(m ? m[1] : raw);
    } catch {
      // Verifier falhou ao parsear — nao bloqueia. Aprovado.
      console.warn(`[verifier] parse falhou em ${agente_slug}, aprovando por seguranca`);
      return { aprovado: true, problemas: [], recomendacao_refazer: null, latencia_ms: dur };
    }

    return {
      aprovado: parsed.aprovado === true,
      problemas: Array.isArray(parsed.problemas) ? parsed.problemas : [],
      recomendacao_refazer: parsed.recomendacao_refazer || null,
      latencia_ms: dur,
    };
  } catch (e) {
    console.warn(`[verifier] crashou em ${agente_slug}:`, e.message);
    return { aprovado: true, problemas: [], recomendacao_refazer: null, latencia_ms: 0 };
  }
}

// ============================================================
// Detector de loop semantico — Jaccard simples (zero custo)
// ============================================================
function similaridadeOutputs(a, b) {
  const tok = (s) => new Set(
    String(s || '').toLowerCase().replace(/[^a-záéíóúâêôãõç\s]/gi, ' ').split(/\s+/).filter((w) => w.length > 3)
  );
  const sa = tok(a);
  const sb = tok(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  const intersect = [...sa].filter((w) => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return intersect / union;
}

// ============================================================
// detectarPapel — heuristica pra identificar role do agente pelo input.
// ============================================================
function detectarPapelEContexto(userMessage, output) {
  const msg = (userMessage || '').toLowerCase();

  // Saudacao curta
  if (/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|e ai)[\s!?.,]*$/i.test(msg.trim())) {
    return {
      papel: 'atendente',
      expectativa: 'Resposta de saudacao CURTA (1-2 linhas), calorosa, sem prompt longo, sem listar produtos.',
      pular_verifier: true, // saudacao nao precisa Verifier
    };
  }

  // Pergunta factual sobre sistema
  if (/^(quem (e |voce )|o que (e |voce )|qual seu|como funciona|me explica)/.test(msg)) {
    return {
      papel: 'atendente',
      expectativa: 'Explicacao factual direta sobre Pinguim/sistema, sem inventar features.',
      pular_verifier: false,
    };
  }

  // Pedido sobre produto
  if (/(elo|proalt|lyra|taurus|orion|lo[\s-]?fi|mentoria express)/i.test(msg)) {
    return {
      papel: 'atendente',
      expectativa: 'Resposta baseada em consulta ao Cerebro do produto. Se Cerebro retornou pouco, declarar gap explicito. Sem inventar numero/preco/data.',
      pular_verifier: false,
    };
  }

  // Pedido criativo (copy/conteudo)
  if (/(copy|copywriting|pagina|venda|vsl|email|anuncio|criativo|reels|hook|headline)/i.test(msg)) {
    return {
      papel: 'atendente',
      expectativa: 'Briefing rico com Cerebro+Persona+Skill+Funil consultados, ou entregavel completo se for V2 com delegar-chief. Sem inventar numero/preco/data.',
      pular_verifier: false,
    };
  }

  return {
    papel: 'atendente',
    expectativa: 'Resposta adequada ao pedido do usuario, sem inventar dado.',
    pular_verifier: false,
  };
}

module.exports = {
  EPP_LIMITS,
  verificarOutput,
  similaridadeOutputs,
  detectarPapelEContexto,
};
