// Edge: tool-meta-listar-campos
// GET/POST /functions/v1/tool-meta-listar-campos
//
// Devolve catalogo PT-BR dos campos da Meta Marketing API que o
// analista-meta-ads pode pedir. Agrupados em 6 familias.
//
// Body opcional:
//   { familia?: "custo"|"performance"|"engajamento"|"video"|"conversao"|"breakdowns" }
//
// Retorno:
//   { ok, total_campos, familias: [{ slug, titulo, descricao, campos: [...] }] }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

interface Campo {
  meta_field: string;      // nome real na Graph API
  nome_pt: string;         // nome amigavel em PT-BR
  descricao: string;
  unidade?: string;        // 'R$', '%', 'qty', 'segundos', 'pessoas'
}

interface Familia {
  slug: string;
  titulo: string;
  descricao: string;
  campos: Campo[];
}

const FAMILIAS: Familia[] = [
  {
    slug: 'custo',
    titulo: 'Custo e gasto',
    descricao: 'Quanto foi gasto e custo unitario por acao. Use pra fechar conta financeira.',
    campos: [
      { meta_field: 'spend', nome_pt: 'Gasto', descricao: 'Valor total gasto no periodo', unidade: 'R$' },
      { meta_field: 'cpc',   nome_pt: 'CPC',   descricao: 'Custo por clique (gasto / cliques)', unidade: 'R$' },
      { meta_field: 'cpm',   nome_pt: 'CPM',   descricao: 'Custo por mil impressoes', unidade: 'R$' },
      { meta_field: 'cpp',   nome_pt: 'CPP',   descricao: 'Custo por mil pessoas alcancadas', unidade: 'R$' },
      { meta_field: 'cost_per_inline_link_click', nome_pt: 'Custo por clique em link', descricao: 'CPC so de cliques em link (exclui likes/shares)', unidade: 'R$' },
      { meta_field: 'cost_per_unique_click', nome_pt: 'Custo por clique unico', descricao: 'CPC contando pessoas unicas', unidade: 'R$' },
    ],
  },
  {
    slug: 'performance',
    titulo: 'Performance basica',
    descricao: 'Impressoes, alcance, cliques, CTR. Sinais classicos de tracao.',
    campos: [
      { meta_field: 'impressions', nome_pt: 'Impressoes', descricao: 'Quantas vezes o anuncio apareceu (mesma pessoa conta varias)', unidade: 'qty' },
      { meta_field: 'reach',       nome_pt: 'Alcance',    descricao: 'Pessoas unicas alcancadas (pico no periodo)', unidade: 'pessoas' },
      { meta_field: 'frequency',   nome_pt: 'Frequencia', descricao: 'Impressoes / alcance. >3.0 sinal de fadiga' },
      { meta_field: 'clicks',      nome_pt: 'Cliques',    descricao: 'Cliques totais (inclui like, share, ver mais)', unidade: 'qty' },
      { meta_field: 'inline_link_clicks', nome_pt: 'Cliques em link', descricao: 'So cliques em link (sai do Facebook)', unidade: 'qty' },
      { meta_field: 'unique_clicks',      nome_pt: 'Cliques unicos',   descricao: 'Pessoas unicas que clicaram', unidade: 'pessoas' },
      { meta_field: 'ctr',                nome_pt: 'CTR',               descricao: 'Cliques / impressoes', unidade: '%' },
      { meta_field: 'inline_link_click_ctr', nome_pt: 'CTR de link',    descricao: 'Cliques em link / impressoes', unidade: '%' },
    ],
  },
  {
    slug: 'engajamento',
    titulo: 'Engajamento (sociais)',
    descricao: 'Reacoes, comentarios, compartilhamentos, saves. Sinais de receptividade da audiencia.',
    campos: [
      { meta_field: 'actions:post_engagement',    nome_pt: 'Engajamento total no post',  descricao: 'Soma de reacoes + comentarios + shares + cliques' },
      { meta_field: 'actions:post_reaction',      nome_pt: 'Reacoes',                     descricao: 'Curtidas + amei + haha + etc' },
      { meta_field: 'actions:comment',            nome_pt: 'Comentarios',                 descricao: 'Comentarios no anuncio' },
      { meta_field: 'actions:link_click',         nome_pt: 'Cliques em link',             descricao: 'Cliques em link (visao acoes)' },
      { meta_field: 'actions:onsite_conversion.post_save', nome_pt: 'Salvamentos',        descricao: 'Quantas vezes salvaram o post' },
      { meta_field: 'actions:video_view',         nome_pt: 'Views de video',              descricao: 'Visualizacoes do video' },
    ],
  },
  {
    slug: 'video',
    titulo: 'Metricas de video',
    descricao: 'Funil de retencao do video — quantos chegaram em 25%, 50%, 75%, 100%. Util pra Reels e VSL.',
    campos: [
      { meta_field: 'video_play_actions',                  nome_pt: 'Plays de video',              descricao: 'Quantos plays comecaram' },
      { meta_field: 'video_p25_watched_actions',           nome_pt: 'Chegou em 25%',                descricao: 'Quantos viram 25% do video' },
      { meta_field: 'video_p50_watched_actions',           nome_pt: 'Chegou em 50%',                descricao: 'Quantos viram metade' },
      { meta_field: 'video_p75_watched_actions',           nome_pt: 'Chegou em 75%',                descricao: 'Quantos viram 75%' },
      { meta_field: 'video_p100_watched_actions',          nome_pt: 'Viram completo (100%)',        descricao: 'Quantos viram ate o fim' },
      { meta_field: 'video_thruplay_watched_actions',      nome_pt: 'Thruplays',                    descricao: 'Viram 15s+ ou ate o fim' },
      { meta_field: 'video_avg_time_watched_actions',      nome_pt: 'Tempo medio assistido',        descricao: 'Tempo medio por play', unidade: 'segundos' },
      { meta_field: 'cost_per_thruplay',                   nome_pt: 'Custo por thruplay',           descricao: 'Gasto / thruplays', unidade: 'R$' },
    ],
  },
  {
    slug: 'conversao',
    titulo: 'Conversoes e receita',
    descricao: 'Compras, leads, receita, ROAS. So aparece quando ha pixel/CAPI configurado.',
    campos: [
      { meta_field: 'actions:purchase',                      nome_pt: 'Compras',           descricao: 'Total de compras atribuidas (pixel)', unidade: 'qty' },
      { meta_field: 'actions:offsite_conversion.fb_pixel_purchase', nome_pt: 'Compras (pixel offsite)', descricao: 'Compras via pixel fora do FB', unidade: 'qty' },
      { meta_field: 'action_values:purchase',                nome_pt: 'Receita',            descricao: 'Valor total das compras atribuidas', unidade: 'R$' },
      { meta_field: 'actions:lead',                          nome_pt: 'Leads',              descricao: 'Leads gerados (Lead Form Ads ou conversao Lead)', unidade: 'qty' },
      { meta_field: 'actions:complete_registration',         nome_pt: 'Cadastros completos',descricao: 'Conversao tipo cadastro/sign-up', unidade: 'qty' },
      { meta_field: 'actions:add_to_cart',                   nome_pt: 'Adicao ao carrinho', descricao: 'Pessoas que adicionaram produto ao carrinho', unidade: 'qty' },
      { meta_field: 'actions:initiate_checkout',             nome_pt: 'Iniciou checkout',   descricao: 'Pessoas que comecaram processo de compra', unidade: 'qty' },
      { meta_field: 'actions:landing_page_view',             nome_pt: 'Views da landing',   descricao: 'Pessoas que carregaram a landing page', unidade: 'qty' },
      { meta_field: 'cost_per_action_type:purchase',         nome_pt: 'CPA de compra',      descricao: 'Custo por compra (gasto / compras)', unidade: 'R$' },
      { meta_field: 'cost_per_action_type:lead',             nome_pt: 'CPL',                descricao: 'Custo por lead', unidade: 'R$' },
      { meta_field: 'purchase_roas',                         nome_pt: 'ROAS',               descricao: 'Return on Ad Spend = receita / gasto' },
    ],
  },
  {
    slug: 'breakdowns',
    titulo: 'Quebras (breakdowns)',
    descricao: 'Cortes da mesma metrica por categoria. Use no parametro breakdowns ao gerar relatorio.',
    campos: [
      { meta_field: 'age',                  nome_pt: 'Faixa etaria',      descricao: 'Quebra por idade (18-24, 25-34, etc)' },
      { meta_field: 'gender',               nome_pt: 'Genero',            descricao: 'Quebra por genero (male/female/unknown)' },
      { meta_field: 'country',              nome_pt: 'Pais',              descricao: 'Quebra por pais' },
      { meta_field: 'region',               nome_pt: 'Estado/regiao',     descricao: 'Quebra por regiao geografica' },
      { meta_field: 'publisher_platform',   nome_pt: 'Plataforma',        descricao: 'Facebook, Instagram, Messenger, Audience Network' },
      { meta_field: 'platform_position',    nome_pt: 'Posicao no feed',   descricao: 'Feed, Stories, Reels, Search, etc' },
      { meta_field: 'device_platform',      nome_pt: 'Dispositivo',       descricao: 'Mobile, desktop, connected_tv' },
      { meta_field: 'impression_device',    nome_pt: 'Dispositivo do impr.', descricao: 'Smartphone iOS/Android, tablet, etc' },
      { meta_field: 'hourly_stats_aggregated_by_advertiser_time_zone', nome_pt: 'Hora do dia', descricao: 'Quebra por hora do dia (fuso anunciante)' },
    ],
  },
];

