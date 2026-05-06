// ========================================================================
// _shared/agente.ts
// ========================================================================
// Helpers compartilhados entre Edge Functions de agente (chief-orquestrar,
// agente-executar, comprimir-output).
//
// - carregarAgente(slug): linha completa do agente em pinguim.agentes
// - carregarMemoriaIndividual: APRENDIZADOS + perfil do solicitante
// - montarSystemPrompt: monta system prompt do agente
// - chamarLLM: wrapper agnóstico de provedor (openai:gpt-5, anthropic:claude-opus-4-7, ...)
// - logarExecucao: insere em pinguim.agente_execucoes + tool_invocacoes
// - calcularCusto: tabela de preços por modelo (atualizar quando OpenAI mudar)
// ========================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from './cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

let _client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
  return _client;
}

// =====================================================
// Tabela de preços OpenAI / Anthropic (USD por 1K tokens)
// Atualizado em 2026-05-05 a partir de fontes oficiais (Finout, PE Collective, PricePerToken).
// gpt-5 + gpt-5-mini têm prompt caching com -90% no input.
// Família gpt-4o tem cache com -50% no input.
// =====================================================
const PRECOS_USD_POR_1K = {
  // OpenAI
  'openai:gpt-5':                { input: 0.00125, output: 0.010,   cached_input: 0.000125 },
  'openai:gpt-5-mini':           { input: 0.00025, output: 0.002,   cached_input: 0.000025 },
  'openai:gpt-5-codex':          { input: 0.00125, output: 0.010,   cached_input: 0.000125 },
  'openai:gpt-5-chat-latest':    { input: 0.00125, output: 0.010,   cached_input: 0.000125 },
  'openai:o3':                   { input: 0.00200, output: 0.008,   cached_input: 0.000500 },
  'openai:o3-mini':              { input: 0.00110, output: 0.0044,  cached_input: 0.000275 },
  'openai:o1-pro':               { input: 0.0150,  output: 0.060,   cached_input: 0.0075   },
  'openai:gpt-4o':               { input: 0.00250, output: 0.010,   cached_input: 0.001250 },
  'openai:gpt-4o-mini':          { input: 0.00015, output: 0.0006,  cached_input: 0.000075 },
  'openai:text-embedding-3-small': { input: 0.00002, output: 0,     cached_input: 0.00002  },
  // Anthropic (sem mudança — referência pra futuro)
  'anthropic:claude-opus-4-7':   { input: 0.015,  output: 0.075,   cached_input: 0.0015   },
  'anthropic:claude-sonnet-4-6': { input: 0.003,  output: 0.015,   cached_input: 0.0003   },
  'anthropic:claude-haiku-4-5':  { input: 0.0008, output: 0.004,   cached_input: 0.00008  },
};

export function calcularCustoUSD(
  modelo: string,
  tokensIn: number,
  tokensOut: number,
  tokensCached = 0,
): number {
  const preco = PRECOS_USD_POR_1K[modelo as keyof typeof PRECOS_USD_POR_1K];
  if (!preco) return 0;
  const tokensInNaoCached = Math.max(0, tokensIn - tokensCached);
  return (tokensInNaoCached / 1000) * preco.input
       + (tokensCached / 1000) * preco.cached_input
       + (tokensOut / 1000) * preco.output;
}

// =====================================================
// Carregar agente do banco
// =====================================================
export interface AgenteRow {
  id: string;
  slug: string;
  nome: string;
  avatar: string;
  status: string;
  modelo: string;
  modelo_fallback: string | null;
  missao: string;
  entrada: string;
  saida_esperada: string;
  limites: string;
  handoff: string;
  criterio_qualidade: string;
  metrica_sucesso: string;
  retrieval_k: number;
  temperatura: number;
  custo_estimado_exec: number;
  limite_execucoes_dia: number;
  kill_switch_ativo: boolean;
  capabilities: string[];
  proposito: string;
  protocolo_dissenso: string;
  ferramentas: string[];
  system_prompt: string | null;
}

export async function carregarAgente(slug: string): Promise<AgenteRow> {
  const { data, error } = await sb().from('agentes').select('*').eq('slug', slug).single();
  if (error || !data) throw new Error(`Agente '${slug}' não encontrado: ${error?.message}`);
  if (data.kill_switch_ativo) throw new Error(`Agente '${slug}' está com kill_switch ativo`);
  return data as AgenteRow;
}

