// ============================================================
// book-comercial-worker/raiox.ts
// ============================================================
// Camada de inteligência comercial do Book:
//  1. Raio-X do cliente — tool-consultar-pessoa (Hotmart, Clint,
//     ProAlt, Elo, Sirius, boleto Principia) por email/telefone.
//  2. Prova social — tool-buscar-prova-social nos cérebros dos
//     produtos que o comercial vende (Elo, Lyra, ProAlt, Taurus).
//  3. Munição — gpt-4o cruza nicho + faturamento + análise do
//     perfil + histórico + depoimentos e devolve o playbook.
// ============================================================

import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// slug real dos produtos no Pinguim OS (atenção: Taurus tem typo histórico no slug)
const PRODUTOS_PROVA_SOCIAL = [
  { slug: 'elo', nome: 'Elo' },
  { slug: 'lyra', nome: 'Lyra' },
  { slug: 'proalt', nome: 'ProAlt' },
  { slug: 'tuarus', nome: 'Taurus' },
  { slug: 'low-ticket-desafio', nome: 'Desafio Low Ticket' },
  { slug: 'desafio-de-conte-do-lo-fi', nome: 'Desafio Lo-fi' },
];

async function chamarEdge(nome: string, body: unknown): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'x-internal-token': SERVICE_ROLE,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${nome} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// ============================================================
// 1. Consultar pessoa (email primeiro; telefone como fallback)
// ============================================================
export async function consultarPessoa(email: string | null, telefone: string | null): Promise<any | null> {
  let resultado: any = null;
  if (email) {
    try { resultado = await chamarEdge('tool-consultar-pessoa', { identificador: email }); } catch (e) { console.error('[raiox] consultar por email:', (e as Error).message); }
  }
  const achou = resultado?.achados_em?.length > 0;
  if (!achou && telefone) {
    try {
      const porFone = await chamarEdge('tool-consultar-pessoa', { identificador: telefone });
      if (porFone?.achados_em?.length > 0) resultado = porFone;
    } catch (e) { console.error('[raiox] consultar por telefone:', (e as Error).message); }
  }
  return resultado;
}

// ============================================================
// 1b. FATO determinístico: já é cliente? desde quando?
// ============================================================
// Isso NUNCA é decidido pela IA (bug real: 8 compras na Hotmart e a IA
// respondeu "lead novo" porque os produtos não eram Elo/Lyra). Se comprou
// qualquer coisa nossa ou está nas plataformas de aluno, É CLIENTE.
export function fatoCliente(pessoa: any | null): { ja_cliente: boolean; cliente_desde: string | null; compras: number; plataformas_aluno: string[] } {
  const hot = pessoa?.resultados?.hotmart;
  const compras = Number(hot?.total_transacoes || 0);
  const plataformasAluno = ((pessoa?.achados_em || []) as string[]).filter((f) => ['elo', 'proalt', 'sirius'].includes(f));
  const ja_cliente = compras > 0 || plataformasAluno.length > 0;

  let desde: Date | null = null;
  for (const p of hot?.produtos || []) {
    for (const c of p.compras || []) {
      const d = c?.data ? new Date(c.data) : null;
      if (d && !isNaN(d.getTime()) && (!desde || d < desde)) desde = d;
    }
  }
  return { ja_cliente, cliente_desde: desde ? desde.toISOString().slice(0, 10) : null, compras, plataformas_aluno: plataformasAluno };
}

// ============================================================
// 2. Prova social dos produtos-alvo
// ============================================================
export async function buscarDepoimentos(): Promise<{ produto: string; itens: any[] }[]> {
  const out: { produto: string; itens: any[] }[] = [];
  await Promise.all(PRODUTOS_PROVA_SOCIAL.map(async (p) => {
    try {
      const r = await chamarEdge('tool-buscar-prova-social', { produto_slug: p.slug, limite: 10 });
      if (r?.ok && Array.isArray(r.itens) && r.itens.length > 0) out.push({ produto: p.nome, itens: r.itens });
    } catch (e) {
      console.error(`[raiox] prova social ${p.slug}:`, (e as Error).message);
    }
  }));
  return out;
}

