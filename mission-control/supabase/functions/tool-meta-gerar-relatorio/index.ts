// Edge: tool-meta-gerar-relatorio
// POST /functions/v1/tool-meta-gerar-relatorio
//
// Tool principal do analista-meta-ads. Puxa insights da Meta Graph API
// DIRETO (nao Dashboard Supabase, que ta com sync parcial) e devolve
// matriz pronta pra subir na planilha.
//
// Body:
// {
//   periodo: {
//     // EITHER:
//     preset?: "today"|"yesterday"|"last_7d"|"last_30d"|"this_month"|"last_month",
//     // OR:
//     inicio?: "YYYY-MM-DD",
//     fim?: "YYYY-MM-DD"
//   },
//   nivel?: "account"|"campaign"|"adset"|"ad",     // default: "campaign"
//   campos?: string[],                              // default: ["spend"]
//   agrupamento_temporal?: "none"|"daily"|"monthly", // default: "monthly"
//   agrupar_por_prefixo_produto?: boolean,           // default: false  ← cravado pra "[XXX] foo" virar produto XXX
//   contas?: string[],                               // default: TODAS Grupo Pinguim ATIVAS
//   filtro_status?: string,                          // 'ACTIVE'|'PAUSED' (passa em filtering ao Meta)
//   filtro_nome_contem?: string,                     // filtra entity.name por substring (case-insensitive)
//   breakdowns?: string[],                           // ex: ['age','gender']
// }
//
// Retorno:
// {
//   ok: true,
//   periodo: { inicio, fim, meses: [...] },
//   nivel,
//   campos_usados: [...],
//   linhas_brutas: [ {ad_account_id, ad_account_nome, entity_id, entity_name, produto, mes, ...campos} ],
//   matriz_pivot: { cabecalho: [...], linhas: [[...]] },    // produto x mes (se agrupar_por_prefixo + monthly)
//   matriz_long:  { cabecalho: [...], linhas: [[...]] },    // formato longo
//   matriz_detalhe: { cabecalho: [...], linhas: [[...]] },  // linha por (entity, mes)
//   resumo: { total_gasto, n_campanhas, periodo_dias, moeda }
// }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const META_VER = 'v25.0';
const BM_ALVO = 'Grupo Pinguim';

// ============================================================
// Helpers
// ============================================================

async function metaFetch(url: string, token: string): Promise<any> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const txt = await resp.text();
  let json: any;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!resp.ok) throw new Error(`Meta ${resp.status}: ${json?.error?.message || txt.slice(0, 200)}`);
  return json;
}

async function metaPaginar(url: string, token: string, limite_safety = 5000): Promise<any[]> {
  const acc: any[] = [];
  let next: string | null = url;
  while (next) {
    const j = await metaFetch(next, token);
    if (Array.isArray(j.data)) acc.push(...j.data);
    next = j.paging?.next || null;
    if (acc.length > limite_safety) break;
  }
  return acc;
}

function resolverPeriodo(periodo: any): { inicio: string; fim: string } {
  if (periodo?.inicio && periodo?.fim) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodo.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(periodo.fim)) {
      throw new Error('inicio/fim devem ser YYYY-MM-DD');
    }
    return { inicio: periodo.inicio, fim: periodo.fim };
  }
  const preset = String(periodo?.preset || 'last_30d');
  const hoje = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const sub = (n: number) => new Date(hoje.getTime() - n * 86400000);

  switch (preset) {
    case 'today':       return { inicio: fmt(hoje), fim: fmt(hoje) };
    case 'yesterday':   return { inicio: fmt(sub(1)), fim: fmt(sub(1)) };
    case 'last_7d':     return { inicio: fmt(sub(7)),  fim: fmt(sub(1)) };
    case 'last_30d':    return { inicio: fmt(sub(30)), fim: fmt(sub(1)) };
    case 'this_month': {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { inicio: fmt(d), fim: fmt(hoje) };
    }
    case 'last_month': {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { inicio: fmt(ini), fim: fmt(fim) };
    }
    default: throw new Error(`preset desconhecido: ${preset}`);
  }
}

