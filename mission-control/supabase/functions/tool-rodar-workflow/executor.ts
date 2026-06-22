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
  campaign_ids?: string[]; // ids de campanha Meta selecionadas no modal
  top_criativos?: number; // qtos top ads detalhar (default 10)
  data_inicio?: string; // YYYY-MM-DD (sobrepõe periodo_dias se ambos presentes)
  data_fim?: string;
  modelo_estatistico_slug?: string | null;     // slug do modelo escolhido no modal
  modelo_estatistico_snapshot?: any | null;    // artefato congelado no momento do disparo
}

// ====================== MODELO ESTATÍSTICO ======================
// Renderiza bloco curto pra injetar no prompt dos analistas.
// Lê do snapshot pra ser imutável dentro da rodada (auditoria).
function blocoModeloEstatistico(snap: any): string {
  if (!snap || !snap.output_jsonb) return '';
  const out = snap.output_jsonb || {};
  const tipo = snap.tipo || 'modelo';
  const partes: string[] = [];
  partes.push(`[ANÁLISE ESTATÍSTICA — modelo: ${snap.slug} (${snap.titulo})]`);
  partes.push(`Tipo: ${tipo} · Versão: ${snap.versao}`);

  if (tipo === 'personas' && Array.isArray(out.personas)) {
    partes.push('\nPersonas dominantes (ordenadas por lift de conversão pra Elo):');
    // top 4 personas por lift
    const top = [...out.personas].sort((a: any, b: any) => (b.lift_elo || 0) - (a.lift_elo || 0)).slice(0, 4);
    for (const p of top) {
      partes.push(`• ${p.persona_nome} — n=${p.tamanho_cluster} (${p.pct_da_base}%), taxa Elo ${p.taxa_conversao_elo}%, lift ${p.lift_elo}x`);
      partes.push(`  Dor: ${p.dor_principal} — "${(p.dor_verbatim || [])[0] || ''}"`);
      partes.push(`  Objeção: ${p.objecao_principal} — "${(p.objecao_verbatim || [])[0] || ''}"`);
      partes.push(`  Expectativa: ${p.expectativa_principal} — "${(p.expectativa_verbatim || [])[0] || ''}"`);
      partes.push(`  Demografia dominante: ${p.perfil_demografico?.idade_dominante} · ${p.perfil_demografico?.genero_dominante} · ${p.perfil_demografico?.nicho_dominante}`);
    }
  } else if (tipo === 'lift') {
    partes.push('\n🔥 Ganchos quentes (lift ≥ 1.3, p < 0.05):');
    for (const g of (out.ganchos_quentes || []).slice(0, 8)) {
      partes.push(`• ${g.dimensao_label}=${g.categoria} → lift ${g.lift}x (taxa ${g.taxa_pct}%, n=${g.n})`);
    }
    partes.push('\n❄️ Anti-padrões (lift ≤ 0.7, p < 0.05):');
    for (const a of (out.anti_padroes || []).slice(0, 5)) {
      partes.push(`• ${a.dimensao_label}=${a.categoria} → lift ${a.lift}x (taxa ${a.taxa_pct}%, n=${a.n})`);
    }
  } else if (tipo === 'propensao') {
    partes.push('\n🎯 Perfil ideal a atrair (IC 95% lift > 1):');
    for (const p of (out.perfil_ideal || [])) {
      partes.push(`• ${p.feature} = ${p.valor} → score ${p.score_bayesiano}% (IC ${p.ic95_taxa_low}-${p.ic95_taxa_high}%) lift ${p.lift_score}x`);
    }
    if (Array.isArray(out.baixo_lift_significativo) && out.baixo_lift_significativo.length) {
      partes.push('\n⚠️ Anti-perfis significativos (não atacar):');
      for (const p of out.baixo_lift_significativo.slice(0, 5)) {
        partes.push(`• ${p.feature} = ${p.valor} → score ${p.score_bayesiano}% (IC lift ${p.ic95_lift_low}-${p.ic95_lift_high})`);
      }
    }
  } else if (tipo === 'solucao') {
    // Modelos de SOLUÇÃO — renderiza pergunta + ação pro analista (output orientado a dor)
    if (out.pergunta_que_responde) partes.push(`\nPergunta que este modelo responde: ${out.pergunta_que_responde}`);

    // Modelo "Trazer mais gente"
    if (Array.isArray(out.personas_alvo_volume)) {
      partes.push('\n🎯 Personas-alvo (volume):');
      for (const p of out.personas_alvo_volume) {
        partes.push(`• ${p.nome} — n=${p.tamanho} (${p.pct_da_base}% da base)`);
        if ((p.dor_verbatim || [])[0]) partes.push(`  Dor verbatim: "${p.dor_verbatim[0]}"`);
        if (p.demografia) partes.push(`  Demo: ${p.demografia.idade_dominante} · ${p.demografia.renda_dominante} · ${p.demografia.nicho_dominante}`);
      }
    }
    if (Array.isArray(out.ganchos_volumosos)) {
      partes.push('\n🔥 Ganchos de maior volume:');
      for (const g of out.ganchos_volumosos) partes.push(`• "${g.gancho}" — apareceu ${g.n_compradores}x · lift Elo ${g.lift_para_elo}x`);
    }
    if (Array.isArray(out.anti_padroes_queima_budget)) {
      partes.push('\n❄️ Anti-padrões (queima budget):');
      for (const a of out.anti_padroes_queima_budget) partes.push(`• ${a.perfil} — n=${a.n_compradores}, converte só ${a.taxa_elo}% (lift ${a.lift_para_elo}x)`);
    }

    // Modelo "Aumentar conversão Elo"
    if (Array.isArray(out.perfil_ideal_retargeting)) {
      partes.push('\n🎯 Perfil ideal pra retargeting:');
      for (const p of out.perfil_ideal_retargeting) partes.push(`• ${p.feature} = ${p.valor} → ${p.score_bayesiano}% conversão (IC ${p.ic95_taxa_low}-${p.ic95_taxa_high}%)`);
    }
    if (Array.isArray(out.personas_alta_conversao)) {
      partes.push('\n👥 Personas de alta conversão Elo:');
      for (const p of out.personas_alta_conversao) {
        partes.push(`• ${p.nome} — lift ${p.lift_elo}x, taxa ${p.taxa_elo}%`);
        if ((p.gancho_verbatim || [])[0]) partes.push(`  Gancho verbatim: "${p.gancho_verbatim[0]}"`);
      }
    }
    if (out.janela_tempo_para_elo) {
      partes.push(`\n⏱ Janela tempo: p50=${out.janela_tempo_para_elo.p50_dias}d (p25=${out.janela_tempo_para_elo.p25_dias}, p75=${out.janela_tempo_para_elo.p75_dias})`);
      partes.push(`  ${out.janela_tempo_para_elo.interpretacao}`);
    }
    if (out.sinal_order_bump) {
      partes.push(`\n💎 Order Bump: ${out.sinal_order_bump.pct_compradores}% adesão · ${out.sinal_order_bump.interpretacao}`);
    }

    // Modelo "Diagnóstico criativo"
    if (Array.isArray(out.perfis_armadilha)) {
      partes.push('\n⚠️ Perfis-armadilha (entram mas não convertem):');
      for (const p of out.perfis_armadilha) partes.push(`• ${p.nome} — n=${p.tamanho}, converte ${p.taxa_elo}% (lift ${p.lift_elo}x). ${p.observacao}`);
    }
    if (Array.isArray(out.ganchos_certos_pra_substituir)) {
      partes.push('\n✅ Ganchos certos pra substituir:');
      for (const g of out.ganchos_certos_pra_substituir) partes.push(`• ${g.dimensao_label} = ${g.categoria} → lift ${g.lift}x`);
    }

    // Ação pro analista — bloco mais valioso!
    if (out.acao_pro_analista) {
      partes.push('\n📋 RECOMENDAÇÃO PRONTA POR ÁREA (use isso direto no parecer):');
      for (const [area, txt] of Object.entries(out.acao_pro_analista)) {
        partes.push(`\n[${area.toUpperCase()}]\n${txt}`);
      }
    }
  }

  partes.push('\nINSTRUÇÃO: use esses padrões pra calibrar suas recomendações. Cite o número (lift, taxa, n) quando defender a recomendação — credibilidade vem do dado real.');
  return partes.join('\n');
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

async function coletarMetaAds(periodoDias: number, campaignIds: string[], topCriativos: number, dataInicio?: string, dataFim?: string) {
  // V2: usa as Edges tool-meta-listar-campanhas e tool-meta-detalhes-criativos.
  // Le do Dashboard externo (lkrehtmdqkgkyyotvjpz) ja sincronizado pelo cron Meta.
  const qsRange = (dataInicio && dataFim)
    ? `data_inicio=${dataInicio}&data_fim=${dataFim}`
    : `periodo_dias=${periodoDias}`;
  try {
    // 1) Lista TODAS campanhas (pra contexto agregado)
    const r1 = await fetch(`${SUPABASE_URL}/functions/v1/tool-meta-listar-campanhas?${qsRange}`, {
      headers: { 'x-internal-token': SUPABASE_SERVICE_ROLE_KEY },
    });
    if (!r1.ok) {
      return { ok: false, motivo: `listar_campanhas_${r1.status}`, dados: [] };
    }
    const j1 = await r1.json();
    if (!j1.ok) return { ok: false, motivo: j1.erro || 'erro_listar', dados: [] };

    // Filtra apenas campanhas selecionadas (se vier lista) ou as 5 de maior gasto
    let campanhasFoco = j1.campanhas;
    if (campaignIds && campaignIds.length > 0) {
      campanhasFoco = j1.campanhas.filter((c: any) => campaignIds.includes(c.entity_id));
    }
    if (campanhasFoco.length === 0) campanhasFoco = j1.campanhas.slice(0, 5);

    // 2) Pega criativos detalhados das selecionadas
    const idsParam = campanhasFoco.map((c: any) => c.entity_id).join(',');
    let criativos: any[] = [];
    if (idsParam) {
      const r2 = await fetch(`${SUPABASE_URL}/functions/v1/tool-meta-detalhes-criativos?campaign_ids=${idsParam}&${qsRange}&top=${topCriativos}`, {
        headers: { 'x-internal-token': SUPABASE_SERVICE_ROLE_KEY },
      });
      if (r2.ok) {
        const j2 = await r2.json();
        if (j2.ok) criativos = j2.criativos || [];
      }
    }

    // 3) Resumo agregado das campanhas selecionadas
    const tot = {
      spend: campanhasFoco.reduce((s: number, c: any) => s + c.spend, 0),
      revenue: campanhasFoco.reduce((s: number, c: any) => s + (c.revenue || 0), 0),
      impressions: campanhasFoco.reduce((s: number, c: any) => s + c.impressions, 0),
      clicks: campanhasFoco.reduce((s: number, c: any) => s + c.clicks, 0),
      purchases: campanhasFoco.reduce((s: number, c: any) => s + (c.purchases || 0), 0),
    };
    const roasAgg = tot.spend > 0 ? Number((tot.revenue / tot.spend).toFixed(2)) : 0;
    const ctrAgg = tot.impressions > 0 ? Number(((tot.clicks / tot.impressions) * 100).toFixed(2)) : 0;
    const cpaAgg = tot.purchases > 0 ? Number((tot.spend / tot.purchases).toFixed(2)) : 0;

    return {
      ok: true,
      periodo: { de: j1.data_inicio, ate: j1.data_fim, dias: periodoDias },
      contas: j1.contas,
      campanhas_selecionadas: campanhasFoco.map((c: any) => ({
        entity_id: c.entity_id,
        nome: c.entity_name,
        conta: c.conta_nome,
        spend: c.spend,
        impressions: c.impressions,
        reach: c.reach, // v0.37.17: alcance único
        frequency: c.frequency, // v0.37.17: frequência média ponderada (sinal de fadiga se >3)
        clicks: c.clicks,
        ctr: c.ctr,
        cpc: c.cpc,
        purchases: c.purchases,
        revenue: c.revenue,
        roas: c.roas,
        n_ads: c.n_ads,
      })),
      agregado: {
        spend: Number(tot.spend.toFixed(2)),
        revenue: Number(tot.revenue.toFixed(2)),
        roas: roasAgg,
        ctr: ctrAgg,
        cpa: cpaAgg,
        purchases: tot.purchases,
      },
      top_criativos: criativos.map((c: any) => ({
        ad_id: c.ad_id,
        nome: c.ad_name,
        midia: c.creative_media_type,
        spend: c.spend,
        impressions: c.impressions,
        reach: c.reach, // v0.37.17
        frequency: c.frequency, // v0.37.17 — alerta de fadiga
        clicks: c.clicks,
        purchases: c.purchases,
        revenue: c.revenue,
        ctr: c.ctr,
        cpc: c.cpc,
        roas: c.roas,
        hook_rate: c.hook_rate,
        hold_rate: c.hold_rate,
        // v0.37.17: copy COMPLETA (não cortar) — Andre quer ver tudo no card estilo Pinguinet
        copy: c.body || null,
        title: c.title,
        thumbnail_url: c.thumbnail_url || null,
        video_id: c.video_id || null,
        campaign_id: c.campaign_id || null,
        campaign_name: c.campaign_name || null,
        meta_business_url: c.meta_business_url || null,
        creative_id: c.creative_id || null,
      })),
    };
  } catch (e) {
    console.warn('[meta-ads] erro:', e?.message);
    return { ok: false, motivo: e?.message || 'erro', dados: [] };
  }
}

// v0.37.14: usa hotmart_transactions do Dashboard (tabela viva, 33k+ linhas).
// Produto Lo-fi UUID: 2fa35723-9b5e-41c6-9000-7bcafeb91b41
const PRODUTO_LOFI_UUID = '2fa35723-9b5e-41c6-9000-7bcafeb91b41';

// v0.37.16: FUNIL CONECTADO. Além do agregado, traz:
// - funil_por_criativo: aprovados+abandonos+taxa por src (criativo Meta de origem)
// - abandonos_nominais: nome+email+telefone+criativo origem (pra recuperação)
// Tudo numa única chamada (3 queries em paralelo).
function parseSrcHotmart(src: string | null): { tipo: string; campanha: string | null; adset: string | null; criativo: string | null } {
  if (!src) return { tipo: 'organico', campanha: null, adset: null, criativo: null };
  const partes = src.split(':||:');
  const limpa = (s: string) => s.replace(/\+/g, ' ').replace(/🟢\s*/g, '').trim();
  if (partes.length >= 4) {
    return {
      tipo: partes[0].toLowerCase().includes('facebookads') || partes[0].includes('TD-PAGO') ? 'meta_ads' : (partes[0] || 'outro'),
      campanha: limpa(partes[1]),
      adset: limpa(partes[2]),
      criativo: limpa(partes[3]),
    };
  }
  if (partes.length >= 2) {
    return { tipo: partes[0], campanha: null, adset: null, criativo: limpa(partes.slice(1).join(' / ')).slice(0, 80) };
  }
  return { tipo: 'sem_parse', campanha: null, adset: null, criativo: src.slice(0, 60) };
}

async function coletarCompradoresHotmart(_produtoSlug: string, periodoDias: number, dataInicio?: string, dataFim?: string) {
  try {
    const dashRef = await getChave('DASHBOARD_PROJECT_REF', 'tool-rodar-workflow');
    const dashTok = await getChave('DASHBOARD_ACCESS_TOKEN', 'tool-rodar-workflow');

    let sinceIso: string, toIso: string;
    if (dataInicio && dataFim) {
      sinceIso = dataInicio;
      toIso = dataFim;
    } else {
      const ds = new Date();
      ds.setDate(ds.getDate() - periodoDias);
      sinceIso = ds.toISOString().slice(0, 10);
      toIso = new Date().toISOString().slice(0, 10);
    }

    async function sql(q: string) {
      const r = await fetch(`https://api.supabase.com/v1/projects/${dashRef}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dashTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!r.ok) throw new Error(`dashboard_${r.status}`);
      return r.json();
    }

    // Query 1: agregado por status (mantém comportamento atual)
    const q1 = `
      SELECT status, COUNT(*) AS total, SUM(price_value::numeric) AS receita
      FROM hotmart_transactions
      WHERE product_id = '${PRODUTO_LOFI_UUID}'
        AND purchase_date >= '${sinceIso}'
        AND purchase_date < ('${toIso}'::date + INTERVAL '1 day')
      GROUP BY status
    `;

    // Query 2: transações com src+sck (pra montar funil por criativo)
    const q2 = `
      SELECT status, src, sck, price_value::numeric AS valor
      FROM hotmart_transactions
      WHERE product_id = '${PRODUTO_LOFI_UUID}'
        AND purchase_date >= '${sinceIso}'
        AND purchase_date < ('${toIso}'::date + INTERVAL '1 day')
    `;

    // Query 3: ABANDONOS NOMINAIS com dados do comprador
    const q3 = `
      SELECT t.transaction_code, t.status, t.price_value::numeric AS valor,
             t.payment_type, t.purchase_date, t.src, t.sck,
             b.name AS buyer_name, b.email AS buyer_email, b.phone AS buyer_phone
      FROM hotmart_transactions t
      LEFT JOIN hotmart_buyers b ON b.id = t.buyer_id
      WHERE t.product_id = '${PRODUTO_LOFI_UUID}'
        AND t.purchase_date >= '${sinceIso}'
        AND t.purchase_date < ('${toIso}'::date + INTERVAL '1 day')
        AND t.status IN ('expired','waiting_payment','billet_printed','canceled','cancelled')
      ORDER BY t.purchase_date DESC
      LIMIT 50
    `;

    const [rows1, rows2, rows3] = await Promise.all([sql(q1), sql(q2), sql(q3)]) as any[];

    // ─── Agregado ───
    let aprovadas = 0, completed = 0, expired = 0, waiting = 0, canceladas = 0, refunded = 0;
    let receitaAprovada = 0;
    for (const row of rows1 || []) {
      const n = Number(row.total || 0);
      const rec = Number(row.receita || 0);
      if (row.status === 'approved') { aprovadas += n; receitaAprovada += rec; }
      else if (row.status === 'completed') { completed += n; receitaAprovada += rec; }
      else if (row.status === 'expired') expired += n;
      else if (row.status === 'waiting_payment' || row.status === 'billet_printed') waiting += n;
      else if (row.status === 'canceled' || row.status === 'cancelled') canceladas += n;
      else if (row.status === 'refunded' || row.status === 'chargeback') refunded += n;
    }
    const totalCompras = aprovadas + completed;
    const totalAbandonos = expired + waiting + canceladas;
    const taxaConversaoCheckout = (totalCompras + totalAbandonos) > 0
      ? +(totalCompras / (totalCompras + totalAbandonos) * 100).toFixed(1)
      : null;

    // ─── Funil por criativo (parseando src) ───
    const mapFunil: Record<string, { criativo: string; campanha_meta: string | null; aprovados: number; abandonos: number; receita: number }> = {};
    for (const r of (rows2 || [])) {
      const parsed = parseSrcHotmart(r.src);
      const key = parsed.criativo || 'sem_origem';
      if (!mapFunil[key]) mapFunil[key] = { criativo: key, campanha_meta: parsed.campanha, aprovados: 0, abandonos: 0, receita: 0 };
      const valor = Number(r.valor || 0);
      if (r.status === 'approved' || r.status === 'completed') { mapFunil[key].aprovados += 1; mapFunil[key].receita += valor; }
      else if (['expired', 'waiting_payment', 'billet_printed', 'canceled', 'cancelled'].includes(r.status)) mapFunil[key].abandonos += 1;
    }
    const funil_por_criativo = Object.values(mapFunil)
      .map((f: any) => {
        const total = f.aprovados + f.abandonos;
        const taxa = total > 0 ? +(f.aprovados / total * 100).toFixed(1) : null;
        // Recomendação
        let recomendacao = 'manter';
        if (taxa !== null && taxa >= 75 && total >= 3) recomendacao = 'ESCALAR';
        else if (taxa !== null && taxa <= 50 && f.abandonos >= 2) recomendacao = 'PAUSAR_OU_TROCAR';
        else if (taxa !== null && taxa > 50 && taxa < 75) recomendacao = 'VARIAR';
        return { ...f, taxa_conversao_pct: taxa, total_iniciaram: total, receita: +f.receita.toFixed(2), recomendacao };
      })
      .filter((f: any) => f.criativo !== 'sem_origem')
      .sort((a: any, b: any) => b.total_iniciaram - a.total_iniciaram);

    // ─── Abandonos nominais ───
    const abandonos_nominais = (rows3 || []).map((r: any) => {
      const parsed = parseSrcHotmart(r.src);
      return {
        transaction_code: r.transaction_code,
        nome: r.buyer_name || '(sem nome)',
        email: r.buyer_email || null,
        telefone: r.buyer_phone || null,
        valor: Number(r.valor || 0),
        status: r.status,
        payment_type: r.payment_type,
        data: r.purchase_date,
        criativo_origem: parsed.criativo,
        campanha_origem: parsed.campanha,
        sck: r.sck,
      };
    });

    return {
      ok: true,
      periodo: { de: sinceIso, ate: toIso },
      produto: 'desafio_lofi',
      total_compras_aprovadas: totalCompras,
      receita_total: +receitaAprovada.toFixed(2),
      total_abandonos: totalAbandonos,
      breakdown: { aprovadas, completed, expired, waiting_payment_ou_billet: waiting, canceladas, refunded },
      taxa_conversao_checkout_pct: taxaConversaoCheckout,
      // v0.37.16: novos campos
      funil_por_criativo,
      abandonos_nominais,
    };
  } catch (e: any) {
    return { ok: false, motivo: e?.message || 'erro_dashboard' };
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
    // v0.37.14: título e meta vêm em first.metadata.* (não em first.title direto)
    const titulo = first?.metadata?.title || first?.title || '';
    const metaDesc = first?.metadata?.description || '';
    const keywords = first?.metadata?.keywords || '';
    const ogTitle = (first?.metadata?.openGraph || []).find((o: any) => o.property === 'og:title')?.content || '';
    const ogDesc = (first?.metadata?.openGraph || []).find((o: any) => o.property === 'og:description')?.content || '';
    return {
      ok: true,
      url,
      titulo,
      og_title: ogTitle,
      og_description: ogDesc,
      meta_description: metaDesc,
      keywords,
      texto: (first?.text || '').slice(0, 8000),
      texto_total_chars: (first?.text || '').length,
    };
  } catch (e: any) {
    return { ok: false, motivo: e?.message || 'erro_scrap' };
  }
}

// v0.37.14: carrinho abandonado via hotmart_transactions com status='expired'/'waiting_payment'/'canceled'.
// Mais honesto que tabela hotmart_cart_abandonment (vazia — webhook PURCHASE_OUT_OF_SHOPPING_CART nao configurado).
async function coletarCarrinhoAbandonado(periodoDias: number, dataInicio?: string, dataFim?: string) {
  // Reusa coletarCompradoresHotmart que já traz breakdown de status.
  const compradores = await coletarCompradoresHotmart('desafio-de-conte-do-lo-fi', periodoDias, dataInicio, dataFim);
  if (!compradores.ok) return { ok: false, motivo: compradores.motivo };

  const total_abandonos = compradores.total_abandonos || 0;
  const total_compras = compradores.total_compras_aprovadas || 0;
  const taxa_conversao_checkout = compradores.taxa_conversao_checkout_pct;

  return {
    ok: true,
    periodo: compradores.periodo,
    total_abandonos,
    total_compras,
    breakdown: compradores.breakdown,
    taxa_conversao_checkout_pct: taxa_conversao_checkout,
    metodo_coleta: 'hotmart_transactions com status expired/waiting/canceled',
  };
}

async function coletarDataHub(workflow: Workflow, inputs: Inputs, sb: any) {
  const slug = 'desafio-de-conte-do-lo-fi'; // V1 hard-coded; futuro: vem do produto_id
  const campIds = inputs.campaign_ids || [];
  const topCriativos = inputs.top_criativos || 10;
  const [metaAds, compradores, pagina, abandono] = await Promise.all([
    coletarMetaAds(inputs.periodo_dias, campIds, topCriativos, inputs.data_inicio, inputs.data_fim),
    coletarCompradoresHotmart(slug, inputs.periodo_dias, inputs.data_inicio, inputs.data_fim),
    inputs.url_pagina ? scrapPaginaVenda(inputs.url_pagina) : Promise.resolve({ ok: false, motivo: 'sem_url' }),
    coletarCarrinhoAbandonado(inputs.periodo_dias, inputs.data_inicio, inputs.data_fim),
  ]);

  // v0.37.17: TAXA LP INFERIDA — se tem página + tem Meta + tem compradores, calcula heurística
  // Lógica: assumindo que essas campanhas todas levam pra essa URL, vendas / cliques = taxa LP aproximada
  if (pagina?.ok && metaAds?.ok && compradores?.ok) {
    const totalCliques = Number(metaAds.agregado?.clicks || 0)
      || (metaAds.campanhas_selecionadas || []).reduce((s: number, c: any) => s + Number(c.clicks || 0), 0);
    const totalVendas = Number(compradores.total_compras_aprovadas || 0);
    const totalIniciaramCheckout = totalVendas + Number(compradores.total_abandonos || 0);
    if (totalCliques > 0 && totalIniciaramCheckout > 0) {
      // Taxa "click → checkout iniciado" — proxy honesto pra LP conversion
      const taxaLp = +(totalIniciaramCheckout / totalCliques * 100).toFixed(2);
      (pagina as any).taxa_conversao_lp_inferida_pct = taxaLp;
      (pagina as any).taxa_conversao_lp_metodo = `Inferida: (${totalIniciaramCheckout} pessoas iniciaram checkout) / (${totalCliques} cliques nas campanhas que apontam pra essa URL no período). Assume que as campanhas selecionadas levam pra essa URL.`;
    }
  }

  // v0.37.19: APIFY AD LIBRARY — pega URL HD do vídeo + thumbnail bom + body completo de cada criativo
  // Faz UMA chamada por rodada (cache 24h em pinguim.ads_library_cache).
  if (metaAds?.ok && Array.isArray(metaAds.top_criativos) && metaAds.top_criativos.length > 0) {
    try {
      const creativesInput = metaAds.top_criativos
        .filter((c: any) => c.creative_id || c.ad_id)
        .map((c: any) => ({
          creative_id: c.creative_id,
          ad_id: c.ad_id,
          ad_name: c.nome || c.ad_name,
          body_match: c.copy_atual || c.copy || c.title_atual || c.title,
        }));
      if (creativesInput.length > 0) {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/tool-meta-ads-library`, {
          method: 'POST',
          headers: {
            'x-internal-token': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ creatives: creativesInput }),
        });
        const j = await r.json();
        if (j.ok && Array.isArray(j.creatives)) {
          // Index por ad_id
          const enrichMap = new Map<string, any>();
          for (const c of j.creatives) enrichMap.set(c.ad_id, c);
          // Enriquece top_criativos
          metaAds.top_criativos = metaAds.top_criativos.map((c: any) => {
            const e = enrichMap.get(c.ad_id);
            if (!e) return c;
            return {
              ...c,
              // Override com dados da Ad Library quando disponível
              has_video_lib: e.has_video,
              video_hd_url: e.video_hd_url,
              video_sd_url: e.video_sd_url,
              video_preview_image_url: e.video_preview_image_url,
              image_url_lib: e.image_url,
              // Mantém thumbnail original como fallback
              thumbnail_url: e.video_preview_image_url || e.image_url || c.thumbnail_url,
              // Body completo da Ad Library (geralmente melhor que o do criativos_info)
              copy_full_lib: e.body_completo,
              title_lib: e.title_completo,
              cta_text: e.cta_text,
              link_url_lib: e.link_url,
              ad_library_url: e.ad_library_url,
              match_lib_confianca: e.match_confianca,
            };
          });
          console.log('[ads-library] enriquecidos:', j.creatives.length, '| page_id:', j.page_id, '| cache_hit:', j.cache_hit);
        } else {
          console.warn('[ads-library] falhou:', j.erro);
        }
      }
    } catch (e: any) {
      console.warn('[ads-library] exception:', e.message);
    }
  }

  return { meta_ads: metaAds, compradores, pagina, carrinho_abandonado: abandono, periodo_dias: inputs.periodo_dias, data_inicio: inputs.data_inicio, data_fim: inputs.data_fim };
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

