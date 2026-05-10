// ============================================================
// hotmart.js — V2.14 D Categoria G (Hotmart)
// ============================================================
// Wrapper API Hotmart Developers. OAuth2 client_credentials com cache de
// access_token + refresh proativo (5min antes de expirar). Token vale 6h.
//
// Categorias de acesso (cobre G1-G7 do AGENTS.md):
// - Sales API: histórico, summary, detalhes, refund
// - Subscriptions API: ativas, cancelar, reativar, mudar dia
// - Members Area API: progresso, lista de alunos, verificar acesso
// - Coupons API: criar, listar, deletar
//
// Cofre Pinguim:
//   HOTMART_CLIENT_ID
//   HOTMART_CLIENT_SECRET
//   HOTMART_BASIC_TOKEN
// ============================================================

const db = require('./db');

// ============================================================
// Auth + Token cache
// ============================================================
const _cacheToken = {
  access_token: null,
  expira_em_ms: 0,
};

async function obterCredenciais() {
  const [client_id, client_secret, basic_token] = await Promise.all([
    db.lerChaveSistema('HOTMART_CLIENT_ID', 'hotmart'),
    db.lerChaveSistema('HOTMART_CLIENT_SECRET', 'hotmart'),
    db.lerChaveSistema('HOTMART_BASIC_TOKEN', 'hotmart'),
  ]);
  if (!client_id || !client_secret || !basic_token) {
    throw new Error('Hotmart NAO configurada — faltam HOTMART_CLIENT_ID/SECRET/BASIC_TOKEN no cofre. Pedir credenciais ao sócio (Hotmart > Ferramentas > Hotmart Credentials).');
  }
  return { client_id, client_secret, basic_token };
}

// Refresh proativo: pede novo token se cache vence em <5min
async function obterAccessToken() {
  const margemMs = 5 * 60 * 1000;
  if (_cacheToken.access_token && _cacheToken.expira_em_ms - Date.now() > margemMs) {
    return _cacheToken.access_token;
  }
  const { client_id, client_secret, basic_token } = await obterCredenciais();
  const url = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${encodeURIComponent(client_id)}&client_secret=${encodeURIComponent(client_secret)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic_token}`,
      'Content-Type': 'application/json',
    },
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`Hotmart OAuth ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  // expires_in = segundos (típico 21600 = 6h)
  _cacheToken.access_token = json.access_token;
  _cacheToken.expira_em_ms = Date.now() + (parseInt(json.expires_in, 10) * 1000);
  console.log(`[hotmart] novo access_token, expira em ${Math.round(json.expires_in / 60)}min`);
  return _cacheToken.access_token;
}

// ============================================================
// Helper: fetch com retry exponencial (429 + 5xx)
// ============================================================
const BASE_URL = 'https://developers.hotmart.com/payments/api/v1';
const MAX_RETRIES = 3;

async function hotmartFetch({ method = 'GET', endpoint, params, body, retries = MAX_RETRIES }) {
  const access_token = await obterAccessToken();
  let url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  if (params && method === 'GET') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.append(k, String(v));
    }
    const qstr = qs.toString();
    if (qstr) url += (url.includes('?') ? '&' : '?') + qstr;
  }

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
    },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, opts);
      // 401 = token expirado/inválido — força refresh e retenta UMA vez
      if (resp.status === 401 && attempt === 0) {
        _cacheToken.access_token = null;
        opts.headers['Authorization'] = `Bearer ${await obterAccessToken()}`;
        continue;
      }
      // 429 ou 5xx = backoff
      if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
        const retryAfterHeader = resp.headers.get('Retry-After');
        const waitMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : Math.min(30000, 500 * Math.pow(2, attempt) + Math.random() * 500);
        console.warn(`[hotmart] ${resp.status} em ${endpoint} — retry em ${waitMs}ms (tentativa ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      const json = resp.status === 204 ? {} : await resp.json();
      if (!resp.ok) {
        const msg = json.error?.message || json.message || JSON.stringify(json).slice(0, 200);
        throw new Error(`Hotmart API ${resp.status}: ${msg}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1) {
        const waitMs = Math.min(10000, 500 * Math.pow(2, attempt));
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr || new Error(`Hotmart API: falha após ${retries} tentativas`);
}

