// ============================================================
// processar-anuncios-meta.js — V3 (2026-06-17)
// ============================================================
// Lê campanhas/anúncios da Meta filtrando por keyword no nome
// (ex: "DCL", "Lofi" pra Lo-fi Desafio). Janela 90 dias.
//
// Pega top 20% em CPA mais baixo (vendedores) + top 20% em maior
// investimento (escalados). Pra cada anúncio: extrai copy + thumbnail
// + KPIs e salva como cerebro_fonte tipo 'anuncio_meta' no cérebro
// do produto.
//
// Reusável: passa keyword + cerebro_id + criterios e processa.
// Pra próximo produto (ProAlt, Elo, etc): só muda keyword.
// ============================================================

const db = require('./db');
const meta = require('./meta');
const { vetorizarFonte } = require('./vetorizar-fonte');

const JANELA_DIAS_DEFAULT = 90;
const TOP_PERCENT_DEFAULT = 20;
const MIN_SPEND_USD = 50; // ignora anúncios com gasto irrelevante

/**
 * @param {object} args
 * @param {string} args.cerebro_id - cérebro destino das fontes
 * @param {string[]} args.keywords - keywords no nome (campanha/adset/ad). ex: ['dcl','lofi']
 * @param {number} [args.janela_dias=90]
 * @param {number} [args.top_percent=20]
 * @param {function} [args.on_log]
 * @returns {Promise<{listados, top_vendedores, top_escalados, salvos, falhas, custo_usd}>}
 */