async function chamarLLM(modelo: string, systemPrompt: string, userPrompt: string, useJson = true, opts: { maxTokens?: number; retries?: number } = {}): Promise<{ resp: string; tokens_in: number; tokens_out: number }> {
  const openaiKey = await getChave('OPENAI_API_KEY', 'tool-rodar-workflow');
  const ehGpt5 = modelo.startsWith('gpt-5');
  const maxTokens = opts.maxTokens ?? (ehGpt5 ? 4000 : 1800);
  const maxRetries = opts.retries ?? 1;

  const body: any = {
    model: modelo,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (ehGpt5) {
    body.max_completion_tokens = maxTokens;
    body.reasoning_effort = 'low';
  } else {
    body.max_tokens = maxTokens;
    body.temperature = 0.4;
  }
  if (useJson) body.response_format = { type: 'json_object' };

  let tentativa = 0;
  let lastResp: any = null;
  let totalIn = 0, totalOut = 0;
  while (tentativa <= maxRetries) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || '';
    totalIn += j.usage?.prompt_tokens || 0;
    totalOut += j.usage?.completion_tokens || 0;
    lastResp = j;
    if (content) {
      return { resp: content, tokens_in: totalIn, tokens_out: totalOut };
    }
    // resposta vazia — tenta de novo aumentando o budget
    console.warn(`[chamarLLM] resposta VAZIA tentativa ${tentativa+1}/${maxRetries+1} | modelo=${modelo} | finish=${j.choices?.[0]?.finish_reason} | tokens=${JSON.stringify(j.usage)} | aumentando budget`);
    body[ehGpt5 ? 'max_completion_tokens' : 'max_tokens'] = Math.min(maxTokens * 2, 12000);
    tentativa++;
  }
  return { resp: '', tokens_in: totalIn, tokens_out: totalOut };
}

