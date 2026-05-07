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

// Helper SQL — reusa credenciais do .env.local
async function rodarSQL(sql) {
  const projectRef = ENV_LOCAL.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_REF;
  const accessToken = ENV_LOCAL.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
  if (!projectRef || !accessToken) {
    throw new Error('SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN nao definidos em .env.local');
  }
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
  return r.json();
}

async function carregarSystemPromptMestre(slug) {
  if (_cacheSystemPrompt.has(slug)) {
    return _cacheSystemPrompt.get(slug);
  }

  const data = await rodarSQL(`SELECT system_prompt FROM pinguim.agentes WHERE slug = '${slug}';`);
  if (!Array.isArray(data) || !data[0]?.system_prompt) {
    throw new Error(`mestre ${slug} sem system_prompt no banco`);
  }

  _cacheSystemPrompt.set(slug, data[0].system_prompt);
  return data[0].system_prompt;
}

// ============================================================
// V2.5 — MESTRES DINAMICOS
// Le clones recomendados da Skill, valida no banco, distribui blocos
// por afinidade. Fallback hardcoded preservado pra todo edge case.
// ============================================================

// Normaliza texto pra slug kebab-case sem acento.
// Ex: "Identificação da Dor / Problema" -> "identificacao-da-dor-problema"
function normalizarSlugBloco(texto) {
  if (!texto) return '';
  return texto
    .toString()
    .normalize('NFD')                       // separa acento
    .replace(/[̀-ͯ]/g, '')        // remove acento
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, '')          // mantem letra/numero/espaco/barra/hifen
    .replace(/[\s/]+/g, '-')                // espaco/barra -> hifen
    .replace(/-+/g, '-')                    // colapsa hifens
    .replace(/^-|-$/g, '');                 // tira hifen das pontas
}

// Mapa de afinidade — qual mestre cobre qual TIPO de bloco.
// Inclusivo (mestre pode aparecer em N blocos), ordem importa pro desempate.
// Slugs sao kebab-case e batem com saida de normalizarSlugBloco().
const AFINIDADE_MESTRE_POR_BLOCO = {
  // Aberturas + fechamentos pessoais — voz humana
  'above-the-fold':                ['gary-halbert', 'john-carlton'],
  'headline':                      ['gary-halbert', 'john-carlton'],
  'sub-headline':                  ['gary-halbert', 'john-carlton'],
  'opening':                       ['gary-halbert', 'john-carlton'],
  'cta-repetido':                  ['gary-halbert', 'john-carlton'],
  'ps':                            ['gary-halbert', 'john-carlton'],

  // Dor + jornada do leitor
  'identificacao-da-dor-problema': ['gary-halbert', 'eugene-schwartz'],
  'identificacao-da-dor':          ['gary-halbert', 'eugene-schwartz'],
  'identificacao-dor':             ['gary-halbert', 'eugene-schwartz'],
  'apresentacao-do-criador':       ['gary-halbert', 'john-carlton'],

  // Mecanismo + consciencia + produto
  'apresentacao-do-mecanismo-unico': ['eugene-schwartz', 'todd-brown', 'stefan-georgi'],
  'mecanismo-unico':                 ['eugene-schwartz', 'todd-brown', 'stefan-georgi'],
  'por-que-outras-solucoes-falharam': ['eugene-schwartz', 'gary-bencivenga'],
  'por-que-outras-falham':            ['eugene-schwartz', 'gary-bencivenga'],
  'apresentacao-do-produto-metodo':   ['eugene-schwartz', 'russell-brunson'],
  'apresentacao-do-produto':          ['eugene-schwartz', 'russell-brunson'],
  'promessa-expandida':               ['eugene-schwartz', 'gary-halbert'],
  'para-quem-e-pra-quem-nao-e':       ['eugene-schwartz', 'dan-kennedy'],

  // Persuasao + prova + bullets
  'bullets-de-fascinacao':         ['gary-bencivenga'],
  'bullets-fascinacao':            ['gary-bencivenga'],
  'prova-social':                  ['gary-bencivenga'],
  'prova-social-pesada':           ['gary-bencivenga'],
  'faq-vendedora':                 ['alex-hormozi', 'gary-bencivenga'],

  // Oferta + valor + urgencia
  'stack-de-bonus':                ['alex-hormozi', 'dan-kennedy'],
  'stack-bonus':                   ['alex-hormozi', 'dan-kennedy'],
  'oferta':                        ['alex-hormozi', 'dan-kennedy'],
  'oferta-principal':              ['alex-hormozi', 'dan-kennedy'],
  'garantia':                      ['alex-hormozi', 'dan-kennedy'],
  'risk-reversal':                 ['dan-kennedy', 'alex-hormozi'],

  // VSL + roteiro
  'vsl':                           ['jon-benson', 'russell-brunson'],
  'roteiro-video':                 ['jon-benson', 'russell-brunson'],
  'video-de-vendas':               ['jon-benson', 'russell-brunson'],
};