// ============================================================
// 3. Síntese comercial (gpt-4o, tool-calling)
// ============================================================
const TOOL_MUNICAO = {
  type: 'function' as const,
  function: {
    name: 'gerar_municao_comercial',
    description: 'Raio-X do relacionamento + munição de venda pro consultor',
    parameters: {
      type: 'object',
      properties: {
        resumo_relacionamento: { type: 'string', description: 'Parágrafo: histórico do lead com a Agência Pinguim (ou "lead novo, sem histórico"). Ancorado só nos dados.' },
        ja_cliente: { type: 'boolean' },
        cliente_desde: { type: 'string', description: 'AAAA-MM-DD da primeira compra, ou vazio' },
        produto_alvo: { type: 'string', enum: ['Elo', 'Lyra'] },
        produto_alvo_racional: { type: 'string', description: '2-3 frases: por que este produto pra este lead (faturamento, momento, perfil)' },
        cases: {
          type: 'array', maxItems: 4,
          items: {
            type: 'object',
            properties: {
              autor: { type: 'string' },
              produto: { type: 'string' },
              resumo: { type: 'string' },
              relevancia_nicho: { type: 'string', description: 'Por que este case conversa com o nicho/momento do lead' },
              valor_mencionado: { type: 'string', description: 'Valor/resultado citado no depoimento, ou vazio' },
            },
            required: ['autor', 'produto', 'resumo', 'relevancia_nicho', 'valor_mencionado'],
          },
        },
        insights_comerciais: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' }, description: 'Bullets acionáveis pro consultor usar na call' },
        roteiro_call: { type: 'array', minItems: 4, maxItems: 7, items: { type: 'string' }, description: 'Passos da call ancorados na análise do perfil (do rapport ao fechamento)' },
        angulos_objecao: {
          type: 'array', minItems: 2, maxItems: 4,
          items: {
            type: 'object',
            properties: { objecao: { type: 'string' }, resposta: { type: 'string' } },
            required: ['objecao', 'resposta'],
          },
        },
      },
      required: ['resumo_relacionamento', 'ja_cliente', 'cliente_desde', 'produto_alvo', 'produto_alvo_racional', 'cases', 'insights_comerciais', 'roteiro_call', 'angulos_objecao'],
    },
  },
};

const MUNICAO_SYSTEM = `Você é o estrategista comercial sênior da Agência Pinguim. Um lead agendou uma call de consultoria (circuito "Comercial 365") e você prepara o consultor pra essa conversa.

CONTEXTO DOS PRODUTOS QUE O CONSULTOR VENDE:
- ELO: programa de assinatura da Agência Pinguim pra estruturar conteúdo, posicionamento e vendas no digital. Porta de entrada ideal pra quem está construindo ou organizando a operação (faturamento menor ou inconsistente).
- LYRA: mentoria próxima (high-touch) pra quem já tem operação rodando e quer escala. Indicada pra faturamento mais alto e negócio mais maduro.
Regra prática: faturamento declarado baixo/médio ou operação em estruturação → Elo. Faturamento alto e negócio rodando → Lyra. Sempre explique o racional — a decisão final é do consultor.

REGRAS:
1. Responda APENAS via tool call.
2. NUNCA invente dados: use só o histórico, a análise do perfil e os depoimentos fornecidos. Se não houver histórico, diga que é lead novo.
3. Cases: escolha APENAS depoimentos da lista fornecida que tenham relação real com o nicho/momento do lead (mesmo nicho, nicho vizinho ou mesma dor). Se nada tiver relação direta, escolha os de resultado mais concreto e explique a ponte com honestidade.
4. Insights e roteiro: específicos deste lead — cite o problema real do perfil dele (nota, bio, conteúdo) e conecte com o que o produto resolve. Nada de genérico.
5. Objeções: antecipe as 2-4 mais prováveis DESTE lead (preço, tempo, "já tentei", "meu nicho é diferente") com respostas ancoradas nos dados e cases.
6. Tom: direto, consultivo, português brasileiro. O consultor vai ler isso 10 minutos antes da call.`;