// ====================== CAMADA 2: ANALISTAS ======================

// v0.37.21: Monta payload FOCADO POR ÁREA — analista só vê o que importa pra ele
// Antes: cada analista recebia JSON gigante e Halbert literalmente não via a página
// (Meta Ads tomava os 6000 chars antes de chegar na pagina)
function montarPayloadDaArea(area: string, dataHub: any): string {
  const slug = (area || '').toLowerCase();

  // PÁGINA / COPY → recebe SÓ a página completa + persona + métricas-resumo do funil
  if (slug === 'pagina' || slug.includes('copy')) {
    const p = dataHub?.pagina;
    const resumoFunil = {
      taxa_conversao_lp_inferida_pct: p?.taxa_conversao_lp_inferida_pct ?? null,
      benchmark_lp_pct: '3-8% pra infoproduto BR',
      total_compras_aprovadas: dataHub?.compradores?.total_compras_aprovadas ?? null,
      total_abandonos_checkout: dataHub?.compradores?.total_abandonos ?? null,
      total_cliques_meta: dataHub?.meta_ads?.agregado?.clicks ?? null,
    };
    if (!p?.ok) {
      return `❌ PÁGINA NÃO CAPTURADA: ${p?.motivo || 'sem URL ou scraping falhou'}.
Resumo do funil:
${JSON.stringify(resumoFunil, null, 2)}
Sem texto pra analisar — declare hipóteses de teste mínimo baseado no resumo.`;
    }
    return `📄 PÁGINA DE VENDA — análise CRÍTICA, este é o seu domínio:

URL: ${p.url}
Título da aba: ${p.titulo || '(vazio)'}
Meta description: ${p.meta_description || '(vazio)'}
OG title: ${p.og_title || '(vazio)'}
OG description: ${p.og_description || '(vazio)'}
Keywords: ${p.keywords || '(vazio)'}

═══════════════════════════════════════════════════════════
TEXTO COMPLETO DA PÁGINA (${p.texto_total_chars || 0} chars no total):
═══════════════════════════════════════════════════════════
${(p.texto || '').slice(0, 7000)}
═══════════════════════════════════════════════════════════

MÉTRICAS DO FUNIL (contexto pra calibrar gravidade dos achados):
${JSON.stringify(resumoFunil, null, 2)}

Sua análise: leia o texto INTEIRO da página. Aplique seu método (Halbert: AIDA, abertura, prova; Schwartz: níveis de consciência, mecanismo; Hormozi: oferta + valor percebido; Carlton: voz do cliente; Bencivenga: prova; Kennedy: urgência). Aponte problemas ESPECÍFICOS citando trechos LITERAIS da página entre aspas. Não invente — só comente o que está REALMENTE escrito ali.`;
  }

  // META ADS / CRIATIVO → recebe Meta agregado + top criativos com copy
  if (slug === 'meta-ads' || slug === 'criativo' || slug === 'campanha') {
    const m = dataHub?.meta_ads;
    if (!m?.ok) return `❌ META ADS NÃO DISPONÍVEL: ${m?.motivo || 'integração caiu'}`;
    const focado = {
      periodo: dataHub.periodo_dias + ' dias',
      agregado: m.agregado,
      campanhas: (m.campanhas_selecionadas || []).slice(0, 15).map((c: any) => ({
        nome: c.nome,
        spend: c.spend,
        clicks: c.clicks,
        purchases: c.purchases,
        ctr: c.ctr,
        roas: c.roas,
        frequency: c.frequency,
        reach: c.reach,
      })),
      top_criativos: (m.top_criativos || []).slice(0, 10).map((c: any) => ({
        ad_name: c.nome,
        campaign: c.campaign_name,
        spend: c.spend,
        ctr: c.ctr,
        roas: c.roas,
        hook_rate: c.hook_rate,
        hold_rate: c.hold_rate,
        frequency: c.frequency,
        copy: c.copy_full_lib || c.copy,
      })),
      hotmart_atribuido: {
        vendas_aprovadas: dataHub?.compradores?.total_compras_aprovadas,
        abandonos: dataHub?.compradores?.total_abandonos,
      },
    };
    return `📊 META ADS — análise CRÍTICA, este é o seu domínio:
${JSON.stringify(focado, null, 2).slice(0, 6500)}`;
  }

  // OFERTA → recebe página (oferta vive na página) + checkout
  if (slug === 'oferta') {
    const p = dataHub?.pagina;
    const focado = {
      pagina_url: p?.url,
      pagina_titulo: p?.titulo,
      texto_pagina_completo: (p?.texto || '').slice(0, 6000),
      hotmart: {
        ticket_medio: dataHub?.compradores?.receita_total && dataHub?.compradores?.total_compras_aprovadas
          ? +(dataHub.compradores.receita_total / dataHub.compradores.total_compras_aprovadas).toFixed(2)
          : null,
        total_aprovadas: dataHub?.compradores?.total_compras_aprovadas,
        total_abandonos: dataHub?.compradores?.total_abandonos,
        taxa_checkout_pct: dataHub?.compradores?.taxa_conversao_checkout_pct,
      },
    };
    return `💰 OFERTA DE ENTRADA — análise CRÍTICA, este é o seu domínio:
${JSON.stringify(focado, null, 2)}`;
  }

  // FUNIL / CONVERSAO → resumo agregado dos 4 elementos
  if (slug === 'funil' || slug === 'conversao') {
    const resumo = {
      cliques_meta: dataHub?.meta_ads?.agregado?.clicks,
      checkouts_iniciados: (dataHub?.compradores?.total_compras_aprovadas || 0) + (dataHub?.compradores?.total_abandonos || 0),
      vendas_aprovadas: dataHub?.compradores?.total_compras_aprovadas,
      abandonos: dataHub?.compradores?.total_abandonos,
      taxa_lp_inferida_pct: dataHub?.pagina?.taxa_conversao_lp_inferida_pct,
      taxa_checkout_pct: dataHub?.compradores?.taxa_conversao_checkout_pct,
      roas: dataHub?.meta_ads?.agregado?.roas,
      ctr_medio: dataHub?.meta_ads?.agregado?.ctr,
      benchmark: { ctr_meta_pct: '1.8-2.5', lp_pct: '3-8', checkout_pct: '75-85', roas_frio: '1.5-2.5' },
    };
    return `🔗 FUNIL/CONVERSÃO — análise CRÍTICA, este é o seu domínio:
${JSON.stringify(resumo, null, 2)}

Compare cada etapa com o benchmark. Aponte qual etapa é o gargalo PRIMÁRIO.`;
  }

  // Fallback: payload genérico cortado
  return `Dados gerais:\n${JSON.stringify(dataHub, null, 2).slice(0, 5000)}`;
}

async function rodarAnalista(area: string, especialistaSlug: string, dataHub: any, persona: any, modelo: string, sb: any, modeloEstSnap?: any): Promise<any> {
  // Busca o clone/agente especialista pra usar voz/método dele
  const { data: agente } = await sb.from('agentes')
    .select('nome, missao, system_prompt')
    .eq('slug', especialistaSlug)
    .single();
  const personaBloco = blocoPersonaCompacto(persona);
  const modeloEstBloco = blocoModeloEstatistico(modeloEstSnap);
  const nome = agente?.nome || especialistaSlug;

  // v0.37.21: usa system_prompt COMPLETO do agente (antes só usava .missao.slice(0,300) — perdia voz/método)
  const systemPromptDoAgente = (agente?.system_prompt || agente?.missao || '').toString();

  const systemPrompt = `${systemPromptDoAgente}

═══════════════════════════════════════════════════════════
CONTEXTO DESTA ANÁLISE
═══════════════════════════════════════════════════════════
Você está sendo chamado pra análise específica da área "${area}" do funil de venda do Desafio Lo-fi (produto da Pinguim — Micha Menezes). Problema: anúncio gasta mas pouca gente compra ingresso (R$29-49 ticket médio).

${personaBloco}
${modeloEstBloco ? '\n' + modeloEstBloco : ''}

Sua análise deve ser ESPECÍFICA pra sua área (${area}), no SEU MÉTODO/VOZ — ou seja, fale como ${nome} falaria, aplicando o framework pelo qual você é conhecido.

Devolva JSON com este schema EXATO:
{
  "achados": [
    {"titulo": "...", "evidencia": "trecho literal citado entre aspas ou número específico", "severidade": "alta|media|baixa", "confianca": 0.0}
  ],
  "diagnostico": "1-2 paragrafos no SEU estilo",
  "acoes_sugeridas": [
    {"titulo": "...", "descricao": "...", "prioridade": 1, "impacto_esperado": "..."}
  ]
}

REGRAS DURAS:
- Cada "achado" DEVE ter "evidencia" com trecho LITERAL ou número específico do payload. Se não tem evidência, não cite o achado.
- Mínimo 2 achados, mínimo 1 ação. Se realmente não achou nada, declare HIPÓTESE com teste mínimo (R$50, 48h).
- NUNCA diga "sem dado" se a página foi capturada. A página está abaixo — LEIA.`;

  const userPrompt = `${montarPayloadDaArea(area, dataHub)}

Sua tarefa: analise ESTE conteúdo pelo seu método. Devolva JSON estruturado.`;

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
  const modeloEstSnap = inputs.modelo_estatistico_snapshot || null;

  // Se nao escolheu, usa defaults
  const areas = workflow.config.areas || [];
  const tarefas: Promise<any>[] = [];
  for (const area of areas) {
    const slugs = (escolhidos[area.slug] && escolhidos[area.slug].length > 0)
      ? escolhidos[area.slug]
      : (area.defaults || []);
    for (const slug of slugs) {
      tarefas.push(rodarAnalista(area.slug, slug, dataHub, persona, modelo, sb, modeloEstSnap));
    }
  }
  return await Promise.all(tarefas);
}

