// ============================================================
// Orquestrador — gerencia delegacao Atendente -> Chief -> Mestres
// inteiramente em Node (Promise.all real, sem bash aninhado).
//
// Por que aqui e nao via bash aninhado:
// - Promise.all paraleliza de verdade, com timeout granular por mestre
// - Sem 3 niveis de spawn (cada nivel adiciona overhead + ponto de falha)
// - Logs estruturados e visiveis no terminal do Express
// - Pode matar 1 mestre travado sem matar os outros
// ============================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================
// Detector: a mensagem do usuario eh pedido criativo grande?
// Se SIM, pula caminho normal do Atendente e vai direto pro pipeline
// criativo (consultar fontes -> Chief -> mestres paralelos -> consolidar).
// ============================================================
function ehPedidoCriativoGrande(message) {
  const m = message.toLowerCase();

  // Verbos de criacao
  const verbos = /\b(monta|cria|escreve|gera|faz|desenvolve|elabora|produz|me d[aá])\b/i;
  // Objeto criativo (entregavel)
  const objetos = /\b(copy|p[aá]gina de venda|salesletter|carta de venda|vsl|email\s+(de|pra)|sequ[eê]ncia de email|an[uú]ncio|criativo|headline|hook|gancho|oferta|stack|garantia|faq|hist[oó]ria|pitch|roteiro)\b/i;

  return verbos.test(m) && objetos.test(m);
}

// ============================================================
// Detector: para qual squad delegar?
// ============================================================
function detectarSquad(message) {
  const m = message.toLowerCase();
  if (/\b(copy|p[aá]gina|vsl|email|an[uú]ncio|headline|oferta|stack|garantia|faq|salesletter|carta)\b/i.test(m)) return 'copy';
  if (/\b(hist[oó]ria|narrativa|gancho|jornada|manifesto|pitch)\b/i.test(m)) return 'storytelling';
  if (/\b(designer|logo|paleta|brand|layout|mockup|wireframe|criativo visual|identidade)\b/i.test(m)) return 'design';
  if (/\b(conselho|dilema|decis[aã]o|aposta|prop[oó]sito|estrat[eé]gia)\b/i.test(m)) return 'advisory-board';
  return 'copy'; // fallback
}

// ============================================================
// Detector: qual produto?
// ============================================================
function detectarProduto(message) {
  const m = message.toLowerCase();
  const mapa = [
    { regex: /\b(elo|programa elo|ciclo)\b/i, slug: 'elo' },
    { regex: /\b(proalt|pro\s*alt)\b/i, slug: 'proalt' },
    { regex: /\b(lo[\s-]?fi|desafio.{0,15}lo[\s-]?fi)\b/i, slug: 'desafio-de-conte-do-lo-fi' },
    { regex: /\b(lyra|lira)\b/i, slug: 'lyra' },
    { regex: /\b(taurus|tuarus)\b/i, slug: 'tuarus' },
    { regex: /\b(orion)\b/i, slug: 'orion' },
    { regex: /\b(mentoria express)\b/i, slug: 'mentoria-express' },
    { regex: /\b(low ticket|ticket baixo)\b/i, slug: 'low-ticket-digital' },
  ];
  for (const item of mapa) if (item.regex.test(m)) return item.slug;
  return null;
}

// ============================================================
// Converte path Windows (C:\Squad\...) pra POSIX (/c/Squad/...)
// pra bash do Git Bash entender. Pass-through em Linux/Mac.
// ============================================================
function toPosixPath(p) {
  if (process.platform !== 'win32') return p;
  return p
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, letra) => `/${letra.toLowerCase()}`);
}

// ============================================================
// Resolve qual bash usar — IMPORTANTE no Windows!
// WSL bash (em \WindowsApps) NAO enxerga C:\ direto, precisa /mnt/c/
// Git Bash enxerga /c/ corretamente.
// Forcar Git Bash quando em Windows.
// ============================================================
function resolverBashExe() {
  if (process.platform !== 'win32') return 'bash';

  // Caminhos comuns do Git Bash no Windows
  const candidatos = [
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
    process.env.PROGRAMFILES + '\\Git\\usr\\bin\\bash.exe',
  ];

  for (const c of candidatos) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (_) { /* ignore */ }
  }

  // Fallback: 'bash' (pode pegar WSL — vai dar erro de path, mas registra)
  console.warn('[orquestrador] AVISO: Git Bash nao encontrado, usando bash do PATH (pode ser WSL)');
  return 'bash';
}

