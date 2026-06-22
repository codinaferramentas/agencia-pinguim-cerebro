// Edge Function: tool-abrir-ticket-codina
// Chamada pelo Claude Code do socio quando ele pede algo que precisa de
// tool nova / integracao nova / fix de bug — Pinguim abre ticket pro Codina.
//
// Body:
//   {
//     socio_slug: 'codina'|'pedro'|'luiz'|'micha' (obrigatorio),
//     tipo: 'tool_nova'|'integracao'|'bug'|'duvida'|'feature' (obrigatorio),
//     titulo: string (obrigatorio - 1 linha),
//     descricao: string (obrigatorio - detalhes),
//     contexto_pedido?: string (o que socio tava tentando fazer),
//     prioridade?: 'baixa'|'media'|'alta'|'urgente' (default: media)
//   }
//
// Retorno:
//   { ok: true, id: <uuid>, msg: "Ticket #<short_id> aberto pro Codina" }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const SOCIOS_VALIDOS = new Set(['codina','pedro','luiz','micha']);
const TIPOS_VALIDOS = new Set(['tool_nova','integracao','bug','duvida','feature']);
const PRIORIDADES_VALIDAS = new Set(['baixa','media','alta','urgente']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ ok: false, erro: 'metodo invalido' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ ok: false, erro: 'JSON invalido' }, 400); }

  const { socio_slug, tipo, titulo, descricao, contexto_pedido, prioridade } = body;

  if (!socio_slug || !SOCIOS_VALIDOS.has(socio_slug)) {
    return jsonResp({ ok: false, erro: 'socio_slug invalido' }, 400);
  }
  if (!tipo || !TIPOS_VALIDOS.has(tipo)) {
    return jsonResp({ ok: false, erro: 'tipo invalido (use: tool_nova, integracao, bug, duvida, feature)' }, 400);
  }
  if (!titulo || typeof titulo !== 'string' || titulo.length < 5) {
    return jsonResp({ ok: false, erro: 'titulo obrigatorio (min 5 chars)' }, 400);
  }
  if (!descricao || typeof descricao !== 'string' || descricao.length < 10) {
    return jsonResp({ ok: false, erro: 'descricao obrigatoria (min 10 chars)' }, 400);
  }

  const prioridadeFinal = prioridade && PRIORIDADES_VALIDAS.has(prioridade) ? prioridade : 'media';

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  const { data: inserido, error } = await sb.from('tickets_codina')
    .insert({
      socio_slug,
      tipo,
      titulo,
      descricao,
      contexto_pedido: contexto_pedido || null,
      prioridade: prioridadeFinal,
      status: 'aberto',
    })
    .select('id')
    .single();

  if (error) return jsonResp({ ok: false, erro: error.message }, 500);

  const shortId = inserido.id.slice(0, 8);
  return jsonResp({
    ok: true,
    id: inserido.id,
    short_id: shortId,
    msg: `Ticket #${shortId} aberto pro Codina (tipo: ${tipo}, prioridade: ${prioridadeFinal}). Ele vai ver no painel.`,
  });
});
