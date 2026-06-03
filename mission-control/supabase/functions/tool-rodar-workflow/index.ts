// ============================================================
// Edge Function: tool-rodar-workflow
// ============================================================
// Dispara um workflow multi-agente. Async — retorna rodada_id imediato.
// Trabalho real roda em background. Cliente faz polling em tool-consultar-rodada.
//
// Body: {
//   workflow_slug: 'diagnostico-funil-lo-fi-desafio',
//   periodo_dias: 7,
//   url_pagina: 'https://...',
//   especialistas_escolhidos: { 'meta-ads': ['pedro-sobral','tiago-tessmann'], ... },
//   cliente_id: '...'
// }
// Resp: { ok, rodada_id }
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { executarWorkflow } from './executor.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ ok: false, erro: 'JSON invalido' }, 400); }

  const { workflow_slug, periodo_dias = 7, url_pagina, especialistas_escolhidos, cliente_id } = body;
  if (!workflow_slug) return jsonRespTool({ ok: false, erro: 'workflow_slug obrigatorio' }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  // Busca workflow
  const { data: wf } = await sb.from('workflows')
    .select('*')
    .eq('slug', workflow_slug)
    .single();
  if (!wf) return jsonRespTool({ ok: false, erro: 'workflow nao encontrado' }, 404);
  if (wf.status !== 'liberado') return jsonRespTool({ ok: false, erro: 'workflow nao liberado' }, 400);

  // Cria rodada com status rodando
  const { data: rodada, error: errIns } = await sb.from('workflow_rodadas').insert({
    workflow_id: wf.id,
    cliente_id,
    periodo_dias,
    url_pagina,
    especialistas_escolhidos: especialistas_escolhidos || {},
    status: 'rodando',
  }).select('id').single();
  if (errIns) return jsonRespTool({ ok: false, erro: errIns.message }, 500);

  // Dispara workflow em background (não await)
  executarWorkflow(rodada.id, wf, { periodo_dias, url_pagina, especialistas_escolhidos })
    .catch(async (e) => {
      console.error('[workflow] erro fatal:', e?.message);
      await sb.from('workflow_rodadas')
        .update({
          status: 'falhou',
          erro_codigo: 'EXECUCAO_FALHOU',
          erro_mensagem: e?.message?.slice(0, 500) || 'erro desconhecido',
          concluido_em: new Date().toISOString(),
        })
        .eq('id', rodada.id);
    });

  return jsonRespTool({ ok: true, rodada_id: rodada.id, status: 'rodando' });
});
