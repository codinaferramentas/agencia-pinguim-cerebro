// Edge: tool-hotmart-gerar-relatorio
// POST /functions/v1/tool-hotmart-gerar-relatorio
//
// Tool principal do analista-hotmart. Le dados de vendas do Dashboard externo
// (Supabase lkrehtmdqkgkyyotvjpz, tabelas hotmart_transactions/buyers/products).
//
// REGRAS DURAS (memoria 2026-05-09):
// - Receita = my_commission (NUNCA price_value — eh valor bruto)
// - Status validos pra receita: ('approved', 'completed')
// - Reembolso = status='refunded' filtrado por refund_date (NAO purchase_date — eh fluxo de caixa)
// - Moeda BRL por default — NUNCA somar moedas mistas
//
// Body:
// {
//   tipo_relatorio?: "vendas"|"reembolsos"|"top_compradores"|"ranking_produtos",  // default: "vendas"
//   periodo: { preset?: "today"|"yesterday"|"last_7d"|"last_30d"|"this_month"|"last_month"|"ytd",
//              inicio?: "YYYY-MM-DD", fim?: "YYYY-MM-DD" },
//   agrupamento?: "produto"|"dia"|"mes"|"status"|"payment_type",  // default: "produto"
//   moeda?: string,                                                // default: "BRL"
//   filtro_produto?: string,                                       // ILIKE no nome do produto
//   filtro_payment_type?: string,                                  // ex: "PIX", "CREDIT_CARD"
//   incluir_order_bump?: boolean,                                  // default: true
//   limite?: number,                                               // default: 10000
//   cliente_id?: string,                                           // injetado pelo agente-executar
//   agente_id?: string,                                            // idem
// }
//
// Retorno:
// { ok, artifact_id, titulo_sugerido, resumo, mensagem_para_llm }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const STATUS_VALIDOS_RECEITA = ['approved', 'completed'];

// ============================================================
// Helpers
// ============================================================

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
    case 'last_7d':     return { inicio: fmt(sub(7)), fim: fmt(sub(1)) };
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
    case 'ytd': {
      const ini = new Date(hoje.getFullYear(), 0, 1);
      return { inicio: fmt(ini), fim: fmt(hoje) };
    }
    default: throw new Error(`preset desconhecido: ${preset}`);
  }
}

function fmtBR(n: number): string {
  if (n == null || isNaN(n)) return '';
  return Number(n).toFixed(2);
}

