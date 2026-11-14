// ========================================================================
// Edge Function: acesso-areas-worker
// ========================================================================
// Monitor de liberação de acesso às áreas de membros da Hotmart (André 12/11/2026).
// Entradas de aluno novo:
//   1. Hotmart: 1ª parcela aprovada de mentoria no Dash (parcela 2+ nunca entra).
//   2. Pix: o comercial anuncia a venda no Discord #novo-grupo-pinguim → a IA lê produto + pessoas (2ª cadeira junto).
// Áreas exigidas: Taurus LT → ProAlt · Lyra → Elo · Taurus Master/Plus/Mentoring e Orion → ProAlt e Elo ·
//   Elo/ProAlt por Pix → a do produto · Mentoria Express → nenhuma.
// Conferência: Hotmart Club API (conta instituto), GET /club/api/v1/users?subdomain=&email= → status ACTIVE.
// Avisos: na hora (só quem ainda não tem acesso) e todo dia às 8h SP a lista de quem AINDA não tem.
// Liberado sai da lista sozinho. Dispensado (botão no CRM) não volta a ser cobrado.
// Modos (body): {} = cron (coleta; às 8h00–8h09 SP também a rodada diária) · {diario:true} · {dry_run:true} (só lista)
// modo_teste (config) = tudo vai para o privado do Codina.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';
import { AREA_NOME, normEmail, areasAtivas as areasAtivasHot } from '../_shared/hotmart-areas.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }, db: { schema: 'pinguim' },
});
const CONSUMIDOR = 'acesso-areas-worker';
const areasAtivas = (email: string, areas: string[]) => areasAtivasHot(sb, email, areas, CONSUMIDOR);
const PRODUTO_AREAS: Record<string, string[]> = {
  'Taurus Low Ticket': ['proalt'], 'Taurus Master': ['proalt', 'elo'], 'Taurus Plus': ['proalt', 'elo'], 'Taurus Mentoring': ['proalt', 'elo'],
  'Mastermind Orion': ['proalt', 'elo'], 'Orion': ['proalt', 'elo'], 'Lyra': ['elo'], 'Elo': ['elo'], 'ProAlt': ['proalt'], 'Mentoria Express': [],
};
const sp = (d: Date) => new Date(d.getTime() - 3 * 3600e3);
const dataBR = (s: string) => { const d = sp(new Date(s)); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

// ---------------- Discord ----------------
let _bot = '';
async function bot() { return _bot || (_bot = await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR)); }
async function discord(path: string, init: RequestInit = {}) {
  const r = await fetch('https://discord.com/api/v10' + path, { ...init, headers: { Authorization: `Bot ${await bot()}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  return r.json().catch(() => ({}));
}
async function canalDestino(cfg: any): Promise<string> {
  if (cfg.modo_teste || !cfg.canal_alerta_id) {
    const dm = await discord('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: cfg.dm_teste }) });
    return dm.id;
  }
  return cfg.canal_alerta_id;
}
async function postar(cfg: any, texto: string) {
  const canal = await canalDestino(cfg);
  const prefixo = cfg.modo_teste ? '🧪 **TESTE: só você está recebendo**\n' : '';
  const ids = cfg.modo_teste ? [] : [...cfg.marcar, ...cfg.copia];
  for (let i = 0; i < texto.length; i += 1900) { // mensagens longas em partes
    await discord(`/channels/${canal}/messages`, { method: 'POST', body: JSON.stringify({ content: (i ? '' : prefixo) + texto.slice(i, i + 1900), allowed_mentions: { users: ids } }) });
  }
}

// ---------------- Hotmart Club ----------------
// ---------------- coleta: Hotmart (Dash) ----------------
async function coletarHotmart(cfg: any) {
  const [u, k] = await Promise.all([getChave('DASHBOARD_URL', CONSUMIDOR), getChave('DASHBOARD_SERVICE_ROLE_KEY', CONSUMIDOR)]);
  const ids = Object.keys(cfg.produtos_hotmart || {});
  const sel = 'transaction_code,status,recurrence_number,purchase_date,approved_date,hotmart_products!inner(hotmart_product_id),hotmart_buyers(name,email,phone,checkout_phone)';
  const r = await fetch(`${u}/rest/v1/hotmart_transactions?select=${encodeURIComponent(sel)}&hotmart_products.hotmart_product_id=in.(${ids.join(',')})&status=in.(approved,complete,completed)&purchase_date=gte.${encodeURIComponent(cfg.desde)}&order=purchase_date.asc&limit=1000`,
    { headers: { apikey: k, Authorization: `Bearer ${k}` } });
  if (!r.ok) throw new Error('Dash ' + r.status);
  const out: any[] = [];
  for (const t of await r.json()) {
    if (t.recurrence_number && Number(t.recurrence_number) !== 1) continue; // só a 1ª parcela
    const [produto, areas] = cfg.produtos_hotmart[String(t.hotmart_products.hotmart_product_id)];
    const b = t.hotmart_buyers || {};
    out.push({ email: normEmail(b.email), nome: String(b.name || '').trim(), whatsapp: b.checkout_phone || b.phone || null, produto, areas,
      origem: 'hotmart', referencia: t.transaction_code, data_origem: t.approved_date || t.purchase_date, anunciado_por: `Hotmart, 1ª parcela em ${dataBR(t.approved_date || t.purchase_date)}` });
  }
  return out;
}

// ---------------- coleta: Pix anunciado no Discord ----------------
const SCHEMA = { type: 'object', additionalProperties: false, required: ['tipo', 'produto', 'pessoas'], properties: {
  tipo: { type: 'string', enum: ['nova_venda', 'outro'] },
  produto: { type: 'string', enum: ['Taurus Low Ticket', 'Taurus Master', 'Taurus Plus', 'Orion', 'Lyra', 'Elo', 'ProAlt', 'Mentoria Express', 'Outro'] },
  pessoas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nome', 'email', 'whatsapp'],
    properties: { nome: { type: 'string' }, email: { type: 'string' }, whatsapp: { type: 'string' } } } },
} };
const INSTRUCAO = `Você lê mensagens do canal interno de uma escola de cursos (Agência Pinguim). Classifique:
- "nova_venda": a mensagem ANUNCIA uma venda nova ou um aluno novo que precisa receber acesso (ex.: "VENDA … Pix", "Novo mentorado Taurus Plus", "Aluna nova da Mentoria Lyra, liberar acessos", "Libera o Elo e o ProAlt pra este email").
  Também é "nova_venda": pedido de cadastro/vinculação/liberação da CADEIRA de um aluno (2ª cadeira, sócio, cônjuge) — ex.: "Segue os dados para cadastro/vinculação da cadeira do aluno X - Taurus LT: Nome… E-mail…" (o produto é o da mentoria citada; a pessoa é a da cadeira).
- "outro": suporte, dúvida, erro de acesso de aluno antigo, cancelamento, reembolso, remoção de acesso, atualização de cadastro, análise de perfil, qualquer outra coisa.
produto: o produto vendido. "Mentoria Elo", "Elo Black" = Elo. "Taurus LT"/"Taurus Low Ticket" = Taurus Low Ticket. "Mastermind Orion" = Orion. Se não der para saber, "Outro".
pessoas: TODAS as pessoas que vão receber acesso (inclusive 2ª cadeira / sócio), com nome, email e WhatsApp como escritos (vazio se não houver). Não invente email.`;
async function lerMensagem(cfg: any, texto: string) {
  const k = await getChave('OPENAI_API_KEY', CONSUMIDOR);
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.modelo_extracao, messages: [{ role: 'system', content: INSTRUCAO }, { role: 'user', content: texto.slice(0, 4000) }],
      response_format: { type: 'json_schema', json_schema: { name: 'venda', strict: true, schema: SCHEMA } } }) });
  const j = await r.json();
  if (!j.choices) throw new Error('OpenAI: ' + JSON.stringify(j.error || j).slice(0, 200));
  return JSON.parse(j.choices[0].message.content);
}
async function coletarDiscord(cfg: any, dryRun: boolean) {
  const desde = new Date(cfg.desde).getTime();
  let msgs: any[] = [], antes = '';
  for (let i = 0; i < 15; i++) { // do mais novo para trás, até a última já lida (ou a data inicial)
    const lote = await discord(`/channels/${cfg.canal_vendas_id}/messages?limit=100${antes ? '&before=' + antes : ''}`);
    if (!Array.isArray(lote) || !lote.length) break;
    let parar = false;
    for (const m of lote) {
      if (cfg.discord_ultimo_id && BigInt(m.id) <= BigInt(cfg.discord_ultimo_id)) { parar = true; break; }
      if (new Date(m.timestamp).getTime() < desde) { parar = true; break; }
      msgs.push(m);
    }
    if (parar) break;
    antes = lote[lote.length - 1].id;
  }
  msgs = msgs.reverse();
  const out: any[] = [], lidas: any[] = [];
  let lidasIA = 0, ultimoId: string | null = null;
  for (const m of msgs) {
    if (lidasIA >= 12) break; // resto fica para a próxima rodada (não estoura o tempo)
    ultimoId = m.id;
    if (m.author?.bot) continue;
    const t = String(m.content || '');
    if (!/[\w.+-]+@[\w-]+\.[\w.]+/.test(t) || !/venda|vend|fech|pix|mentor|lyra|taurus|orion|\belo\b|pro ?alt|libera|aluno novo|aluna nova|novo mentorado|nova mentorada/i.test(t)) continue;
    const v = await lerMensagem(cfg, t);
    lidasIA++;
    lidas.push({ quando: m.timestamp, autor: m.author?.global_name || m.author?.username, tipo: v.tipo, produto: v.produto, pessoas: v.pessoas.map((p: any) => p.email).join(', '), trecho: t.replace(/\s+/g, ' ').slice(0, 120) });
    if (v.tipo !== 'nova_venda') continue;
    const areas = PRODUTO_AREAS[v.produto];
    if (!areas || !areas.length) continue; // Express/Outro: não precisa de área
    for (const p of v.pessoas) {
      const email = normEmail(p.email);
      if (!/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(email)) continue;
      out.push({ email, nome: p.nome, whatsapp: p.whatsapp || null, produto: v.produto, areas, origem: 'pix-discord', referencia: m.id, data_origem: m.timestamp,
        referencia_url: `https://discord.com/channels/${m.guild_id || '1083429941300969574'}/${cfg.canal_vendas_id}/${m.id}`,
        anunciado_por: `Discord, ${m.author?.global_name || m.author?.username} em ${dataBR(m.timestamp)}` });
    }
  }
  if (!dryRun && ultimoId) await sb.from('acesso_area_config').update({ discord_ultimo_id: ultimoId }).eq('id', 1);
  return { candidatos: out, lidas };
}