// ====================== VALIDADOR DETERMINÍSTICO (v0.37.15) ======================
// 4 regras duras que NÃO podem passar pro usuário. Custo $0, infalível.
// Conselheiros: LLM-as-judge tem anchoring bias (mesmo modelo concorda com si mesmo).
// Logo: validação de magnitude/contradição é if/else, não prompt.
async function validarECorrigirDeterministico(sintese: any, dataHub: any): Promise<{
  log: string[];
  deve_chamar_revisor_llm: boolean;
}> {
  const log: string[] = [];
  if (!sintese || sintese.erro_parse) {
    return { log: ['sintese vazia/inválida — pulando validação'], deve_chamar_revisor_llm: false };
  }

  const matriz: any[] = Array.isArray(sintese.matriz_oportunidade) ? sintese.matriz_oportunidade : [];
  const acoes: any[] = Array.isArray(sintese.acoes_sequenciais) ? sintese.acoes_sequenciais : [];

  // Helper: ações que tocam elemento X (lê tanto m.acoes_idx[] quanto a.elemento)
  const acoesDoElemento = (elemento: string): number[] => {
    const el = elemento.toLowerCase();
    // Caminho 1: matriz declara acoes_idx
    const m = matriz.find((x: any) => (x.elemento || '').toLowerCase() === el);
    if (m && Array.isArray(m.acoes_idx) && m.acoes_idx.length > 0) return m.acoes_idx;
    // Caminho 2: ações declaram elemento
    return acoes
      .map((a: any, i: number) => ({ a, i }))
      .filter(({ a }) => (a.elemento || a.alvo_elemento || '').toLowerCase() === el)
      .map(({ i }) => i);
  };

  // ============ R1: headroom_pct > 0 EXIGE pelo menos 1 ação ============
  for (const m of matriz) {
    const el = (m.elemento || '').toLowerCase();
    const hr = Number(m.headroom_pct || 0);
    const idxs = acoesDoElemento(el);
    if (hr > 0 && idxs.length === 0) {
      // Reprovado: força status=saudavel + headroom=0 (não inventa ação)
      log.push(`R1 violada: ${el} tem headroom ${hr}% mas zero ações. Forçando saudavel/0%.`);
      m.headroom_pct = 0;
      m.status = 'saudavel';
      m.racional_calculo = `${m.racional_calculo || ''}\n\n⚠ VALIDADOR: LLM reportou ${hr}% de headroom mas não gerou nenhuma ação correspondente. Headroom forçado a 0% (não é honesto prometer ganho sem caminho concreto).`;
    }
  }

  // ============ R2: abandono > 0 EXIGE ação de recuperação no Checkout ============
  const totalAbandonos = Number(dataHub?.compradores?.total_abandonos || 0);
  const idxsCheckout = acoesDoElemento('checkout');
  if (totalAbandonos > 0 && idxsCheckout.length === 0) {
    log.push(`R2 violada: ${totalAbandonos} abandonos no Hotmart mas zero ações no Checkout. Injetando ação de recuperação determinística.`);
    const abandonosNominais = dataHub?.compradores?.abandonos_nominais || [];
    const acaoRecuperacao = {
      id_ordem: acoes.length + 1,
      titulo: 'Recuperar carrinhos abandonados via WhatsApp + email',
      elemento: 'checkout',
      subtipo: 'recuperacao_checkout',
      descricao: `O período tem ${totalAbandonos} pessoas que iniciaram compra mas não pagaram (boleto/pix expirado, billet não impresso ou waiting_payment). Cada um vale ${(Number(dataHub?.compradores?.receita_total || 0) / Math.max(1, Number(dataHub?.compradores?.total_compras_aprovadas || 0))).toFixed(0)} BRL em ticket médio. Aciona régua: (1) WhatsApp em até 2h após abandono com oferta clara + link de pagamento; (2) email de seguimento em 24h com bônus de urgência; (3) último contato em 72h com desconto pequeno.`,
      impacto_esperado: `Recuperar 20-30% dos ${totalAbandonos} abandonos = ${Math.round(totalAbandonos * 0.25)} vendas extras sem aumentar mídia.`,
      racional_calculo: `Benchmark Hotmart Brasil: régua de recuperação bem feita recupera 20-30% dos abandonos pagos. Aplicado em ${totalAbandonos} pessoas no período.`,
      sugerido_por: 'validador_deterministico',
      confianca: 'ALTA',
      n: totalAbandonos,
      prioridade: 1,
      // v0.37.16: lista nominal pra frontend mostrar tabela + export CSV
      abandonos_nominais: abandonosNominais,
    };
    acoes.unshift(acaoRecuperacao);
    sintese.acoes_sequenciais = acoes;
    // Atualiza headroom do Checkout pra refletir oportunidade real
    let mCheckout = matriz.find((x: any) => (x.elemento || '').toLowerCase() === 'checkout');
    if (!mCheckout) {
      mCheckout = { elemento: 'checkout', status: 'medio', headroom_pct: 0, acoes_idx: [] };
      matriz.push(mCheckout);
    }
    const ganhoAbandonos = Math.min(8, Math.round((totalAbandonos * 0.25 / Math.max(1, Number(dataHub?.compradores?.total_compras_aprovadas || 1))) * 100));
    mCheckout.headroom_pct = Math.max(Number(mCheckout.headroom_pct || 0), ganhoAbandonos);
    mCheckout.status = mCheckout.headroom_pct >= 5 ? 'medio' : 'medio';
    mCheckout.acoes_idx = [0, ...(mCheckout.acoes_idx || []).map((i: number) => i + 1)];
    mCheckout.racional_calculo = `${mCheckout.racional_calculo || ''}\n\n⚠ VALIDADOR: ${totalAbandonos} abandonos detectados na Hotmart. Ação de recuperação injetada (Hotmart benchmark 20-30% recovery rate).`;
    // v0.37.17: sobrescreve resumo_curto e fonte_calculo pra refletir o estado pós-validação (não deixar mensagem "sem dado" antiga)
    const ticketMedio = Number(dataHub?.compradores?.receita_total || 0) / Math.max(1, Number(dataHub?.compradores?.total_compras_aprovadas || 0));
    mCheckout.resumo_curto = `${totalAbandonos} abandonos no período — potencial de recuperação ~${Math.round(totalAbandonos * 0.25)} vendas (R$${(Math.round(totalAbandonos * 0.25) * ticketMedio).toFixed(0)})`;
    mCheckout.fonte_calculo = `Hotmart transactions com status expired/waiting_payment/billet_printed/canceled cruzado com hotmart_buyers (lista nominal disponível)`;
    mCheckout.n_observacoes = totalAbandonos;
    mCheckout.confianca = 'ALTA';
    mCheckout.metrica_chave = mCheckout.metrica_chave || {
      nome: 'Carrinhos abandonados (gente que iniciou compra e não pagou)',
      valor_atual: `${totalAbandonos} no período`,
      valor_potencial: `Recuperar ~${Math.round(totalAbandonos * 0.25)} (20-30% benchmark Hotmart BR)`,
    };
    // Re-indexa acoes_idx em todos os elementos (a injeção no topo desloca todos os índices em +1)
    for (const m of matriz) {
      if (m === mCheckout) continue;
      m.acoes_idx = (m.acoes_idx || []).map((i: number) => i + 1);
    }
    // Renumera id_ordem
    acoes.forEach((a: any, i: number) => { a.id_ordem = i + 1; });
  }

  // ============ R3: Contradição "desligar campanha X + criar criativo pra X" ============
  // Index ações por entity_id e ad_id de campanha
  const acoesPorCampanha: Record<string, { desligar: number[]; criar: number[] }> = {};
  acoes.forEach((a: any, i: number) => {
    const sub = (a.subtipo || '').toLowerCase();
    const camp = a.entity_id || a.campaign_id || a.alvo_entity_id || null;
    if (!camp) return;
    if (!acoesPorCampanha[camp]) acoesPorCampanha[camp] = { desligar: [], criar: [] };
    if (sub.includes('pausar') || sub.includes('desligar') || sub.includes('pause')) acoesPorCampanha[camp].desligar.push(i);
    if (sub.includes('novo_criativo') || sub.includes('criar_criativo') || sub.includes('variacao')) acoesPorCampanha[camp].criar.push(i);
  });
  const acoesRemover = new Set<number>();
  for (const [camp, grupos] of Object.entries(acoesPorCampanha)) {
    if (grupos.desligar.length > 0 && grupos.criar.length > 0) {
      // Contradição. Mantém a "desligar" (mais urgente — corta sangria) e remove as "criar".
      log.push(`R3 violada: campanha ${camp} tem desligar+criar. Removendo ações de criar criativo (${grupos.criar.length}).`);
      grupos.criar.forEach((i) => acoesRemover.add(i));
    }
  }
  // ============ R4: não pode desligar 100% das campanhas ativas ============
  const todasCampanhas = (dataHub?.meta_ads?.campanhas_selecionadas || []).map((c: any) => c.entity_id).filter(Boolean);
  if (todasCampanhas.length > 0) {
    const campanhasMandadasDesligar = new Set<string>();
    acoes.forEach((a: any, i: number) => {
      if (acoesRemover.has(i)) return;
      const sub = (a.subtipo || '').toLowerCase();
      const camp = a.entity_id || a.campaign_id || a.alvo_entity_id || null;
      if (camp && (sub.includes('pausar') || sub.includes('desligar') || sub.includes('pause'))) {
        campanhasMandadasDesligar.add(camp);
      }
    });
    const pctDesligado = campanhasMandadasDesligar.size / todasCampanhas.length;
    if (pctDesligado >= 0.99 && todasCampanhas.length > 1) {
      log.push(`R4 violada: ${campanhasMandadasDesligar.size}/${todasCampanhas.length} campanhas mandadas desligar (${(pctDesligado * 100).toFixed(0)}%). Removendo a última pra não cortar tráfego inteiro.`);
      // Remove a última ação de desligar (mantém as outras)
      const ultimaDesligar = [...acoes]
        .map((a, i) => ({ a, i }))
        .reverse()
        .find(({ a, i }) => !acoesRemover.has(i) && (a.subtipo || '').toLowerCase().match(/pausar|desligar|pause/));
      if (ultimaDesligar) {
        acoesRemover.add(ultimaDesligar.i);
        // Adiciona nota no veredito
        sintese.veredito = sintese.veredito || {};
        sintese.veredito.frase_diagnostico = `${sintese.veredito.frase_diagnostico || ''}\n\n⚠ VALIDADOR: o modelo sugeria desligar TODAS as campanhas, o que zera o tráfego. Mantendo uma campanha ativa pra você ter base de comparação.`;
      }
    }
  }

  // Aplica remoções e renumera
  if (acoesRemover.size > 0) {
    const novasAcoes = acoes.filter((_, i) => !acoesRemover.has(i));
    const oldToNew: Record<number, number> = {};
    let novoIdx = 0;
    for (let i = 0; i < acoes.length; i++) {
      if (!acoesRemover.has(i)) {
        oldToNew[i] = novoIdx;
        novoIdx++;
      }
    }
    novasAcoes.forEach((a: any, i: number) => { a.id_ordem = i + 1; });
    sintese.acoes_sequenciais = novasAcoes;
    // Reindexa acoes_idx em matriz
    for (const m of matriz) {
      m.acoes_idx = (m.acoes_idx || [])
        .filter((i: number) => !acoesRemover.has(i))
        .map((i: number) => oldToNew[i])
        .filter((i: number) => i !== undefined);
    }
  }

  // ============ R5: Reconciliação final — re-checa R1 após R2/R3/R4 ============
  // (algumas correções podem ter zerado ações de um elemento)
  // v0.37.20: anota MOTIVO do zero pra UI distinguir "sem dado" de "analisado mas sem ação prioritária"
  for (const m of matriz) {
    const el = (m.elemento || '').toLowerCase();
    const hr = Number(m.headroom_pct || 0);
    const idxs = acoesDoElemento(el);
    if (hr > 0 && idxs.length === 0) {
      log.push(`R5: ${el} ficou sem ação após correções R2-R4. Forçando saudavel/0%.`);
      m.headroom_pct = 0;
      m.status = 'saudavel';
      m.motivo_zerado = 'llm_reportou_headroom_sem_acao';
    }
  }

  // v0.37.20: marca motivo de elementos que ficaram em headroom=0 com base no estado dos DADOS
  for (const m of matriz) {
    const el = (m.elemento || '').toLowerCase();
    const idxs = acoesDoElemento(el);
    const hr = Number(m.headroom_pct || 0);
    if (hr === 0 && idxs.length === 0 && !m.motivo_zerado) {
      if (el === 'pagina') {
        const temPagina = dataHub?.pagina?.ok && Number(dataHub.pagina.texto_total_chars || 0) > 500;
        m.motivo_zerado = temPagina ? 'analisada_sem_acao_prioritaria' : 'pagina_nao_capturada';
        m.dado_disponivel = temPagina;
      } else if (el === 'checkout') {
        const temAban = Number(dataHub?.compradores?.total_abandonos || 0) > 0;
        m.motivo_zerado = temAban ? 'analisado_sem_acao_prioritaria' : 'sem_abandono_no_periodo';
        m.dado_disponivel = !!dataHub?.compradores?.ok;
      } else if (el === 'criativo' || el === 'campanha') {
        const temMeta = dataHub?.meta_ads?.ok;
        m.motivo_zerado = temMeta ? 'analisado_sem_acao_prioritaria' : 'meta_ads_nao_disponivel';
        m.dado_disponivel = !!temMeta;
      }
    }
  }

  sintese.matriz_oportunidade = matriz;

  // ============ R6 (v0.37.18): BLINDAR limitacoes_declaradas — remove qualquer item que mencione dado que VEIO no data_hub ============
  // Mata o bug "LLM diz 'sem dado' mas dado tá no payload"
  if (sintese.contexto_diagnostico && Array.isArray(sintese.contexto_diagnostico.limitacoes_declaradas)) {
    const lims = sintese.contexto_diagnostico.limitacoes_declaradas as string[];
    const temHotmart = dataHub?.compradores?.ok && (Number(dataHub.compradores.total_compras_aprovadas || 0) > 0 || Number(dataHub.compradores.total_abandonos || 0) > 0);
    const temPagina = dataHub?.pagina?.ok && Number(dataHub.pagina.texto_total_chars || 0) > 500;
    const temMeta = dataHub?.meta_ads?.ok && (dataHub.meta_ads.campanhas_selecionadas || []).length > 0;
    const temFrequency = temMeta && (dataHub.meta_ads.campanhas_selecionadas || []).some((c: any) => c.frequency != null);
    const temTaxaLp = dataHub?.pagina?.taxa_conversao_lp_inferida_pct != null;
    const temAbandonosNominais = (dataHub?.compradores?.abandonos_nominais || []).length > 0;
    const temFunilPorCriativo = (dataHub?.compradores?.funil_por_criativo || []).length > 0;

    // Padrões de limitação FALSA a remover (regex case-insensitive)
    const padroesFalsos = [
      // Hotmart
      { tem: temHotmart, regex: /n[ãa]o (foram )?(enviad|inform|recebid|colet|trazid|envi|disponi)\w*\s.*(hotmart|compras? aprovad|vendas?|abandono|checkout)/i },
      { tem: temHotmart, regex: /(hotmart|abandono|checkout|compras? aprovad).*(n[ãa]o (foram |foi )?(enviad|inform|recebid|trazid|disponi))/i },
      { tem: temHotmart, regex: /sem dado.*(hotmart|abandono|checkout)/i },
      { tem: temHotmart, regex: /(total_compras_aprovadas|total_abandonos_checkout|taxa_conversao_checkout_pct).*(n[ãa]o|sem|faltou)/i },
      // Página
      { tem: temPagina, regex: /n[ãa]o (foi )?(enviad|inform|recebid|colet|trazid|scrap)\w*\s.*(p[áa]gina|landing|lp\b|data_hub\.pagina)/i },
      { tem: temPagina, regex: /(p[áa]gina|landing|lp\b|texto da p[áa]gina).*(n[ãa]o (foi |foram )?(enviad|inform|recebid|trazid|scrap))/i },
      { tem: temPagina, regex: /sem dado.*(p[áa]gina|landing|lp\b)/i },
      { tem: temPagina, regex: /n[ãa]o houve scraping/i },
      // Taxa LP (matches: "taxa de conversão da landing", "conversão da landing page", "LP conversion", "conversão lp")
      { tem: temTaxaLp, regex: /(taxa de convers[ãa]o da (landing|p[áa]gina)|convers[ãa]o da landing|convers[ãa]o da p[áa]gina|convers[ãa]o lp|lp conversion).*(n[ãa]o|sem|inform|comparar|enviad|colet)/i },
      { tem: temTaxaLp, regex: /n[ãa]o (foi |foram )?enviad.*(landing|p[áa]gina|lp\b|convers[ãa]o)/i },
      { tem: temPagina, regex: /n[ãa]o (foi |foram )?enviad.*(dados? d[ea]|texto d[ea]).*p[áa]gina/i },
      // Frequency
      { tem: temFrequency, regex: /(frequency|frequ[êe]ncia).*(n[ãa]o|sem|inform|faltou|enviad)/i },
      { tem: temFrequency, regex: /n[ãa]o (foi |foram )?(enviad|inform).*frequ/i },
      // Meta
      { tem: temMeta, regex: /(meta ads|metricas? meta|gerenciador de an[úu]ncios).*(n[ãa]o (foram |foi )?(enviad|inform|colet))/i },
      // Abandonos nominais
      { tem: temAbandonosNominais, regex: /(nome|telefone|email).*(abandon).*(n[ãa]o|sem|inform)/i },
      // Funil por criativo
      { tem: temFunilPorCriativo, regex: /(funil[\s_]por[\s_]criativo|cruzando.*criativo.*aprovad).*(n[ãa]o|sem|inform|enviad)/i },
    ];

    const limsBlindadas = lims.filter((lim: string) => {
      const limStr = String(lim || '');
      for (const p of padroesFalsos) {
        if (p.tem && p.regex.test(limStr)) {
          log.push(`R6: limitação FALSA removida: "${limStr.slice(0, 80)}"`);
          return false;
        }
      }
      return true;
    });

    sintese.contexto_diagnostico.limitacoes_declaradas = limsBlindadas;
  }

  // ============ R7 (v0.37.18): Sobrescrever metrica_chave.valor_atual com NÚMERO REAL quando disponível ============
  // Mata "não informado" / "sem dado" no card do treemap quando temos o número
  for (const m of matriz) {
    const el = (m.elemento || '').toLowerCase();
    if (!m.metrica_chave) m.metrica_chave = {};
    const mk = m.metrica_chave;
    const valorAtual = String(mk.valor_atual || '').toLowerCase();
    const valorPobre = !mk.valor_atual || valorAtual.includes('não inform') || valorAtual.includes('sem dado') || valorAtual.includes('sem inform') || valorAtual.includes('?') || valorAtual === 'n/a' || valorAtual === 'null';

    if (el === 'checkout' && valorPobre) {
      const taxa = dataHub?.compradores?.taxa_conversao_checkout_pct;
      const totalAb = Number(dataHub?.compradores?.total_abandonos || 0);
      if (taxa != null) {
        mk.valor_atual = taxa + '%';
        mk.nome = mk.nome || 'Taxa de conversão checkout (Hotmart)';
        mk.valor_potencial = mk.valor_potencial || 'Recuperar 20-30% de ' + totalAb + ' abandonos = ~' + Math.round(totalAb * 0.25) + ' vendas extras';
        log.push(`R7: metrica_chave Checkout sobrescrita: ${taxa}%`);
      }
    } else if (el === 'pagina' && valorPobre) {
      const taxaLp = dataHub?.pagina?.taxa_conversao_lp_inferida_pct;
      if (taxaLp != null) {
        mk.valor_atual = taxaLp + '% (cliques→checkout iniciado)';
        mk.nome = mk.nome || 'Taxa de conversão da landing page (inferida)';
        mk.valor_potencial = mk.valor_potencial || 'Benchmark BR infoproduto: 3-8%';
        log.push(`R7: metrica_chave Página sobrescrita: ${taxaLp}%`);
      }
    } else if (el === 'campanha' && valorPobre) {
      const roas = dataHub?.meta_ads?.agregado?.roas;
      if (roas != null) {
        mk.valor_atual = 'ROAS ' + roas;
        mk.nome = mk.nome || 'ROAS médio das campanhas DCL no período';
        mk.valor_potencial = mk.valor_potencial || 'Saudável: ≥1.5';
        log.push(`R7: metrica_chave Campanha sobrescrita: ROAS ${roas}`);
      }
    } else if (el === 'criativo' && valorPobre) {
      const ctr = dataHub?.meta_ads?.agregado?.ctr;
      if (ctr != null) {
        mk.valor_atual = 'CTR ' + ctr + '%';
        mk.nome = mk.nome || 'CTR médio dos criativos DCL';
        mk.valor_potencial = mk.valor_potencial || 'Benchmark Meta BR: 1.8-2.5%';
        log.push(`R7: metrica_chave Criativo sobrescrita: CTR ${ctr}%`);
      }
    }
  }

  // Decisão: chamar revisor LLM só se não houve fallback de parse e tem ações pra revisar
  const deve_chamar_revisor_llm = !sintese.erro_parse && Array.isArray(sintese.acoes_sequenciais) && sintese.acoes_sequenciais.length > 0;

  log.push(`Validação concluída. Ações finais: ${(sintese.acoes_sequenciais || []).length}. Revisor LLM: ${deve_chamar_revisor_llm ? 'sim' : 'não'}.`);
  console.log('[validador-deterministico]', log.join(' | '));
  return { log, deve_chamar_revisor_llm };
}