async function processarAnunciosMeta({ cerebro_id, keywords, janela_dias = JANELA_DIAS_DEFAULT, top_percent = TOP_PERCENT_DEFAULT, on_log = () => {} } = {}) {
  if (!cerebro_id) throw new Error('cerebro_id obrigatório');
  if (!Array.isArray(keywords) || keywords.length === 0) throw new Error('keywords obrigatório (array)');

  const keywordsLower = keywords.map(k => k.toLowerCase());
  on_log({ etapa: 'inicio', cerebro_id, keywords, janela_dias, top_percent });

  // 1. Lista todas ad accounts visíveis
  const accountsRes = await meta.listarAdAccounts({ limit: 100 });
  const accounts = (accountsRes && accountsRes.data) || [];
  on_log({ etapa: 'ad_accounts', total: accounts.length });

  // 2. Pra cada ad account: lista campanhas e filtra por keyword
  const campanhasMatch = [];
  for (const acc of accounts) {
    try {
      const campsRes = await meta.listarCampanhas({ ad_account_id: acc.id, limit: 100 });
      const camps = (campsRes && campsRes.data) || [];
      for (const c of camps) {
        const nameLower = (c.name || '').toLowerCase();
        if (keywordsLower.some(k => nameLower.includes(k))) {
          campanhasMatch.push({ ...c, ad_account_id: acc.id, ad_account_name: acc.name });
        }
      }
    } catch (e) {
      on_log({ etapa: 'erro_campanhas', ad_account: acc.id, erro: e.message });
    }
  }
  on_log({ etapa: 'campanhas_match', total: campanhasMatch.length });

  if (campanhasMatch.length === 0) {
    return { listados: 0, top_vendedores: 0, top_escalados: 0, salvos: 0, falhas: 0 };
  }

  // 3. Pra cada campanha: lista anúncios + busca insights (CPA + spend nos últimos N dias)
  const time_range = JSON.stringify({
    since: _dataIsoNDiasAtras(janela_dias),
    until: _dataIsoNDiasAtras(0),
  });

  const anunciosComMetricas = [];
  for (const camp of campanhasMatch) {
    try {
      const adsRes = await meta.listarAds({ parent_id: camp.id, limit: 100 });
      const ads = (adsRes && adsRes.data) || [];
      for (const ad of ads) {
        try {
          // Busca insights do anúncio (level=ad)
          const insRes = await meta.insightsCampanha({ campaign_id: ad.id, time_range, level: 'ad' });
          const ins = (insRes && insRes.data && insRes.data[0]) || null;
          if (!ins || !ins.spend) continue;

          const spend = parseFloat(ins.spend) || 0;
          if (spend < MIN_SPEND_USD) continue; // descarta anúncios com gasto irrelevante

          // CPA = spend / conversions (purchase ou onsite_conversion.purchase)
          const purchases = _extrairConversoes(ins.actions);
          const cpa = purchases > 0 ? spend / purchases : null;

          anunciosComMetricas.push({
            ad_id: ad.id,
            ad_name: ad.name,
            campaign_id: camp.id,
            campaign_name: camp.name,
            ad_account_name: camp.ad_account_name,
            creative_id: ad.creative?.id || null,
            spend,
            impressions: parseInt(ins.impressions, 10) || 0,
            clicks: parseInt(ins.clicks, 10) || 0,
            ctr: parseFloat(ins.ctr) || 0,
            cpm: parseFloat(ins.cpm) || 0,
            cpc: parseFloat(ins.cpc) || 0,
            purchases,
            cpa,
            created_time: ad.created_time,
          });
        } catch (e) {
          on_log({ etapa: 'erro_insights', ad_id: ad.id, erro: e.message });
        }
      }
    } catch (e) {
      on_log({ etapa: 'erro_ads', campaign_id: camp.id, erro: e.message });
    }
  }
  on_log({ etapa: 'anuncios_com_metricas', total: anunciosComMetricas.length });

  if (anunciosComMetricas.length === 0) {
    return { listados: campanhasMatch.length, top_vendedores: 0, top_escalados: 0, salvos: 0, falhas: 0 };
  }

  // 4. Top 20% em CPA mais baixo (vendedores) — só os que têm purchases
  const comPurchase = anunciosComMetricas.filter(a => a.cpa !== null);
  const topVendedoresN = Math.max(1, Math.floor(comPurchase.length * top_percent / 100));
  const topVendedores = [...comPurchase].sort((a, b) => a.cpa - b.cpa).slice(0, topVendedoresN);

  // 5. Top 20% em maior investimento (escalados)
  const topEscaladosN = Math.max(1, Math.floor(anunciosComMetricas.length * top_percent / 100));
  const topEscalados = [...anunciosComMetricas].sort((a, b) => b.spend - a.spend).slice(0, topEscaladosN);

  // 6. União dos dois (sem duplicar)
  const escolhidosMap = new Map();
  for (const a of topVendedores) escolhidosMap.set(a.ad_id, { ...a, motivo: ['top_cpa_baixo'] });
  for (const a of topEscalados) {
    if (escolhidosMap.has(a.ad_id)) escolhidosMap.get(a.ad_id).motivo.push('top_investimento');
    else escolhidosMap.set(a.ad_id, { ...a, motivo: ['top_investimento'] });
  }
  const escolhidos = Array.from(escolhidosMap.values());
  on_log({ etapa: 'escolhidos_para_salvar', total: escolhidos.length, top_vendedores: topVendedores.length, top_escalados: topEscalados.length });

  // 7. Pra cada escolhido: extrai criativo (copy + thumb) + salva + vetoriza
  let salvos = 0, falhas = 0;
  for (const a of escolhidos) {
    try {
      // Idempotência: se já tem essa fonte (mesmo ad_id), atualiza em vez de duplicar
      const jaExiste = await db.rodarSQL(`
        SELECT cerebro_fonte_id FROM pinguim.fontes_processadas
        WHERE cerebro_id = '${cerebro_id}'::uuid
          AND categoria_slug = 'anuncios_meta'
          AND fonte_origem = 'meta_ads'
          AND fonte_externa_id = '${a.ad_id}'
        LIMIT 1;
      `);

      let creativeData = {};
      if (a.creative_id) {
        try {
          creativeData = await meta.detalheCriativo({ creative_id: a.creative_id });
        } catch (e) {
          on_log({ etapa: 'erro_criativo', ad_id: a.ad_id, erro: e.message });
        }
      }

      const titulo = `${a.campaign_name} — ${a.ad_name}`.slice(0, 200);
      const conteudoMd = _montarMd({ a, creativeData });

      if (jaExiste && jaExiste[0]) {
        // Atualiza
        await db.rodarSQL(`
          UPDATE pinguim.cerebro_fontes
             SET conteudo_md = ${_esc(conteudoMd)},
                 atualizado_em = now()
           WHERE id = '${jaExiste[0].cerebro_fonte_id}'::uuid;
        `);
        // re-vetoriza
        await vetorizarFonte(jaExiste[0].cerebro_fonte_id, { silencioso: true });
        on_log({ etapa: 'atualizou', ad_id: a.ad_id, motivo: a.motivo.join(',') });
      } else {
        const fonte = await db.inserirFonteRest({
          cerebro_id,
          tipo: 'anuncio_meta',
          titulo,
          origem: 'meta_ads',
          url: `https://business.facebook.com/adsmanager/manage/ads?act=${(a.ad_account_name || '').replace(/[^\d]/g, '')}&selected_ad_ids=${a.ad_id}`,
          conteudo_md: conteudoMd,
        });
        await db.rodarSQL(`
          INSERT INTO pinguim.fontes_processadas
            (cerebro_id, categoria_slug, fonte_externa_id, fonte_origem, cerebro_fonte_id, metadata)
          VALUES (
            '${cerebro_id}'::uuid,
            'anuncios_meta',
            ${_esc(a.ad_id)},
            'meta_ads',
            '${fonte.id}'::uuid,
            ${_esc(JSON.stringify({ motivo: a.motivo, spend: a.spend, cpa: a.cpa, ctr: a.ctr, purchases: a.purchases, campaign_id: a.campaign_id }))}::jsonb
          ) ON CONFLICT DO NOTHING;
        `);
        await vetorizarFonte(fonte.id, { silencioso: true });
        on_log({ etapa: 'salvou', ad_id: a.ad_id, motivo: a.motivo.join(','), cerebro_fonte_id: fonte.id });
      }
      salvos++;
    } catch (e) {
      on_log({ etapa: 'falha', ad_id: a.ad_id, erro: e.message });
      falhas++;
    }
  }

  return {
    listados: campanhasMatch.length,
    com_metricas: anunciosComMetricas.length,
    top_vendedores: topVendedores.length,
    top_escalados: topEscalados.length,
    salvos,
    falhas,
  };
}

