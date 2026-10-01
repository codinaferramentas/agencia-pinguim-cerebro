// crm-sync-vendas — sincronizador TEMPO REAL de vendas Dash -> base CRM (pinguim).
// Roda a cada 1 min (pg_cron). Le do Dash o que mudou desde a ultima marca d'agua,
// resolve o cliente (email/telefone/documento), faz upsert em crm_compra com
// TRANSICAO DE STATUS (aprovado->reembolsado na mesma transacao nao congela).
// Le do Dash (que ja recebe da Hotmart em tempo real) — nao depende de configurar Hotmart.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';
import { variantesTelefoneBR } from '../_shared/telefone-br.ts';

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

function telCanon(s: string | null): string | null {
  const d = String(s || '').replace(/\D/g, '');
  let n = d;
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) n = n.slice(2);
  if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
  else if (n.length === 11 && n[2] !== '9') n = n.slice(-10);
  return n.length >= 10 ? n : null;
}
function normEmail(s: string | null): string { return String(s || '').trim().toLowerCase(); }
const FAM: Record<string, string> = {}; // opcional: mapa produto->familia (carregado se precisar)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const t0 = Date.now();
  try {
    // 1) marca d'agua
    const { data: est } = await sb.from('crm_sync_estado').select('ultima_marca').eq('fonte', 'dash_compras').single();
    const desde = est?.ultima_marca || new Date(Date.now() - 2 * 864e5).toISOString();

    // 2) credenciais Dash (cofre)
    const dashUrl = await getChave('DASHBOARD_URL', 'crm-sync-vendas');
    const dashKey = await getChave('DASHBOARD_SERVICE_ROLE_KEY', 'crm-sync-vendas');

    // 3) puxa transacoes do Dash com updated_at > marca (inclui novas E mudancas de status).
    // limit 150/rodada — em regime 1/min sao poucas; se houver backlog, proximas rodadas drenam.
    const url = `${dashUrl}/rest/v1/hotmart_transactions?select=transaction_code,status,product_id,hotmart_products(name),buyer_id,price_value,purchase_date,approved_date,refund_date,updated_at,src,offer_id,payment_type,payment_installments&updated_at=gt.${encodeURIComponent(desde)}&order=updated_at.asc&limit=150`;
    const txRes = await fetch(url, { headers: { apikey: dashKey, Authorization: `Bearer ${dashKey}` } });
    if (!txRes.ok) throw new Error(`Dash tx ${txRes.status}`);
    const txs = await txRes.json();

    if (!txs.length) {
      await sb.from('crm_sync_estado').update({ ultima_rodada: new Date().toISOString(), itens_ultima: 0 }).eq('fonte', 'dash_compras');
      return json({ ok: true, novas: 0, ms: Date.now() - t0 });
    }

    // 4) resolve buyer -> cliente. Busca em CHUNKS de 40 pra nao estourar a URL/HTTP2.
    const buyerIds = [...new Set(txs.map((t: any) => t.buyer_id).filter(Boolean))] as string[];
    const buyerById: Record<string, any> = {};
    for (let i = 0; i < buyerIds.length; i += 40) {
      const chunk = buyerIds.slice(i, i + 40);
      const r = await fetch(
        `${dashUrl}/rest/v1/hotmart_buyers?select=id,email,phone,document,name&id=in.(${chunk.map((b) => `"${b}"`).join(',')})`,
        { headers: { apikey: dashKey, Authorization: `Bearer ${dashKey}` } },
      );
      if (r.ok) { for (const b of await r.json()) buyerById[b.id] = b; }
    }

    let novas = 0, atualizadas = 0, semCliente = 0, maxMarca = desde;

    for (const t of txs) {
      if (t.updated_at > maxMarca) maxMarca = t.updated_at;
      const b = buyerById[t.buyer_id];
      if (!b) { semCliente++; continue; }

      // resolve cliente por email, senao telefone canonico, senao cria
      let clienteId = await resolverCliente(b);

      const idExterno = t.transaction_code;
      const status = String(t.status || '').toLowerCase();
      const payload = {
        cliente_id: clienteId,
        origem: 'hotmart',
        id_externo: idExterno,
        produto_id: t.product_id,
        produto_nome: t.hotmart_products?.name || null, // resolve o nome na hora (senão vira UUID na tela)
        valor_brl: t.price_value ?? null,
        status,
        data_compra: t.purchase_date || null,
        data_reembolso: t.refund_date || null,
        src: t.src || null,
        offer_id: t.offer_id || null,
        payment_type: t.payment_type || null,
        installments: t.payment_installments ?? null,
        payload: t,
      };
      // upsert por (origem, id_externo) — TRANSICAO de status: sempre atualiza o status/datas
      const { error, data } = await sb.from('crm_compra')
        .upsert(payload, { onConflict: 'origem,id_externo' })
        .select('id');
      if (error) { console.error('upsert compra', idExterno, error.message); continue; }
      novas++;
    }

    // 5) avanca marca d'agua
    await sb.from('crm_sync_estado').update({
      ultima_marca: maxMarca, ultima_rodada: new Date().toISOString(), itens_ultima: txs.length, atualizado_em: new Date().toISOString(),
    }).eq('fonte', 'dash_compras');

    return json({ ok: true, processadas: txs.length, gravadas: novas, sem_cliente: semCliente, ate: maxMarca, ms: Date.now() - t0 });
  } catch (e) {
    console.error('crm-sync-vendas erro', e);
    return json({ ok: false, erro: String(e) }, 500);
  }
});

// resolve o cliente na base pela identidade; cria ficha nova se for cliente inedito
async function resolverCliente(b: any): Promise<string | null> {
  const email = normEmail(b.email);
  const tc = telCanon(b.phone);
  const doc = String(b.document || '').replace(/\D/g, '') || null;

  // tenta por email
  if (email) {
    const { data } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'email').eq('valor', email).maybeSingle();
    if (data) return data.cliente_id;
  }
  // tenta por telefone canonico
  if (tc) {
    const { data } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'tel').eq('valor', tc).maybeSingle();
    if (data) return data.cliente_id;
  }
  // tenta por documento
  if (doc) {
    const { data } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'cpf').eq('valor', doc).maybeSingle();
    if (data) return data.cliente_id;
  }

  // cliente inedito: cria ficha + identidades (documento = identificador FORTE)
  const { data: novo, error } = await sb.from('crm_cliente')
    .insert({ nome: b.name || null, cpf: doc, tel_canon: tc, email_canon: email || null })
    .select('cliente_id').single();
  if (error || !novo) { console.error('cria cliente', error?.message); return null; }
  const cid = novo.cliente_id;

  const idents = [];
  if (email) idents.push({ cliente_id: cid, tipo: 'email', valor: email, confianca: 'forte', origem: 'hotmart' });
  if (tc) idents.push({ cliente_id: cid, tipo: 'tel', valor: tc, confianca: 'fraca', origem: 'hotmart' });
  if (doc) idents.push({ cliente_id: cid, tipo: 'cpf', valor: doc, confianca: 'forte', origem: 'hotmart' });
  if (idents.length) await sb.from('crm_cliente_identidade').upsert(idents, { onConflict: 'tipo,valor' });
  return cid;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