// ====================== REVISOR SEMÂNTICO LLM (v0.37.15) ======================
// Roda gpt-5.5-mini com prompt curto pra detectar SÓ o que código não pega:
// - Persona do produto copiada literal nos criativos sugeridos (ângulo raso)
// - Justificativa do criativo é genérica (não tem mecanismo psicológico)
// Custo esperado: ~$0.02-0.05/rodada.
async function revisorSemantico(sintese: any, persona: any, _dataHub: any): Promise<{
  flags_persona_copiada: string[];
  tokens_in: number;
  tokens_out: number;
  custo_usd: number;
}> {
  const acoes = sintese.acoes_sequenciais || [];
  // Filtra só ações de criativo pra revisar (foco no bug "persona copiada")
  const acoesCriativos = acoes.filter((a: any) => {
    const sub = (a.subtipo || '').toLowerCase();
    const el = (a.elemento || a.alvo_elemento || '').toLowerCase();
    return el === 'criativo' || sub.includes('criativo') || sub.includes('variacao') || sub.includes('headline');
  });
  if (acoesCriativos.length === 0) {
    return { flags_persona_copiada: [], tokens_in: 0, tokens_out: 0, custo_usd: 0 };
  }

  const publicoDoProduto = persona?.publico_alvo || persona?.demografia?.nicho_dominante || persona?.nicho || '';
  const dorPersona = persona?.dor_principal || persona?.dores?.[0] || '';

  const systemPrompt = `Você é um revisor crítico de criativos publicitários. Sua única função é detectar 2 problemas:

PROBLEMA 1 — PERSONA COPIADA LITERAL: o produto tem público "${publicoDoProduto}". Se o criativo sugerido fala só com esse mesmo público sem trazer ângulo psicológico/mecanismo, é cópia preguiçosa. Ex: produto pra psicólogo → criativo "Psicóloga, quer ter sua agenda lotada?" é PREGUIÇA. Melhor seria "Você atende clientes mas se sente travada pra cobrar caro? O bloqueio é..." (ataca DOR, não público).

PROBLEMA 2 — JUSTIFICATIVA RASA: se o racional_calculo da ação não cita mecanismo (gatilho, prova social, urgência, autoridade, dor verbatim), é genérica.

Devolva JSON:
{
  "flags": [
    "Ação #1 (índice no array): explicação curta do que tá raso/cópia"
  ]
}

Se não tem problema, devolva {"flags": []}. Seja seco e específico — só aponta o que é factualmente cópia ou genérico, não opinião subjetiva.`;

  const userPrompt = `Persona do produto:
- Público: ${publicoDoProduto}
- Dor principal: ${dorPersona}

Ações de criativo sugeridas:
${JSON.stringify(acoesCriativos.map((a: any, i: number) => ({
  indice: i,
  titulo: a.titulo,
  descricao: (a.descricao || '').slice(0, 500),
  racional: (a.racional_calculo || '').slice(0, 300),
  bloco_criativo: a.bloco_criativo_proposto || null,
})), null, 2).slice(0, 8000)}

Aponta SÓ casos claros de cópia literal de persona ou justificativa genérica. Máximo 3 flags.`;

  try {
    const { resp, tokens_in, tokens_out } = await chamarLLM('gpt-5.5-mini', systemPrompt, userPrompt, true, { maxTokens: 1500, retries: 0 });
    let out: any = {};
    try { out = JSON.parse(resp); } catch (_) { out = { flags: [] }; }
    const flags: string[] = Array.isArray(out.flags) ? out.flags.slice(0, 3) : [];
    console.log('[revisor-semantico] flags:', flags);
    return {
      flags_persona_copiada: flags,
      tokens_in,
      tokens_out,
      custo_usd: custoUsd('gpt-5.5-mini', tokens_in, tokens_out),
    };
  } catch (e) {
    console.warn('[revisor-semantico] falhou, seguindo sem flag:', (e as Error).message);
    return { flags_persona_copiada: [], tokens_in: 0, tokens_out: 0, custo_usd: 0 };
  }
}

// ====================== CAMADA 3+4: CONSOLIDADOR + CONSULTOR ======================

