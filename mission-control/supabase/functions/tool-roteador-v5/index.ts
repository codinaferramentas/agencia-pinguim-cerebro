// ============================================================
// Edge Function: tool-roteador-v5
// ============================================================
// Roteador hierárquico em 3 hops, todos via LLM (gpt-4o-mini).
//
// Hop 1: tem produto na pergunta? Se sim, qual?
//        candidatos: ['elo', 'proalt', 'lyra', 'tuarus', 'lo-fi',
//                     'mentoria-express', 'sirius', 'gmail', 'instagram', 'nenhum']
//
// Hop 2A (se produto detectado): qual função desse produto?
//        candidatos limitados aos agentes liberados desse produto
//
// Hop 2B (se nenhum produto): qual domínio universal?
//        candidatos: ['pessoa','copy','design','storytelling','conselho',
//                     'dado','trafego','operacao','tecnico','instagram','nenhum']
//
// Hop 3 (se domínio detectado): qual agente específico dentro do domínio?
//        candidatos limitados aos agentes liberados desse domínio
//
// Body: { query, debug? }
// Resp: { ok, agente_escolhido, sem_agente_apto, hops, custo_tokens, latencia_ms, breakdown? }
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface AgenteCatalogo {
  slug: string;
  nome: string;
  categoria: string;
  produto_inferido: string | null;
  dominio_universal: string | null;
  funcao_inferida: string | null;
  quando_acionar: string;
}

let catalogoCache: { dados: AgenteCatalogo[]; expira: number } | null = null;
const CACHE_TTL = 60 * 1000; // 1 min

async function carregarCatalogo(): Promise<AgenteCatalogo[]> {
  const agora = Date.now();
  if (catalogoCache && catalogoCache.expira > agora) return catalogoCache.dados;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
  const { data, error } = await sb.from('agentes')
    .select('slug, nome, categoria, produto_inferido, dominio_universal, funcao_inferida, quando_acionar')
    .eq('status_publicacao', 'liberado')
    .not('quando_acionar', 'is', null);
  if (error) throw new Error('catalogo: ' + error.message);
  catalogoCache = { dados: data || [], expira: agora + CACHE_TTL };
  return data || [];
}

async function chamarLLM(systemPrompt: string, userPrompt: string): Promise<{ resp: string; tokens_in: number; tokens_out: number }> {
  const openaiKey = await getChave('OPENAI_API_KEY', 'tool-roteador-v5');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return {
    resp: data.choices[0].message.content,
    tokens_in: data.usage.prompt_tokens,
    tokens_out: data.usage.completion_tokens,
  };
}

const PRODUTOS = ['elo', 'proalt', 'lyra', 'tuarus', 'lo-fi', 'mentoria-express', 'sirius', 'gmail', 'instagram'];
const DOMINIOS = ['pessoa', 'copy', 'design', 'storytelling', 'conselho', 'dado', 'trafego', 'operacao', 'tecnico'];

