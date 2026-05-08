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

  // Verbos de criacao/analise/solicitacao/decisao
  const verbos = /\b(monta|monte|cria|crie|escreve|escreva|gera|gere|faz|fa[cç]a|desenvolve|elabora|produz|me d[aá]|me ajuda|analisa|analise|avalia|avalie|diagnostica|estrutura|estruture|quero|preciso|pode\s+(montar|criar|escrever|fazer)|decidir|escolher|pensar|deveria|devo|cancelar|seguir|apostar|investir|contratar)\b/i;
  // Objeto criativo (entregavel)
  // Squad copy: copy/pagina/VSL/email/anuncio/headline/hook/oferta/etc
  // Squad advisory-board: conselho/dilema/decisao/cenario/parecer/analise/quadro de perdas/pros e contras/comparativo/tradeoff
  const objetos = /\b(copy|p[aá]gina de venda|salesletter|carta de venda|vsl|email\s+(de|pra)|sequ[eê]ncia de email|an[uú]ncio|criativo|headline|hook|gancho|oferta|stack|garantia|faq|hist[oó]ria|pitch|roteiro|conselho|dilema|decis[aã]o|cen[aá]rio|parecer|an[aá]lise|an[aá]lise\s+estrat[eé]gica|veredito|estrat[eé]gia|estrat[eé]gic[ao]|aposta|quadro\s+de|perdas\s+e\s+ganhos?|pros\s+e\s+contras|comparativo|tradeoff|trade-off|investir|contratar|entre\s+(a|b|x|y)|lan[cç]amento|funcion[aá]ri|automa[cç][aã]o)\b/i;

  // Padrao "devo X ou Y" / "deveria X ou Y" — alternativa explicita = dilema implicito
  const dilemaImplicito = /\b(devo|deveria)\s+\w+.{0,40}\bou\b\s+\w+/i.test(m);

  return (verbos.test(m) && objetos.test(m)) || dilemaImplicito;
}

