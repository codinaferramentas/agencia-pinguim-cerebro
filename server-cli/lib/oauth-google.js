// ============================================================
// oauth-google.js — V2.12 Fase 0
// ============================================================
// Helpers de OAuth Google (autoriza + troca code por tokens + refresh).
// Refresh tokens vivem em pinguim.cofre_chaves (com cliente_id por socio).
// ============================================================

const db = require('./db');

// V2.12 — escopos read+write desde o inicio (decisao 2026-05-08 noite, Andre).
// Razao: trocar escopo depois exige reconectar todos os socios. Melhor 1
// conexao unica que cobre tudo. Confirmacao humana obrigatoria pra cada
// operacao de WRITE acontece NO SERVER-CLI (camada de seguranca movida pra app).
//
// drive          = ler + editar + criar + deletar arquivos do socio
// calendar       = ler + criar/editar/deletar eventos do calendario do socio
// gmail.modify   = ler + responder + arquivar + marcar (V2.13 — sócios topam ler email)
//
// Decisão 2026-05-08 noite: gmail incluido no mesmo app OAuth (não app separado).
// Sócios alinhados, todos vão autorizar Gmail junto com Drive+Calendar.
const SCOPES_PADRAO = [
  'https://www.googleapis.com/auth/drive',         // ler + editar + criar arquivos
  'https://www.googleapis.com/auth/calendar',      // ler + editar eventos
  'https://www.googleapis.com/auth/gmail.modify',  // V2.13 — ler + responder + modificar email
];

// Constroi URL de autorizacao do Google.
// access_type=offline + prompt=consent garantem que vem refresh_token.
function montarUrlAutorizacao({ client_id, redirect_uri, state, scopes = SCOPES_PADRAO }) {
  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',  // CRITICO: sem isso, sem refresh_token
    prompt: 'consent',       // CRITICO: forca refresh_token mesmo se ja autorizou antes
    include_granted_scopes: 'true',
    state: state || '',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Troca code -> { access_token, refresh_token, expires_in, scope }
async function trocarCodePorTokens({ code, client_id, client_secret, redirect_uri }) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new Error(`OAuth troca code falhou: ${json.error_description || json.error || 'desconhecido'}`);
  }
  if (!json.refresh_token) {
    throw new Error('Google nao devolveu refresh_token. Conferir prompt=consent + access_type=offline.');
  }
  return json;
}

// Renova access_token usando refresh_token guardado no cofre.
// Retorna { access_token, expires_in, scope }.
async function renovarAccessToken({ refresh_token, client_id, client_secret }) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token,
      client_id,
      client_secret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new Error(`OAuth refresh falhou: ${json.error_description || json.error || 'desconhecido'}`);
  }
  return json; // { access_token, expires_in, scope, token_type }
}

// Cache em RAM dos access_tokens (curtos — TTL pelo expires_in - 60s margem)
// Reduz round-trips ao Google quando agente faz multiplas chamadas Drive/Calendar.
// V2.14.7: chave do cache agora inclui conexao_id pra suportar multi-conta
// (mesmo socio pode ter Pinguim + Pessoal — tokens diferentes).
const _cacheAccessToken = new Map(); // `${cid}:${conexao_id || 'cofre'}` -> { token, expira_em_ms }

// V2.14.7 — busca conexao_google ativa do socio:
//   - se conexao_id passado, busca por id
//   - se label passado, busca por (cliente_id, label) ativa
//   - senao, busca a is_padrao=true do socio
// Retorna { id, label, email_google, refresh_token, escopo } ou null se nao achar.
async function buscarConexaoNova({ cliente_id, conexao_id, label }) {
  const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  let where;
  if (conexao_id) {
    where = `id = ${esc(conexao_id)}::uuid AND revogado_em IS NULL`;
  } else if (label) {
    where = `cliente_id = ${esc(cliente_id)}::uuid AND label ILIKE ${esc(label)} AND revogado_em IS NULL`;
  } else {
    where = `cliente_id = ${esc(cliente_id)}::uuid AND is_padrao = true AND revogado_em IS NULL`;
  }
  const sql = `SELECT id, label, email_google, refresh_token, escopo
                 FROM pinguim.conexoes_google
                WHERE ${where}
                LIMIT 1;`;
  try {
    const r = await db.rodarSQL(sql);
    return Array.isArray(r) && r[0] ? r[0] : null;
  } catch (e) {
    // Se tabela ainda nao existe (migration nao rodou), nao explode — cai no cofre antigo
    return null;
  }
}

