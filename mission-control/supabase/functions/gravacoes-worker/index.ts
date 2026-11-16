// ========================================================================
// Edge Function: gravacoes-worker
// ========================================================================
// Aviso de gravação para subir na área de membros (André 16/11/2026).
// Fontes (encontros de GRUPO; call 1:1 não entra):
//   1. Zoom (contas contato@ e pedro@): relatório de reuniões passadas (mesma credencial do crm-sync-zoom).
//      A credencial não lê as gravações (falta o scope cloud_recording) → o aviso diz em qual conta do Zoom está.
//   2. Google Meet do contato@: as reuniões que o mentoria-call-raiox-worker marcou como grupo (status 'ignorado').
// Produto pelo título (mesmo de-para do CRM). Destino provável: ProAlt, Elo e lançamentos → Hotmart ·
//   Taurus, Orion e Lyra → Escola. Quem sobe confirma o lugar (resposta na mensagem = histórico para aprender).
// Baixa: reação ✅ (subiu) ou ❌ (não precisa subir) na mensagem do aviso. Lembrete às 9h SP do que segue sem baixa.
// Modos (body): {} = cron · {teste:true} = lista os encontros desde config.desde e manda só no privado do Codina (não grava)
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }, db: { schema: 'pinguim' },
});
const CONSUMIDOR = 'gravacoes-worker';
const CODINA = '1077338884981133413';
const ZOOM_HOSTS: Record<string, string> = { '44DY0Fv6S8iGxdiAwle9gw': 'Zoom do contato@', 'IqaIvc2zSaGj42E0LSH3Kw': 'Zoom do pedro@' };
const MIN_PARTICIPANTES = 3; // 1:1 (aluno + mentor, ou casal) não entra
const MIN_DURACAO = 10;      // reunião que caiu / teste de áudio

// mesmo de-para do crm-sync-zoom (ORDEM importa: Lo-Fi antes de low ticket genérico)
const DEPARA: [string, string[]][] = [
  ['lancamento-lofi', ['lo-fi', 'lofi', 'lo fi']],
  ['lancamento-lt-vivo', ['low ticket ao vivo', 'aula low ticket', 'aulão', 'aulao']],
  ['lancamento-lowticket', ['desafio low ticket', 'desafio de low ticket']],
  ['taurus-lt', ['taurus lt']],
  ['taurus-master', ['taurus master', 'encontro mentoria taurus', 'análise estratégica: copy', 'taurus | tira', 'sabatina', 'taurus | da estratégia', 'taurus | sabatina', 'encontro taurus']],
  ['taurus-plus', ['taurus plus']],
  ['lyra', ['lyra']], ['orion', ['orion']],
  ['proalt', ['proalt', 'pro alt']],
  ['elo', ['elo', 'cancelamento coletivo', 'persona na prática']],
  ['black', ['black absurda']],
];
const classifica = (t: string) => { const s = (t || '').toLowerCase(); for (const [slug, p] of DEPARA) if (p.some((x) => s.includes(x))) return slug; return null; };
const NOME: Record<string, string> = { 'lancamento-lofi': 'Desafio Lo-fi', 'lancamento-lt-vivo': 'Low Ticket Ao Vivo', 'lancamento-lowticket': 'Desafio Low Ticket',
  'taurus-lt': 'Taurus Low Ticket', 'taurus-master': 'Taurus Master', 'taurus-plus': 'Taurus Plus', lyra: 'Lyra', orion: 'Orion', proalt: 'ProAlt', elo: 'Elo', black: 'Black Absurda' };
const DESTINO: Record<string, string> = { proalt: 'Hotmart', elo: 'Hotmart', 'lancamento-lofi': 'Hotmart', 'lancamento-lt-vivo': 'Hotmart', 'lancamento-lowticket': 'Hotmart',
  black: 'Hotmart', 'taurus-lt': 'Escola', 'taurus-master': 'Escola', 'taurus-plus': 'Escola', orion: 'Escola', lyra: 'Escola' };