// ============================================================
// Detector: para qual squad delegar?
// ============================================================
function detectarSquad(message) {
  const m = message.toLowerCase();
  // Advisory PRIMEIRO — palavras de advisory sao mais especificas e nao colidem com copy
  if (/\b(conselho|dilema|decis[aã]o|aposta|prop[oó]sito|estrat[eé]gia|estrat[eé]gic[ao]|an[aá]lise\s+estrat[eé]gica|quadro\s+de|perdas\s+e\s+ganhos?|pros\s+e\s+contras|comparativo|tradeoff|trade-off|investir|contratar|cancelar|seguir|escolher entre|me\s+ajuda\s+a\s+(decidir|escolher|pensar)|deveria|devo|decidir entre)\b/i.test(m)) return 'advisory-board';
  if (/\b(copy|p[aá]gina|vsl|email|an[uú]ncio|headline|oferta|stack|garantia|faq|salesletter|carta)\b/i.test(m)) return 'copy';
  if (/\b(hist[oó]ria|narrativa|gancho|jornada|manifesto|pitch)\b/i.test(m)) return 'storytelling';
  if (/\b(designer|logo|paleta|brand|layout|mockup|wireframe|criativo visual|identidade)\b/i.test(m)) return 'design';
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

// ============================================================
// V2.5 Commit 4 — MULTI-SQUAD READY
// AFINIDADE_POR_SQUAD substitui AFINIDADE_MESTRE_POR_BLOCO global.
// Cada squad tem seu mapa proprio. Quando popular advisory-board/finops/
// storytelling/design, basta adicionar entry aqui (alem dos INSERT no banco).
// SQUADS_POPULADAS lista quais ja tem mestres prontos — exposto pro index.js.
// ============================================================

// Lista de squads com mestres populados em pinguim.agentes.
// V3 vira coluna pinguim.squads.populada (auto-detectado).
// Estado 2026-05-08:
//   - copy: 8 mestres + Copy Chief
//   - advisory-board: 4 conselheiros (Dalio/Munger/Naval/Thiel) + Board Chair
const SQUADS_POPULADAS = new Set(['copy', 'advisory-board']);

// AFINIDADE indexada por squad. Hoje so 'copy'. Cada nova squad populada
// ganha sua propria entry aqui — copy-paste do template + ajustar slugs.
const AFINIDADE_POR_SQUAD = {
  'copy': {
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
  },
  'advisory-board': {
    // Diagnostico + checklist sao do Board Chair
    'diagnostico-estrategico':              ['board-chair'],
    'diagnostico':                          ['board-chair'],
    'checklist-pre-decisao':                ['board-chair', 'charlie-munger'],
    'checklist':                            ['board-chair', 'charlie-munger'],

    // Frameworks proprios de cada conselheiro
    'cenarios-3-otimista-central-pessimista': ['ray-dalio'],
    'cenarios':                             ['ray-dalio'],
    'cenario-otimista':                     ['ray-dalio'],
    'cenario-central':                      ['ray-dalio'],
    'cenario-pessimista':                   ['ray-dalio'],
    'all-weather':                          ['ray-dalio'],
    'principios':                           ['ray-dalio'],

    'inversion-mental-model':               ['charlie-munger'],
    'inversion':                            ['charlie-munger'],
    'caminhos-de-falha':                    ['charlie-munger'],
    'mental-models':                        ['charlie-munger'],
    'incentivos':                           ['charlie-munger'],
    'circle-of-competence':                 ['charlie-munger'],

    'monopolio-vs-competicao':              ['peter-thiel'],
    'monopolio':                            ['peter-thiel'],
    'tecnologia-proprietaria':              ['peter-thiel'],
    'network-effects':                      ['peter-thiel'],
    'economia-de-escala':                   ['peter-thiel'],
    'branding':                             ['peter-thiel'],
    'last-mover-advantage':                 ['peter-thiel'],

    'leverage-sem-permissao':               ['naval-ravikant'],
    'leverage':                             ['naval-ravikant'],
    'labor-leverage':                       ['naval-ravikant'],
    'capital-leverage':                     ['naval-ravikant'],
    'permission-less-leverage':             ['naval-ravikant'],
    'codigo':                               ['naval-ravikant'],
    'midia':                                ['naval-ravikant'],
    'specific-knowledge':                   ['naval-ravikant'],

    // Sintese final: Board Chair consolida apos os 4 opinarem
    'consolidacao':                         ['board-chair'],
    'parecer-final':                        ['board-chair'],
    'veredito':                             ['board-chair'],

    // Blocos da Skill `advisory-completo` (pipeline 5 passos)
    'cenarios-ray-dalio':                   ['ray-dalio'],
    'inversion-charlie-munger':             ['charlie-munger'],
    'monopolio-vs-competicao-peter-thiel':  ['peter-thiel'],
    'leverage-naval-ravikant':              ['naval-ravikant'],
    'veredito-board-chair':                 ['board-chair'],
    'veredito-board-chair-consolidacao':    ['board-chair'],
  },
  // Quando popular outras squads:
  // 'storytelling':   { 'jornada-heroi': ['joseph-campbell'], ... },
  // 'traffic-masters':{ 'criativo-anuncio': ['pedro-sobral'], ... },  // Pedro Sobral, NAO Pedro Aredes (memoria dedicada)
  // 'finops':         { 'analise-custo-cloud': ['storment', 'quinn'], ... },
  // etc.
};

// Foco padrao do mestre quando nao ha bloco-especifico no mapa.
// Globalizado por mestre (mestre e mestre, nao muda por squad — Hormozi
// sempre vai ser Hormozi mesmo que entre numa squad finops por engano).
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
  // Squad advisory-board
  'ray-dalio':          'cenarios + probabilidades + All Weather, decisao funciona em qualquer regime',
  'charlie-munger':     'inversion (como falhar com certeza?) + mental models + incentivos',
  'peter-thiel':        'monopolio vs competicao, 10x nao 10%, Last Mover Advantage',
  'naval-ravikant':     'leverage permission-less (codigo + midia), specific knowledge, escala sem permissao',
  'board-chair':        'orquestracao do advisory: diagnostica natureza do dilema + escolhe conselheiros + consolida pareceres',
};

