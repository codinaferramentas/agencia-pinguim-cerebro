// crm-sync-renovacao — espelha assinaturas Hotmart + boletos Principia do Dash -> base CRM (pinguim).
// Alimenta o Kanban de Renovação e o Financeiro: crm_assinatura (status/vigência) e crm_boleto (financiamento).
// Roda 2x/dia (pg_cron) — esses dados mudam devagar (recorrência mensal/financiamento), não precisa 1/min.
// Marca d'água por fonte em crm_sync_estado (updated_at > marca), igual crm-sync-vendas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// le a marca d'agua da fonte; se nao existe, cria a linha e volta -30d (primeira carga incremental)
async function marca(fonte: string): Promise<string> {
  const { data } = await sb.from('crm_sync_estado').select('ultima_marca').eq('fonte', fonte).maybeSingle();
  if (data?.ultima_marca) return data.ultima_marca;
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  await sb.from('crm_sync_estado').upsert({ fonte, ultima_marca: desde }, { onConflict: 'fonte' });
  return desde;
}
async function avancarMarca(fonte: string, maxMarca: string, n: number) {
  await sb.from('crm_sync_estado').update({
    ultima_marca: maxMarca, ultima_rodada: new Date().toISOString(), itens_ultima: n, atualizado_em: new Date().toISOString(),
  }).eq('fonte', fonte);
}

// puxa paginado do Dash o que mudou desde a marca (updated_at asc) — drena backlog em paginas de 500
async function puxarDoDash(dashUrl: string, dashKey: string, tabela: string, select: string, desde: string): Promise<any[]> {
  const todas: any[] = [];
  let corte = desde;
  for (let pagina = 0; pagina < 40; pagina++) { // teto de 20k linhas/rodada — folga enorme
    const url = `${dashUrl}/rest/v1/${tabela}?select=${select}&updated_at=gt.${encodeURIComponent(corte)}&order=updated_at.asc&limit=500`;
    const r = await fetch(url, { headers: { apikey: dashKey, Authorization: `Bearer ${dashKey}` } });
    if (!r.ok) throw new Error(`Dash ${tabela} ${r.status}`);
    const lote = await r.json();
    if (!lote.length) break;
    todas.push(...lote);
    corte = lote[lote.length - 1].updated_at;
    if (lote.length < 500) break;
  }
  return todas;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const t0 = Date.now();
  try {
    const dashUrl = await getChave('DASHBOARD_URL', 'crm-sync-renovacao');
    const dashKey = await getChave('DASHBOARD_SERVICE_ROLE_KEY', 'crm-sync-renovacao');
    const agora = new Date().toISOString();

    // ===== 1) ASSINATURAS Hotmart (status + vigência) =====
    const mAssin = await marca('dash_assinaturas');
    const assinFonte = await puxarDoDash(
      dashUrl, dashKey, 'hotmart_subscriptions',
      'subscriber_code,buyer_id,product_id,plan_name,status,next_charge_date,started_at,canceled_at,updated_at',
      mAssin,
    );
    let maxAssin = mAssin;
    if (assinFonte.length) {
      // chave natural = subscriber_code (único por assinatura; (buyer,product) repete em re-assinatura).
      // NÃO enviamos id: é identity ALWAYS no destino (gerado pelo banco).
      const rows = assinFonte
        .filter((s: any) => s.subscriber_code)
        .map((s: any) => {
          if (s.updated_at > maxAssin) maxAssin = s.updated_at;
          return {
            subscriber_code: String(s.subscriber_code),
            buyer_id: s.buyer_id ? String(s.buyer_id) : null,
            product_id: s.product_id ? String(s.product_id) : null,
            plan_name: s.plan_name || null,
            status: s.status || null,
            next_charge_date: s.next_charge_date || null,
            started_at: s.started_at || null,
            canceled_at: s.canceled_at || null,
            sincronizado_em: agora,
          };
        });
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('crm_assinatura').upsert(rows.slice(i, i + 500), { onConflict: 'subscriber_code' });
        if (error) throw new Error(`upsert assinatura: ${error.message}`);
      }
      await avancarMarca('dash_assinaturas', maxAssin, assinFonte.length);
    } else {
      await sb.from('crm_sync_estado').update({ ultima_rodada: agora, itens_ultima: 0 }).eq('fonte', 'dash_assinaturas');
    }

    // ===== 2) BOLETOS/FINANCIAMENTO Principia =====
    const mBol = await marca('dash_boletos');
    const bolFonte = await puxarDoDash(
      dashUrl, dashKey, 'boleto_transactions',
      'sale_id,buyer_email,buyer_document,product_name,price,payment_method,payment_due_date,status,financing_installments,financing_current_step,payment_url,made_effective_at,canceled_at,updated_at',
      mBol,
    );
    let maxBol = mBol;
    if (bolFonte.length) {
      // chave natural = sale_id (UNIQUE no destino). id é identity ALWAYS, não enviar.
      const rows = bolFonte
        .filter((b: any) => b.sale_id)
        .map((b: any) => {
        if (b.updated_at > maxBol) maxBol = b.updated_at;
        return {
          sale_id: String(b.sale_id),
          buyer_email: b.buyer_email ? String(b.buyer_email).trim().toLowerCase() : null,
          buyer_document: b.buyer_document ? String(b.buyer_document).replace(/\D/g, '') : null,
          product_name: b.product_name || null,
          price: b.price ?? null,
          payment_method: b.payment_method || null,
          payment_due_date: b.payment_due_date || null,
          status: b.status || null,
          installments: b.financing_installments ?? null,
          current_step: b.financing_current_step || null,
          payment_url: b.payment_url || null,
          made_effective_at: b.made_effective_at || null,
          canceled_at: b.canceled_at || null,
          sincronizado_em: agora,
        };
      });
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('crm_boleto').upsert(rows.slice(i, i + 500), { onConflict: 'sale_id' });
        if (error) throw new Error(`upsert boleto: ${error.message}`);
      }
      await avancarMarca('dash_boletos', maxBol, bolFonte.length);
    } else {
      await sb.from('crm_sync_estado').update({ ultima_rodada: agora, itens_ultima: 0 }).eq('fonte', 'dash_boletos');
    }

    return json({
      ok: true,
      assinaturas: assinFonte.length, ate_assin: maxAssin,
      boletos: bolFonte.length, ate_bol: maxBol,
      ms: Date.now() - t0,
    });
  } catch (e) {
    console.error('crm-sync-renovacao erro', e);
    return json({ ok: false, erro: String(e) }, 500);
  }
});
