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
    .select('slug, nome, categoria, produto_inferido, dominio_universal, quando_acionar')
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
- Se a pergunta cita o produto NOMINALMENTE (ex: "do Lyra", "no Elo", "do ProAlt"), é PRODUTO (mesmo se a frase é longa)
- Se a pergunta pergunta "QUAL produto/programa tem X?" (cross-produto), devolva "nenhum"
- Se a pergunta é sobre uma PESSOA (o que comprou, tem acesso, viu aulas) mesmo citando o produto, ainda devolva o produto — quem decide é o Hop 2A

EXEMPLOS:
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

async function hop2a_funcaoNoProduto(query: string, produto: string, agentes: AgenteCatalogo[]) {
  const opcoes = agentes.map(a => `- ${a.slug}: ${a.quando_acionar}`).join('\n');
  const sys = `Você escolhe qual agente do produto "${produto}" atende a pergunta.

Agentes disponíveis:
${opcoes}

Regras:
- Escolha o agente cujo "quando_acionar" mais combina com a intenção REAL da pergunta
- Considere sinônimos, gírias, typos — entenda intenção, não palavra exata
- Se a pergunta é sobre PESSOA (o que comprou, tem acesso, viu aulas, está ativo, engajada) mesmo mencionando o produto, devolva "consultor-geral"
- Se a pergunta é "dúvida sobre X" ou "questionamento sobre X" no contexto do produto, é objeção → quebrador-objecao-PRODUTO
- Se o produto NÃO TEM um agente específico pra função pedida (ex: prova social só existe pro Elo; outros produtos não têm), tente o substituto mais próximo (ex: buscador-cerebro-PRODUTO que busca depoimentos). Se nem isso existir, devolva "sem_agente"
- "qual o módulo de X do Y?" / "tem aula sobre X no Y?" → buscador-cerebro-Y (consultar conteúdo do produto)

EXEMPLOS:
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
- "ROAS caiu" / "meu ROAS do Meta Ads caiu" → { "slug": "pedro-sobral" }
- "quem tá com ROAS melhor essa semana?" → { "slug": "pedro-sobral" }
- "fadiga de criativo" / "qual criativo tá cansando" → { "slug": "felipe-mello" }
- "análise de funil de Meta Ads" / "audiência + lead magnet" → { "slug": "molly-pittman" }
- "audiência incremental, scaling multi-marca" → { "slug": "depesh-mandalia" }
- "olhar estratégico de conta - fundo vs topo de funil" → { "slug": "tatiana-pizzato" }
- "análise quantitativa ROAS por conta" → { "slug": "andre-vaz" }
- "gastando muito no face e nao vende" (vago, sem métrica) → { "slug": "sem_agente" }
- "como melhoro minha conversão?" (vago) → { "slug": "sem_agente" }
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
