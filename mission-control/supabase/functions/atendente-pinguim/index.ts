// ========================================================================
// Edge Function: atendente-pinguim
// ========================================================================
// Atendente Pinguim 🐧 — agente único OpenClaw-style.
//
// Princípio: 1 camada. Roteia internamente. Tools agressivas.
// - Detecta saudação/agradecimento → resposta canned (script, sem LLM)
// - Detecta produto/tema (Lo-fi, Elo, ProAlt, Lira, Taurus, Orion) →
//   força buscar-cerebro ANTES do LLM responder. Não pergunta o que já sabe.
// - Demais casos → LLM (gpt-4o) com tools agressivas.
//
// Tools:
// - buscar-cerebro: RAG num Cérebro específico (já existe como Edge Function)
// - buscar-clone: traz voz de um Clone (Hormozi, Schwartz, Dalio, ...) como conselheiro
// - atualizar-perfil-cliente: APRENDIZADOS Tier 2 (perfil-por-cliente)
// - criar-script: agente cria script JS/SQL/Python e devolve pra ser executado fora
// - montar-card-plano: só quando há entregável real a delegar
//
// Modelo: openai:gpt-4o (decidido em conselho 2026-05-06).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  sb,
  carregarAgente,
  carregarMemoriaIndividual,
  carregarHistorico,
  chamarLLM,
  logarExecucao,
  logarCustoFinOps,
  logarTool,
  calcularCustoUSD,
  executarAgenteInline,
  executarComEPP,
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
// Detector semântico de produto (script — sem LLM)
// Mapeia palavras-chave → slug do Cérebro. Se bate, força buscar-cerebro
// ANTES do LLM responder. Resolve o bug "Chief perguntou qual o produto?"
// =====================================================
interface ProdutoDetectado {
  cerebro_slug: string;
  confianca: number;
}

function detectarProduto(mensagem: string): ProdutoDetectado[] {
  const m = mensagem.toLowerCase();
  const detectados: ProdutoDetectado[] = [];

  // Mapa: palavras → slug do Cérebro (slugs reais do banco)
  const MAPA: Array<{ termos: RegExp; slug: string; confianca: number }> = [
    { termos: /\b(lo[-\s]?fi|lofi|desafio.{0,15}lo[-\s]?fi)\b/i, slug: 'desafio-de-conte-do-lo-fi', confianca: 0.9 },
    { termos: /\b(elo|programa elo)\b/i, slug: 'elo', confianca: 0.85 },
    { termos: /\b(proalt|pro alt|pro\-alt|low ticket digital)\b/i, slug: 'proalt', confianca: 0.85 },
    { termos: /\b(low ticket|ticket baixo)\b/i, slug: 'low-ticket-digital', confianca: 0.7 },
    { termos: /\b(lira|lyra|mentoria iniciante)\b/i, slug: 'lyra', confianca: 0.85 },
    { termos: /\b(taurus|tuarus|mentoria escala)\b/i, slug: 'tuarus', confianca: 0.85 },
    { termos: /\b(orion|mastermind)\b/i, slug: 'orion', confianca: 0.85 },
    { termos: /\b(mentoria express)\b/i, slug: 'mentoria-express', confianca: 0.8 },
    { termos: /\b(spin selling)\b/i, slug: 'spin-selling', confianca: 0.9 },
    { termos: /\b(challenger sale)\b/i, slug: 'challenger-sale', confianca: 0.9 },
    { termos: /\b(meddic)\b/i, slug: 'meddic', confianca: 0.9 },
    { termos: /\b(sandler)\b/i, slug: 'sandler-selling', confianca: 0.9 },
    { termos: /\b(voss|tactical empathy)\b/i, slug: 'tactical-empathy-voss', confianca: 0.9 },
  ];

  for (const item of MAPA) {
    if (item.termos.test(m)) {
      detectados.push({ cerebro_slug: item.slug, confianca: item.confianca });
    }
  }

  // Se múltiplos detectados, ordena por confiança e devolve top 2
  detectados.sort((a, b) => b.confianca - a.confianca);
  return detectados.slice(0, 2);
}

