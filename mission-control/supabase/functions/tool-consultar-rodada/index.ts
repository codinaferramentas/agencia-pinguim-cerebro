// Edge: tool-consultar-rodada
// GET /functions/v1/tool-consultar-rodada?id=<rodada_id>
// Retorna estado completo da rodada (rodando | concluido | falhou)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonRespTool({ ok: false, erro: 'id obrigatorio' }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  const { data, error } = await sb.from('workflow_rodadas')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return jsonRespTool({ ok: false, erro: error.message }, 404);

  return jsonRespTool({ ok: true, rodada: data });
});
