// ========================================================================
// Edge Function: alinhamento-semanal-worker
// ========================================================================
// Call de alinhamento semanal da equipe Pinguim (André 24/11/2026): toda segunda às 10h, evento recorrente na agenda
// do contato@ com Google Meet (o link é o mesmo toda semana) e o time convidado. No canal do Discord «Time - Pedro»:
//   9h  → "falta 1 hora", com os detalhes e o link · 10h → "estamos ao vivo, entrem na sala", com o link.
// Antes de postar, lê na agenda a ocorrência do dia: se foi cancelada/movida ou a recorrência acabou, não posta.
// Para parar: encerrar a recorrência na agenda (ou ativo=false na config).
// Modos (body): {momento:'aviso'|'ao_vivo'} = cron · {teste:true} = as duas mensagens só no privado do Codina
//               · {criar:true} = cria o evento recorrente (uma vez) e guarda o id na config.
// Config: pinguim.alinhamento_semanal_config (id=1).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
const CONSUMIDOR = 'alinhamento-semanal-worker';
const AGENDA = 'contato@agenciapinguim.com';
const DISCORD_CODINA = '1077338884981133413';
const DS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const brt = (d = new Date()) => { const x = new Date(+d - 3 * 3600e3); return { dia: x.toISOString().slice(0, 10), min: x.getUTCHours() * 60 + x.getUTCMinutes() }; };
const ddmm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
const hm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '');

async function tokenGoogle(): Promise<string> {
  const { data: c } = await sb.from('conexoes_google').select('refresh_token').eq('email_google', AGENDA).is('revogado_em', null).limit(1).maybeSingle();
  if (!c) throw new Error('conexão Google do contato@ não encontrada');
  const [id, sec] = await Promise.all([getChave('GOOGLE_OAUTH_CLIENT_ID', CONSUMIDOR), getChave('GOOGLE_OAUTH_CLIENT_SECRET', CONSUMIDOR)]);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: c.refresh_token, client_id: id, client_secret: sec, grant_type: 'refresh_token' }) });
  const j = await r.json(); if (!j.access_token) throw new Error('Google: ' + (j.error_description || j.error)); return j.access_token;
}
const CAL = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(AGENDA)}/events`;
const meetDe = (e: any) => e?.hangoutLink || (e?.conferenceData?.entryPoints || []).find((p: any) => p.entryPointType === 'video')?.uri || null;

// a ocorrência de hoje da série (ou null se não houver call hoje)
async function ocorrenciaDeHoje(cfg: any) {
  const tok = await tokenGoogle(), hoje = brt().dia;
  const ini = new Date(Date.parse(hoje + 'T00:00:00-03:00')).toISOString(), fim = new Date(Date.parse(hoje + 'T23:59:59-03:00')).toISOString();
  const r = await fetch(`${CAL}/${encodeURIComponent(cfg.evento_id)}/instances?timeMin=${ini}&timeMax=${fim}`, { headers: { Authorization: `Bearer ${tok}` } });
  const j = await r.json(); if (j.error) throw new Error('Agenda: ' + j.error.message);
  const e = (j.items || []).find((x: any) => x.status !== 'cancelled' && x.start?.dateTime);
  if (!e) return null;
  const a = brt(new Date(e.start.dateTime)), b = brt(new Date(e.end.dateTime));
  return { dia: a.dia, ini: a.min, fim: b.min, meet: meetDe(e), titulo: e.summary };
}

const mencoes = (cfg: any, teste: boolean) => (cfg.pessoas || []).map((p: any) => (teste ? '@' + p.nome : `<@${p.discord}>`)).join(' ');
function textoAviso(cfg: any, o: any, teste: boolean) {
  return [`📅 **${cfg.titulo}**`, mencoes(cfg, teste), '',
    `Falta 1 hora! Hoje, ${DS[new Date(o.dia + 'T12:00:00Z').getUTCDay()]} (${ddmm(o.dia)}), das ${hm(o.ini)} às ${hm(o.fim)}, temos o nosso alinhamento semanal.`, '',
    `🔗 Sala: ${o.meet || '(link do Google Meet)'}`, '',
    'Tragam o que avançou na semana, o que está travado e as prioridades desta semana.'].join('\n');
}
function textoAoVivo(cfg: any, o: any, teste: boolean) {
  return [`🔴 **Estamos ao vivo!** O alinhamento semanal da equipe Pinguim começou agora.`, mencoes(cfg, teste), '',
    `👉 Entrem na sala: ${o.meet || '(link do Google Meet)'}`].join('\n');
}
async function postar(canal: string | null, texto: string, ids: string[]) {
  const bot = await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR), h = { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' };
  let destino = canal;
  if (!destino) { const dm = await (await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: h, body: JSON.stringify({ recipient_id: DISCORD_CODINA }) })).json(); destino = dm.id; }
  const r = await fetch(`https://discord.com/api/v10/channels/${destino}/messages`, { method: 'POST', headers: h, body: JSON.stringify({ content: texto.slice(0, 1900), allowed_mentions: { users: ids } }) });
  if (!r.ok) throw new Error('Discord ' + r.status + ': ' + (await r.text()).slice(0, 150));
}