const sp = (d: Date) => new Date(d.getTime() - 3 * 3600e3);
const quando = (s: string) => { const d = sp(new Date(s)); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} às ${p(d.getUTCHours())}h${p(d.getUTCMinutes())}`; };

// ---------------- Discord ----------------
let _bot = '';
async function discord(path: string, init: RequestInit = {}) {
  _bot = _bot || await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR);
  const r = await fetch('https://discord.com/api/v10' + path, { ...init, headers: { Authorization: `Bot ${_bot}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return { raw: t }; }
}
async function dmCodina(texto: string) {
  const dm = await discord('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: CODINA }) });
  return discord(`/channels/${dm.id}/messages`, { method: 'POST', body: JSON.stringify({ content: texto.slice(0, 1990), allowed_mentions: { parse: [] } }) });
}

// ---------------- fontes ----------------
async function tokenZoom() {
  const [aid, cid, cs] = await Promise.all(['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'].map((n) => getChave(n, CONSUMIDOR)));
  const r = await fetch('https://zoom.us/oauth/token', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${cid}:${cs}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'account_credentials', account_id: aid }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('Zoom: ' + JSON.stringify(j).slice(0, 150));
  return j.access_token;
}
async function encontrosZoom(desde: Date) {
  const tok = await tokenZoom();
  const de = sp(desde).toISOString().slice(0, 10), ate = sp(new Date()).toISOString().slice(0, 10);
  const out: any[] = [];
  for (const [host, conta] of Object.entries(ZOOM_HOSTS)) {
    let token = '';
    do {
      const r = await fetch(`https://api.zoom.us/v2/report/users/${host}/meetings?from=${de}&to=${ate}&type=past&page_size=100${token ? '&next_page_token=' + token : ''}`, { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(`Zoom ${conta} ${r.status}: ${JSON.stringify(j).slice(0, 150)}`);
      for (const m of j.meetings || []) {
        if (new Date(m.start_time) < desde) continue;
        out.push({ origem: 'zoom', referencia: m.uuid, titulo: m.topic, inicio: m.start_time, duracao_min: m.duration, participantes: m.participants_count, conta,
          link: 'https://zoom.us/recording' });
      }
      token = j.next_page_token || '';
    } while (token);
  }
  return out;
}
async function encontrosMeet(desde: Date) {
  // o Raio-X já classificou: 'ignorado' por ser de turma ou ter 3+ convidados de fora (o 1:1 fica 'ok')
  const { data } = await sb.from('crm_call_mentoria').select('pasta_id, titulo, inicio, pasta_url, motivo, status')
    .eq('status', 'ignorado').gte('inicio', desde.toISOString());
  return (data || []).filter((c: any) => !/^André/.test(c.motivo || ''))
    .map((c: any) => ({ origem: 'meet', referencia: c.pasta_id, titulo: c.titulo, inicio: c.inicio, duracao_min: null, participantes: null, conta: 'Google Meet do contato@ (pasta no Drive)', link: c.pasta_url }));
}

// encontro de grupo de produto? (1:1, curtas e reuniões internas sem produto no título ficam de fora)
function filtrar(lista: any[]) {
  const entram: any[] = [], fora: any[] = [];
  for (const e of lista) {
    const produto = classifica(e.titulo);
    if (e.duracao_min != null && e.duracao_min < MIN_DURACAO) { fora.push({ ...e, motivo: 'curta' }); continue; }
    if (e.participantes != null && e.participantes < MIN_PARTICIPANTES) { fora.push({ ...e, motivo: '1:1' }); continue; }
    if (!produto) { fora.push({ ...e, motivo: 'sem produto no título' }); continue; }
    entram.push({ ...e, produto, destino: DESTINO[produto] || null });
  }
  return { entram, fora };
}

// ---------------- mensagens ----------------
function textoAviso(e: any, marcar: string[], teste: boolean) {
  const m = teste ? '@Luiz Guilherme @Rafa' : marcar.map((i) => `<@${i}>`).join(' ');
  return `🎬 **Gravação para subir: ${NOME[e.produto] || e.produto}**\n${m}\n\n`
    + `**${e.titulo}**\n📅 ${quando(e.inicio)}${e.duracao_min ? ` · ${e.duracao_min} min` : ''}\n`
    + `📁 Onde está: ${e.conta}${e.origem === 'meet' ? ` · [abrir pasta](<${e.link}>)` : ''}\n`
    + `📍 Sobe em: **${e.destino || 'confirmar'}**${e.destino ? ' (provável)' : ''}\n\n`
    + `Depois de subir, reaja com ✅ nesta mensagem. Se não precisar subir, reaja com ❌.\n`
    + `Se subiu em outro lugar, responda aqui dizendo onde.\n🤖 _Aviso automático do agente IA Pinguim_`;
}

// baixa pelas reações (✅ subiu / ❌ não precisa) e "onde subiu" pelas respostas à mensagem
async function conferirBaixas(cfg: any) {
  const { data: pend } = await sb.from('gravacao_aviso').select('*').eq('status', 'pendente').not('discord_msg_id', 'is', null);
  if (!pend?.length) return 0;
  const me = await discord('/users/@me');
  const recentes = await discord(`/channels/${cfg.canal_id}/messages?limit=100`);
  let baixas = 0;
  for (const a of pend) {
    const respostas = (Array.isArray(recentes) ? recentes : []).filter((x: any) => x.message_reference?.message_id === a.discord_msg_id && !x.author?.bot)
      .map((x: any) => `${x.author.global_name || x.author.username}: ${x.content}`);
    let status: string | null = null, quem = '';
    for (const [emoji, st] of [['✅', 'subida'], ['❌', 'nao_precisa']]) {
      const us = await discord(`/channels/${cfg.canal_id}/messages/${a.discord_msg_id}/reactions/${encodeURIComponent(emoji)}`);
      const humano = (Array.isArray(us) ? us : []).find((u: any) => u.id !== me.id && !u.bot);
      if (humano) { status = st; quem = humano.global_name || humano.username; break; }
    }
    const patch: any = {};
    if (respostas.length) patch.onde_subiu = respostas.join(' | ').slice(0, 1000);
    if (status) Object.assign(patch, { status, baixa_por: quem, baixa_em: new Date().toISOString() });
    if (Object.keys(patch).length) await sb.from('gravacao_aviso').update(patch).eq('id', a.id);
    if (status) baixas++;
  }
  return baixas;
}

// lembrete das 9h: o que tem mais de 12h sem baixa
async function lembrete(cfg: any) {
  const hoje = sp(new Date()).toISOString().slice(0, 10);
  if (cfg.ultimo_lembrete === hoje) return null;
  const { data: pend } = await sb.from('gravacao_aviso').select('*').eq('status', 'pendente').lt('criado_em', new Date(Date.now() - 12 * 3600e3).toISOString()).order('inicio');
  await sb.from('gravacao_config').update({ ultimo_lembrete: hoje }).eq('id', 1);
  if (!pend?.length) return 0;
  const link = (a: any) => `https://discord.com/channels/1083429941300969574/${cfg.canal_id}/${a.discord_msg_id}`;
  const linhas = pend.map((a: any) => `• **${NOME[a.produto] || a.produto}** · ${a.titulo} · ${quando(a.inicio)} → ${a.destino || 'confirmar'} · [ver aviso](<${link(a)}>)`);
  await discord(`/channels/${cfg.canal_id}/messages`, { method: 'POST', body: JSON.stringify({
    content: (`☀️ **Gravações ainda sem baixa (${pend.length})**\n${cfg.marcar.map((i: string) => `<@${i}>`).join(' ')}\n\n${linhas.join('\n')}\n\nReaja com ✅ no aviso de cada uma depois de subir (ou ❌ se não precisar).\n🤖 _Aviso automático do agente IA Pinguim_`).slice(0, 1990),
    allowed_mentions: { users: cfg.marcar } }) });
  return pend.length;
}

async function rodar(body: any) {
  const { data: cfg } = await sb.from('gravacao_config').select('*').eq('id', 1).single();
  if (body.teste) {
    const desde = new Date(body.desde || cfg.desde);
    const { entram, fora } = filtrar([...(await encontrosZoom(desde)), ...(await encontrosMeet(desde))]);
    entram.sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio));
    await dmCodina(`🧪 **TESTE: avisos de gravação** (iriam no #gravacoes-para-subir), encontros desde ${quando(desde.toISOString())}: ${entram.length}`);
    for (const e of entram.slice(0, Number(body.max) || 3)) await dmCodina(textoAviso(e, cfg.marcar, true));
    return { entram: entram.map((e) => `${quando(e.inicio)} · ${e.produto} → ${e.destino} · ${e.titulo} · ${e.conta}`), fora: fora.map((e) => `${quando(e.inicio)} · ${e.motivo} · ${e.titulo}`) };
  }
  if (!cfg.ativo) return { ativo: false };
  const desde = new Date(cfg.desde);
  const { entram } = filtrar([...(await encontrosZoom(desde)), ...(await encontrosMeet(desde))]);
  const novos: string[] = [];
  for (const e of entram.sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))) {
    const { data: ja } = await sb.from('gravacao_aviso').select('id').eq('origem', e.origem).eq('referencia', e.referencia).limit(1);
    if (ja?.length) continue;
    const { data: row, error } = await sb.from('gravacao_aviso').insert({ origem: e.origem, referencia: e.referencia, titulo: e.titulo, produto: e.produto, destino: e.destino,
      inicio: e.inicio, duracao_min: e.duracao_min, conta: e.conta, link: e.link }).select('id').single();
    if (error) continue; // corrida com outra rodada: a outra avisa
    const msg = await discord(`/channels/${cfg.canal_id}/messages`, { method: 'POST', body: JSON.stringify({ content: textoAviso(e, cfg.marcar, false), allowed_mentions: { users: cfg.marcar } }) });
    await sb.from('gravacao_aviso').update({ discord_msg_id: msg?.id || null }).eq('id', row.id);
    novos.push(e.titulo);
  }
  const baixas = await conferirBaixas(cfg);
  const agora = sp(new Date());
  const lemb = agora.getUTCHours() === 9 && agora.getUTCMinutes() < 15 ? await lembrete(cfg) : null;
  return { novos, baixas, lembrete: lemb };
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