// =====================================================
// Memória individual (APRENDIZADOS + perfil do solicitante)
// =====================================================
export async function carregarMemoriaIndividual(
  agenteId: string,
  solicitanteId: string | null,
): Promise<{ aprendizados: string; perfilSolicitante: string | null }> {
  // 1. Aprendizados gerais (Tier 1)
  const { data: ap } = await sb()
    .from('aprendizados_agente')
    .select('conteudo_md')
    .eq('agente_id', agenteId)
    .maybeSingle();
  const aprendizados = ap?.conteudo_md || '';

  // 2. Perfil do solicitante (Tier 2)
  let perfilSolicitante: string | null = null;
  if (solicitanteId) {
    const { data: perfil } = await sb()
      .from('aprendizados_cliente_agente')
      .select('conteudo_md')
      .eq('agente_id', agenteId)
      .eq('cliente_id', solicitanteId)
      .maybeSingle();
    perfilSolicitante = perfil?.conteudo_md || null;
  }

  return { aprendizados, perfilSolicitante };
}

// =====================================================
// Histórico recente do caso
// =====================================================
export async function carregarHistorico(
  tenantId: string,
  clienteId: string,
  casoId: string | null,
  limite = 20,
): Promise<Array<{ papel: string; conteudo: string; criado_em: string; artefatos?: any }>> {
  let q = sb()
    .from('conversas')
    .select('papel, conteudo, criado_em, artefatos')
    .eq('tenant_id', tenantId)
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (casoId) q = q.eq('caso_id', casoId);

  const { data, error } = await q;
  if (error) throw new Error(`carregarHistorico: ${error.message}`);
  return (data || []).reverse(); // ordem cronológica pro prompt
}

// =====================================================
// Montar system prompt do agente
// Combina: SYSTEM-PROMPT estático (do banco) + memórias + contexto do caso
// =====================================================
export interface MontarPromptInput {
  agente: AgenteRow;
  aprendizados: string;
  perfilSolicitante: string | null;
  solicitanteSlug: string | null; // luiz | micha | pedro | andre-codina | ...
  historico: Array<{ papel: string; conteudo: string; artefatos?: any }>;
  topAgentesRelevantes?: Array<{ slug: string; nome: string; capabilities: string[]; proposito: string }>;
}

export function montarSystemPrompt(input: MontarPromptInput): string {
  const { agente, aprendizados, perfilSolicitante, solicitanteSlug, topAgentesRelevantes } = input;

  const partes: string[] = [];

  // 1. Identidade base (system_prompt do banco se houver, senão monta minimal)
  if (agente.system_prompt) {
    partes.push(agente.system_prompt);
  } else {
    partes.push(
      `Você é o **${agente.nome} ${agente.avatar}**.\n\n` +
      `## Missão\n${agente.missao}\n\n` +
      `## Propósito\n${agente.proposito || ''}\n\n` +
      `## Critério de qualidade\n${agente.criterio_qualidade || ''}`
    );
  }

  // 2. Memória geral (Tier 1)
  if (aprendizados && aprendizados.trim()) {
    partes.push(`\n## Memória do agente (geral, agregada entre clientes)\n${aprendizados}`);
  }

  // 3. Perfil do solicitante (Tier 2)
  if (perfilSolicitante && perfilSolicitante.trim()) {
    partes.push(
      `\n## Memória sobre o solicitante atual${solicitanteSlug ? ` (${solicitanteSlug})` : ''}\n${perfilSolicitante}`
    );
  }

  // 4. Top agentes relevantes (RAG capabilities — Pedro Valerio)
  if (topAgentesRelevantes && topAgentesRelevantes.length > 0) {
    const lista = topAgentesRelevantes
      .map(a => `- **${a.slug}** (${a.nome}): ${a.proposito || a.capabilities.join(', ')}`)
      .join('\n');
    partes.push(`\n## Workers disponíveis pra esta squad\n${lista}\n\nUse \`buscar-agente-relevante\` se precisar de outros.`);
  }

  // 5. Protocolo de dissenso (se for Worker, vem aqui)
  if (agente.protocolo_dissenso) {
    partes.push(`\n## Protocolo de Dissenso\n${agente.protocolo_dissenso}`);
  }

  return partes.join('\n');
}