// ============================================================
// SALES API
// ============================================================

// Histórico de vendas (com filtros).
// IMPORTANTE: sem `transaction_status`, retorna só APPROVED+COMPLETE (default Hotmart).
// Pra incluir reembolsos/cancelados, passar transaction_status='APPROVED,COMPLETE,REFUNDED,CHARGEBACK,CANCELLED'.
async function listarVendas({
  buyer_email,
  buyer_name,
  transaction,
  transaction_status,
  start_date,    // epoch ms UTC
  end_date,      // epoch ms UTC
  product_id,
  max_results = 50,
  page_token,
} = {}) {
  return await hotmartFetch({
    endpoint: '/sales/history',
    params: { buyer_email, buyer_name, transaction, transaction_status, start_date, end_date, product_id, max_results, page_token },
  });
}

// Resumo agregado (totais por moeda)
async function resumoVendas({ start_date, end_date, product_id, buyer_email } = {}) {
  return await hotmartFetch({
    endpoint: '/sales/summary',
    params: { start_date, end_date, product_id, buyer_email },
  });
}

// Detalhe de venda (mesmo endpoint do listarVendas, com filtro transaction)
async function consultarVenda({ transaction }) {
  if (!transaction) throw new Error('transaction obrigatório');
  const r = await hotmartFetch({ endpoint: '/sales/history', params: { transaction } });
  const items = r.items || [];
  return items[0] || null;
}

// Participantes (comprador, afiliado, produtor, coproduto)
async function consultarParticipantes({ transaction, buyer_email, user_type } = {}) {
  return await hotmartFetch({
    endpoint: '/sales/users',
    params: { transaction, buyer_email, user_type },
  });
}

// Comissões da venda
async function consultarComissoes({ transaction, commission_as } = {}) {
  return await hotmartFetch({
    endpoint: '/sales/commissions',
    params: { transaction, commission_as },
  });
}

// Detalhe de preço da venda
async function consultarPrecoVenda({ transaction }) {
  return await hotmartFetch({ endpoint: '/sales/price-details', params: { transaction } });
}

// Reembolsar venda (POST). EXIGE confirmação humana ANTES (Camada B no endpoint HTTP).
async function reembolsarVenda({ transaction }) {
  if (!transaction) throw new Error('transaction obrigatório');
  return await hotmartFetch({
    method: 'POST',
    endpoint: '/sales/refund',
    body: { transaction },
  });
}

// ============================================================
// SUBSCRIPTIONS API
// ============================================================

async function listarAssinaturas({
  status,                  // ACTIVE, CANCELLED_BY_CUSTOMER, OVERDUE, INACTIVE, etc
  product_id,
  subscriber_email,
  subscriber_code,
  max_results = 50,
  page_token,
} = {}) {
  return await hotmartFetch({
    endpoint: '/subscriptions',
    params: { status, product_id, subscriber_email, subscriber_code, max_results, page_token },
  });
}

async function comprasDoAssinante({ subscriber_code }) {
  if (!subscriber_code) throw new Error('subscriber_code obrigatório');
  return await hotmartFetch({ endpoint: `/subscriptions/${encodeURIComponent(subscriber_code)}/purchases` });
}

async function transacoesDoAssinante({ subscriber_code }) {
  if (!subscriber_code) throw new Error('subscriber_code obrigatório');
  return await hotmartFetch({ endpoint: `/subscriptions/${encodeURIComponent(subscriber_code)}/transactions` });
}

