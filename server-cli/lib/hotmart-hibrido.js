// ============================================================
// hotmart-hibrido.js — V2.14 D Categoria G
// ============================================================
// Camada híbrida que decide ENTRE 2º Supabase (db-dashboard) e API direta
// Hotmart (lib/hotmart.js) pra cada operação:
//
// LEITURAS DE COMPRA (transações):
//   1. Tenta 2º Supabase primeiro (rápido, sem token, dados webhook)
//   2. Se vazio → fallback API direta Hotmart Sales API
//   3. Retorna estrutura unificada
//
// ESCRITAS (refund, cupom, assinatura):
//   → SEMPRE API direta (Hotmart é fonte da verdade)
//
// ⚠ REGRA DURA — NÃO MISTURAR "compra" COM "acesso a área de membros":
//   Andre 2026-05-10 pegou furo: agente dizia "tem acesso a 2 áreas" baseado
//   em transações COMPLETE no Supabase. Errado. Compra ≠ acesso atual.
//   Aluno pode ter sido removido manualmente do Club, ou cadastrado em
//   produto-bônus que não está nas transações. Estado real de acesso só
//   vem da Members Area API (Club) — que precisa habilitação separada na
//   credencial Hotmart (pendente de solicitação 2026-05-10).
//
//   Enquanto Members Area API NÃO está disponível, esta camada SÓ retorna
//   dados de TRANSAÇÃO (o que comprou, quando, status da venda). Agente
//   declara honesto que não tem como confirmar acesso/login real.
// ============================================================

const dashboard = require('./db-dashboard');
const hotmart = require('./hotmart');

// ============================================================
// G1 — Consultar comprador por email (histórico completo)
// Tenta 2º Supabase primeiro. Se vazio, API direta.
// ============================================================
async function consultarCompradorPorEmail({ email }) {
  if (!email) throw new Error('email obrigatório');

  const fontes = { supabase: null, hotmart_api: null };
  const t0 = Date.now();

  // 1. Tenta 2º Supabase
  try {
    const sqlBuyer = `
      SELECT id, email, name, document, phone, country_name, first_purchase_at, created_at
      FROM hotmart_buyers
      WHERE lower(email) = lower('${email.replace(/'/g, "''")}')
      LIMIT 1;
    `;
    const buyers = await dashboard.rodarSQL(sqlBuyer);
    if (Array.isArray(buyers) && buyers.length > 0) {
      const buyer = buyers[0];
      const sqlVendas = `
        SELECT t.transaction_code, t.status, t.payment_type, t.price_value, t.price_currency,
               t.my_commission, t.purchase_date, t.approved_date, t.refund_date,
               t.is_order_bump, p.name AS produto_nome, p.hotmart_product_id
        FROM hotmart_transactions t
        LEFT JOIN hotmart_products p ON p.id = t.product_id
        WHERE t.buyer_id = '${buyer.id}'
        ORDER BY t.purchase_date DESC
        LIMIT 100;
      `;
      const vendas = await dashboard.rodarSQL(sqlVendas);
      fontes.supabase = {
        comprador: {
          email: buyer.email,
          nome: buyer.name,
          documento: buyer.document,
          telefone: buyer.phone,
          pais: buyer.country_name,
          primeira_compra: buyer.first_purchase_at,
        },
        vendas: vendas.map(v => ({
          transaction_code: v.transaction_code,
          produto: v.produto_nome,
          produto_id: v.hotmart_product_id,
          status: v.status,
          valor: parseFloat(v.price_value || 0),
          moeda: v.price_currency,
          comissao: parseFloat(v.my_commission || 0),
          data_compra: v.purchase_date,
          data_aprovacao: v.approved_date,
          data_reembolso: v.refund_date,
          forma_pagamento: v.payment_type,
          eh_order_bump: v.is_order_bump,
        })),
        total_vendas: vendas.length,
        latencia_ms: Date.now() - t0,
      };
      // Se achou no Supabase, retorna direto (rápido). Sem fallback API.
      return {
        ok: true,
        fonte: 'supabase',
        ...fontes.supabase,
        aviso_escopo: 'ESTES DADOS SÃO DE TRANSAÇÕES DE COMPRA, NÃO DE ESTADO DE ACESSO REAL. Para confirmar acesso ativo à área de membros (Club), STATUS, último login e progresso, USE a função verificarAcessoAreaMembros (G4b) — ela consulta a Members Area API real. NÃO afirmar "tem acesso" baseado só em compra.',
      };
    }
  } catch (e) {
    console.warn(`[hotmart-hibrido] Supabase falhou pra ${email}: ${e.message}`);
  }

  // 2. Fallback API direta Hotmart
  try {
    const t1 = Date.now();
    const r = await hotmart.listarVendas({
      buyer_email: email,
      transaction_status: 'APPROVED,COMPLETE,REFUNDED,CHARGEBACK,CANCELLED',
      max_results: 100,
    });
    const items = r.items || [];
    if (items.length === 0) {
      return { ok: true, fonte: 'hotmart_api', comprador: null, vendas: [], total_vendas: 0, latencia_ms: Date.now() - t0, motivo: 'Email nao tem compra registrada na Hotmart' };
    }
    const primeira = items[0];
    return {
      ok: true,
      fonte: 'hotmart_api',
      comprador: {
        email: primeira.buyer?.email || email,
        nome: primeira.buyer?.name || null,
        documento: primeira.buyer?.document || null,
        telefone: primeira.buyer?.phone || null,
      },
      vendas: items.map(it => ({
        transaction_code: it.purchase?.transaction,
        produto: it.product?.name,
        produto_id: it.product?.id,
        status: it.purchase?.status,
        valor: it.purchase?.price?.value,
        moeda: it.purchase?.price?.currency_value || it.purchase?.price?.currency_code,
        data_compra: it.purchase?.order_date,
        data_aprovacao: it.purchase?.approved_date,
        forma_pagamento: it.purchase?.payment?.method,
      })),
      total_vendas: items.length,
      latencia_ms: Date.now() - t1,
      aviso_escopo: 'ESTES DADOS SÃO DE TRANSAÇÕES DE COMPRA, NÃO DE ESTADO DE ACESSO REAL. Para confirmar acesso ativo à área de membros (Club), STATUS, último login e progresso, USE a função verificarAcessoAreaMembros (G4b) — ela consulta a Members Area API real. NÃO afirmar "tem acesso" baseado só em compra.',
    };
  } catch (e) {
    return { ok: false, fonte: 'hotmart_api', error: e.message, latencia_ms: Date.now() - t0 };
  }
}

