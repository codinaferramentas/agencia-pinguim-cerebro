// ========================================================================
// Edge Function: agente-executar
// ========================================================================
// Loader genérico pra qualquer Worker do Pinguim OS (Copywriter, Designer,
// Verifier, etc). Não é o Chief — esse é chief-orquestrar.
//
// Recebe:
//   {
//     agente_slug, tenant_id, cliente_id, caso_id,
//     briefing,                  // o que o Chief mandou pro Worker
//     entregavel_origem_id?,     // se for revisão, ID da v1 que vai ser ajustada
//     parent_id?,                // ID do entregável anterior (pra versão chain)
//     contexto_extra?            // contexto adicional do Chief
//   }
//
// Retorna:
//   {
//     entregavel_id,
//     conteudo_estruturado,
//     nota_de_dissenso?  // se Worker detectou contradição com APRENDIZADOS
//   }
//
// Workers nascem stateless POR EXECUÇÃO, mas leem própria memória individual:
// - APRENDIZADOS.md (Tier 1 — geral)
// - perfis/<solicitante>.md (Tier 2 — específico desse cliente)
//
// Isso é o EPP individual ATIVO desde v1 (decisão 2026-05-05).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  sb,
  carregarAgente,
  carregarMemoriaIndividual,
  montarSystemPrompt,
  chamarLLM,
  logarExecucao,
  logarCustoFinOps,
  calcularCustoUSD,
} from '../_shared/agente.ts';

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