async function hop1_detectarProduto(query: string) {
  const sys = `Você classifica se uma pergunta menciona um produto específico do Pinguim.

Produtos: ${PRODUTOS.join(', ')}

Regras críticas:
- "gmail" inclui menções a "email", "inbox", "caixa de entrada", "minha caixa", "triar email"
- "instagram" inclui "insta", "perfil ig", "raio-x do perfil"
- "tuarus" inclui "taurus" (variante)
- "lo-fi" inclui "lofi", "low-fi", "desafio lo-fi", "desafio low-fi"
- ⚠️ **REGRA CRÍTICA — DETECÇÃO DE PRODUTO É AGRESSIVA:** se o nome do produto aparece NA FRASE (qualquer posição: início, meio, fim), é PRODUTO. Não importa onde nem o tamanho da frase.
  - "preciso escrever copy pra página de venda do Elo" → "Elo" tá lá no fim → produto=elo
  - "email de nutrição pra lead Elo" → "Elo" tá lá no fim → produto=elo
  - "headlines novos pra rodar nessa semana do Elo" → produto=elo
- Se a pergunta pergunta "QUAL produto/programa tem X?" (cross-produto), devolva "nenhum"
- Se a pergunta é sobre uma PESSOA (o que comprou, tem acesso, viu aulas) mesmo citando o produto, ainda devolva o produto — quem decide é o Hop 2A
- Se há AMBIGUIDADE (email pode ser gmail ou copy de email-de-vendas), priorize o produto que aparece nominalmente na frase ANTES de aplicar regra de domínio

EXEMPLOS:
- "preciso escrever copy pra página de venda do Elo" → { "produto": "elo" } (CITA Elo nominalmente — produto sempre ganha)
- "email de nutrição pra lead Elo" → { "produto": "elo" } (CITA Elo nominalmente — não confunde com gmail)
- "headlines pra ads do Elo essa semana" → { "produto": "elo" }
- "VSL nova do Elo, 10 minutos" → { "produto": "elo" }
- "qual o módulo de prova social do Lyra?" → { "produto": "lyra" } (cita Lyra nominalmente)
- "qual o método ensinado no lyra?" → { "produto": "lyra" } (cita lyra no fim da frase)
- "ela tem dúvida sobre o Elo" → { "produto": "elo" } (cita Elo)
- "tem prova social do ProAlt?" → { "produto": "proalt" }
- "qual programa tem aula de copy?" → { "produto": "nenhum" } (cross-produto, não cita um)
- "em qual dos nossos produtos tem mecanismo de oferta?" → { "produto": "nenhum" } (cross-produto)
- "o José comprou alguma coisa?" → { "produto": "nenhum" } (sem produto, é sobre pessoa)
- "saúde geral da minha caixa de email" → { "produto": "gmail" } (cita email/caixa)
- "raio-X do perfil @x" → { "produto": "instagram" }
- "preciso de um conselho" → { "produto": "nenhum" }
- "escreve um email no método de Ben Settle" → { "produto": "nenhum" } (a palavra "email" aqui é tipo de copy, não Gmail. Ben Settle é mestre de copy.)
- "manda um email no estilo Halbert" → { "produto": "nenhum" } (idem - é copy)
- "redige email de vendas no método Hormozi" → { "produto": "nenhum" } (idem)
- IMPORTANTE: "email" só vira "gmail" quando é sobre INBOX/CAIXA do usuário (triar, organizar, saúde da caixa). "Email no método X" ou "email de vendas" é COPY, não gmail.

Responda em JSON: { "produto": "<elo|proalt|lyra|tuarus|lo-fi|mentoria-express|sirius|gmail|instagram|nenhum>" }`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(sys, `Pergunta: "${query}"`);
  try {
    const j = JSON.parse(resp);
    return { produto: j.produto, tokens_in, tokens_out };
  } catch {
    return { produto: 'nenhum', tokens_in, tokens_out };
  }
}

