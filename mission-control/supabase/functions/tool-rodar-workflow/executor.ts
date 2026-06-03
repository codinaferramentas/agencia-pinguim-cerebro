// ============================================================
// Executor do workflow Lo-fi (e futuros)
// ============================================================
// Pipeline:
//   1. Data Hub paralelo (Meta + Hotmart + scrap pagina)
//   2. Camada 2: analistas em paralelo (gpt-5.4-mini)
//   3. Camada 3+4: consolidador + consultor (gpt-5.5, fundidos em 1 LLM)
//   4. Camada 5: executores (Reescritor pagina + Gerador criativo + Order bump + Sequencia)
//      - Gerador criativo CHAMA gerar-variacao-anuncio do Ads Monitor
//   5. Atualiza workflow_rodadas com tudo (sintese + execucoes + custo)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Workflow {
  id: string;
  slug: string;
  config: any;
  modelos: any;
  produto_id: string;
}
interface Inputs {
  periodo_dias: number;
  url_pagina?: string;
  especialistas_escolhidos?: Record<string, string[]>;
}

const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-5.5':       { in: 5,    out: 30 },
  'gpt-5.4':       { in: 2.5,  out: 15 },
  'gpt-5.4-mini':  { in: 0.75, out: 4.5 },
  'gpt-5.4-nano':  { in: 0.20, out: 1.0 },
};
function custoUsd(modelo: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[modelo] || PRICING['gpt-5.4-mini'];
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

// ====================== DATA HUB ======================

async function coletarMetaAds(produtoSlug: string, periodoDias: number, sb: any) {
  // Lê dados do cron Meta Ads já existente — filtra por nome de campanha que contém produto
  // (assumo que ja tem tabela tipo pinguim.meta_ads_diario ou similar)
  // Por enquanto retorna estrutura vazia se nao achar
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - periodoDias);
    const sinceIso = sinceDate.toISOString().slice(0, 10);

    // Tenta tabela genérica de meta_ads
    const r = await fetch(`${SUPABASE_URL}/rest/v1/meta_ads_diario?select=*&data=gte.${sinceIso}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Accept-Profile': 'pinguim' },
    });
    if (r.ok) {
      const dados = await r.json();
      // Filtra por produto (campanha contem slug ou variação)
      const slugVariacoes = ['lo-fi', 'lofi', 'low-fi', 'desafio'];
      const filtrados = dados.filter((d: any) =>
        slugVariacoes.some(v => (d.nome_campanha || d.campanha || '').toLowerCase().includes(v))
      );
      return {
        ok: true,
        periodo: { de: sinceIso, ate: new Date().toISOString().slice(0, 10) },
        total_linhas: filtrados.length,
        dados: filtrados.slice(0, 50), // limita pra nao estourar prompt
      };
    }
  } catch (e) {
    console.warn('[meta-ads] erro:', e?.message);
  }
  return { ok: false, motivo: 'sem_dados_meta_ads', dados: [] };
}

async function coletarCompradoresHotmart(produtoSlug: string, periodoDias: number) {
  // Edge tool-consultar-pessoa existe mas é por pessoa. Aqui quero a lista do periodo.
  // Por simplicidade do V1: retorna placeholder. Cron diario já agrega isso.
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - periodoDias);
    const sinceIso = sinceDate.toISOString().slice(0, 10);

    const r = await fetch(`${SUPABASE_URL}/rest/v1/main_product_id?select=*&data=gte.${sinceIso}&product_id_like=*desafio*`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    // Por hora retorna estrutura vazia se nao achar
    return { ok: true, total: 0, dados: [], aviso: 'V1 sem agregacao Hotmart estruturada — em desenvolvimento' };
  } catch (e) {
    return { ok: false, motivo: 'sem_dados_compradores', dados: [] };
  }
}

async function scrapPaginaVenda(url: string) {
  if (!url) return { ok: false, motivo: 'sem_url' };
  try {
    const apifyToken = await getChave('APIFY_TOKEN', 'tool-rodar-workflow');
    const r = await fetch(`https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${apifyToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url }],
        maxCrawlPages: 1,
        htmlTransformer: 'none',
      }),
    });
    if (!r.ok) return { ok: false, motivo: `apify_${r.status}` };
    const items = await r.json();
    const first = Array.isArray(items) ? items[0] : null;
    return {
      ok: true,
      url,
      titulo: first?.title || '',
      texto: (first?.text || '').slice(0, 8000), // limita prompt
      meta_description: first?.metadata?.description || '',
    };
  } catch (e) {
    return { ok: false, motivo: e?.message || 'erro_scrap' };
  }
}