// ---------------- mensagens ----------------
const linhaPessoa = (p: any, faltam: string[]) =>
  `• **${p.nome || p.email}** · ${p.email}${p.whatsapp ? ` · ${p.whatsapp}` : ''}\n   ${p.produto} → liberar **${faltam.map((a) => AREA_NOME[a]).join(' e ')}**  ·  ${p.anunciado_por}${p.referencia_url ? ` · [mensagem](<${p.referencia_url}>)` : ''}`;
const NOMES: Record<string, string> = { '1083728715726463068': 'Rafa', '1083731934238228590': 'Djairo', '1084804999151878206': 'Luiz Guilherme' };
function mencoes(cfg: any) {
  const m = (i: string) => cfg.modo_teste ? `@${NOMES[i] || i}` : `<@${i}>`; // no teste, só texto: ninguém é acionado
  return `${cfg.marcar.map(m).join(' ')}${cfg.copia.length ? ` · cc ${cfg.copia.map(m).join(' ')}` : ''}`;
}

async function cliente(email: string) {
  const { data } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'email').eq('valor', email).limit(1);
  return data?.[0]?.cliente_id || null;
}
async function nomeCrm(cid: string | null) {
  if (!cid) return null;
  const { data } = await sb.from('crm_cliente').select('nome').eq('cliente_id', cid).maybeSingle();
  return data?.nome || null;
}