async function rodar(body: any) {
  const { data: cfg } = await sb.from('alinhamento_semanal_config').select('*').eq('id', 1).single();
  if (body.criar) {
    if (cfg.evento_id) return { ok: true, ja_existia: cfg.evento_id };
    const tok = await tokenGoogle(), [h, m] = String(cfg.hora || '10:00').split(':').map(Number);
    const ini = `${cfg.primeira}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, fimMin = h * 60 + m + (cfg.duracao_min || 60);
    const fim = `${cfg.primeira}T${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}:00`;
    const r = await fetch(`${CAL}?conferenceDataVersion=1&sendUpdates=all`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: cfg.titulo, description: 'Alinhamento semanal da equipe Pinguim, toda segunda-feira. Avisos no Discord (canal Time - Pedro) às 9h e às 10h.',
        start: { dateTime: ini, timeZone: 'America/Sao_Paulo' }, end: { dateTime: fim, timeZone: 'America/Sao_Paulo' }, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
        attendees: (cfg.pessoas || []).filter((p: any) => p.email).map((p: any) => ({ email: p.email })),
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }) });
    const j = await r.json(); if (!j.id) throw new Error('criar evento: ' + JSON.stringify(j.error || j).slice(0, 200));
    await sb.from('alinhamento_semanal_config').update({ evento_id: j.id }).eq('id', 1);
    return { ok: true, evento_id: j.id, meet: meetDe(j), link: j.htmlLink };
  }
  const ids = (cfg.pessoas || []).map((p: any) => p.discord).filter(Boolean);
  if (body.teste) { // as duas mensagens no privado do Codina, com a próxima segunda
    const o = cfg.evento_id ? (await ocorrenciaDeHoje(cfg)) : null;
    const ex = o || { dia: cfg.primeira, ini: 600, fim: 600 + (cfg.duracao_min || 60), meet: null };
    await postar(null, '🧪 **TESTE · aviso das 9h** (no canal Time - Pedro, marcando as pessoas)\n\n' + textoAviso(cfg, ex, true), []);
    await postar(null, '🧪 **TESTE · aviso das 10h**\n\n' + textoAoVivo(cfg, ex, true), []);
    return { ok: true, teste: true };
  }
  if (!cfg.ativo || !cfg.evento_id) return { ok: true, ativo: false };
  const o = await ocorrenciaDeHoje(cfg);
  if (!o) return { ok: true, sem_call_hoje: true };
  const texto = body.momento === 'ao_vivo' ? textoAoVivo(cfg, o, false) : textoAviso(cfg, o, false);
  await postar(cfg.canal, texto, ids);
  return { ok: true, postou: body.momento || 'aviso', dia: o.dia };
}

serve(async (req) => {
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = ''; try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (auth !== SERVICE && role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  let body: any = {}; try { body = await req.json(); } catch (_) { /* cron */ }
  try { return new Response(JSON.stringify(await rodar(body)), { headers: { 'Content-Type': 'application/json' } }); }
  catch (e) {
    const erro = String((e as Error).message || e).slice(0, 300);
    if (!body.teste) await postar(null, `⚠️ **Alinhamento semanal:** o aviso não saiu.\n${erro}`, []).catch(() => null);
    return new Response(JSON.stringify({ erro }), { status: 500 });
  }
});