function extrairProduto(nome: string | null | undefined): string {
  if (!nome) return 'SEM_PREFIXO';
  const m = String(nome).trim().match(/^\[([^\]]+)\]/);
  if (!m) return 'SEM_PREFIXO';
  let p = m[1].trim().toUpperCase();
  if (p === 'DCL') p = 'DLC'; // typo conhecido
  return p;
}

// Extrai valor de campo que pode estar em actions/action_values
function extrairCampo(linha: any, campo: string): number | null {
  if (campo.startsWith('actions:') || campo.startsWith('action_values:')) {
    const [bucket, tipo] = campo.split(':');
    const arr = linha[bucket];
    if (!Array.isArray(arr)) return null;
    const hit = arr.find((a: any) => a.action_type === tipo);
    return hit ? Number(hit.value || 0) : 0;
  }
  if (campo.startsWith('cost_per_action_type:')) {
    const tipo = campo.split(':')[1];
    const arr = linha.cost_per_action_type;
    if (!Array.isArray(arr)) return null;
    const hit = arr.find((a: any) => a.action_type === tipo);
    return hit ? Number(hit.value || 0) : 0;
  }
  if (campo === 'purchase_roas') {
    const arr = linha.purchase_roas;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return Number(arr[0].value || 0);
  }
  const v = linha[campo];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return null;
}

// Reduz lista de campos pra requisicao Meta — actions:X vira 'actions' (1x), idem action_values
function camposParaPedirNaMeta(campos: string[]): string[] {
  const set = new Set<string>();
  for (const c of campos) {
    if (c.startsWith('actions:'))             set.add('actions');
    else if (c.startsWith('action_values:'))  set.add('action_values');
    else if (c.startsWith('cost_per_action_type:')) set.add('cost_per_action_type');
    else set.add(c);
  }
  // sempre traz campos basicos pra contexto
  set.add('campaign_id');
  set.add('campaign_name');
  set.add('account_currency');
  set.add('date_start');
  set.add('date_stop');
  return [...set];
}

// Formata numero com 2 decimais quando moeda/preco; inteiro quando contagem
function fmtCelula(valor: number | null, campo: string): string {
  if (valor == null) return '';
  if (campo === 'spend' || campo === 'cpc' || campo === 'cpm' || campo === 'cpp' || campo.startsWith('cost_per_') || campo === 'action_values:purchase') {
    return valor.toFixed(2);
  }
  if (campo === 'ctr' || campo === 'inline_link_click_ctr' || campo === 'frequency' || campo === 'purchase_roas') {
    return valor.toFixed(2);
  }
  return String(Math.round(valor));
}