// novos: grava e avisa só quem ainda não tem acesso
async function processarNovos(cfg: any, candidatos: any[], dryRun: boolean) {
  const novos: any[] = [], jaTinham: string[] = [];
  for (const c of candidatos) {
    const { data: ja } = await sb.from('acesso_area_pendencia').select('id').eq('email', c.email).eq('produto', c.produto).eq('referencia', c.referencia).limit(1);
    if (ja?.length) continue;
    // mesma pessoa + mesma área já pendente/dispensada por outra entrada (ex.: Hotmart e Discord da mesma venda) → não duplica
    const { data: aberto } = await sb.from('acesso_area_pendencia').select('id, areas').eq('email', c.email).in('status', ['pendente', 'dispensado']);
    const cobertas = new Set((aberto || []).flatMap((x: any) => x.areas));
    const ok = await areasAtivas(c.email, c.areas);
    const faltam = c.areas.filter((a: string) => !ok.includes(a) && !cobertas.has(a));
    const status = c.areas.every((a: string) => ok.includes(a)) ? 'liberado' : faltam.length ? 'pendente' : 'coberto';
    if (dryRun) { (status === 'pendente' ? novos : jaTinham).push(status === 'pendente' ? { ...c, faltam } : `${c.email} (${status})`); continue; }
    if (status === 'coberto') continue;
    const cid = await cliente(c.email);
    if (!String(c.nome || '').trim() || c.nome === c.email) c.nome = (await nomeCrm(cid)) || c.nome; // anúncio sem nome → nome do CRM
    await sb.from('acesso_area_pendencia').insert({ ...c, cliente_id: cid, areas_ok: ok, status, ultimo_check_em: new Date().toISOString(),
      liberado_em: status === 'liberado' ? new Date().toISOString() : null, avisado_em: status === 'pendente' ? new Date().toISOString() : null });
    if (status === 'pendente') novos.push({ ...c, faltam }); else jaTinham.push(c.email);
  }
  if (novos.length && !dryRun) {
    await postar(cfg, `🔑 **Liberar acesso à área de membros na Hotmart**\n${mencoes(cfg)}\n\n${novos.map((p) => linhaPessoa(p, p.faltam)).join('\n\n')}\n\nAmanhã às 8h eu confiro na Hotmart e cobro só quem ainda estiver sem acesso.`);
  }
  return { novos, jaTinham };
}

