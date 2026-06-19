// ============================================================
// processar-anuncios-meta.js — V4 (2026-06-19)
// ============================================================
// Lê campanhas/anúncios da Meta filtrando por keyword no nome
// (ex: "DCL", "Lofi" pra Lo-fi Desafio). Janela 90 dias.
//
// Pega top 20% em CPA mais baixo (vendedores) + top 20% em maior
// investimento (escalados). Pra cada anúncio: extrai TUDO que
// agente precisa pra dizer "regrava esse" / "faz variacao":
//   - IDs canonicos (ad_id, campaign_id, creative_id, video_id)
//   - Copy completa + headline + CTA + link destino
//   - Video URL + duracao + thumbnail HD (se eh video)
//   - Image URL HD (se eh static)
//   - Instagram permalink (se veio de post IG)
//   - Objective da campanha (Sales/Leads/Traffic/etc)
//   - Hook metrics: video_p25/p50/p75/p100, tempo medio assistido
//   - Breakdown demografico (idade x genero, regiao) do top que converteu
//   - Performance 90 dias (spend, CTR, CPA, etc)
//
// Salva como cerebro_fonte tipo 'anuncio_meta'. Vetoriza.
//
// REGRA UNIVERSAL (Andre 2026-06-19): este motor vale igual pra
// TODOS os produtos. Pra novo produto: so muda keywords.
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
          // V4: pede hook metrics no insights (video_p25/p50/p75/p100 + tempo medio)
          const insRes = await meta.insightsCampanha({
            campaign_id: ad.id,
            time_range,
            level: 'ad',
            fields_extra: 'video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions',
          });
          const ins = (insRes && insRes.data && insRes.data[0]) || null;
          if (!ins || !ins.spend) continue;

          const spend = parseFloat(ins.spend) || 0;
          if (spend < MIN_SPEND_USD) continue;

          const purchases = _extrairConversoes(ins.actions);
          const cpa = purchases > 0 ? spend / purchases : null;

          anunciosComMetricas.push({
            ad_id: ad.id,
            ad_name: ad.name,
            campaign_id: camp.id,
            campaign_name: camp.name,
            campaign_objective: camp.objective || null,
            ad_account_name: camp.ad_account_name,
            ad_account_id: camp.ad_account_id,
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
            // V4: hook metrics (so existem se for video)
            hook_p25:  _somarActionValues(ins.video_p25_watched_actions),
            hook_p50:  _somarActionValues(ins.video_p50_watched_actions),
            hook_p75:  _somarActionValues(ins.video_p75_watched_actions),
            hook_p100: _somarActionValues(ins.video_p100_watched_actions),
            video_avg_time: _somarActionValues(ins.video_avg_time_watched_actions),
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

      // V4: se eh video, busca URL fonte + duracao + miniatura HD
      let videoData = null;
      const videoId = creativeData?.video_id || creativeData?.object_story_spec?.video_data?.video_id;
      if (videoId) {
        try {
          videoData = await meta.detalheVideo({ video_id: videoId });
        } catch (e) {
          on_log({ etapa: 'erro_video', ad_id: a.ad_id, video_id: videoId, erro: e.message });
        }
      }

      // V4: breakdown demografico (idade x genero) — so chama pra top 10 escalados pra economizar quota
      let breakdownDemo = null;
      if (a.spend > MIN_SPEND_USD * 5) {
        try {
          const bdRes = await meta.insightsCampanha({
            campaign_id: a.ad_id,
            time_range,
            level: 'ad',
            breakdowns: 'age,gender',
          });
          breakdownDemo = (bdRes && bdRes.data) || null;
        } catch (e) {
          on_log({ etapa: 'erro_breakdown', ad_id: a.ad_id, erro: e.message });
        }
      }

      const titulo = `${a.campaign_name} — ${a.ad_name}`.slice(0, 200);
      const conteudoMd = _montarMd({ a, creativeData, videoData, breakdownDemo });

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
            ${_esc(JSON.stringify({
              motivo: a.motivo, spend: a.spend, cpa: a.cpa, ctr: a.ctr, purchases: a.purchases,
              campaign_id: a.campaign_id, campaign_objective: a.campaign_objective,
              creative_id: a.creative_id, video_id: videoId || null,
              video_url: videoData?.source || null, video_permalink: videoData?.permalink_url || null,
              image_url: creativeData?.image_url || null,
              instagram_permalink: creativeData?.instagram_permalink_url || null,
              hook_p25: a.hook_p25, hook_p75: a.hook_p75, hook_avg_time: a.video_avg_time,
            }))}::jsonb
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

function _montarMd({ a, creativeData, videoData, breakdownDemo }) {
  const linhas = [];
  linhas.push(`# Anúncio Meta — ${a.ad_name}`);
  linhas.push('');

  // IDs canonicos (NO TOPO pra agente pegar facil) — V4
  linhas.push('## 🆔 Identificadores');
  linhas.push(`- **ad_id**: \`${a.ad_id}\``);
  linhas.push(`- **campaign_id**: \`${a.campaign_id}\``);
  if (a.creative_id) linhas.push(`- **creative_id**: \`${a.creative_id}\``);
  if (videoData?.id) linhas.push(`- **video_id**: \`${videoData.id}\``);
  linhas.push(`- **ad_account_id**: \`${a.ad_account_id}\``);
  linhas.push(`- **Abrir no Ads Manager**: https://business.facebook.com/adsmanager/manage/ads?selected_ad_ids=${a.ad_id}`);
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

  // V4: hook metrics — quem assistiu ate onde
  if (a.hook_p25 > 0 || a.hook_p75 > 0) {
    linhas.push('## 🎬 Hook do vídeo (quanto segura)');
    if (a.hook_p25 > 0)  linhas.push(`- **Viram 25%**: ${a.hook_p25.toLocaleString('pt-BR')} pessoas`);
    if (a.hook_p50 > 0)  linhas.push(`- **Viram 50%**: ${a.hook_p50.toLocaleString('pt-BR')} pessoas`);
    if (a.hook_p75 > 0)  linhas.push(`- **Viram 75%**: ${a.hook_p75.toLocaleString('pt-BR')} pessoas`);
    if (a.hook_p100 > 0) linhas.push(`- **Viram 100%**: ${a.hook_p100.toLocaleString('pt-BR')} pessoas`);
    if (a.video_avg_time > 0) linhas.push(`- **Tempo médio assistido**: ${a.video_avg_time.toFixed(1)}s`);
    if (a.hook_p25 > 0) {
      const retencao = a.hook_p75 / a.hook_p25;
      linhas.push(`- **Retenção 25→75**: ${(retencao * 100).toFixed(1)}% (>50% = roteiro segura bem)`);
    }
    linhas.push('');
  }

  linhas.push('## Contexto');
  linhas.push(`- **Campanha**: ${a.campaign_name}`);
  if (a.campaign_objective) linhas.push(`- **Objetivo**: ${a.campaign_objective}`);
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
    if (creativeData.image_url) linhas.push(`### Imagem HD\n![img](${creativeData.image_url})\n`);
    else if (creativeData.thumbnail_url) linhas.push(`### Thumbnail\n![thumb](${creativeData.thumbnail_url})\n`);
    if (creativeData.instagram_permalink_url) linhas.push(`### 📱 Post original Instagram\n${creativeData.instagram_permalink_url}\n`);
  }

  // V4: video data
  if (videoData) {
    linhas.push('## 🎥 Vídeo (pra agente regravar/baixar)');
    if (videoData.length) linhas.push(`- **Duração**: ${videoData.length}s`);
    if (videoData.permalink_url) linhas.push(`- **Link público FB**: ${videoData.permalink_url}`);
    if (videoData.source) linhas.push(`- **URL fonte (MP4)**: ${videoData.source}`);
    if (videoData.picture) linhas.push(`- **Thumbnail HD**: ${videoData.picture}`);
    linhas.push('');
  }

  // V4: breakdown demografico
  if (breakdownDemo && breakdownDemo.length > 0) {
    linhas.push('## 👥 Quem comprou (top 5 segmentos)');
    const ordenado = [...breakdownDemo]
      .map(d => ({ ...d, purchases: _extrairConversoes(d.actions), spend: parseFloat(d.spend) || 0 }))
      .filter(d => d.purchases > 0)
      .sort((a, b) => b.purchases - a.purchases)
      .slice(0, 5);
    for (const seg of ordenado) {
      linhas.push(`- **${seg.age} · ${seg.gender}**: ${seg.purchases} compras · $${seg.spend.toFixed(2)} gasto`);
    }
    linhas.push('');
  }

  return linhas.join('\n');
}

// V4: soma actions/value de campos do tipo video_p25_watched_actions:[{action_type, value}]
function _somarActionValues(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
}

function _esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { processarAnunciosMeta };
