// ============================================================
// V2.9 — Router LLM
// Substitui 3 regex (ehPedidoCriativoGrande/detectarSquad/escolherSkillQuery)
// por 1 chamada Haiku via Claude CLI Max (token externo zero).
//
// Por que: regex falha binariamente quando o usuario fala diferente. LLM
// classifica intencao com nuance. Cada socio Pinguim fala diferente
// (Luiz/Micha/Pedro/Codina) — regex precisa cobrir vocabulario de todos,
// LLM nao precisa.
//
// Falha-bem: timeout/parse-erro -> fallback pras 3 regex antigas (mantidas
// em orquestrador.js como ehPedidoCriativoGrande/detectarSquad/escolherSkillQuery).
// ============================================================

const { spawn } = require('child_process');

const TIMEOUT_MS = 15_000; // Haiku responde em 1.5-2.5s normalmente; cap em 15s

// Lista de squads populadas — backend e fonte unica.
// Quando popular nova squad, atualizar SQUADS_POPULADAS no orquestrador.js
// e adicionar descricao aqui pro LLM saber como rotear.
const SQUADS_DESC = {
  'copy':           'entregaveis de texto: copy, pagina de venda, VSL, email, anuncio, headline, hook, oferta, garantia, FAQ, sales letter, carta de venda, pitch escrito',
  'advisory-board': 'dilemas estrategicos, decisoes grandes, conselhos, analises estrategicas, pareceres, "devo X ou Y", contratar/investir/cancelar/seguir, tradeoffs, perdas e ganhos, pros e contras',
  'storytelling':   'narrativa, jornada, manifesto, hook de video, abertura de aula/evento (NAO POPULADA — squad reconhecida mas sem mestres no banco)',
  'design':         'identidade visual, logo, paleta, brand, layout, mockup, wireframe (NAO POPULADA)',
  'traffic-masters':'trafego pago, criativo de anuncio, segmentacao, escala (NAO POPULADA)',
  'finops':         'analise de custo, gestao de orcamento, ROI (NAO POPULADA)',
};

function runHaiku(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'text', '--model', opts.model || 'haiku'];
    const proc = spawn('claude', args, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: '' },
      shell: true,
      // V2.6.1 — NAO passar timeout aqui. SIGKILL real abaixo.
    });

    const timeoutMs = opts.timeout || TIMEOUT_MS;
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
        reject(new Error(`router-llm KILLED apos ${(timeoutMs/1000)}s`));
        return;
      }
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`router-llm exit ${code}: ${stderr.slice(-400)}`));
    });
    proc.on('error', (err) => {
      clearTimeout(killTimer);
      reject(new Error(`spawn router-llm: ${err.message}`));
    });
  });
}

function montarPrompt(message) {
  const squadsLista = Object.entries(SQUADS_DESC)
    .map(([slug, desc]) => `  - **${slug}**: ${desc}`)
    .join('\n');

  return `Voce e o **Router** do Pinguim OS. Recebe uma mensagem e classifica em JSON estrito (sem markdown, sem cercas \`\`\`).

## Squads conhecidas
${squadsLista}

## Tipos de mensagem
- **criativo**: pedido pra ENTREGAR algo (montar/criar/escrever/analisar copy, conselho, parecer, decisao, quadro de pros e contras, plano, etc). Tambem inclui dilema implicito ("devo X ou Y?", "vale a pena Z?"). Vai rodar pipeline criativo de squad.
- **factual**: pergunta sobre o que e algo, como funciona, quem e voce, qual a diferenca de X e Y. NAO entrega nada novo, so consulta e responde. Inclui pergunta sobre produto (Elo/ProAlt/Lyra/etc).
- **saudacao**: "oi", "obrigado", "valeu", "tchau", piada curta. Resposta de 1-2 linhas.
- **admin**: comando operacional ("lista X", "atualiza Y", "verifica status"). Executa script de leitura.

## Skill query
Pra mensagens criativas, sugira UMA palavra-chave em kebab-case que casa Skill no banco. Ex: "advisory-completo", "anatomia-pagina-vendas-longa", "headline", "vsl", "monopolio", "cenarios", "leverage".

## Formato de resposta (JSON estrito, em UMA linha, sem markdown)
{"tipo":"criativo"|"factual"|"saudacao"|"admin","squad":"copy"|"advisory-board"|"storytelling"|"design"|"traffic-masters"|"finops"|null,"skill_query":"<palavra ou null>","confianca":0.0-1.0,"raciocinio":"<frase curta>"}

Regras:
- Se tipo=saudacao OU tipo=factual OU tipo=admin: squad=null e skill_query=null.
- Se tipo=criativo: squad obrigatorio (escolher a mais provavel mesmo que nao populada — validacao de "esta populada?" e feita depois).
- confianca abaixo de 0.6 = nao tem certeza. Backend pode usar fallback.
- raciocinio: 1 frase explicando a escolha.

## Mensagem do usuario
"${message.replace(/"/g, '\\"')}"

Responda APENAS o JSON.`;
}

// Extrai JSON da resposta do Haiku (que pode vir com texto extra).
function parsearResposta(raw) {
  // Tenta achar JSON em qualquer lugar do output
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    // Normalizacoes leves
    if (typeof parsed.tipo !== 'string') return null;
    if (parsed.squad === '' || parsed.squad === undefined) parsed.squad = null;
    if (parsed.skill_query === '' || parsed.skill_query === undefined) parsed.skill_query = null;
    if (typeof parsed.confianca !== 'number') parsed.confianca = 0.5;
    return parsed;
  } catch (e) {
    return null;
  }
}

// ============================================================
// classificarMensagem — funcao publica do router LLM.
// Retorna { tipo, squad, skill_query, confianca, raciocinio, fonte: 'llm' | 'fallback' }
// Se LLM falhar (timeout/parse), retorna null — chamador usa regex fallback.
// ============================================================
async function classificarMensagem(message) {
  const t0 = Date.now();
  try {
    const prompt = montarPrompt(message);
    const raw = await runHaiku(prompt);
    const parsed = parsearResposta(raw);
    if (!parsed) {
      console.warn(`[router-llm] parse falhou em ${Date.now() - t0}ms, raw="${raw.slice(0, 200)}"`);
      return null;
    }
    return { ...parsed, fonte: 'llm', latencia_ms: Date.now() - t0 };
  } catch (e) {
    console.warn(`[router-llm] crashou: ${e.message}`);
    return null;
  }
}

module.exports = {
  classificarMensagem,
  SQUADS_DESC,
};