// ============================================================
// G2 — Listar vendas por período (Supabase é mais rico aqui)
// ============================================================
async function listarVendasPorPeriodo({ start_date_brt, end_date_brt, produto_id, status, moeda = 'BRL' }) {
  if (!start_date_brt || !end_date_brt) throw new Error('start_date_brt e end_date_brt obrigatórios (YYYY-MM-DD)');

  // Supabase é fonte autoritativa pro time financeiro (Pedro mantém)
  try {
    const fromUtc = `${start_date_brt}T03:00:00Z`;
    const toUtc = new Date(`${end_date_brt}T03:00:00Z`);
    toUtc.setUTCDate(toUtc.getUTCDate() + 1);
    const toUtcStr = toUtc.toISOString();

    const filtros = [
      `price_currency = '${moeda.replace(/'/g, "''")}'`,
      `purchase_date >= '${fromUtc}'`,
      `purchase_date < '${toUtcStr}'`,
    ];
    if (status) {
      const stArr = String(status).split(',').map(s => `'${s.trim().toLowerCase().replace(/'/g, "''")}'`).join(',');
      filtros.push(`status IN (${stArr})`);
    } else {
      filtros.push(`status IN ('approved','completed')`);
    }
    if (produto_id) {
      filtros.push(`product_id = '${produto_id.replace(/'/g, "''")}'`);
    }

    const sql = `
      SELECT t.transaction_code, t.status, t.price_value, t.my_commission, t.purchase_date,
             t.payment_type, t.is_order_bump, p.name AS produto_nome, b.email AS buyer_email, b.name AS buyer_name
      FROM hotmart_transactions t
      LEFT JOIN hotmart_products p ON p.id = t.product_id
      LEFT JOIN hotmart_buyers b ON b.id = t.buyer_id
      WHERE ${filtros.join(' AND ')}
      ORDER BY t.purchase_date DESC
      LIMIT 500;
    `;
    const rows = await dashboard.rodarSQL(sql);
    return {
      ok: true,
      fonte: 'supabase',
      total: rows.length,
      receita_total: rows.reduce((s, r) => s + parseFloat(r.my_commission || 0), 0),
      vendas: rows.map(r => ({
        transaction_code: r.transaction_code,
        produto: r.produto_nome,
        buyer_email: r.buyer_email,
        buyer_name: r.buyer_name,
        status: r.status,
        valor: parseFloat(r.price_value || 0),
        comissao: parseFloat(r.my_commission || 0),
        data_compra: r.purchase_date,
        forma_pagamento: r.payment_type,
        eh_order_bump: r.is_order_bump,
      })),
    };
  } catch (e) {
    return { ok: false, error: e.message, fonte: 'supabase' };
  }
}

