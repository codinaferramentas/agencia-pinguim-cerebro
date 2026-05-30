// ============================================================
// Edge Function: tool-listar-eventos-calendar
// ============================================================
// Retorna eventos do Google Calendar do sócio dentro de uma janela
// (default: agora até 24h à frente).
//
// Body: { cliente_id, conexao_id?, ate_minutos? }
// Resp: { ok, eventos: [{ id, titulo, inicio_iso, fim_iso, local, meet_url, descricao }] }
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { obterAccessTokenSocio } from '../_shared/oauth-google.ts';

async function listarEventos(body: any) {
  const cliente_id = String(body.cliente_id || '').trim();
  const ate_minutos = Number(body.ate_minutos || 24 * 60); // default 24h
  if (!cliente_id) return jsonRespTool({ ok: false, erro: 'cliente_id obrigatorio' }, 400);

  const { access_token } = await obterAccessTokenSocio({ cliente_id, conexao_id: body.conexao_id });

  const agora = new Date();
  const limite = new Date(agora.getTime() + ate_minutos * 60_000);

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', agora.toISOString());
  url.searchParams.set('timeMax', limite.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    return jsonRespTool({ ok: false, erro: `Calendar: ${r.status} - ${txt.slice(0, 150)}` }, r.status);
  }
  const j = await r.json();

  const eventos = (j.items || [])
    .filter((e: any) => e.status !== 'cancelled')
    .map((e: any) => {
      const inicio = e.start?.dateTime || e.start?.date;
      const fim = e.end?.dateTime || e.end?.date;
      // Procura link Meet em hangoutLink ou conferenceData
      let meet_url = e.hangoutLink || null;
      if (!meet_url && e.conferenceData?.entryPoints) {
        const ep = e.conferenceData.entryPoints.find((p: any) => p.entryPointType === 'video');
        if (ep) meet_url = ep.uri;
      }
      return {
        id: e.id,
        titulo: e.summary || '(sem título)',
        inicio_iso: inicio,
        fim_iso: fim,
        local: e.location || null,
        meet_url,
        descricao: (e.description || '').slice(0, 500),
        all_day: !e.start?.dateTime,
      };
    })
    .filter((ev: any) => !ev.all_day); // ignora eventos dia inteiro (não dão alerta de horário)

  return jsonRespTool({ ok: true, eventos, agora_iso: agora.toISOString() });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ ok: false, erro: 'JSON invalido' }, 400); }

  try {
    return await listarEventos(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[tool-listar-eventos-calendar] erro:', msg);
    return jsonRespTool({ ok: false, erro: msg }, 500);
  }
});
