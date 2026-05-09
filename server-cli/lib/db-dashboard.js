// ============================================================
// db-dashboard.js — V2.14 (read-only do 2o Supabase de dashboard)
// ============================================================
// Wrapper de queries Supabase Management API pro projeto SEPARADO
// que tem dados de venda Hotmart + Ads Meta (ID lkrehtmdqkgkyyotvjpz).
//
// Espelha lib/db.js mas:
// - SO LE (nenhuma operacao de escrita)
// - Usa credenciais DASHBOARD_* (nao SUPABASE_*) lidas do cofre Pinguim
//   (pinguim.cofre_chaves), nao do .env.local
//
// Princ 12: funciona identico no servidor V3 — credenciais ja vivem no
// banco compartilhado, nao precisam de .env.local em cada maquina.
//
// Padrao de uso:
//   const dash = require('./db-dashboard');
//   const dias = await dash.faturamento_dia(7);  // ultimos 7 dias
// ============================================================

const db = require('./db');

// Cache do par (project_ref, token) pra nao bater no cofre toda chamada.
// TTL 1h (token nao rotaciona com frequencia).
let _cache = { project_ref: null, token: null, expira_em_ms: 0 };

async function obterCredenciais() {
  if (_cache.project_ref && _cache.expira_em_ms > Date.now()) {
    return { project_ref: _cache.project_ref, token: _cache.token };
  }
  const [project_ref, token] = await Promise.all([
    db.lerChaveSistema('DASHBOARD_PROJECT_REF', 'db-dashboard'),
    db.lerChaveSistema('DASHBOARD_ACCESS_TOKEN', 'db-dashboard'),
  ]);
  if (!project_ref || !token) {
    throw new Error('DASHBOARD_PROJECT_REF/DASHBOARD_ACCESS_TOKEN nao encontrados no cofre. V2.14: Andre passou em 2026-05-09 — verificar pinguim.cofre_chaves.');
  }
  _cache = {
    project_ref, token,
    expira_em_ms: Date.now() + 60 * 60 * 1000, // 1h
  };
  return { project_ref, token };
}