// v0.36.1 — Mapa de função → categoria-funil
// Resolve o "lost in the middle" quando produto tem 40+ agentes:
// agrupa a lista do Hop 2A por categoria do funil pra LLM navegar melhor.
const FUNCAO_PARA_CATEGORIA: Record<string, string> = {
  // TRÁFEGO/PRÉ-VENDA
  'copy-anuncio-meta': '📱 TRÁFEGO/PRÉ-VENDA',
  'copy-anuncio-google': '📱 TRÁFEGO/PRÉ-VENDA',
  'criativo-reels': '📱 TRÁFEGO/PRÉ-VENDA',
  'post-organico': '📱 TRÁFEGO/PRÉ-VENDA',
  'sequencia-aquecimento': '📱 TRÁFEGO/PRÉ-VENDA',
  'headlines-anuncio': '📱 TRÁFEGO/PRÉ-VENDA',
  'ganchos-stories': '📱 TRÁFEGO/PRÉ-VENDA',
  'roteiro-vsl': '📱 TRÁFEGO/PRÉ-VENDA',
  'copy-pagina-venda': '📱 TRÁFEGO/PRÉ-VENDA',
  'post-linkedin': '📱 TRÁFEGO/PRÉ-VENDA',
  // VENDAS/COMERCIAL
  'briefing-cliente': '💼 VENDAS/COMERCIAL',
  'quebrador-objecao': '💼 VENDAS/COMERCIAL',
  'quebrador-objecao-preco': '💼 VENDAS/COMERCIAL',
  'prova-social': '💼 VENDAS/COMERCIAL',
  'roteiro-call-vendas': '💼 VENDAS/COMERCIAL',
  'calculadora-roi': '💼 VENDAS/COMERCIAL',
  'gerador-oferta-bump': '💼 VENDAS/COMERCIAL',
  'responder-dm-instagram': '💼 VENDAS/COMERCIAL',
  'agendador-call': '💼 VENDAS/COMERCIAL',
  'roteiro-discovery': '💼 VENDAS/COMERCIAL',
  'perfil-ideal-aluna': '💼 VENDAS/COMERCIAL',
  'follow-up-lead-frio': '💼 VENDAS/COMERCIAL',
  // ONBOARDING/CS
  'pos-venda-onboarding': '🎉 ONBOARDING/CS',
  'suporte-aluna': '🎉 ONBOARDING/CS',
  'corretor-tarefa': '🎉 ONBOARDING/CS',
  'motivador-aluna': '🎉 ONBOARDING/CS',
  'checkin-progresso': '🎉 ONBOARDING/CS',
  // RETENÇÃO/CHURN
  'reativador-aluno-sumido': '🔄 RETENÇÃO/CHURN',
  'renovacao': '🔄 RETENÇÃO/CHURN',
  'retencao-reembolso': '🔄 RETENÇÃO/CHURN',
  // LTV/EXPANSÃO
  'upsell-recomendador': '⬆ LTV/EXPANSÃO',
  'indicacao-aluna': '⬆ LTV/EXPANSÃO',
  'affiliate-recruiter': '⬆ LTV/EXPANSÃO',
  // CONTEÚDO/MARKETING
  'storyteller-aluna': '📰 CONTEÚDO/MARKETING',
  'email-vendas': '📰 CONTEÚDO/MARKETING',
  'newsletter': '📰 CONTEÚDO/MARKETING',
  'email-nutricao': '📰 CONTEÚDO/MARKETING',
  'podcast-script': '📰 CONTEÚDO/MARKETING',
  'carta-vendas-direct-mail': '📰 CONTEÚDO/MARKETING',
  // CONTEÚDO/CONHECIMENTO DO PRODUTO
  'buscador-cerebro': '📚 CONHECIMENTO DO PRODUTO',
  // ADMIN/UTILS
  'cadastrar-editar-acesso': '⚙ ADMIN',
  'gerador-faq-vivo': '⚙ ADMIN',
  'garantia-criativa': '⚙ ADMIN',
  'jornada-cliente': '⚙ ADMIN',
};

function agruparAgentesPorCategoria(agentes: AgenteCatalogo[]): string {
  const grupos: Record<string, AgenteCatalogo[]> = {};
  for (const a of agentes) {
    const funcKey = (a as any).funcao_inferida || 'outros';
    const cat = FUNCAO_PARA_CATEGORIA[funcKey] || '🔧 OUTROS';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(a);
  }
  // Ordem fixa das categorias
  const ordem = ['📱 TRÁFEGO/PRÉ-VENDA', '💼 VENDAS/COMERCIAL', '🎉 ONBOARDING/CS', '🔄 RETENÇÃO/CHURN', '⬆ LTV/EXPANSÃO', '📰 CONTEÚDO/MARKETING', '📚 CONHECIMENTO DO PRODUTO', '⚙ ADMIN', '🔧 OUTROS'];
  let texto = '';
  for (const cat of ordem) {
    if (!grupos[cat]) continue;
    texto += `\n=== ${cat} ===\n`;
    for (const a of grupos[cat]) {
      texto += `- ${a.slug}: ${a.quando_acionar}\n`;
    }
  }
  return texto.trim();
}

