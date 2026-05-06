// ========================================================================
// Edge Function: chief-orquestrar
// ========================================================================
// Loader do Chief / Orquestrador Geral.
//
// Recebe: { tenant_id, cliente_id, solicitante_id, caso_id?, mensagem }
// Retorna: { caso_id, plano_card } com Card de Plano da Missão
//          OU { caso_id, resposta_direta } se for refinamento simples.
//
// Fluxo:
// 1. Carrega Chief do banco + APRENDIZADOS + perfil do solicitante
// 2. Carrega histórico recente da conversa
// 3. Carrega top N agentes relevantes (RAG via capabilities)
// 4. Monta system prompt
// 5. Chama LLM (gpt-5 default) — modo 1ª chamada: gera Card de Plano
// 6. Loga execução em pinguim.agente_execucoes
// 7. Loga custo em pinguim.custos_diarios (FinOps)
// 8. Insere mensagens em pinguim.conversas
// 9. Retorna pro painel
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  sb,
  carregarAgente,
  carregarMemoriaIndividual,
  carregarHistorico,
  montarSystemPrompt,
  chamarLLM,
  logarExecucao,
  logarCustoFinOps,
  logarTool,
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
// Tools que o Chief pode chamar (formato OpenAI)
// =====================================================
const CHIEF_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar-cerebro',
      description: 'Busca semantica num Cérebro específico (produto, metodologia, etc). Use quando o caso menciona produto/tema do Pinguim.',
      parameters: {
        type: 'object',
        properties: {
          cerebro_slug: { type: 'string', description: 'slug do Cérebro (ex: proalt, low-ticket-digital)' },
          query: { type: 'string', description: 'pergunta ou tema pra buscar' },
          top_k: { type: 'number', description: 'quantidade de chunks (default 8)', default: 8 },
        },
        required: ['cerebro_slug', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar-agente-relevante',
      description: 'RAG sobre catálogo de Workers. Devolve top N agentes relevantes pro briefing. Use ANTES de propor squad.',
      parameters: {
        type: 'object',
        properties: {
          caso_descricao: { type: 'string', description: 'descrição do caso' },
          top_k: { type: 'number', default: 8 },
        },
        required: ['caso_descricao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'montar-card-plano',
      description: 'Gera o Card de Plano da Missão pro painel. Use DEPOIS de diagnosticar e ANTES de aguardar aprovação humana.',
      parameters: {
        type: 'object',
        properties: {
          diagnostico: { type: 'string', description: '2-3 linhas sobre o que entendeu do caso' },
          squad: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agente_slug: { type: 'string' },
                papel: { type: 'string' },
                justificativa: { type: 'string' },
              },
              required: ['agente_slug', 'papel', 'justificativa'],
            },
          },
          proximos_passos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ordem: { type: 'number' },
                acao: { type: 'string' },
                depende_de: { type: 'array', items: { type: 'number' } },
              },
              required: ['ordem', 'acao'],
            },
          },
          estimativa_minutos: {
            type: ['number', 'null'],
            description: 'NULL se não houver histórico de execuções suficiente. NÃO invente número.',
          },
          estimativa_custo_usd: {
            type: ['number', 'null'],
            description: 'NULL se não houver histórico de execuções suficiente. NÃO invente número.',
          },
          pergunta_aprovacao: { type: 'string', description: 'pergunta direta pra cliente aprovar', default: 'Posso seguir, ou quer ajustar?' },
        },
        required: ['diagnostico', 'squad', 'proximos_passos'],
      },
    },
  },
];

// =====================================================
// Roteador determinístico: small-talk vs trabalho real
// Princípio script-vs-LLM (feedback_script_vs_llm.md): saudação não passa por gpt-5.
// =====================================================
type Roteamento =
  | { tipo: 'saudacao'; resposta: string }
  | { tipo: 'agradecimento'; resposta: string }
  | { tipo: 'trabalho_curto' } // 1 frase ambígua → modelo mini
  | { tipo: 'trabalho_completo' }; // pedido com substância → modelo padrão

