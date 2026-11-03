// ========================================================================
// Edge Function: mentoria-aluno-novo-worker
// ========================================================================
// Aluno NOVO de mentoria (Taurus, Orion, Lyra, Express) → celebração no
// Discord #novo-grupo-pinguim pedindo pra Ingrid marcar o onboarding.
// Só a 1ª parcela/recorrência (recurrence_number 1 ou vazio) e só aprovadas.
// Fonte: Dash (hotmart_transactions, recebe a venda da Hotmart em ~1 min).
// Cron */2 (sql/mentoria_aluno_novo_discord.sql). Config editável por UPDATE
// em pinguim.mentoria_aviso_config (ativo, produtos, quem marcar, canal).
// Body { dry_run: true } → só lista o que mandaria.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});
const CONSUMIDOR = 'mentoria-aluno-novo-worker';
const JANELA_DIAS = 10;       // olha no máximo 10 dias pra trás (o resto já foi avisado)
const REPETIDO_DIAS = 60;     // mesmo email + mesma mentoria em 60 dias = 1 aviso só

// America/Sao_Paulo = UTC-3 fixo
const sp = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3);
const p2 = (n: number) => String(n).padStart(2, '0');
const saudacao = () => { const h = sp(new Date().toISOString()).getUTCHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const quando = (iso: string) => { const d = sp(iso); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${p2(d.getUTCHours())}h${p2(d.getUTCMinutes())}`; };

function telefone(b: any): string {
  const ddi = String(b.checkout_phone_code || '').replace(/\D/g, '');
  let n = String(b.checkout_phone || b.phone || '').replace(/\D/g, '');
  if (!n) return 'não informado';
  if ((!ddi || ddi === '55') && n.length >= 12 && n.startsWith('55')) n = n.slice(2);
  if (ddi && ddi !== '55' && !(n.length === 10 || n.length === 11)) return `+${ddi} ${n}`;
  const fmt = n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n.length === 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}` : n;
  return `${fmt} · [WhatsApp](<https://wa.me/55${n}>)`;
}

function mensagem(produto: string, b: any, dataIso: string, marcar: string[]): string {
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `${saudacao()}, equipe! 🎉`,
    `**Eba, mais um aluno para a nossa ${produto}!** 🚀`,
    '',
    `👤 **Nome:** ${String(b.name || '').trim()}`,
    `📧 **Email:** ${String(b.email || '').trim().toLowerCase()}`,
    `📱 **Telefone:** ${telefone(b)}`,
    `🗓️ **Compra:** ${quando(dataIso)}`,
    '',
    `<@${marcar[0]}>, você precisa marcar o agendamento do onboarding desse nosso aluno. Os dados estão aqui em cima. 🙌`,
    marcar.slice(1).map((id) => `<@${id}>`).join(' '),
    '',
    '📌 **PS:** confira se nessa oferta teve o bônus da **2ª cadeira**. Se teve, peça ao aluno os dados da segunda pessoa para fazer o cadastro e liberar o acesso dela também.',
  ].join('\n');
}

const GRUPO_MENTORIA = /taurus|orion|lyra|lira|mastermind|mentoria|express/i;
async function jaEraAluno(t: any, email: string, produtoIds: string[], dash: { url: string; key: string }): Promise<string | null> {
  const dataIso = t.approved_date || t.purchase_date;
  if (t.buyer_id) {
    const r = await fetch(`${dash.url}/rest/v1/hotmart_transactions?select=transaction_code,purchase_date,hotmart_products!inner(hotmart_product_id,name)`
      + `&buyer_id=eq.${t.buyer_id}&hotmart_products.hotmart_product_id=in.(${produtoIds.join(',')})`
      + `&status=in.(approved,complete,completed)&purchase_date=lt.${encodeURIComponent(t.purchase_date)}&limit=1`,
      { headers: { apikey: dash.key, Authorization: `Bearer ${dash.key}` } });
    const ant = r.ok ? await r.json() : [];
    if (ant.length) return `já pagou mentoria antes: ${ant[0].hotmart_products?.name} em ${String(ant[0].purchase_date).slice(0, 10)}`;
  }
  if (!email) return null;
  const { data: idn } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'email').eq('valor', email).limit(1);
  const cid = idn?.[0]?.cliente_id;
  if (!cid) return null;
  const { data: gp } = await sb.from('crm_grupo_presenca').select('grupo_nome, entrou_visto_em').eq('cliente_id', cid).lt('entrou_visto_em', dataIso);
  const g = (gp || []).find((x: any) => GRUPO_MENTORIA.test(x.grupo_nome || ''));
  return g ? `já estava no grupo ${g.grupo_nome} desde ${String(g.entrou_visto_em).slice(0, 10)}` : null;
}