// SQL escape simples — valores aqui sao controlados (vem de enum validado), mas defensivo
function sqlEsc(s: string): string {
  return String(s).replace(/'/g, "''");
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
  const tipo_relatorio = String(body.tipo_relatorio || 'vendas');
  if (!['vendas', 'reembolsos', 'top_compradores', 'ranking_produtos'].includes(tipo_relatorio)) {
    return jsonRespTool({ ok: false, erro: `tipo_relatorio invalido: ${tipo_relatorio}` }, 400);
  }
  const agrupamento = String(body.agrupamento || 'produto');
  if (!['produto', 'dia', 'mes', 'status', 'payment_type'].includes(agrupamento)) {
    return jsonRespTool({ ok: false, erro: `agrupamento invalido: ${agrupamento}` }, 400);
  }
  const moeda = String(body.moeda || 'BRL').toUpperCase();
  const filtro_produto = String(body.filtro_produto || '').trim();
  const filtro_payment = String(body.filtro_payment_type || '').toUpperCase().trim();
  const incluir_bump = body.incluir_order_bump !== false; // default true
  const limite = Math.min(Math.max(Number(body.limite || 10000), 100), 50000);

  const cliente_id: string | null = body.cliente_id || null;
  const agente_id: string | null = body.agente_id || null;

  try {
    const { inicio, fim } = resolverPeriodo(body.periodo);

    // Conecta no Dashboard externo
    const dashUrl = await getChave('DASHBOARD_URL', 'tool-hotmart-gerar-relatorio');
    const dashKey = await getChave('DASHBOARD_SERVICE_ROLE_KEY', 'tool-hotmart-gerar-relatorio');
    const dash = createClient(dashUrl, dashKey, {
      auth: { persistSession: false },
      db: { schema: 'public' },
    });

    // ============================================================
    // Constroi SQL conforme tipo_relatorio
    // ============================================================
    // Decisao: usar API .rpc nao da (sem funcoes pre-criadas no Dashboard externo).
    // Vamos usar select com filtros e agregar em JS — ja que vendemos ~30k transacoes/ano,
    // periodo tipico < 1 ano cabe em <10k linhas.

    // ETAPA 1: pega transacoes brutas conforme tipo
    let queryBase = dash.from('hotmart_transactions').select(
      'transaction_code, status, payment_type, price_value, price_currency, my_commission, ' +
      'is_order_bump, purchase_date, approved_date, refund_date, product_id, buyer_id'
    );

    // Filtro temporal — purchase_date pra vendas, refund_date pra reembolsos
    const colData = tipo_relatorio === 'reembolsos' ? 'refund_date' : 'purchase_date';
    queryBase = queryBase
      .gte(colData, `${inicio}T00:00:00`)
      .lte(colData, `${fim}T23:59:59`);

    // Filtro de status
    if (tipo_relatorio === 'vendas' || tipo_relatorio === 'top_compradores' || tipo_relatorio === 'ranking_produtos') {
      queryBase = queryBase.in('status', STATUS_VALIDOS_RECEITA);
    } else if (tipo_relatorio === 'reembolsos') {
      queryBase = queryBase.eq('status', 'refunded');
    }

    // Moeda
    queryBase = queryBase.eq('price_currency', moeda);

    // Order bump opcional
    if (!incluir_bump) queryBase = queryBase.eq('is_order_bump', false);

    // Payment type opcional
    if (filtro_payment) queryBase = queryBase.eq('payment_type', filtro_payment);

    queryBase = queryBase.limit(limite).order('purchase_date', { ascending: false });

    const { data: transacoes, error: errT } = await queryBase;
    if (errT) throw new Error('transactions: ' + errT.message);
    if (!transacoes) throw new Error('transactions retornou null');

    if (transacoes.length === 0) {
      return jsonRespTool({
        ok: true,
        artifact_id: null,
        titulo_sugerido: `Hotmart · ${tipo_relatorio} · ${inicio.slice(2,7)}~${fim.slice(2,7)} · sem dados`,
        resumo: {
          n_transacoes: 0,
          mensagem: `Nenhuma transacao encontrada para o periodo ${inicio} a ${fim} com os filtros aplicados.`,
        },
        mensagem_para_llm: 'Nenhum dado encontrado. Reporte ao usuario que o periodo nao tem transacoes com os filtros aplicados — sugira ampliar periodo ou tirar filtros.',
      });
    }

    // ETAPA 2: enriquecer com produtos e buyers
    const productIds = [...new Set(transacoes.map((t: any) => t.product_id).filter(Boolean))];
    const buyerIds   = [...new Set(transacoes.map((t: any) => t.buyer_id).filter(Boolean))];

    const [{ data: produtosRaw }, { data: buyersRaw }] = await Promise.all([
      dash.from('hotmart_products').select('id, name, hotmart_product_id').in('id', productIds),
      tipo_relatorio === 'top_compradores'
        ? dash.from('hotmart_buyers').select('id, email, name, phone').in('id', buyerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const produtosMap = new Map<string, any>();
    for (const p of produtosRaw || []) produtosMap.set(p.id, p);
    const buyersMap = new Map<string, any>();
    for (const b of buyersRaw || []) buyersMap.set(b.id, b);

    // ETAPA 3: enriquece e calcula receita
    const linhasBrutas = transacoes.map((t: any) => {
      const prod = produtosMap.get(t.product_id);
      const buyer = buyersMap.get(t.buyer_id);
      return {
        transaction_code: t.transaction_code,
        status: t.status,
        payment_type: t.payment_type,
        price_value: Number(t.price_value || 0),
        receita: Number(t.my_commission || 0),  // REGRA DURA: my_commission, nao price_value
        is_order_bump: t.is_order_bump,
        purchase_date: t.purchase_date,
        refund_date: t.refund_date,
        produto_id: t.product_id,
        produto_nome: prod?.name || '(produto removido)',
        produto_hotmart_id: prod?.hotmart_product_id || null,
        buyer_id: t.buyer_id,
        buyer_email: buyer?.email || null,
        buyer_nome: buyer?.name || null,
        buyer_phone: buyer?.phone || null,
        data_referencia: tipo_relatorio === 'reembolsos' ? t.refund_date : t.purchase_date,
      };
    });

    // ETAPA 4: monta matrizes
    let cabecalho: string[] = [];
    let linhas: string[][] = [];
    let cabDetalhe: string[] = [];
    let linhasDetalhe: string[][] = [];
    let cabPivot: string[] = [];
    let linhasPivot: string[][] = [];

    // Helpers de chave de agrupamento
    function chaveAgrupamento(l: any): string {
      switch (agrupamento) {
        case 'produto':      return l.produto_nome;
        case 'dia':          return String(l.data_referencia || '').slice(0, 10);
        case 'mes':          return String(l.data_referencia || '').slice(0, 7);
        case 'status':       return l.status;
        case 'payment_type': return l.payment_type;
      }
      return '?';
    }
    function nomeColunaAgr(): string {
      const m: Record<string, string> = {
        produto: 'produto', dia: 'dia', mes: 'mes', status: 'status', payment_type: 'payment_type',
      };
      return m[agrupamento] || 'chave';
    }

    if (tipo_relatorio === 'vendas') {
      // LONG: agrupamento × (receita, n_vendas, ticket_medio, %_total)
      cabecalho = [nomeColunaAgr(), 'receita', 'n_vendas', 'ticket_medio', 'pct_receita'];
      const agg = new Map<string, { receita: number; n: number }>();
      for (const l of linhasBrutas) {
        const k = chaveAgrupamento(l);
        if (!agg.has(k)) agg.set(k, { receita: 0, n: 0 });
        const a = agg.get(k)!;
        a.receita += l.receita;
        a.n += 1;
      }
      const totalReceita = [...agg.values()].reduce((s, a) => s + a.receita, 0);
      const sorted = [...agg.entries()].sort((a, b) => b[1].receita - a[1].receita);
      for (const [chave, v] of sorted) {
        const ticket = v.n > 0 ? v.receita / v.n : 0;
        const pct = totalReceita > 0 ? (v.receita / totalReceita) * 100 : 0;
        linhas.push([chave, fmtBR(v.receita), String(v.n), fmtBR(ticket), fmtBR(pct)]);
      }
      // TOTAL
      linhas.push([
        'TOTAL',
        fmtBR(totalReceita),
        String(linhasBrutas.length),
        fmtBR(linhasBrutas.length > 0 ? totalReceita / linhasBrutas.length : 0),
        '100.00',
      ]);

      // PIVOT: produto × mes (so se agrupamento != mes/dia)
      if (agrupamento === 'produto') {
        const mesesSet = new Set<string>();
        const produtosSet = new Set<string>();
        const porPM = new Map<string, number>();
        for (const l of linhasBrutas) {
          const mes = String(l.data_referencia || '').slice(0, 7);
          const prod = l.produto_nome;
          mesesSet.add(mes);
          produtosSet.add(prod);
          const k = `${prod}|${mes}`;
          porPM.set(k, (porPM.get(k) || 0) + l.receita);
        }
        const meses = [...mesesSet].sort();
        const produtos = [...produtosSet].sort();
        cabPivot = ['produto', ...meses, 'TOTAL'];
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
            cols.push(fmtBR(v));
            totalMes.set(m, (totalMes.get(m) || 0) + v);
          }
          cols.push(fmtBR(t));
          linhasPivot.push(cols);
        }
        const linhaTotal = ['TOTAL'];
        let totalGeral = 0;
        for (const m of meses) {
          const v = totalMes.get(m) || 0;
          linhaTotal.push(fmtBR(v));
          totalGeral += v;
        }
        linhaTotal.push(fmtBR(totalGeral));
        linhasPivot.push(linhaTotal);
      }
    } else if (tipo_relatorio === 'reembolsos') {
      // LONG agrupado: receita perdida + n_reembolsos
      cabecalho = [nomeColunaAgr(), 'receita_perdida', 'n_reembolsos', 'ticket_medio'];
      const agg = new Map<string, { receita: number; n: number }>();
      for (const l of linhasBrutas) {
        const k = chaveAgrupamento(l);
        if (!agg.has(k)) agg.set(k, { receita: 0, n: 0 });
        const a = agg.get(k)!;
        a.receita += l.receita;
        a.n += 1;
      }
      const totalReceita = [...agg.values()].reduce((s, a) => s + a.receita, 0);
      const sorted = [...agg.entries()].sort((a, b) => b[1].receita - a[1].receita);
      for (const [chave, v] of sorted) {
        linhas.push([chave, fmtBR(v.receita), String(v.n), fmtBR(v.n > 0 ? v.receita / v.n : 0)]);
      }
      linhas.push(['TOTAL', fmtBR(totalReceita), String(linhasBrutas.length),
        fmtBR(linhasBrutas.length > 0 ? totalReceita / linhasBrutas.length : 0)]);
    } else if (tipo_relatorio === 'top_compradores') {
      cabecalho = ['email', 'nome', 'telefone', 'receita_total', 'n_compras', 'ticket_medio'];
      const agg = new Map<string, { receita: number; n: number; email: string; nome: string; phone: string }>();
      for (const l of linhasBrutas) {
        if (!l.buyer_email) continue;
        const k = l.buyer_email;
        if (!agg.has(k)) agg.set(k, { receita: 0, n: 0, email: l.buyer_email, nome: l.buyer_nome || '', phone: l.buyer_phone || '' });
        const a = agg.get(k)!;
        a.receita += l.receita;
        a.n += 1;
      }
      const sorted = [...agg.values()].sort((a, b) => b.receita - a.receita).slice(0, 200);
      for (const v of sorted) {
        linhas.push([v.email, v.nome, v.phone, fmtBR(v.receita), String(v.n), fmtBR(v.n > 0 ? v.receita / v.n : 0)]);
      }
    } else if (tipo_relatorio === 'ranking_produtos') {
      cabecalho = ['produto', 'receita', 'n_vendas', 'ticket_medio', 'pct_receita'];
      const agg = new Map<string, { receita: number; n: number }>();
      for (const l of linhasBrutas) {
        const k = l.produto_nome;
        if (!agg.has(k)) agg.set(k, { receita: 0, n: 0 });
        const a = agg.get(k)!;
        a.receita += l.receita;
        a.n += 1;
      }
      const totalReceita = [...agg.values()].reduce((s, a) => s + a.receita, 0);
      const sorted = [...agg.entries()].sort((a, b) => b[1].receita - a[1].receita);
      for (const [chave, v] of sorted) {
        const ticket = v.n > 0 ? v.receita / v.n : 0;
        const pct = totalReceita > 0 ? (v.receita / totalReceita) * 100 : 0;
        linhas.push([chave, fmtBR(v.receita), String(v.n), fmtBR(ticket), fmtBR(pct)]);
      }
      linhas.push(['TOTAL', fmtBR(totalReceita), String(linhasBrutas.length),
        fmtBR(linhasBrutas.length > 0 ? totalReceita / linhasBrutas.length : 0), '100.00']);
    }

    // ETAPA 5: matriz detalhe (sempre) — 1 linha por transacao
    cabDetalhe = ['data', 'produto', 'status', 'payment_type', 'receita', 'transaction_code', 'bump'];
    linhasDetalhe = linhasBrutas
      .slice()
      .sort((a: any, b: any) => String(b.data_referencia || '').localeCompare(String(a.data_referencia || '')))
      .map((l: any) => [
        String(l.data_referencia || '').slice(0, 10),
        l.produto_nome,
        l.status,
        l.payment_type,
        fmtBR(l.receita),
        l.transaction_code,
        l.is_order_bump ? 'sim' : 'nao',
      ]);

    // ETAPA 6: monta resumo curto pro LLM (top 3 + totais)
    const totalReceita = linhasBrutas.reduce((s: number, l: any) => s + l.receita, 0);
    const topAgrupado = new Map<string, number>();
    for (const l of linhasBrutas) {
      const k = chaveAgrupamento(l);
      topAgrupado.set(k, (topAgrupado.get(k) || 0) + l.receita);
    }
    const top3 = [...topAgrupado.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([chave, receita]) => ({ chave, receita: Number(receita.toFixed(2)) }));

    const previewCab = cabecalho;
    const previewLinhas = linhas.slice(0, 5);

    const resumoLlm = {
      tipo_relatorio,
      total_receita: Number(totalReceita.toFixed(2)),
      moeda,
      n_transacoes: linhasBrutas.length,
      periodo: { inicio, fim },
      agrupamento,
      top_3: top3,
      preview: { cabecalho: previewCab, linhas: previewLinhas },
    };

    // ETAPA 7: titulo curto pra base do nome da planilha
    const tipoLabel: Record<string, string> = {
      vendas: 'Receita',
      reembolsos: 'Reembolsos',
      top_compradores: 'Top Compradores',
      ranking_produtos: 'Ranking Produtos',
    };
    const agrLabel: Record<string, string> = {
      produto: 'por Produto', dia: 'por Dia', mes: 'por Mes',
      status: 'por Status', payment_type: 'por Pagamento',
    };
    const periodoCurto = inicio.slice(2, 7).replace('-', '/') + '~' + fim.slice(2, 7).replace('-', '/');
    const tituloArt = `Hotmart · ${tipoLabel[tipo_relatorio]} ${agrLabel[agrupamento]} · ${periodoCurto}`;

    // ETAPA 8: monta conteudo do artefato (com as 3 matrizes)
    const conteudoArtefato: any = {
      tipo_relatorio,
      periodo: { inicio, fim },
      agrupamento,
      moeda,
      filtros: {
        filtro_produto: filtro_produto || null,
        filtro_payment_type: filtro_payment || null,
        incluir_order_bump: incluir_bump,
      },
      resumo: resumoLlm,
      matriz_detalhe: { cabecalho: cabDetalhe, linhas: linhasDetalhe },
      matriz_long:    cabecalho.length > 0 ? { cabecalho, linhas } : null,
      matriz_pivot:   cabPivot.length > 0 ? { cabecalho: cabPivot, linhas: linhasPivot } : null,
    };

    // ETAPA 9: grava artefato em pinguim.artefatos (pattern Artifact)
    let artifact_id: string | null = null;
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        db: { schema: 'pinguim' },
      });
      const { data, error } = await sb.rpc('gravar_artefato', {
        p_cliente_id: cliente_id,
        p_agente_id: agente_id,
        p_tool_origem: 'tool-hotmart-gerar-relatorio',
        p_tipo: 'dataset-tabular',
        p_titulo: tituloArt,
        p_descricao: `Hotmart ${tipo_relatorio} ${inicio} a ${fim}, agrupamento=${agrupamento}, moeda=${moeda}`,
        p_schema_json: {
          tipo_relatorio,
          agrupamento,
          tem_pivot: cabPivot.length > 0,
          tem_long: cabecalho.length > 0,
          tem_detalhe: cabDetalhe.length > 0,
        },
        p_conteudo: conteudoArtefato,
        p_resumo_llm: resumoLlm,
      });
      if (error) throw new Error(error.message);
      artifact_id = data;
    } catch (e: any) {
      console.error('[hotmart-gerar-relatorio] falha gravando artefato:', e?.message);
    }

    // ETAPA 10: resposta enxuta pro LLM (~400 tokens)
    return jsonRespTool({
      ok: true,
      artifact_id,
      titulo_sugerido: tituloArt,
      resumo: resumoLlm,
      mensagem_para_llm: artifact_id
        ? `Dataset Hotmart gerado e salvo (artifact_id=${artifact_id}). PROXIMO PASSO: chame subir_planilha_drive passando este artifact_id pra subir a planilha no Drive do socio. NAO repita os dados na sua resposta — eles ja estao no artefato. Pasta sugerida: "Relatorios Pinguim/Hotmart".`
        : `Dataset gerado mas artefato falhou. Reporte erro ao usuario.`,
    });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