// Foco padrao do mestre quando nao ha bloco-especifico no mapa.
const FOCO_PADRAO_POR_MESTRE = {
  'gary-halbert':       'opening pessoal, voz primeira pessoa, especificidade brutal, P.S. matador',
  'eugene-schwartz':    'calibrar nivel de consciencia da persona, mecanismo unico nomeavel',
  'gary-bencivenga':    'persuasao com prova, bullets que prendem sem entregar solucao',
  'alex-hormozi':       'Value Equation, Grand Slam Offer, especificidade numerica',
  'dan-kennedy':        'Godfather Offer, urgencia genuina, risk reversal pesado',
  'john-carlton':       'voz rocker, anti-corporativo, narrativa de underdog',
  'russell-brunson':    'Hook Story Offer, palco, apresentacao em camadas',
  'jon-benson':         'estrutura de VSL classica, call-out + agitacao + solucao',
  'stefan-georgi':      'metodo RMBC — Research Mechanism Belief Close',
  'todd-brown':         'metodo E5 — Big Idea + Promise + Mechanism + Proof + Plan',
};

// Lista hardcoded de fallback — usada quando nao da pra ler clones da Skill.
// Mesma distribuicao que rodava antes da V2.5 (validada em prod).
const MESTRES_FALLBACK_HARDCODED = [
  {
    mestre: 'gary-halbert',
    blocos: ['ABOVE-THE-FOLD (headline + sub-headline + CTA)', 'IDENTIFICACAO-DOR (quadro vivido da persona)', 'P.S. (recap + ultimo gatilho)'],
    foco: FOCO_PADRAO_POR_MESTRE['gary-halbert'],
  },
  {
    mestre: 'eugene-schwartz',
    blocos: ['POR-QUE-OUTRAS-SOLUCOES-FALHAM', 'MECANISMO-UNICO (apresentacao do metodo)', 'APRESENTACAO-PRODUTO'],
    foco: FOCO_PADRAO_POR_MESTRE['eugene-schwartz'],
  },
  {
    mestre: 'gary-bencivenga',
    blocos: ['BULLETS-DE-FASCINACAO (10-15 bullets)', 'PROVA-SOCIAL (3 tipos: depoimento, numero, autoridade)'],
    foco: FOCO_PADRAO_POR_MESTRE['gary-bencivenga'],
  },
  {
    mestre: 'alex-hormozi',
    blocos: ['STACK-DE-BONUS (5 bonus, total declarado 4-5x preco)', 'OFERTA (preco + parcelamento)', 'GARANTIA (tripla)', 'FAQ-VENDEDORA (5-6 perguntas)'],
    foco: FOCO_PADRAO_POR_MESTRE['alex-hormozi'],
  },
];