async function rodarConsultor(workflow: Workflow, pareceres: any[], dataHub: any, persona: any, modeloEstSnap?: any): Promise<any> {
  const modelo = workflow.modelos?.consultor || 'gpt-5.5';
  const personaBloco = blocoPersonaCompacto(persona);
  const modeloEstBloco = blocoModeloEstatistico(modeloEstSnap);

  const systemPrompt = `Você é o **Consultor de Crescimento Estratégico** da Pinguim.

Sua função: ler os pareceres dos N especialistas + dados crus + modelo estatístico e entregar um diagnóstico no formato de **médico atendendo dono de negócio**:
1. Identificar UM gargalo principal (topo / meio / fundo do funil) — NÃO 3 frentes paralelas
2. Listar AÇÕES SEQUENCIAIS (faz 1, mede, decide se vai pra próxima)
3. Em cada ação: justificar com NÚMERO NOMINAL ("n=789", "ROAS 0.37", "lift 2.1x") — NUNCA generalidades
4. Declarar CONFIANÇA explícita por fonte (alta/média/baixa)
5. Quando não tem dado pra cravar: declarar HIPÓTESE + teste mínimo de validação

${personaBloco}
${modeloEstBloco ? '\n' + modeloEstBloco : ''}

REGRAS DURAS — viola = parecer ruim:

R1. **UM gargalo principal só.** Compare CTR (criativo/topo) × LP conversion (página/meio) × Checkout/AOV (oferta/fundo). Aponte o MAIOR outlier vs benchmark de infoproduto BR. Não dilua dizendo "tudo precisa melhorar".

R2. **Ações nominais.** Em vez de "pausar campanhas com ROAS baixo" diga "Pausar [DCL] Teste Agressivo - Escala Máxima (ROAS 0.37, gastou R$2.335)". Sempre nome + número. Se não souber o nome, declare honesto.

R3. **Justificativa SEMPRE com número E COM PRODUTO EXPLÍCITO.** "Foque em Saúde/Bem-Estar" sozinho é ruim. "Foque em Saúde/Bem-Estar (46% dos compradores do DESAFIO LO-FI, n=789)" é bom.

REGRA DURA: TODA vez que citar um número de comprador/persona, declare DE QUAL PRODUTO. Não diga "o maior comprador é X" sem dizer "comprador DE QUE produto". O sistema analisa o funil Lo-fi → Elo, e o usuário pode confundir. Sempre cite:
- "DESAFIO LO-FI: n=789 compradores são Saúde/Bem-Estar"
- "ELO: 6 compradores Elo confirmados, todos vieram de DESAFIO LO-FI"
- "Modelo estatístico (base 1701 compradores LO-FI): gancho X teve lift 2.1x"

PROIBIDO: "maior pessoa compradora é Saúde/Bem-Estar com n=789 e 46.38% da base" sem dizer A BASE DE QUE PRODUTO.

R4. **Confidence Source declarada.** Pra cada ação: "Confiança ALTA: dado real Meta API (ROAS medido)" / "Confiança MÉDIA: modelo estatístico (n=1701, p<0.05)" / "Confiança BAIXA: heurística do especialista, validar com A/B".

R5. **Sem % de impacto inventada.** Não escreva "ganho esperado +30%" sem A/B test. Use Impact 1-10 baseado no GAP vs benchmark.

R6. **Sequência com gate de decisão.** Cada ação tem "como medir" + "se X então pare, se Y então vá pra próxima". Não largue 5 ações simultâneas.

R7. **Hipóteses honestas.** Quando não tem dado: "Hipótese: [X]. Teste mínimo: [R$50, 48h, sinal positivo = CTR sobe 30%+]". Build-Measure-Learn do Ries.

R8. **Bench infoproduto BR (use como referência):**
   - CTR Meta Ads tráfego: 1.8-2.5% (saudável)
   - LP conversion (entrada): 3-8%
   - Tripwire→Core ascension: 5% típico
   - ROAS frio: 1.5-2.5 (saudável)

R8.1. **ANTI-VIÉS DE PERSONA (CRÍTICO).** A persona do produto descreve PÚBLICO (ex: psicólogos, médicos). NUNCA copie isso literal pro criativo — isso é cópia preguiçosa, não insight. O criativo NOVO deve atacar **DOR/MECANISMO**, não público.
   - Errado: produto pra psicólogo → criativo "Psicóloga, quer ter agenda lotada?" (só repete público)
   - Certo: criativo "Você atende clientes mas trava na hora de cobrar caro? O bloqueio é..." (ataca DOR específica)
   - Use a dor_verbatim e objecao_verbatim das personas do modelo estatístico, NÃO o "publico_alvo" da persona base.
   - Se você só consegue gerar criativo que copia o público da persona literal, é sinal de que falta insight — declare honesto em vez de inventar.

R8.2. **COERÊNCIA CROSS-ELEMENTO (CRÍTICO).** Antes de devolver, releia TODAS as ações como um sócio leria:
   - Se você manda "pausar campanha X" → NÃO pode mandar "criar criativo pra campanha X" na mesma rodada. Contradição.
   - Se você manda desligar TODAS as campanhas ativas → você tá zerando o tráfego. NUNCA faça isso. Sempre mantenha 1 campanha viva como base.
   - Se headroom > 0 em algum elemento → tem que ter AÇÃO correspondente em acoes_sequenciais com elemento=esse elemento. Senão zere o headroom.
   - Se hotmart.total_abandonos_checkout > 0 → OBRIGATÓRIO ter ação de recuperação no Checkout (régua WhatsApp+email+oferta de retomada). Independente de a taxa de conversão estar alta.

R9. **FUNIL CONECTADO — VEJA O CAMINHO INTEIRO, NÃO 4 CAIXAS ISOLADAS.** (CRÍTICO v0.37.16)
   Você tem em hotmart.funil_por_criativo a taxa de conversão de CADA criativo Meta (cruzando src com aprovado/abandonado). Use isso pra decidir cada ação:
   - Criativos com recomendacao=ESCALAR (taxa>=75%, n>=3) → ação "escalar_campanha" na campanha que hospeda esse criativo
   - Criativos com recomendacao=PAUSAR_OU_TROCAR (taxa<=50%, abandonos>=2) → ação "pausar_campanha" (ou pausar só esse anúncio) na campanha desse criativo
   - Criativos com recomendacao=VARIAR (taxa 51-74%) → ação "novo_criativo_pagina_atual" usando como BASE a copy_atual desse criativo, mudando UMA coisa específica do que tá no copy atual (não reescreva do zero)
   - SEMPRE relacione campanha + criativo: ad pertence a uma campaign_id, e você tem isso no payload. Não trate criativo solto sem dizer de qual campanha ele veio.
   - Quando criar variação de criativo: parta da copy_atual REAL (que tá no payload em top_criativos[].copy_atual). Mude UMA coisa (ângulo, gancho, prova). Não invente do zero ignorando o que já roda.
   - Use dados do funil_por_criativo pra justificar nominalmente: "Esse criativo X tem taxa 50% (2 vendas, 2 abandonos), enquanto Y tem 100% (9 vendas, 0 abandonos). Por isso pausar X e replicar fórmula de Y."

R9.1. **FREQUÊNCIA = FADIGA DE CRIATIVO.** Cada campanha e anúncio agora vem com frequency (média ponderada pelas impressões). Use como sinal de fadiga:
   - frequency < 2.0: saudável, audiência não está saturada
   - frequency 2.0-3.0: começando a saturar — observar
   - frequency > 3.0: FADIGA — público vendo muito o mesmo anúncio; CTR cai, CPM sobe. AÇÃO: trocar criativo, ampliar audiência, ou pausar
   - SEMPRE cite o valor nominal: "Campanha X com frequency 4.2 (saturada)"

R9.2. **DUAS TAXAS DE CHECKOUT — Meta E Hotmart, são diferentes e ambas úteis.**
   - taxa_checkout_meta_pct (no payload em campanhas[] e top_criativos[]) = purchases/clicks do PIXEL Meta. É a métrica que aparece no Gerenciador de Anúncios. Conta TODO mundo que clicou em "comprar" no checkout, MESMO quem não pagou.
   - taxa_conversao_checkout_pct (no payload em hotmart) = vendas APROVADAS / (vendas + abandonos). Aqui Hotmart distingue quem PAGOU de quem só iniciou.
   - GAP entre as duas = % de pessoas que abandonaram (boleto/pix sem pagar). Esse gap é o que recuperação resolve.
   - Use AMBAS pra justificar: "Campanha X tem taxa Meta 5% (purchases/clicks Pixel), mas Hotmart mostra que só 80% desses purchases viraram venda — então taxa real é 4%."

R10. **LEIA A COPY REAL DO CRIATIVO ANTES DE PROPOR VARIAÇÃO.**
   Cada item em top_criativos tem copy_atual e title_atual. Esse é o texto que está rodando AGORA. Sua variação deve ser uma EVOLUÇÃO disso, não uma criação do zero.
   - Errado: ignorar copy_atual e escrever roteiro que contradiz a página de venda (ex: "entra no desafio e em poucos minutos" quando o desafio é em data marcada e ao vivo)
   - Certo: pegar copy_atual, ver o que funciona e o que pode melhorar, propor variação que MUDA APENAS O QUE PRECISA
   - Se a página de venda tem datas/horários específicos (presente no data_hub.pagina.texto) → seu roteiro NUNCA pode contradizer essas datas. Leia a página antes de escrever criativo.

R11. **PROIBIDO DECLARAR LIMITAÇÃO SOBRE DADO QUE ESTÁ PRESENTE NO PAYLOAD.** (CRÍTICO v0.37.18)
   O campo "contexto_diagnostico.limitacoes_declaradas" é SAGRADO — só pode conter limitações REAIS. Antes de listar qualquer item ali, RELEIA o payload de cima a baixo:
   - Se "hotmart" tem total_compras_aprovadas > 0 OU total_abandonos_checkout > 0 → PROIBIDO dizer "não vieram dados de Hotmart / vendas / abandono / checkout". Os dados ESTÃO em hotmart.
   - Se "pagina.ok" é true E pagina.texto_total_chars > 500 → PROIBIDO dizer "não foi feito scraping" ou "não veio texto da página". O texto ESTÁ em pagina.texto.
   - Se "pagina.taxa_conversao_lp_inferida_pct" é número → PROIBIDO dizer "sem taxa de conversão LP". USE o número.
   - Se "meta_ads.campanhas[].frequency" tem valor → PROIBIDO dizer "não veio frequency". USE o número.
   - Se "hotmart.abandonos_nominais_top10" tem itens → PROIBIDO dizer "sem lista de quem abandonou". A lista ESTÁ ali com nome+telefone.
   - Se "hotmart.funil_por_criativo" tem itens → PROIBIDO dizer "não há cruzamento criativo×venda". O cruzamento ESTÁ ali.
   - REGRA DURA: se você listar uma limitação sobre dado que está no payload, o validador determinístico REMOVE automaticamente. Mas seu trabalho fica ruim porque significa que você não LEU o payload. Releia o JSON antes de escrever esse campo.
   - O que PODE ir em limitacoes_declaradas: dado externo ausente (ex: "não temos pesquisa de NPS dos compradores", "não temos sessão analytics da página"). Não inventar limitação sobre dado interno disponível.

R12. **VEREDITO NÃO É RESUMO DE PROBLEMA — É CHAMADO À AÇÃO.** (v0.37.18)
   O "veredito.frase_diagnostico" não deve só descrever o que está ruim. Deve apontar a AÇÃO #1 mais valiosa com número esperado de ganho.
   - Errado: "O gargalo principal está no topo: a conta tem um criativo comprador, 'DCL Personal' com ROAS 1.19 e 28 compras, mas o orçamento está diluído em campanhas com ROAS 0.37, 0.43 e até 0."
   - Certo: "ESCALAR campanha [DCL] ABO - Teste Criativo em +30% (R$700→R$910/dia). 'DCL Personal' já entrega ROAS 1.19. Probabilidade: +9 vendas/semana (~R$261). Pausar [DCL] Teste Agressivo - Escala Máxima ROAS 0.37 libera R$330/dia pra essa escala."
   - Foque no **R$ que entra**, não no R$ que sai. O sócio já sabe que está ruim. Ele quer saber O QUE FAZER pra melhorar.

R12.5. **ACHADOS DOS COPYWRITERS TÊM AUTORIDADE NA PÁGINA.** (v0.37.21)
   Os analistas da área "pagina" (Halbert, Schwartz, Hormozi, Carlton, Bencivenga, Kennedy) leram o texto COMPLETO da página. Se algum deles apontou problema concreto com EVIDÊNCIA (trecho citado literal), você DEVE transformar isso em ação na matriz Página.
   - Não descarte achados de copywriter por "não ter número de A/B test". Eles são especialistas, foram chamados pra ISSO.
   - Se 2+ copywriters apontam o MESMO problema → ação de prioridade ALTA com confiança ALTA (não MEDIA).
   - Se Halbert/Schwartz citaram trechos literais da página apontando furo, sua matriz_oportunidade.pagina DEVE ter headroom > 0 e ação correspondente. Senão você está ignorando o trabalho dos especialistas.

R13. **PÁGINA NUNCA FICA "SEM DADO" SE FOI SCRAPEADA.** (v0.37.20 — CRÍTICO)
   Se pagina.ok === true E pagina.texto_total_chars > 500, A PÁGINA TEM DADO. Período.
   O que pode acontecer:
   (a) Você IDENTIFICOU violação CRO clara → headroom honesto (3-8%) + ação concreta de reescrita ou A/B
   (b) Você NÃO identificou violação clara mas taxa_conversao_lp_inferida_pct < 5% (abaixo do benchmark 3-8%) → OBRIGATÓRIO propor pelo menos 1 ação tipo "trocar_headline_pagina" como HIPÓTESE com teste mínimo: declare R$50 / 48h / sinal-positivo. Use R7 (Build-Measure-Learn). NÃO deixe headroom > 0 sem ação.
   (c) Você NÃO identificou violação E taxa_conversao_lp >= 5% (saudável) → headroom = 0, status = "saudavel", motivo claro: "página coerente com a promessa dos criativos e taxa LP dentro do benchmark"
   Em NENHUM caso a Página fica "sem dado" se foi scrapeada. Use "analisada e sem ação prioritária" ou "analisada com hipótese de teste mínimo" — nunca "sem dado".

CONTEXTO: o sócio Pinguim tem problema de "anúncio gasta e não vende suficiente entrada no Desafio Lo-fi". Quer ATACAR O GARGALO PRIMÁRIO, medir, e só depois ir pro próximo.

SOBRE TIPOS DE AÇÃO (R9):

Há 5 SUBTIPOS de ação que você pode propor. Cada uma tem semântica DIFERENTE de dependência:

1. **pausar_campanha** — ISOLADA, pode rodar paralelo a outras. Apenas pausa.
2. **escalar_campanha** — ISOLADA, paralelo. Aumenta budget de campanha vencedora.
3. **novo_criativo_pagina_atual** — ISOLADA paralelo. Sobe criativo novo MAS mantém página atual. Use quando criativo é variação do tema atual.
4. **trocar_headline_pagina** — ISOLADA paralelo. Mexe na headline da página, criativos atuais continuam. Use quando criativo está OK mas a página desconecta.
5. **combinacao_criativo_pagina** — SEQUENCIAL (espera resultado pra próxima). Sobe criativo NOVO + página NOVA juntos com a MESMA PROMESSA NOVA. Use quando precisa testar um ângulo diferente do funil inteiro.

REGRA DURA: ações tipo 1-4 são **paralelas** (rodam ao mesmo tempo). Tipo 5 é **sequencial** (precisa de resultado pra decidir próxima).

O frontend mostra selo visual baseado em "modo_execucao": "paralelo" ou "sequencial".

SOBRE A MATRIZ DE OPORTUNIDADE (R10) — NOVO v0.37.7:

O frontend mostra Treemap com 4 elementos canônicos do funil (v0.37.10: oferta foi MERGEADA dentro de página):
- 🎬 criativo (anúncio, gancho, copy do anúncio)
- 📊 campanha (estrutura no Meta: budget, otimização, audience signal)
- 📄 pagina (headline, lead, prova social, copy E TAMBÉM oferta/preço/bônus/garantia — tudo que está na landing)
- 💳 checkout (Hotmart/Principia, abandono, boleto BR, processo de pagamento em si)

PRA CADA ELEMENTO, calcule "headroom" (potencial REALISTA) com método ESPECÍFICO POR ELEMENTO:

═══════════════════════════════════════
🎬 CRIATIVO (método comparativo)
═══════════════════════════════════════
- Se há N≥3 criativos com métricas (ROAS/CTR/CPA medidos): headroom = (melhor − mediana) / mediana × 30, MAX 10%.
- Se N<3: headroom_pct = null, confianca = "INSUFICIENTE".
- racional_calculo: "+X% — Você tem N criativos. Melhor ROAS Y, mediana Z. Pausar os abaixo da mediana e redirecionar pro nível do melhor libera ~X% de eficiência."

═══════════════════════════════════════
📊 CAMPANHA (método comparativo)
═══════════════════════════════════════
- Se há N≥3 campanhas ativas com ROAS medido: headroom = (melhor − mediana) / mediana × 25, MAX 8%.
- Se N<3: headroom_pct = null.
- racional_calculo similar ao criativo.

═══════════════════════════════════════
📄 PÁGINA (método HEURÍSTICO CRO — SEMPRE TEM DADO QUANDO HÁ SCRAPING)
═══════════════════════════════════════
A página de venda foi capturada via scraping (data_hub.pagina.texto + titulo + meta_description). ISSO É DADO SUFICIENTE.
NÃO retorne null pra Página quando data_hub.pagina.ok = true.

Use HEURÍSTICA CRO de 8 perguntas:
1. A headline declara benefício claro em ≤12 palavras?
2. A primeira dobra responde "pra quem é"?
3. Tem prova social visível (depoimento, número, badge)?
4. Tem urgência/escassez clara (data, vagas, prazo)?
5. CTA claro (botão visível com verbo de ação)?
6. Promessa da página bate com gancho do criativo principal?
7. Tem garantia/redutor de risco?
8. Tem objeções tratadas (FAQ ou copy específica)?

Pra cada heurística VIOLADA, soma 1.5% de headroom. Máx 8% (4 violações).
headroom_pct = (violacoes × 1.5) clamped [0, 8].

racional_calculo: "+X% — Análise heurística CRO da página atual (URL): identifiquei Y heurísticas violadas: [lista]. Cada heurística violada vale ~1.5% de melhoria potencial em conversão LP. Total: X%."

Se data_hub.pagina.ok = false (não conseguiu scraping):
- headroom_pct = null
- racional_calculo: "Não foi possível capturar a página (scraping falhou). Sem dado pra estimar."

═══════════════════════════════════════
💳 CHECKOUT (dado REAL via hotmart_transactions com status expired/waiting/canceled)
═══════════════════════════════════════
v0.37.14: dataHub.hotmart traz:
  - total_compras_aprovadas (status approved+completed)
  - total_abandonos_checkout (status expired+waiting_payment+billet_printed+canceled — pessoa gerou boleto/pix mas não pagou)
  - taxa_conversao_checkout_pct = compras / (compras + abandonos) × 100

Benchmark Hotmart BR: checkout saudável ≥ 75-85% conversão (do total que ENTROU no checkout).

Regra:
- Se hotmart.ok E total compras+abandonos ≥ 5:
  - taxa < 50%: headroom = 8% (crítico — muita gente abandonando)
  - 50-70%: headroom = 5% (média — sequência de recuperação ajuda)
  - 70-85%: headroom = 3% (otimização fina possível)
  - ≥ 85%: headroom = 1% (excelente, mexer em outra coisa)
  - racional_calculo: "X compras + Y abandonos no período. Taxa de conversão checkout = Z%. Benchmark Hotmart BR é 75-85%. Headroom = N% via sequência recuperação WhatsApp+e-mail nas 24h após abandono."

- Se hotmart.ok E total compras+abandonos < 5:
  - headroom_pct = null
  - racional_calculo: "Apenas X transações no período — base muito pequena pra avaliar checkout. Refazer com janela maior."

- Se hotmart.ok = false:
  - headroom_pct = null
  - racional_calculo: "Falha ao coletar transações Hotmart: [motivo]."

═══════════════════════════════════════
REGRA UNIVERSAL — CAMPO racional_calculo OBRIGATÓRIO:
═══════════════════════════════════════
Em cada elemento da matriz, racional_calculo NUNCA pode ser vazio. Sempre explica de onde vem o número OU por que é null.

**REGRA DE COERÊNCIA STATUS x AÇÕES (CRÍTICA):**
- Se o elemento tem AÇÕES sugeridas na lista acoes_sequenciais (ou seja, aparece em acoes_idx[]), o status NÃO pode ser "ok". Mínimo "medio".
- Se status = "ok", acoes_idx[] DEVE ser vazio [].
- INCOERÊNCIA: status "ok" + ações sugeridas = ERRO GRAVE. Você está mentindo pra o usuário.

NUNCA invente "benchmark de mercado". Use só DADO DA CONTA + análise qualitativa dos pareceres.

Devolva JSON com schema EXATO:
{
  "gargalo_principal": "topo" | "meio" | "fundo",
  "veredito": {
    "frase_diagnostico": "1 frase direta. Ex: 'Seus criativos têm dispersão grande: melhor ROAS 1.4, mediana 0.6. Headroom no criativo é o maior.'",
    "numero_ancora": { "metrica": "ROAS criativo", "valor_atual": "mediana 0.6", "valor_meta_ou_bench": "P75 1.2" },
    "funnel_story": "1 parágrafo (3-5 frases) costurando a jornada."
  },

  "matriz_oportunidade": [
    {
      "elemento": "criativo",
      "icone": "🎬",
      "label": "Criativo",
      "headroom_pct": 40,
      "metrica_chave": { "nome": "ROAS", "valor_atual": "0.6 (mediana)", "valor_potencial": "1.4 (melhor da conta)" },
      "n_observacoes": 8,
      "confianca": "ALTA" | "MEDIA" | "BAIXA" | "INSUFICIENTE",
      "fonte_calculo": "Comparação entre 8 criativos da própria conta (P50→P75)",
      "racional_calculo": "OBRIGATÓRIO: 1-2 frases pé no chão explicando de onde vem o número. Ex: '+5% — pausar X e redirecionar pra Y deve liberar ~5% de economia do CAC nas próximas 2 semanas. (Teto da categoria: 8%, ganho realista por intervenção isolada)'",
      "status": "critico" | "atencao" | "medio" | "ok",
      "resumo_curto": "1 frase pro Pareto. Ex: '4 criativos abaixo da mediana sangrando budget'",
      "acoes_idx": [0, 1]
    }
  ],

  "acoes_sequenciais": [
    {
      "ordem": 1,
      "elemento_alvo": "criativo" | "campanha" | "pagina" | "checkout",
      "subtipo": "pausar_campanha" | "escalar_campanha" | "novo_criativo_pagina_atual" | "trocar_headline_pagina" | "combinacao_criativo_pagina",
      "modo_execucao": "paralelo" | "sequencial",
      "sugerido_por": "Nome do especialista/clone que sugeriu essa ação (ex: 'Pedro Sobral', 'Gary Halbert', 'Alex Hormozi'). Obrigatório — vem dos pareceres da camada 2.",
      "titulo": "Verbo + objeto nominal. Ex: 'Pausar campanha [DCL] Teste Agressivo'",

      "alvo_campanha": { "nome": "...", "id_meta": "...", "metricas_atuais": { "roas": 0.37, "gasto": 2335, "ctr": "2.0%" } },
      "alvo_criativo": { "nome": "...", "id_meta": "...", "metricas_atuais": { "roas": 1.4, "ctr": "2.97%" } },

      "criativo_proposto": {
        "gancho": "abertura 3s — 1-2 frases curtas pra prender atenção. Esta linha vai aparecer DESTACADA no card.",
        "corpo": "DESENVOLVIMENTO em 4-6 BULLETS curtos (cada bullet = 1 ideia, 1 frase). NÃO use texto corrido. Exemplos: '- Mostre seu problema atual' / '- Apresente o método' / '- Cite a transformação'. PRECISA ser estruturado, fácil de ler enquanto grava.",
        "cta": "1-2 frases finais com call-to-action claro (verbo no imperativo: 'clica', 'inscreve', 'comenta').",
        "duracao_sugerida": "30s ou 60s",
        "estilo_visual": "lo-fi cru, câmera frontal, sem edição pesada, tom de conversa",
        "roteiro_completo": "CAMPO LEGADO — você ainda pode preencher pra fallback, mas o frontend agora usa gancho+corpo+cta separados."
      },

      "pagina_proposta": {
        "headline_atual_extraida": "EXTRAIA do data_hub.pagina.titulo ou primeiras linhas do .texto a HEADLINE ATUAL da página de venda. Coloque exatamente como está na página. Se não conseguir extrair, deixe null.",
        "headline": "headline NOVA pronta pra colar",
        "subheadline": "linha curta de apoio",
        "primeira_dobra_completa": "primeira dobra completa NOVA (3-5 parágrafos curtos)"
      },

      "casamento_explicado": "Quando subtipo=combinacao_criativo_pagina: explica POR QUE o criativo e a página andam juntos (mesma promessa, mesma persona, mesma dor declarada).",

      "por_que": "Justificativa COM NÚMERO. Ex: '46% dos seus compradores (n=789) são Saúde/Bem-Estar. Verbatim Captar clientes apareceu 325x.'",

      "confianca": { "nivel": "ALTA" | "MEDIA" | "BAIXA", "fonte": "Frase declarando fonte" },

      "ganho_esperado_qualitativo": "Frase curta tipo 'libera R$334/dia de budget' OU 'reduz CPA em até 30% se hipótese confirmada' — SEM cravar % exato",

      "como_medir": {
        "janela": "7 dias",
        "budget_teste": "R$50 se aplicável",
        "sinal_positivo": "CTR sobe 30%+",
        "sinal_negativo": "CTR cai >20%"
      },

      "hipotese": "preenche SÓ se confianca=BAIXA",

      "gate_proxima_acao": "Quando ir pra próxima. Vazio se modo_execucao=paralelo (porque roda junto). Preenchido se sequencial."
    }
  ],
  "contexto_diagnostico": {
    "periodo_analisado": "DD/MM-DD/MM (N dias)",
    "especialistas_consultados": ["lista nominal"],
    "modelo_estatistico_usado": "slug do modelo OU 'nenhum'",
    "limitacoes_declaradas": ["o que NÃO sabíamos"]
  }
}

CRÍTICO:
- SEMPRE 3-6 ações.
- Cada ação OBRIGATORIAMENTE tem "elemento_alvo" = 1 dos 5 da matriz (criativo|campanha|pagina|oferta|checkout).
- Matriz_oportunidade SEMPRE com 5 elementos (mesmo que algum tenha confianca=INSUFICIENTE — declara honesto).
- Soma de acoes_idx em todos os elementos deve cobrir todas as ações da lista acoes_sequenciais. Elementos sem ação têm acoes_idx vazio [].
- Preencha SOMENTE os campos relevantes ao subtipo da ação.
- Quando subtipo = novo_criativo_pagina_atual: preencha criativo_proposto mas NÃO pagina_proposta.
- Quando subtipo = trocar_headline_pagina: preencha pagina_proposta mas NÃO criativo_proposto.
- Quando subtipo = combinacao_criativo_pagina: preencha AMBOS + casamento_explicado obrigatório.

STATUS POR ELEMENTO (matriz_oportunidade):
- "critico" = headroom_pct >= 30% OU elemento tem 2+ ações sugeridas
- "atencao" = headroom_pct >= 15% e < 30% OU elemento tem 1 ação sugerida
- "medio" = headroom_pct >= 5% e < 15%
- "ok" = headroom_pct < 5% AND acoes_idx[] vazio. Só use OK se REALMENTE não há nada pra fazer.

VALIDAÇÃO ANTES DE RETORNAR:
1. Pra cada elemento da matriz: se status = "ok" mas acoes_idx[] tem itens → muda status pra "atencao".
2. Pra cada elemento da matriz: se headroom_pct == null mas tem ações → calcule headroom qualitativo (10-40%) baseado na severidade descrita nos pareceres dos analistas.
3. Soma de TODAS as ações em acoes_idx[] de todos os elementos = length(acoes_sequenciais). Sem ação órfã, sem ação duplicada.`;

  const userPrompt = `Pareceres dos especialistas:

${JSON.stringify(pareceres.map(p => ({ area: p.area, especialista: p.nome, parecer: p.parecer })), null, 2).slice(0, 10000)}

Dados originais resumidos (incluindo nomes de campanhas e criativos pra você poder citar nominalmente):
${JSON.stringify({
    periodo: dataHub.periodo_dias + ' dias',
    data_inicio: dataHub.data_inicio,
    data_fim: dataHub.data_fim,
    // v0.37.17: PÁGINA PRIMEIRO (evita truncamento do JSON com 30k limite)
    pagina: dataHub.pagina?.ok ? {
      url: dataHub.pagina.url,
      titulo: dataHub.pagina.titulo,
      og_title: dataHub.pagina.og_title,
      og_description: dataHub.pagina.og_description,
      meta_description: dataHub.pagina.meta_description,
      keywords: dataHub.pagina.keywords,
      texto: (dataHub.pagina.texto || '').slice(0, 6000),
      texto_total_chars: dataHub.pagina.texto_total_chars,
      // v0.37.17: taxa LP inferida (vendas / impressions de campanhas que apontam pra essa URL)
      taxa_conversao_lp_inferida_pct: dataHub.pagina.taxa_conversao_lp_inferida_pct ?? null,
      taxa_conversao_lp_metodo: dataHub.pagina.taxa_conversao_lp_metodo ?? null,
    } : { ok: false, motivo: dataHub.pagina?.motivo },
    // v0.37.17: HOTMART ANTES DE META (Hotmart é pequeno, garante que chega antes de truncar 30k)
    hotmart: dataHub.compradores?.ok ? {
      total_compras_aprovadas: dataHub.compradores.total_compras_aprovadas,
      receita_total: dataHub.compradores.receita_total,
      total_abandonos_checkout: dataHub.compradores.total_abandonos,
      taxa_conversao_checkout_pct: dataHub.compradores.taxa_conversao_checkout_pct,
      breakdown_por_status: dataHub.compradores.breakdown,
      // v0.37.16: FUNIL CONECTADO — qual criativo gerou cada venda/abandono
      funil_por_criativo: dataHub.compradores.funil_por_criativo,
      // v0.37.16: ABANDONOS NOMINAIS — pra LLM ver que tem gente real e gerar ação de recuperação concreta
      abandonos_nominais_top10: (dataHub.compradores.abandonos_nominais || []).slice(0, 10).map((a: any) => ({
        nome: a.nome,
        telefone: a.telefone,
        criativo_origem: a.criativo_origem,
        valor: a.valor,
        status: a.status,
        data: a.data,
      })),
    } : { ok: false, motivo: dataHub.compradores?.motivo },
    // v0.37.17: META ADS por último (mais volumoso) — agora com frequency + reach + taxa_checkout_meta + copy completa
    meta_ads: dataHub.meta_ads?.ok ? {
      agregado: dataHub.meta_ads.agregado,
      campanhas: (dataHub.meta_ads.campanhas_selecionadas || []).slice(0, 20).map((c: any) => {
        const taxaCheckoutMeta = c.clicks > 0 ? +((Number(c.purchases || 0) / Number(c.clicks)) * 100).toFixed(2) : null;
        return {
          entity_id: c.entity_id,
          nome: c.nome,
          conta: c.conta,
          spend: c.spend,
          impressions: c.impressions,
          reach: c.reach,
          frequency: c.frequency, // alerta de fadiga se >3
          clicks: c.clicks,
          purchases: c.purchases,
          ctr: c.ctr,
          roas: c.roas,
          // v0.37.17: taxa de conversão click→purchase do Meta (Pixel) — proxy checkout
          taxa_checkout_meta_pct: taxaCheckoutMeta,
        };
      }),
      top_criativos: (dataHub.meta_ads.top_criativos || []).slice(0, 15).map((cr: any) => {
        const taxaCheckoutMeta = cr.clicks > 0 ? +((Number(cr.purchases || 0) / Number(cr.clicks)) * 100).toFixed(2) : null;
        return {
          ad_id: cr.ad_id,
          ad_name: cr.nome,
          midia: cr.midia,
          campaign_id: cr.campaign_id,
          campaign_name: cr.campaign_name,
          spend: cr.spend,
          impressions: cr.impressions,
          reach: cr.reach,
          frequency: cr.frequency, // alerta de fadiga
          clicks: cr.clicks,
          purchases: cr.purchases,
          revenue: cr.revenue,
          ctr: cr.ctr,
          cpc: cr.cpc,
          roas: cr.roas,
          hook_rate: cr.hook_rate,
          hold_rate: cr.hold_rate,
          taxa_checkout_meta_pct: taxaCheckoutMeta, // v0.37.17: % de clicks que viraram purchase
          // copy COMPLETA agora (não cortar — Andre quer ver tudo)
          copy_atual: cr.copy_full_lib || cr.copy, // v0.37.19: prefere body completo da Ad Library se disponível
          title_atual: cr.title_lib || cr.title,
          cta_text: cr.cta_text || null,
          // legados
          video_id: cr.video_id,
          meta_business_url: cr.meta_business_url,
          // NOTA: video_hd_url/video_sd_url/thumbnail NÃO vão pro LLM (URLs longas custam tokens)
          // O frontend pega esses campos direto de data_hub.meta_ads.top_criativos
        };
      }),
    } : { ok: false, motivo: dataHub.meta_ads?.motivo },
    carrinho_abandonado: dataHub.carrinho_abandonado || { ok: false, motivo: 'nao_coletado' },
  }, null, 2).slice(0, 30000)}

Cruze tudo seguindo as regras R1-R8. Sempre cite NOME + NÚMERO. Devolva JSON estruturado conforme o schema EXATO.`;

  // v0.37.15: budget 16k pra saída cobrir 4 elementos × diagnóstico + ações sem truncar
  // (conselheiros apontaram que 8k era zero margem pro schema completo)
  const { resp, tokens_in, tokens_out } = await chamarLLM(modelo, systemPrompt, userPrompt, true, { maxTokens: 16000, retries: 1 });
  let sintese: any = {};
  if (!resp) {
    // 2 tentativas vazias — registra fallback honesto pra usuário não perder a rodada toda
    console.error('[rodarConsultor] AMBAS tentativas vazias. Fallback de emergência.');
    sintese = {
      erro_parse: true,
      raw: '',
      gargalo_principal: null,
      veredito: {
        frase_diagnostico: 'Modelo retornou resposta vazia 2 vezes. Provavelmente o budget de tokens ficou curto pro JSON completo. Rode novamente; se persistir, reduza N de especialistas pra liberar contexto.',
        numero_ancora: null,
        funnel_story: '',
      },
      acoes_sequenciais: [],
      contexto_diagnostico: { limitacoes_declaradas: ['LLM retornou resposta vazia mesmo após retry'] },
    };
  } else {
    try {
      sintese = JSON.parse(resp);
    } catch (e) {
      console.error('[rodarConsultor] JSON inválido. Raw:', resp.slice(0, 500));
      sintese = { erro_parse: true, raw: resp.slice(0, 2000) };
    }
  }

  // v0.37.11: CLAMP DETERMINÍSTICO — força tetos honestos por elemento (LLM ignora teto em prompt)
  if (sintese?.matriz_oportunidade && Array.isArray(sintese.matriz_oportunidade)) {
    const TETOS: Record<string, number> = {
      criativo: 10,
      campanha: 8,
      pagina: 8,
      checkout: 8,
    };
    sintese.matriz_oportunidade = sintese.matriz_oportunidade
      // 1. Remove 'oferta' (mergeada em pagina)
      .filter((m: any) => (m.elemento || '').toLowerCase() !== 'oferta')
      .map((m: any) => {
        const el = (m.elemento || '').toLowerCase();
        const teto = TETOS[el] ?? 10;
        if (typeof m.headroom_pct === 'number' && m.headroom_pct > teto) {
          // Anota no racional que houve clamp
          const racionalOriginal = m.racional_calculo || '';
          m.headroom_pct = teto;
          m.racional_calculo = `${racionalOriginal}\n\n⚠ Valor original do modelo era maior que ${teto}% (teto realista de growth marketing). Aplicado clamp determinístico.`;
        }
        return m;
      });
  }

  // v0.37.15: VALIDADOR DETERMINÍSTICO — 4 regras duras (custo $0, infalível)
  // Conselho dos arquitetos: NÃO delegar isso pro LLM, anchoring bias faz revisor LLM concordar com diagnosticador.
  const validacao = await validarECorrigirDeterministico(sintese, dataHub);
  let custoRevisor = 0;
  let tokensInRev = 0, tokensOutRev = 0;

  // v0.37.15: REVISOR LLM — só pra coisas que código não pega (persona tendenciosa, ângulo raso)
  // Roda gpt-5.5-mini com prompt curto + contexto da persona pra detectar replicação cega.
  if (sintese && !sintese.erro_parse && validacao.deve_chamar_revisor_llm) {
    const revisao = await revisorSemantico(sintese, persona, dataHub);
    custoRevisor = revisao.custo_usd;
    tokensInRev = revisao.tokens_in;
    tokensOutRev = revisao.tokens_out;
    if (revisao.flags_persona_copiada && revisao.flags_persona_copiada.length > 0) {
      // anota flags no contexto pra usuário ver
      sintese.contexto_diagnostico = sintese.contexto_diagnostico || {};
      sintese.contexto_diagnostico.flags_revisor_semantico = revisao.flags_persona_copiada;
    }
  }

  return {
    sintese,
    modelo,
    tokens_in: tokens_in + tokensInRev,
    tokens_out: tokens_out + tokensOutRev,
    custo_usd: custoUsd(modelo, tokens_in, tokens_out) + custoRevisor,
    validacao_log: validacao.log,
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
  // v0.37.6: Camada 5 DESLIGADA por default.
  // O Consultor (Camada 3) já produz `criativo_proposto` + `pagina_proposta`
  // DENTRO de cada ação, casados pela promessa. Camada 5 separada gerava
  // conteúdo redundante e desconectado das ações. Mantemos a função pra uso futuro
  // sob demanda (botão "Pedir +5 variações" no frontend chama Ads Monitor direto).
  return {};
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

  const marcarEtapa = async (etapa: string) => {
    await sb.from('workflow_rodadas')
      .update({ etapa_atual: etapa, etapa_iniciada_em: new Date().toISOString() })
      .eq('id', rodadaId);
  };

  try {
    // 1. Data Hub paralelo
    console.log('[wf]', rodadaId, '→ data hub');
    await marcarEtapa('data-hub');
    const dataHub = await coletarDataHub(workflow, inputs, sb);

    // 2. Persona
    console.log('[wf]', rodadaId, '→ persona');
    const persona = await carregarPersona(workflow.produto_id, sb);

    // 3. Camada 2: analistas paralelos
    console.log('[wf]', rodadaId, '→ camada 2 (analistas)');
    await marcarEtapa('camada-2');
    const pareceres = await rodarCamada2(workflow, inputs, dataHub, persona, sb);
    for (const p of pareceres) {
      totalCustoUsd += p.custo_usd;
      totalIn += p.tokens_in;
      totalOut += p.tokens_out;
      modelosUsados.analistas.push(p.especialista);
    }

    // 4. Camada 3+4: Consultor consolidador
    console.log('[wf]', rodadaId, '→ camada 3+4 (consultor)');
    await marcarEtapa('camada-3-4');
    const consultor = await rodarConsultor(workflow, pareceres, dataHub, persona, inputs.modelo_estatistico_snapshot || null);
    totalCustoUsd += consultor.custo_usd;
    totalIn += consultor.tokens_in;
    totalOut += consultor.tokens_out;
    modelosUsados.consultor = consultor.modelo;

    // 5. Camada 5: executores paralelos (condicional ao gargalo)
    console.log('[wf]', rodadaId, '→ camada 5 (executores)');
    await marcarEtapa('camada-5');
    const execucoes = await rodarCamada5(workflow, consultor.sintese, dataHub, persona, sb);
    modelosUsados.executores = workflow.modelos?.executor || 'gpt-5.4-mini';
    // v0.37.5: sequencia_pre_aula removida. Itera dinamicamente nas chaves que existirem.
    for (const k of Object.keys(execucoes || {})) {
      const e = (execucoes as any)[k];
      if (e?.ok) { totalCustoUsd += e.custo_usd || 0; totalIn += e.tokens_in || 0; totalOut += e.tokens_out || 0; }
    }

    // 6. Salva rodada concluida — v0.37.5 inclui veredito + acoes_sequenciais + gargalo
    const duracao = Math.round((Date.now() - t0) / 1000);
    await sb.from('workflow_rodadas')
      .update({
        status: 'concluido',
        etapa_atual: 'concluido',
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
        // v0.37.5: novos campos do diagnóstico estruturado
        gargalo_principal: consultor.sintese?.gargalo_principal || null,
        veredito_jsonb: consultor.sintese?.veredito || null,
        acoes_sequenciais: consultor.sintese?.acoes_sequenciais || null,
        matriz_oportunidade: consultor.sintese?.matriz_oportunidade || null,
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
