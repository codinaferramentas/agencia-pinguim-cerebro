// ============================================================
// google-calendar.js — V2.14 Fase 1.7 (módulo agenda-hoje)
// ============================================================
// Wrapper minimo da Google Calendar API v3. Usa access_token renovado pelo
// oauth-google.js (cache RAM ~50min). Sem SDK Google pesado — só fetch.
//
// Escopo: calendar (ler + criar/editar/deletar eventos). NESTA versão
// expomos apenas LEITURA — squad data lê pra montar relatorio. CRIAÇÃO
// de evento é responsabilidade da squad hybrid-ops-squad (frente V2.15).
//
// Cada sócio vê APENAS a agenda dele — refresh_token é isolado por
// cliente_id no cofre (igual Drive e Gmail). SOCIO_SLUG resolve cliente_id.
// ============================================================

const oauth = require('./oauth-google');

// ============================================================
// V2.13.1 padrão — formatar data ISO -> America/Sao_Paulo (BRT/BRST)
// Calendar devolve start.dateTime em ISO 8601 com fuso. Convertemos pro
// fuso do sócio pra exibição. Mantém valor original em campo separado.
// ============================================================
const FORMATADOR_DATA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
  hour12: false,
});

const FORMATADOR_HORA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit', minute: '2-digit',
  hour12: false,
});

// Dia da semana e data curta em PT-BR (pra Atendente NÃO inventar rótulo)
const FORMATADOR_DIA_SEMANA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
});

const FORMATADOR_DATA_CURTA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit',
});

function diaSemanaBR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return FORMATADOR_DIA_SEMANA_BR.format(d); // "segunda-feira", "sábado"
  } catch (_) { return ''; }
}

function dataCurtaBR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return FORMATADOR_DATA_CURTA_BR.format(d); // "11/05"
  } catch (_) { return ''; }
}

function formatarDataBR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${FORMATADOR_DATA_BR.format(d)} (BRT)`;
  } catch (_) {
    return iso;
  }
}

function formatarHoraBR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return FORMATADOR_HORA_BR.format(d);
  } catch (_) {
    return iso;
  }
}

// Calcula duração em minutos entre dois ISO timestamps
function duracaoMin(startIso, endIso) {
  if (!startIso || !endIso) return null;
  try {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    if (isNaN(s) || isNaN(e)) return null;
    return Math.round((e - s) / 60000);
  } catch (_) { return null; }
}

// ============================================================
// Helper: chama Calendar API com Bearer token, parseia JSON, trata erros
// ============================================================
async function calendarFetch({ method = 'GET', endpoint, body, cliente_id }) {
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  const url = endpoint.startsWith('http') ? endpoint : `https://www.googleapis.com${endpoint}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
    },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(url, opts);
  const json = resp.status === 204 ? {} : await resp.json();
  if (!resp.ok) {
    const msg = json.error?.message || json.error || `HTTP ${resp.status}`;
    throw new Error(`Calendar API ${resp.status}: ${msg}`);
  }
  return json;
}

// ============================================================
// LISTAR CALENDÁRIOS — descobre calendários do sócio (primary + secundários)
// ============================================================
// Útil pra módulo agenda saber se há calendário extra além do primary
// (alguns sócios mantêm "Reuniões internas" separado, por exemplo).
async function listarCalendarios({ cliente_id } = {}) {
  const r = await calendarFetch({
    endpoint: '/calendar/v3/users/me/calendarList?minAccessRole=reader',
    cliente_id,
  });
  const items = r.items || [];
  return items.map(c => ({
    id: c.id,
    nome: c.summary || c.id,
    descricao: c.description || '',
    timezone: c.timeZone,
    primary: !!c.primary,
    selecionado: c.selected !== false,
    cor: c.backgroundColor || null,
    access_role: c.accessRole,
  }));
}

