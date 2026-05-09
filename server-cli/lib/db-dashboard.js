// ============================================================
// db-dashboard.js — V2.14 (read-only do 2o Supabase de dashboard)
// ============================================================
// Wrapper do Supabase Management API pro projeto SEPARADO de dashboard
// (lkrehtmdqkgkyyotvjpz). Read-only. Credenciais vivem no cofre Pinguim
// (pinguim.cofre_chaves), nao no .env.local — funciona identico no V3.
//
// FONTE CANONICA DE TODAS AS REGRAS:
//   cerebro/squads/data/contexto/racional-dashboard-vendas.md
// (entregue pelo Andre 2026-05-09, validado contra screenshots).
//
// REGRAS DURAS (ler antes de mexer aqui):
// - Receita = my_commission (NAO price_value)
// - Status valido = ('approved', 'completed') — sempre
// - Reembolso = status='refunded' filtrado por purchase_date (NAO refund_date)
// - Moeda fixada (default BRL) — NAO somar moedas mistas
// - Ads filtrar nivel='campaign' — sem filtro = double-counting
// - Categorizacao bump/upsell/downsell vem de tv_launch_configs
//   (NUNCA usar is_order_bump — sempre false em periodos recentes)
// - Timezone: BRT explicito [X T03:00 UTC, (X+1) T03:00 UTC)
// - Pixel purchases ≠ Hotmart vendas — fontes diferentes
// ============================================================

const db = require('./db');

let _cacheCreds = { project_ref: null, token: null, expira_em_ms: 0 };
let _cacheConfigs = { configs: null, expira_em_ms: 0 };

async function obterCredenciais() {
  if (_cacheCreds.project_ref && _cacheCreds.expira_em_ms > Date.now()) {
    return { project_ref: _cacheCreds.project_ref, token: _cacheCreds.token };
  }
  const [project_ref, token] = await Promise.all([
    db.lerChaveSistema('DASHBOARD_PROJECT_REF', 'db-dashboard'),
    db.lerChaveSistema('DASHBOARD_ACCESS_TOKEN', 'db-dashboard'),
  ]);
  if (!project_ref || !token) {
    throw new Error('DASHBOARD_PROJECT_REF/DASHBOARD_ACCESS_TOKEN nao no cofre. V2.14: gravados pelo Andre em 2026-05-09.');
  }
  _cacheCreds = { project_ref, token, expira_em_ms: Date.now() + 60 * 60 * 1000 };
  return { project_ref, token };
}

// Roda SQL READ-ONLY (bloqueia statements de escrita por defesa em profundidade)
async function rodarSQL(sql) {
  const banido = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy)\b/i;
  if (banido.test(sql)) {
    throw new Error(`db-dashboard READ-ONLY. SQL bloqueado: ${sql.slice(0, 100)}`);
  }
  const { project_ref, token } = await obterCredenciais();
  const r = await fetch(`https://api.supabase.com/v1/projects/${project_ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(`db-dashboard SQL erro ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  if (data && data.message && /^Failed/.test(data.message)) {
    throw new Error(`db-dashboard SQL: ${data.message.slice(0, 500)}`);
  }
  return data;
}

// ============================================================
// HELPERS — janela BRT (UTC-3 explicito)
// ============================================================

// Converte data ISO (YYYY-MM-DD) BRT em janela UTC [from, to_exclusive)
// "Dia 09/05/2026 BRT" => from='2026-05-09T03:00:00', to='2026-05-10T03:00:00'
function janelaBRT(data_iso) {
  const d = new Date(`${data_iso}T03:00:00Z`); // 00h BRT = 03h UTC
  const proxima = new Date(d);
  proxima.setUTCDate(d.getUTCDate() + 1);
  return {
    from_utc: d.toISOString(),                 // '2026-05-09T03:00:00.000Z'
    to_utc:   proxima.toISOString(),           // '2026-05-10T03:00:00.000Z'
  };
}

