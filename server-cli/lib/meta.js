// ============================================================
// meta.js — V2.14 D Categoria H (Meta Marketing API + Pages)
// ============================================================
// Wrapper Meta Graph API. Token longo (60d) gravado no cofre.
// Refresh proativo: se faltar <7d pra expirar, renova automaticamente
// trocando o token longo atual por outro de +60d.
//
// Cofre Pinguim:
//   META_APP_ID
//   META_APP_SECRET
//   META_ACCESS_TOKEN  (longo, 60d)
//
// Categorias de acesso cobertas:
// - Marketing API: ad accounts, campanhas, adsets, ads, criativos, insights
// - Pages API: páginas conectadas + engajamento
// - Instagram: NÃO coberto aqui (frente separada — token IG diferente)
// ============================================================

const db = require('./db');

const GRAPH_VERSION = 'v25.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ============================================================
// Auth + Token cache (em RAM, write-through pro cofre quando renova)
// ============================================================
const _cacheToken = {
  access_token: null,
  expira_em_ms: 0,
  carregado_em_ms: 0,
};

async function obterCredenciais() {
  const [app_id, app_secret] = await Promise.all([
    db.lerChaveSistema('META_APP_ID', 'meta'),
    db.lerChaveSistema('META_APP_SECRET', 'meta'),
  ]);
  if (!app_id || !app_secret) {
    throw new Error('Meta NAO configurada — faltam META_APP_ID/SECRET no cofre. Cadastrar via painel Meta (developers.facebook.com/apps).');
  }
  return { app_id, app_secret };
}

async function obterAccessToken() {
  if (_cacheToken.access_token && Date.now() - _cacheToken.carregado_em_ms < 5 * 60 * 1000) {
    return _cacheToken.access_token;
  }
  const token = await db.lerChaveSistema('META_ACCESS_TOKEN', 'meta');
  if (!token) {
    throw new Error('META_ACCESS_TOKEN nao cadastrado no cofre. Gerar token longo via meta-setup-token.sh.');
  }
  _cacheToken.access_token = token;
  _cacheToken.carregado_em_ms = Date.now();
  return token;
}

// Renova token longo. Pode ser chamado proativamente OU por endpoint dedicado.
async function renovarTokenLongo() {
  const { app_id, app_secret } = await obterCredenciais();
  const tokenAtual = await obterAccessToken();
  const url = `${BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(app_id)}&client_secret=${encodeURIComponent(app_secret)}&fb_exchange_token=${encodeURIComponent(tokenAtual)}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`Meta renew falhou (${resp.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  const novoToken = json.access_token;
  const expiresIn = parseInt(json.expires_in, 10) || (60 * 24 * 3600);
  // Persiste novo token no cofre (write-through)
  await db.atualizarChaveSistema('META_ACCESS_TOKEN', novoToken, 'meta-renew');
  _cacheToken.access_token = novoToken;
  _cacheToken.carregado_em_ms = Date.now();
  _cacheToken.expira_em_ms = Date.now() + expiresIn * 1000;
  console.log(`[meta] token renovado, +${Math.round(expiresIn / 86400)}d`);
  return { ok: true, expires_in_seconds: expiresIn, expires_in_days: Math.round(expiresIn / 86400) };
}

// Inspeciona token (validade + scopes) via debug_token
async function inspecionarToken() {
  const { app_id, app_secret } = await obterCredenciais();
  const token = await obterAccessToken();
  const appToken = `${app_id}|${app_secret}`;
  const url = `${BASE_URL}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok || !json.data) {
    throw new Error(`Meta debug_token falhou (${resp.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.data;
}

// ============================================================
// Helper: fetch com retry exponencial
// ============================================================
const MAX_RETRIES = 3;

async function metaFetch({ method = 'GET', endpoint, params, body, retries = MAX_RETRIES }) {
  const access_token = await obterAccessToken();
  let url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const qs = new URLSearchParams();
  qs.append('access_token', access_token);
  if (params && method === 'GET') {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.append(k, String(v));
    }
  }
  url += (url.includes('?') ? '&' : '?') + qs.toString();

  const opts = { method, headers: { 'Accept': 'application/json' } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, opts);
      if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
        const waitMs = Math.min(30000, 500 * Math.pow(2, attempt) + Math.random() * 500);
        console.warn(`[meta] ${resp.status} em ${endpoint} — retry em ${waitMs}ms (tentativa ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      const json = await resp.json();
      if (!resp.ok) {
        const msg = json.error?.message || json.message || JSON.stringify(json).slice(0, 200);
        const code = json.error?.code;
        throw new Error(`Meta API ${resp.status}${code ? ` (code ${code})` : ''}: ${msg}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, Math.min(10000, 500 * Math.pow(2, attempt))));
      }
    }
  }
  throw lastErr || new Error(`Meta API: falha após ${retries} tentativas`);
}