const BASH_EXE = resolverBashExe();

// ============================================================
// Carrega .env.local UMA vez no boot e injeta como env var nos scripts.
// Resolve dois problemas de uma vez:
//  1. Scripts nao precisam de dirname/source pra carregar .env
//  2. Funciona em qualquer cwd
// ============================================================
function carregarEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) result[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return result;
}
const ENV_LOCAL = carregarEnvLocal();

// ============================================================
// Roda 1 script bash e retorna stdout. Timeout granular.
// ============================================================
function rodarScript(scriptPath, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...ENV_LOCAL };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const scriptPosix = toPosixPath(scriptPath);
    const proc = spawn(BASH_EXE, [scriptPosix, ...args], {
      cwd: opts.cwd || path.dirname(scriptPath),
      env,
      shell: false,
      timeout: opts.timeout || 60_000,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${path.basename(scriptPath)} exit ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

// ============================================================
// Roda Claude CLI direto pra escrever copy de bloco — usa system_prompt
// do mestre carregado do banco.
// Sem ferramentas (mestre so escreve, nao executa).
// ============================================================
function runMestreClaudeCLI(systemPrompt, briefing, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const args = ['-p', '--output-format', 'text'];
    const proc = spawn('claude', args, {
      cwd: opts.cwd || process.cwd(),
      env,
      shell: true,
      timeout: opts.timeout || 120_000,
    });

    const fullPrompt = `${systemPrompt}\n\n---\n\n## BRIEFING\n\n${briefing}\n\n---\n\nEscreva o bloco/copy pedida acima, aplicando seu metodo. Devolva apenas o conteudo do bloco em markdown — sem preambulo, sem explicacao do metodo.`;

    let stdout = '';
    let stderr = '';
    proc.stdin.write(fullPrompt);
    proc.stdin.end();
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`mestre exit ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

// ============================================================
// Cache em RAM dos system_prompts dos mestres.
// Carrega 1x por slug e reutiliza em todas as chamadas seguintes.
// Invalida no restart do servidor.
// ============================================================
const _cacheSystemPrompt = new Map();

async function carregarSystemPromptMestre(slug) {
  if (_cacheSystemPrompt.has(slug)) {
    return _cacheSystemPrompt.get(slug);
  }

  const projectRef = ENV_LOCAL.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_REF;
  const accessToken = ENV_LOCAL.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
  if (!projectRef || !accessToken) {
    throw new Error('SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN nao definidos em .env.local');
  }

  const sql = `SELECT system_prompt FROM pinguim.agentes WHERE slug = '${slug}';`;
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const data = await r.json();
  if (!Array.isArray(data) || !data[0]?.system_prompt) {
    throw new Error(`mestre ${slug} sem system_prompt no banco`);
  }

  _cacheSystemPrompt.set(slug, data[0].system_prompt);
  return data[0].system_prompt;
}

// ============================================================
// Pipeline criativo completo:
// 1. Consulta 5 fontes (paralelo)
// 2. Decide mestres + briefings por bloco
// 3. Dispara mestres em paralelo (Promise.all)
// 4. Consolida output
// ============================================================
async function pipelineCriativo({ message, log }) {
  const t0 = Date.now();
  const squad = detectarSquad(message);
  const produto_slug = detectarProduto(message);

  log(`pipeline criativo: squad=${squad}, produto=${produto_slug || 'nenhum'}`);

  if (squad !== 'copy') {
    return {
      ok: false,
      mensagem: `Squad ${squad} ainda nao foi implementada. Hoje so 'copy' tem mestres populados.`,
    };
  }

  // ============================================================
  // Etapa 1 — Consultar 5 fontes vivas em paralelo
  // ============================================================
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const consultas = [];

  if (produto_slug) {
    log(`consultando fontes do produto ${produto_slug}...`);
    consultas.push(
      rodarScript(path.join(scriptsDir, 'buscar-cerebro.sh'), [produto_slug, message, '5'], { timeout: 30_000 })
        .then(r => ({ tipo: 'cerebro', ok: true, conteudo: r.slice(0, 3000) }))
        .catch(e => ({ tipo: 'cerebro', ok: false, erro: e.message })),
      rodarScript(path.join(scriptsDir, 'buscar-persona.sh'), [produto_slug], { timeout: 15_000 })
        .then(r => ({ tipo: 'persona', ok: true, conteudo: r.slice(0, 2000) }))
        .catch(e => ({ tipo: 'persona', ok: false, erro: e.message })),
      rodarScript(path.join(scriptsDir, 'buscar-funil.sh'), [produto_slug], { timeout: 15_000 })
        .then(r => ({ tipo: 'funil', ok: true, conteudo: r.slice(0, 1000) }))
        .catch(e => ({ tipo: 'funil', ok: false, erro: e.message })),
    );
  }

  // Skill: keyword da mensagem
  const skillQuery = message.match(/p[aá]gina de venda|vsl|email|an[uú]ncio|hook|headline|oferta/i)?.[0] || 'copy';
  consultas.push(
    rodarScript(path.join(scriptsDir, 'buscar-skill.sh'), [skillQuery], { timeout: 15_000 })
      .then(r => ({ tipo: 'skill', ok: true, conteudo: r.slice(0, 4000) }))
      .catch(e => ({ tipo: 'skill', ok: false, erro: e.message })),
  );

  const fontes = await Promise.all(consultas);
  log(`5 fontes consultadas em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Briefing rico
  const briefingRico = `## PEDIDO ORIGINAL
${message}

## CONTEXTO DAS 5 FONTES VIVAS
${fontes.map(f => f.ok
    ? `### ${f.tipo.toUpperCase()}\n${f.conteudo}`
    : `### ${f.tipo.toUpperCase()} — GAP\n${f.erro}`).join('\n\n')}
`;

  // ============================================================
  // Etapa 2 — Decidir mestres por bloco
  // ============================================================
  // Pra V2.2.2 — distribuicao default da pagina de venda.
  // Cada mestre cobre 2-4 blocos relacionados.
  const mestresPorBloco = [
    {
      mestre: 'gary-halbert',
      blocos: ['ABOVE-THE-FOLD (headline + sub-headline + CTA)', 'IDENTIFICACAO-DOR (quadro vivido da persona)', 'P.S. (recap + ultimo gatilho)'],
      foco: 'opening pessoal e fechamento. Voz primeira pessoa, especificidade brutal.'
    },
    {
      mestre: 'eugene-schwartz',
      blocos: ['POR-QUE-OUTRAS-SOLUCOES-FALHAM', 'MECANISMO-UNICO (apresentacao do metodo)', 'APRESENTACAO-PRODUTO'],
      foco: 'calibrar nivel de consciencia da persona. Mecanismo unico nomeavel.'
    },
    {
      mestre: 'gary-bencivenga',
      blocos: ['BULLETS-DE-FASCINACAO (10-15 bullets)', 'PROVA-SOCIAL (3 tipos: depoimento, numero, autoridade)'],
      foco: 'persuasao com prova. Bullets que prendem sem entregar solucao.'
    },
    {
      mestre: 'alex-hormozi',
      blocos: ['STACK-DE-BONUS (5 bonus, total declarado 4-5x preco)', 'OFERTA (preco + parcelamento)', 'GARANTIA (tripla)', 'FAQ-VENDEDORA (5-6 perguntas)'],
      foco: 'Value Equation, Grand Slam Offer. Especificidade numerica sem inventar dado.'
    },
  ];

  // ============================================================
  // Etapa 3 — Disparar 4 mestres em PARALELO
  // ============================================================
  log(`disparando 4 mestres em paralelo (allSettled — 1 trava nao bloqueia outros)...`);
  const t_mestres_0 = Date.now();

  // Timeout duro do POOL inteiro: 120s. Se algum mestre nao responder ate la,
  // ele entra como erro e o pipeline segue com os que responderam.
  const TIMEOUT_POOL_MS = 120_000;

  function comTimeout(promise, timeoutMs, mestreSlug) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout ${(timeoutMs / 1000).toFixed(0)}s — pool inteiro`)), timeoutMs)
      ),
    ]).catch(e => ({ mestre: mestreSlug, ok: false, erro: e.message, timeout: true }));
  }

  const mestresPromises = mestresPorBloco.map(async (m, i) => {
    const t_m0 = Date.now();
    try {
      const systemPrompt = await carregarSystemPromptMestre(m.mestre);
      const briefingDoMestre = `${briefingRico}

## SEUS BLOCOS A ESCREVER
${m.blocos.map(b => `- ${b}`).join('\n')}

## SEU FOCO
${m.foco}

Devolva CADA BLOCO separado por cabeçalho \`### NOME-DO-BLOCO\`. Em markdown.`;

      const output = await runMestreClaudeCLI(systemPrompt, briefingDoMestre, { timeout: 110_000 });
      const dur = ((Date.now() - t_m0) / 1000).toFixed(1);
      log(`  mestre ${m.mestre} respondeu em ${dur}s (${output.length} chars)`);
      return { mestre: m.mestre, ok: true, output, dur_s: parseFloat(dur) };
    } catch (e) {
      const dur = ((Date.now() - t_m0) / 1000).toFixed(1);
      log(`  mestre ${m.mestre} FALHOU em ${dur}s: ${e.message}`);
      return { mestre: m.mestre, ok: false, erro: e.message, dur_s: parseFloat(dur) };
    }
  });

  // allSettled: nunca trava. Cada mestre pode falhar isoladamente.
  // Race contra timeout de pool: garante que pipeline NAO ultrapassa 75s nos mestres.
  const racedPromises = mestresPromises.map((p, i) => comTimeout(p, TIMEOUT_POOL_MS, mestresPorBloco[i].mestre));
  const settled = await Promise.allSettled(racedPromises);
  const resultados = settled.map(s => s.status === 'fulfilled' ? s.value : { mestre: 'desconhecido', ok: false, erro: String(s.reason) });
  const dur_total_mestres = ((Date.now() - t_mestres_0) / 1000).toFixed(1);
  log(`4 mestres em paralelo terminaram em ${dur_total_mestres}s`);

  // ============================================================
  // Etapa 4 — Consolidar output
  // ============================================================
  const sucessos = resultados.filter(r => r.ok);
  const falhas = resultados.filter(r => !r.ok);

  let consolidado = `# Copy — ${message.slice(0, 60)}

**Squad:** copy
**Skill aplicada:** anatomia-pagina-vendas-longa
**Mestres usados:** ${sucessos.map(r => r.mestre).join(', ')}
**Tempo total dos mestres (paralelo):** ${dur_total_mestres}s

---

`;

  for (const r of resultados) {
    consolidado += `\n\n## Blocos do ${r.mestre}\n\n`;
    if (r.ok) {
      consolidado += r.output;
    } else {
      consolidado += `_(falha: ${r.erro})_`;
    }
  }

  consolidado += `\n\n---\n\n`;
  if (falhas.length > 0) {
    consolidado += `**Atencao:** ${falhas.length} mestre(s) falharam — output incompleto.\n\n`;
  }

  // Gaps do briefing
  const gaps = fontes.filter(f => !f.ok);
  if (gaps.length > 0) {
    consolidado += `**Gaps declarados:**\n${gaps.map(g => `- ${g.tipo}: ${g.erro}`).join('\n')}\n`;
  }

  return {
    ok: sucessos.length > 0,
    conteudo: consolidado,
    metricas: {
      total_s: ((Date.now() - t0) / 1000).toFixed(1),
      mestres_paralelo_s: parseFloat(dur_total_mestres),
      mestres_sucesso: sucessos.length,
      mestres_falha: falhas.length,
      fontes_consultadas: fontes.length,
      fontes_gap: gaps.length,
    },
  };
}

module.exports = {
  ehPedidoCriativoGrande,
  detectarSquad,
  detectarProduto,
  pipelineCriativo,
};