// ============================================================
// Helpers
// ============================================================

function _extrairConversoes(actions) {
  if (!Array.isArray(actions)) return 0;
  const tipos = ['offsite_conversion.fb_pixel_purchase', 'onsite_conversion.purchase', 'purchase', 'omni_purchase'];
  let total = 0;
  for (const a of actions) {
    if (tipos.includes(a.action_type)) total += parseInt(a.value, 10) || 0;
  }
  return total;
}

function _dataIsoNDiasAtras(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function _montarMd({ a, creativeData }) {
  const linhas = [];
  linhas.push(`# Anúncio Meta — ${a.ad_name}`);
  linhas.push('');
  linhas.push('## Por que foi selecionado');
  for (const m of a.motivo) {
    linhas.push(`- ${m === 'top_cpa_baixo' ? '🎯 Top 20% em CPA mais baixo (vende muito)' : '💰 Top 20% em investimento (escalado pelo time)'}`);
  }
  linhas.push('');
  linhas.push('## Performance (últimos 90 dias)');
  linhas.push(`- **Gasto**: $${a.spend.toFixed(2)}`);
  linhas.push(`- **Compras**: ${a.purchases}`);
  if (a.cpa !== null) linhas.push(`- **CPA**: $${a.cpa.toFixed(2)}`);
  linhas.push(`- **Impressões**: ${a.impressions.toLocaleString('pt-BR')}`);
  linhas.push(`- **Cliques**: ${a.clicks.toLocaleString('pt-BR')}`);
  linhas.push(`- **CTR**: ${a.ctr.toFixed(2)}%`);
  linhas.push(`- **CPM**: $${a.cpm.toFixed(2)}`);
  linhas.push(`- **CPC**: $${a.cpc.toFixed(2)}`);
  linhas.push('');
  linhas.push('## Contexto');
  linhas.push(`- **Campanha**: ${a.campaign_name}`);
  linhas.push(`- **Conta**: ${a.ad_account_name}`);
  linhas.push(`- **Criado em**: ${a.created_time}`);
  linhas.push('');

  if (creativeData) {
    const title = creativeData.title || creativeData.object_story_spec?.link_data?.title;
    const body = creativeData.body || creativeData.object_story_spec?.link_data?.message
                 || creativeData.object_story_spec?.video_data?.message;
    const cta = creativeData.call_to_action_type || creativeData.object_story_spec?.link_data?.call_to_action?.type;
    const link = creativeData.link_url || creativeData.object_story_spec?.link_data?.link;

    linhas.push('## Criativo');
    if (title) linhas.push(`### Título\n${title}\n`);
    if (body) linhas.push(`### Copy do anúncio\n${body}\n`);
    if (cta) linhas.push(`### Call-to-Action\n${cta}\n`);
    if (link) linhas.push(`### Link de destino\n${link}\n`);
    if (creativeData.thumbnail_url) linhas.push(`### Thumbnail\n![thumb](${creativeData.thumbnail_url})\n`);
  }

  return linhas.join('\n');
}

function _esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { processarAnunciosMeta };
