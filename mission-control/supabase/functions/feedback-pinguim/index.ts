// ========================================================================
// Edge Function: feedback-pinguim
// ========================================================================
// Camada 2 do EPP — feedback humano que vira contexto.
//
// Recebe:
//   { tenant_id, cliente_id, caso_id, mensagem_humana, mensagem_agente,
//     tipo: 'aprovou' | 'rejeitou' | 'refinou', comentario? }
//
// - 👍 aprovou: registra em aprendizados_cliente_agente (Tier 2 — perfil),
//   linha "Cliente aprovou: <padrão>".
// - 👎 rejeitou: registra crítica E re-executa o último briefing com a
//   crítica como contexto adicional. Devolve nova resposta.
// - ✏️ refinou: registra refinamento solicitado E re-executa.
//
// Atualizar perfil = EPP funcionando. Próxima execução do mesmo cliente
// já recebe o contexto novo.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sb, executarComEPP, carregarAgente } from '../_shared/agente.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const headerJwt = auth.replace('Bearer ', '');
  if (!headerJwt) return false;
  if (headerJwt === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (headerJwt.startsWith('eyJ')) {
    try {
      const adminClient = createClient(SUPABASE_URL, headerJwt, { auth: { persistSession: false } });
      const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) return true;
    } catch (_) {}
  }
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sbAnon.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

async function appendPerfilCliente(args: {
  agenteId: string;
  clienteId: string;
  linha: string;
}) {
  const { data: existente } = await sb()
    .from('aprendizados_cliente_agente')
    .select('conteudo_md')
    .eq('agente_id', args.agenteId)
    .eq('cliente_id', args.clienteId)
    .maybeSingle();
  const novoConteudo = existente?.conteudo_md
    ? `${existente.conteudo_md}\n${args.linha}`
    : `# Perfil do cliente — atualizado por feedback\n\n${args.linha}`;
  await sb()
    .from('aprendizados_cliente_agente')
    .upsert({
      agente_id: args.agenteId,
      cliente_id: args.clienteId,
      conteudo_md: novoConteudo,
    }, { onConflict: 'agente_id,cliente_id' });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);
  if (!(await requireAuth(req))) return jsonResp({ error: 'Não autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON inválido' }, 400); }

  const {
    tenant_id, cliente_id, caso_id,
    mensagem_humana, // último pedido do cliente
    mensagem_agente, // resposta do Pinguim que está sendo avaliada
    tipo, // 'aprovou' | 'rejeitou' | 'refinou'
    comentario, // opcional
  } = body;

  if (!tenant_id || !cliente_id || !tipo) {
    return jsonResp({ error: 'Faltam: tenant_id, cliente_id, tipo' }, 400);
  }
  if (!['aprovou', 'rejeitou', 'refinou'].includes(tipo)) {
    return jsonResp({ error: 'tipo deve ser aprovou|rejeitou|refinou' }, 400);
  }

  const tInicio = Date.now();
  try {
    const pinguim = await carregarAgente('pinguim');
    const data = new Date().toISOString().slice(0, 10);

    // 1. Registra feedback no perfil do cliente
    let linha: string;
    if (tipo === 'aprovou') {
      linha = `- [${data}] 👍 Cliente aprovou: "${(mensagem_humana || '').slice(0, 80)}" → resposta validada.${comentario ? ' Comentário: ' + comentario : ''}`;
    } else if (tipo === 'rejeitou') {
      linha = `- [${data}] 👎 Cliente rejeitou: "${(mensagem_humana || '').slice(0, 80)}". Crítica: ${comentario || 'sem detalhe'}`;
    } else {
      linha = `- [${data}] ✏️ Cliente pediu refinamento em "${(mensagem_humana || '').slice(0, 80)}". Ajuste: ${comentario || 'sem detalhe'}`;
    }
    await appendPerfilCliente({ agenteId: pinguim.id, clienteId: cliente_id, linha });

    // 2. Se aprovou, só registra e responde OK
    if (tipo === 'aprovou') {
      return jsonResp({
        ok: true,
        tipo,
        registrado: true,
        proxima_resposta: null,
        latencia_ms: Date.now() - tInicio,
      });
    }

    // 3. Se rejeitou ou refinou, re-executa Atendente Pinguim com crítica como contexto
    if (!mensagem_humana || !comentario) {
      return jsonResp({
        error: 'Pra rejeitar/refinar, preciso de mensagem_humana e comentario',
      }, 400);
    }

    const briefingComCritica = `${mensagem_humana}\n\n---\n\n## ⚠ Feedback do cliente sobre tentativa anterior\nO cliente avaliou minha resposta anterior como **${tipo === 'rejeitou' ? 'INCORRETA' : 'PRECISA REFINAR'}**.\n\nResposta anterior (resumo): ${(mensagem_agente || '').slice(0, 400)}\n\nCrítica/ajuste do cliente: ${comentario}\n\nRefaça respeitando essa crítica. NÃO repita o mesmo padrão.`;

    const sub = await executarComEPP({
      agente_slug: 'pinguim',
      briefing: briefingComCritica,
      tenant_id, cliente_id, caso_id,
    });

    // Persiste a nova resposta na conversa
    await sb().from('conversas').insert({
      tenant_id, cliente_id, agente_id: pinguim.id, caso_id,
      papel: 'chief',
      conteudo: sub.conteudo_md,
      artefatos: { tipo: 'refeito_por_feedback', feedback: tipo, comentario, reflection_rounds: sub.reflection_rounds || 0 },
    });

    return jsonResp({
      ok: true,
      tipo,
      registrado: true,
      proxima_resposta: sub.conteudo_md,
      reflection_rounds: sub.reflection_rounds || 0,
      verifier_problemas: sub.verifier_problemas || [],
      uso: sub.uso,
      latencia_ms: Date.now() - tInicio,
    });
  } catch (e: any) {
    console.error('[feedback-pinguim] erro:', e.message);
    return jsonResp({
      error: 'Erro ao processar feedback',
      detalhe: e.message,
      latencia_ms: Date.now() - tInicio,
    }, 500);
  }
});