// ============================================================
// LISTAR EVENTOS — eventos de UM calendário numa janela de tempo
// ============================================================
// args:
//   calendarId: 'primary' (default) ou id de calendário específico
//   timeMin: ISO 8601 (default: agora)
//   timeMax: ISO 8601 (default: timeMin + 24h)
//   maxResults: max 250 (default 50)
//   singleEvents: true (default — expande recorrências em ocorrências)
async function listarEventos({
  cliente_id,
  calendarId = 'primary',
  timeMin = null,
  timeMax = null,
  maxResults = 50,
  singleEvents = true,
} = {}) {
  const tMin = timeMin || new Date().toISOString();
  const tMax = timeMax || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin: tMin,
    timeMax: tMax,
    maxResults: String(maxResults),
    singleEvents: String(singleEvents),
    orderBy: singleEvents ? 'startTime' : 'updated',
  });

  const r = await calendarFetch({
    endpoint: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    cliente_id,
  });

  const items = r.items || [];

  const eventos = items.map(e => {
    // dia inteiro vem em start.date (sem hora); evento pontual em start.dateTime
    const startIso = e.start?.dateTime || e.start?.date || null;
    const endIso   = e.end?.dateTime   || e.end?.date   || null;
    const diaInteiro = !!e.start?.date && !e.start?.dateTime;

    // Link Meet (quando o evento tem videoconferência)
    const conferenceData = e.conferenceData || {};
    const meetLink = (conferenceData.entryPoints || [])
      .find(ep => ep.entryPointType === 'video')?.uri || null;

    return {
      id: e.id,
      titulo: e.summary || '(sem título)',
      descricao: e.description || '',
      local: e.location || '',
      organizador: e.organizer?.email || '',
      participantes: (e.attendees || []).map(a => ({
        email: a.email,
        nome: a.displayName || '',
        resposta: a.responseStatus || 'needsAction',
        organizador: !!a.organizer,
      })),
      qtd_participantes: (e.attendees || []).length,
      inicio_iso: startIso,
      fim_iso: endIso,
      inicio_br: diaInteiro ? `${e.start.date} (dia inteiro)` : formatarDataBR(startIso),
      hora_inicio_br: diaInteiro ? null : formatarHoraBR(startIso),
      hora_fim_br: diaInteiro ? null : formatarHoraBR(endIso),
      duracao_min: diaInteiro ? null : duracaoMin(startIso, endIso),
      dia_inteiro: diaInteiro,
      dia_semana_br: diaSemanaBR(startIso),    // "segunda-feira"
      data_curta_br: dataCurtaBR(startIso),    // "11/05"
      status: e.status || 'confirmed',
      link_meet: meetLink,
      link_evento: e.htmlLink || null,
      recorrente: !!(e.recurringEventId),
      criado_em: e.created || null,
      atualizado_em: e.updated || null,
    };
  });

  // Filtra cancelados (singleEvents=true ainda devolve status='cancelled' às vezes)
  const ativos = eventos.filter(ev => ev.status !== 'cancelled');

  return {
    calendario_id: calendarId,
    janela: { inicio: tMin, fim: tMax },
    eventos: ativos,
    total: ativos.length,
    timezone: r.timeZone || 'America/Sao_Paulo',
    proxima_pagina: r.nextPageToken || null,
  };
}

// ============================================================
// LER EVENTO — detalhe completo de um evento específico
// ============================================================
async function lerEvento({ cliente_id, calendarId = 'primary', eventId } = {}) {
  if (!eventId) throw new Error('eventId obrigatório');

  const e = await calendarFetch({
    endpoint: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    cliente_id,
  });

  const startIso = e.start?.dateTime || e.start?.date || null;
  const endIso   = e.end?.dateTime   || e.end?.date   || null;
  const diaInteiro = !!e.start?.date && !e.start?.dateTime;
  const meetLink = (e.conferenceData?.entryPoints || [])
    .find(ep => ep.entryPointType === 'video')?.uri || null;

  return {
    id: e.id,
    titulo: e.summary || '(sem título)',
    descricao: e.description || '',
    local: e.location || '',
    organizador: e.organizer?.email || '',
    participantes: (e.attendees || []).map(a => ({
      email: a.email,
      nome: a.displayName || '',
      resposta: a.responseStatus || 'needsAction',
      organizador: !!a.organizer,
    })),
    inicio_iso: startIso,
    fim_iso: endIso,
    inicio_br: diaInteiro ? `${e.start.date} (dia inteiro)` : formatarDataBR(startIso),
    duracao_min: diaInteiro ? null : duracaoMin(startIso, endIso),
    dia_inteiro: diaInteiro,
    status: e.status || 'confirmed',
    link_meet: meetLink,
    link_evento: e.htmlLink || null,
    recorrente: !!(e.recurringEventId),
    recurring_event_id: e.recurringEventId || null,
    criado_em: e.created || null,
    atualizado_em: e.updated || null,
  };
}

