// ========================================================================
// Edge Function: monitor-atendimento-resumo
// Painel CS no Discord (schema-045 + schema-046). Dois modos:
//
// 1. Fechamento diário (cron job monitor-atendimento-resumo, 8h BRT, corpo
//    vazio): solicitações do DIA ANTERIOR em pinguim.monitor_atendimentos.
//      · msg 1 = painel geral: totais, tempo de resposta em horas ÚTEIS
//        (config: seg-sex 9h-18h), fora do horário, canais com cor, ADMs
//      · msgs seguintes = 1 bloco por canal (grupo ou número privado) que
//        tem pendência, cada solicitação com código A-0000
//    Cor do canal: 🟢 nada pendente · 🟡 pendente dentro do SLA ·
//                  🔴 pendente há mais de sla_min minutos úteis
//
// 2. Alerta de SLA ({modo:'sla'}, cron monitor-atendimento-sla 10 em 10 min):
//    pendentes que passaram de sla_min úteis sem resposta de ADM → 1 msg
//    consolidada por rodada. Cada solicitação alerta uma vez só.
//
// Body opcional: { dia: 'AAAA-MM-DD' } → fecha esse dia (teste/reprocesso).
//                { dry_run: true }      → devolve o texto sem postar.
// Destino: pinguim.monitor_atendimento_config (canal_id ou DM).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});
const TZ_OFFSET_MS = -3 * 3600 * 1000; // America/Sao_Paulo
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const LIMITE_MSG = 1900; // Discord aceita 2000