async function coletarDataHub(workflow: Workflow, inputs: Inputs, sb: any) {
  const slug = 'desafio-de-conte-do-lo-fi'; // V1 hard-coded; futuro: vem do produto_id
  const [metaAds, compradores, pagina] = await Promise.all([
    coletarMetaAds(slug, inputs.periodo_dias, sb),
    coletarCompradoresHotmart(slug, inputs.periodo_dias),
    inputs.url_pagina ? scrapPaginaVenda(inputs.url_pagina) : Promise.resolve({ ok: false, motivo: 'sem_url' }),
  ]);
  return { meta_ads: metaAds, compradores, pagina, periodo_dias: inputs.periodo_dias };
}

// ====================== PERSONA ======================

async function carregarPersona(produtoId: string, sb: any) {
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', produtoId).single();
  if (!cer) return null;
  const { data: persona } = await sb.from('personas')
    .select('*')
    .eq('cerebro_id', cer.id)
    .order('gerado_em', { ascending: false })
    .limit(1)
    .single();
  return persona;
}

function blocoPersonaCompacto(persona: any): string {
  if (!persona) return '';
  const id = persona.identidade || {};
  const vozes = (persona.vozes_cabeca || []).slice(0, 5).map((v: string) => `- "${v}"`).join('\n');
  const dores = (persona.dores_latentes || []).slice(0, 5).map((d: string) => `- ${d}`).join('\n');
  const objecoes = (persona.objecoes_compra || []).slice(0, 4).map((o: string) => `- "${o}"`).join('\n');
  const voc = (persona.vocabulario || []).slice(0, 8).map((v: any) => v.palavra).join(', ');
  return `
## PERSONA DO PRODUTO
**Nome ficticio:** ${id.nome_ficticio || 'N/A'}
**Identidade:** ${id.idade || ''} · ${id.profissao || ''}
**Dor principal:** ${persona.dor_principal || ''}
**Vozes na cabeca:**
${vozes}
**Dores latentes:**
${dores}
**Objecoes:**
${objecoes}
**Vocabulario:** ${voc}
`.trim();
}

// ====================== CHAMADAS LLM ======================