// venda do #vendas toda liberada (todas as pessoas dela) → troca a reação ⏳ do bot por ✅ na mensagem da venda
async function vendaResolvida(cfg: any, msgId: string) {
  const { data: resto } = await sb.from('acesso_area_pendencia').select('id').eq('referencia', msgId).eq('origem', 'vendas-discord').eq('status', 'pendente').limit(1);
  if (resto?.length || !cfg.vendas_canal_id) return;
  const base = `https://discord.com/api/v10/channels/${cfg.vendas_canal_id}/messages/${msgId}/reactions`;
  const h = { Authorization: `Bot ${await bot()}` };
  await fetch(`${base}/${encodeURIComponent('⏳')}/@me`, { method: 'DELETE', headers: h });
  await fetch(`${base}/${encodeURIComponent('✅')}/@me`, { method: 'PUT', headers: h });
}

// rodada diária: confere todos os pendentes e lista só quem ainda não tem
async function diario(cfg: any, dryRun: boolean) {
  const { data: pend } = await sb.from('acesso_area_pendencia').select('*').eq('status', 'pendente').order('criado_em');
  const ainda: any[] = []; let liberados = 0;
  for (const p of pend || []) {
    const ok = await areasAtivas(p.email, p.areas);
    const faltam = p.areas.filter((a: string) => !ok.includes(a));
    if (!dryRun) await sb.from('acesso_area_pendencia').update({ areas_ok: ok, ultimo_check_em: new Date().toISOString(),
      ...(faltam.length ? {} : { status: 'liberado', liberado_em: new Date().toISOString() }) }).eq('id', p.id);
    if (!faltam.length && !dryRun && p.origem === 'vendas-discord') await vendaResolvida(cfg, p.referencia);
    if (faltam.length) { // dias contam da venda/anúncio (não de quando entrou na lista), em dias de calendário de SP
      const desde = new Date(p.data_origem || p.criado_em);
      const dia = (d: Date) => Date.UTC(sp(d).getUTCFullYear(), sp(d).getUTCMonth(), sp(d).getUTCDate());
      ainda.push({ ...p, faltam, dias: Math.round((dia(new Date()) - dia(desde)) / 864e5), desde: dataBR(desde.toISOString()) });
    } else liberados++;
  }
  if (!dryRun) {
    const txt = ainda.length
      ? `☀️ **Bom dia! Acessos à área de membros AINDA NÃO liberados na Hotmart (${ainda.length})**\n${mencoes(cfg)}\n\n${ainda.sort((a, b) => b.dias - a.dias).map((p) => `${linhaPessoa(p, p.faltam)}\n   ⏳ esperando há **${p.dias} ${p.dias === 1 ? 'dia' : 'dias'}** (desde ${p.desde})`).join('\n\n')}\n\nSe alguém aqui NÃO deve receber acesso, dispense pelo CRM (ficha do aluno → "Dispensar alerta de acesso").`
      : '☀️ Bom dia! ✅ Nenhum acesso à área de membros pendente.';
    await postar(cfg, txt);
  }
  return { conferidos: (pend || []).length, liberados, ainda };
}

async function rodar(body: any) {
  const { data: cfg } = await sb.from('acesso_area_config').select('*').eq('id', 1).single();
  const dryRun = !!body.dry_run;
  if (!cfg.ativo && !dryRun && !body.forcar) return { ativo: false };
  const agoraSP = sp(new Date());
  const rodadaDiaria = body.diario || (agoraSP.getUTCHours() === 8 && agoraSP.getUTCMinutes() < 10);
  const hot = await coletarHotmart(cfg);
  const disc = await coletarDiscord(cfg, dryRun);
  const r1 = await processarNovos(cfg, [...hot, ...disc.candidatos], dryRun);
  const r2 = rodadaDiaria ? await diario(cfg, dryRun) : null;
  return { hotmart: hot.length, discord_lidas: disc.lidas, novos: r1.novos.map((p: any) => `${p.email} · ${p.produto} · falta ${p.faltam.join('+')} · ${p.anunciado_por}`), ja_tinham: r1.jaTinham,
    diario: r2 && { conferidos: r2.conferidos, liberados: r2.liberados, ainda: r2.ainda.length } };
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405 });
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = '';
  try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* cron */ }
  try { return new Response(JSON.stringify(await rodar(body)), { headers: { 'Content-Type': 'application/json' } }); }
  catch (e) { return new Response(JSON.stringify({ erro: String((e as Error).message || e) }), { status: 500 }); }
});