async function hop2a_funcaoNoProduto(query: string, produto: string, agentes: AgenteCatalogo[]) {
  const opcoes = agruparAgentesPorCategoria(agentes);
  const sys = `Você escolhe qual agente do produto "${produto}" atende a pergunta.

Agentes disponíveis (agrupados por categoria do funil):
${opcoes}

PROCESSO (siga em ordem):
1. **PRIMEIRO** identifique a INTENÇÃO da pergunta e mapeie pra UMA das categorias acima:
   - "anúncio/copy/headline/criativo/reels/post/VSL/aquecimento" → TRÁFEGO/PRÉ-VENDA
   - "objeção/preço/briefing/call/cliente/lead/oferta/prova social/discovery/ROI" → VENDAS/COMERCIAL
   - "onboarding/suporte/aluna nova/correção tarefa/motivação/check-in" → ONBOARDING/CS
   - "reativar/renovação/reembolso/aluna sumida" → RETENÇÃO/CHURN
   - "upsell/indicação/afiliada" → LTV/EXPANSÃO
   - "newsletter/email vendas/email nutrição/LinkedIn/podcast/storyteller/carta vendas" → CONTEÚDO/MARKETING
   - "aula sobre X/módulo/conteúdo/mecanismo/garantia do produto" → CONHECIMENTO DO PRODUTO
   - "cadastrar aluna/editar acesso/FAQ/garantia (criação)/jornada" → ADMIN
2. **DEPOIS** olhe APENAS a categoria identificada e escolha o agente cujo "quando_acionar" mais combina.

Regras adicionais:
- Considere sinônimos, gírias, typos
- Pergunta sobre PESSOA (o que comprou, tem acesso, viu aulas) mesmo citando produto → "consultor-geral"
- "dúvida sobre X" no contexto comercial = objeção → quebrador-objecao-PRODUTO
- Se o produto NÃO TEM agente da função pedida → tente substituto próximo (ex: buscador-cerebro-PRODUTO) ou "sem_agente"
- "qual o módulo de X?" / "tem aula sobre X?" → buscador-cerebro-PRODUTO

EXEMPLOS:
- "email de nutrição pra lead Elo" → categoria CONTEÚDO/MARKETING → { "slug": "email-nutricao-elo" } (NÃO é gmail/inbox, é email-tipo-copy de nutrição)
- "preciso de anúncio do Elo pro Meta" → categoria TRÁFEGO/PRÉ-VENDA → { "slug": "copy-anuncio-meta-elo" }
- "newsletter do Elo essa semana" → categoria CONTEÚDO/MARKETING → { "slug": "newsletter-elo" }
- "preciso de provas pra fechar venda do elo" → { "slug": "prova-social-elo" } (PROVAS pra VENDA = prova social, não objeção)
- "uma menina que teve resultado no elo" → { "slug": "prova-social-elo" } (resultado de aluna = prova social)
- "tem prova social do ProAlt?" (produto=proalt, mas só Elo tem prova-social) → { "slug": "buscador-cerebro-proalt" } (substituto, não inventa)
- "depoimento do Lyra" (produto=lyra) → { "slug": "buscador-cerebro-lyra" } (buscador encontra depoimentos)
- "case de sucesso do tuarus" → { "slug": "buscador-cerebro-tuarus" }
- "ela tem acesso ao Elo?" → { "slug": "consultor-geral" } (pergunta sobre pessoa)
- "ela tem dúvida sobre o Elo" → { "slug": "quebrador-objecao-elo" } (dúvida = objeção)
- "qual o módulo de X no Lyra?" → { "slug": "buscador-cerebro-lyra" }
- "qual o método ensinado no lyra?" → { "slug": "buscador-cerebro-lyra" } (consultar conteúdo do produto)
- "saúde geral da minha caixa de email" (produto=gmail) → { "slug": "triar-email-workspace" } (ferramenta operacional de inbox)
- "quais emails tô deixando passar?" → { "slug": "triar-email-workspace" } (triagem capta isso)
- "raio-X do perfil do insta" (produto=instagram) → { "slug": "analise-perfil-instagram" }

REGRA CRÍTICA — BRIEFING vs CONSULTAR:
- "briefing/ficha/resumo/histórico do cliente ANTES DE LIGAR" → briefing-cliente-PRODUTO (prep pra ligação)
- "ficha 360 da aluna do tuarus" → briefing-cliente-tuarus (briefing pré-call)
- "preciso saber o histórico dessa cliente do elo antes da call" → briefing-cliente-elo (contexto explícito de ligação)
- "abre a ficha completa dessa aluna do tuarus pra mim" → briefing-cliente-tuarus
- "monta o briefing pra eu ligar" → briefing-cliente-PRODUTO
- vs "ela tem acesso?" / "ela já comprou?" / "que produtos ela tem?" → consultor-geral (consulta pura de pessoa)
- DICA: se a pergunta menciona "ligar", "call", "abertura", "roteiro", "antes de ligar" + produto = briefing-cliente-PRODUTO

Responda em JSON: { "slug": "<slug-do-agente-ou-consultor-geral-ou-sem_agente>" }`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(sys, `Pergunta: "${query}"`);
  try {
    const j = JSON.parse(resp);
    return { slug: j.slug, tokens_in, tokens_out };
  } catch {
    return { slug: 'sem_agente', tokens_in, tokens_out };
  }
}

