// Edge: tool-cerebro-fonte-planejada
// POST /functions/v1/tool-cerebro-fonte-planejada
//
// CRUD de fontes planejadas pro Plano de Cerebros.
//
// Body: { acao: 'criar'|'atualizar_status'|'remover', ... }
//
// Criar:
//   { acao: 'criar', cerebro_id, titulo, integracao_slug, descricao?, url_origem?,
//     proposta_cron?, cron_descricao?, prioridade?, observacoes?, cliente_id? }
// Atualizar status:
//   { acao: 'atualizar_status', id, status: 'mapeada'|'em_construcao'|'rodando'|'pausada' }
// Remover:
//   { acao: 'remover', id }

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

  const acao = String(body.acao || '').trim();
  if (!['criar', 'atualizar_status', 'remover'].includes(acao)) {
    return jsonRespTool({ ok: false, erro: 'acao invalida (use criar|atualizar_status|remover)' }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  try {
    if (acao === 'criar') {
      const cerebro_id = String(body.cerebro_id || '').trim();
      const titulo = String(body.titulo || '').trim();
      if (!cerebro_id) return jsonRespTool({ ok: false, erro: 'cerebro_id obrigatorio' }, 400);
      if (!titulo)     return jsonRespTool({ ok: false, erro: 'titulo obrigatorio' }, 400);

      const { data, error } = await sb.rpc('cerebro_fonte_planejada_criar', {
        p_cerebro_id: cerebro_id,
        p_titulo: titulo,
        p_integracao_slug: body.integracao_slug || null,
        p_tipo_fonte: body.tipo_fonte || 'mapeada',
        p_descricao: body.descricao || null,
        p_url_origem: body.url_origem || null,
        p_proposta_cron: body.proposta_cron || null,
        p_cron_descricao: body.cron_descricao || null,
        p_prioridade: body.prioridade || 0,
        p_observacoes: body.observacoes || null,
        p_cliente_id: body.cliente_id || null,
      });
      if (error) throw new Error(error.message);
      return jsonRespTool({ ok: true, id: data });
    }

    if (acao === 'atualizar_status') {
      const id = String(body.id || '').trim();
      const status = String(body.status || '').trim();
      if (!id) return jsonRespTool({ ok: false, erro: 'id obrigatorio' }, 400);
      if (!['mapeada', 'em_construcao', 'rodando', 'pausada'].includes(status)) {
        return jsonRespTool({ ok: false, erro: 'status invalido' }, 400);
      }
      const { error } = await sb.rpc('cerebro_fonte_planejada_atualizar_status', {
        p_id: id,
        p_status: status,
      });
      if (error) throw new Error(error.message);
      return jsonRespTool({ ok: true });
    }

    if (acao === 'remover') {
      const id = String(body.id || '').trim();
      if (!id) return jsonRespTool({ ok: false, erro: 'id obrigatorio' }, 400);
      const { error } = await sb.rpc('cerebro_fonte_planejada_remover', { p_id: id });
      if (error) throw new Error(error.message);
      return jsonRespTool({ ok: true });
    }

    return jsonRespTool({ ok: false, erro: 'acao desconhecida' }, 400);
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
