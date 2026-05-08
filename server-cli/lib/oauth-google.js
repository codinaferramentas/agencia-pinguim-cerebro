// ============================================================
// oauth-google.js — V2.12 Fase 0
// ============================================================
// Helpers de OAuth Google (autoriza + troca code por tokens + refresh).
// Refresh tokens vivem em pinguim.cofre_chaves (com cliente_id por socio).
// ============================================================

const db = require('./db');

// Escopos solicitados na Fase 0+1 (read-only — Munger inverte: write tem
// confirmacao explicita). Gmail/sheets/calendar.events ficam pra Fases 4-5.
const SCOPES_PADRAO = [
  'https://www.googleapis.com/auth/drive.readonly',     // listar + ler arquivos
  'https://www.googleapis.com/auth/calendar.readonly',  // ler eventos
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
const _cacheAccessToken = new Map(); // cliente_id -> { token, expira_em_ms }

async function obterAccessTokenAtivo({ cliente_id = db.CLIENTE_ID_PADRAO } = {}) {
  // Cache hit
  const cached = _cacheAccessToken.get(cliente_id);
  if (cached && cached.expira_em_ms > Date.now()) {
    return cached.token;
  }

  // Le credenciais do cofre
  const [client_id, client_secret, refresh_token] = await Promise.all([
    db.lerChaveSistema('GOOGLE_OAUTH_CLIENT_ID', 'oauth-google'),
    db.lerChaveSistema('GOOGLE_OAUTH_CLIENT_SECRET', 'oauth-google'),
    db.lerChavePorCliente('GOOGLE_OAUTH_REFRESH', cliente_id),
  ]);

  if (!client_id || !client_secret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID ou GOOGLE_OAUTH_CLIENT_SECRET nao cadastrados no cofre. Cadastrar primeiro em /conectar-google ou /seguranca.');
  }
  if (!refresh_token) {
    throw new Error('Refresh token Google nao encontrado pra esse cliente. Conectar primeiro em /conectar-google.');
  }

  const tokens = await renovarAccessToken({ refresh_token, client_id, client_secret });

  // Cache com margem de 60s pra evitar usar token "quase expirado"
  const expira_em_ms = Date.now() + (tokens.expires_in * 1000) - 60_000;
  _cacheAccessToken.set(cliente_id, { token: tokens.access_token, expira_em_ms });

  return tokens.access_token;
}

// Limpa cache (usado ao revogar)
function invalidarCacheAccessToken(cliente_id = null) {
  if (cliente_id) _cacheAccessToken.delete(cliente_id);
  else _cacheAccessToken.clear();
}

module.exports = {
  SCOPES_PADRAO,
  montarUrlAutorizacao,
  trocarCodePorTokens,
  renovarAccessToken,
  obterAccessTokenAtivo,
  invalidarCacheAccessToken,
};
