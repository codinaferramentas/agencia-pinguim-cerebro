// ========================================================================
// Edge Function: agenda-mentorias-worker
// Gestão de Agendas de Mentorias — Etapa 1 (Discord).
//
// Roda via pg_cron a cada 5 min (pinguim.disparar_edge_function).
// Em cada execução:
//   1. Lê os eventos do dia (BRT) das 3 agendas via Google Calendar API
//      (conta robô ferramenta@agenciapinguim.com, refresh_token em
//      pinguim.conexoes_google).
//   2. Se está na janela 07h-12h BRT e o resumo do dia ainda não foi
//      enviado → posta "Agenda do dia" no Discord #novo-grupo-pinguim.
//   3. Varre janelas de alerta por evento: 1h antes, 10min antes, na hora.
//      Dedup em pinguim.agenda_alertas_enviados (1 aviso por tipo+evento+horário).
//
// Corpo opcional (POST, service_role):
//   { dry_run: true }            → calcula tudo e devolve JSON, NÃO posta nem grava
//   { forcar_resumo: true }      → ignora a janela 07h-12h (respeita dedup)
//   { simular_agora: "ISO" }     → trava o relógio (só faz sentido com dry_run)
//
// Etapa 2 (futura): replicar os mesmos avisos no WhatsApp via Evolution.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

const CANAL_DISCORD = '1372556339578011701'; // #novo-grupo-pinguim
const CONTA_ROBO = 'ferramenta@agenciapinguim.com';

// America/Sao_Paulo é UTC-3 fixo (sem horário de verão desde 2019)
const TZ_OFFSET_MS = -3 * 3600 * 1000;

interface ConfigAgenda {
  slug: string;
  nome: string;
  calendarId: string;
  // Se presente: só alerta eventos que tenham PELO MENOS UM desses e-mails
  // entre os participantes (caso contato@ — agenda tem eventos de outros times)
  filtroParticipantes?: string[];
}

const AGENDAS: ConfigAgenda[] = [
  { slug: 'proalt', nome: 'ProAlt', calendarId: 'proalt.agenda@gmail.com' },
  { slug: 'elo', nome: 'ELO', calendarId: 'ciclo.agendas@gmail.com' },
  {
    slug: 'pinguim', nome: 'Pinguim', calendarId: 'contato@agenciapinguim.com',
    filtroParticipantes: ['rafael.agenciapinguim@gmail.com', 'jairo.agenciapinguim@gmail.com'],
  },
];

// E-mail (Google) → user id (Discord). Participante mapeado vira <@menção>
// nas mensagens — sem isso o pessoal não vê o aviso (pedido do Andre 14/ago).
const MENCAO_DISCORD: Record<string, string> = {
  'rafael.agenciapinguim@gmail.com': '1083728715726463068',   // Rafael Sousa
  'jairo.agenciapinguim@gmail.com': '1083731934238228590',    // Djairo Alves
  'fernandalisboa.agenciapinguim@gmail.com': '1210285892489449603', // Fernanda Lisboa (fora do filtro por ora)
};

// Quem é marcado quando o worker detecta CONFLITO entre agendas
// (Rafael, Djairo, Fernanda, Ingrid — pedido do Andre 14/ago)
const MENCOES_CONFLITO = [
  '1083728715726463068',  // Rafael Sousa
  '1083731934238228590',  // Djairo Alves
  '1210285892489449603',  // Fernanda Lisboa
  '1205120597433122846',  // Ingrid Nascimento
];

interface Evento {
  agenda_slug: string;
  agenda_nome: string;
  evento_id: string;
  titulo: string;
  inicio: Date;
  fim: Date | null;
  participantes: { email: string; nome?: string }[];
  meet: string | null;
}

