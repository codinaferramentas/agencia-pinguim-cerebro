// Edge: tool-integracao-editar
// POST /functions/v1/tool-integracao-editar
//
// Equipe edita a descricao_equipe da integracao na pagina Plano de Cerebros
// (aba Integracoes). Separa descricao tecnica (fixa) do contexto humano
// preenchido em reuniao.
//
// Body: { slug, descricao_equipe }

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

  const slug = String(body.slug || '').trim();
  const descricao_equipe = String(body.descricao_equipe || '').trim();
  if (!slug) return jsonRespTool({ ok: false, erro: 'slug obrigatorio' }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  try {
    const { error } = await sb.rpc('integracao_atualizar_descricao_equipe', {
      p_slug: slug,
      p_descricao_equipe: descricao_equipe || null,
    });
    if (error) throw new Error(error.message);
    return jsonRespTool({ ok: true });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