// ---------- formatação ----------
function fmtDuracao(seg: number): string {
  const min = Math.max(1, Math.round(seg / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
  const d = Math.floor(h / 24), hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
}

function brt(iso: string): Date { return new Date(new Date(iso).getTime() + TZ_OFFSET_MS); }
function hhmm(iso: string): string {
  const d = brt(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function ddmmhh(iso: string): string {
  const d = brt(iso);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${hhmm(iso)}`;
}

function fmtTel(tel: string): string {
  if (!tel) return '';
  if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
    const ddd = tel.slice(2, 4), resto = tel.slice(4);
    return `+55 ${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
  }
  return `+${tel}`;
}

function umaLinha(t: string, max: number): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

const codigo = (a: any) => `\`A-${String(a.numero).padStart(4, '0')}\``;
const aluno = (a: any) => `${a.aluno_nome || 'sem nome'}${a.aluno_telefone ? ` (${fmtTel(a.aluno_telefone)})` : ''}`;
const nomeCanal = (a: any) => `${a.canal_tipo === 'privado' ? '📱 ' : ''}${a.grupo_nome || a.grupo_jid}`;

// junta linhas em mensagens de até LIMITE_MSG, sem quebrar um item no meio
function empacotar(itens: string[]): string[] {
  const partes: string[] = [];
  let atual = '';
  for (const it of itens) {
    if (atual && (atual + '\n' + it).length > LIMITE_MSG) { partes.push(atual); atual = it; }
    else atual = atual ? `${atual}\n${it}` : it;
  }
  if (atual) partes.push(atual);
  return partes;
}

// ---------- dados ----------
async function config() {
  const { data } = await sb.from('monitor_atendimento_config').select('*').eq('id', 1).maybeSingle();
  if (!data) throw new Error('monitor_atendimento_config vazia');
  return data;
}

async function segundosUteis(ini: string, fim: string): Promise<number> {
  const { data, error } = await sb.rpc('monitor_segundos_uteis', { p_ini: ini, p_fim: fim });
  if (error) throw new Error(`segundos úteis: ${error.message}`);
  return Number(data) || 0;
}

// dia BRT 'AAAA-MM-DD' → [início, fim) em UTC
function janela(dia: string): [string, string] {
  const ini = new Date(`${dia}T03:00:00.000Z`);
  return [ini.toISOString(), new Date(ini.getTime() + 86400 * 1000).toISOString()];
}
function ontemBRT(): string {
  return new Date(Date.now() + TZ_OFFSET_MS - 86400 * 1000).toISOString().slice(0, 10);
}

// colega (não-ADM, não o próprio aluno) deu reply no aluno depois da pergunta
async function colegaRespondeu(a: any): Promise<boolean> {
  const { data } = await sb.from('monitor_grupos_mensagens').select('id')
    .eq('grupo_jid', a.grupo_jid).eq('respondeu_jid', a.aluno_jid).eq('eh_admin', false)
    .neq('remetente_jid', a.aluno_jid).gte('criado_em', a.perguntado_em).limit(1);
  return !!(data && data.length > 0);
}

// ---------- modo 1: fechamento diário ----------
async function montarPainel(dia: string, cfg: any): Promise<string[]> {
  const [ini, fim] = janela(dia);
  const { data, error } = await sb.from('monitor_atendimentos').select('*')
    .gte('perguntado_em', ini).lt('perguntado_em', fim).order('perguntado_em');
  if (error) throw new Error(`ler atendimentos: ${error.message}`);
  const todos = data ?? [];
  const resp = todos.filter((a) => a.status === 'respondida');
  const pend = todos.filter((a) => a.status === 'pendente');
  const agora = new Date().toISOString();
  const slaSeg = cfg.sla_min * 60;

  // pendente estourou o SLA? (tempo útil desde a pergunta até agora)
  const estourou = new Set<string>();
  for (const a of pend) if (await segundosUteis(a.perguntado_em, agora) >= slaSeg) estourou.add(a.id);

  const { count: acumulado } = await sb.from('monitor_atendimentos').select('id', { count: 'exact', head: true })
    .eq('status', 'pendente').lt('perguntado_em', ini)
    .gte('perguntado_em', new Date(new Date(ini).getTime() - 7 * 86400 * 1000).toISOString());

  const dt = new Date(`${dia}T12:00:00Z`);
  const isodow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
  const diaUtil = (cfg.dias_uteis || []).includes(isodow);
  const titulo = `${DIAS_SEMANA[dt.getUTCDay()]} ${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;

  const painel: string[] = [
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📋 **PAINEL CS — fechamento de ${titulo}**`,
  ];
  if (!diaUtil) painel.push(`🗓️ *Dia sem expediente — o tempo de resposta só começa a contar no próximo dia útil às ${cfg.hora_ini}h.*`);
  painel.push('');

  if (todos.length === 0) {
    painel.push('Nenhuma solicitação de aluno no dia.');
  } else {
    const pct = Math.round((resp.length / todos.length) * 100);
    painel.push(`📨 Solicitações: **${todos.length}**   ✅ Respondidas: **${resp.length}** (${pct}%)   ⏳ Pendentes: **${pend.length}**`);
    const uteis = resp.map((a) => a.tempo_util_seg || 0).filter((t) => t > 0).sort((a, b) => a - b);
    if (uteis.length > 0) {
      const media = uteis.reduce((s, t) => s + t, 0) / uteis.length;
      painel.push(`⏱️ Tempo de resposta (horário de atendimento): médio **${fmtDuracao(media)}** · mais lento **${fmtDuracao(uteis[uteis.length - 1])}**`);
    }
    const fora = todos.filter((a) => a.fora_horario).length;
    if (fora > 0) painel.push(`🌙 ${fora} chegaram fora do horário (seg–sex ${cfg.hora_ini}h–${cfg.hora_fim}h)`);

    // canais: pior cor primeiro, depois volume
    const canais = new Map<string, { nome: string; t: number; r: number; p: number; vermelho: boolean }>();
    for (const a of todos) {
      const c = canais.get(a.grupo_jid) ?? { nome: nomeCanal(a), t: 0, r: 0, p: 0, vermelho: false };
      c.t++;
      if (a.status === 'respondida') c.r++; else { c.p++; if (estourou.has(a.id)) c.vermelho = true; }
      canais.set(a.grupo_jid, c);
    }
    const cor = (c: any) => c.p === 0 ? '🟢' : c.vermelho ? '🔴' : '🟡';
    const peso = (c: any) => c.p === 0 ? 2 : c.vermelho ? 0 : 1;
    const ordenados = [...canais.values()].sort((a, b) => peso(a) - peso(b) || b.t - a.t);
    painel.push('', '**CANAIS**');
    for (const c of ordenados) {
      painel.push(`${cor(c)} **${c.nome}** — ${c.t} · ✅ ${c.r}${c.p ? ` · ⏳ ${c.p}` : ''}`);
    }

    if (resp.length > 0) {
      const porAdm: Record<string, number> = {};
      for (const a of resp) porAdm[a.adm_nome || 'ADM'] = (porAdm[a.adm_nome || 'ADM'] || 0) + 1;
      painel.push('', `🙋 Quem respondeu: ${Object.entries(porAdm).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(' · ')}`);
    }
    painel.push(`🔴 = pendente há mais de ${fmtDuracao(slaSeg)} úteis`);
  }
  if (acumulado && acumulado > 0) painel.push(`📌 Acumulado sem resposta dos 7 dias anteriores: **${acumulado}**`);

  const mensagens = empacotar(painel);

  // um bloco por canal com pendência (mesma ordem do painel)
  const porCanal = new Map<string, any[]>();
  for (const a of pend) porCanal.set(a.grupo_jid, [...(porCanal.get(a.grupo_jid) ?? []), a]);
  const blocos = [...porCanal.values()].sort((x, y) =>
    Number(y.some((a) => estourou.has(a.id))) - Number(x.some((a) => estourou.has(a.id))) || y.length - x.length);
  for (const lista of blocos) {
    const vermelho = lista.some((a) => estourou.has(a.id));
    const itens: string[] = [
      '━━━━━━━━━━━━━━━━━━━━━━━━',
      `${vermelho ? '🔴' : '🟡'} **${nomeCanal(lista[0])}** — ${lista.length} pendente${lista.length > 1 ? 's' : ''}`,
    ];
    for (const a of lista) {
      const tags = [hhmm(a.perguntado_em)];
      if (a.fora_horario) tags.push('🌙 fora do horário');
      if (await colegaRespondeu(a)) tags.push('💬 colega respondeu');
      itens.push('', `${codigo(a)} · ${aluno(a)} · ${tags.join(' · ')}`, `> ${umaLinha(a.pergunta_texto, 260)}`);
    }
    mensagens.push(...empacotar(itens));
  }
  return mensagens;
}

// ---------- modo 2: alerta de SLA ----------
async function montarAlertaSla(cfg: any): Promise<{ mensagens: string[]; ids: string[] }> {
  if (!cfg.alerta_sla_ativo) return { mensagens: [], ids: [] };
  const agora = new Date().toISOString();
  const desde = new Date(Math.max(new Date(cfg.sla_desde).getTime(), Date.now() - 3 * 86400 * 1000)).toISOString();
  const { data } = await sb.from('monitor_atendimentos').select('*')
    .eq('status', 'pendente').is('alerta_sla_em', null).gte('perguntado_em', desde).order('perguntado_em');
  const vencidos: any[] = [];
  for (const a of data ?? []) {
    const util = await segundosUteis(a.perguntado_em, agora);
    if (util >= cfg.sla_min * 60) vencidos.push(a);
  }
  if (vencidos.length === 0) return { mensagens: [], ids: [] };
  const itens: string[] = [
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `⏰ **SEM RESPOSTA HÁ MAIS DE ${fmtDuracao(cfg.sla_min * 60).toUpperCase()} ÚTEIS** (${vencidos.length})`,
  ];
  for (const a of vencidos) {
    itens.push('', `${codigo(a)} · **${nomeCanal(a)}** · ${aluno(a)} · perguntou ${ddmmhh(a.perguntado_em)}`,
      `> ${umaLinha(a.pergunta_texto, 260)}`);
  }
  return { mensagens: empacotar(itens), ids: vencidos.map((a) => a.id) };
}

// ---------- discord ----------
async function postar(cfg: any, mensagens: string[]) {
  const bot = await getChave('DISCORD_BOT_TOKEN', 'monitor-atendimento-resumo');
  const h = { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' };
  const destinos: string[] = [];
  if (cfg.canal_id) destinos.push(cfg.canal_id);
  else {
    for (const u of cfg.dm_user_ids || []) {
      const r = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: h, body: JSON.stringify({ recipient_id: u }) });
      if (r.ok) destinos.push((await r.json()).id);
    }
  }
  if (destinos.length === 0) throw new Error('nenhum destino Discord disponível');
  for (const canal of destinos) {
    for (const m of mensagens) {
      const r = await fetch(`https://discord.com/api/v10/channels/${canal}/messages`, {
        method: 'POST', headers: h, body: JSON.stringify({ content: m, allowed_mentions: { parse: [] }, flags: 4 }),
      });
      if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 150)}`);
    }
  }
  return `${mensagens.length} msg(s) em ${destinos.length} destino(s)`;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405 });
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = '';
  try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corpo vazio do cron */ }
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
  try {
    const cfg = await config();

    if (body.modo === 'sla') {
      const { mensagens, ids } = await montarAlertaSla(cfg);
      if (body.dry_run || mensagens.length === 0) return json({ modo: 'sla', vencidos: ids.length, mensagens });
      const resultado = await postar(cfg, mensagens);
      await sb.from('monitor_atendimentos').update({ alerta_sla_em: new Date().toISOString() }).in('id', ids);
      return json({ modo: 'sla', vencidos: ids.length, resultado });
    }

    const dia = /^\d{4}-\d{2}-\d{2}$/.test(body.dia || '') ? body.dia : ontemBRT();
    const mensagens = await montarPainel(dia, cfg);
    if (body.dry_run) return json({ dia, mensagens });
    if (!cfg.resumo_ativo) return json({ dia, resultado: 'resumo desativado' });
    return json({ dia, resultado: await postar(cfg, mensagens) });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String((e as Error).message || e) }), { status: 500 });
  }
});