// Acha a Skill principal pelo conteudo bruto que `buscar-skill.sh` retornou.
// Formato esperado: '## <slug>\n**Nome:** ...\n**Familia:** X | **Formato:** Y | **Score:** N\n...'.
// Pega a primeira ocorrencia (que ja vem ordenada por score DESC).
function extrairSkillPrincipal(conteudoSkill) {
  if (!conteudoSkill || typeof conteudoSkill !== 'string') return null;
  const slugMatch = conteudoSkill.match(/^##\s+([a-z0-9-]+)/m);
  if (!slugMatch) return null;
  const scoreMatch = conteudoSkill.match(/\*\*Score:\*\*\s*(\d+)/);
  const familiaMatch = conteudoSkill.match(/\*\*Familia:\*\*\s*([^\s|]+)/);
  return {
    slug: slugMatch[1],
    score: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
    familia: familiaMatch ? familiaMatch[1] : null,
  };
}

// Le clones recomendados da Skill no banco.
// Schema atual de pinguim.skills tem coluna dedicada `clones text[]`.
// Se um dia a coluna virar JSON (spec agentskills.io tem clones em
// metadata.pinguim.clones), trocar a query aqui.
async function carregarClonesDaSkill(skillSlug) {
  try {
    const data = await rodarSQL(
      `SELECT clones FROM pinguim.skills WHERE slug = '${skillSlug}' LIMIT 1;`
    );
    if (!Array.isArray(data) || !data[0]) return [];
    const lista = data[0].clones;
    if (!Array.isArray(lista)) return [];
    return lista.filter(s => typeof s === 'string' && s.trim().length > 0);
  } catch (e) {
    return [];
  }
}

// Le conteudo_md da Skill e extrai blocos da secao `## Receita`.
// Aceita 2 formatos (sao os que existem nas 46 skills atuais):
//   (A) lista numerada bold: `1. **Nome do bloco** — descricao`
//   (B) sub-headers numerados: `### 1. Nome do bloco (descricao)`
// Quando ambos coexistem na mesma Receita, formato A vence (mais especifico).
async function carregarBlocosDaSkill(skillSlug) {
  try {
    const data = await rodarSQL(
      `SELECT conteudo_md FROM pinguim.skills WHERE slug = '${skillSlug}' LIMIT 1;`
    );
    const md = data?.[0]?.conteudo_md;
    if (!md) return [];

    // Pega trecho entre `## Receita` (ou variantes) e proximo `## ` no mesmo nivel
    const receitaMatch = md.match(/##\s+Receita[\s\S]*?(?=\n##\s[^#]|$)/i);
    if (!receitaMatch) return [];
    const receita = receitaMatch[0];

    const blocos = [];

    // Formato A: `\d+. **Nome**` — descricao depois de `—` ou `-` opcional
    const reA = /^\s*\d+\.\s*\*\*([^*]+)\*\*\s*[—\-:]?\s*(.*)$/gm;
    let m;
    while ((m = reA.exec(receita)) !== null) {
      const nome = m[1].trim();
      const desc = (m[2] || '').trim();
      blocos.push({
        nomeOriginal: nome,
        slug: normalizarSlugBloco(nome),
        descricao: desc,
      });
    }

    // Formato B: `### \d+. Nome (descricao)` — usado quando a Skill subdivide
    // a Receita em sub-headers numerados (ex: above-the-fold, faq-vendedora).
    // So usa se formato A nao deu nada.
    if (blocos.length === 0) {
      const reB = /^###\s+\d+\.\s+([^\n(]+?)(?:\s*\(([^)]+)\))?\s*$/gm;
      while ((m = reB.exec(receita)) !== null) {
        const nome = m[1].trim();
        const desc = (m[2] || '').trim();
        blocos.push({
          nomeOriginal: nome,
          slug: normalizarSlugBloco(nome),
          descricao: desc,
        });
      }
    }

    return blocos;
  } catch (e) {
    return [];
  }
}

// Filtra clones contra a tabela pinguim.agentes — so devolve os que existem
// e tem system_prompt populado (mestre operacional).
async function validarMestresPopulados(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const lista = slugs.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
  try {
    const data = await rodarSQL(
      `SELECT slug FROM pinguim.agentes WHERE slug IN (${lista}) AND system_prompt IS NOT NULL AND length(system_prompt) > 100;`
    );
    if (!Array.isArray(data)) return [];
    const validados = new Set(data.map(r => r.slug));
    // Preserva ordem original de `slugs` (importante pro desempate)
    return slugs.filter(s => validados.has(s));
  } catch (e) {
    return [];
  }
}

// Distribui blocos da Skill entre mestres validados por afinidade,
// usando algoritmo "menos carregado".
// Para cada bloco em ordem da Skill:
//   - mestres aptos = AFINIDADE[bloco] ∩ mestresValidados
//   - se vazio: aptos = mestresValidados (fallback generico)
//   - escolhe o de menor carga atual; empate = ordem do mapa de afinidade
// Retorna array no formato esperado pelo pipeline:
//   [{ mestre, blocos: [...nomesOriginais], foco }]
function distribuirBlocosPorAfinidade(blocos, mestresValidados) {
  const carga = {};
  mestresValidados.forEach(m => { carga[m] = 0; });

  const atribuicao = {};
  mestresValidados.forEach(m => { atribuicao[m] = []; });

  const blocosFallbackGenerico = [];

  for (const bloco of blocos) {
    const candidatosMapa = AFINIDADE_MESTRE_POR_BLOCO[bloco.slug] || [];
    let aptos = candidatosMapa.filter(m => mestresValidados.includes(m));
    let usouFallback = false;

    if (aptos.length === 0) {
      aptos = [...mestresValidados];
      usouFallback = true;
      blocosFallbackGenerico.push(bloco.slug);
    }

    if (aptos.length === 0) continue;

    // Escolhe o menos carregado; desempate = ordem original em `aptos`
    let escolhido = aptos[0];
    let menorCarga = carga[escolhido];
    for (const m of aptos) {
      if (carga[m] < menorCarga) {
        escolhido = m;
        menorCarga = carga[m];
      }
    }
    carga[escolhido]++;

    const linha = bloco.descricao
      ? `${bloco.nomeOriginal} — ${bloco.descricao}`
      : bloco.nomeOriginal;
    atribuicao[escolhido].push(linha + (usouFallback ? ' [bloco generico]' : ''));
  }

  // Formata pra pipeline. So inclui mestre que recebeu pelo menos 1 bloco.
  const distribuicao = mestresValidados
    .filter(m => atribuicao[m].length > 0)
    .map(m => ({
      mestre: m,
      blocos: atribuicao[m],
      foco: FOCO_PADRAO_POR_MESTRE[m] || 'aplique seu metodo nos blocos atribuidos',
    }));

  return { distribuicao, blocosFallbackGenerico };
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

  // Skill: keyword da mensagem.
  // Uso termos simples (1 palavra) que casam ILIKE no slug/familia das skills.
  // Ex: "p[aá]gina de venda" virava "%pagina de venda%" — nao casa "anatomia-pagina-vendas".
  // Quebro em palavras-chave isoladas, prefiro a mais especifica.
  function escolherSkillQuery(msg) {
    const m = msg.toLowerCase();
    if (/\bvsl\b|video.{0,8}venda/.test(m)) return 'vsl';
    if (/\bheadline\b/.test(m)) return 'headline';
    if (/\boferta\b|stack|garantia|grand slam/.test(m)) return 'oferta';
    if (/p[aá]gina|salesletter|carta de venda|pagina-vendas/i.test(m)) return 'pagina';
    if (/email|e-mail|sequ[eê]ncia/i.test(m)) return 'email';
    if (/an[uú]ncio|criativo/i.test(m)) return 'anuncio';
    if (/hook|gancho/i.test(m)) return 'hook';
    return 'copy';
  }
  const skillQuery = escolherSkillQuery(message);
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
  // Etapa 2 — V2.5: decidir mestres dinamicamente a partir da Skill
  // ============================================================
  // Le clones recomendados da Skill principal (primeira do `buscar-skill.sh`,
  // que ja vem ordenada por score DESC), valida no banco, distribui blocos
  // por afinidade. Fallback hardcoded preservado em todo edge case.
  const fonteSkill = fontes.find(f => f.tipo === 'skill' && f.ok);
  const skillPrincipal = fonteSkill ? extrairSkillPrincipal(fonteSkill.conteudo) : null;

  let mestresPorBloco;
  let fonteDecisao = 'fallback'; // 'skill' | 'fallback'
  let skillUsada = null;
  let mestresValidados = [];
  let mestresIgnorados = [];
  let blocosFallbackGenerico = [];
  let blocosTotal = 0;

  if (skillPrincipal) {
    log(`Skill escolhida: ${skillPrincipal.slug} (score ${skillPrincipal.score ?? '?'}, familia ${skillPrincipal.familia ?? '?'})`);
    skillUsada = skillPrincipal;

    const clones = await carregarClonesDaSkill(skillPrincipal.slug);
    if (clones.length > 0) {
      log(`Skill recomenda ${clones.length} clones: [${clones.join(', ')}]`);
      mestresValidados = await validarMestresPopulados(clones);
      mestresIgnorados = clones.filter(c => !mestresValidados.includes(c));

      if (mestresValidados.length > 0) {
        log(`${mestresValidados.length} mestres populados em pinguim.agentes: [${mestresValidados.join(', ')}]${mestresIgnorados.length ? ` (gap: ${mestresIgnorados.join(', ')})` : ''}`);

        const blocos = await carregarBlocosDaSkill(skillPrincipal.slug);
        blocosTotal = blocos.length;

        if (blocos.length > 0) {
          log(`Skill tem ${blocos.length} blocos. Distribuindo por afinidade...`);
          const r = distribuirBlocosPorAfinidade(blocos, mestresValidados);
          mestresPorBloco = r.distribuicao;
          blocosFallbackGenerico = r.blocosFallbackGenerico;
          if (mestresPorBloco.length > 0) {
            const resumo = mestresPorBloco.map(m => `${m.mestre.split('-')[0]}(${m.blocos.length})`).join(', ');
            log(`distribuicao: ${resumo}`);
            if (blocosFallbackGenerico.length > 0) {
              log(`${blocosFallbackGenerico.length} bloco(s) sem afinidade no mapa, atribuidos por menor carga: [${blocosFallbackGenerico.join(', ')}]`);
            }
            fonteDecisao = 'skill';
          } else {
            log(`distribuicao vazia (nenhum mestre recebeu bloco) — caindo pro fallback hardcoded`);
          }
        } else {
          log(`Skill sem blocos extraiveis do conteudo_md — caindo pro fallback hardcoded`);
        }
      } else {
        log(`nenhum dos ${clones.length} clones recomendados esta populado no banco — caindo pro fallback hardcoded`);
      }
    } else {
      log(`Skill ${skillPrincipal.slug} sem clones recomendados — caindo pro fallback hardcoded`);
    }
  } else {
    log(`nao foi possivel identificar Skill principal — caindo pro fallback hardcoded`);
  }

  if (fonteDecisao === 'fallback') {
    mestresPorBloco = MESTRES_FALLBACK_HARDCODED;
    log(`fallback ativo: 4 mestres hardcoded [${mestresPorBloco.map(m => m.mestre).join(', ')}]`);
  }

  // ============================================================
  // Etapa 3 — Disparar mestres em PARALELO (N variavel)
  // ============================================================
  log(`disparando ${mestresPorBloco.length} mestre(s) em paralelo (allSettled — 1 trava nao bloqueia outros)...`);
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
  log(`${mestresPorBloco.length} mestre(s) em paralelo terminaram em ${dur_total_mestres}s`);

  // ============================================================
  // Etapa 4 — Consolidar output
  // ============================================================
  const sucessos = resultados.filter(r => r.ok);
  const falhas = resultados.filter(r => !r.ok);

  const skillAplicada = skillUsada?.slug || 'nao-identificada';
  let consolidado = `# Copy — ${message.slice(0, 60)}

**Squad:** copy
**Skill aplicada:** ${skillAplicada}
**Decisao de mestres:** ${fonteDecisao}${fonteDecisao === 'fallback' ? ' (4 hardcoded)' : ` (${mestresValidados.length} validados, ${blocosTotal} blocos)`}
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
      mestres_total: mestresPorBloco.length,
      mestres_usados: mestresPorBloco.map(m => m.mestre),
      mestres_ignorados: mestresIgnorados, // recomendados pela Skill mas nao populados
      fonte_decisao: fonteDecisao,         // 'skill' | 'fallback'
      skill_usada: skillUsada,             // { slug, score, familia } ou null
      blocos_total: blocosTotal,
      blocos_fallback_generico: blocosFallbackGenerico,
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