async function cancelarAssinatura({ subscriber_code, send_mail = true }) {
  const codes = Array.isArray(subscriber_code) ? subscriber_code : [subscriber_code];
  return await hotmartFetch({
    method: 'POST',
    endpoint: '/subscriptions/cancel',
    body: { subscriber_code: codes, send_mail },
  });
}

async function reativarAssinatura({ subscriber_code, charge = false }) {
  const codes = Array.isArray(subscriber_code) ? subscriber_code : [subscriber_code];
  return await hotmartFetch({
    method: 'POST',
    endpoint: '/subscriptions/reactivate',
    body: { subscriber_code: codes, charge },
  });
}

async function mudarDiaCobranca({ subscriber_code, due_day }) {
  if (!subscriber_code || !due_day) throw new Error('subscriber_code e due_day obrigatórios');
  if (due_day < 1 || due_day > 31) throw new Error('due_day deve estar entre 1 e 31');
  return await hotmartFetch({
    method: 'POST',
    endpoint: '/subscriptions/change-due-day',
    body: { subscriber_code, due_day },
  });
}

// ============================================================
// COUPONS API
// ============================================================

async function listarCupons({ product_id }) {
  if (!product_id) throw new Error('product_id obrigatório');
  return await hotmartFetch({ endpoint: `/coupon/product/${encodeURIComponent(product_id)}` });
}

async function criarCupom({ product_id, code, discount, start_date, end_date, max_uses, offer_ids }) {
  if (!product_id || !code || discount == null) {
    throw new Error('product_id, code, discount obrigatórios');
  }
  if (discount < 0 || discount > 1) {
    throw new Error('discount deve ser decimal 0-1 (ex: 0.10 = 10%)');
  }
  return await hotmartFetch({
    method: 'POST',
    endpoint: `/coupon/product/${encodeURIComponent(product_id)}`,
    body: { code, discount, start_date, end_date, max_uses, offer_ids },
  });
}

async function deletarCupom({ coupon_id }) {
  if (!coupon_id) throw new Error('coupon_id obrigatório');
  return await hotmartFetch({
    method: 'DELETE',
    endpoint: `/coupon/${encodeURIComponent(coupon_id)}`,
  });
}

// ============================================================
// PRODUCTS API
// ============================================================

async function listarProdutos({ max_results = 50, page_token } = {}) {
  return await hotmartFetch({ endpoint: '/products', params: { max_results, page_token } });
}

// ============================================================
// MEMBERS AREA API (Club)
// ============================================================
// Endpoint base diferente: /club/api/v1/...

async function listarAlunosProduto({ subdomain, product_id, page_token, max_results = 50 } = {}) {
  // Subdomain = identificação do Club do produtor (ex: 'meucurso' em meucurso.club.hotmart.com)
  if (!subdomain) throw new Error('subdomain do Club obrigatório (configurar no cofre como HOTMART_CLUB_SUBDOMAIN)');
  return await hotmartFetch({
    endpoint: `https://developers.hotmart.com/club/api/v1/users`,
    params: { subdomain, product_id, page_token, max_results },
  });
}

async function consultarProgressoAluno({ subdomain, user_id }) {
  if (!subdomain || !user_id) throw new Error('subdomain e user_id obrigatórios');
  return await hotmartFetch({
    endpoint: `https://developers.hotmart.com/club/api/v1/users/${encodeURIComponent(user_id)}/lessons`,
    params: { subdomain },
  });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // auth
  obterAccessToken,
  // sales
  listarVendas,
  resumoVendas,
  consultarVenda,
  consultarParticipantes,
  consultarComissoes,
  consultarPrecoVenda,
  reembolsarVenda,
  // subscriptions
  listarAssinaturas,
  comprasDoAssinante,
  transacoesDoAssinante,
  cancelarAssinatura,
  reativarAssinatura,
  mudarDiaCobranca,
  // coupons
  listarCupons,
  criarCupom,
  deletarCupom,
  // products
  listarProdutos,
  // members area
  listarAlunosProduto,
  consultarProgressoAluno,
  // raw
  hotmartFetch,
};