async function hop2b_dominioUniversal(query: string) {
  const sys = `Você classifica em qual DOMÍNIO uma pergunta se encaixa, quando NÃO há produto específico mencionado.

Domínios:
- pessoa: sobre alguém (comprou, tem acesso, viu aulas, engajado, ativo, sumido, ele/ela ainda...)
- copy: escrever copy/anúncio/headline/VSL/oferta/email-de-venda/big-idea
- design: identidade visual, logo, marca, design system, layout
- storytelling: contar história, narrativa, roteiro, beat sheet, Hero's Journey
- conselho: pedir conselho estratégico, decisão difícil, perspectiva de mentor
- dado: análise de planilha/dashboard/print/screenshot/métricas; EDITAR célula também é dado
- trafego: tráfego pago, Meta Ads, ROAS, campanha, criativos, gasto em ads
- operacao: ler/analisar tela ativa do navegador, página visível, "o que tem nessa tela"
- tecnico: cybersegurança, FinOps (cloud cost), legal, tradução, pesquisa científica
- instagram: análise de perfil de Instagram
- nenhum: pergunta vaga demais ou cross-produto sem destino

EXEMPLOS:
- "ela ainda tá ativa?" → { "dominio": "pessoa" } (curta mas é claramente sobre pessoa)
- "consulta o telefone 31999887766" → { "dominio": "pessoa" } (telefone/CPF/email = pessoa)
- "joao@empresa.com já comprou?" → { "dominio": "pessoa" }
- "esse contato 11988887777 é cliente?" → { "dominio": "pessoa" } (número = telefone = pessoa)
- "o que tem nessa tela?" → { "dominio": "operacao" } (analisar tela ativa)
- "le essa pagina ai pra mim" → { "dominio": "operacao" } (ler página)
- "edita célula B5 com valor 100" → { "dominio": "dado" } (editar planilha = dado)
- "qual a soma da coluna B desse Sheets?" → { "dominio": "dado" } (analisar planilha)
- "relatório Hotmart" / "vendas Hotmart" / "receita Hotmart" / "reembolsos Hotmart" / "ranking de produtos" / "top compradores" → { "dominio": "dado" } (RELATÓRIO DE VENDAS = dado)
- "quanto faturei na Hotmart em maio" → { "dominio": "dado" }
- "csv das vendas Hotmart" → { "dominio": "dado" }
- "planilha das vendas de fevereiro" → { "dominio": "dado" }
- "meu ROAS caiu" → { "dominio": "trafego" }
- "quem tá com ROAS melhor essa semana?" → { "dominio": "trafego" } (ROAS/conta/campanha = trafego, mesmo com "quem")
- "qual criativo tá cansando mais?" → { "dominio": "trafego" } (criativo cansando = fadiga em ads)
- "preciso analisar funil de Meta Ads" → { "dominio": "trafego" }
- "preciso de um conselho pra essa parada" → { "dominio": "conselho" }
- "achando caro, virar o jogo" (sem citar produto) → { "dominio": "nenhum" } (objeção mas sem produto destino)
- "qual programa tem aula de tráfego?" → { "dominio": "nenhum" } (cross-produto, sem destino)
- "ajuda ai" → { "dominio": "nenhum" } (vaga demais)
- "como vendo mais?" → { "dominio": "nenhum" } (vaga demais)
- "headline killer" → { "dominio": "copy" }
- "transformação do cliente" → { "dominio": "storytelling" }
- "escreve email no método Ben Settle" → { "dominio": "copy" } (email aqui é tipo de copy)
- "VSL no estilo Benson" → { "dominio": "copy" }

REGRA CHAVE:
- "quem", "qual", "que" + métrica de TRÁFEGO (ROAS/CPA/CPM/criativo/campanha/conta de ads) = trafego
- "quem"/"esse contato"/"esse número" + pessoa real = pessoa
- "email no método X" / "VSL no método Y" = copy (tipo de copy escrito)

Responda em JSON: { "dominio": "<domínio>" }`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(sys, `Pergunta: "${query}"`);
  try {
    const j = JSON.parse(resp);
    return { dominio: j.dominio, tokens_in, tokens_out };
  } catch {
    return { dominio: 'nenhum', tokens_in, tokens_out };
  }
}

