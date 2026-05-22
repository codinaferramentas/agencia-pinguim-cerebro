// Edge Function: consultar-geracao
// GET /functions/v1/consultar-geracao?id=<uuid>
// Headers: Authorization: Bearer <TOKEN_PROJETO_EXTERNO_CRIATIVOS>
//
// Polling endpoint. Retorna status atual da geracao.
// - status='processando' -> ainda rodando, projeto externo continua polling
// - status='concluido' -> outputs prontos
// - status='falhou' -> erro com codigo + mensagem

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { validarTokenExterno, corsExterno, jsonResp } from '../_shared/auth-externa.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsExterno });
  if (req.method !== 'GET') return jsonResp({ erro: 'Use GET', codigo: 'METHOD_NOT_ALLOWED' }, 405);

  const auth = await validarTokenExterno(req);
  if (!auth.ok) return jsonResp({ erro: 'Token invalido ou ausente', codigo: 'UNAUTHORIZED' }, 401);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id || !UUID_RE.test(id)) return jsonResp({ erro: 'Parametro id (uuid) obrigatorio', codigo: 'INPUT_INVALID' }, 400);

  const { data, error } = await sb.from('geracoes_externas')
    .select('id, status, produto_slug, clone_slugs, modo, briefing, iniciado_em, concluido_em, outputs, modelo_principal, custo_total_usd, latencia_ms, tokens_in, tokens_out, erro_codigo, erro_mensagem, persona_versao')
    .eq('id', id)
    .maybeSingle();

  if (error) return jsonResp({ erro: 'Erro ao consultar: ' + error.message, codigo: 'DB_ERROR' }, 500);
  if (!data) return jsonResp({ erro: 'Geracao nao encontrada', codigo: 'NOT_FOUND' }, 404);

  const duracaoSeg = data.concluido_em
    ? Math.round((new Date(data.concluido_em).getTime() - new Date(data.iniciado_em).getTime()) / 1000)
    : Math.round((Date.now() - new Date(data.iniciado_em).getTime()) / 1000);

  if (data.status === 'processando') {
    return jsonResp({
      geracao_id: data.id,
      status: 'processando',
      decorrido_segundos: duracaoSeg,
      polling_url: `/functions/v1/consultar-geracao?id=${data.id}`,
    });
  }

  if (data.status === 'falhou') {
    return jsonResp({
      geracao_id: data.id,
      status: 'falhou',
      erro_codigo: data.erro_codigo,
      erro_mensagem: data.erro_mensagem,
      duracao_segundos: duracaoSeg,
    });
  }

  // concluido
  return jsonResp({
    geracao_id: data.id,
    status: 'concluido',
    modo: data.modo,
    produto_slug: data.produto_slug,
    clone_slugs: data.clone_slugs,
    outputs: data.outputs || [],
    persona_versao_usada: data.persona_versao,
    modelo: data.modelo_principal,
    custo_usd: data.custo_total_usd,
    duracao_segundos: duracaoSeg,
    tokens_in: data.tokens_in,
    tokens_out: data.tokens_out,
  });
});