// ============================================================
// Handler
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch {
    return jsonRespTool({ ok: false, erro: 'body invalido' }, 400);
  }

  // Defaults
  const nivel = String(body.nivel || 'campaign');
  if (!['account', 'campaign', 'adset', 'ad'].includes(nivel)) {
    return jsonRespTool({ ok: false, erro: `nivel invalido: ${nivel}` }, 400);
  }
  const campos: string[] = Array.isArray(body.campos) && body.campos.length > 0 ? body.campos : ['spend'];
  const agrupamento_temporal = String(body.agrupamento_temporal || 'monthly');
  if (!['none', 'daily', 'monthly'].includes(agrupamento_temporal)) {
    return jsonRespTool({ ok: false, erro: `agrupamento_temporal invalido: ${agrupamento_temporal}` }, 400);
  }
  const agrupar_produto = !!body.agrupar_por_prefixo_produto;
  const contas_filtro: string[] = Array.isArray(body.contas) ? body.contas : [];
  const filtro_nome = String(body.filtro_nome_contem || '').toLowerCase();
  const filtro_status = String(body.filtro_status || '').toUpperCase();
  const breakdowns: string[] = Array.isArray(body.breakdowns) ? body.breakdowns : [];

  // V2 (Onda 1): contexto pra gravar artefato — recebido do agente-executar via buildInput
  const cliente_id: string | null = body.cliente_id || null;
  const agente_id: string | null = body.agente_id || null;

  try {
    const { inicio, fim } = resolverPeriodo(body.periodo);
    const META_TOKEN = await getChave('META_ACCESS_TOKEN', 'tool-meta-gerar-relatorio');
    if (!META_TOKEN) throw new Error('META_ACCESS_TOKEN nao no cofre');

    // 1) Lista ad accounts e filtra Grupo Pinguim
    const todasAds = await metaPaginar(
      `https://graph.facebook.com/${META_VER}/me/adaccounts?fields=id,name,account_status,currency,business{name}&limit=200`,
      META_TOKEN,
    );
    let adAccounts = todasAds.filter((a: any) => (a.business?.name || '') === BM_ALVO);
    if (contas_filtro.length > 0) {
      adAccounts = adAccounts.filter((a: any) =>
        contas_filtro.includes(a.id) || contas_filtro.includes(a.id.replace('act_', ''))
      );
    }

    // 2) Monta query Meta — campos a pedir + time_increment + breakdowns
    const fieldsParaMeta = camposParaPedirNaMeta(campos);
    const time_increment = agrupamento_temporal === 'monthly' ? 'monthly' : agrupamento_temporal === 'daily' ? '1' : 'all_days';

    // 3) Loopa contas, pega insights
    const linhasBrutas: any[] = [];
    const moedasVistas = new Set<string>();
    for (const a of adAccounts) {
      const params = new URLSearchParams();
      params.set('level', nivel);
      params.set('time_range', JSON.stringify({ since: inicio, until: fim }));
      if (time_increment !== 'all_days') params.set('time_increment', time_increment);
      params.set('fields', fieldsParaMeta.join(','));
      params.set('limit', '500');
      if (breakdowns.length > 0) params.set('breakdowns', breakdowns.join(','));
      if (filtro_status) {
        params.set('filtering', JSON.stringify([{ field: `${nivel}.effective_status`, operator: 'IN', value: [filtro_status] }]));
      }
      try {
        const rows = await metaPaginar(
          `https://graph.facebook.com/${META_VER}/${a.id}/insights?${params.toString()}`,
          META_TOKEN,
        );
        for (const r of rows) {
          const nomeEntidade = r.campaign_name || r.adset_name || r.ad_name || a.name;
          if (filtro_nome && !String(nomeEntidade).toLowerCase().includes(filtro_nome)) continue;
          const mes = (r.date_start || '').slice(0, 7); // YYYY-MM
          const produto = extrairProduto(nomeEntidade);
          const valoresCampos: Record<string, number | null> = {};
          for (const c of campos) valoresCampos[c] = extrairCampo(r, c);
          if (r.account_currency) moedasVistas.add(r.account_currency);
          linhasBrutas.push({
            ad_account_id: a.id,
            ad_account_nome: a.name,
            entity_id: r.campaign_id || r.adset_id || r.ad_id || a.id,
            entity_name: nomeEntidade,
            produto,
            data_inicio: r.date_start,
            data_fim: r.date_stop,
            mes,
            moeda: r.account_currency || a.currency,
            ...valoresCampos,
            // breakdowns vao direto
            ...(breakdowns.reduce((acc: any, b) => { acc[`bd_${b}`] = r[b]; return acc; }, {})),
          });
        }
      } catch (e: any) {
        console.warn(`[meta-gerar-relatorio] conta ${a.id} falhou: ${e.message?.slice(0, 100)}`);
      }
    }

    // 4) Resumo
    const totalGasto = linhasBrutas.reduce((s, l) => s + Number(l.spend || 0), 0);
    const moedasUnicas = [...moedasVistas];

    // 5) MATRIZ DETALHE — linha por (entity, mes)
    const cabDetalhe = ['mes', 'produto', 'campanha', 'conta', ...campos];
    const linhasDet = linhasBrutas
      .slice()
      .sort((a, b) => {
        if (a.produto !== b.produto) return a.produto < b.produto ? -1 : 1;
        if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
        return Number(b.spend || 0) - Number(a.spend || 0);
      })
      .map(l => [
        l.mes,
        l.produto,
        l.entity_name,
        l.ad_account_nome,
        ...campos.map(c => fmtCelula(l[c], c)),
      ]);

    // 6) MATRIZ LONG — produto x mes x campo
    let cabLong: string[] = [];
    let linhasLong: string[][] = [];
    if (agrupar_produto && agrupamento_temporal === 'monthly') {
      cabLong = ['produto', 'mes', ...campos, 'n_campanhas'];
      const agg = new Map<string, any>();
      for (const l of linhasBrutas) {
        const k = `${l.produto}|${l.mes}`;
        if (!agg.has(k)) {
          agg.set(k, { produto: l.produto, mes: l.mes, n_camp: 0, ...Object.fromEntries(campos.map(c => [c, 0])) });
        }
        const a = agg.get(k);
        a.n_camp += 1;
        for (const c of campos) a[c] += Number(l[c] || 0);
      }
      linhasLong = [...agg.values()]
        .sort((a, b) => a.produto < b.produto ? -1 : a.produto > b.produto ? 1 : a.mes < b.mes ? -1 : 1)
        .map(a => [a.produto, a.mes, ...campos.map(c => fmtCelula(a[c], c)), String(a.n_camp)]);
    }

    // 7) MATRIZ PIVOT — produto x meses (so se agrupar_produto + monthly + so 1 campo principal)
    let cabPivot: string[] = [];
    let linhasPivot: string[][] = [];
    if (agrupar_produto && agrupamento_temporal === 'monthly' && campos.length >= 1) {
      const campoPivot = campos[0]; // usa 1o campo (geralmente spend)
      const mesesSet = new Set<string>();
      const produtosSet = new Set<string>();
      const porPM = new Map<string, number>();
      for (const l of linhasBrutas) {
        mesesSet.add(l.mes);
        produtosSet.add(l.produto);
        const k = `${l.produto}|${l.mes}`;
        porPM.set(k, (porPM.get(k) || 0) + Number(l[campoPivot] || 0));
      }
      const meses = [...mesesSet].sort();
      const produtos = [...produtosSet].sort();
      cabPivot = ['produto', ...meses, 'TOTAL'];
      // ordena produtos por total desc
      const totaisProd = produtos.map(p => {
        let t = 0;
        for (const m of meses) t += porPM.get(`${p}|${m}`) || 0;
        return { p, t };
      }).sort((a, b) => b.t - a.t);
      const totalMes = new Map(meses.map(m => [m, 0]));
      for (const { p, t } of totaisProd) {
        const cols = [p];
        for (const m of meses) {
          const v = porPM.get(`${p}|${m}`) || 0;
          cols.push(fmtCelula(v, campoPivot));
          totalMes.set(m, (totalMes.get(m) || 0) + v);
        }
        cols.push(fmtCelula(t, campoPivot));
        linhasPivot.push(cols);
      }
      // linha total
      const linhaTotal = ['TOTAL'];
      let totalGeral = 0;
      for (const m of meses) {
        const v = totalMes.get(m) || 0;
        linhaTotal.push(fmtCelula(v, campoPivot));
        totalGeral += v;
      }
      linhaTotal.push(fmtCelula(totalGeral, campoPivot));
      linhasPivot.push(linhaTotal);
    }

    // ============================================================
    // V2 (Onda 1) — Pattern ARTIFACT
    // ============================================================
    // Dataset completo NAO volta pro LLM. Vai pra pinguim.artefatos.
    // LLM recebe SO resumo curto + artifact_id pra repassar pra prox tool.
    // ============================================================

    // calcula resumo curto pra LLM (top 3 por gasto total, agg stats)
    const topPorProduto = new Map<string, number>();
    for (const l of linhasBrutas) {
      const k = l.produto;
      topPorProduto.set(k, (topPorProduto.get(k) || 0) + Number(l.spend || 0));
    }
    const top3 = [...topPorProduto.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([produto, gasto]) => ({ produto, gasto: Number(gasto.toFixed(2)) }));

    // preview: 5 primeiras linhas da matriz long (ou detalhe se nao tem long)
    const previewCab = cabLong.length > 0 ? cabLong : cabDetalhe;
    const previewLinhas = cabLong.length > 0 ? linhasLong.slice(0, 5) : linhasDet.slice(0, 5);

    const periodoDias = Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000) + 1;

    const resumoLlm = {
      total_gasto: Number(totalGasto.toFixed(2)),
      moeda: moedasUnicas[0] || 'BRL',
      n_linhas: linhasBrutas.length,
      n_contas: adAccounts.length,
      periodo_dias: periodoDias,
      top_3_produtos: top3,
      preview: { cabecalho: previewCab, linhas: previewLinhas },
    };

    const conteudoArtefato = {
      periodo: { inicio, fim },
      nivel,
      campos_usados: campos,
      agrupamento_temporal,
      agrupar_por_prefixo_produto: agrupar_produto,
      contas_analisadas: adAccounts.map((a: any) => ({ id: a.id, nome: a.name })),
      resumo: resumoLlm,
      matriz_detalhe: { cabecalho: cabDetalhe, linhas: linhasDet },
      matriz_long:    cabLong.length > 0 ? { cabecalho: cabLong, linhas: linhasLong } : null,
      matriz_pivot:   cabPivot.length > 0 ? { cabecalho: cabPivot, linhas: linhasPivot } : null,
    };

    // Titulo curto e amigavel — sera usado como base do nome da planilha pela subir-planilha-drive.
    // Formato: "Meta · [Tema] · [Periodo curto]"
    const camposLegivel = campos.length === 1 && campos[0] === 'spend' ? 'Gasto'
      : campos.length <= 3 ? campos.join('+')
      : `Gasto+${campos.length - 1} metricas`;
    const periodoCurto = inicio.slice(2, 7).replace('-', '/') + '~' + fim.slice(2, 7).replace('-', '/');
    const sufixoProduto = agrupar_produto ? ' por Produto' : '';
    const tituloArt = `Meta · ${camposLegivel}${sufixoProduto} · ${periodoCurto}`;

    // Grava artefato
    let artifact_id: string | null = null;
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        db: { schema: 'pinguim' },
      });
      const { data, error } = await sb.rpc('gravar_artefato', {
        p_cliente_id: cliente_id,
        p_agente_id: agente_id,
        p_tool_origem: 'tool-meta-gerar-relatorio',
        p_tipo: 'dataset-tabular',
        p_titulo: tituloArt,
        p_descricao: `Gasto Meta Ads ${inicio} a ${fim}, nivel=${nivel}, campos=[${campos.join(',')}]`,
        p_schema_json: {
          campos_usados: campos,
          tem_pivot: cabPivot.length > 0,
          tem_long: cabLong.length > 0,
          tem_detalhe: cabDetalhe.length > 0,
        },
        p_conteudo: conteudoArtefato,
        p_resumo_llm: resumoLlm,
      });
      if (error) throw new Error(error.message);
      artifact_id = data;
    } catch (e: any) {
      console.error('[meta-gerar-relatorio] falha gravando artefato:', e?.message);
      // segue mesmo assim — LLM ainda recebe o resumo, mas sem artifact_id a subir-planilha vai falhar
    }

    // Resposta enxuta pro LLM (~400 tokens)
    return jsonRespTool({
      ok: true,
      artifact_id,
      titulo_sugerido: tituloArt,
      resumo: resumoLlm,
      mensagem_para_llm: artifact_id
        ? `Dataset gerado e salvo (artifact_id=${artifact_id}). PROXIMO PASSO: chame subir_planilha_drive passando este artifact_id pra subir a planilha no Drive do socio. NAO repita os dados na sua proxima mensagem — eles ja estao no artefato.`
        : `Dataset gerado mas artefato falhou. Reporte erro ao usuario.`,
    });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
