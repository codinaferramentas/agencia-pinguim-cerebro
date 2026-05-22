// Edge Function: feedback-externo
// POST /functions/v1/feedback-externo
// Headers: Authorization: Bearer <TOKEN_PROJETO_EXTERNO_CRIATIVOS>
//
// Recebe insight raro vindo do projeto externo (Fluxo B do doc).
// Grava em feedback_externo com status='pendente'. Andre/Codina revisam manualmente.
// Rate limit: 10/dia por origem.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { validarTokenExterno, corsExterno, jsonResp } from '../_shared/auth-externa.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

const TIPOS_VALIDOS = ['skill_insight', 'clone_insight', 'anatomia_insight', 'outro'];
const RATE_LIMIT_POR_DIA = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsExterno });
  if (req.method !== 'POST') return jsonResp({ erro: 'Use POST', codigo: 'METHOD_NOT_ALLOWED' }, 405);

  const auth = await validarTokenExterno(req);
  if (!auth.ok) return jsonResp({ erro: 'Token invalido ou ausente', codigo: 'UNAUTHORIZED' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ erro: 'JSON invalido', codigo: 'INVALID_JSON' }, 400); }

  const { geracao_id, execucao_id, tipo, alvo_slug, observacao, evidencias, autor_externo } = body;

  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return jsonResp({ erro: `tipo deve ser: ${TIPOS_VALIDOS.join(' | ')}`, codigo: 'INPUT_INVALID' }, 400);
  }
  if (!alvo_slug || typeof alvo_slug !== 'string') return jsonResp({ erro: 'alvo_slug obrigatorio', codigo: 'INPUT_INVALID' }, 400);
  if (!observacao || typeof observacao !== 'string' || observacao.length < 30) {
    return jsonResp({ erro: 'observacao obrigatoria (min 30 chars) — explique o padrao detectado', codigo: 'INPUT_INVALID' }, 400);
  }

  // Rate limit por origem (dia)
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const { count } = await sb.from('feedback_externo')
    .select('id', { count: 'exact', head: true })
    .eq('origem', auth.origem!)
    .gte('criado_em', inicioDia.toISOString());

  if ((count || 0) >= RATE_LIMIT_POR_DIA) {
    return jsonResp({
      erro: `Rate limit atingido: ${RATE_LIMIT_POR_DIA} feedbacks/dia. Tente amanha.`,
      codigo: 'RATE_LIMIT',
      atual: count,
      limite: RATE_LIMIT_POR_DIA,
    }, 429);
  }

  // Validar geracao_id se passado
  if (geracao_id) {
    const { data: g } = await sb.from('geracoes_externas').select('id').eq('id', geracao_id).maybeSingle();
    if (!g) return jsonResp({ erro: 'geracao_id nao encontrada', codigo: 'NOT_FOUND' }, 404);
  }

  const { data, error } = await sb.from('feedback_externo').insert({
    origem: auth.origem,
    geracao_id: geracao_id || null,
    execucao_id: execucao_id || null,
    tipo,
    alvo_slug,
    observacao,
    evidencias: evidencias || [],
    autor_externo: autor_externo || null,
    status_review: 'pendente',
  }).select('id, criado_em').single();

  if (error) return jsonResp({ erro: 'Falha ao salvar: ' + error.message, codigo: 'DB_INSERT_FAIL' }, 500);

  return jsonResp({
    registrado: true,
    feedback_id: data.id,
    status_review: 'pendente',
    nota: 'Insight registrado. Sera revisado pelo time Pinguim em 24-72h. Se aprovado, vira aprendizado_agente e passa a alimentar todas execucoes futuras.',
  }, 201);
});