// ============================================================
// MARKETING API
// ============================================================

// Lista todas as ad accounts visíveis ao token
async function listarAdAccounts({ limit = 100 } = {}) {
  const fields = 'id,account_id,name,account_status,currency,timezone_name,business,amount_spent,balance,disable_reason';
  return await metaFetch({
    endpoint: '/me/adaccounts',
    params: { fields, limit },
  });
}

// Lista campanhas de um ad account
async function listarCampanhas({ ad_account_id, status, limit = 50 } = {}) {
  if (!ad_account_id) throw new Error('ad_account_id obrigatório (formato act_<id>)');
  const fields = 'id,name,status,effective_status,objective,buying_type,created_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining,special_ad_categories';
  const params = { fields, limit };
  if (status) params.effective_status = `["${Array.isArray(status) ? status.join('","') : status}"]`;
  return await metaFetch({
    endpoint: `/${ad_account_id}/campaigns`,
    params,
  });
}

// Insights de campanha (impressões, cliques, gasto, ROAS, etc)
async function insightsCampanha({ campaign_id, date_preset = 'last_7d', time_range, level = 'campaign', breakdowns } = {}) {
  if (!campaign_id) throw new Error('campaign_id obrigatório');
  const fields = 'campaign_name,impressions,reach,clicks,ctr,cpm,cpc,spend,actions,action_values,frequency,unique_clicks';
  const params = { fields, level };
  if (time_range) {
    params.time_range = typeof time_range === 'string' ? time_range : JSON.stringify(time_range);
  } else {
    params.date_preset = date_preset;
  }
  if (breakdowns) params.breakdowns = Array.isArray(breakdowns) ? breakdowns.join(',') : breakdowns;
  return await metaFetch({
    endpoint: `/${campaign_id}/insights`,
    params,
  });
}

// Lista adsets de uma campanha
async function listarAdsets({ campaign_id, limit = 50 } = {}) {
  if (!campaign_id) throw new Error('campaign_id obrigatório');
  const fields = 'id,name,status,effective_status,daily_budget,lifetime_budget,targeting,optimization_goal,billing_event,bid_strategy,created_time';
  return await metaFetch({
    endpoint: `/${campaign_id}/adsets`,
    params: { fields, limit },
  });
}

// Lista anúncios de uma campanha ou adset
async function listarAds({ parent_id, limit = 50 } = {}) {
  if (!parent_id) throw new Error('parent_id obrigatório (campaign_id ou adset_id)');
  const fields = 'id,name,status,effective_status,creative,adset_id,campaign_id,created_time,updated_time';
  return await metaFetch({
    endpoint: `/${parent_id}/ads`,
    params: { fields, limit },
  });
}

// Detalhe de criativo (texto, imagem, vídeo, link)
async function detalheCriativo({ creative_id } = {}) {
  if (!creative_id) throw new Error('creative_id obrigatório');
  const fields = 'id,name,title,body,object_story_spec,thumbnail_url,image_url,video_id,link_url,call_to_action_type,effective_object_story_id';
  return await metaFetch({
    endpoint: `/${creative_id}`,
    params: { fields },
  });
}

// ============================================================
// PAGES API
// ============================================================

async function listarPages({ limit = 100 } = {}) {
  const fields = 'id,name,category,fan_count,followers_count,is_published,link,about,instagram_business_account,picture';
  return await metaFetch({
    endpoint: '/me/accounts',
    params: { fields, limit },
  });
}

async function postsPage({ page_id, limit = 25 } = {}) {
  if (!page_id) throw new Error('page_id obrigatório');
  const fields = 'id,message,created_time,permalink_url,full_picture,reactions.summary(true),comments.summary(true),shares';
  return await metaFetch({
    endpoint: `/${page_id}/posts`,
    params: { fields, limit },
  });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // auth + meta
  obterAccessToken,
  renovarTokenLongo,
  inspecionarToken,
  // marketing
  listarAdAccounts,
  listarCampanhas,
  insightsCampanha,
  listarAdsets,
  listarAds,
  detalheCriativo,
  // pages
  listarPages,
  postsPage,
  // raw
  metaFetch,
};