async function hop3_agenteNoDominio(query: string, dominio: string, agentes: AgenteCatalogo[]) {
  const opcoes = agentes.map(a => `- ${a.slug}: ${a.quando_acionar}`).join('\n');
  const sys = `Você escolhe qual agente do domínio "${dominio}" atende melhor a pergunta.

Agentes disponíveis:
${opcoes}

Regras:
- Escolha o agente cujo "quando_acionar" combina com a intenção REAL da pergunta
- Se a pergunta cita NOMINALMENTE um mestre/autor (ex: "no estilo Halbert", "como Munger pensaria", "método Schwartz", "Donald Miller", "Hero's Journey de Campbell"), escolha o agente com esse nome
- Se a pergunta é VAGA ou GENÉRICA dentro do domínio (sem mencionar mestre, sem método específico), use o orquestrador "chief" do domínio:
  * domínio copy → copy-chief
  * domínio storytelling → story-chief
  * domínio design → design-chief
  * domínio dado → data-chief
  * domínio conselho → board-chair
- IMPORTANTE: se a pergunta é vaga DEMAIS pra qualquer agente (ex: "ajuda ai", "como vendo mais"), devolva "sem_agente"
- Se citar "ROAS", "CPA", "CBO", "ABO" sem citar mestre, é trafego mas vago → pode escolher o mais específico que cobre (ex: tiago-tessmann pra CBO/ABO, pedro-sobral pra ROAS)
- Se for análise de PLANILHA Sheets sem dizer "editar", é analista-de-planilha. Se diz "editar célula" → editor-de-planilha.
- Pra inbox/email sem dizer "triar": avinash-kaushik (saúde global), wes-kao (temporal), david-spinks (qualitativo), peter-fader (LTV), sean-ellis (oportunidades), nick-mehta (churn). Se for "triar/organizar inbox" → triar-email-workspace.

EXEMPLOS dentro de domínio "copy":
- "headline killer" (vago) → { "slug": "copy-chief" }
- "no estilo Halbert" → { "slug": "gary-halbert" }
- "copy do Hormozi" → { "slug": "alex-hormozi" }

EXEMPLOS dentro de domínio "conselho":
- "preciso de um conselho pra essa parada" (vago) → { "slug": "board-chair" }
- "o que o Munger diria?" → { "slug": "charlie-munger" }

EXEMPLOS dentro de domínio "storytelling":
- "narrar transformação do cliente" (vago) → { "slug": "story-chief" }
- "Hero's Journey" → { "slug": "joseph-campbell" }
- "Save the Cat" → { "slug": "blake-snyder" }
- "StoryBrand" → { "slug": "donald-miller" }

EXEMPLOS dentro de domínio "dado":
- "soma da coluna B desse Sheets" → { "slug": "analista-de-planilha" }
- "analisa esse print" → { "slug": "analista-de-print" } (print = IMAGEM, vai pro analista-de-print, NÃO pinguim-analisador-tela)
- "analisa esse screenshot do dashboard" → { "slug": "analista-de-print" }
- "olha esse dashboard e me fala se tá bom" → { "slug": "analista-de-print" } (dashboard como imagem)
- "edita célula B5" → { "slug": "editor-de-planilha" }
- "saúde geral da minha inbox" → { "slug": "avinash-kaushik" }

REGRA CRÍTICA — analista-hotmart vs consultor de pessoa:
- Pedidos de RELATÓRIO / PLANILHA / CSV / DADOS em MASSA de vendas Hotmart → SEMPRE { "slug": "analista-hotmart" }
- Pedidos de CONSULTA de UM comprador específico (email/nome/CPF) → outro agente (consultor-hotmart ou consultar-pessoa, dominio "pessoa")

EXEMPLOS analista-hotmart (extrai dado, gera planilha):
- "me dá uma planilha das vendas Hotmart de fevereiro" → { "slug": "analista-hotmart" }
- "relatório de receita Hotmart" → { "slug": "analista-hotmart" }
- "quanto faturei na Hotmart em maio" → { "slug": "analista-hotmart" }
- "csv das vendas Hotmart por dia" → { "slug": "analista-hotmart" }
- "top 50 compradores em receita" → { "slug": "analista-hotmart" }
- "ranking de produtos mais vendidos Hotmart" → { "slug": "analista-hotmart" }
- "reembolsos Hotmart da semana" → { "slug": "analista-hotmart" }
- "quanto perdi em reembolso" → { "slug": "analista-hotmart" }
- "vendas Hotmart por forma de pagamento" → { "slug": "analista-hotmart" }
- "qual produto Hotmart faturou mais este ano" → { "slug": "analista-hotmart" }
- "faturamento Hotmart YTD" → { "slug": "analista-hotmart" }

EXEMPLOS dentro de domínio "operacao":
- "o que tem nessa tela?" → { "slug": "pinguim-analisador-tela" } (tela ativa do browser)
- "le essa página" → { "slug": "pinguim-analisador-tela" } (página visível)
- "resume o que tá na tela" → { "slug": "pinguim-analisador-tela" }
- "clona essa página de venda" → { "slug": "clonador-de-pagina-venda" }
- DICA: tela/página = pinguim-analisador-tela (lê DOM). print/screenshot/imagem = analista-de-print (domínio dado).

EXEMPLOS dentro de domínio "operacao":
- "o que tem nessa tela?" → { "slug": "pinguim-analisador-tela" }
- "le essa página" → { "slug": "pinguim-analisador-tela" }

EXEMPLOS dentro de domínio "trafego":
- "CBO ou ABO?" → { "slug": "tiago-tessmann" }
- "ROAS caiu" / "meu ROAS do Meta Ads caiu" → { "slug": "pedro-sobral" } (CONSELHO estratégico)
- "fadiga de criativo" / "qual criativo tá cansando" → { "slug": "felipe-mello" }
- "análise de funil de Meta Ads" / "audiência + lead magnet" → { "slug": "molly-pittman" }
- "audiência incremental, scaling multi-marca" → { "slug": "depesh-mandalia" }
- "olhar estratégico de conta - fundo vs topo de funil" → { "slug": "tatiana-pizzato" }
- "gastando muito no face e nao vende" (vago, sem métrica) → { "slug": "sem_agente" }
- "como melhoro minha conversão?" (vago) → { "slug": "sem_agente" }

REGRA CRÍTICA — analista-meta-ads vs clones de tráfego:
- Pedidos de RELATÓRIO / DADOS / PLANILHA / CSV / EXTRAIR / EXPORTAR Meta Ads → SEMPRE { "slug": "analista-meta-ads" }
- Pedidos de CONSELHO / ESTRATÉGIA / "o que faço?" Meta Ads → vai pros clones (pedro-sobral, etc)

EXEMPLOS analista-meta-ads (extrai dado, gera planilha):
- "me dá um relatório Meta" → { "slug": "analista-meta-ads" }
- "relatório do Meta Ads" → { "slug": "analista-meta-ads" }
- "planilha do gasto Meta" → { "slug": "analista-meta-ads" }
- "csv das campanhas Meta" → { "slug": "analista-meta-ads" }
- "quanto gastei em fevereiro na Meta" → { "slug": "analista-meta-ads" }
- "exporta gasto por placement" → { "slug": "analista-meta-ads" }
- "puxa ROAS por campanha em planilha" → { "slug": "analista-meta-ads" }
- "performance Meta em CSV" → { "slug": "analista-meta-ads" }
- "ranking de criativos por CPA" → { "slug": "analista-meta-ads" } (DADO, não conselho)
- "tabela de impressões por dia" → { "slug": "analista-meta-ads" }
- "quais minhas campanhas ativas Meta?" → { "slug": "analista-meta-ads" }

EXEMPLOS clones (querem CONSELHO):
- "meu ROAS caiu, o que faço?" → { "slug": "pedro-sobral" }
- "como otimizar campanha cansada?" → { "slug": "pedro-sobral" }
- "vale escalar essa campanha?" → { "slug": "pedro-sobral" }

- IMPORTANTE: Nunca devolva "sem_agente" se existir alguém com "quando_acionar" que casa razoavelmente. Só "sem_agente" se a pergunta for genuinamente vaga (sem métrica específica, sem mestre citado, sem contexto).

Responda em JSON: { "slug": "<slug-do-agente-ou-sem_agente>" }`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(sys, `Pergunta: "${query}"`);
  try {
    const j = JSON.parse(resp);
    return { slug: j.slug, tokens_in, tokens_out };
  } catch {
    return { slug: 'sem_agente', tokens_in, tokens_out };
  }
}