function rotear(mensagem: string, historicoLen: number): Roteamento {
  const m = mensagem.trim().toLowerCase().replace(/[!?.,]+$/g, '');
  const palavras = m.split(/\s+/).filter(Boolean).length;

  // Saudações puras (apenas no início da conversa — sem histórico)
  const SAUDACOES = /^(oi|olá|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|hey|hi|hello)$/;
  const PERG_BEM = /^(tudo bem|tudo certo|td bem|tudo joia|beleza|como vai|como você está)\??$/;
  if (historicoLen === 0 && (SAUDACOES.test(m) || PERG_BEM.test(m))) {
    return {
      tipo: 'saudacao',
      resposta:
        'Oi! Eu sou o Chief, orquestrador da squad Pinguim. Pra abrir um caso, me conta: ' +
        'qual produto/área (ex.: ProAlt, Elo, Lo-fi), o que você quer entregar e até quando. ' +
        'Eu monto o briefing, escolho a squad e te apresento o Plano da Missão pra aprovação.',
    };
  }

  const AGRADECIMENTOS = /^(obrigado|obrigada|valeu|vlw|ok|certo|tranquilo|beleza)$/;
  if (AGRADECIMENTOS.test(m)) {
    return { tipo: 'agradecimento', resposta: 'Tranquilo. Quando precisar, é só chamar.' };
  }

  // Mensagem curta sem histórico → ainda usa LLM, mas modelo mini
  if (historicoLen === 0 && palavras <= 6) {
    return { tipo: 'trabalho_curto' };
  }

  return { tipo: 'trabalho_completo' };
}

