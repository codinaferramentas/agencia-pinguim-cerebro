// Edge: tool-disparar-job-categoria
// V3 (2026-06-16)
//
// Frontend chama com { cerebro_id, categoria_slug, notificacao_id? }
// -> chama RPC enfileirar_job_ingestao_categoria
// -> worker local (server-cli) pega o job da fila pinguim.jobs

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch {
    return jsonRespTool({ ok: false, erro: 'body invalido' }, 400);
  }

  const cerebro_id = String(body.cerebro_id || '').trim();
  const categoria_slug = String(body.categoria_slug || '').trim();
  const notificacao_id = body.notificacao_id || null;

  if (!cerebro_id) return jsonRespTool({ ok: false, erro: 'cerebro_id obrigatorio' }, 400);
  if (!categoria_slug) return jsonRespTool({ ok: false, erro: 'categoria_slug obrigatorio' }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  try {
    const { data, error } = await sb.rpc('enfileirar_job_ingestao_categoria', {
      p_cerebro_id: cerebro_id,
      p_categoria_slug: categoria_slug,
      p_disparado_por: 'manual',
      p_notificacao_id: notificacao_id,
    });
    if (error) throw new Error(error.message);
    return jsonRespTool({ ok: true, job_id: data, mensagem: 'Job enfileirado. Worker local processa em ate 15s.' });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
