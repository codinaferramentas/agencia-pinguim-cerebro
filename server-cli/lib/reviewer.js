// ============================================================
// reviewer.js — V2.6 (Reviewer pós-pipeline)
// Camada de revisão crítica que roda DEPOIS do consolidado dos mestres,
// ANTES de salvar entregavel + retornar ao usuário.
//
// Foco: erros de português + clareza + tabelas mal-formadas + ambiguidade.
// NÃO substitui Verifier de adequação (esse é EPP Camada 1 do CLI normal).
// É revisão de polish editorial — leitor crítico final.
//
// Modelo: Sonnet (qualidade > Haiku pra detectar nuance de PT-BR).
// Latência: ~10-20s. Custo: zero externo (Claude Max do sócio).
// ============================================================

const { spawn } = require('child_process');

// ============================================================
// Limites do reviewer
// ============================================================
const REVIEWER_TIMEOUT_MS = 90_000; // 90s
const REVIEWER_MIN_CHARS = 1500;     // se menor, pula reviewer (overhead nao compensa)
const REVIEWER_MAX_CHARS = 60_000;   // se maior, trunca pra evitar timeout

// ============================================================
// Spawna Claude CLI sem ferramentas usando modelo padrao (Sonnet).
// Reviewer le, devolve revisao. Nao toca em arquivo, nao roda script.
// ============================================================
function runClaudeRevisor(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'text',
      // Sem --model = padrao da CLI (Sonnet). Pra qualidade editorial.
      // Sem --allowedTools = sem ferramentas (nao precisa).
    ];

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const proc = spawn('claude', args, {
      cwd: opts.cwd || process.cwd(),
      env,
      shell: true,
      timeout: opts.timeout || REVIEWER_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`reviewer exit ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err) => reject(new Error(`spawn reviewer: ${err.message}`)));
  });
}

// ============================================================
// Prompt do reviewer — instrução clara, JSON output estruturado.
// ============================================================
function montarPromptReviewer(markdown, contexto = {}) {
  const { squad = 'desconhecida', pedido = '' } = contexto;

  return `Você é Reviewer Pinguim — revisor crítico de entregáveis. Seu trabalho é ler o entregável produzido pela squad **${squad}** e devolver uma versão polida, mantendo a estrutura mas corrigindo:

**Seu foco (em ordem de prioridade):**
1. **Erros de português** — concordância verbal/nominal, regência, "à"/"a", "que" omitido, pontuação, plural quebrado, palavras faltando
2. **Clareza** — frases longas demais (>30 palavras) divididas, ambiguidade resolvida, ordem lógica preservada
3. **Tabelas markdown** — se há quadros/comparativos, conferir que SEMPRE têm linha separador \`|---|---|...|\`, mesmo número de pipes em todas linhas, célula vazia com \`—\` (não em branco)
4. **Sem AI-slop** — frases-genéricas, listas-de-3 oba-oba, "é importante notar que", "vale ressaltar" — cortar
5. **Voz pessoal preservada** — se Halbert escreveu em primeira pessoa direta, mantém. Se Munger escreveu Inversion, mantém. Não esterilizar.

**Você NÃO deve:**
- Mudar a estrutura do markdown (cabeçalhos ## permanecem)
- Reescrever o conteúdo do zero — só polir o que está
- Adicionar opinião própria — você é editor, não autor
- Mudar números, nomes, citações
- Remover seções inteiras

**Pedido original do usuário:** ${pedido.slice(0, 300)}

**Entregável a revisar:**

\`\`\`markdown
${markdown}
\`\`\`

**Sua resposta** deve ser EXATAMENTE neste formato (não envelope a saída em bloco de código markdown extra, retorne SÓ o JSON puro):

{
  "aprovado": true|false,
  "problemas_encontrados": ["item 1", "item 2"],
  "output_revisado": "<markdown completo revisado, em uma única string com \\n>"
}

Se nada precisa mudar, retorne aprovado=true com problemas_encontrados=[] e output_revisado igual ao original.
Se houve correções, retorne aprovado=false, lista de problemas, e o markdown completo revisado.

Responda APENAS o JSON. Sem texto antes nem depois.`;
}

// ============================================================
// Parser do output do reviewer — tolera lixo antes/depois do JSON.
// ============================================================
function parsearOutputReviewer(raw) {
  // Tenta extrair JSON (LLM as vezes envelopa em ```json ... ```)
  let json = raw.trim();
  // Remove cercas markdown se houver
  json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  // Pega primeiro { ate ultimo }
  const inicio = json.indexOf('{');
  const fim = json.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new Error('reviewer nao retornou JSON valido');
  }
  const jsonLimpo = json.slice(inicio, fim + 1);
  return JSON.parse(jsonLimpo);
}

// ============================================================
// API publica: revisar consolidado.
// Retorna { aplicado, output_final, problemas, latencia_ms, motivo }
// - aplicado: true se reviewer rodou e aplicou correcoes
// - output_final: markdown final (revisado ou original)
// - problemas: lista de problemas encontrados (vazia se aprovado)
// - motivo: 'pulado-curto' | 'pulado-erro' | 'aplicado' | 'aprovado-sem-mudancas'
// ============================================================
async function revisarConsolidado(markdown, contexto = {}) {
  const t0 = Date.now();

  // Pula se entregavel for muito curto (overhead nao compensa)
  if (!markdown || markdown.length < REVIEWER_MIN_CHARS) {
    return {
      aplicado: false,
      output_final: markdown,
      problemas: [],
      latencia_ms: 0,
      motivo: 'pulado-curto',
    };
  }

  // Trunca se muito longo (raro — protege contra timeout)
  let mdParaRevisar = markdown;
  if (markdown.length > REVIEWER_MAX_CHARS) {
    mdParaRevisar = markdown.slice(0, REVIEWER_MAX_CHARS) + '\n\n[... truncado para revisão — original maior que 60k chars]';
  }

  try {
    const prompt = montarPromptReviewer(mdParaRevisar, contexto);
    const raw = await runClaudeRevisor(prompt);
    const parsed = parsearOutputReviewer(raw);

    const latencia = Date.now() - t0;
    if (parsed.aprovado === true || !parsed.output_revisado || parsed.output_revisado === mdParaRevisar) {
      return {
        aplicado: false,
        output_final: markdown, // original
        problemas: parsed.problemas_encontrados || [],
        latencia_ms: latencia,
        motivo: 'aprovado-sem-mudancas',
      };
    }

    // Reviewer aplicou correcoes
    return {
      aplicado: true,
      output_final: parsed.output_revisado,
      problemas: parsed.problemas_encontrados || [],
      latencia_ms: latencia,
      motivo: 'aplicado',
    };
  } catch (e) {
    const latencia = Date.now() - t0;
    console.warn(`[reviewer] falhou em ${latencia}ms — entregando original sem revisao: ${e.message}`);
    return {
      aplicado: false,
      output_final: markdown,
      problemas: [],
      latencia_ms: latencia,
      motivo: 'pulado-erro',
      erro: e.message,
    };
  }
}

module.exports = {
  revisarConsolidado,
  REVIEWER_TIMEOUT_MS,
  REVIEWER_MIN_CHARS,
};
