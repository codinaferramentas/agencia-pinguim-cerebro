// Edge: tool-hotmart-listar-campos
// GET/POST /functions/v1/tool-hotmart-listar-campos
//
// Devolve catalogo PT-BR dos tipos de relatorio + campos que o analista-hotmart pode pedir.
//
// Body opcional:
//   { tipo_relatorio?: "vendas"|"reembolsos"|"top_compradores"|"ranking_produtos" }
//
// Retorno:
//   { ok, tipos_relatorio, agrupamentos, filtros, defaults_por_intencao }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

interface TipoRelatorio {
  slug: string;
  nome: string;
  descricao: string;
  campos_saida: { nome: string; descricao: string }[];
}

const TIPOS_RELATORIO: TipoRelatorio[] = [
  {
    slug: 'vendas',
    nome: 'Vendas (Receita)',
    descricao: 'Vendas aprovadas/completadas no periodo. Receita = my_commission (comissao liquida, nao price_value). Use pra "quanto faturei", "receita por produto", "vendas do mes".',
    campos_saida: [
      { nome: 'receita',       descricao: 'Soma de my_commission (R$)' },
      { nome: 'n_vendas',      descricao: 'Quantidade de transacoes aprovadas' },
      { nome: 'ticket_medio',  descricao: 'receita / n_vendas (R$)' },
      { nome: 'pct_receita',   descricao: '% da receita total que aquele agrupamento representa' },
    ],
  },
  {
    slug: 'reembolsos',
    nome: 'Reembolsos',
    descricao: 'Transacoes com status=refunded, FILTRADAS por refund_date (NAO purchase_date — eh fluxo de caixa do dia). Use pra "quanto perdi em reembolso", "reembolsos da semana".',
    campos_saida: [
      { nome: 'receita_perdida', descricao: 'Soma de my_commission das transacoes reembolsadas (R$)' },
      { nome: 'n_reembolsos',    descricao: 'Quantidade de reembolsos no periodo' },
      { nome: 'ticket_medio',    descricao: 'receita_perdida / n_reembolsos (R$)' },
    ],
  },
  {
    slug: 'top_compradores',
    nome: 'Top Compradores',
    descricao: 'Ranking de buyers ordenado por receita total. Inclui email, nome, telefone. Limitado aos top 200. Use pra "melhores clientes", "quem mais comprou".',
    campos_saida: [
      { nome: 'email',         descricao: 'Email do comprador' },
      { nome: 'nome',          descricao: 'Nome cadastrado na Hotmart' },
      { nome: 'telefone',      descricao: 'Telefone cadastrado' },
      { nome: 'receita_total', descricao: 'Soma de my_commission de todas compras (R$)' },
      { nome: 'n_compras',     descricao: 'Quantidade de compras aprovadas' },
      { nome: 'ticket_medio',  descricao: 'receita_total / n_compras (R$)' },
    ],
  },
  {
    slug: 'ranking_produtos',
    nome: 'Ranking de Produtos',
    descricao: 'Ranking de produtos por receita. Use pra "produtos mais vendidos", "qual produto mais faturou".',
    campos_saida: [
      { nome: 'produto',       descricao: 'Nome do produto na Hotmart' },
      { nome: 'receita',       descricao: 'Soma de my_commission (R$)' },
      { nome: 'n_vendas',      descricao: 'Quantidade de transacoes' },
      { nome: 'ticket_medio',  descricao: 'receita / n_vendas (R$)' },
      { nome: 'pct_receita',   descricao: '% da receita total' },
    ],
  },
];

const AGRUPAMENTOS = [
  { slug: 'produto',      descricao: 'Agrupa por produto Hotmart. Default pra "vendas". Recomendado pra periodo longo.' },
  { slug: 'dia',          descricao: 'Agrupa por dia (YYYY-MM-DD). Use pra periodo curto (<60 dias).' },
  { slug: 'mes',          descricao: 'Agrupa por mes (YYYY-MM). Use pra periodo longo (>3 meses).' },
  { slug: 'status',       descricao: 'Agrupa por status da transacao (approved, completed, refunded, etc).' },
  { slug: 'payment_type', descricao: 'Agrupa por forma de pagamento (PIX, CREDIT_CARD, BILLET, WALLET, etc).' },
];

const FILTROS = [
  { campo: 'filtro_produto',      descricao: 'Filtra produtos pelo nome (ILIKE %X%). Ex: "Elo", "Lyra".' },
  { campo: 'filtro_payment_type', descricao: 'Filtra forma de pagamento (uppercase). Ex: "PIX", "CREDIT_CARD".' },
  { campo: 'incluir_order_bump',  descricao: 'Se false, exclui order bumps. Default true.' },
  { campo: 'moeda',               descricao: 'Filtra moeda (uppercase). Default "BRL". NUNCA misture moedas.' },
];

const DEFAULTS_POR_INTENCAO: Record<string, { tipo_relatorio: string; agrupamento: string; nota: string }> = {
  receita:           { tipo_relatorio: 'vendas',           agrupamento: 'produto', nota: 'soma de my_commission por produto' },
  faturamento:       { tipo_relatorio: 'vendas',           agrupamento: 'produto', nota: 'idem receita' },
  vendas:            { tipo_relatorio: 'vendas',           agrupamento: 'produto', nota: 'idem receita' },
  reembolsos:        { tipo_relatorio: 'reembolsos',       agrupamento: 'produto', nota: 'filtrado por refund_date' },
  refunds:           { tipo_relatorio: 'reembolsos',       agrupamento: 'produto', nota: 'idem reembolsos' },
  top_clientes:      { tipo_relatorio: 'top_compradores',  agrupamento: 'produto', nota: 'ranking buyers por receita' },
  ranking_produtos:  { tipo_relatorio: 'ranking_produtos', agrupamento: 'produto', nota: 'ranking produtos por receita' },
  mais_vendidos:     { tipo_relatorio: 'ranking_produtos', agrupamento: 'produto', nota: 'idem ranking produtos' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

  let filtro = '';
  if (req.method === 'POST') {
    try {
      const b = await req.json();
      filtro = String(b.tipo_relatorio || '').toLowerCase();
    } catch { /* ignora */ }
  } else {
    const url = new URL(req.url);
    filtro = (url.searchParams.get('tipo_relatorio') || '').toLowerCase();
  }

  let tipos = TIPOS_RELATORIO;
  if (filtro) {
    tipos = TIPOS_RELATORIO.filter(t => t.slug === filtro);
    if (tipos.length === 0) {
      return jsonRespTool({
        ok: false,
        erro: `tipo_relatorio '${filtro}' nao existe`,
        tipos_validos: TIPOS_RELATORIO.map(t => t.slug),
      }, 400);
    }
  }

  return jsonRespTool({
    ok: true,
    tipos_relatorio: tipos,
    agrupamentos: AGRUPAMENTOS,
    filtros: FILTROS,
    defaults_por_intencao: DEFAULTS_POR_INTENCAO,
    regras_duras: {
      receita: 'Sempre my_commission (NUNCA price_value).',
      status_validos_receita: ['approved', 'completed'],
      reembolso: 'status=refunded filtrado por refund_date (NAO purchase_date).',
      moeda: 'BRL por default. NUNCA somar moedas mistas.',
    },
  });
});