// ============================================================
// G3 — Listar reembolsos (período BRT)
// ============================================================
async function listarReembolsosPorPeriodo({ start_date_brt, end_date_brt, moeda = 'BRL' }) {
  return await listarVendasPorPeriodo({ start_date_brt, end_date_brt, status: 'refunded', moeda });
}

// ============================================================
// G4 — Verificar se assinatura está ativa
// (Supabase não tem tabela de subscriptions sincronizada, vai direto API)
// ============================================================
async function verificarAssinaturaAtiva({ email, produto_id }) {
  if (!email) throw new Error('email obrigatório');
  try {
    const r = await hotmart.listarAssinaturas({
      subscriber_email: email,
      product_id: produto_id,
      status: 'ACTIVE',
      max_results: 50,
    });
    const items = r.items || [];
    return {
      ok: true,
      fonte: 'hotmart_api',
      ativa: items.length > 0,
      total_ativas: items.length,
      assinaturas: items.map(s => ({
        subscriber_code: s.subscriber?.code,
        produto: s.product?.name,
        produto_id: s.product?.id,
        plano: s.plan?.name,
        status: s.status,
        proxima_cobranca: s.date_next_charge,
        criada_em: s.accession_date,
      })),
    };
  } catch (e) {
    return { ok: false, error: e.message, fonte: 'hotmart_api' };
  }
}

// ============================================================
// G4b — Verificar acesso REAL à área de membros (Members Area API)
// ============================================================
// V2.14 D 2026-05-10: investigação real descobriu que Members Area API
// usa MESMO Bearer token (não precisava habilitação extra). Bug do SDK
// Python era chamar /students (404) em vez de /users.
//
// Endpoint correto: GET /club/api/v1/users?subdomain=<sub>&email=<email>
// Cobre acesso real, último login, status, progresso, engajamento.
//
// Subdomain por produto vem de pinguim.hotmart_clubs (tabela cadastrada
// pelo sócio quando descobre via URL https://hotmart.com/pt-br/club/SLUG/products/...).
// Subdomain real = SLUG sem hífen. Ex: 'proalt' (URL e subdomain coincidem).
//
// Cadastro de aluno (POST /users) NÃO existe na API — caso Princípia Pay
// continua via G8 (ticket suporte humano).
async function verificarAcessoAreaMembros({ email, produto_id }) {
  if (!email) throw new Error('email obrigatório');
  const club = require('./hotmart-club');
  try {
    const r = await club.buscarAlunoEmTodosClubs({ email });
    return {
      ok: true,
      fonte: 'hotmart_club_api',
      ...r,
    };
  } catch (e) {
    return {
      ok: false,
      fonte: 'hotmart_club_api',
      error: e.message,
      sugestao: 'Falha consultando Members Area API. Pra confirmar manualmente: https://app-vlc.hotmart.com → Hotmart Club → buscar pelo email.',
    };
  }
}

module.exports = {
  consultarCompradorPorEmail,
  listarVendasPorPeriodo,
  listarReembolsosPorPeriodo,
  verificarAssinaturaAtiva,
  verificarAcessoAreaMembros,
};