// =====================================================
// Schema obrigatório de saída pros Workers (R8 — sem blob)
// =====================================================
const SCHEMA_RESPOSTA_WORKER = `
Sua resposta DEVE ser JSON válido com esta estrutura:

{
  "tipo": "<copy|pagina|relatorio|plano|outro>",
  "titulo": "<título curto>",
  "conteudo_estruturado": {
    // estrutura tipada do entregável — siga o que o Chief pediu
    // se for copy: { titulo, subtitulo, paragrafos: [...], cta }
    // se for relatório: { resumo_executivo, secoes: [{ titulo, paragrafos }] }
    // se for plano: { etapas: [{ ordem, descricao, prazo }] }
  },
  "conteudo_md": "<versão markdown legível pro humano>",
  "nota_de_dissenso": null  // OU objeto se detectou contradição com seus APRENDIZADOS:
                            // { briefing_recebido, aprendizado_conflitante, recomendacao }
}

REGRAS:
- conteudo_estruturado é OBRIGATÓRIO (sem blob de texto).
- Se você detectar que o briefing contradiz seu APRENDIZADOS.md ou perfil do solicitante,
  PAUSE a execução: preencha nota_de_dissenso com 3 campos e retorne sem gerar entregável.
  Chief vai decidir.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);
  if (!(await requireAuth(req))) return jsonResp({ error: 'Não autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON inválido' }, 400); }

  const {
    agente_slug,
    tenant_id,
    cliente_id,
    caso_id,
    solicitante_id,
    briefing,
    entregavel_origem_id,
    parent_id,
    contexto_extra,
  } = body;

  if (!agente_slug || !tenant_id || !cliente_id || !briefing) {
    return jsonResp({ error: 'Faltam: agente_slug, tenant_id, cliente_id, briefing' }, 400);
  }
  if (agente_slug === 'chief') {
    return jsonResp({ error: 'Use /chief-orquestrar pro Chief, não /agente-executar' }, 400);
  }

  const tInicio = Date.now();
  try {
    // 1. Carrega Worker
    const worker = await carregarAgente(agente_slug);

    // 2. Memória individual do Worker
    const { aprendizados, perfilSolicitante } = await carregarMemoriaIndividual(
      worker.id,
      solicitante_id || cliente_id,
    );

    // 3. Carrega entregável de origem (se for revisão)
    let entregavelOrigem: any = null;
    if (entregavel_origem_id) {
      const { data } = await sb()
        .from('entregaveis')
        .select('*')
        .eq('id', entregavel_origem_id)
        .maybeSingle();
      entregavelOrigem = data;
    }

    // 4. Monta system prompt
    const systemPrompt = montarSystemPrompt({
      agente: worker,
      aprendizados,
      perfilSolicitante,
      solicitanteSlug: null,
      historico: [],
    }) + '\n\n' + SCHEMA_RESPOSTA_WORKER;

    // 5. Monta mensagem do user
    let userMsg = `## Briefing do Chief\n${briefing}`;
    if (entregavelOrigem) {
      userMsg += `\n\n## Entregável de origem (versão ${entregavelOrigem.versao})\nTipo: ${entregavelOrigem.tipo}\nTítulo: ${entregavelOrigem.titulo}\n\n${entregavelOrigem.conteudo_md || JSON.stringify(entregavelOrigem.conteudo_estruturado, null, 2)}`;
    }
    if (contexto_extra) {
      userMsg += `\n\n## Contexto extra\n${typeof contexto_extra === 'string' ? contexto_extra : JSON.stringify(contexto_extra)}`;
    }

    // 6. Chama LLM (modelo do Worker, pode ser mais barato que Chief)
    const llmResp = await chamarLLM({
      modelo: worker.modelo || 'openai:gpt-5-mini',
      systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
      temperatura: worker.temperatura ?? 0.6,
      maxTokens: 8192,
    }, `agente-${agente_slug}`);

    // 7. Parse JSON de resposta (com fallback robusto)
    let respObj: any = null;
    try {
      // Tenta extrair JSON do response (LLM às vezes envolve em markdown)
      const txt = llmResp.content.trim();
      const jsonMatch = txt.match(/```json\s*([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : txt;
      respObj = JSON.parse(jsonStr);
    } catch (e) {
      // Worker não devolveu JSON válido — registra e retorna como blob (degradação graceful)
      respObj = {
        tipo: 'erro_parse',
        titulo: 'Worker não retornou JSON estruturado',
        conteudo_estruturado: { raw: llmResp.content },
        conteudo_md: llmResp.content,
        nota_de_dissenso: null,
      };
    }

    // 8. Loga execução (com tokens cached)
    await logarExecucao({
      agenteId: worker.id,
      input: { briefing, entregavel_origem_id, contexto_extra },
      output: respObj,
      modelo: llmResp.modeloUsado,
      tokensIn: llmResp.tokensIn,
      tokensOut: llmResp.tokensOut,
      tokensCached: llmResp.tokensCached,
      latenciaMs: llmResp.latenciaMs,
    });

    // 9. Loga custo FinOps (com desconto de cache)
    const custoUSD = calcularCustoUSD(llmResp.modeloUsado, llmResp.tokensIn, llmResp.tokensOut, llmResp.tokensCached);
    await logarCustoFinOps({
      agenteSlug: agente_slug,
      modelo: llmResp.modeloUsado,
      custoUSD,
      tokensIn: llmResp.tokensIn,
      tokensOut: llmResp.tokensOut,
      tokensCached: llmResp.tokensCached,
    });

    // 10. Se Worker pausou em dissenso → não cria entregável, retorna nota
    if (respObj.nota_de_dissenso) {
      return jsonResp({
        ok: true,
        pausou_em_dissenso: true,
        nota_de_dissenso: respObj.nota_de_dissenso,
        worker_id: worker.id,
        worker_slug: agente_slug,
        uso: {
          modelo: llmResp.modeloUsado,
          tokens_in: llmResp.tokensIn,
          tokens_out: llmResp.tokensOut,
          tokens_cached: llmResp.tokensCached,
          custo_usd: Number(custoUSD.toFixed(6)),
          latencia_ms: llmResp.latenciaMs,
        },
      });
    }

    // 11. Cria entregável (versionado se for revisão)
    let proximaVersao = 1;
    if (parent_id) {
      const { data: parent } = await sb()
        .from('entregaveis')
        .select('versao')
        .eq('id', parent_id)
        .maybeSingle();
      proximaVersao = (parent?.versao || 1) + 1;
    }

    const { data: novoEntregavel, error: errEntr } = await sb()
      .from('entregaveis')
      .insert({
        tenant_id,
        cliente_id,
        caso_id: caso_id || null,
        agente_que_fez: worker.id,
        tipo: respObj.tipo || 'outro',
        titulo: respObj.titulo || 'Entregável',
        conteudo_estruturado: respObj.conteudo_estruturado || {},
        conteudo_md: respObj.conteudo_md || null,
        versao: proximaVersao,
        parent_id: parent_id || null,
      })
      .select('id, versao')
      .single();

    if (errEntr) throw new Error(`Erro ao salvar entregável: ${errEntr.message}`);

    return jsonResp({
      ok: true,
      entregavel_id: novoEntregavel.id,
      versao: novoEntregavel.versao,
      parent_id: parent_id || null,
      conteudo_estruturado: respObj.conteudo_estruturado,
      titulo: respObj.titulo,
      tipo: respObj.tipo,
      worker_slug: agente_slug,
      uso: {
        modelo: llmResp.modeloUsado,
        tokens_in: llmResp.tokensIn,
        tokens_out: llmResp.tokensOut,
        tokens_cached: llmResp.tokensCached,
        cache_hit_pct: llmResp.tokensIn > 0 ? Number(((llmResp.tokensCached / llmResp.tokensIn) * 100).toFixed(1)) : 0,
        custo_usd: Number(custoUSD.toFixed(6)),
        latencia_ms: llmResp.latenciaMs,
        latencia_total_ms: Date.now() - tInicio,
      },
    });
  } catch (e: any) {
    console.error('[agente-executar] erro:', e.message);
    return jsonResp({
      error: 'Erro ao executar agente',
      detalhe: e.message,
      latencia_ms: Date.now() - tInicio,
    }, 500);
  }
});
