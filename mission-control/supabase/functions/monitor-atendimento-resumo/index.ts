// ========================================================================
// Edge Function: monitor-atendimento-resumo
// Fechamento diário do atendimento nos grupos de alunos (schema-045).
//
// Cron 8h BRT (job monitor-atendimento-resumo). Olha as perguntas do DIA
// ANTERIOR em pinguim.monitor_atendimentos e posta no destino de
// atendimento (monitor_atendimento_config: canal ou DM):
//   · perguntas / respondidas por ADM / pendentes
//   · tempo de resposta médio, mediano e o mais lento
//   · quebra por grupo
//   · lista das pendentes (marca quando um colega respondeu no grupo)
//   · pendentes de dias anteriores que seguem abertas
//
// Body opcional: { dia: 'AAAA-MM-DD' } → fecha esse dia (teste/reprocesso).
//                { dry_run: true }      → devolve o texto sem postar.
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

function fmtDuracao(seg: number): string {
  const min = Math.max(1, Math.round(seg / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
  const d = Math.floor(h / 24), hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
}

function hhmm(iso: string): string {
  const d = new Date(new Date(iso).getTime() + TZ_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function ddmm(iso: string): string {
  const d = new Date(new Date(iso).getTime() + TZ_OFFSET_MS);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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

// dia BRT 'AAAA-MM-DD' → [início, fim) em UTC
function janela(dia: string): [string, string] {
  const ini = new Date(`${dia}T03:00:00.000Z`);
  return [ini.toISOString(), new Date(ini.getTime() + 86400 * 1000).toISOString()];
}

function ontemBRT(): string {
  return new Date(Date.now() + TZ_OFFSET_MS - 86400 * 1000).toISOString().slice(0, 10);
}

// colega (não-ADM, não o próprio aluno) deu reply no aluno depois da pergunta
async function colegasResponderam(pend: any[]): Promise<Set<string>> {
  const resp = new Set<string>();
  for (const a of pend) {
    const { data } = await sb.from('monitor_grupos_mensagens').select('id')
      .eq('grupo_jid', a.grupo_jid).eq('respondeu_jid', a.aluno_jid).eq('eh_admin', false)
      .neq('remetente_jid', a.aluno_jid).gte('criado_em', a.perguntado_em).limit(1);
    if (data && data.length > 0) resp.add(a.id);
  }
  return resp;
}

async function montar(dia: string): Promise<string[]> {
  const [ini, fim] = janela(dia);
  const { data, error } = await sb.from('monitor_atendimentos').select('*')
    .gte('perguntado_em', ini).lt('perguntado_em', fim).order('perguntado_em');
  if (error) throw new Error(`ler atendimentos: ${error.message}`);
  const todos = data ?? [];
  const resp = todos.filter((a) => a.status === 'respondida');
  const pend = todos.filter((a) => a.status === 'pendente');

  const { count: antigas } = await sb.from('monitor_atendimentos').select('id', { count: 'exact', head: true })
    .eq('status', 'pendente').lt('perguntado_em', ini)
    .gte('perguntado_em', new Date(new Date(ini).getTime() - 7 * 86400 * 1000).toISOString());

  const dt = new Date(`${dia}T12:00:00Z`);
  const titulo = `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')} (${DIAS_SEMANA[dt.getUTCDay()]})`;
  const linhas: string[] = [
    '━━━━━━━━━━━━━━━━━━━━',
    `📋 **FECHAMENTO DO ATENDIMENTO — ${titulo}** · grupos de alunos`,
    '',
  ];
  if (todos.length === 0) {
    linhas.push('Nenhuma pergunta de aluno detectada no dia.');
  } else {
    const pct = Math.round((resp.length / todos.length) * 100);
    linhas.push(`❓ Perguntas: **${todos.length}** · ✅ Respondidas por ADM: **${resp.length}** (${pct}%) · ⏳ Pendentes: **${pend.length}**`);
    if (resp.length > 0) {
      const tempos = resp.map((a) => a.tempo_resposta_seg || 0).sort((a, b) => a - b);
      const media = tempos.reduce((s, t) => s + t, 0) / tempos.length;
      const mediana = tempos[Math.floor(tempos.length / 2)];
      linhas.push(`⏱️ Tempo de resposta: médio **${fmtDuracao(media)}** · mediano **${fmtDuracao(mediana)}** · mais lento **${fmtDuracao(tempos[tempos.length - 1])}**`);
      const porAdm: Record<string, number> = {};
      for (const a of resp) porAdm[a.adm_nome || 'ADM'] = (porAdm[a.adm_nome || 'ADM'] || 0) + 1;
      linhas.push(`🙋 Quem respondeu: ${Object.entries(porAdm).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(' · ')}`);
    }
    const porGrupo: Record<string, { t: number; r: number }> = {};
    for (const a of todos) {
      const g = (porGrupo[a.grupo_nome || a.grupo_jid] ??= { t: 0, r: 0 });
      g.t++; if (a.status === 'respondida') g.r++;
    }
    linhas.push('', '**Por grupo:**');
    for (const [g, v] of Object.entries(porGrupo).sort((a, b) => b[1].t - a[1].t)) {
      linhas.push(`• ${g}: ${v.t} (✅ ${v.r} · ⏳ ${v.t - v.r})`);
    }
    if (pend.length > 0) {
      const colega = await colegasResponderam(pend);
      linhas.push('', `**⏳ Pendentes (${pend.length})** — sem resposta de ADM em reply/@:`);
      pend.forEach((a, i) => {
        const quem = `${a.aluno_nome || 'sem nome'}${a.aluno_telefone ? ` (${fmtTel(a.aluno_telefone)})` : ''}`;
        const tag = colega.has(a.id) ? ' · 💬 colega respondeu' : '';
        linhas.push(`${i + 1}. **[${a.grupo_nome}]** ${quem} · ${hhmm(a.perguntado_em)}${tag}`, `   > ${umaLinha(a.pergunta_texto, 220)}`);
      });
    }
  }
  if (antigas && antigas > 0) linhas.push('', `📌 Pendentes de dias anteriores (últimos 7 dias) ainda abertas: **${antigas}**`);

  // Discord: 2000 chars por mensagem → quebra por linha
  const partes: string[] = [];
  let atual = '';
  for (const l of linhas) {
    if ((atual + '\n' + l).length > 1900) { partes.push(atual); atual = l; }
    else atual = atual ? `${atual}\n${l}` : l;
  }
  if (atual) partes.push(atual);
  return partes;
}

async function postar(partes: string[]) {
  const { data: cfg } = await sb.from('monitor_atendimento_config').select('*').eq('id', 1).maybeSingle();
  if (!cfg || !cfg.resumo_ativo) return 'resumo desativado';
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
    for (const p of partes) {
      const r = await fetch(`https://discord.com/api/v10/channels/${canal}/messages`, {
        method: 'POST', headers: h, body: JSON.stringify({ content: p, allowed_mentions: { parse: [] }, flags: 4 }),
      });
      if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 150)}`);
    }
  }
  return `postado em ${destinos.length} destino(s)`;
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
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(body.dia || '') ? body.dia : ontemBRT();
    const partes = await montar(dia);
    if (body.dry_run) return new Response(JSON.stringify({ dia, partes }), { headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ dia, resultado: await postar(partes) }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String((e as Error).message || e) }), { status: 500 });
  }
});