export async function gerarMunicao(ctx: {
  lead: { nome: string; email: string | null; telefone: string | null; instagram: string; nicho: string | null; faturamento: string | null };
  analiseResumo: string;
  pessoa: any | null;
  depoimentos: { produto: string; itens: any[] }[];
  respostasForm?: { pergunta: string; resposta: string }[];
  fato?: { ja_cliente: boolean; cliente_desde: string | null; compras: number; plataformas_aluno: string[] };
}): Promise<any> {
  const openaiKey = await getChave('OPENAI_API_KEY', 'book-comercial-worker');

  const pessoaTxt = ctx.pessoa && ctx.pessoa.achados_em?.length
    ? JSON.stringify({
        achados_em: ctx.pessoa.achados_em,
        hotmart: ctx.pessoa.resultados?.hotmart ?? null,
        outras: Object.fromEntries(Object.entries(ctx.pessoa.resultados || {}).filter(([k]) => k !== 'hotmart').map(([k, v]: [string, any]) => [k, { encontrado: v?.encontrado, resumo: v?.pessoa || v?.resumo || null }])),
      }).slice(0, 6000)
    : 'LEAD NOVO — não encontrado em nenhuma base (Hotmart, Clint, ProAlt, Elo, Sirius, boleto).';

  // autor/resumo podem vir nulos — o nome costuma estar no título
  // ("Depoimento — Fulana (Elo)"); sem resumo, o título vira o texto.
  const depLinha = (produto: string, i: any) => {
    const autor = i.autor || (i.titulo || '').replace(/^depoimento\s*[—-]\s*/i, '').replace(/\s*\(.+\)$/, '').trim() || 'aluno';
    const texto = i.resumo || i.titulo || '';
    const cat = i.categoria_inferida ? ` [tema: ${i.categoria_inferida}]` : '';
    return `- [${produto}] ${autor}: ${String(texto).slice(0, 220)}${cat}${i.valor_mencionado ? ` (valor citado: ${i.valor_mencionado})` : ''}`;
  };
  const depTxt = ctx.depoimentos.length
    ? ctx.depoimentos.map((d) => d.itens.map((i: any) => depLinha(d.produto, i)).join('\n')).join('\n')
    : '(nenhum depoimento disponível)';

  const formTxt = (ctx.respostasForm || []).length
    ? ctx.respostasForm!.map((r) => `- ${r.pergunta}: ${String(r.resposta).slice(0, 300)}`).join('\n')
    : '(formulário não recebido)';

  const fatoTxt = ctx.fato
    ? (ctx.fato.ja_cliente
        ? `JÁ É CLIENTE (fato verificado no banco — NÃO diga "lead novo"): ${ctx.fato.compras} compra(s) na Hotmart${ctx.fato.cliente_desde ? `, primeira em ${ctx.fato.cliente_desde}` : ''}${ctx.fato.plataformas_aluno.length ? `, presente nas plataformas: ${ctx.fato.plataformas_aluno.join(', ')}` : ''}. Compras de produtos do nosso ecossistema (mesmo que não sejam Elo/Lyra) CONTAM como relacionamento.`
        : 'LEAD NOVO (fato verificado): nenhuma compra ou cadastro nas nossas bases.')
    : '(histórico não consultado)';

  const userMsg = `LEAD DA CALL:
Nome: ${ctx.lead.nome}
Instagram: @${ctx.lead.instagram}
Nicho declarado no formulário: ${ctx.lead.nicho || '(não informado)'}
Faturamento declarado: ${ctx.lead.faturamento || '(não informado)'}

STATUS DE RELACIONAMENTO (fato do banco, use como verdade): ${fatoTxt}

O QUE ELE RESPONDEU NO FORMULÁRIO DE QUALIFICAÇÃO (use — principalmente o desafio principal e o que o incomoda no Instagram — pra personalizar insights, roteiro e objeções):
${formTxt}

RESUMO DA ANÁLISE DO PERFIL (motor Instagram):
${ctx.analiseResumo}

HISTÓRICO DO LEAD NAS NOSSAS BASES:
${pessoaTxt}

DEPOIMENTOS/CASES DISPONÍVEIS (nossos alunos reais):
${depTxt}

Gere o raio-X do relacionamento + munição de venda completa pra call.`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: MUNICAO_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      tools: [TOOL_MUNICAO],
      tool_choice: { type: 'function', function: { name: 'gerar_municao_comercial' } },
      max_tokens: 4000,
      temperature: 0.6,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI municao ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('municao: sem tool_call');
  return JSON.parse(args);
}

