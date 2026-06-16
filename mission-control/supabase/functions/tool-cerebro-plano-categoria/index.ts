// Edge: tool-cerebro-plano-categoria
// V3 (2026-06-16)
//
// Acoes pra editar o plano de automacao de uma categoria.
//
// POST body { acao: 'editar' | 'avancar' | 'criar_categoria', ...campos }
//
// editar: { acao:'editar', plano_id, status_automacao?, origem_configurada?, schedule_cron?,
//           schedule_descricao?, ferramenta?, responsavel?, notas?, prioridade? }
// avancar: { acao:'avancar', plano_id }
//   -> avanca status pelo mapa: sem_coleta→planejada→em_construcao→rodando→pausada→rodando
// criar_categoria: { acao:'criar_categoria', nome, emoji?, descricao?, tipos_fonte? }
//   -> cria categoria global + auto-popula em todos cerebros internos

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
  const plano_id = String(body.plano_id || '').trim();
  // plano_id eh obrigatorio so pra editar/avancar — criar_categoria nao precisa
  if (acao !== 'criar_categoria' && !plano_id) {
    return jsonRespTool({ ok: false, erro: 'plano_id obrigatorio' }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  try {
    if (acao === 'criar_categoria') {
      const nome = String(body.nome || '').trim();
      if (!nome) return jsonRespTool({ ok: false, erro: 'nome obrigatorio' }, 400);
      const { data, error } = await sb.rpc('cerebro_categoria_criar', {
        p_nome: nome,
        p_emoji: body.emoji || '📦',
        p_descricao: body.descricao || null,
        p_tipos_fonte: body.tipos_fonte || [],
      });
      if (error) throw new Error(error.message);
      return jsonRespTool({ ok: true, slug: data });
    }

    if (acao === 'editar') {
      const { error } = await sb.rpc('cerebro_plano_categoria_editar', {
        p_id: plano_id,
        p_status_automacao:      body.status_automacao      ?? null,
        p_origem_configurada:    body.origem_configurada    ?? null,
        p_schedule_cron:         body.schedule_cron         ?? null,
        p_schedule_descricao:    body.schedule_descricao    ?? null,
        p_ferramenta:            body.ferramenta            ?? null,
        p_responsavel:           body.responsavel           ?? null,
        p_notas:                 body.notas                 ?? null,
        p_prioridade:            body.prioridade            ?? null,
        p_trigger_tipo:          body.trigger_tipo          ?? null,
        p_origem_pasta_drive_id: body.origem_pasta_drive_id ?? null,
      });
      if (error) throw new Error(error.message);
      return jsonRespTool({ ok: true });
    }

    if (acao === 'avancar') {
      const { data, error } = await sb.rpc('cerebro_plano_categoria_avancar', { p_id: plano_id });
      if (error) throw new Error(error.message);
      return jsonRespTool({ ok: true, novo_status: data });
    }

    return jsonRespTool({ ok: false, erro: 'acao invalida (use editar|avancar|criar_categoria)' }, 400);
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