// V2.14.7 — assinatura ampliada: { cliente_id, conexao_id?, label? }
// Backward-compat: se nao passar conexao_id nem label, tenta conexoes_google
// padrao primeiro e cai pro cofre antigo se nao achar. Codina (ainda sem
// linha em conexoes_google) continua funcionando via cofre.GOOGLE_OAUTH_REFRESH.
async function obterAccessTokenAtivo({ cliente_id, conexao_id, label } = {}) {
  const cid = await db.resolverClienteId(cliente_id);

  // 1) Tenta achar na tabela nova (conexoes_google)
  const conexao = await buscarConexaoNova({ cliente_id: cid, conexao_id, label });

  // Monta chave de cache
  const cacheKey = `${cid}:${conexao ? conexao.id : 'cofre'}`;
  const cached = _cacheAccessToken.get(cacheKey);
  if (cached && cached.expira_em_ms > Date.now()) {
    return cached.token;
  }

  // 2) Carrega credenciais do app (sistema)
  const [client_id, client_secret] = await Promise.all([
    db.lerChaveSistema('GOOGLE_OAUTH_CLIENT_ID', 'oauth-google'),
    db.lerChaveSistema('GOOGLE_OAUTH_CLIENT_SECRET', 'oauth-google'),
  ]);
  if (!client_id || !client_secret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID ou GOOGLE_OAUTH_CLIENT_SECRET nao cadastrados no cofre.');
  }

  // 3) Pega refresh_token:
  //    - se conexao foi achada (id/label/padrao), usa ela.
  //    - se NAO achou E sócio pediu label ou id especifico, ERRO (nao caia pro cofre — usaria conta errada).
  //    - se NAO achou E nada foi pedido especifico, fallback pro cofre antigo (backward compat pra Codina).
  let refresh_token = conexao ? conexao.refresh_token : null;
  if (!refresh_token) {
    if (conexao_id) throw new Error(`Conexao Google ${conexao_id} nao encontrada ou revogada.`);
    if (label) throw new Error(`Sem conta Google com label "${label}" pra esse socio. Conecte em Mission Control > Integracoes ou peça pro socio especificar outro label.`);
    refresh_token = await db.lerChavePorCliente('GOOGLE_OAUTH_REFRESH', cid);
  }

  if (!refresh_token) {
    throw new Error('Sem conta Google conectada pra esse socio. Conecte em Mission Control > Integracoes (ou /conectar-google).');
  }

  const tokens = await renovarAccessToken({ refresh_token, client_id, client_secret });

  const expira_em_ms = Date.now() + (tokens.expires_in * 1000) - 60_000;
  _cacheAccessToken.set(cacheKey, { token: tokens.access_token, expira_em_ms });

  return tokens.access_token;
}

// Limpa cache (usado ao revogar)
function invalidarCacheAccessToken(cliente_id = null) {
  if (!cliente_id) {
    _cacheAccessToken.clear();
    return;
  }
  // Limpa todas as chaves desse cliente_id (cobre cofre + N conexoes)
  for (const k of _cacheAccessToken.keys()) {
    if (k.startsWith(`${cliente_id}:`)) _cacheAccessToken.delete(k);
  }
}

// V2.14.7 — lista contas conectadas de um socio (usado pelo agente pra desambiguar)
// Retorna [{ id, label, email_google, is_padrao }, ...] ordenado padrao primeiro.
async function listarContasDoSocio(cliente_id) {
  const cid = await db.resolverClienteId(cliente_id);
  const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const sql = `SELECT id, label, email_google, is_padrao
                 FROM pinguim.conexoes_google
                WHERE cliente_id = ${esc(cid)}::uuid
                  AND revogado_em IS NULL
                ORDER BY is_padrao DESC, criado_em ASC;`;
  try {
    const r = await db.rodarSQL(sql);
    return Array.isArray(r) ? r : [];
  } catch (e) {
    return [];
  }
}

module.exports = {
  SCOPES_PADRAO,
  montarUrlAutorizacao,
  trocarCodePorTokens,
  renovarAccessToken,
  obterAccessTokenAtivo,
  invalidarCacheAccessToken,
  listarContasDoSocio,
  buscarConexaoNova,
};