// ---------- tempo ----------
function brt(d: Date): Date { return new Date(d.getTime() + TZ_OFFSET_MS); }
function horaBRT(d: Date): string {
  const b = brt(d);
  return `${String(b.getUTCHours()).padStart(2, '0')}h${String(b.getUTCMinutes()).padStart(2, '0')}`;
}
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// ---------- google ----------
async function accessTokenGoogle(): Promise<string> {
  const { data: conexao, error } = await sb.from('conexoes_google')
    .select('id, refresh_token')
    .eq('email_google', CONTA_ROBO)
    .is('revogado_em', null)
    .limit(1)
    .maybeSingle();
  if (error || !conexao) throw new Error(`Conexão Google de ${CONTA_ROBO} não encontrada: ${error?.message || 'sem linha'}`);

  const [client_id, client_secret] = await Promise.all([
    getChave('GOOGLE_OAUTH_CLIENT_ID', 'agenda-mentorias-worker'),
    getChave('GOOGLE_OAUTH_CLIENT_SECRET', 'agenda-mentorias-worker'),
  ]);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: conexao.refresh_token, client_id, client_secret, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Renovar access_token Google: ${j.error_description || j.error}`);
  return j.access_token as string;
}

function extrairMeet(e: any): string | null {
  if (e.hangoutLink) return e.hangoutLink;
  const entry = e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video');
  if (entry?.uri) return entry.uri;
  const texto = `${e.description || ''} ${e.location || ''}`;
  const m = texto.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  return m ? m[0] : null;
}

async function eventosDoDia(tok: string, inicioDia: Date, fimDia: Date): Promise<Evento[]> {
  const todos: Evento[] = [];
  for (const ag of AGENDAS) {
    const params = new URLSearchParams({
      singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
      timeMin: inicioDia.toISOString(), timeMax: fimDia.toISOString(),
    });
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ag.calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    const j = await r.json();
    if (!r.ok) throw new Error(`Google eventos ${ag.slug}: ${j.error?.message || r.status}`);

    for (const e of j.items || []) {
      // Não-alertáveis: sem título, bloco "Ocupado", evento de dia inteiro
      if (!e.summary || /ocupado/i.test(e.summary)) continue;
      if (!e.start?.dateTime) continue;
      const participantes = (e.attendees || [])
        .map((p: any) => ({ email: (p.email || '').toLowerCase(), nome: p.displayName }))
        .filter((p: any) => p.email && p.email !== ag.calendarId.toLowerCase());
      if (ag.filtroParticipantes) {
        const tem = participantes.some((p: { email: string }) => ag.filtroParticipantes!.includes(p.email));
        if (!tem) continue;
      }
      todos.push({
        agenda_slug: ag.slug,
        agenda_nome: ag.nome,
        evento_id: e.id,
        titulo: e.summary.trim(),
        inicio: new Date(e.start.dateTime),
        fim: e.end?.dateTime ? new Date(e.end.dateTime) : null,
        participantes,
        meet: extrairMeet(e),
      });
    }
  }
  return todos;
}

// ---------- discord ----------
async function postarDiscord(conteudo: string) {
  const bot = await getChave('DISCORD_BOT_TOKEN', 'agenda-mentorias-worker');
  // Discord limita 2000 chars/mensagem — quebra em blocos por linha
  const blocos: string[] = [];
  let atual = '';
  for (const linha of conteudo.split('\n')) {
    if ((atual + '\n' + linha).length > 1900) { blocos.push(atual); atual = linha; }
    else atual = atual ? atual + '\n' + linha : linha;
  }
  if (atual) blocos.push(atual);

  for (const bloco of blocos) {
    const r = await fetch(`https://discord.com/api/v10/channels/${CANAL_DISCORD}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${bot}`, 'Content-Type': 'application/json' },
      // flags 4 = SUPPRESS_EMBEDS — sem isso o Discord anexa um cartão "Meet"
      // por link, poluindo a mensagem (links continuam clicáveis)
      body: JSON.stringify({ content: bloco, allowed_mentions: { parse: ['users'] }, flags: 4 }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(`Discord ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    }
  }
}

// ---------- mensagens ----------
function linhaEvento(ev: Evento): string {
  let l = `• **${horaBRT(ev.inicio)}** — ${ev.titulo}`;
  const nomes = ev.participantes
    .map(p => MENCAO_DISCORD[p.email] ? `<@${MENCAO_DISCORD[p.email]}>` : (p.nome || p.email))
    .slice(0, 6);
  if (nomes.length) l += `\n  👥 ${nomes.join(', ')}`;
  if (ev.meet) l += `\n  🔗 ${ev.meet}`;
  return l;
}

function montarResumo(eventos: Evento[], agora: Date): string {
  const b = brt(agora);
  const dataFmt = `${DIAS_SEMANA[b.getUTCDay()]}, ${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}/${b.getUTCFullYear()}`;
  const linhas: string[] = [`📅 **Agenda do dia — ${dataFmt}**`];
  const vazias: string[] = [];
  for (const ag of AGENDAS) {
    const evs = eventos.filter(e => e.agenda_slug === ag.slug);
    if (!evs.length) { vazias.push(ag.nome); continue; }
    linhas.push('', `**${ag.nome}**${ag.filtroParticipantes ? ' _(Rafael & Djairo)_' : ''}`);
    for (const ev of evs) linhas.push(linhaEvento(ev));
  }
  if (vazias.length) linhas.push('', `_Sem encontros hoje: ${vazias.join(', ')}_`);
  return linhas.join('\n');
}

// Conflito = dois eventos alertáveis de AGENDAS DIFERENTES com horário
// sobreposto (os consultores atendem as 3 agendas; não podem estar em duas
// calls ao mesmo tempo). Dedup por par de eventos.
function detectarConflitos(eventos: Evento[]): { id: string; inicio: Date; a: Evento; b: Evento }[] {
  const conflitos: { id: string; inicio: Date; a: Evento; b: Evento }[] = [];
  for (let i = 0; i < eventos.length; i++) {
    for (let j = i + 1; j < eventos.length; j++) {
      const a = eventos[i], b = eventos[j];
      if (a.agenda_slug === b.agenda_slug) continue;
      const fimA = a.fim ?? new Date(a.inicio.getTime() + 3600_000);  // sem fim → assume 1h
      const fimB = b.fim ?? new Date(b.inicio.getTime() + 3600_000);
      const sobrepoe = a.inicio < fimB && b.inicio < fimA;
      if (!sobrepoe) continue;
      const id = [a.evento_id, b.evento_id].sort().join('+');
      conflitos.push({ id, inicio: new Date(Math.max(a.inicio.getTime(), b.inicio.getTime())), a, b });
    }
  }
  return conflitos;
}

function montarConflito(c: { a: Evento; b: Evento }): string {
  const mencoes = MENCOES_CONFLITO.map(id => `<@${id}>`).join(' ');
  return [
    `🚨 **CONFLITO DE AGENDA** ${mencoes}`,
    `Dois encontros no mesmo horário em agendas diferentes:`,
    `• [${c.a.agenda_nome}] **${horaBRT(c.a.inicio)}** — ${c.a.titulo}`,
    `• [${c.b.agenda_nome}] **${horaBRT(c.b.inicio)}** — ${c.b.titulo}`,
    `Alguém precisa remarcar um dos dois. 🙏`,
  ].join('\n');
}

function montarAlerta(tipo: string, ev: Evento): string {
  const cab = tipo === 'alerta_1h' ? '⏰ **Daqui a 1 hora**'
    : tipo === 'alerta_10min' ? '🔔 **Daqui a 10 minutos**'
    : '▶️ **COMEÇANDO AGORA**';
  return `${cab} — [${ev.agenda_nome}] ${ev.titulo} às **${horaBRT(ev.inicio)}**\n${linhaEvento(ev).split('\n').slice(1).join('\n') || ''}`.trim();
}

// ---------- dedup + envio ----------
async function jaEnviado(tipo: string, evento_id: string, evento_inicio: Date): Promise<boolean> {
  const { data } = await sb.from('agenda_alertas_enviados')
    .select('id')
    .eq('tipo', tipo).eq('evento_id', evento_id).eq('evento_inicio', evento_inicio.toISOString())
    .maybeSingle();
  return !!data;
}

async function marcarEnviado(tipo: string, evento_id: string, evento_inicio: Date, agenda: string, titulo: string): Promise<boolean> {
  // insert; se conflitar (outra execução concorrente já marcou), não envia
  const { error } = await sb.from('agenda_alertas_enviados')
    .insert({ tipo, evento_id, evento_inicio: evento_inicio.toISOString(), agenda, titulo });
  if (error) {
    if (String(error.code) === '23505') return false; // duplicado
    throw new Error(`marcarEnviado: ${error.message}`);
  }
  return true;
}

async function desmarcarEnviado(tipo: string, evento_id: string, evento_inicio: Date) {
  await sb.from('agenda_alertas_enviados').delete()
    .eq('tipo', tipo).eq('evento_id', evento_id).eq('evento_inicio', evento_inicio.toISOString());
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405 });
  // Assinatura já foi validada pelo verify_jwt da plataforma; aqui só
  // exigimos role=service_role (bloqueia anon key).
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = '';
  try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (role !== 'service_role') {
    return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corpo vazio do cron */ }
  const dryRun = !!body.dry_run;
  const agora = body.simular_agora ? new Date(body.simular_agora) : new Date();

  const log: any = { agora: agora.toISOString(), hora_brt: horaBRT(agora), dry_run: dryRun, resumo: null, alertas: [] };

  // Fim de semana (sáb/dom em São Paulo): ninguém trabalhando → nenhum aviso
  // (regra de negócio do Andre, 14/ago). Segunda 7h o resumo volta normal.
  const diaSemana = brt(agora).getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    return new Response(JSON.stringify({ ok: true, ...log, pulado: 'fim de semana (BRT), sem avisos' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Janela do dia BRT em UTC (00h BRT = 03h UTC)
    const dataBRT = brt(agora).toISOString().slice(0, 10);
    const inicioDia = new Date(`${dataBRT}T03:00:00Z`);
    const fimDia = new Date(inicioDia.getTime() + 24 * 3600 * 1000);

    const tok = await accessTokenGoogle();
    const eventos = await eventosDoDia(tok, inicioDia, fimDia);
    log.total_eventos_alertaveis = eventos.length;

    // ---------- 1. resumo do dia (07h-12h BRT, 1x por dia) ----------
    const horaLocal = brt(agora).getUTCHours();
    const naJanelaResumo = horaLocal >= 7 && horaLocal < 12;
    if (naJanelaResumo || body.forcar_resumo) {
      const resumoId = `resumo-${dataBRT}`;
      if (dryRun) {
        log.resumo = { enviaria: !(await jaEnviado('resumo_dia', resumoId, inicioDia)), mensagem: montarResumo(eventos, agora) };
      } else if (await marcarEnviado('resumo_dia', resumoId, inicioDia, 'todas', `Resumo ${dataBRT}`)) {
        try {
          await postarDiscord(montarResumo(eventos, agora));
          log.resumo = { enviado: true, eventos: eventos.length };
        } catch (e) {
          await desmarcarEnviado('resumo_dia', resumoId, inicioDia); // próxima execução tenta de novo
          throw e;
        }
        // higiene: apaga dedups com mais de 60 dias (1x por dia, junto do resumo)
        await sb.from('agenda_alertas_enviados').delete()
          .lt('enviado_em', new Date(agora.getTime() - 60 * 24 * 3600 * 1000).toISOString());
      } else {
        log.resumo = { enviado: false, motivo: 'já enviado hoje' };
      }
    }

    // ---------- 1b. conflitos entre agendas (toda rodada, dedup por par) ----------
    log.conflitos = [];
    for (const c of detectarConflitos(eventos)) {
      // só avisa conflito FUTURO (não adianta avisar depois que a call passou)
      if (c.inicio.getTime() < agora.getTime() - 5 * 60000) continue;
      if (dryRun) {
        log.conflitos.push({ par: c.id, enviaria: !(await jaEnviado('conflito', c.id, c.inicio)), mensagem: montarConflito(c) });
        continue;
      }
      if (await marcarEnviado('conflito', c.id, c.inicio, `${c.a.agenda_slug}+${c.b.agenda_slug}`, `${c.a.titulo} × ${c.b.titulo}`)) {
        try {
          await postarDiscord(montarConflito(c));
          log.conflitos.push({ par: c.id, enviado: true });
        } catch (e) {
          await desmarcarEnviado('conflito', c.id, c.inicio);
          throw e;
        }
      }
    }

    // ---------- 2. alertas por evento ----------
    for (const ev of eventos) {
      const minAte = (ev.inicio.getTime() - agora.getTime()) / 60000;
      // Janelas largas (cron 5/5 min) — dedup garante envio único
      const tipos: [string, boolean][] = [
        ['alerta_1h', minAte > 45 && minAte <= 70],
        ['alerta_10min', minAte > 5 && minAte <= 15],
        ['alerta_na_hora', minAte > -5 && minAte <= 5],
      ];
      for (const [tipo, dentro] of tipos) {
        if (!dentro) continue;
        if (dryRun) {
          log.alertas.push({ tipo, evento: ev.titulo, inicio: ev.inicio.toISOString(), enviaria: !(await jaEnviado(tipo, ev.evento_id, ev.inicio)), mensagem: montarAlerta(tipo, ev) });
          continue;
        }
        if (await marcarEnviado(tipo, ev.evento_id, ev.inicio, ev.agenda_slug, ev.titulo)) {
          try {
            await postarDiscord(montarAlerta(tipo, ev));
            log.alertas.push({ tipo, evento: ev.titulo, enviado: true });
          } catch (e) {
            await desmarcarEnviado(tipo, ev.evento_id, ev.inicio);
            throw e;
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, ...log }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('agenda-mentorias-worker:', e);
    return new Response(JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e), ...log }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
