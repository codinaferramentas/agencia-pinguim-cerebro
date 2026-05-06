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
// Tools que orquestradores de squad (ex.: copy-chief) podem usar.
// Quando o agente tem 'delegar-mestre' nas ferramentas, ativamos loop tool-calling.
// =====================================================
const TOOLS_ORQUESTRADOR = [
  {
    type: 'function',
    function: {
      name: 'delegar-mestre',
      description: 'Invoca um mestre da squad pra executar parte do trabalho. Devolve a contribuição estruturada do mestre.',
      parameters: {
        type: 'object',
        properties: {
          mestre_slug: { type: 'string', description: 'slug do mestre (ex.: alex-hormozi, eugene-schwartz, gary-halbert, gary-bencivenga)' },
          briefing: { type: 'string', description: 'briefing claro pro mestre — objetivo, público, parâmetros específicos' },
          parte: { type: 'string', description: 'qual parte do roteiro ele faz (ex.: "gancho", "desenvolvimento", "completo")', default: 'completo' },
        },
        required: ['mestre_slug', 'briefing'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consolidar-roteiro',
      description: 'Consolida as contribuições dos mestres invocados em copy/roteiro final. Use DEPOIS de invocar 1-2 mestres. Termina o trabalho do orquestrador.',
      parameters: {
        type: 'object',
        properties: {
          objetivo: { type: 'string' },
          publico_consciencia: { type: 'string', description: 'nivel de consciencia identificado' },
          mestres_usados: { type: 'array', items: { type: 'string' } },
          justificativa: { type: 'string', description: 'por que esses mestres foram escolhidos' },
          copy_final: {
            type: 'object',
            properties: {
              gancho: { type: 'string' },
              desenvolvimento: { type: 'string' },
              virada: { type: 'string' },
              cta: { type: 'string' },
              metodo_anotado: { type: 'string', description: 'linha final tipo MÉTODO: ...' },
            },
          },
        },
        required: ['objetivo', 'mestres_usados', 'justificativa', 'copy_final'],
      },
    },
  },
];

function ehOrquestrador(agente: any): boolean {
  return Array.isArray(agente.ferramentas) && agente.ferramentas.includes('delegar-mestre');
}

function formatarConsolidadoMd(card: any): string {
  if (!card) return '';
  const partes: string[] = [];
  if (card.objetivo) partes.push(`**Objetivo:** ${card.objetivo}`);
  if (card.publico_consciencia) partes.push(`**Público (consciência):** ${card.publico_consciencia}`);
  if (Array.isArray(card.mestres_usados)) partes.push(`**Mestres usados:** ${card.mestres_usados.join(', ')}`);
  if (card.justificativa) partes.push(`**Justificativa:** ${card.justificativa}`);
  partes.push('');
  if (card.copy_final) {
    const c = card.copy_final;
    if (c.gancho) partes.push(`### [GANCHO]\n${c.gancho}`);
    if (c.desenvolvimento) partes.push(`### [DESENVOLVIMENTO]\n${c.desenvolvimento}`);
    if (c.virada) partes.push(`### [VIRADA]\n${c.virada}`);
    if (c.cta) partes.push(`### [CTA]\n${c.cta}`);
    if (c.metodo_anotado) partes.push(`\n_${c.metodo_anotado}_`);
  }
  return partes.join('\n\n');
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
  if (agente_slug === 'pinguim') {
    return jsonResp({ error: 'Use /atendente-pinguim pro agente principal, não /agente-executar' }, 400);
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

    // 4. É orquestrador (tem delegar-mestre nas ferramentas)? Loop tool calling.
    //    Senão, chamada simples e parse de JSON estruturado.
    const orquestrador = ehOrquestrador(worker);

    // 5. Monta system prompt (sem schema rígido pra orquestrador, com schema pro worker simples)
    const systemPrompt = montarSystemPrompt({
      agente: worker,
      aprendizados,
      perfilSolicitante,
      solicitanteSlug: null,
      historico: [],
    }) + (orquestrador ? '' : '\n\n' + SCHEMA_RESPOSTA_WORKER);

    // 6. User message
    let userMsg = `## Briefing\n${briefing}`;
    if (entregavelOrigem) {
      userMsg += `\n\n## Entregável de origem (versão ${entregavelOrigem.versao})\nTipo: ${entregavelOrigem.tipo}\nTítulo: ${entregavelOrigem.titulo}\n\n${entregavelOrigem.conteudo_md || JSON.stringify(entregavelOrigem.conteudo_estruturado, null, 2)}`;
    }
    if (contexto_extra) {
      userMsg += `\n\n## Contexto extra\n${typeof contexto_extra === 'string' ? contexto_extra : JSON.stringify(contexto_extra)}`;
    }

    // 7. Loop tool calling se orquestrador, senão chamada simples
    let totalTokensIn = 0, totalTokensOut = 0, totalTokensCached = 0, totalLatenciaMs = 0;
    let modeloUsadoFinal = '';
    let respostaFinal: any = null;
    let consolidadoCard: any = null;
    let mestresInvocados: Array<{ slug: string; output: any; uso: any }> = [];

    if (orquestrador) {
      const llmMessages: any[] = [{ role: 'user', content: userMsg }];
      const MAX_ROUNDS = 4;

      for (let round = 0; round <= MAX_ROUNDS; round++) {
        const llmResp = await chamarLLM({
          modelo: worker.modelo || 'openai:gpt-4o',
          systemPrompt,
          messages: llmMessages,
          tools: TOOLS_ORQUESTRADOR,
          temperatura: worker.temperatura ?? 0.5,
          maxTokens: 4096,
        }, `agente-${agente_slug}`);

        totalTokensIn += llmResp.tokensIn;
        totalTokensOut += llmResp.tokensOut;
        totalTokensCached += llmResp.tokensCached;
        totalLatenciaMs += llmResp.latenciaMs;
        modeloUsadoFinal = llmResp.modeloUsado;

        if (!llmResp.toolCalls || llmResp.toolCalls.length === 0) {
          // Sem tool calls — output direto
          respostaFinal = { conteudo_md: llmResp.content };
          break;
        }

        // Adiciona assistant com tool_calls
        llmMessages.push({
          role: 'assistant',
          content: llmResp.content || null,
          tool_calls: llmResp.toolCalls.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });

        let temConsolidado = false;
        for (const tc of llmResp.toolCalls) {
          if (tc.name === 'consolidar-roteiro') {
            consolidadoCard = tc.arguments;
            temConsolidado = true;
          }
        }

        for (const tc of llmResp.toolCalls) {
          let resultado: any;
          if (tc.name === 'delegar-mestre') {
            // Chamada recursiva ao próprio agente-executar
            const r = await fetch(`${SUPABASE_URL}/functions/v1/agente-executar`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agente_slug: tc.arguments.mestre_slug,
                tenant_id, cliente_id, caso_id,
                solicitante_id,
                briefing: tc.arguments.briefing + (tc.arguments.parte ? `\n\nParte: ${tc.arguments.parte}` : ''),
              }),
            });
            const data = await r.json();
            mestresInvocados.push({ slug: tc.arguments.mestre_slug, output: data, uso: data?.uso });
            resultado = {
              ok: data.ok,
              mestre: tc.arguments.mestre_slug,
              entregavel_id: data.entregavel_id,
              titulo: data.titulo,
              conteudo: data.conteudo_estruturado,
              uso: data.uso,
            };
          } else if (tc.name === 'consolidar-roteiro') {
            resultado = { status: 'card_capturado' };
          } else {
            resultado = { error: `Tool '${tc.name}' não suportada por orquestrador` };
          }
          llmMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(resultado),
          });
        }

        if (temConsolidado) break;
        if (round === MAX_ROUNDS) {
          respostaFinal = { conteudo_md: llmResp.content || '[Limite de rounds]' };
        }
      }

      respostaFinal = {
        tipo: 'orquestracao-copy',
        titulo: consolidadoCard?.objetivo || 'Roteiro consolidado',
        conteudo_estruturado: consolidadoCard || respostaFinal,
        conteudo_md: consolidadoCard ? formatarConsolidadoMd(consolidadoCard) : (respostaFinal?.conteudo_md || ''),
        nota_de_dissenso: null,
      };
    } else {
      // Worker simples (mestre individual): 1 chamada, JSON estruturado
      const llmResp = await chamarLLM({
        modelo: worker.modelo || 'openai:gpt-4o',
        systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
        temperatura: worker.temperatura ?? 0.6,
        maxTokens: 4096,
      }, `agente-${agente_slug}`);

      totalTokensIn = llmResp.tokensIn;
      totalTokensOut = llmResp.tokensOut;
      totalTokensCached = llmResp.tokensCached;
      totalLatenciaMs = llmResp.latenciaMs;
      modeloUsadoFinal = llmResp.modeloUsado;

      // Wrap pra reuso da lógica de parse abaixo
      var llmResp_legacy = llmResp;
    }

    // 8. Parse: orquestrador já tem respostaFinal preenchido. Worker simples precisa parsear.
    let respObj: any = null;
    if (orquestrador) {
      respObj = respostaFinal;
    } else {
      try {
        const txt = llmResp_legacy.content.trim();
        const jsonMatch = txt.match(/```json\s*([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\})/);
        const jsonStr = jsonMatch ? jsonMatch[1] : txt;
        respObj = JSON.parse(jsonStr);
      } catch (e) {
        respObj = {
          tipo: 'erro_parse',
          titulo: 'Worker não retornou JSON estruturado',
          conteudo_estruturado: { raw: llmResp_legacy.content },
          conteudo_md: llmResp_legacy.content,
          nota_de_dissenso: null,
        };
      }
    }

    // 9. Loga execução (consolidado se foi orquestrador)
    await logarExecucao({
      agenteId: worker.id,
      input: { briefing, entregavel_origem_id, contexto_extra },
      output: respObj,
      modelo: modeloUsadoFinal,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
      latenciaMs: totalLatenciaMs,
    });

    // 10. Loga custo FinOps
    const custoUSD = calcularCustoUSD(modeloUsadoFinal, totalTokensIn, totalTokensOut, totalTokensCached);
    await logarCustoFinOps({
      agenteSlug: agente_slug,
      modelo: modeloUsadoFinal,
      custoUSD,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
    });

    // 11. Se Worker pausou em dissenso → não cria entregável, retorna nota
    if (respObj.nota_de_dissenso) {
      return jsonResp({
        ok: true,
        pausou_em_dissenso: true,
        nota_de_dissenso: respObj.nota_de_dissenso,
        worker_id: worker.id,
        worker_slug: agente_slug,
        uso: {
          modelo: modeloUsadoFinal,
          tokens_in: totalTokensIn,
          tokens_out: totalTokensOut,
          tokens_cached: totalTokensCached,
          custo_usd: Number(custoUSD.toFixed(6)),
          latencia_ms: totalLatenciaMs,
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
      conteudo_md: respObj.conteudo_md,
      titulo: respObj.titulo,
      tipo: respObj.tipo,
      worker_slug: agente_slug,
      orquestrador,
      mestres_invocados: mestresInvocados.map(m => ({ slug: m.slug, entregavel_id: m.output?.entregavel_id, custo_usd: m.uso?.custo_usd })),
      uso: {
        modelo: modeloUsadoFinal,
        tokens_in: totalTokensIn,
        tokens_out: totalTokensOut,
        tokens_cached: totalTokensCached,
        cache_hit_pct: totalTokensIn > 0 ? Number(((totalTokensCached / totalTokensIn) * 100).toFixed(1)) : 0,
        custo_usd: Number(custoUSD.toFixed(6)),
        latencia_ms: totalLatenciaMs,
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
