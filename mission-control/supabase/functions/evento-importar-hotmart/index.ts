// Edge Function: evento-importar-hotmart
// POST /functions/v1/evento-importar-hotmart
// Headers: Authorization: Bearer <EVENTO_TOKEN>
//
// Pré-importa compradores dos produtos do evento (banco Dashboard, ref
// lkrehtmdqkgkyyotvjpz) pra vendas_eventos.hotmart_cache. Busca no evento
// vira local/instantânea (offline-first), sem depender de wifi bom no dia.
//
// Body: { evento_id?: uuid, product_ids?: number[] }
//   - se evento_id vier, usa product_ids do evento (fallback pro body)
//   - re-sync seguro: UPSERT por transaction_code (não duplica)
//
// Lê DASHBOARD_PROJECT_REF/DASHBOARD_ACCESS_TOKEN do cofre e roda SQL
// read-only via Management API (mesmo mecanismo do lib/db-dashboard.js).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { validarTokenEvento, corsEvento, jsonEvento, sbEventos } from '../_shared/auth-evento.ts';

async function rodarSQLDashboard(sql: string): Promise<any[]> {
  const [ref, token] = await Promise.all([
    getChave('DASHBOARD_PROJECT_REF', 'evento-importar'),
    getChave('DASHBOARD_ACCESS_TOKEN', 'evento-importar'),
  ]);
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Dashboard SQL erro ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsEvento });
  if (req.method !== 'POST') return jsonEvento({ erro: 'Use POST' }, 405);

  const auth = await validarTokenEvento(req);
  if (!auth.ok) return jsonEvento({ erro: 'Token invalido ou ausente' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* body opcional */ }

  const sb = sbEventos();

  // Resolve product_ids: do evento (se veio evento_id) ou do body
  let productIds: number[] = Array.isArray(body.product_ids) ? body.product_ids : [];
  const eventoId: string | null = body.evento_id || null;

  if (eventoId && !productIds.length) {
    const { data: eventos, error } = await sb.rpc('ve_listar_eventos');
    if (error) return jsonEvento({ erro: 'Falha lendo eventos: ' + error.message }, 500);
    const ev = (eventos || []).find((e: any) => e.id === eventoId);
    if (!ev) return jsonEvento({ erro: 'evento_id nao encontrado' }, 404);
    if (Array.isArray(ev.product_ids) && ev.product_ids.length) productIds = ev.product_ids;
  }

  productIds = productIds.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (!productIds.length) {
    return jsonEvento({ erro: 'Sem product_ids — passe no body ou configure no evento' }, 400);
  }

  // Puxa compradores do banco Dashboard: transações dos produtos + dados do buyer.
  // Status aprovado/completo (quem realmente pagou).
  const idsSql = productIds.join(',');
  const sql = `
    SELECT
      t.transaction_code, t.status, t.price_value, t.purchase_date,
      p.hotmart_product_id AS product_id, p.name AS produto_nome,
      b.name AS nome, b.email, b.document AS cpf, b.phone AS telefone
    FROM hotmart_transactions t
    JOIN hotmart_products p ON p.id = t.product_id
    LEFT JOIN hotmart_buyers b ON b.id = t.buyer_id
    WHERE p.hotmart_product_id IN (${idsSql})
      AND lower(t.status) IN ('approved','completed','complete')
    ORDER BY t.purchase_date DESC
    LIMIT 5000;
  `;

  let rows: any[];
  try {
    rows = await rodarSQLDashboard(sql);
  } catch (e) {
    return jsonEvento({ erro: 'Falha lendo Dashboard: ' + (e as Error).message }, 502);
  }

  if (!Array.isArray(rows) || !rows.length) {
    return jsonEvento({ ok: true, importados: 0, nota: 'Nenhuma compra encontrada pros produtos', product_ids: productIds }, 200);
  }

  // Nomes de produto encontrados (útil pra confirmar o 8103827)
  const produtos: Record<string, string> = {};
  for (const r of rows) if (r.product_id) produtos[String(r.product_id)] = r.produto_nome;

  // UPSERT no cache por transaction_code
  const registros = rows.map((r) => ({
    evento_id: eventoId,
    product_id: Number(r.product_id),
    produto_nome: r.produto_nome ?? null,
    transaction_code: r.transaction_code,
    status: r.status ?? null,
    nome: r.nome ?? null,
    email: r.email ?? null,
    cpf: r.cpf ?? null,
    telefone: r.telefone ?? null,
    valor: r.price_value != null ? Number(r.price_value) : null,
    data_compra: r.purchase_date ?? null,
  }));

  const { data: n, error: upErr } = await sb.rpc('ve_upsert_cache', { p_registros: registros });
  if (upErr) return jsonEvento({ erro: 'Falha no upsert do cache: ' + upErr.message }, 500);

  return jsonEvento({
    ok: true,
    importados: n ?? registros.length,
    product_ids: productIds,
    produtos_encontrados: produtos,   // ex.: { "8103827": "Nome do Produto", "2605400": "Taurus Mentoring" }
  }, 200);
});