// ============================================================
// Monta o objeto RaioX final (programático + resumo da IA)
// ============================================================
export function montarRaiox(pessoa: any | null, municao: any, fato?: { ja_cliente: boolean; cliente_desde: string | null }): any {
  const hot = pessoa?.resultados?.hotmart;
  const hotmart = hot?.encontrado
    ? {
        total_transacoes: hot.total_transacoes || 0,
        gasto_total: hot.gasto_total || 0,
        valor_reembolsado: hot.valor_reembolsado || 0,
        produtos: (hot.produtos || []).map((p: any) => ({
          nome: p.nome,
          compras: (p.compras || []).map((c: any) => ({ status: c.status, valor: c.valor, data: c.data })),
        })),
      }
    : null;

  const plataformas: { fonte: string; resumo: string }[] = [];
  for (const [fonte, v] of Object.entries(pessoa?.resultados || {})) {
    if (fonte === 'hotmart') continue;
    const r: any = v;
    if (r?.encontrado) {
      const nome = r.pessoa?.nome || r.pessoa?.email || '';
      plataformas.push({ fonte, resumo: nome ? `encontrado (${nome})` : 'encontrado' });
    }
  }

  return {
    encontrado_em: pessoa?.achados_em || [],
    // fato determinístico manda; a IA só escreve o resumo
    ja_cliente: fato ? fato.ja_cliente : !!municao.ja_cliente,
    cliente_desde: fato ? fato.cliente_desde : (municao.cliente_desde || null),
    hotmart,
    teve_reembolso: (hotmart?.valor_reembolsado || 0) > 0,
    plataformas,
    resumo_ia: municao.resumo_relacionamento || '',
  };
}

/** Fix B1 no consumo: desaninha overview de análises já salvas em checkpoint
 * (o motor novo já entrega certo, mas análises antigas podem ter nota_geral
 * dentro de pilares). Mesma lógica do motor. */
export function normalizarOverview(analise: any): any {
  const ov = analise?.overview;
  if (!ov || typeof ov !== 'object') return analise;
  const p = ov.pilares;
  if (p && typeof p === 'object') {
    for (const k of ['nota_geral', 'veredito_curto', 'oportunidades', 'riscos', 'proximos_passos', 'identidade_atual', 'identidade_ideal', 'publico_alvo_inferido']) {
      if (ov[k] === undefined && p[k] !== undefined) { ov[k] = p[k]; delete p[k]; }
    }
    if (ov.nota_geral === undefined || ov.nota_geral === null) {
      const notas = Object.values(p).map((v: any) => Number(v?.nota)).filter((n: number) => Number.isFinite(n));
      if (notas.length) ov.nota_geral = Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 10) / 10;
    }
  }
  return analise;
}

/** Resumo compacto da análise do motor pra alimentar a IA da munição. */
export function resumirAnalise(analise: any): string {
  const o = analise?.overview || {};
  const bio = analise?.bio_analysis || {};
  const pilares = o.pilares
    ? Object.entries(o.pilares).map(([k, v]: [string, any]) => `${k}: ${v?.nota ?? '?'}/10`).join(' | ')
    : '';
  const linhas = [
    `Perfil @${analise?.profile?.handle} — ${analise?.profile?.followers || 0} seguidores, ${analise?.metrics?.professional_count || 0} posts profissionais analisados.`,
    `Nota geral do perfil: ${o.nota_geral ?? '?'}/10. Pilares: ${pilares}`,
    `Veredito: ${o.veredito_curto || ''}`,
    `Identidade atual: ${o.identidade_atual || ''}`,
    `Identidade ideal (a vender na call): ${o.identidade_ideal || ''}`,
    `Bio — pontos de melhoria: ${bio.pontos_de_melhoria || ''}`,
    `Principais oportunidades: ${(o.oportunidades || []).map((op: any) => op.titulo).join('; ')}`,
    `Riscos: ${(o.riscos || []).map((r: any) => r.titulo).join('; ')}`,
  ];
  return linhas.filter(Boolean).join('\n').slice(0, 3000);
}
