// ============================================================
// db-externo.js — V2.14.6 Acesso read-only a Supabases de produtos
// ============================================================
// Conecta nos Supabases dos 3 produtos da Pinguim (ProAlt, Elo, Sirius)
// e em outros futuros. SOMENTE LEITURA — qualquer SQL que não comece com
// SELECT é rejeitado antes de chegar no banco.
//
// Credenciais ficam no cofre Pinguim (PROALT_SUPABASE_URL/KEY, etc).
//
// Cache de credencial RAM (5 min) — evita ler cofre a cada query.
// ============================================================

const db = require('./db');

const PROJETOS_VALIDOS = ['proalt', 'elo', 'sirius'];

const _cacheCredenciais = {
  proalt: { url: null, key: null, carregado_em_ms: 0 },
  elo:    { url: null, key: null, carregado_em_ms: 0 },
  sirius: { url: null, key: null, carregado_em_ms: 0 },
};
const CACHE_TTL_MS = 5 * 60 * 1000;

async function obterCredenciais(projeto) {
  const p = String(projeto || '').toLowerCase();
  if (!PROJETOS_VALIDOS.includes(p)) {
    throw new Error(`projeto invalido: "${projeto}". Validos: ${PROJETOS_VALIDOS.join(', ')}`);
  }
  const c = _cacheCredenciais[p];
  if (c.url && c.key && (Date.now() - c.carregado_em_ms) < CACHE_TTL_MS) return c;

  const prefixo = p.toUpperCase();
  const [url, key] = await Promise.all([
    db.lerChaveSistema(`${prefixo}_SUPABASE_URL`, 'db-externo'),
    db.lerChaveSistema(`${prefixo}_SUPABASE_KEY`, 'db-externo'),
  ]);
  if (!url || !key) {
    throw new Error(`credenciais ${prefixo} nao encontradas no cofre. Cadastrar ${prefixo}_SUPABASE_URL e ${prefixo}_SUPABASE_KEY.`);
  }
  c.url = url;
  c.key = key;
  c.carregado_em_ms = Date.now();
  return c;
}

// VALIDAÇÃO HARD: aceita só SELECT (case insensitive). Bloqueia INSERT/UPDATE/DELETE/DROP/etc.
function validarSqlSomenteLeitura(sql) {
  if (!sql || typeof sql !== 'string') throw new Error('sql vazio');
  const limpo = sql.trim().replace(/^\(+/, ''); // remove parênteses iniciais (WITH/CTE wrapper)
  const primeiraPalavra = limpo.match(/^(WITH|SELECT)\b/i);
  if (!primeiraPalavra) {
    throw new Error(`SQL bloqueado: só SELECT/WITH permitido em projeto externo. Recebido começa com "${limpo.slice(0, 30)}..."`);
  }
  // Bloqueia keywords de escrita mesmo dentro de CTE/subquery
  const proibidos = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COMMENT|VACUUM|CLUSTER|REINDEX)\b/i;
  const match = sql.match(proibidos);
  if (match) {
    throw new Error(`SQL bloqueado: keyword "${match[0]}" não permitida em projeto externo (somente leitura)`);
  }
  return true;
}

// Executa SELECT via Supabase Management RPC (precisa RPC server-side configurada).
// Como NÃO temos RPC no projeto externo, usa PostgREST endpoint genérico.
// Estratégia: PostgREST permite SELECT direto em tabela via /rest/v1/<tabela>?select=...
// Pra SQL custom (JOIN, agregação), oferece /rest/v1/rpc/<funcao> — mas precisa ser RPC pré-criada.
// FALLBACK pragmático: query simples em UMA tabela via PostgREST. Pra JOIN complexo, o agente compõe via N queries.
async function consultarTabela(projeto, tabela, { select = '*', filtros = {}, ordem = null, limite = 100 } = {}) {
  validarNomeTabela(tabela);
  const { url, key } = await obterCredenciais(projeto);
  const qs = new URLSearchParams();
  qs.set('select', select);
  for (const [campo, valor] of Object.entries(filtros)) {
    // valor formato: "eq.X", "gte.X", "ilike.*X*", etc (sintaxe PostgREST)
    qs.append(campo, String(valor));
  }
  if (ordem) qs.set('order', ordem); // ex: 'created_at.desc'
  if (limite) qs.set('limit', String(Math.min(parseInt(limite, 10), 1000)));

  const fullUrl = `${url}/rest/v1/${tabela}?${qs.toString()}`;
  const resp = await fetch(fullUrl, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`${projeto}/${tabela} retornou ${resp.status}: ${errTxt.slice(0, 200)}`);
  }
  return await resp.json();
}

function validarNomeTabela(tabela) {
  if (!tabela || typeof tabela !== 'string') throw new Error('tabela obrigatoria');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tabela)) {
    throw new Error(`nome de tabela invalido: "${tabela}"`);
  }
}

// Lista tabelas disponíveis no projeto via OpenAPI do PostgREST
async function listarTabelas(projeto) {
  const { url, key } = await obterCredenciais(projeto);
  const resp = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!resp.ok) throw new Error(`${projeto}: falha ao listar tabelas (${resp.status})`);
  const spec = await resp.json();
  const definitions = spec.definitions || {};
  return Object.keys(definitions).sort();
}

// Detalhe de uma tabela (colunas + tipos) via OpenAPI
async function descreverTabela(projeto, tabela) {
  validarNomeTabela(tabela);
  const { url, key } = await obterCredenciais(projeto);
  const resp = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!resp.ok) throw new Error(`${projeto}: falha ao descrever (${resp.status})`);
  const spec = await resp.json();
  const def = spec.definitions?.[tabela];
  if (!def) throw new Error(`tabela "${tabela}" nao encontrada em ${projeto}`);
  const colunas = Object.entries(def.properties || {}).map(([nome, info]) => ({
    nome,
    tipo: info.type || info.format || '?',
    descricao: info.description || null,
  }));
  return { tabela, colunas, total_colunas: colunas.length };
}

// Contagem de linhas em uma tabela
async function contarLinhas(projeto, tabela, filtros = {}) {
  validarNomeTabela(tabela);
  const { url, key } = await obterCredenciais(projeto);
  const qs = new URLSearchParams();
  qs.set('select', 'count');
  for (const [campo, valor] of Object.entries(filtros)) qs.append(campo, String(valor));
  const resp = await fetch(`${url}/rest/v1/${tabela}?${qs.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
  });
  if (!resp.ok) throw new Error(`${projeto}/${tabela} count falhou: ${resp.status}`);
  const contentRange = resp.headers.get('content-range') || '';
  const total = contentRange.split('/')[1];
  return parseInt(total, 10) || 0;
}

module.exports = {
  PROJETOS_VALIDOS,
  obterCredenciais,
  validarSqlSomenteLeitura,
  consultarTabela,
  listarTabelas,
  descreverTabela,
  contarLinhas,
};