// ============================================================
// HELPERS de janela BRT — usados pela Skill agenda-hoje
// ============================================================
// "Hoje BRT" = 00:00:00 BRT até 23:59:59 BRT, em ISO UTC
// BRT é UTC-3 (sem horário de verão desde 2019)
// Hoje BRT 00:00 = ontem UTC 03:00 // Hoje BRT 23:59 = hoje UTC 02:59 do dia seguinte

function janelaHojeBRT() {
  const agora = new Date();
  // pega Y/M/D no fuso BRT
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(agora);
  // BRT 00:00 do dia D = UTC 03:00 do dia D
  const inicioBRT = new Date(`${y}-${m}-${d}T00:00:00-03:00`);
  const fimBRT    = new Date(`${y}-${m}-${d}T23:59:59-03:00`);
  return {
    inicio_iso: inicioBRT.toISOString(),
    fim_iso: fimBRT.toISOString(),
    data_br: `${d}/${m}/${y}`,
  };
}

function janelaAmanhaBRT() {
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // Soma 24h e refaz parts pra pegar o dia BRT seguinte (cobre virada de mês corretamente)
  const amanhaUTC = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(amanhaUTC);
  const inicioBRT = new Date(`${y}-${m}-${d}T00:00:00-03:00`);
  const fimBRT    = new Date(`${y}-${m}-${d}T23:59:59-03:00`);
  return {
    inicio_iso: inicioBRT.toISOString(),
    fim_iso: fimBRT.toISOString(),
    data_br: `${d}/${m}/${y}`,
  };
}

// V2.14 D — Janela de dia específico BRT
// Aceita 'YYYY-MM-DD' (string) e devolve a janela [00:00 → 23:59] desse dia em BRT.
// Usado quando sócio pede "executivo do dia 05/05" (dia_alvo_brt).
function janelaDiaBRT(diaAlvo) {
  if (!diaAlvo || !/^\d{4}-\d{2}-\d{2}$/.test(diaAlvo)) {
    throw new Error(`janelaDiaBRT: diaAlvo invalido (esperado 'YYYY-MM-DD'), recebi: ${diaAlvo}`);
  }
  const [y, m, d] = diaAlvo.split('-');
  const inicioBRT = new Date(`${y}-${m}-${d}T00:00:00-03:00`);
  const fimBRT    = new Date(`${y}-${m}-${d}T23:59:59-03:00`);
  return {
    inicio_iso: inicioBRT.toISOString(),
    fim_iso: fimBRT.toISOString(),
    data_br: `${d}/${m}/${y}`,
    diaAlvo,
  };
}

// Formata 'YYYY-MM-DD' BRT como 'DD de mês' em pt-BR (ex: '05 de maio')
function dataLongaBRdoDiaAlvo(diaAlvo) {
  const j = janelaDiaBRT(diaAlvo);
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long' });
  return fmt.format(new Date(j.inicio_iso));
}

// Formata 'YYYY-MM-DD' BRT como dia da semana em pt-BR (ex: 'terça-feira')
function diaSemanaBRdoDiaAlvo(diaAlvo) {
  const j = janelaDiaBRT(diaAlvo);
  return diaSemanaBR(j.inicio_iso);
}

module.exports = {
  listarCalendarios,
  listarEventos,
  lerEvento,
  janelaHojeBRT,
  janelaAmanhaBRT,
  janelaDiaBRT,
  dataLongaBRdoDiaAlvo,
  diaSemanaBRdoDiaAlvo,
  formatarHoraBR,
  formatarDataBR,
  diaSemanaBR,
  dataCurtaBR,
  duracaoMin,
};
