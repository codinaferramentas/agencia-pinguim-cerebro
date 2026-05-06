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