// =====================================================
// Tools que orquestradores de squad usam (delegar mestre + consolidar).
// Compartilhado entre agente-executar (HTTP) e atendente-pinguim (inline).
// =====================================================
export const TOOLS_ORQUESTRADOR_SQUAD = [
  {
    type: 'function',
    function: {
      name: 'delegar-mestre',
      description: 'Invoca um mestre da squad pra executar parte do trabalho. Devolve a contribuicao estruturada do mestre.',
      parameters: {
        type: 'object',
        properties: {
          mestre_slug: { type: 'string', description: 'slug do mestre (ex.: alex-hormozi, eugene-schwartz, gary-halbert, gary-bencivenga)' },
          briefing: { type: 'string', description: 'briefing claro pro mestre — objetivo, publico, parametros' },
          parte: { type: 'string', description: 'parte do roteiro (gancho, desenvolvimento, completo)', default: 'completo' },
        },
        required: ['mestre_slug', 'briefing'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consolidar-roteiro',
      description: 'Consolida contribuicoes dos mestres em copy/roteiro final. Use DEPOIS de invocar 1-2 mestres. Termina o orquestrador.',
      parameters: {
        type: 'object',
        properties: {
          objetivo: { type: 'string' },
          publico_consciencia: { type: 'string' },
          mestres_usados: { type: 'array', items: { type: 'string' } },
          justificativa: { type: 'string' },
          copy_final: {
            type: 'object',
            properties: {
              gancho: { type: 'string' },
              desenvolvimento: { type: 'string' },
              virada: { type: 'string' },
              cta: { type: 'string' },
              metodo_anotado: { type: 'string' },
            },
          },
        },
        required: ['objetivo', 'mestres_usados', 'justificativa', 'copy_final'],
      },
    },
  },
];

export function ehOrquestrador(agente: AgenteRow): boolean {
  return Array.isArray(agente.ferramentas) && agente.ferramentas.includes('delegar-mestre');
}

export function formatarConsolidadoMd(card: any): string {
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
export const SCHEMA_RESPOSTA_WORKER = `
Sua resposta DEVE ser JSON valido com esta estrutura:

{
  "tipo": "<copy|pagina|relatorio|plano|outro>",
  "titulo": "<titulo curto>",
  "conteudo_estruturado": { /* estrutura tipada do entregavel */ },
  "conteudo_md": "<versao markdown legivel>",
  "nota_de_dissenso": null
}

REGRAS:
- conteudo_estruturado e OBRIGATORIO (sem blob de texto).
- Se briefing contradiz seu APRENDIZADOS, preencha nota_de_dissenso e retorne sem gerar entregavel.
`;

// =====================================================
// EXECUTOR INLINE — modelo OpenClaw real.
// Carrega agente do banco, executa LLM (com loop tool calling se for orquestrador),
// retorna resultado estruturado. NÃO faz fetch HTTP entre Edge Functions.
//
// Tools resolvidas inline:
// - delegar-mestre → chamada recursiva ao próprio executarAgenteInline
// - consolidar-roteiro → terminal, captura card
// - buscar-cerebro → consulta direta ao banco (será injetada pelo chamador)
//
// Resultado: 1 processo, N chamadas OpenAI sequenciais, sem timeout HTTP.
// =====================================================
export interface ExecutarInlineInput {
  agente_slug: string;
  briefing: string;
  tenant_id: string;
  cliente_id: string;
  caso_id?: string | null;
  solicitante_id?: string | null;
  contexto_extra?: any;
}

export interface ExecutarInlineOutput {
  ok: boolean;
  agente_slug: string;
  orquestrador: boolean;
  conteudo_md: string;
  conteudo_estruturado: any;
  titulo: string;
  tipo: string;
  mestres_invocados: Array<{ slug: string; titulo?: string; uso?: any }>;
  uso: {
    modelo: string;
    tokens_in: number;
    tokens_out: number;
    tokens_cached: number;
    custo_usd: number;
    latencia_ms: number;
  };
  pausou_em_dissenso?: boolean;
  nota_de_dissenso?: any;
  entregavel_id?: string | null;
}

export async function executarAgenteInline(input: ExecutarInlineInput): Promise<ExecutarInlineOutput> {
  const { agente_slug, briefing, tenant_id, cliente_id, caso_id, solicitante_id, contexto_extra } = input;
  const tInicioFn = Date.now();

  const agente = await carregarAgente(agente_slug);
  const { aprendizados, perfilSolicitante } = await carregarMemoriaIndividual(
    agente.id, solicitante_id || cliente_id,
  );

  const orquestrador = ehOrquestrador(agente);

  let systemPrompt = montarSystemPrompt({
    agente, aprendizados, perfilSolicitante,
    solicitanteSlug: null, historico: [],
  });
  if (!orquestrador) systemPrompt += '\n\n' + SCHEMA_RESPOSTA_WORKER;

  let userMsg = `## Briefing\n${briefing}`;
  if (contexto_extra) {
    userMsg += `\n\n## Contexto extra\n${typeof contexto_extra === 'string' ? contexto_extra : JSON.stringify(contexto_extra)}`;
  }

  let totalTokensIn = 0, totalTokensOut = 0, totalTokensCached = 0, totalLatenciaMs = 0;
  let modeloUsadoFinal = '';
  const mestresInvocados: Array<{ slug: string; titulo?: string; uso?: any }> = [];

  if (orquestrador) {
    const llmMessages: any[] = [{ role: 'user', content: userMsg }];
    let consolidadoCard: any = null;
    let respostaTexto = '';
    const MAX_ROUNDS = 4;

    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const llmResp = await chamarLLM({
        modelo: agente.modelo || 'openai:gpt-4o',
        systemPrompt,
        messages: llmMessages,
        tools: TOOLS_ORQUESTRADOR_SQUAD,
        temperatura: agente.temperatura ?? 0.5,
        maxTokens: 4096,
      }, `agente-${agente_slug}`);

      totalTokensIn += llmResp.tokensIn;
      totalTokensOut += llmResp.tokensOut;
      totalTokensCached += llmResp.tokensCached;
      totalLatenciaMs += llmResp.latenciaMs;
      modeloUsadoFinal = llmResp.modeloUsado;

      if (!llmResp.toolCalls || llmResp.toolCalls.length === 0) {
        respostaTexto = llmResp.content;
        break;
      }

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
          // Recursão inline — sem fetch HTTP
          const sub = await executarAgenteInline({
            agente_slug: tc.arguments.mestre_slug,
            briefing: tc.arguments.briefing + (tc.arguments.parte && tc.arguments.parte !== 'completo' ? `\n\nParte: ${tc.arguments.parte}` : ''),
            tenant_id, cliente_id, caso_id, solicitante_id,
          });
          mestresInvocados.push({ slug: tc.arguments.mestre_slug, titulo: sub.titulo, uso: sub.uso });
          // Acumula custo dos mestres no Chief
          totalTokensIn += sub.uso.tokens_in;
          totalTokensOut += sub.uso.tokens_out;
          totalTokensCached += sub.uso.tokens_cached;
          totalLatenciaMs += sub.uso.latencia_ms;
          resultado = {
            ok: sub.ok,
            mestre: tc.arguments.mestre_slug,
            titulo: sub.titulo,
            conteudo: sub.conteudo_estruturado,
            uso: sub.uso,
          };
        } else if (tc.name === 'consolidar-roteiro') {
          resultado = { status: 'card_capturado' };
        } else {
          resultado = { error: `Tool '${tc.name}' nao suportada por orquestrador inline` };
        }
        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(resultado),
        });
      }

      if (temConsolidado) break;
    }

    const custoUSD = calcularCustoUSD(modeloUsadoFinal, totalTokensIn, totalTokensOut, totalTokensCached);
    const conteudoMd = consolidadoCard ? formatarConsolidadoMd(consolidadoCard) : respostaTexto;
    const conteudoEstr = consolidadoCard || { conteudo_md: respostaTexto };

    // Loga execução do Chief em pinguim.agente_execucoes
    await logarExecucao({
      agenteId: agente.id,
      input: { briefing, contexto_extra },
      output: { tipo: 'orquestracao-copy', conteudo_md: conteudoMd, mestres: mestresInvocados.map(m => m.slug) },
      modelo: modeloUsadoFinal,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
      latenciaMs: totalLatenciaMs,
    });
    await logarCustoFinOps({
      agenteSlug: agente_slug,
      modelo: modeloUsadoFinal,
      custoUSD,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
    });

    return {
      ok: true,
      agente_slug,
      orquestrador: true,
      conteudo_md: conteudoMd,
      conteudo_estruturado: conteudoEstr,
      titulo: consolidadoCard?.objetivo || agente.nome,
      tipo: 'orquestracao-copy',
      mestres_invocados: mestresInvocados,
      uso: {
        modelo: modeloUsadoFinal,
        tokens_in: totalTokensIn,
        tokens_out: totalTokensOut,
        tokens_cached: totalTokensCached,
        custo_usd: Number(custoUSD.toFixed(6)),
        latencia_ms: totalLatenciaMs,
      },
      entregavel_id: null,
    };
  }

  // Worker simples (mestre individual): 1 chamada, JSON estruturado
  const llmResp = await chamarLLM({
    modelo: agente.modelo || 'openai:gpt-4o',
    systemPrompt,
    messages: [{ role: 'user', content: userMsg }],
    temperatura: agente.temperatura ?? 0.6,
    maxTokens: 2048,
  }, `agente-${agente_slug}`);

  totalTokensIn = llmResp.tokensIn;
  totalTokensOut = llmResp.tokensOut;
  totalTokensCached = llmResp.tokensCached;
  totalLatenciaMs = llmResp.latenciaMs;
  modeloUsadoFinal = llmResp.modeloUsado;

  let respObj: any;
  try {
    const txt = llmResp.content.trim();
    const jsonMatch = txt.match(/```json\s*([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : txt;
    respObj = JSON.parse(jsonStr);
  } catch {
    respObj = {
      tipo: 'texto',
      titulo: agente.nome,
      conteudo_estruturado: { raw: llmResp.content },
      conteudo_md: llmResp.content,
      nota_de_dissenso: null,
    };
  }

  const custoUSD = calcularCustoUSD(modeloUsadoFinal, totalTokensIn, totalTokensOut, totalTokensCached);

  await logarExecucao({
    agenteId: agente.id,
    input: { briefing, contexto_extra },
    output: respObj,
    modelo: modeloUsadoFinal,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    tokensCached: totalTokensCached,
    latenciaMs: totalLatenciaMs,
  });
  await logarCustoFinOps({
    agenteSlug: agente_slug,
    modelo: modeloUsadoFinal,
    custoUSD,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    tokensCached: totalTokensCached,
  });

  return {
    ok: true,
    agente_slug,
    orquestrador: false,
    conteudo_md: respObj.conteudo_md || llmResp.content,
    conteudo_estruturado: respObj.conteudo_estruturado || respObj,
    titulo: respObj.titulo || agente.nome,
    tipo: respObj.tipo || 'texto',
    mestres_invocados: [],
    uso: {
      modelo: modeloUsadoFinal,
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      tokens_cached: totalTokensCached,
      custo_usd: Number(custoUSD.toFixed(6)),
      latencia_ms: totalLatenciaMs,
    },
    pausou_em_dissenso: !!respObj.nota_de_dissenso,
    nota_de_dissenso: respObj.nota_de_dissenso || undefined,
    entregavel_id: null,
  };
}

// =====================================================
// Log de execução
// =====================================================
export interface LogExecucao {
  agenteId: string;
  input: any;
  output: any;
  contextoUsado?: any;
  modelo: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached?: number;
  latenciaMs: number;
  custoUSD?: number;
}

export async function logarExecucao(log: LogExecucao): Promise<string> {
  const cached = log.tokensCached || 0;
  const custo = log.custoUSD ?? calcularCustoUSD(log.modelo, log.tokensIn, log.tokensOut, cached);
  const { data, error } = await sb()
    .from('agente_execucoes')
    .insert({
      agente_id: log.agenteId,
      input: log.input,
      output: log.output,
      contexto_usado: log.contextoUsado,
      custo_usd: custo,
      latencia_ms: log.latenciaMs,
      tokens_entrada: log.tokensIn,
      tokens_saida: log.tokensOut,
      tokens_cached: cached,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[logarExecucao] erro:', error.message);
    return '';
  }
  return data?.id || '';
}

export async function logarTool(args: {
  agenteId: string;
  toolNome: string;
  inputResumo: any;
  outputResumo: any;
  sucesso: boolean;
  erro?: string;
  duracaoMs: number;
  custoUSD?: number;
}): Promise<void> {
  await sb().from('tool_invocacoes').insert({
    agente_id: args.agenteId,
    tool_nome: args.toolNome,
    input_resumo: args.inputResumo,
    output_resumo: args.outputResumo,
    sucesso: args.sucesso,
    erro: args.erro,
    duracao_ms: args.duracaoMs,
    custo_usd: args.custoUSD,
  });
}

// =====================================================
// Custos diários (FinOps) — adiciona linha em custos_diarios
// =====================================================
export async function logarCustoFinOps(args: {
  agenteSlug: string;
  modelo: string;
  custoUSD: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached?: number;
}): Promise<void> {
  // Tenta upsert. Se falhar (tabela com schema diferente), só loga e continua.
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const provedor = args.modelo.split(':')[0]; // openai | anthropic
    const operacao = `agente:${args.agenteSlug}`;
    await sb().rpc('finops_registrar_custo', {
      p_dia: hoje,
      p_provedor: provedor,
      p_operacao: operacao,
      p_custo_usd: args.custoUSD,
      p_tokens_in: args.tokensIn,
      p_tokens_out: args.tokensOut,
    });
  } catch (e) {
    // Se a RPC não existe ainda, loga e segue. FinOps não bloqueia execução.
    console.warn('[logarCustoFinOps] não logado:', (e as Error).message);
  }
}

// =====================================================
// Chamada LLM (agnóstico de provedor)
// =====================================================
// Mensagem no formato OpenAI (suporta user, assistant, tool)
export type LLMMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];     // assistant pode ter tool_calls
  tool_call_id?: string;  // tool message precisa do id
};

export interface LLMCallInput {
  modelo: string; // 'openai:gpt-5' | 'anthropic:claude-opus-4-7' | ...
  systemPrompt: string;
  messages: LLMMessage[];
  tools?: any[]; // OpenAI tools format
  temperatura?: number;
  maxTokens?: number;
}

export interface LLMCallOutput {
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: any }>;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number; // tokens de input que vieram do cache (desconto 90% no gpt-5)
  latenciaMs: number;
  modeloUsado: string; // pode diferir do solicitado se rolou fallback
}

export async function chamarLLM(
  input: LLMCallInput,
  consumidor: string,
): Promise<LLMCallOutput> {
  const [provedor, modelo] = input.modelo.split(':');
  if (provedor === 'openai') return chamarOpenAI(input, modelo, consumidor);
  if (provedor === 'anthropic') return chamarAnthropic(input, modelo, consumidor);
  throw new Error(`Provedor LLM desconhecido: ${provedor}`);
}

async function chamarOpenAI(input: LLMCallInput, modelo: string, consumidor: string): Promise<LLMCallOutput> {
  const KEY = await getChave('OPENAI_API_KEY', consumidor);
  const inicio = Date.now();

  const messages = [
    { role: 'system', content: input.systemPrompt },
    ...input.messages,
  ];

  // gpt-5, o3, o1 são modelos de raciocínio que SÓ aceitam temperature=1 (default).
  // Não enviar o campo nesses casos.
  const isReasoningModel = /^(gpt-5|o3|o1)/.test(modelo);

  const body: any = {
    model: modelo,
    messages,
    max_completion_tokens: input.maxTokens ?? 4096,
  };
  if (!isReasoningModel) {
    body.temperature = input.temperatura ?? 0.4;
  }
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
    body.tool_choice = 'auto';
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const latenciaMs = Date.now() - inicio;
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${modelo} ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = await resp.json();
  const choice = data.choices?.[0];
  const msg = choice?.message;
  const toolCalls = msg?.tool_calls?.map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  }));

  // OpenAI retorna cached_tokens em usage.prompt_tokens_details.cached_tokens
  // quando prompt caching é ativado (automático pra prompts ≥1024 tokens).
  const tokensCached = data.usage?.prompt_tokens_details?.cached_tokens || 0;

  return {
    content: msg?.content || '',
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    tokensIn: data.usage?.prompt_tokens || 0,
    tokensOut: data.usage?.completion_tokens || 0,
    tokensCached,
    latenciaMs,
    modeloUsado: `openai:${modelo}`,
  };
}

async function chamarAnthropic(input: LLMCallInput, modelo: string, consumidor: string): Promise<LLMCallOutput> {
  const KEY = await getChave('ANTHROPIC_API_KEY', consumidor);
  const inicio = Date.now();

  // Mapeia tools OpenAI format → Anthropic format
  const anthropicTools = input.tools?.map((t: any) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      system: input.systemPrompt,
      messages: input.messages,
      tools: anthropicTools,
      temperature: input.temperatura ?? 0.4,
      max_tokens: input.maxTokens ?? 4096,
    }),
  });

  const latenciaMs = Date.now() - inicio;
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic ${modelo} ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = await resp.json();

  // Anthropic content é array de blocks (text | tool_use)
  let content = '';
  const toolCalls: Array<{ id: string; name: string; arguments: any }> = [];
  for (const block of data.content || []) {
    if (block.type === 'text') content += block.text;
    if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, arguments: block.input });
  }

  // Anthropic retorna cache_read_input_tokens em usage
  const tokensCached = data.usage?.cache_read_input_tokens || 0;

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    tokensIn: data.usage?.input_tokens || 0,
    tokensOut: data.usage?.output_tokens || 0,
    tokensCached,
    latenciaMs,
    modeloUsado: `anthropic:${modelo}`,
  };
}