// Janela [from_iso, to_iso] (ambos BRT, inclusivos) -> UTC
function janelaBRTRange(from_iso, to_iso) {
  const f = janelaBRT(from_iso);
  const t = janelaBRT(to_iso);
  return { from_utc: f.from_utc, to_utc: t.to_utc };
}

// "Ontem" em BRT (data ISO YYYY-MM-DD)
function ontemBRT() {
  const agora = new Date();
  const brtMs = agora.getTime() - 3 * 60 * 60 * 1000; // BRT = UTC - 3h
  const ontem = new Date(brtMs - 24 * 60 * 60 * 1000);
  return ontem.toISOString().slice(0, 10);
}

// ============================================================
// CONFIGS DE LANCAMENTO ATIVOS (cache RAM 1h)
// ============================================================

async function carregarConfigsAtivos() {
  if (_cacheConfigs.configs && _cacheConfigs.expira_em_ms > Date.now()) {
    return _cacheConfigs.configs;
  }
  const sql = `
    SELECT id, name,
           main_product_id, principal_product_id,
           orderbump_product_ids, upsell_product_ids, downsell_product_ids,
           presencial_product_id,
           campaign_name_contains, goal_qty, goal_revenue,
           start_date, end_date
    FROM tv_launch_configs
    WHERE is_active = true
    ORDER BY start_date DESC NULLS LAST;
  `;
  const configs = await rodarSQL(sql);
  _cacheConfigs = { configs, expira_em_ms: Date.now() + 60 * 60 * 1000 };
  return configs;
}

// Helper: array UUIDs de cada categoria, deduplicado entre todos os configs
function categorizarProductIds(configs) {
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  const main = [];
  const bump = [];
  const upsell = [];
  const downsell = [];
  const presencial = [];
  for (const c of configs) {
    if (c.main_product_id) main.push(c.main_product_id);
    if (c.principal_product_id) main.push(c.principal_product_id); // soma como main (racional §1.6)
    if (Array.isArray(c.orderbump_product_ids)) bump.push(...c.orderbump_product_ids);
    if (Array.isArray(c.upsell_product_ids)) upsell.push(...c.upsell_product_ids);
    if (Array.isArray(c.downsell_product_ids)) downsell.push(...c.downsell_product_ids);
    if (c.presencial_product_id) presencial.push(c.presencial_product_id);
  }
  return {
    main: uniq(main),
    bump: uniq(bump),
    upsell: uniq(upsell),
    downsell: uniq(downsell),
    presencial: uniq(presencial),
  };
}

// Helper SQL: monta IN clause com aspas pra array de UUIDs
function inClause(uuids) {
  if (!uuids || uuids.length === 0) return `'00000000-0000-0000-0000-000000000000'`; // forca empty
  return uuids.map(u => `'${String(u).replace(/'/g, "''")}'`).join(',');
}

// Keywords de campaign_name_contains de todos os configs ativos
function keywordsAtivas(configs) {
  return Array.from(new Set(
    configs.map(c => c.campaign_name_contains).filter(Boolean)
  ));
}

// ============================================================
// API publica — KPIs do dashboard
// ============================================================