async function rotear(body: any) {
  const query = String(body.query || '').trim();
  if (!query) return jsonRespTool({ ok: false, erro: 'query obrigatório' }, 400);
  const debug = !!body.debug;

  const t0 = Date.now();
  const catalogo = await carregarCatalogo();
  let totalIn = 0, totalOut = 0;
  const hops: any[] = [];

  // HOP 1 — detectar produto
  const h1 = await hop1_detectarProduto(query);
  totalIn += h1.tokens_in; totalOut += h1.tokens_out;
  hops.push({ hop: 1, decisao: h1.produto, tokens: { in: h1.tokens_in, out: h1.tokens_out } });

  let agenteEscolhido: string | null = null;
  let semAgente = false;

  if (h1.produto && h1.produto !== 'nenhum' && PRODUTOS.includes(h1.produto)) {
    // HOP 2A
    const agentes = catalogo.filter(a => a.produto_inferido === h1.produto);
    // Adiciona consultor-geral como opção (pra capturar pergunta de pessoa com menção a produto)
    const cg = catalogo.find(a => a.slug === 'consultor-geral');
    if (cg) agentes.push(cg);
    const h2a = await hop2a_funcaoNoProduto(query, h1.produto, agentes);
    totalIn += h2a.tokens_in; totalOut += h2a.tokens_out;
    hops.push({ hop: '2A', decisao: h2a.slug, candidatos: agentes.length, tokens: { in: h2a.tokens_in, out: h2a.tokens_out } });
    if (h2a.slug === 'sem_agente') semAgente = true;
    else agenteEscolhido = h2a.slug;
  } else {
    // HOP 2B
    const h2b = await hop2b_dominioUniversal(query);
    totalIn += h2b.tokens_in; totalOut += h2b.tokens_out;
    hops.push({ hop: '2B', decisao: h2b.dominio, tokens: { in: h2b.tokens_in, out: h2b.tokens_out } });

    if (h2b.dominio === 'nenhum' || !DOMINIOS.includes(h2b.dominio) && h2b.dominio !== 'instagram') {
      semAgente = true;
    } else {
      // HOP 3
      const agentes = catalogo.filter(a => a.dominio_universal === h2b.dominio);
      if (agentes.length === 0) {
        semAgente = true;
      } else if (agentes.length === 1) {
        // Atalho: só 1 candidato no domínio (ex: pessoa → consultor-geral)
        agenteEscolhido = agentes[0].slug;
        hops.push({ hop: 3, decisao: agenteEscolhido, candidatos: 1, atalho: true });
      } else {
        const h3 = await hop3_agenteNoDominio(query, h2b.dominio, agentes);
        totalIn += h3.tokens_in; totalOut += h3.tokens_out;
        hops.push({ hop: 3, decisao: h3.slug, candidatos: agentes.length, tokens: { in: h3.tokens_in, out: h3.tokens_out } });
        if (h3.slug === 'sem_agente') semAgente = true;
        else agenteEscolhido = h3.slug;
      }
    }
  }

  // Valida: agente escolhido existe no catálogo?
  if (agenteEscolhido && !catalogo.find(a => a.slug === agenteEscolhido)) {
    hops.push({ aviso: `agente "${agenteEscolhido}" não existe no catálogo liberado, marcando sem_agente_apto` });
    agenteEscolhido = null;
    semAgente = true;
  }

  // Custo: gpt-4o-mini $0.15/1M in + $0.60/1M out
  const custoUsd = (totalIn / 1_000_000) * 0.15 + (totalOut / 1_000_000) * 0.60;

  return jsonRespTool({
    ok: true,
    query,
    agente_escolhido: agenteEscolhido,
    sem_agente_apto: semAgente,
    latencia_ms: Date.now() - t0,
    custo: {
      tokens_in: totalIn,
      tokens_out: totalOut,
      usd: custoUsd,
      brl: custoUsd * 5.5,
    },
    hops: debug ? hops : undefined,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ ok: false, erro: 'JSON invalido' }, 400); }

  try {
    return await rotear(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[tool-roteador-v5] erro:', msg);
    return jsonRespTool({ ok: false, erro: msg }, 500);
  }
});