// Defaults inteligentes por intencao do usuario.
// Usado pelo agente quando o pedido tem palavra-chave forte.
const DEFAULTS_POR_INTENCAO: Record<string, { campos: string[]; nota: string }> = {
  gasto:        { campos: ['spend'],                                                          nota: 'so gasto, basico' },
  performance:  { campos: ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm'],   nota: 'metricas de tracao' },
  conversao:    { campos: ['spend', 'actions:purchase', 'action_values:purchase', 'purchase_roas', 'cost_per_action_type:purchase'], nota: 'receita e ROAS' },
  lead:         { campos: ['spend', 'actions:lead', 'cost_per_action_type:lead'],             nota: 'leads e CPL' },
  video:        { campos: ['spend', 'video_p25_watched_actions', 'video_p50_watched_actions', 'video_p75_watched_actions', 'video_p100_watched_actions', 'video_thruplay_watched_actions', 'cost_per_thruplay'], nota: 'funil de retencao do video' },
  engajamento:  { campos: ['spend', 'actions:post_engagement', 'actions:post_reaction', 'actions:comment', 'actions:onsite_conversion.post_save'], nota: 'sinais sociais' },
  alcance:      { campos: ['spend', 'reach', 'frequency', 'impressions'],                     nota: 'alcance e fadiga' },
  completo:     { campos: ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm', 'actions:purchase', 'action_values:purchase', 'purchase_roas', 'cost_per_action_type:purchase'], nota: 'tudo que importa' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

  let familiaFiltro = '';
  if (req.method === 'POST') {
    try {
      const b = await req.json();
      familiaFiltro = String(b.familia || '').toLowerCase();
    } catch { /* ignora */ }
  } else {
    const url = new URL(req.url);
    familiaFiltro = (url.searchParams.get('familia') || '').toLowerCase();
  }

  let familias = FAMILIAS;
  if (familiaFiltro) {
    familias = FAMILIAS.filter(f => f.slug === familiaFiltro);
    if (familias.length === 0) {
      return jsonRespTool({
        ok: false,
        erro: `familia '${familiaFiltro}' nao existe`,
        familias_validas: FAMILIAS.map(f => f.slug),
      }, 400);
    }
  }

  const total = familias.reduce((s, f) => s + f.campos.length, 0);
  return jsonRespTool({
    ok: true,
    total_campos: total,
    n_familias: familias.length,
    familias,
    defaults_por_intencao: DEFAULTS_POR_INTENCAO,
    observacao: 'Campos com prefixo "actions:" e "action_values:" sao extraidos do array actions/action_values do retorno da Meta API (filtrar pelo action_type indicado depois do :).',
  });
});