// Resumo executivo de UM dia (bate com KPIs do TV Dash Produto sem filtro de produto, moeda BRL).
// Retorna objeto pronto pra Skill `compor-executivo-diario` consumir.
//
// FORMULA EXATA (validada lendo dashboard/src/lib/produto-queries.ts):
// 1. PRODUTO = SUM(my_commission) de TODAS transacoes approved/completed/moeda/range
//    (sem filtrar por main_ids quando filtro=Todos os Produtos)
//    VENDAS = COUNT dessas mesmas transacoes
//    mainBuyerIds = Set de buyer_id dessas transacoes
// 2. BUMP/UPSELL/DOWNSELL = SUM(my_commission) WHERE
//    product_id IN bumpIds/upsellIds/downsellIds  (lista de tv_launch_configs)
//    AND buyer_id IN mainBuyerIds                 ← REGRA CRUCIAL
//    AND status + currency + range iguais
//
// O filtro por buyer_id existe porque "bump" é semântico: alguém comprou o
// produto principal E levou o bump junto no mesmo checkout. Vendas isoladas
// do produto bump (sem ter comprado main) NÃO contam como bump.
async function resumo_dia(data_iso = null, moeda = 'BRL') {
  const dia = data_iso || ontemBRT();
  const { from_utc, to_utc } = janelaBRT(dia);

  const configs = await carregarConfigsAtivos();
  const { bump, upsell, downsell } = categorizarProductIds(configs);
  // Quando filtro=Todos, NAO categorizamos main por config — main = TODAS vendas.

  const moedaSafe = String(moeda).replace(/'/g, "''");

  // === Passo 1: PRODUTO = TODAS vendas approved/completed/moeda/range ===
  // (corresponde a "main" no dashboard quando filtro=Todos os Produtos)
  const sqlMain = `
    SELECT my_commission, buyer_id
    FROM hotmart_transactions
    WHERE status IN ('approved','completed')
      AND price_currency = '${moedaSafe}'
      AND purchase_date >= '${from_utc}'
      AND purchase_date <  '${to_utc}';
  `;
  const mainRows = await rodarSQL(sqlMain);
  const mainReceita = mainRows.reduce((s, r) => s + parseFloat(r.my_commission || 0), 0);
  const mainVendas = mainRows.length;
  const mainBuyerIds = new Set(mainRows.map(r => r.buyer_id).filter(Boolean));

  // === Passo 2: BUMP/UPSELL/DOWNSELL filtrados por mainBuyerIds ===
  // Helper inline pra puxar receita de uma lista de product_ids restrita aos buyers main
  async function receitaPorBuyerMain(productIds) {
    if (!productIds || productIds.length === 0 || mainBuyerIds.size === 0) {
      return { receita: 0, vendas: 0 };
    }
    const sql = `
      SELECT my_commission, buyer_id
      FROM hotmart_transactions
      WHERE status IN ('approved','completed')
        AND price_currency = '${moedaSafe}'
        AND purchase_date >= '${from_utc}'
        AND purchase_date <  '${to_utc}'
        AND product_id IN (${inClause(productIds)});
    `;
    const rows = await rodarSQL(sql);
    const filtered = rows.filter(r => mainBuyerIds.has(r.buyer_id));
    const receita = filtered.reduce((s, r) => s + parseFloat(r.my_commission || 0), 0);
    return { receita, vendas: filtered.length };
  }

  const [bumpR, upsellR, downsellR] = await Promise.all([
    receitaPorBuyerMain(bump),
    receitaPorBuyerMain(upsell),
    receitaPorBuyerMain(downsell),
  ]);

  // ATENCAO: buyers main JA contam as vendas main. Bump/upsell/downsell sao
  // ADICIONAIS desses mesmos buyers, somados ao TOTAL mas NAO incrementam VENDAS.
  // Match com fetchKpis dashboard/src/lib/produto-queries.ts.
  const resR = {
    receita_produto:  mainReceita,
    receita_bump:     bumpR.receita,
    receita_upsell:   upsellR.receita,
    receita_downsell: downsellR.receita,
    vendas_main:      mainVendas,
  };

  // === Reembolsos (purchase_date no range, status='refunded') ===
  const sqlReemb = `
    SELECT
      count(*) AS qtd,
      sum(my_commission) AS receita_perdida,
      sum(price_value) AS valor_bruto
    FROM hotmart_transactions
    WHERE status = 'refunded'
      AND price_currency = '${moedaSafe}'
      AND purchase_date >= '${from_utc}'
      AND purchase_date <  '${to_utc}';
  `;
  const [resReemb] = await rodarSQL(sqlReemb);

  // === Investimento Ads (nivel=campaign, sem filtro de produto pq executivo cobre tudo) ===
  // metricas_diarias.data e' DATE puro BRT
  const sqlAds = `
    SELECT
      sum(spend) AS gasto_total,
      sum(impressions) AS impressoes,
      sum(clicks) AS cliques,
      sum(reach) AS alcance,
      avg(NULLIF(frequency, 0)) AS frequencia_media
    FROM metricas_diarias
    WHERE data = '${dia}'
      AND nivel = 'campaign';
  `;
  const [resAds] = await rodarSQL(sqlAds);

  // === Funil Pixel (extrai actions[].value where action_type IN especifico) ===
  const sqlFunil = `
    WITH actions_flat AS (
      SELECT
        sum(impressions) AS impressoes,
        sum(clicks) AS cliques,
        coalesce(sum((
          SELECT sum((a->>'value')::int)
          FROM jsonb_array_elements(actions) a
          WHERE a->>'action_type' = 'landing_page_view'
        )), 0) AS lpv,
        coalesce(sum((
          SELECT sum((a->>'value')::int)
          FROM jsonb_array_elements(actions) a
          WHERE a->>'action_type' = 'initiate_checkout'
        )), 0) AS checkouts,
        coalesce(sum((
          SELECT sum((a->>'value')::int)
          FROM jsonb_array_elements(actions) a
          WHERE a->>'action_type' = 'purchase'
        )), 0) AS purchases_pixel
      FROM metricas_diarias
      WHERE data = '${dia}'
        AND nivel = 'campaign'
    )
    SELECT * FROM actions_flat;
  `;
  const [resFunil] = await rodarSQL(sqlFunil);

  // === Top 5 produtos do dia (por receita) ===
  const sqlTop = `
    SELECT p.name AS produto, count(*) AS qtd, sum(t.my_commission) AS receita
    FROM hotmart_transactions t
    LEFT JOIN hotmart_products p ON p.id = t.product_id
    WHERE t.status IN ('approved','completed')
      AND t.price_currency = '${moedaSafe}'
      AND t.purchase_date >= '${from_utc}'
      AND t.purchase_date <  '${to_utc}'
    GROUP BY p.name
    ORDER BY receita DESC NULLS LAST
    LIMIT 5;
  `;
  const top = await rodarSQL(sqlTop);

  // === Calculos derivados ===
  const receita_produto  = parseFloat(resR.receita_produto || 0);
  const receita_bump     = parseFloat(resR.receita_bump || 0);
  const receita_upsell   = parseFloat(resR.receita_upsell || 0);
  const receita_downsell = parseFloat(resR.receita_downsell || 0);
  const receita_total    = receita_produto + receita_bump + receita_upsell + receita_downsell;
  const vendas           = parseInt(resR.vendas_main || 0, 10);
  const investimento     = parseFloat(resAds.gasto_total || 0);
  const reembolsos_qtd   = parseInt(resReemb.qtd || 0, 10);
  const reembolsos_brl   = parseFloat(resReemb.receita_perdida || 0);

  return {
    dia,
    moeda,
    janela_utc: { from: from_utc, to: to_utc },

    // KPIs principais
    investimento,
    receita_total,
    receita_produto,
    receita_bump,
    receita_upsell,
    receita_downsell,
    roas: investimento > 0 ? receita_total / investimento : null,
    lucro: receita_total - investimento,
    vendas,
    cpa: vendas > 0 ? investimento / vendas : null,
    ticket_medio: vendas > 0 ? receita_total / vendas : null,
    frequencia: parseFloat(resAds.frequencia_media || 0),

    // Reembolsos
    reembolsos_qtd,
    reembolsos_brl,
    taxa_reembolso_pct: (vendas + reembolsos_qtd) > 0
      ? (reembolsos_qtd * 100) / (vendas + reembolsos_qtd)
      : null,

    // Funil Pixel (atribuicao Meta — NAO bate com Hotmart)
    funil: {
      impressoes:      parseInt(resFunil.impressoes || 0, 10),
      cliques:         parseInt(resFunil.cliques || 0, 10),
      lpv:             parseInt(resFunil.lpv || 0, 10),
      checkouts:       parseInt(resFunil.checkouts || 0, 10),
      purchases_pixel: parseInt(resFunil.purchases_pixel || 0, 10),
      cpm: parseInt(resFunil.impressoes || 0, 10) > 0 ? (investimento * 1000) / parseInt(resFunil.impressoes || 0, 10) : null,
      ctr_pct: parseInt(resFunil.impressoes || 0, 10) > 0 ? (parseInt(resFunil.cliques || 0, 10) * 100) / parseInt(resFunil.impressoes || 0, 10) : null,
    },

    // Top 5
    top_produtos: top.map(t => ({
      produto: t.produto,
      qtd: parseInt(t.qtd, 10),
      receita: parseFloat(t.receita || 0),
    })),

    // Auditoria
    audit: {
      configs_ativos: configs.length,
      configs_nomes: configs.map(c => c.name),
      qtd_buyers_main: mainBuyerIds.size,
      qtd_bump_ids: bump.length,
      qtd_upsell_ids: upsell.length,
      qtd_downsell_ids: downsell.length,
    },
  };
}

// Comparacao D-1: resumo do dia + resumo do anterior + delta
async function resumo_com_comparacao(data_iso = null, moeda = 'BRL') {
  const dia = data_iso || ontemBRT();
  const anterior = new Date(`${dia}T03:00:00Z`);
  anterior.setUTCDate(anterior.getUTCDate() - 1);
  const dia_anterior = anterior.toISOString().slice(0, 10);

  const [hoje, ontem] = await Promise.all([
    resumo_dia(dia, moeda),
    resumo_dia(dia_anterior, moeda),
  ]);

  const delta = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

  return {
    hoje,
    anterior: ontem,
    delta_pct: {
      receita_total: delta(hoje.receita_total, ontem.receita_total),
      vendas:        delta(hoje.vendas, ontem.vendas),
      investimento:  delta(hoje.investimento, ontem.investimento),
      roas:          delta(hoje.roas, ontem.roas),
      ticket_medio:  delta(hoje.ticket_medio, ontem.ticket_medio),
    },
  };
}

// Faturamento agregado N dias.
// Pra evitar custo (uma transacao por dia x N dias x filtragem por buyer),
// chama resumo_dia em paralelo. Mais lento mas exato — espelha dashboard.
async function faturamento_diario(dias = 7, moeda = 'BRL') {
  const ontem = ontemBRT();
  const dataDe = new Date(`${ontem}T03:00:00Z`);
  const promises = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(dataDe);
    d.setUTCDate(d.getUTCDate() - i);
    const isoDay = d.toISOString().slice(0, 10);
    promises.push(resumo_dia(isoDay, moeda).then(r => ({
      dia: isoDay,
      produto: r.receita_produto,
      bump: r.receita_bump,
      upsell: r.receita_upsell,
      downsell: r.receita_downsell,
      total: r.receita_total,
      vendas: r.vendas,
    })));
  }
  const all = await Promise.all(promises);
  return all.sort((a, b) => b.dia.localeCompare(a.dia));
}

// Lista produtos cadastrados
async function listar_produtos() {
  return await rodarSQL(`
    SELECT id, hotmart_product_id, name, is_active
    FROM hotmart_products
    WHERE is_active = true
    ORDER BY name;
  `);
}

module.exports = {
  rodarSQL,
  obterCredenciais,
  janelaBRT,
  janelaBRTRange,
  ontemBRT,
  carregarConfigsAtivos,
  categorizarProductIds,
  keywordsAtivas,
  resumo_dia,
  resumo_com_comparacao,
  faturamento_diario,
  listar_produtos,
};