// Roda SQL arbitrario READ-ONLY no 2o Supabase.
// Bloqueia statements de escrita por defesa em profundidade
// (mesmo que o token seja read-only, evita acidentes).
async function rodarSQL(sql) {
  const banido = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy)\b/i;
  if (banido.test(sql)) {
    throw new Error(`db-dashboard e READ-ONLY. SQL bloqueado: ${sql.slice(0, 100)}`);
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
// CONSULTAS PRONTAS (Skill `gerar-relatorio-financeiro` usa)
// ============================================================
//
// Premissa documentada em docs/racional-dashboard.md (V2.14):
// - Venda PAGA REAL = status IN ('completed', 'approved')
//   ('approved' = recem-aprovado Hotmart, ainda nao virou 'completed' mas
//   ja conta como receita confirmada porque ja foi cobrado)
// - Reembolso = refund_date IS NOT NULL OR status = 'refunded'
// - Faturamento bruto = sum(price_value)
//   ATENCAO: price_value vem em moedas diferentes (BRL/USD/EUR).
//   Skill DEVE filtrar/agrupar por price_currency.
// - Comissao do produtor = my_commission (na moeda original) ou
//   my_commission_usd (normalizado)
// - Gasto Ads de 1 dia = sum(spend) FILTER (WHERE nivel='campaign' AND data=X)
//   (campaign agrega ad+adset; usar account nao funciona — nao existe esse nivel)
// - ROAS = receita / gasto Ads (calcular fora se quiser cross-source)
// ============================================================

const STATUS_VENDA_REAL = ['completed', 'approved'];
const STATUS_REEMBOLSO = ['refunded'];

// ============================================================
// API publica
// ============================================================

// Faturamento agregado dos ultimos N dias.
// Retorna [{dia, qtd_vendas, faturamento_brl, faturamento_usd, ...}]
async function faturamento_diario(dias = 7, moeda_filtro = null) {
  const filtroMoeda = moeda_filtro
    ? `AND price_currency = '${String(moeda_filtro).replace(/'/g, "''")}'`
    : '';
  const sql = `
    SELECT
      date_trunc('day', purchase_date)::date AS dia,
      count(*) AS qtd_vendas,
      sum(price_value) FILTER (WHERE price_currency = 'BRL') AS faturamento_brl,
      sum(price_value) FILTER (WHERE price_currency = 'USD') AS faturamento_usd,
      sum(price_value) FILTER (WHERE price_currency = 'EUR') AS faturamento_eur,
      sum(my_commission_usd) AS comissao_total_usd,
      array_agg(DISTINCT price_currency) AS moedas
    FROM hotmart_transactions
    WHERE status IN ('completed', 'approved')
      AND purchase_date >= CURRENT_DATE - INTERVAL '${parseInt(dias, 10)} days'
      ${filtroMoeda}
    GROUP BY 1
    ORDER BY dia DESC;
  `;
  return await rodarSQL(sql);
}

// Vendas detalhadas de UM dia especifico (ontem por padrao).
// Inclui produto e modo de pagamento.
async function vendas_do_dia(data_iso = null) {
  const data = data_iso || 'CURRENT_DATE - 1';
  const dataExpr = data_iso
    ? `'${String(data_iso).replace(/'/g, "''")}'::date`
    : `(CURRENT_DATE - 1)`;
  const sql = `
    SELECT
      t.purchase_date,
      t.transaction_code,
      t.status,
      t.payment_type,
      t.payment_installments,
      t.price_value,
      t.price_currency,
      t.my_commission,
      t.is_order_bump,
      p.name AS produto_nome,
      p.hotmart_product_id
    FROM hotmart_transactions t
    LEFT JOIN hotmart_products p ON p.id = t.product_id
    WHERE t.status IN ('completed', 'approved')
      AND t.purchase_date::date = ${dataExpr}
    ORDER BY t.purchase_date DESC;
  `;
  return await rodarSQL(sql);
}

// Reembolsos dos ultimos N dias (data do refund_date)
async function reembolsos_periodo(dias = 7) {
  const sql = `
    SELECT
      date_trunc('day', refund_date)::date AS dia,
      count(*) AS qtd,
      sum(price_value) FILTER (WHERE price_currency = 'BRL') AS valor_brl,
      sum(price_value) FILTER (WHERE price_currency = 'USD') AS valor_usd,
      sum(price_value) FILTER (WHERE price_currency = 'EUR') AS valor_eur,
      array_agg(DISTINCT (SELECT name FROM hotmart_products WHERE id = product_id)) AS produtos_reembolsados
    FROM hotmart_transactions
    WHERE refund_date IS NOT NULL
      AND refund_date >= CURRENT_DATE - INTERVAL '${parseInt(dias, 10)} days'
    GROUP BY 1
    ORDER BY dia DESC;
  `;
  return await rodarSQL(sql);
}

// Gasto Ads agregado por dia (nivel campaign — agrega ad+adset)
async function ads_diario(dias = 7) {
  const sql = `
    SELECT
      data AS dia,
      sum(spend) AS gasto_total,
      sum(impressions) AS impressoes,
      sum(clicks) AS cliques,
      avg(NULLIF(ctr, 0)) AS ctr_medio,
      avg(purchase_roas) FILTER (WHERE purchase_roas > 0) AS roas_medio,
      count(DISTINCT entity_id) AS qtd_campanhas
    FROM metricas_diarias
    WHERE data >= CURRENT_DATE - INTERVAL '${parseInt(dias, 10)} days'
      AND nivel = 'campaign'
    GROUP BY data
    ORDER BY data DESC;
  `;
  return await rodarSQL(sql);
}

// Gasto Ads detalhado de UM dia (por campanha/conta)
async function ads_do_dia(data_iso = null) {
  const dataExpr = data_iso
    ? `'${String(data_iso).replace(/'/g, "''")}'::date`
    : `(CURRENT_DATE - 1)`;
  const sql = `
    SELECT
      m.entity_id AS campaign_id,
      m.entity_name AS campaign_name,
      c.nome AS conta_nome,
      m.spend,
      m.impressions,
      m.clicks,
      m.ctr,
      m.cpc,
      m.purchase_roas
    FROM metricas_diarias m
    LEFT JOIN contas c ON c.id = m.conta_id
    WHERE m.data = ${dataExpr}
      AND m.nivel = 'campaign'
    ORDER BY m.spend DESC;
  `;
  return await rodarSQL(sql);
}

// Resumo executivo de UM dia (cross-source) — junta vendas + reembolsos + ads
// Estrutura PRONTA pra Skill `compor-executivo-diario` consumir.
async function resumo_dia(data_iso = null) {
  const dataExpr = data_iso
    ? `'${String(data_iso).replace(/'/g, "''")}'::date`
    : `(CURRENT_DATE - 1)`;
  const sql = `
    WITH vendas AS (
      SELECT
        count(*) AS qtd_vendas,
        sum(price_value) FILTER (WHERE price_currency = 'BRL') AS fat_brl,
        sum(my_commission_usd) AS comissao_usd,
        avg(price_value) FILTER (WHERE price_currency = 'BRL') AS ticket_medio_brl
      FROM hotmart_transactions
      WHERE status IN ('completed', 'approved')
        AND purchase_date::date = ${dataExpr}
    ),
    reembolsos AS (
      SELECT
        count(*) AS qtd,
        sum(price_value) FILTER (WHERE price_currency = 'BRL') AS valor_brl
      FROM hotmart_transactions
      WHERE refund_date::date = ${dataExpr}
    ),
    ads AS (
      SELECT
        sum(spend) AS gasto_total,
        sum(clicks) AS cliques,
        avg(NULLIF(purchase_roas, 0)) AS roas_medio
      FROM metricas_diarias
      WHERE data = ${dataExpr}
        AND nivel = 'campaign'
    ),
    top_produtos AS (
      SELECT json_agg(json_build_object(
        'produto', p.name,
        'qtd', sub.qtd,
        'fat_brl', sub.fat
      )) AS top
      FROM (
        SELECT product_id, count(*) AS qtd, sum(price_value) FILTER (WHERE price_currency='BRL') AS fat
        FROM hotmart_transactions
        WHERE status IN ('completed', 'approved')
          AND purchase_date::date = ${dataExpr}
        GROUP BY product_id
        ORDER BY fat DESC NULLS LAST
        LIMIT 5
      ) sub
      LEFT JOIN hotmart_products p ON p.id = sub.product_id
    )
    SELECT
      ${dataExpr} AS dia,
      v.qtd_vendas, v.fat_brl, v.comissao_usd, v.ticket_medio_brl,
      r.qtd AS reembolsos_qtd, r.valor_brl AS reembolsos_brl,
      a.gasto_total AS ads_gasto, a.cliques AS ads_cliques, a.roas_medio AS ads_roas_medio,
      tp.top AS top_produtos,
      CASE WHEN a.gasto_total > 0 THEN v.fat_brl / a.gasto_total ELSE NULL END AS roas_calculado
    FROM vendas v, reembolsos r, ads a, top_produtos tp;
  `;
  const r = await rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// Lista de produtos cadastrados (uuid -> nome) — util pra Skills humanizarem output
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
  STATUS_VENDA_REAL,
  STATUS_REEMBOLSO,
  faturamento_diario,
  vendas_do_dia,
  reembolsos_periodo,
  ads_diario,
  ads_do_dia,
  resumo_dia,
  listar_produtos,
};
