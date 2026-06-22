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
// - Reembolso = status='refunded' filtrado por REFUND_DATE
//   (data DO REEMBOLSO, não da compra original). Decisao Andre 2026-05-15
//   pra alinhar com Dash do Pedro: ISIS olha "saiu da caixa hoje", nao
//   "venda de hoje que reembolsou". Fluxo de caixa do dia.
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
// Andre 2026-06-18: usa fetchComRetry + parseJSONSeguro do db.js pra cobrir
// queda de internet/DNS que retorna HTML em vez de JSON.
const { fetchComRetry, parseJSONSeguro, ehErroTransiente } = require('./db');

async function rodarSQL(sql) {
  const banido = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy)\b/i;
  if (banido.test(sql)) {
    throw new Error(`db-dashboard READ-ONLY. SQL bloqueado: ${sql.slice(0, 100)}`);
  }
  const { project_ref, token } = await obterCredenciais();
  const delays = [1000, 4000, 16000];
  for (let tentativa = 0; tentativa <= delays.length; tentativa++) {
    const r = await fetchComRetry(
      `https://api.supabase.com/v1/projects/${project_ref}/database/query`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      },
      'db-dashboard'
    );
    try {
      const data = await parseJSONSeguro(r, 'db-dashboard');
      if (!r.ok) {
        throw new Error(`db-dashboard SQL erro ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
      }
      if (data && data.message && /^Failed/.test(data.message)) {
        throw new Error(`db-dashboard SQL: ${data.message.slice(0, 500)}`);
      }
      return data;
    } catch (e) {
      if (ehErroTransiente(e) && tentativa < delays.length) {
        const delay = delays[tentativa];
        console.warn(`[db-dashboard] parse falhou (tentativa ${tentativa + 1}/${delays.length + 1}): ${e.message}. Retry em ${delay}ms.`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      throw e;
    }
  }
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

  // === Reembolsos (REFUND_DATE no range, status='refunded') ===
  // Fix Andre 2026-05-15: antes filtrava por purchase_date e perdia
  // reembolsos de compras antigas processadas no dia. Agora filtra pelo
  // dia EM QUE O REEMBOLSO foi processado — alinha com Dash do Pedro.
  const sqlReemb = `
    SELECT
      count(*) AS qtd,
      sum(my_commission) AS receita_perdida,
      sum(price_value) AS valor_bruto
    FROM hotmart_transactions
    WHERE status = 'refunded'
      AND price_currency = '${moedaSafe}'
      AND refund_date >= '${from_utc}'
      AND refund_date <  '${to_utc}';
  `;
  const [resReemb] = await rodarSQL(sqlReemb);

  // === Investimento Ads (nivel=campaign, sem filtro de produto pq executivo cobre tudo) ===
  // metricas_diarias.data e' DATE puro BRT
  const sqlAds = `
    SELECT
      sum(spend) AS gasto_total,
      sum(impressions) AS impressoes,
      sum(clicks) AS cliques,
      sum(unique_clicks) AS cliques_unicos,
      sum(reach) AS alcance,
      sum(inline_link_clicks) AS cliques_link,
      avg(NULLIF(frequency, 0)) AS frequencia_media,
      count(DISTINCT conta_id) FILTER (WHERE spend > 0) AS contas_ativas
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

    // Meta Ads — métricas adicionais (V2.14 C1.1 — André pediu paridade com dashboard)
    ads: {
      gasto_total:    parseFloat(resAds.gasto_total || 0),
      impressoes:     parseInt(resAds.impressoes || 0, 10),
      cliques:        parseInt(resAds.cliques || 0, 10),
      cliques_unicos: parseInt(resAds.cliques_unicos || 0, 10),
      cliques_link:   parseInt(resAds.cliques_link || 0, 10),
      alcance:        parseInt(resAds.alcance || 0, 10),
      frequencia:     parseFloat(resAds.frequencia_media || 0),
      contas_ativas:  parseInt(resAds.contas_ativas || 0, 10),
      cpm: parseInt(resAds.impressoes || 0, 10) > 0
        ? (parseFloat(resAds.gasto_total || 0) * 1000) / parseInt(resAds.impressoes || 0, 10)
        : null,
      ctr_pct: parseInt(resAds.impressoes || 0, 10) > 0
        ? (parseInt(resAds.cliques || 0, 10) * 100) / parseInt(resAds.impressoes || 0, 10)
        : null,
      cpa_unico: parseInt(resAds.cliques_unicos || 0, 10) > 0
        ? parseFloat(resAds.gasto_total || 0) / parseInt(resAds.cliques_unicos || 0, 10)
        : null,
    },

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

// ============================================================
// V2.15.2 — Meta Ads relatorio dedicado (Andre 2026-05-13)
// ============================================================
// Funcoes especificas pro relatorio Meta Ads (Book Diario com plano de acao).
// Diferente do executivo que mistura financeiro+ads+agenda, este FOCA so em Ads.
// ============================================================

// Janela rolling N dias: [now-N*24h, agora] em UTC
function janelaUltimosNDias(n_dias) {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - n_dias * 24 * 60 * 60 * 1000);
  return { from: inicio.toISOString().slice(0, 10), to: agora.toISOString().slice(0, 10) };
}

// KPIs Meta agregados num range de datas BRT [from, to] inclusivo
async function meta_kpis_range(from_iso, to_iso) {
  const sql = `
    SELECT
      sum(spend)         AS gasto,
      sum(impressions)   AS impressoes,
      sum(clicks)        AS cliques,
      sum(unique_clicks) AS cliques_unicos,
      sum(reach)         AS alcance,
      sum(inline_link_clicks) AS cliques_link,
      avg(NULLIF(frequency, 0)) AS frequencia_media,
      count(DISTINCT conta_id) FILTER (WHERE spend > 0) AS contas_ativas,
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
      )), 0) AS purchases_pixel,
      coalesce(sum((
        SELECT sum((a->>'value')::numeric)
        FROM jsonb_array_elements(coalesce(action_values, '[]'::jsonb)) a
        WHERE a->>'action_type' = 'purchase'
      )), 0) AS receita_pixel
    FROM metricas_diarias
    WHERE data >= '${from_iso}'
      AND data <= '${to_iso}'
      AND nivel = 'campaign';
  `;
  const [r] = await rodarSQL(sql);
  const gasto = parseFloat(r.gasto || 0);
  const imp = parseInt(r.impressoes || 0, 10);
  const cliques = parseInt(r.cliques || 0, 10);
  const receitaPixel = parseFloat(r.receita_pixel || 0);
  const purchases = parseInt(r.purchases_pixel || 0, 10);
  return {
    gasto,
    impressoes: imp,
    cliques,
    cliques_unicos: parseInt(r.cliques_unicos || 0, 10),
    cliques_link: parseInt(r.cliques_link || 0, 10),
    alcance: parseInt(r.alcance || 0, 10),
    frequencia_media: parseFloat(r.frequencia_media || 0),
    contas_ativas: parseInt(r.contas_ativas || 0, 10),
    lpv: parseInt(r.lpv || 0, 10),
    checkouts: parseInt(r.checkouts || 0, 10),
    purchases_pixel: purchases,
    // V3.1 Andre 2026-05-13: receita do PIXEL Meta (action_values purchase),
    // NUNCA cruzar com Hotmart pra evitar atribuir venda não-trackeada.
    receita_pixel: receitaPixel,
    roas_pixel: gasto > 0 ? receitaPixel / gasto : null,
    cpa_pixel: purchases > 0 ? gasto / purchases : null,
    ticket_medio_pixel: purchases > 0 ? receitaPixel / purchases : null,
    cpm: imp > 0 ? (gasto * 1000) / imp : null,
    ctr_pct: imp > 0 ? (cliques * 100) / imp : null,
    cpc: cliques > 0 ? gasto / cliques : null,
  };
}

// Faturamento Hotmart agregado num range BRT (sum my_commission approved/completed)
async function hotmart_faturamento_range(from_iso, to_iso, moeda = 'BRL') {
  const janela = janelaBRTRange(from_iso, to_iso);
  const sql = `
    SELECT
      sum(my_commission) AS receita,
      count(*) AS vendas,
      count(DISTINCT buyer_id) AS compradores
    FROM hotmart_transactions
    WHERE status IN ('approved', 'completed')
      AND price_currency = '${moeda}'
      AND purchase_date >= '${janela.from_utc}'
      AND purchase_date <  '${janela.to_utc}';
  `;
  const [r] = await rodarSQL(sql);
  return {
    receita: parseFloat(r.receita || 0),
    vendas: parseInt(r.vendas || 0, 10),
    compradores: parseInt(r.compradores || 0, 10),
  };
}

// Breakdown por ad account (24h ou range). Une metricas_diarias + contas pra
// dar nome legivel ("[MM] Crescimento de Base") em vez de uuid.
async function meta_por_conta(from_iso, to_iso) {
  const sql = `
    SELECT
      c.id AS conta_id,
      c.nome AS conta_nome,
      c.meta_account_id,
      sum(m.spend)       AS gasto,
      sum(m.impressions) AS impressoes,
      sum(m.clicks)      AS cliques,
      sum(m.reach)       AS alcance,
      avg(NULLIF(m.frequency, 0)) AS frequencia_media,
      coalesce(sum((
        SELECT sum((a->>'value')::int)
        FROM jsonb_array_elements(m.actions) a
        WHERE a->>'action_type' = 'purchase'
      )), 0) AS purchases_pixel,
      coalesce(sum((
        SELECT sum((a->>'value')::numeric)
        FROM jsonb_array_elements(coalesce(m.action_values, '[]'::jsonb)) a
        WHERE a->>'action_type' = 'purchase'
      )), 0) AS receita_pixel,
      count(DISTINCT m.entity_id) AS qtd_campanhas
    FROM metricas_diarias m
    JOIN contas c ON c.id = m.conta_id
    WHERE m.data >= '${from_iso}'
      AND m.data <= '${to_iso}'
      AND m.nivel = 'campaign'
      AND m.spend > 0
    GROUP BY c.id, c.nome, c.meta_account_id
    ORDER BY gasto DESC;
  `;
  const rows = await rodarSQL(sql);
  return rows.map(r => {
    const gasto = parseFloat(r.gasto || 0);
    const imp = parseInt(r.impressoes || 0, 10);
    const cliques = parseInt(r.cliques || 0, 10);
    const receitaPixel = parseFloat(r.receita_pixel || 0);
    const purchases = parseInt(r.purchases_pixel || 0, 10);
    return {
      conta_id: r.conta_id,
      conta_nome: r.conta_nome,
      meta_account_id: r.meta_account_id,
      gasto,
      impressoes: imp,
      cliques,
      alcance: parseInt(r.alcance || 0, 10),
      frequencia_media: parseFloat(r.frequencia_media || 0),
      purchases_pixel: purchases,
      receita_pixel: receitaPixel,
      roas_pixel: gasto > 0 ? receitaPixel / gasto : null,
      qtd_campanhas: parseInt(r.qtd_campanhas || 0, 10),
      cpm: imp > 0 ? (gasto * 1000) / imp : null,
      ctr_pct: imp > 0 ? (cliques * 100) / imp : null,
      cpa_pixel: purchases > 0 ? gasto / purchases : null,
    };
  });
}

// Top N campanhas (nivel=campaign) por gasto no range, com nome real
async function meta_top_campanhas(from_iso, to_iso, limite = 10) {
  const sql = `
    SELECT
      m.entity_id,
      m.entity_name,
      c.nome AS conta_nome,
      sum(m.spend)       AS gasto,
      sum(m.impressions) AS impressoes,
      sum(m.clicks)      AS cliques,
      avg(NULLIF(m.frequency, 0)) AS frequencia_media,
      coalesce(sum((
        SELECT sum((a->>'value')::int)
        FROM jsonb_array_elements(m.actions) a
        WHERE a->>'action_type' = 'purchase'
      )), 0) AS purchases_pixel,
      coalesce(sum((
        SELECT sum((a->>'value')::numeric)
        FROM jsonb_array_elements(coalesce(m.action_values, '[]'::jsonb)) a
        WHERE a->>'action_type' = 'purchase'
      )), 0) AS receita_pixel
    FROM metricas_diarias m
    JOIN contas c ON c.id = m.conta_id
    WHERE m.data >= '${from_iso}'
      AND m.data <= '${to_iso}'
      AND m.nivel = 'campaign'
      AND m.spend > 0
    GROUP BY m.entity_id, m.entity_name, c.nome
    ORDER BY gasto DESC
    LIMIT ${parseInt(limite, 10)};
  `;
  const rows = await rodarSQL(sql);
  return rows.map(r => {
    const gasto = parseFloat(r.gasto || 0);
    const imp = parseInt(r.impressoes || 0, 10);
    const cliques = parseInt(r.cliques || 0, 10);
    const receitaPixel = parseFloat(r.receita_pixel || 0);
    return {
      entity_id: r.entity_id,
      entity_name: r.entity_name,
      conta_nome: r.conta_nome,
      gasto,
      impressoes: imp,
      cliques,
      frequencia_media: parseFloat(r.frequencia_media || 0),
      purchases_pixel: parseInt(r.purchases_pixel || 0, 10),
      receita_pixel: receitaPixel,
      roas_pixel: gasto > 0 ? receitaPixel / gasto : null,
      cpm: imp > 0 ? (gasto * 1000) / imp : null,
      ctr_pct: imp > 0 ? (cliques * 100) / imp : null,
    };
  });
}

// Serie diaria N dias (pra grafico) — gasto + impressoes + cliques
async function meta_serie_diaria(n_dias = 30) {
  const sql = `
    SELECT
      data,
      sum(spend) AS gasto,
      sum(impressions) AS impressoes,
      sum(clicks) AS cliques,
      coalesce(sum((
        SELECT sum((a->>'value')::int)
        FROM jsonb_array_elements(actions) a
        WHERE a->>'action_type' = 'purchase'
      )), 0) AS purchases_pixel,
      coalesce(sum((
        SELECT sum((a->>'value')::numeric)
        FROM jsonb_array_elements(coalesce(action_values, '[]'::jsonb)) a
        WHERE a->>'action_type' = 'purchase'
      )), 0) AS receita_pixel
    FROM metricas_diarias
    WHERE data >= (now()::date - ${parseInt(n_dias, 10)})
      AND nivel = 'campaign'
    GROUP BY data
    ORDER BY data ASC;
  `;
  const rows = await rodarSQL(sql);
  return rows.map(r => ({
    data: r.data,
    gasto: parseFloat(r.gasto || 0),
    impressoes: parseInt(r.impressoes || 0, 10),
    cliques: parseInt(r.cliques || 0, 10),
    purchases_pixel: parseInt(r.purchases_pixel || 0, 10),
    receita_pixel: parseFloat(r.receita_pixel || 0),
  }));
}

// Faturamento Hotmart serie diaria N dias (pra cruzar com gasto Ads no grafico)
async function hotmart_serie_diaria(n_dias = 30, moeda = 'BRL') {
  // Gera datas BRT do range
  const datas = [];
  const hoje = new Date();
  for (let i = n_dias - 1; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
    datas.push(d.toISOString().slice(0, 10));
  }
  // Query batch: agrega por dia BRT
  const sql = `
    SELECT
      date_trunc('day', (purchase_date AT TIME ZONE 'America/Sao_Paulo'))::date AS dia,
      sum(my_commission) AS receita,
      count(*) AS vendas
    FROM hotmart_transactions
    WHERE status IN ('approved', 'completed')
      AND price_currency = '${moeda}'
      AND purchase_date >= (now() - interval '${parseInt(n_dias, 10) + 1} days')
    GROUP BY 1
    ORDER BY 1 ASC;
  `;
  const rows = await rodarSQL(sql);
  // Mapa pra preencher datas vazias com 0
  const mapa = {};
  rows.forEach(r => {
    const dia = String(r.dia).slice(0, 10);
    mapa[dia] = { receita: parseFloat(r.receita || 0), vendas: parseInt(r.vendas || 0, 10) };
  });
  return datas.map(d => ({
    data: d,
    receita: mapa[d]?.receita || 0,
    vendas: mapa[d]?.vendas || 0,
  }));
}

// ============================================================
// V2.15.3 — Hotmart Diário detalhado (Andre 2026-05-14)
// ============================================================
// Funcoes pra book diario Hotmart. Seguem mesmo padrao das funcoes Meta Ads
// acima: SQL puro via rodarSQL, status canonico, moeda parametrizada, BRT
// explicito. Tudo READ-only — defesa em profundidade no rodarSQL bloqueia
// escrita.
// ============================================================

// KPIs Hotmart agregados num range BRT — receita liquida BRL+USD, vendas,
// ticket medio, reembolsos, taxa reembolso, compradores unicos, pendentes
// (caixa em risco: billet_printed + waiting_payment + delayed)
async function hotmart_kpis_range(from_iso, to_iso, moeda = 'BRL') {
  const janela = janelaBRTRange(from_iso, to_iso);
  const moedaSafe = String(moeda).replace(/'/g, "''");

  // Vendas/pendentes/disputas: filtra por PURCHASE_DATE (compra do dia)
  const sqlVendas = `
    SELECT
      coalesce(sum(my_commission) FILTER (WHERE status IN ('approved','completed')), 0) AS receita,
      count(*) FILTER (WHERE status IN ('approved','completed')) AS vendas,
      count(DISTINCT buyer_id) FILTER (WHERE status IN ('approved','completed')) AS compradores,
      coalesce(sum(my_commission) FILTER (WHERE status IN ('billet_printed','waiting_payment','delayed')), 0) AS receita_pendente,
      count(*) FILTER (WHERE status IN ('billet_printed','waiting_payment','delayed')) AS pendentes_qtd,
      count(*) FILTER (WHERE status IN ('chargeback','dispute')) AS disputas_qtd,
      coalesce(sum(my_commission) FILTER (WHERE status IN ('chargeback','dispute')), 0) AS receita_disputada
    FROM hotmart_transactions
    WHERE price_currency = '${moedaSafe}'
      AND purchase_date >= '${janela.from_utc}'
      AND purchase_date <  '${janela.to_utc}';
  `;
  // Reembolsos: filtra por REFUND_DATE (Fix Andre 2026-05-15)
  // Reembolso é evento do dia em que foi processado, não da venda original.
  const sqlReemb = `
    SELECT
      coalesce(sum(my_commission), 0) AS receita_reembolsada,
      count(*) AS reembolsos_qtd
    FROM hotmart_transactions
    WHERE status = 'refunded'
      AND price_currency = '${moedaSafe}'
      AND refund_date >= '${janela.from_utc}'
      AND refund_date <  '${janela.to_utc}';
  `;
  const [[r], [reemb]] = await Promise.all([rodarSQL(sqlVendas), rodarSQL(sqlReemb)]);

  const receita = parseFloat(r.receita || 0);
  const vendas = parseInt(r.vendas || 0, 10);
  const reembolsos = parseInt(reemb.reembolsos_qtd || 0, 10);

  return {
    receita,
    vendas,
    compradores: parseInt(r.compradores || 0, 10),
    ticket_medio: vendas > 0 ? receita / vendas : null,
    receita_reembolsada: parseFloat(reemb.receita_reembolsada || 0),
    reembolsos_qtd: reembolsos,
    taxa_reembolso_pct: (vendas + reembolsos) > 0 ? (reembolsos * 100) / (vendas + reembolsos) : null,
    receita_pendente: parseFloat(r.receita_pendente || 0),
    pendentes_qtd: parseInt(r.pendentes_qtd || 0, 10),
    disputas_qtd: parseInt(r.disputas_qtd || 0, 10),
    receita_disputada: parseFloat(r.receita_disputada || 0),
  };
}

// Top N produtos por receita num range. Retorna nome, qtd vendas, receita,
// ticket medio, share % do total. Default top 10 — relatorio escolhe quantos.
async function hotmart_top_produtos_range(from_iso, to_iso, limite = 10, moeda = 'BRL') {
  const janela = janelaBRTRange(from_iso, to_iso);
  const moedaSafe = String(moeda).replace(/'/g, "''");

  // NOTA Andre 2026-05-15: a coluna "reembolsos" aqui é dos reembolsos
  // cujas COMPRAS foram do produto no dia — pode divergir do número total
  // de reembolsos processados no dia (que usa refund_date). Mantido pq
  // semanticamente é "saúde do produto vendido no dia". Se virar gap,
  // criar refund_date aqui também.
  const sql = `
    SELECT
      p.id AS produto_id,
      coalesce(p.name, '(sem nome)') AS produto,
      count(*) AS vendas,
      sum(t.my_commission) AS receita,
      count(*) FILTER (WHERE t.status IN ('billet_printed','waiting_payment','delayed')) AS pendentes,
      coalesce(sum(t.my_commission) FILTER (WHERE t.status IN ('billet_printed','waiting_payment','delayed')), 0) AS receita_pendente,
      count(*) FILTER (WHERE t.status = 'refunded') AS reembolsos
    FROM hotmart_transactions t
    LEFT JOIN hotmart_products p ON p.id = t.product_id
    WHERE t.price_currency = '${moedaSafe}'
      AND t.purchase_date >= '${janela.from_utc}'
      AND t.purchase_date <  '${janela.to_utc}'
      AND t.status IN ('approved','completed','billet_printed','waiting_payment','delayed','refunded')
    GROUP BY p.id, p.name
    HAVING count(*) FILTER (WHERE t.status IN ('approved','completed')) > 0
    ORDER BY sum(t.my_commission) FILTER (WHERE t.status IN ('approved','completed')) DESC NULLS LAST
    LIMIT ${parseInt(limite, 10)};
  `;
  const rows = await rodarSQL(sql);

  // Calcula share % do total agregado
  const totalReceita = rows.reduce((s, r) => s + parseFloat(r.receita || 0), 0);

  return rows.map(r => {
    const receita = parseFloat(r.receita || 0);
    const vendas = parseInt(r.vendas || 0, 10);
    return {
      produto_id: r.produto_id,
      produto: r.produto,
      vendas,
      receita,
      ticket_medio: vendas > 0 ? receita / vendas : null,
      share_pct: totalReceita > 0 ? (receita * 100) / totalReceita : 0,
      pendentes: parseInt(r.pendentes || 0, 10),
      receita_pendente: parseFloat(r.receita_pendente || 0),
      reembolsos: parseInt(r.reembolsos || 0, 10),
    };
  });
}

// Breakdown por payment_type num range (ontem geralmente). Mostra distribuicao
// de PIX/CREDIT_CARD/BILLET/WALLET/internacionais. Util pra ver saude do mix
// e identificar % de boleto que vira "delayed/waiting_payment" (fricao).
async function hotmart_breakdown_pagamento(from_iso, to_iso, moeda = 'BRL') {
  const janela = janelaBRTRange(from_iso, to_iso);
  const moedaSafe = String(moeda).replace(/'/g, "''");

  const sql = `
    SELECT
      coalesce(payment_type, 'OUTROS') AS payment_type,
      count(*) FILTER (WHERE status IN ('approved','completed')) AS vendas_aprovadas,
      coalesce(sum(my_commission) FILTER (WHERE status IN ('approved','completed')), 0) AS receita,
      count(*) FILTER (WHERE status IN ('billet_printed','waiting_payment','delayed')) AS pendentes,
      count(*) FILTER (WHERE status = 'canceled') AS canceladas,
      count(*) FILTER (WHERE status = 'refunded') AS reembolsadas,
      count(*) AS total_geral
    FROM hotmart_transactions
    WHERE price_currency = '${moedaSafe}'
      AND purchase_date >= '${janela.from_utc}'
      AND purchase_date <  '${janela.to_utc}'
    GROUP BY payment_type
    HAVING count(*) > 0
    ORDER BY count(*) FILTER (WHERE status IN ('approved','completed')) DESC NULLS LAST;
  `;
  const rows = await rodarSQL(sql);

  const totalReceita = rows.reduce((s, r) => s + parseFloat(r.receita || 0), 0);
  const totalVendas = rows.reduce((s, r) => s + parseInt(r.vendas_aprovadas || 0, 10), 0);

  return rows.map(r => ({
    payment_type: r.payment_type,
    vendas_aprovadas: parseInt(r.vendas_aprovadas || 0, 10),
    receita: parseFloat(r.receita || 0),
    pendentes: parseInt(r.pendentes || 0, 10),
    canceladas: parseInt(r.canceladas || 0, 10),
    reembolsadas: parseInt(r.reembolsadas || 0, 10),
    total_geral: parseInt(r.total_geral || 0, 10),
    share_receita_pct: totalReceita > 0 ? (parseFloat(r.receita || 0) * 100) / totalReceita : 0,
    share_vendas_pct: totalVendas > 0 ? (parseInt(r.vendas_aprovadas || 0, 10) * 100) / totalVendas : 0,
  }));
}

// Compradores suspeitos no dia: 3+ canceladas/refundadas no mesmo dia
// (alerta fraude/teste/erro de checkout — caso real Leonardo Magalhaes 14/05)
async function hotmart_compradores_suspeitos(from_iso, to_iso, moeda = 'BRL') {
  const janela = janelaBRTRange(from_iso, to_iso);
  const moedaSafe = String(moeda).replace(/'/g, "''");

  const sql = `
    SELECT
      b.id AS buyer_id,
      coalesce(b.name, '(sem nome)') AS nome,
      coalesce(b.email, '(sem email)') AS email,
      count(*) FILTER (WHERE t.status = 'canceled') AS canceladas,
      count(*) FILTER (WHERE t.status = 'refunded') AS reembolsadas,
      count(*) FILTER (WHERE t.status IN ('chargeback','dispute')) AS disputas,
      count(*) AS total_transacoes,
      coalesce(sum(t.price_value) FILTER (WHERE t.status IN ('canceled','refunded','chargeback','dispute')), 0) AS valor_problema
    FROM hotmart_transactions t
    JOIN hotmart_buyers b ON b.id = t.buyer_id
    WHERE t.price_currency = '${moedaSafe}'
      AND t.purchase_date >= '${janela.from_utc}'
      AND t.purchase_date <  '${janela.to_utc}'
    GROUP BY b.id, b.name, b.email
    HAVING (count(*) FILTER (WHERE t.status IN ('canceled','refunded','chargeback','dispute'))) >= 3
    ORDER BY count(*) FILTER (WHERE t.status IN ('canceled','refunded','chargeback','dispute')) DESC
    LIMIT 20;
  `;
  const rows = await rodarSQL(sql);

  return rows.map(r => ({
    buyer_id: r.buyer_id,
    nome: r.nome,
    email: r.email,
    canceladas: parseInt(r.canceladas || 0, 10),
    reembolsadas: parseInt(r.reembolsadas || 0, 10),
    disputas: parseInt(r.disputas || 0, 10),
    total_transacoes: parseInt(r.total_transacoes || 0, 10),
    valor_problema: parseFloat(r.valor_problema || 0),
  }));
}

// Snapshot assinaturas: ativas, novas no dia, canceladas no dia, projecao MRR
async function hotmart_assinaturas_snapshot(dia_iso) {
  const janela = janelaBRT(dia_iso);

  const sql = `
    SELECT
      count(*) FILTER (WHERE status = 'ACTIVE') AS ativas,
      count(*) FILTER (WHERE status = 'INACTIVE') AS inativas,
      count(*) FILTER (WHERE status = 'CANCELLED_BY_CUSTOMER' OR status = 'CANCELLED_BY_SELLER' OR status = 'CANCELLED_BY_ADMIN') AS canceladas_total,
      count(*) FILTER (WHERE started_at >= '${janela.from_utc}' AND started_at < '${janela.to_utc}') AS novas_dia,
      count(*) FILTER (WHERE canceled_at >= '${janela.from_utc}' AND canceled_at < '${janela.to_utc}') AS canceladas_dia,
      count(*) FILTER (WHERE created_at >= '${janela.from_utc}' AND created_at < '${janela.to_utc}') AS criadas_dia
    FROM hotmart_subscriptions;
  `;
  const [r] = await rodarSQL(sql);

  // Top 5 planos por qtd ativa
  const sqlTop = `
    SELECT
      coalesce(s.plan_name, '(sem plano)') AS plano,
      coalesce(p.name, '(sem produto)') AS produto,
      count(*) AS qtd_ativa
    FROM hotmart_subscriptions s
    LEFT JOIN hotmart_products p ON p.id = s.product_id
    WHERE s.status = 'ACTIVE'
    GROUP BY s.plan_name, p.name
    ORDER BY count(*) DESC
    LIMIT 5;
  `;
  const top = await rodarSQL(sqlTop);

  return {
    ativas: parseInt(r.ativas || 0, 10),
    inativas: parseInt(r.inativas || 0, 10),
    canceladas_total: parseInt(r.canceladas_total || 0, 10),
    novas_dia: parseInt(r.novas_dia || 0, 10),
    canceladas_dia: parseInt(r.canceladas_dia || 0, 10),
    criadas_dia: parseInt(r.criadas_dia || 0, 10),
    top_planos: top.map(t => ({
      plano: t.plano,
      produto: t.produto,
      qtd_ativa: parseInt(t.qtd_ativa || 0, 10),
    })),
  };
}

// Serie diaria N dias — receita aprovada por dia (BRL) pra grafico area
// Diferente de hotmart_serie_diaria existente: tras MAIS detalhe (vendas + reembolsos +
// pendentes_geradas + ticket_medio_dia) pra grafico bar/line composto
async function hotmart_serie_diaria_rica(n_dias = 30, moeda = 'BRL') {
  const moedaSafe = String(moeda).replace(/'/g, "''");

  // Vendas/pendentes: agrupados por PURCHASE_DATE
  const sqlVendas = `
    SELECT
      date_trunc('day', (purchase_date AT TIME ZONE 'America/Sao_Paulo'))::date AS dia,
      count(*) FILTER (WHERE status IN ('approved','completed')) AS vendas,
      coalesce(sum(my_commission) FILTER (WHERE status IN ('approved','completed')), 0) AS receita,
      count(*) FILTER (WHERE status IN ('billet_printed','waiting_payment','delayed')) AS pendentes_geradas
    FROM hotmart_transactions
    WHERE price_currency = '${moedaSafe}'
      AND purchase_date >= (now() - interval '${parseInt(n_dias, 10) + 1} days')
    GROUP BY 1
    ORDER BY 1 ASC;
  `;
  // Reembolsos: agrupados por REFUND_DATE (Fix Andre 2026-05-15)
  const sqlReemb = `
    SELECT
      date_trunc('day', (refund_date AT TIME ZONE 'America/Sao_Paulo'))::date AS dia,
      count(*) AS reembolsos,
      coalesce(sum(my_commission), 0) AS receita_reembolsada
    FROM hotmart_transactions
    WHERE status = 'refunded'
      AND price_currency = '${moedaSafe}'
      AND refund_date >= (now() - interval '${parseInt(n_dias, 10) + 1} days')
    GROUP BY 1
    ORDER BY 1 ASC;
  `;
  const [rowsVendas, rowsReemb] = await Promise.all([rodarSQL(sqlVendas), rodarSQL(sqlReemb)]);
  // Merge por dia
  const mapaReemb = {};
  for (const r of rowsReemb) {
    mapaReemb[String(r.dia).slice(0, 10)] = {
      reembolsos: parseInt(r.reembolsos || 0, 10),
      receita_reembolsada: parseFloat(r.receita_reembolsada || 0),
    };
  }
  // Adiciona campos de reemb ao rowsVendas (com fallback 0)
  const rows = rowsVendas.map(r => {
    const dia = String(r.dia).slice(0, 10);
    const reembolsoDoDia = mapaReemb[dia] || { reembolsos: 0, receita_reembolsada: 0 };
    return { ...r, ...reembolsoDoDia };
  });
  // Inclui dias que tiveram só reembolso, sem venda (importante!)
  for (const dia of Object.keys(mapaReemb)) {
    if (!rows.find(r => String(r.dia).slice(0, 10) === dia)) {
      rows.push({ dia, vendas: 0, receita: 0, pendentes_geradas: 0, ...mapaReemb[dia] });
    }
  }
  rows.sort((a, b) => String(a.dia).localeCompare(String(b.dia)));

  // Preenche dias vazios com 0
  const datas = [];
  const hoje = new Date();
  for (let i = n_dias - 1; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
    datas.push(d.toISOString().slice(0, 10));
  }
  const mapa = {};
  rows.forEach(r => {
    const dia = String(r.dia).slice(0, 10);
    const vendas = parseInt(r.vendas || 0, 10);
    const receita = parseFloat(r.receita || 0);
    mapa[dia] = {
      vendas,
      receita,
      reembolsos: parseInt(r.reembolsos || 0, 10),
      receita_reembolsada: parseFloat(r.receita_reembolsada || 0),
      pendentes_geradas: parseInt(r.pendentes_geradas || 0, 10),
      ticket_medio: vendas > 0 ? receita / vendas : null,
    };
  });

  return datas.map(d => ({
    data: d,
    vendas: mapa[d]?.vendas || 0,
    receita: mapa[d]?.receita || 0,
    reembolsos: mapa[d]?.reembolsos || 0,
    receita_reembolsada: mapa[d]?.receita_reembolsada || 0,
    pendentes_geradas: mapa[d]?.pendentes_geradas || 0,
    ticket_medio: mapa[d]?.ticket_medio || 0,
  }));
}

// Ultimas N vendas do dia pra tabela auditoria (igual aba do dashboard)
async function hotmart_ultimas_vendas(from_iso, to_iso, limite = 50, moeda = 'BRL') {
  const janela = janelaBRTRange(from_iso, to_iso);
  const moedaSafe = String(moeda).replace(/'/g, "''");

  const sql = `
    SELECT
      t.transaction_code,
      coalesce(b.name, '(sem nome)') AS comprador_nome,
      coalesce(b.email, '') AS comprador_email,
      coalesce(p.name, '(sem produto)') AS produto,
      t.my_commission AS receita,
      t.my_commission_usd AS receita_usd,
      t.price_value AS valor_total,
      t.price_currency AS moeda,
      t.payment_type,
      t.status,
      t.purchase_date
    FROM hotmart_transactions t
    LEFT JOIN hotmart_buyers b ON b.id = t.buyer_id
    LEFT JOIN hotmart_products p ON p.id = t.product_id
    WHERE t.price_currency = '${moedaSafe}'
      AND t.purchase_date >= '${janela.from_utc}'
      AND t.purchase_date <  '${janela.to_utc}'
    ORDER BY t.purchase_date DESC
    LIMIT ${parseInt(limite, 10)};
  `;
  const rows = await rodarSQL(sql);

  return rows.map(r => ({
    transaction_code: r.transaction_code,
    comprador_nome: r.comprador_nome,
    comprador_email: r.comprador_email,
    produto: r.produto,
    receita: parseFloat(r.receita || 0),
    receita_usd: parseFloat(r.receita_usd || 0),
    valor_total: parseFloat(r.valor_total || 0),
    moeda: r.moeda,
    payment_type: r.payment_type,
    status: r.status,
    purchase_date: r.purchase_date,
  }));
}

// Receita Hotmart consolidada em USD (soma my_commission_usd em todas as moedas)
// pra mostrar separado o card "Receita USD" como o dashboard mostra
async function hotmart_receita_usd_range(from_iso, to_iso) {
  const janela = janelaBRTRange(from_iso, to_iso);

  const sql = `
    SELECT
      coalesce(sum(my_commission_usd) FILTER (WHERE status IN ('approved','completed')), 0) AS receita_usd_total,
      count(*) FILTER (WHERE status IN ('approved','completed') AND price_currency != 'BRL') AS vendas_internacionais
    FROM hotmart_transactions
    WHERE purchase_date >= '${janela.from_utc}'
      AND purchase_date <  '${janela.to_utc}';
  `;
  const [r] = await rodarSQL(sql);

  return {
    receita_usd_total: parseFloat(r.receita_usd_total || 0),
    vendas_internacionais: parseInt(r.vendas_internacionais || 0, 10),
  };
}

module.exports = {
  rodarSQL,
  obterCredenciais,
  janelaBRT,
  janelaBRTRange,
  janelaUltimosNDias,
  ontemBRT,
  carregarConfigsAtivos,
  categorizarProductIds,
  keywordsAtivas,
  resumo_dia,
  resumo_com_comparacao,
  faturamento_diario,
  listar_produtos,
  // V2.15.2 Meta Ads detalhado
  meta_kpis_range,
  hotmart_faturamento_range,
  meta_por_conta,
  meta_top_campanhas,
  meta_serie_diaria,
  hotmart_serie_diaria,
  // V2.15.3 Hotmart Diário detalhado
  hotmart_kpis_range,
  hotmart_top_produtos_range,
  hotmart_breakdown_pagamento,
  hotmart_compradores_suspeitos,
  hotmart_assinaturas_snapshot,
  hotmart_serie_diaria_rica,
  hotmart_ultimas_vendas,
  hotmart_receita_usd_range,
};