async function rodar(dryRun: boolean, testeDm = false) {
  const { data: cfg } = await sb.from('mentoria_aviso_config').select('*').eq('id', 1).single();
  if (!cfg?.ativo && !dryRun) return { ativo: false };
  const produtos: Record<string, string> = cfg.produtos || {};
  const desde = new Date(Math.max(new Date(cfg.desde).getTime(), Date.now() - JANELA_DIAS * 864e5)).toISOString();

  const dashUrl = await getChave('DASHBOARD_URL', CONSUMIDOR);
  const dashKey = await getChave('DASHBOARD_SERVICE_ROLE_KEY', CONSUMIDOR);
  const sel = 'transaction_code,buyer_id,status,recurrence_number,purchase_date,approved_date,'
    + 'hotmart_products!inner(hotmart_product_id,name),hotmart_buyers(name,email,phone,checkout_phone,checkout_phone_code)';
  const url = `${dashUrl}/rest/v1/hotmart_transactions?select=${encodeURIComponent(sel)}`
    + `&hotmart_products.hotmart_product_id=in.(${Object.keys(produtos).join(',')})`
    + `&status=in.(approved,complete,completed)&purchase_date=gte.${encodeURIComponent(desde)}&order=purchase_date.asc&limit=500`;
  const r = await fetch(url, { headers: { apikey: dashKey, Authorization: `Bearer ${dashKey}` } });
  if (!r.ok) throw new Error(`Dash ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const txs = (await r.json()).filter((t: any) => !t.recurrence_number || Number(t.recurrence_number) === 1);

  const codigos = txs.map((t: any) => t.transaction_code);
  const { data: ja } = codigos.length
    ? await sb.from('mentoria_aviso').select('transacao').in('transacao', codigos)
    : { data: [] };
  const vistos = new Set((ja || []).map((x: any) => x.transacao));
  const novas = txs.filter((t: any) => !vistos.has(t.transaction_code));
  if (testeDm) { // manda as 2 últimas no privado do Codina, sem marcar ninguém, pra conferir o visual
    const bot = await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR);
    const dm = await (await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient_id: '1077338884981133413' }) })).json();
    for (const t of txs.slice(-2)) {
      await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, { method: 'POST', headers: { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: mensagem(produtos[t.hotmart_products.hotmart_product_id], t.hotmart_buyers || {}, t.approved_date || t.purchase_date, cfg.marcar), allowed_mentions: { parse: [] } }) });
      await new Promise((ok) => setTimeout(ok, 1200));
    }
    return { teste_dm: 2 };
  }
  if (dryRun) {
    const lista = [];
    for (const t of txs) lista.push(`${t.purchase_date} ${produtos[t.hotmart_products.hotmart_product_id]} ${t.hotmart_buyers?.email} → ${(await jaEraAluno(t, String(t.hotmart_buyers?.email || '').toLowerCase(), Object.keys(produtos), { url: dashUrl, key: dashKey })) || 'NOVO'}${vistos.has(t.transaction_code) ? ' (já avisado)' : ''}`);
    return { desde, lista };
  }

  const bot = novas.length ? await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR) : '';
  const res = { enviados: 0, pulados: 0, erros: 0 };
  for (const t of novas) {
    const b = t.hotmart_buyers || {};
    const produto = produtos[t.hotmart_products.hotmart_product_id] || t.hotmart_products.name;
    const email = String(b.email || '').trim().toLowerCase();
    const dataIso = t.approved_date || t.purchase_date;
    // reivindica a venda (PK) — se outro tick já pegou, o insert falha e a gente segue
    const { error: eIns } = await sb.from('mentoria_aviso').insert({
      transacao: t.transaction_code, produto, produto_hotmart: t.hotmart_products.hotmart_product_id,
      nome: String(b.name || '').trim(), email, telefone: b.checkout_phone || b.phone || null, data_compra: dataIso,
    });
    if (eIns) continue;
    // mesma pessoa, mesma mentoria, já avisada há pouco (ex.: comprou 2x por erro) → não repete
    const { data: rep } = await sb.from('mentoria_aviso').select('transacao').eq('email', email).eq('produto', produto)
      .eq('status', 'enviado').gte('data_compra', new Date(new Date(dataIso).getTime() - REPETIDO_DIAS * 864e5).toISOString()).limit(1);
    const antigo = await jaEraAluno(t, email, Object.keys(produtos), { url: dashUrl, key: dashKey });
    if (antigo) {
      await sb.from('mentoria_aviso').update({ status: 'pulado', erro: antigo }).eq('transacao', t.transaction_code);
      res.pulados++; continue;
    }
    if (email && rep?.length) {
      await sb.from('mentoria_aviso').update({ status: 'pulado', erro: `já avisado (${rep[0].transacao})` }).eq('transacao', t.transaction_code);
      res.pulados++; continue;
    }
    const resp = await fetch(`https://discord.com/api/v10/channels/${cfg.canal_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: mensagem(produto, b, dataIso, cfg.marcar), allowed_mentions: { users: cfg.marcar } }),
    });
    const j = await resp.json().catch(() => ({}));
    if (resp.ok) {
      await sb.from('mentoria_aviso').update({ status: 'enviado', discord_msg_id: j.id, enviado_em: new Date().toISOString() }).eq('transacao', t.transaction_code);
      res.enviados++;
    } else { // apaga a reivindicação → o próximo tick tenta de novo
      await sb.from('mentoria_aviso').delete().eq('transacao', t.transaction_code);
      console.warn('discord', resp.status, JSON.stringify(j).slice(0, 200));
      res.erros++;
    }
    await new Promise((ok) => setTimeout(ok, 1200)); // respeita o limite do Discord
  }
  return res;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405 });
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = '';
  try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corpo vazio do cron */ }
  try {
    return new Response(JSON.stringify(await rodar(!!body.dry_run, !!body.teste_dm)), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String((e as Error).message || e) }), { status: 500 });
  }
});