async function chamarLLM(modelo: string, systemPrompt: string, userPrompt: string, useJson = true): Promise<{ resp: string; tokens_in: number; tokens_out: number }> {
  const openaiKey = await getChave('OPENAI_API_KEY', 'tool-rodar-workflow');
  // GPT-5 família: usa max_completion_tokens (substituiu max_tokens)
  // GPT-5 não aceita temperature custom (apenas default=1). Omite o param.
  const ehGpt5 = modelo.startsWith('gpt-5');
  const body: any = {
    model: modelo,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (ehGpt5) {
    // GPT-5 conta "reasoning_tokens" no budget. 1800 não basta — alocamos 4000.
    body.max_completion_tokens = 4000;
    body.reasoning_effort = 'low'; // economiza reasoning (default = medium)
  } else {
    body.max_tokens = 1800;
    body.temperature = 0.4;
  }
  if (useJson) body.response_format = { type: 'json_object' };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content || '';
  if (!content) {
    console.warn(`[chamarLLM] resposta vazia | modelo=${modelo} | finish=${j.choices?.[0]?.finish_reason} | tokens=${JSON.stringify(j.usage)}`);
  }
  return {
    resp: content,
    tokens_in: j.usage.prompt_tokens,
    tokens_out: j.usage.completion_tokens,
  };
}

// ====================== CAMADA 2: ANALISTAS ======================

async function rodarAnalista(area: string, especialistaSlug: string, dataHub: any, persona: any, modelo: string, sb: any): Promise<any> {
  // Busca o clone/agente especialista pra usar voz/método dele
  const { data: agente } = await sb.from('agentes')
    .select('nome, missao, system_prompt')
    .eq('slug', especialistaSlug)
    .single();
  const personaBloco = blocoPersonaCompacto(persona);
  const nome = agente?.nome || especialistaSlug;
  const metodoDele = (agente?.missao || '').slice(0, 300);

  const systemPrompt = `Você é ${nome}, especialista em ${area}.
${metodoDele}

${personaBloco}

Você está analisando dados da campanha do produto Desafio Lo-fi pra ajudar o sócio a aumentar entrada no funil (problema: anúncio gasta mas pouca gente compra ingresso).

Sua análise deve ser ESPECÍFICA pra sua área (${area}), no SEU MÉTODO/VOZ.

Devolva JSON com este schema EXATO:
{
  "achados": [
    {"titulo": "...", "evidencia": "...", "severidade": "alta|media|baixa", "confianca": 0.0}
  ],
  "diagnostico": "1-2 paragrafos no SEU estilo, na voz da persona se aplicar",
  "acoes_sugeridas": [
    {"titulo": "...", "descricao": "...", "prioridade": 1, "impacto_esperado": "..."}
  ]
}`;

  const userPrompt = `Dados disponíveis pra analisar (ÁREA: ${area}):

${JSON.stringify(dataHub, null, 2).slice(0, 6000)}

Analise SOMENTE o que cabe na sua área (${area}). Não opine fora dela.
Devolva JSON estruturado.`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(modelo, systemPrompt, userPrompt, true);
  let parecer: any = { achados: [], diagnostico: resp.slice(0, 500), acoes_sugeridas: [] };
  try { parecer = JSON.parse(resp); } catch (_) {}
  return {
    area,
    especialista: especialistaSlug,
    nome,
    parecer,
    tokens_in,
    tokens_out,
    custo_usd: custoUsd(modelo, tokens_in, tokens_out),
  };
}

async function rodarCamada2(workflow: Workflow, inputs: Inputs, dataHub: any, persona: any, sb: any): Promise<any[]> {
  const escolhidos = inputs.especialistas_escolhidos || {};
  const modelo = workflow.modelos?.analista || 'gpt-5.4-mini';

  // Se nao escolheu, usa defaults
  const areas = workflow.config.areas || [];
  const tarefas: Promise<any>[] = [];
  for (const area of areas) {
    const slugs = (escolhidos[area.slug] && escolhidos[area.slug].length > 0)
      ? escolhidos[area.slug]
      : (area.defaults || []);
    for (const slug of slugs) {
      tarefas.push(rodarAnalista(area.slug, slug, dataHub, persona, modelo, sb));
    }
  }
  return await Promise.all(tarefas);
}

// ====================== CAMADA 3+4: CONSOLIDADOR + CONSULTOR ======================

async function rodarConsultor(workflow: Workflow, pareceres: any[], dataHub: any, persona: any): Promise<any> {
  const modelo = workflow.modelos?.consultor || 'gpt-5.5';
  const personaBloco = blocoPersonaCompacto(persona);

  const systemPrompt = `Você é o **Consultor de Crescimento Estratégico** da Pinguim.
Sua função é CRUZAR os pareceres de N especialistas e devolver:
1. Diagnóstico consolidado (causa raiz)
2. Plano de ação CONECTADO (não isolado por área)
3. Prioridades (top 3 ações de maior impacto)
4. Experimentos sugeridos (hipóteses pra testar)

${personaBloco}

CONTEXTO: o sócio Pinguim tá com problema de baixa conversão no Desafio Lo-fi (front-end pago). Anúncio gasta dinheiro mas pouca gente paga ingresso pra entrar. Quer plano CONECTADO: muda anúncio + página + oferta juntos, não isolado.

Devolva JSON com schema:
{
  "causa_raiz": "1 frase identificando o nó principal",
  "diagnostico_consolidado": "2-3 paragrafos cruzando os achados dos especialistas",
  "convergencias": ["3+ pareceres falando a mesma coisa"],
  "divergencias": ["onde especialistas discordam e por que"],
  "plano_acao_conectado": [
    {
      "titulo": "...",
      "areas_afetadas": ["meta-ads", "pagina"],
      "descricao": "o que mexer junto",
      "ordem_execucao": 1,
      "impacto_esperado_pct": 25
    }
  ],
  "top_3_prioridades": [
    {"acao": "...", "razao": "...", "tempo_estimado_dias": 2}
  ],
  "experimentos_sugeridos": [
    {"hipotese": "...", "teste": "...", "metrica": "...", "duracao_dias": 7}
  ],
  "alertas": ["coisas que voce notou que merecem atencao"]
}`;

  const userPrompt = `Pareceres dos especialistas:

${JSON.stringify(pareceres.map(p => ({ area: p.area, especialista: p.nome, parecer: p.parecer })), null, 2).slice(0, 10000)}

Dados originais (resumo):
${JSON.stringify({
    periodo: dataHub.periodo_dias + ' dias',
    meta_ads_disponivel: !!dataHub.meta_ads?.ok,
    compradores_disponivel: !!dataHub.compradores?.ok,
    pagina_disponivel: !!dataHub.pagina?.ok,
  }, null, 2)}

Cruze tudo. Devolva JSON estruturado conforme o schema.`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(modelo, systemPrompt, userPrompt, true);
  let sintese: any = {};
  try { sintese = JSON.parse(resp); } catch (_) { sintese = { erro_parse: true, raw: resp.slice(0, 1000) }; }
  return {
    sintese,
    modelo,
    tokens_in,
    tokens_out,
    custo_usd: custoUsd(modelo, tokens_in, tokens_out),
  };
}

// ====================== CAMADA 5: EXECUTORES ======================

async function executorReescritorPagina(sintese: any, persona: any, dataHub: any, modelo: string): Promise<any> {
  if (!dataHub.pagina?.ok) return { ok: false, motivo: 'sem_pagina_pra_analisar' };

  const systemPrompt = `Você é o Reescritor de Página de Venda. Gera headline + lead + oferta novas baseado no diagnóstico.

${blocoPersonaCompacto(persona)}

Devolva JSON:
{
  "headlines_sugeridas": ["3 headlines novas (≤12 palavras cada)"],
  "lead_novo": "primeiros 2 paragrafos da pagina",
  "oferta_reescrita": "oferta principal nova",
  "garantia_sugerida": "...",
  "cta_novo": "..."
}`;

  const userPrompt = `Diagnóstico:
${JSON.stringify(sintese, null, 2).slice(0, 4000)}

Página atual (resumo):
${(dataHub.pagina?.texto || '').slice(0, 3000)}

Reescreve no estilo Halbert/Schwartz, usando vocabulário da persona.`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(modelo, systemPrompt, userPrompt, true);
  let out: any = {};
  try { out = JSON.parse(resp); } catch (_) {}
  return { ok: true, ...out, tokens_in, tokens_out, custo_usd: custoUsd(modelo, tokens_in, tokens_out) };
}

async function executorReescritorOferta(sintese: any, persona: any, modelo: string): Promise<any> {
  const systemPrompt = `Você é o Reescritor de Oferta de Entrada. Gera variações da oferta + order bump.

${blocoPersonaCompacto(persona)}

Devolva JSON:
{
  "oferta_principal_variacoes": ["3 variações"],
  "order_bump_variacoes": ["3 versões de order bump"],
  "estrutura_de_valor": "...",
  "objecao_endereçada": "..."
}`;

  const userPrompt = `Diagnóstico:
${JSON.stringify(sintese, null, 2).slice(0, 3000)}

Gere variações pro Desafio Lo-fi (ticket R$ 19-69, 2 dias de aula ao vivo).`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(modelo, systemPrompt, userPrompt, true);
  let out: any = {};
  try { out = JSON.parse(resp); } catch (_) {}
  return { ok: true, ...out, tokens_in, tokens_out, custo_usd: custoUsd(modelo, tokens_in, tokens_out) };
}

async function executorSequenciaPreAula(sintese: any, persona: any, modelo: string): Promise<any> {
  const systemPrompt = `Você é o Gerador de Sequência pré-aula. Cria 3 mensagens (D-3, D-1, D-0) pra aumentar show-up no Desafio.

${blocoPersonaCompacto(persona)}

Devolva JSON:
{
  "mensagens": [
    {"momento": "D-3", "canal": "whatsapp", "assunto": "...", "corpo": "...", "objetivo": "lembrar + criar antecipacao"},
    {"momento": "D-1", "canal": "...", "assunto": "...", "corpo": "..."},
    {"momento": "D-0 manha", "canal": "...", "corpo": "..."}
  ]
}`;

  const userPrompt = `Diagnóstico:
${JSON.stringify(sintese, null, 2).slice(0, 2500)}

Sequência completa pré-aula.`;

  const { resp, tokens_in, tokens_out } = await chamarLLM(modelo, systemPrompt, userPrompt, true);
  let out: any = {};
  try { out = JSON.parse(resp); } catch (_) {}
  return { ok: true, ...out, tokens_in, tokens_out, custo_usd: custoUsd(modelo, tokens_in, tokens_out) };
}

async function executorGeradorCriativo(sintese: any, dataHub: any, sb: any): Promise<any> {
  // Chama gerar-variacao-anuncio do MC INTERNAMENTE (function-to-function, com service role)
  // V1: pega o melhor "ancora" do anuncio_referencia do diagnostico
  const referenciaTexto = (dataHub.pagina?.texto || dataHub.pagina?.titulo || 'Desafio de conteudo low ticket').slice(0, 1500);
  if (referenciaTexto.length < 20) return { ok: false, motivo: 'sem_referencia_para_variar' };

  // A Edge gerar-variacao-anuncio exige Bearer = TOKEN_PROJETO_EXTERNO_CRIATIVOS (não service role).
  // Lê do cofre. Mesmo padrão usado pelo Pinguim Ads Monitor.
  let tokenExterno: string;
  try {
    tokenExterno = await getChave('TOKEN_PROJETO_EXTERNO_CRIATIVOS', 'tool-rodar-workflow');
  } catch (e) {
    return { ok: false, motivo: 'sem_token_externo', detalhe: e?.message };
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-variacao-anuncio`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenExterno}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        produto_slug: 'desafio-de-conte-do-lo-fi',
        anuncio_referencia: referenciaTexto,
        clone_slugs: ['alex-hormozi', 'gary-halbert'],
        modo: 'paralelo',
        briefing: 'Variações pra anúncio Meta do Desafio Lo-fi, baseado no diagnóstico do workflow. Foco em aumentar conversão de entrada.',
        formato_alvo: 'anuncio_meta',
        metadata_externa: { origem: 'workflow-lo-fi' },
      }),
    });
    if (!r.ok) {
      return { ok: false, motivo: 'gerar_variacao_falhou', status: r.status, detalhe: (await r.text()).slice(0, 200) };
    }
    const j = await r.json();
    if (!j.geracao_id) return { ok: false, motivo: 'sem_geracao_id', resp: j };

    // Polling — espera até 60s
    let finalJ: any = null;
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 3500));
      const rp = await fetch(`${SUPABASE_URL}/functions/v1/consultar-geracao?id=${j.geracao_id}`, {
        headers: { Authorization: `Bearer ${tokenExterno}` },
      });
      if (!rp.ok) continue;
      const dp = await rp.json();
      if (dp.status === 'concluido') { finalJ = dp; break; }
      if (dp.status === 'falhou') return { ok: false, motivo: 'geracao_falhou', detalhe: dp.erro_mensagem };
    }
    if (!finalJ) return { ok: false, motivo: 'timeout_polling' };
    return {
      ok: true,
      outputs: finalJ.outputs || [],
      modelo: finalJ.modelo,
      custo_usd: finalJ.custo_usd || 0,
      tokens_in: finalJ.tokens_in || 0,
      tokens_out: finalJ.tokens_out || 0,
      duracao_segundos: finalJ.duracao_segundos,
    };
  } catch (e) {
    return { ok: false, motivo: 'erro_excecao', detalhe: e?.message };
  }
}

async function rodarCamada5(workflow: Workflow, sintese: any, dataHub: any, persona: any, sb: any): Promise<any> {
  const modelo = workflow.modelos?.executor || 'gpt-5.4-mini';
  const [pagina, oferta, sequencia, criativos] = await Promise.all([
    executorReescritorPagina(sintese, persona, dataHub, modelo).catch(e => ({ ok: false, erro: e?.message })),
    executorReescritorOferta(sintese, persona, modelo).catch(e => ({ ok: false, erro: e?.message })),
    executorSequenciaPreAula(sintese, persona, modelo).catch(e => ({ ok: false, erro: e?.message })),
    executorGeradorCriativo(sintese, dataHub, sb).catch(e => ({ ok: false, erro: e?.message })),
  ]);
  return { reescritor_pagina: pagina, reescritor_oferta: oferta, sequencia_pre_aula: sequencia, criativos_novos: criativos };
}

// ====================== ORQUESTRADOR PRINCIPAL ======================

export async function executarWorkflow(rodadaId: string, workflow: Workflow, inputs: Inputs): Promise<void> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
  const t0 = Date.now();
  let totalCustoUsd = 0;
  let totalIn = 0, totalOut = 0;
  const modelosUsados: any = { analistas: [], consultor: '', executores: '' };

  try {
    // 1. Data Hub paralelo
    console.log('[wf]', rodadaId, '→ data hub');
    const dataHub = await coletarDataHub(workflow, inputs, sb);

    // 2. Persona
    console.log('[wf]', rodadaId, '→ persona');
    const persona = await carregarPersona(workflow.produto_id, sb);

    // 3. Camada 2: analistas paralelos
    console.log('[wf]', rodadaId, '→ camada 2 (analistas)');
    const pareceres = await rodarCamada2(workflow, inputs, dataHub, persona, sb);
    for (const p of pareceres) {
      totalCustoUsd += p.custo_usd;
      totalIn += p.tokens_in;
      totalOut += p.tokens_out;
      modelosUsados.analistas.push(p.especialista);
    }

    // 4. Camada 3+4: Consultor consolidador
    console.log('[wf]', rodadaId, '→ camada 3+4 (consultor)');
    const consultor = await rodarConsultor(workflow, pareceres, dataHub, persona);
    totalCustoUsd += consultor.custo_usd;
    totalIn += consultor.tokens_in;
    totalOut += consultor.tokens_out;
    modelosUsados.consultor = consultor.modelo;

    // 5. Camada 5: executores paralelos
    console.log('[wf]', rodadaId, '→ camada 5 (executores)');
    const execucoes = await rodarCamada5(workflow, consultor.sintese, dataHub, persona, sb);
    modelosUsados.executores = workflow.modelos?.executor || 'gpt-5.4-mini';
    for (const k of ['reescritor_pagina', 'reescritor_oferta', 'sequencia_pre_aula']) {
      const e = (execucoes as any)[k];
      if (e?.ok) { totalCustoUsd += e.custo_usd || 0; totalIn += e.tokens_in || 0; totalOut += e.tokens_out || 0; }
    }
    if (execucoes.criativos_novos?.ok) {
      totalCustoUsd += execucoes.criativos_novos.custo_usd || 0;
      totalIn += execucoes.criativos_novos.tokens_in || 0;
      totalOut += execucoes.criativos_novos.tokens_out || 0;
    }

    // 6. Salva rodada concluida
    const duracao = Math.round((Date.now() - t0) / 1000);
    await sb.from('workflow_rodadas')
      .update({
        status: 'concluido',
        concluido_em: new Date().toISOString(),
        duracao_segundos: duracao,
        data_hub: dataHub,
        pareceres_analistas: pareceres,
        sintese: consultor.sintese,
        execucoes,
        custo_usd: totalCustoUsd,
        tokens_in: totalIn,
        tokens_out: totalOut,
        modelos_usados: modelosUsados,
        persona_versao_usada: persona?.versao,
      })
      .eq('id', rodadaId);

    console.log('[wf]', rodadaId, '✅ concluído em', duracao, 's | $', totalCustoUsd.toFixed(4));
  } catch (e) {
    console.error('[wf]', rodadaId, '❌ erro:', e?.message);
    await sb.from('workflow_rodadas')
      .update({
        status: 'falhou',
        erro_codigo: 'EXECUCAO_FALHOU',
        erro_mensagem: e?.message?.slice(0, 500) || 'erro desconhecido',
        concluido_em: new Date().toISOString(),
        duracao_segundos: Math.round((Date.now() - t0) / 1000),
        custo_usd: totalCustoUsd,
        tokens_in: totalIn,
        tokens_out: totalOut,
      })
      .eq('id', rodadaId);
  }
}