// =====================================================
// Tools do Atendente Pinguim (formato OpenAI)
// =====================================================
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar-cerebro',
      description: 'Busca semantica num Cerebro especifico. Use SEMPRE que o caso menciona produto/tema (Elo, Lo-fi, ProAlt, Lira, Taurus, Orion, metodologia comercial). Devolve chunks reais do Cerebro.',
      parameters: {
        type: 'object',
        properties: {
          cerebro_slug: { type: 'string', description: 'slug do Cerebro (ex.: elo, proalt, desafio-de-conte-do-lo-fi)' },
          query: { type: 'string', description: 'pergunta ou tema pra buscar' },
          top_k: { type: 'number', default: 6 },
        },
        required: ['cerebro_slug', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar-clone',
      description: 'Traz a voz de um Clone (Hormozi, Schwartz, Dalio, Munger, ...) como conselheiro. Use quando precisa de perspectiva especialista (oferta, copy, estrategia, principios). Devolve trechos do Clone.',
      parameters: {
        type: 'object',
        properties: {
          clone_slug: { type: 'string', description: 'slug do Clone (ex.: clone-alex-hormozi, clone-eugene-schwartz, clone-ray-dalio)' },
          query: { type: 'string', description: 'tema pra qual quer a voz dele' },
          top_k: { type: 'number', default: 4 },
        },
        required: ['clone_slug', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar-perfil-cliente',
      description: 'Adiciona linha em APRENDIZADOS Tier 2 (perfil do cliente atual). Use quando aprender padrao/preferencia do cliente que vale lembrar (ex.: "André prefere copy direta sem floreio").',
      parameters: {
        type: 'object',
        properties: {
          aprendizado: { type: 'string', description: '1 frase curta com o que aprendeu sobre o cliente' },
          contexto: { type: 'string', description: 'situacao em que apareceu', default: '' },
        },
        required: ['aprendizado'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar-script',
      description: 'Cria um script (JS/SQL/Python/bash) pra resolver tarefa deterministica que NAO precisa de LLM (ex.: lookup no banco, calculo, formatacao). Devolve o script pra ser executado depois. Use quando perceber que o problema NAO e criativo, e codigo.',
      parameters: {
        type: 'object',
        properties: {
          linguagem: { type: 'string', enum: ['sql', 'js', 'python', 'bash'], description: 'linguagem do script' },
          objetivo: { type: 'string', description: 'o que o script faz em 1 linha' },
          codigo: { type: 'string', description: 'o codigo completo pronto pra executar' },
          como_executar: { type: 'string', description: 'instrucao curta de como rodar' },
        },
        required: ['linguagem', 'objetivo', 'codigo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delegar-chief',
      description: 'Delega trabalho especialista pra Chief de uma squad-conselheira. Use quando o caso pede entregavel real do dominio dela. Ex.: pedido de copy → squad_slug=copy (Copy Chief vai escolher 1-2 mestres e devolver copy consolidada).',
      parameters: {
        type: 'object',
        properties: {
          squad_slug: { type: 'string', description: 'slug da squad-conselheira (hoje disponivel: copy)' },
          briefing: { type: 'string', description: 'briefing completo: produto, objetivo, publico, tom, prazo, parametros. Inclua resumo do Cerebro do produto se ja consultou.' },
        },
        required: ['squad_slug', 'briefing'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'montar-card-plano',
      description: 'Monta Card de Plano da Missao quando o caso pede entregavel real (copy, pagina, video, plano de lancamento) que vai precisar de Worker(s) especialista(s). NAO use pra responder pergunta simples — so quando ha entregavel concreto a delegar.',
      parameters: {
        type: 'object',
        properties: {
          diagnostico: { type: 'string', description: '2-3 linhas sobre o que entendeu do caso' },
          squad: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agente_slug: { type: 'string', description: 'slug do Worker REAL no banco. Se nao existir, use "agente-a-criar" e detalhe em justificativa.' },
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
              },
              required: ['ordem', 'acao'],
            },
          },
          estimativa_minutos: { type: ['number', 'null'], description: 'NULL se sem historico' },
          estimativa_custo_usd: { type: ['number', 'null'], description: 'NULL se sem historico' },
          pergunta_aprovacao: { type: 'string', default: 'Posso seguir, ou quer ajustar?' },
        },
        required: ['diagnostico', 'squad', 'proximos_passos'],
      },
    },
  },
];

// =====================================================
// Resolve cerebro_slug → cerebros.id (UUID).
// Schema: pinguim.produtos.id ←→ pinguim.cerebros.produto_id ←→ cerebros.id ←→ cerebro_fontes.cerebro_id
// O Edge Function buscar-cerebro espera o ID da tabela `cerebros`, NÃO de `produtos`.
// =====================================================
async function resolverCerebroId(slug: string): Promise<string | null> {
  const { data: produto } = await sb()
    .from('produtos')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!produto?.id) return null;
  const { data: cerebro } = await sb()
    .from('cerebros')
    .select('id')
    .eq('produto_id', produto.id)
    .maybeSingle();
  return cerebro?.id || null;
}

async function resolverCloneId(slug: string): Promise<string | null> {
  const slugNormalizado = slug.startsWith('clone-') ? slug : `clone-${slug.replace(/^clone-/, '')}`;
  const { data: produto } = await sb()
    .from('produtos')
    .select('id')
    .eq('slug', slugNormalizado)
    .eq('categoria', 'clone')
    .maybeSingle();
  if (!produto?.id) return null;
  const { data: cerebro } = await sb()
    .from('cerebros')
    .select('id')
    .eq('produto_id', produto.id)
    .maybeSingle();
  return cerebro?.id || null;
}

// =====================================================
// Executor de tools
// =====================================================
async function executarTool(
  toolName: string,
  toolArgs: any,
  agenteId: string,
  ctx: {
    tenant_id: string;
    cliente_id: string;
    solicitante_id: string | null;
    squadsConsultadas?: Array<{
      squad: string;
      chief: string;
      mestres: string[];
      reflection_rounds?: number;
      verifier_problemas?: string[];
    }>;
  },
): Promise<string> {
  const tInicio = Date.now();
  let resultado: any;
  let sucesso = true;

  try {
    switch (toolName) {
      case 'buscar-cerebro': {
        const cerebroId = await resolverCerebroId(toolArgs.cerebro_slug);
        if (!cerebroId) {
          resultado = { error: `Cerebro '${toolArgs.cerebro_slug}' nao encontrado no banco. Slugs validos: elo, proalt, desafio-de-conte-do-lo-fi, lyra, tuarus, orion, mentoria-express, low-ticket-digital, spin-selling, challenger-sale, meddic, sandler-selling, tactical-empathy-voss` };
          break;
        }
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/buscar-cerebro`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cerebro_id: cerebroId,
            query: toolArgs.query,
            top_k: toolArgs.top_k || 6,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `buscar-cerebro ${resp.status}`);
        resultado = {
          cerebro_slug: toolArgs.cerebro_slug,
          total: data.total,
          chunks: (data.resultados || []).map((r: any) => ({
            titulo: r.titulo,
            conteudo: r.conteudo?.slice(0, 600),
            similarity: r.similarity,
          })),
        };
        break;
      }
      case 'buscar-clone': {
        const cloneId = await resolverCloneId(toolArgs.clone_slug);
        if (!cloneId) {
          resultado = { error: `Clone '${toolArgs.clone_slug}' nao encontrado. Use slug com prefixo 'clone-' (ex.: clone-alex-hormozi).` };
          break;
        }
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/buscar-cerebro`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cerebro_id: cloneId,
            query: toolArgs.query,
            top_k: toolArgs.top_k || 4,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `buscar-clone ${resp.status}`);
        resultado = {
          clone_slug: toolArgs.clone_slug,
          total: data.total,
          chunks: (data.resultados || []).map((r: any) => ({
            titulo: r.titulo,
            voz: r.conteudo?.slice(0, 500),
            similarity: r.similarity,
          })),
        };
        break;
      }
      case 'atualizar-perfil-cliente': {
        // Append em pinguim.aprendizados_cliente_agente (Tier 2)
        const linha = `- ${toolArgs.aprendizado}${toolArgs.contexto ? ` (${toolArgs.contexto})` : ''} [${new Date().toISOString().slice(0, 10)}]`;
        const { data: existente } = await sb()
          .from('aprendizados_cliente_agente')
          .select('conteudo_md')
          .eq('agente_id', agenteId)
          .eq('cliente_id', ctx.cliente_id)
          .maybeSingle();
        const novoConteudo = existente?.conteudo_md
          ? `${existente.conteudo_md}\n${linha}`
          : `# Perfil do cliente — atualizado pelo Pinguim\n\n${linha}`;
        const { error } = await sb()
          .from('aprendizados_cliente_agente')
          .upsert({
            agente_id: agenteId,
            cliente_id: ctx.cliente_id,
            conteudo_md: novoConteudo,
          }, { onConflict: 'agente_id,cliente_id' });
        if (error) throw error;
        resultado = { ok: true, registrado: toolArgs.aprendizado };
        break;
      }
      case 'criar-script': {
        // Devolve o script estruturado. Execução real fica fora (segurança).
        resultado = {
          ok: true,
          linguagem: toolArgs.linguagem,
          objetivo: toolArgs.objetivo,
          codigo: toolArgs.codigo,
          como_executar: toolArgs.como_executar || 'Executar manualmente apos revisao humana.',
          aviso: 'Script criado mas NAO executado. Cliente revisa antes de rodar.',
        };
        break;
      }
      case 'delegar-chief': {
        // Delega pra Chief de squad-conselheira INLINE (mesmo processo, sem HTTP).
        // Modelo OpenClaw: tudo roda em 1 processo.
        const CHIEFS_POR_SQUAD: Record<string, string> = {
          'copy': 'copy-chief',
          'storytelling': 'story-chief',
          'advisory-board': 'board-chair',
          'design': 'design-chief',
          // Próximas: traffic-masters → traffic-masters-chief, data → data-chief, etc.
        };
        const chiefSlug = CHIEFS_POR_SQUAD[toolArgs.squad_slug];
        if (!chiefSlug) {
          resultado = {
            error: `Squad '${toolArgs.squad_slug}' ainda nao tem Chief implementado. Hoje disponiveis: ${Object.keys(CHIEFS_POR_SQUAD).join(', ')}`,
          };
          break;
        }
        const sub = await executarComEPP({
          agente_slug: chiefSlug,
          briefing: toolArgs.briefing,
          tenant_id: ctx.tenant_id,
          cliente_id: ctx.cliente_id,
          solicitante_id: ctx.solicitante_id,
        });
        // Acumula visibilidade pro Atendente devolver pro frontend
        if (ctx.squadsConsultadas) {
          ctx.squadsConsultadas.push({
            squad: toolArgs.squad_slug,
            chief: chiefSlug,
            mestres: (sub.mestres_invocados || []).map((m: any) => m.slug),
            reflection_rounds: sub.reflection_rounds || 0,
            verifier_problemas: sub.verifier_problemas || [],
          });
        }
        resultado = {
          ok: sub.ok,
          chief: chiefSlug,
          squad: toolArgs.squad_slug,
          conteudo_md: sub.conteudo_md,
          conteudo_estruturado: sub.conteudo_estruturado,
          mestres_invocados: sub.mestres_invocados,
          reflection_rounds: sub.reflection_rounds || 0,
          verifier_problemas: sub.verifier_problemas || [],
          uso: sub.uso,
        };
        break;
      }
      case 'montar-card-plano': {
        // Terminal — pro loop saber que é hora de parar
        resultado = { status: 'card_capturado', card: toolArgs };
        break;
      }
      default:
        resultado = { error: `Tool '${toolName}' nao implementada` };
        sucesso = false;
    }
  } catch (e: any) {
    resultado = { error: e.message };
    sucesso = false;
  }

  await logarTool({
    agenteId,
    toolNome: toolName,
    inputResumo: toolArgs,
    outputResumo: JSON.stringify(resultado).slice(0, 500),
    sucesso,
    erro: sucesso ? undefined : JSON.stringify(resultado),
    duracaoMs: Date.now() - tInicio,
  });

  return JSON.stringify(resultado);
}

// =====================================================
// System prompt do Pinguim (curto, agressivo no uso de tools)
// =====================================================
function montarSystemPromptPinguim(args: {
  produtosDetectados: ProdutoDetectado[];
  perfilCliente: string | null;
  aprendizados: string;
}): string {
  const { produtosDetectados, perfilCliente, aprendizados } = args;

  const partes: string[] = [];

  partes.push(
    `Você é o **Pinguim 🐧** — atendente único do Pinguim OS.\n\n` +
    `## Como você opera (regra dura)\n` +
    `1. **Saudação ou pergunta solta = resposta CURTA.** "oi", "boa tarde", "tudo bem?" → resposta de 1 linha, calorosa, sem encher de prompt. NÃO chame nenhuma tool pra saudação. NÃO empurre lista de produtos a cada "oi". Conversa natural primeiro, contexto depois.\n` +
    `2. **Antes de perguntar, consulte.** Se reconhece um produto (Elo, Lo-fi, ProAlt, Lira, Taurus, Orion) ou metodologia, use \`buscar-cerebro\` IMEDIATAMENTE. Não pergunte "qual o produto?" se o cliente já disse. Se o Cérebro retornar pouco ou nada útil, NÃO peça mais info — siga com o briefing do cliente como fonte primária e marque "Cérebro ainda em construção" no output.\n` +
    `3. **Use Clones como conselheiros.** Em copy/oferta cite Hormozi, Schwartz, Halbert. Em estratégia cite Dalio, Munger, Naval. Use \`buscar-clone\` pra trazer voz real.\n` +
    `4. **Nem tudo é LLM.** Se a tarefa é determinística (lookup, cálculo, formatação, query SQL), use \`criar-script\` em vez de gerar texto a cada vez.\n` +
    `4.5. **APÓS \`delegar-chief\`:** o Chief devolve um \`conteudo_md\` estruturado com a entrega completa. Sua resposta DEVE incluir esse \`conteudo_md\` INTEGRALMENTE, sem resumir, sem cortar, sem reescrever. Você só pode adicionar 1-2 linhas curtas antes ou depois (saudação ou pergunta de refinamento). NUNCA condense o output do Chief — quem pediu quer ver o entregável completo.\n` +
    `5. **REGRA CRÍTICA — quando delegar para uma squad-conselheira:**\n` +
    `   Você NUNCA escreve copy, narrativa, conselho estratégico ou direção visual sozinho. SEMPRE delega via \`delegar-chief\`. Mapeamento por NATUREZA do entregável (use a palavra-chave dominante do pedido):\n` +
    `   - **Designer / identidade visual / logo / paleta / brand / layout / direção visual / criativo / arte / mockup / wireframe** → \`delegar-chief(design, briefing)\` (Neumeier, Frost, Do, Draplin).\n` +
    `   - **Copy / VSL / anúncio / texto / headline / página de venda (texto) / e-mail / script / oferta** → \`delegar-chief(copy, briefing)\` (Hormozi, Schwartz, Halbert, Bencivenga).\n` +
    `   - **História / narrativa / gancho / jornada / pitch / manifesto / storytime / abertura** → \`delegar-chief(storytelling, briefing)\` (Campbell, Miller, Klaff, Snyder).\n` +
    `   - **Conselho estratégico / dilema / decisão / divergência entre sócios / propósito / aposta grande / evitar erro** → \`delegar-chief(advisory-board, briefing)\` (Dalio, Munger, Naval, Thiel).\n` +
    `   Se houver mais de uma palavra-chave (ex.: "designer pra página de venda"), priorize a primeira/principal — "designer" → design. Cliente refina depois se quiser também copy.\n` +
    `   Fluxo: (a) se houver produto reconhecido, \`buscar-cerebro\` primeiro; (b) **OBRIGATORIAMENTE** \`delegar-chief\` da squad certa, montando briefing rico com TUDO que o cliente disse + contexto do Cérebro.\n` +
    `   ⚠ **PROIBIDO PARAR PRA PERGUNTAR ANTES DE DELEGAR.** Mesmo se o briefing parece curto ou ambíguo, mesmo se Cérebro retornou pouco útil, mesmo se você acha que falta info — DELEGUE com o que tem. O Chief sabe lidar com briefing curto. Pergunte refinamento DEPOIS de entregar 1ª versão, nunca antes. SÓ responda direto sem delegar se for pergunta factual sobre o sistema (ex.: "quem é você?", "quantos agentes têm?").\n` +
    `6. **Aprendeu padrão do cliente? Registre.** Use \`atualizar-perfil-cliente\` quando notar preferência (ex.: "André prefere copy direta sem floreio").\n` +
    `7. **Sem alucinação.** Se faltar Worker real pra um papel no Card, marque \`agente_slug: "agente-a-criar"\`. Sem inventar slug fictício.\n` +
    `8. **Sem estimativa inventada.** Sem histórico de execução, passe \`null\` em tempo/custo.\n` +
    `9. **Tom:** direto sem ser seco. Frases curtas. Verbos no presente. Lembre do contexto da conversa toda — não comece do zero a cada turno.\n`
  );

  if (produtosDetectados.length > 0) {
    partes.push(
      `\n## ⚡ PRODUTO DETECTADO NA MENSAGEM\n` +
      `O roteador interno detectou os seguintes Cérebros relevantes:\n` +
      produtosDetectados.map(p => `- **${p.cerebro_slug}** (confiança ${(p.confianca * 100).toFixed(0)}%)`).join('\n') +
      `\n\n**AÇÃO OBRIGATÓRIA:** chame \`buscar-cerebro\` no Cérebro com maior confiança como SUA PRIMEIRA TOOL. Não responda sem consultar.\n`
    );
  }

  if (aprendizados && aprendizados.trim()) {
    partes.push(`\n## Memória geral do Pinguim (Tier 1)\n${aprendizados}`);
  }

  if (perfilCliente && perfilCliente.trim()) {
    partes.push(`\n## Memória sobre este cliente (Tier 2)\n${perfilCliente}`);
  }

  return partes.join('\n');
}

// =====================================================
// Handler principal
// =====================================================
const MAX_TOOL_ROUNDS = 4;

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
    // 1. Carrega Pinguim do banco (1 row, leve)
    const pinguim = await carregarAgente('pinguim');

    // 2. Caso ID
    const casoId = casoIdInput || crypto.randomUUID();

    // 3. Histórico ANTES de persistir a nova mensagem.
    //    Se persistir antes, o roteador vê historicoLen=1 sempre e nunca cai
    //    em "saudacao" → "oi" passa pro LLM. Bug visto em produção 2026-05-06.
    const historico = await carregarHistorico(tenant_id, cliente_id, casoId, 20);

    // 4. Persiste mensagem do humano (depois de ler o histórico)
    await sb().from('conversas').insert({
      tenant_id, cliente_id, agente_id: pinguim.id, caso_id: casoId,
      papel: 'humano', conteudo: mensagem,
    });

    // =====================================================
    // 4. Detector semântico de produto (script — determinístico de verdade)
    //    Conversa natural sempre vai pro LLM. Só detecção de palavra-chave
    //    de produto é script (resolve "Lo-fi → consulta automática Cérebro").
    // =====================================================
    const produtosDetectados = detectarProduto(mensagem);

    // 6. Memória Tier 1 + Tier 2
    const { aprendizados, perfilSolicitante } = await carregarMemoriaIndividual(
      pinguim.id, cliente_id,
    );

    // 7. System prompt + messages
    const systemPrompt = montarSystemPromptPinguim({
      produtosDetectados,
      perfilCliente: perfilSolicitante,
      aprendizados,
    });

    const llmMessages: any[] = historico.map((h) => ({
      role: h.papel === 'humano' ? 'user' : 'assistant',
      content: h.conteudo,
    }));
    llmMessages.push({ role: 'user', content: mensagem });

    // =====================================================
    // 8. Escolha do modelo (heurística simples sem listar palavra-chave)
    //    - Mensagem curta + sem produto detectado + cedo na conversa → mini
    //    - Resto → gpt-4o (raciocínio + tools)
    //    - Quando chave Anthropic estiver no cofre, troca pra Sonnet 4.6
    // =====================================================
    const palavras = mensagem.trim().split(/\s+/).filter(Boolean).length;
    const usarMini = palavras <= 8
      && produtosDetectados.length === 0
      && historico.length <= 4;
    const modeloEscolhido = usarMini
      ? (pinguim.modelo_fallback || 'openai:gpt-4o-mini')
      : pinguim.modelo;

    // =====================================================
    // 9. Loop LLM com tools
    // =====================================================
    let totalTokensIn = 0, totalTokensOut = 0, totalTokensCached = 0;
    let totalLatenciaMs = 0;
    let toolsExecutadas: string[] = [];
    let planoCard: any = null;
    let scripts: any[] = [];
    let squadsConsultadas: Array<{
      squad: string;
      chief: string;
      mestres: string[];
      reflection_rounds?: number;
      verifier_problemas?: string[];
    }> = [];
    let respostaTexto = '';
    let modeloUsado = '';
    let rounds = 0;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      rounds = round + 1;
      const llmResp = await chamarLLM(
        {
          modelo: modeloEscolhido,
          systemPrompt,
          messages: llmMessages,
          tools: TOOLS,
          temperatura: pinguim.temperatura ?? 0.4,
          maxTokens: usarMini ? 512 : 2048,
        },
        'atendente-pinguim',
      );

      totalTokensIn += llmResp.tokensIn;
      totalTokensOut += llmResp.tokensOut;
      totalTokensCached += llmResp.tokensCached;
      totalLatenciaMs += llmResp.latenciaMs;
      modeloUsado = llmResp.modeloUsado;

      // Sem tool calls → resposta final
      if (!llmResp.toolCalls || llmResp.toolCalls.length === 0) {
        respostaTexto = llmResp.content;
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

      let temPlano = false;
      for (const tc of llmResp.toolCalls) {
        if (tc.name === 'montar-card-plano') {
          planoCard = tc.arguments;
          temPlano = true;
        }
        if (tc.name === 'criar-script') {
          scripts.push(tc.arguments);
        }
      }

      for (const tc of llmResp.toolCalls) {
        const resultado = await executarTool(tc.name, tc.arguments, pinguim.id, {
          tenant_id, cliente_id, solicitante_id: solicitante_id || null,
          squadsConsultadas,
        });
        toolsExecutadas.push(tc.name);
        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultado,
        });
      }

      if (temPlano) {
        respostaTexto = llmResp.content || `Plano da missão pronto. ${planoCard?.pergunta_aprovacao || 'Posso seguir?'}`;
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        respostaTexto = llmResp.content || '[Limite de rounds]';
      }
    }

    // 9. Loga execução + custo
    const custoUSD = calcularCustoUSD(modeloUsado, totalTokensIn, totalTokensOut, totalTokensCached);

    await logarExecucao({
      agenteId: pinguim.id,
      input: { tenant_id, cliente_id, solicitante_id, caso_id: casoId, mensagem },
      output: { content: respostaTexto, plano_card: planoCard, scripts, tools_executadas: toolsExecutadas },
      contextoUsado: {
        produtos_detectados: produtosDetectados.map(p => p.cerebro_slug),
        historico_turnos: historico.length,
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

    await logarCustoFinOps({
      agenteSlug: 'pinguim',
      modelo: modeloUsado,
      custoUSD,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
    });

    if (planoCard && !respostaTexto) {
      respostaTexto = `Plano pronto. ${planoCard.pergunta_aprovacao || 'Posso seguir?'}`;
    }

    // 10. Persiste resposta
    const artefatos: any = {};
    if (planoCard) artefatos.card_plano_missao = planoCard;
    if (scripts.length > 0) artefatos.scripts = scripts;
    if (squadsConsultadas.length > 0) artefatos.squads_consultadas = squadsConsultadas;
    if (produtosDetectados.length > 0) artefatos.produtos_detectados = produtosDetectados;

    await sb().from('conversas').insert({
      tenant_id, cliente_id, agente_id: pinguim.id, caso_id: casoId,
      papel: 'chief', conteudo: respostaTexto,
      artefatos: Object.keys(artefatos).length > 0 ? artefatos : null,
    });

    return jsonResp({
      ok: true,
      caso_id: casoId,
      resposta: respostaTexto,
      plano_card: planoCard,
      scripts,
      tools_executadas: toolsExecutadas,
      produtos_detectados: produtosDetectados,
      squads_consultadas: squadsConsultadas,
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
    console.error('[atendente-pinguim] erro:', e.message, e.stack);
    return jsonResp({
      error: 'Erro ao atender',
      detalhe: e.message,
      latencia_ms: Date.now() - tInicio,
    }, 500);
  }
});