// Fallback hardcoded indexado por squad. Hoje so 'copy'. Usado quando Skill
// nao traz clones validos. Quando outra squad for populada, adicionar entry.
const MESTRES_FALLBACK_POR_SQUAD = {
  'copy': [
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
  ],
  'advisory-board': [
    {
      mestre: 'ray-dalio',
      blocos: ['CENARIOS (otimista/central/pessimista com probabilidades)', 'ALL-WEATHER (a decisao funciona em qualquer cenario?)'],
      foco: FOCO_PADRAO_POR_MESTRE['ray-dalio'],
    },
    {
      mestre: 'charlie-munger',
      blocos: ['INVERSION (como esta decisao falha com certeza?)', 'INCENTIVOS (quem ganha, quem perde, quem decide?)'],
      foco: FOCO_PADRAO_POR_MESTRE['charlie-munger'],
    },
    {
      mestre: 'peter-thiel',
      blocos: ['MONOPOLIO-VS-COMPETICAO (essa decisao move pra qual lado?)', 'POSICIONAMENTO (10x diferenciado ou commodity?)'],
      foco: FOCO_PADRAO_POR_MESTRE['peter-thiel'],
    },
    {
      mestre: 'naval-ravikant',
      blocos: ['LEVERAGE (essa decisao adiciona codigo/midia/capital ou trabalho linear?)', 'SPECIFIC-KNOWLEDGE (reforca o que so voces fazem?)'],
      foco: FOCO_PADRAO_POR_MESTRE['naval-ravikant'],
    },
  ],
};

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
// V2.5 Commit 4: filtra tambem por squad — Hormozi (squad copy) nao vaza
// pra pipeline de finops/storytelling/etc.
async function validarMestresPopulados(slugs, squadSlug) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const lista = slugs.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
  // SQL com JOIN: so aceita mestre cuja squad bate com a do pipeline.
  // Se squadSlug nao vier, mantem comportamento antigo (sem filtro de squad).
  const joinSquad = squadSlug
    ? `JOIN pinguim.squads s ON s.id = a.squad_id WHERE s.slug = '${squadSlug.replace(/'/g, "''")}' AND a.slug IN (${lista})`
    : `WHERE a.slug IN (${lista})`;
  try {
    const data = await rodarSQL(
      `SELECT a.slug FROM pinguim.agentes a ${joinSquad} AND a.system_prompt IS NOT NULL AND length(a.system_prompt) > 100;`
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
// V2.5 Commit 4: aceita squadSlug — le AFINIDADE_POR_SQUAD[squad].
// Squad sem mapa de afinidade cai pra fallback generico em todos os blocos.
function distribuirBlocosPorAfinidade(blocos, mestresValidados, squadSlug = 'copy') {
  const mapaAfinidade = AFINIDADE_POR_SQUAD[squadSlug] || {};

  const carga = {};
  mestresValidados.forEach(m => { carga[m] = 0; });

  const atribuicao = {};
  mestresValidados.forEach(m => { atribuicao[m] = []; });

  const blocosFallbackGenerico = [];

  for (const bloco of blocos) {
    const candidatosMapa = mapaAfinidade[bloco.slug] || [];
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
// ============================================================
// V2.5 Commit 3 — REFATOR
// pipelineCriativo virou wrapper de planejarPipeline + executarMestres.
// Os 2 podem ser chamados isoladamente — frontend usa /api/pipeline-plan
// (so plano) seguido de /api/chat com plan_id (so execucao).
// Cache de plano em memoria do Express evita consultar 5 fontes 2x.
// ============================================================

// Helper: regex unica que decide query de skill da mensagem do usuario.
// Ordem importa — palavras mais especificas devem aparecer antes.
function escolherSkillQuery(msg) {
  const m = msg.toLowerCase();
  // === Advisory-board ===
  // Pedidos genericos -> advisory-completo (4 conselheiros + Board Chair)
  if (/\b(conselho|dilema|decis[aã]o|estrat[eé]gia|aposta|prop[oó]sito|quadro\s+de|perdas\s+e\s+ganhos?|pros\s+e\s+contras|comparativo|tradeoff|trade-off|investir|contratar)\b/i.test(m)) return 'advisory-completo';
  // Pedidos especificos por framework -> Skill do conselheiro especifico
  if (/\bmonop[oó]lio\b|competi[cç][aã]o|concorrente|diferencia|10x/i.test(m)) return 'monopolio';
  if (/\binvers[aã]o\b|inversion|como\s+falh|caminho\s+de\s+falha/i.test(m)) return 'inversion';
  if (/\bcen[aá]rio\b|otimista|pessimista|all weather|probabilidade/i.test(m)) return 'cenarios';
  if (/\balavancagem\b|leverage|escalar sem|specific knowledge/i.test(m)) return 'leverage';

  // === Copy ===
  if (/\bvsl\b|video.{0,8}venda/.test(m)) return 'vsl';
  if (/\bheadline\b/.test(m)) return 'headline';
  if (/\boferta\b|stack|garantia|grand slam/.test(m)) return 'oferta';
  if (/p[aá]gina|salesletter|carta de venda|pagina-vendas/i.test(m)) return 'pagina';
  if (/email|e-mail|sequ[eê]ncia/i.test(m)) return 'email';
  if (/an[uú]ncio|criativo/i.test(m)) return 'anuncio';
  if (/hook|gancho/i.test(m)) return 'hook';
  return 'copy';
}

// ============================================================
// V2.10.1 — Skills auxiliares (cross-cutting)
// Skill principal decide CLONES + BLOCOS. Skills aux decidem FORMATAÇÃO
// ou ANATOMIA específica que cada mestre aplica no seu briefing.
// Não substitui a principal — complementa. Pipeline pode ter 0..N aux.
// Detecção por regex (igual escolherSkillQuery). Vira dívida V3 pra LLM.
// Memoria: project_skills_principal_e_auxiliares.md
// ============================================================
function escolherSkillsAuxiliares(message) {
  const m = message.toLowerCase();
  const aux = [];

  // Quadro de decisão (perdas/ganhos, comparativo, tradeoff, scorecard)
  // Usado em advisory-board, finops, qualquer pipeline que entregue framework
  // de decisão multi-dimensão. Mestre aprende a escrever tabela markdown válida.
  if (/\bquadro\b|perdas\s+e\s+ganhos?|pros\s+e\s+contras|comparativo|tradeoff|trade-off|scorecard|matriz\s+de\s+(an[aá]lise|decis[aã]o|avalia[cç][aã]o)/i.test(m)) {
    aux.push('escrever-quadro-decisao');
  }

  // Limite de proteção: max 3 skills aux por pipeline (evita briefing inflado)
  return aux.slice(0, 3);
}

// ============================================================
// planejarPipeline — Etapas 1+2: consulta 5 fontes + decide mestres.
// NAO dispara mestres. Devolve plano completo pra ser executado em separado.
// V2.5 Commit 4: aceita squad opcional. Se nao vier, detecta da mensagem.
// Squad nao populada -> retorna ok:false com mensagem honesta (sem CLI).
// ============================================================
async function planejarPipeline({ message, log, squad: squadOverride }) {
  const t0 = Date.now();
  const squad = squadOverride || detectarSquad(message);
  const produto_slug = detectarProduto(message);

  log(`pipeline criativo: squad=${squad}, produto=${produto_slug || 'nenhum'}`);

  if (!SQUADS_POPULADAS.has(squad)) {
    const populadasLista = [...SQUADS_POPULADAS].join(', ');
    return {
      ok: false,
      mensagem: `Squad **${squad}** ainda não populada — hoje só ${populadasLista} tem mestres prontos pra entregar trabalho. Roadmap em fila pra popular essa squad no banco.`,
      squad,
      produto_slug,
      squad_disponivel: false,
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

  const skillQuery = escolherSkillQuery(message);
  consultas.push(
    rodarScript(path.join(scriptsDir, 'buscar-skill.sh'), [skillQuery], { timeout: 15_000 })
      .then(r => ({ tipo: 'skill', ok: true, conteudo: r.slice(0, 4000) }))
      .catch(e => ({ tipo: 'skill', ok: false, erro: e.message })),
  );

  // V2.10.1 — Skills auxiliares (paralelo com fontes vivas + skill principal)
  const skillsAuxSlugs = escolherSkillsAuxiliares(message);
  if (skillsAuxSlugs.length > 0) {
    log(`skills auxiliares detectadas: [${skillsAuxSlugs.join(', ')}]`);
    for (const slugAux of skillsAuxSlugs) {
      consultas.push(
        rodarScript(path.join(scriptsDir, 'buscar-skill.sh'), [slugAux], { timeout: 15_000 })
          .then(r => ({ tipo: 'skill_aux', slug: slugAux, ok: true, conteudo: r.slice(0, 2500) }))
          .catch(e => ({ tipo: 'skill_aux', slug: slugAux, ok: false, erro: e.message })),
      );
    }
  }

  const fontesEAux = await Promise.all(consultas);
  // V2.10.1 — separa skills auxiliares das 5 fontes vivas. Conceitualmente
  // distintas: fonte viva = retrieval (cerebro/persona/funil/skill principal/clone).
  // Skill aux = receita de formatacao injetada como instrucao no briefing.
  const fontes = fontesEAux.filter(f => f.tipo !== 'skill_aux');
  const skillsAux = fontesEAux.filter(f => f.tipo === 'skill_aux');
  log(`${fontes.length} fontes vivas + ${skillsAux.length} skill(s) aux consultadas em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Briefing rico (montado uma vez, reusado pelos N mestres)
  // V2.10.1 — secao opcional de INSTRUCOES ADICIONAIS quando ha skills aux
  // (formatacao cruzada: tabela markdown, anatomia especifica, etc).
  const skillsAuxOk = skillsAux.filter(s => s.ok);
  const skillsAuxBlock = skillsAuxOk.length > 0
    ? `\n## INSTRUÇÕES ADICIONAIS DE FORMATAÇÃO\n\n` +
      `Aplicar as receitas abaixo na sua resposta. São complementares à Skill principal — ` +
      `ela define O QUE escrever, estas definem COMO formatar.\n\n` +
      skillsAuxOk.map(s => `### ${s.slug}\n${s.conteudo}`).join('\n\n')
    : '';

  const briefingRico = `## PEDIDO ORIGINAL
${message}

## CONTEXTO DAS 5 FONTES VIVAS
${fontes.map(f => f.ok
    ? `### ${f.tipo.toUpperCase()}\n${f.conteudo}`
    : `### ${f.tipo.toUpperCase()} — GAP\n${f.erro}`).join('\n\n')}
${skillsAuxBlock}
`;

  // ============================================================
  // Etapa 2 — Decidir mestres dinamicamente (V2.5)
  // ============================================================
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
      mestresValidados = await validarMestresPopulados(clones, squad);
      mestresIgnorados = clones.filter(c => !mestresValidados.includes(c));

      if (mestresValidados.length > 0) {
        log(`${mestresValidados.length} mestres populados em pinguim.agentes (squad=${squad}): [${mestresValidados.join(', ')}]${mestresIgnorados.length ? ` (gap: ${mestresIgnorados.join(', ')})` : ''}`);

        const blocos = await carregarBlocosDaSkill(skillPrincipal.slug);
        blocosTotal = blocos.length;

        if (blocos.length > 0) {
          log(`Skill tem ${blocos.length} blocos. Distribuindo por afinidade (squad=${squad})...`);
          const r = distribuirBlocosPorAfinidade(blocos, mestresValidados, squad);
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
    mestresPorBloco = MESTRES_FALLBACK_POR_SQUAD[squad] || [];
    if (mestresPorBloco.length === 0) {
      // Squad populada mas sem fallback definido — nao deveria acontecer
      // se SQUADS_POPULADAS e MESTRES_FALLBACK_POR_SQUAD estao em sync.
      log(`ERRO: squad ${squad} populada mas sem MESTRES_FALLBACK_POR_SQUAD entry`);
      return {
        ok: false,
        mensagem: `Squad ${squad} sem fallback configurado. Atualize MESTRES_FALLBACK_POR_SQUAD em orquestrador.js.`,
        squad,
        produto_slug,
      };
    }
    log(`fallback ativo: ${mestresPorBloco.length} mestres hardcoded [${mestresPorBloco.map(m => m.mestre).join(', ')}]`);
  }

  return {
    ok: true,
    plano: {
      message,
      squad,
      produto_slug,
      fontes,
      skillsAux,           // V2.10.1 — skills auxiliares aplicadas (array de {slug, ok, conteudo|erro})
      briefingRico,
      mestresPorBloco,
      fonteDecisao,
      skillUsada,
      mestresValidados,
      mestresIgnorados,
      blocosFallbackGenerico,
      blocosTotal,
      planejado_em: Date.now(),
      duracao_planejamento_s: ((Date.now() - t0) / 1000).toFixed(1),
    },
  };
}

// ============================================================
// executarMestres — Etapas 3+4: dispara mestres em paralelo + consolida.
// Recebe plano produzido por planejarPipeline().
// ============================================================
async function executarMestres({ plano, log }) {
  const { message, squad, produto_slug, fontes, skillsAux = [], briefingRico, mestresPorBloco, fonteDecisao,
          skillUsada, mestresValidados, mestresIgnorados,
          blocosFallbackGenerico, blocosTotal } = plano;

  // ============================================================
  // Etapa 3 — Disparar mestres em PARALELO (N variavel)
  // ============================================================
  log(`disparando ${mestresPorBloco.length} mestre(s) em paralelo (allSettled — 1 trava nao bloqueia outros)...`);
  const t_mestres_0 = Date.now();

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
  // Header do entregavel reflete a SQUAD real (V2.5 multi-squad).
  // Hoje: copy -> "Copy — ..."; advisory-board -> "Parecer estrategico — ..."
  // Quando popular outras squads, adicionar entry aqui.
  const HEADERS_POR_SQUAD = {
    'copy':            { titulo: 'Copy',                emoji: '✍' },
    'advisory-board':  { titulo: 'Parecer estrategico', emoji: '🏛' },
    'storytelling':    { titulo: 'Narrativa',           emoji: '📖' },
    'design':          { titulo: 'Direcao visual',      emoji: '🎨' },
    'traffic-masters': { titulo: 'Estrategia de trafego', emoji: '📈' },
    'finops':          { titulo: 'Analise financeira',  emoji: '💰' },
  };
  const header = HEADERS_POR_SQUAD[squad] || { titulo: 'Entregavel', emoji: '📋' };
  let consolidado = `# ${header.emoji} ${header.titulo} — ${message.slice(0, 60)}

**Squad:** ${squad}
**Skill aplicada:** ${skillAplicada}
**Decisao de mestres:** ${fonteDecisao}${fonteDecisao === 'fallback' ? ' (fallback hardcoded)' : ` (${mestresValidados.length} validados, ${blocosTotal} blocos)`}
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

  const gaps = fontes.filter(f => !f.ok);
  if (gaps.length > 0) {
    consolidado += `**Gaps declarados:**\n${gaps.map(g => `- ${g.tipo}: ${g.erro}`).join('\n')}\n`;
  }

  return {
    ok: sucessos.length > 0,
    conteudo: consolidado,
    metricas: {
      total_s: ((Date.now() - plano.planejado_em) / 1000).toFixed(1),
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
      // V2.10 — propagados pro template HTML do entregavel decidir header/cor/skill por squad
      squad,
      produto_slug,
      // V2.10.1 — skills auxiliares aplicadas no briefing (formatacao cruzada)
      skills_auxiliares: skillsAux.map(s => ({
        slug: s.slug,
        ok: s.ok,
        erro: s.ok ? null : s.erro,
      })),
    },
  };
}

// ============================================================
// pipelineCriativo — wrapper que preserva contrato externo (V2.4 e antes).
// V2.5 Commit 4: aceita squad opcional. Default detecta da mensagem.
// Para chamadas que NAO passam por /api/pipeline-plan + plan_id.
// ============================================================
async function pipelineCriativo({ message, log, squad }) {
  const planResult = await planejarPipeline({ message, log, squad });
  if (!planResult.ok) {
    return {
      ok: false,
      conteudo: planResult.mensagem,
      metricas: {
        total_s: '0',
        mestres_paralelo_s: 0,
        mestres_sucesso: 0,
        mestres_falha: 0,
        mestres_total: 0,
        mestres_usados: [],
        mestres_ignorados: [],
        fonte_decisao: planResult.squad_disponivel === false ? 'squad-nao-populada' : 'erro',
        skill_usada: null,
        blocos_total: 0,
        blocos_fallback_generico: [],
        fontes_consultadas: 0,
        fontes_gap: 0,
        squad: planResult.squad,
        squad_disponivel: planResult.squad_disponivel ?? null,
      },
    };
  }
  return await executarMestres({ plano: planResult.plano, log });
}

module.exports = {
  ehPedidoCriativoGrande,
  detectarSquad,
  detectarProduto,
  pipelineCriativo,
  planejarPipeline,
  executarMestres,
  escolherSkillsAuxiliares, // V2.10.1 — exposto pra debug/teste
  SQUADS_POPULADAS, // V2.5 Commit 4 — fonte unica da verdade
};