// =====================================================
// Resolve solicitante: lê pinguim.perfis pelo id
// =====================================================
async function resolverSolicitante(solicitanteId: string | null): Promise<{ slug: string | null; nome: string | null }> {
  if (!solicitanteId) return { slug: null, nome: null };
  const { data } = await sb()
    .from('perfis')
    .select('nome, role')
    .eq('id', solicitanteId)
    .maybeSingle();
  if (!data) return { slug: null, nome: null };
  // Normaliza nome → slug (luiz, micha, pedro, andre-codina, ...)
  const slug = (data.nome || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return { slug, nome: data.nome };
}

// =====================================================
// Top agentes relevantes via RAG sobre capabilities
// (Por enquanto: simples filtro — RAG semântico será Bloco 3.5)
//
// IMPORTANTE: só conta agentes REAIS no banco (não inventa). Se não tem
// nenhum Worker construído ainda, retorna [] e o Chief é orientado a NÃO
// alucinar squad — ele propõe Clones como conselheiros ou marca papéis
// como "agente a criar".
// =====================================================
async function topAgentesRelevantes(
  _casoDescricao: string,
  topK = 8,
): Promise<Array<{ slug: string; nome: string; capabilities: string[]; proposito: string; status: string }>> {
  const { data } = await sb()
    .from('agentes')
    .select('slug, nome, capabilities, proposito, status')
    .neq('slug', 'chief')
    .in('status', ['em_producao', 'em_teste'])
    .limit(topK);
  return (data || []).map((a: any) => ({
    slug: a.slug,
    nome: a.nome,
    capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
    proposito: a.proposito || '',
    status: a.status,
  }));
}

// =====================================================
// Cria/recupera caso_id
// =====================================================
async function obterOuCriarCasoId(
  tenantId: string,
  clienteId: string,
  casoIdInput: string | null,
): Promise<string> {
  if (casoIdInput) return casoIdInput;
  // Cria novo caso = uuid gerado pelo banco (usa primeiro id de conversa nova)
  // Por ora, usa crypto.randomUUID() do Deno
  return crypto.randomUUID();
}

// =====================================================
// Executor de tools do Chief
// =====================================================
const MAX_TOOL_ROUNDS = 3; // Padrão Replit: reflexão a cada 3 workers

async function executarTool(
  toolName: string,
  toolArgs: any,
  chiefId: string,
): Promise<string> {
  const tTool = Date.now();
  let resultado: string;
  let sucesso = true;

  try {
    switch (toolName) {
      case 'buscar-cerebro': {
        // Chama a Edge Function buscar-cerebro internamente
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/buscar-cerebro`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cerebro_slug: toolArgs.cerebro_slug,
            query: toolArgs.query,
            top_k: toolArgs.top_k || 8,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `buscar-cerebro ${resp.status}`);
        resultado = JSON.stringify(data);
        break;
      }
      case 'buscar-agente-relevante': {
        // Executa localmente (mesmo DB)
        const agentes = await topAgentesRelevantes(toolArgs.caso_descricao, toolArgs.top_k || 8);
        resultado = JSON.stringify({
          total: agentes.length,
          agentes: agentes.map(a => ({
            slug: a.slug,
            nome: a.nome,
            proposito: a.proposito,
            capabilities: a.capabilities,
          })),
        });
        break;
      }
      case 'montar-card-plano': {
        // Terminal: não executa, apenas sinaliza pro loop parar
        resultado = JSON.stringify({ status: 'card_capturado' });
        break;
      }
      default:
        resultado = JSON.stringify({ error: `Tool '${toolName}' não implementada` });
        sucesso = false;
    }
  } catch (e: any) {
    resultado = JSON.stringify({ error: e.message });
    sucesso = false;
  }

  // Loga invocação da tool
  await logarTool({
    agenteId: chiefId,
    toolNome: toolName,
    inputResumo: toolArgs,
    outputResumo: resultado.slice(0, 500),
    sucesso,
    erro: sucesso ? undefined : resultado,
    duracaoMs: Date.now() - tTool,
  });

  return resultado;
}

// =====================================================
// Handler principal
// =====================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);
  if (!(await requireAuth(req))) return jsonResp({ error: 'Não autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON inválido' }, 400); }

  const { tenant_id, cliente_id, solicitante_id, caso_id: casoIdInput, mensagem } = body;
  if (!tenant_id || !cliente_id || !mensagem) {
    return jsonResp({ error: 'Faltam: tenant_id, cliente_id, mensagem' }, 400);
  }

  const tInicio = Date.now();
  try {
    // 1. Carrega Chief (sempre — é leve, 1 row do banco)
    const chief = await carregarAgente('chief');

    // 2. Caso ID + persistência da mensagem do humano (sempre — barato, importante pra histórico)
    const casoId = await obterOuCriarCasoId(tenant_id, cliente_id, casoIdInput || null);
    await sb().from('conversas').insert({
      tenant_id,
      cliente_id,
      agente_id: chief.id,
      caso_id: casoId,
      papel: 'humano',
      conteudo: mensagem,
    });

    // 3. Histórico recente (precisa pro roteador decidir se é 1ª msg ou refinamento)
    const historico = await carregarHistorico(tenant_id, cliente_id, casoId, 20);

    // =====================================================
    // 4. ROTEADOR — script vs LLM (princípio script-vs-LLM)
    //    Saudação/agradecimento NUNCA passa por gpt-5.
    // =====================================================
    const rota = rotear(mensagem, historico.length);

    if (rota.tipo === 'saudacao' || rota.tipo === 'agradecimento') {
      // Resposta canned — custo zero, latência <100ms
      await sb().from('conversas').insert({
        tenant_id, cliente_id, agente_id: chief.id, caso_id: casoId,
        papel: 'chief', conteudo: rota.resposta,
      });
      return jsonResp({
        ok: true,
        caso_id: casoId,
        resposta: rota.resposta,
        plano_card: null,
        tools_executadas: [],
        uso: {
          modelo: 'rota:script',
          tokens_in: 0, tokens_out: 0, tokens_cached: 0,
          cache_hit_pct: 0, custo_usd: 0,
          tool_rounds: 0, latencia_llm_ms: 0,
          latencia_total_ms: Date.now() - tInicio,
        },
      });
    }

    // =====================================================
    // 5. Pipeline LLM (mensagens com substância)
    // =====================================================

    // Memória individual (Tier 1 + Tier 2)
    const { aprendizados, perfilSolicitante } = await carregarMemoriaIndividual(
      chief.id, solicitante_id || null,
    );

    // Resolve solicitante
    const solicitante = await resolverSolicitante(solicitante_id || null);

    // Top agentes relevantes — só conta agentes REAIS em produção/teste.
    // Se vazio, o system prompt já instrui o Chief a NÃO inventar squad.
    const topAgentes = await topAgentesRelevantes(mensagem, 8);

    // Modelo: trabalho curto vai pro mini (50x mais barato).
    // Trabalho completo usa o modelo configurado no banco (gpt-5).
    const modeloEfetivo = rota.tipo === 'trabalho_curto'
      ? 'openai:gpt-5-mini'
      : chief.modelo;

    // Monta system prompt + guardrails dinâmicos
    let systemPrompt = montarSystemPrompt({
      agente: chief,
      aprendizados,
      perfilSolicitante,
      solicitanteSlug: solicitante.slug,
      historico,
      topAgentesRelevantes: topAgentes,
    });

    // Guardrail anti-alucinação: explícito e dinâmico
    const guardrail: string[] = [];
    if (topAgentes.length === 0) {
      guardrail.push(
        '\n## ⚠ ESTADO ATUAL DA SQUAD\n' +
        'Hoje VOCÊ É O ÚNICO AGENTE construído no banco. Não existem Workers reais ainda.\n' +
        '**REGRAS DUROS:**\n' +
        '- NÃO invente nomes de agentes (ex.: "ux-writer", "copywriter-ptbr") como se já existissem.\n' +
        '- Se o caso pede uma squad, proponha papéis genéricos marcados como "agente a criar".\n' +
        '- Você pode citar Clones (fontes de voz, ex.: Hormozi, Schwartz) como CONSELHEIROS, não como Workers.\n' +
        '- Para 1ª mensagem de caso novo, FAÇA 3-5 PERGUNTAS de briefing antes de gerar plano.\n'
      );
    } else {
      const slugsReais = topAgentes.map(a => a.slug).join(', ');
      guardrail.push(
        `\n## ⚠ AGENTES REAIS DISPONÍVEIS\nSquad só pode conter slugs desta lista: [${slugsReais}].\n` +
        'Qualquer outro slug é INVENÇÃO. Se faltar papel, marque "agente a criar".\n'
      );
    }
    guardrail.push(
      '\n## ⚠ ESTIMATIVAS\n' +
      'Você NÃO TEM histórico de execuções pra estimar tempo/custo de squad. ' +
      'Em `montar-card-plano`, passe `estimativa_minutos: null` e `estimativa_custo_usd: null`. ' +
      'Mentir números aqui (ex.: "7h", "US$ 480") quebra confiança do cliente.\n'
    );
    guardrail.push(
      '\n## ⚠ BRIEFING DIRIGIDO\n' +
      'Para caso novo (sem histórico), NÃO gere plano direto. Faça primeiro 3-5 perguntas curtas ' +
      'pra fechar: produto/área, objetivo concreto, prazo, restrições, referências. ' +
      'Plano só vem DEPOIS do humano responder. Se o humano já mandou tudo na 1ª msg, pode pular.\n'
    );
    systemPrompt += guardrail.join('');

    // Messages: histórico + nova msg
    const llmMessages: any[] = historico.map((h) => ({
      role: h.papel === 'humano' ? 'user' : 'assistant',
      content: h.conteudo,
    }));
    llmMessages.push({ role: 'user', content: mensagem });

    // =====================================================
    // 10. Loop de tool calling (máx MAX_TOOL_ROUNDS rounds)
    // =====================================================
    // Acumula custos de todas as chamadas LLM no loop
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalTokensCached = 0;
    let totalLatenciaMs = 0;
    let toolsExecutadas: string[] = [];
    let planoCard: any = null;
    let respostaTexto = '';
    let modeloUsado = '';
    let rounds = 0;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      rounds = round + 1;
      const llmResp = await chamarLLM(
        {
          modelo: modeloEfetivo,
          systemPrompt,
          messages: llmMessages,
          tools: CHIEF_TOOLS,
          temperatura: chief.temperatura ?? 0.4,
          maxTokens: rota.tipo === 'trabalho_curto' ? 512 : 4096,
        },
        'chief-orquestrar',
      );

      totalTokensIn += llmResp.tokensIn;
      totalTokensOut += llmResp.tokensOut;
      totalTokensCached += llmResp.tokensCached;
      totalLatenciaMs += llmResp.latenciaMs;
      modeloUsado = llmResp.modeloUsado;

      // Se não tem tool calls → resposta final
      if (!llmResp.toolCalls || llmResp.toolCalls.length === 0) {
        respostaTexto = llmResp.content;
        break;
      }

      // Processa tool calls
      // Primeiro: adiciona a mensagem do assistant com tool_calls ao histórico
      llmMessages.push({
        role: 'assistant',
        content: llmResp.content || null,
        tool_calls: llmResp.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      // Checa se montar-card-plano foi chamado (é terminal)
      let temCardPlano = false;
      for (const tc of llmResp.toolCalls) {
        if (tc.name === 'montar-card-plano') {
          planoCard = tc.arguments;
          temCardPlano = true;
        }
      }

      // Executa cada tool e adiciona resultado como tool message
      for (const tc of llmResp.toolCalls) {
        const resultado = await executarTool(tc.name, tc.arguments, chief.id);
        toolsExecutadas.push(tc.name);
        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultado,
        });
      }

      // Se montar-card-plano foi chamado, para o loop
      if (temCardPlano) {
        respostaTexto = llmResp.content || `Plano da missão pronto. ${planoCard?.pergunta_aprovacao || 'Posso seguir, ou quer ajustar?'}`;
        break;
      }

      // Se é o último round, usa o content como resposta
      if (round === MAX_TOOL_ROUNDS) {
        respostaTexto = llmResp.content || '[Chief atingiu limite de rounds de tool calling]';
      }
    }

    // =====================================================
    // 11. Loga execução consolidada
    // =====================================================
    const custoUSD = calcularCustoUSD(modeloUsado, totalTokensIn, totalTokensOut, totalTokensCached);

    await logarExecucao({
      agenteId: chief.id,
      input: { tenant_id, cliente_id, solicitante_id, caso_id: casoId, mensagem },
      output: { content: respostaTexto, plano_card: planoCard, tools_executadas: toolsExecutadas },
      contextoUsado: {
        historico_turnos: historico.length,
        top_agentes: topAgentes.map((a) => a.slug),
        aprendizados_chars: aprendizados.length,
        perfil_chars: perfilSolicitante?.length || 0,
        tool_rounds: rounds,
      },
      modelo: modeloUsado,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
      latenciaMs: totalLatenciaMs,
    });

    // 12. Loga custo no FinOps (consolidado de todos os rounds)
    await logarCustoFinOps({
      agenteSlug: 'chief',
      modelo: modeloUsado,
      custoUSD,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
    });

    // 13. Monta resposta final
    if (planoCard && !respostaTexto) {
      respostaTexto = `Plano da missão pronto. ${planoCard.pergunta_aprovacao || 'Posso seguir, ou quer ajustar?'}`;
    }

    // 14. Insere resposta do Chief em conversas
    await sb().from('conversas').insert({
      tenant_id,
      cliente_id,
      agente_id: chief.id,
      caso_id: casoId,
      papel: 'chief',
      conteudo: respostaTexto,
      artefatos: planoCard ? { tipo: 'card_plano_missao', card: planoCard } : null,
    });

    return jsonResp({
      ok: true,
      caso_id: casoId,
      resposta: respostaTexto,
      plano_card: planoCard,
      tools_executadas: toolsExecutadas,
      uso: {
        modelo: modeloUsado,
        tokens_in: totalTokensIn,
        tokens_out: totalTokensOut,
        tokens_cached: totalTokensCached,
        cache_hit_pct: totalTokensIn > 0 ? Number(((totalTokensCached / totalTokensIn) * 100).toFixed(1)) : 0,
        custo_usd: Number(custoUSD.toFixed(6)),
        tool_rounds: rounds,
        latencia_llm_ms: totalLatenciaMs,
        latencia_total_ms: Date.now() - tInicio,
      },
    });
  } catch (e: any) {
    console.error('[chief-orquestrar] erro:', e.message, e.stack);
    return jsonResp({
      error: 'Erro ao orquestrar',
      detalhe: e.message,
      latencia_ms: Date.now() - tInicio,
    }, 500);
  }
});
