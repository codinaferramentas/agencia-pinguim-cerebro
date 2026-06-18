// ============================================================
// processar-aula-youtube.js — V1 (2026-06-17)
// ============================================================
// Recebe URL de UM video do YouTube, busca transcript via Apify
// (pintostudio/youtube-transcript-scraper) + metadata via YouTube
// Data API v3, salva como cerebro_fonte tipo='transcricao_midia'
// no cerebro destino, vetoriza.
//
// Manual: 1 URL = 1 video (NAO playlist em lote — Andre cravou).
// Idempotente: hash da URL como fonte_externa_id em fontes_processadas.
// ============================================================

const db = require('./db');
const { vetorizarFonte } = require('./vetorizar-fonte');
const crypto = require('crypto');

const APIFY_ACTOR = 'pintostudio~youtube-transcript-scraper';

/**
 * Processa UMA aula do YouTube.
 * @param {object} args
 * @param {string} args.cerebro_id
 * @param {string} args.categoria_slug   - default 'transcricoes_aula_ao_vivo'
 * @param {string} args.url              - URL do video (youtube.com/watch ou youtu.be ou /shorts)
 * @param {function} [args.on_log]
 * @returns {Promise<{ok, ja_existia?, fonte_id?, titulo?, duracao_segundos?, transcript_chars?, vetorizado?, chunks?, erro?}>}
 */
async function processarAulaYoutube({ cerebro_id, categoria_slug = 'transcricoes_aula_ao_vivo', url, on_log = () => {} }) {
  if (!cerebro_id) return { ok: false, erro: 'cerebro_id obrigatorio' };
  if (!url) return { ok: false, erro: 'url obrigatoria' };

  const videoId = _extrairVideoId(url);
  if (!videoId) return { ok: false, erro: 'URL nao e do YouTube (ou formato nao reconhecido)' };

  // URL canonica pra idempotencia
  const urlCanonica = `https://www.youtube.com/watch?v=${videoId}`;
  const fonteExternaId = 'yt:' + crypto.createHash('sha1').update(urlCanonica).digest('hex').slice(0, 24);

  on_log({ etapa: 'inicio', video_id: videoId });

  // 1) Checa idempotencia
  const ja = await db.rodarSQL(`
    SELECT cerebro_fonte_id FROM pinguim.fontes_processadas
    WHERE cerebro_id = '${cerebro_id}'::uuid
      AND categoria_slug = ${_esc(categoria_slug)}
      AND fonte_externa_id = ${_esc(fonteExternaId)}
    LIMIT 1;
  `);
  if (ja && ja[0]) {
    on_log({ etapa: 'ja_processado', cerebro_fonte_id: ja[0].cerebro_fonte_id });
    return { ok: true, ja_existia: true, fonte_id: ja[0].cerebro_fonte_id };
  }

  // 2) Carrega chaves do cofre
  const [apifyToken, youtubeKey] = await Promise.all([
    db.lerChaveSistema('APIFY_TOKEN', 'processar-aula-youtube'),
    db.lerChaveSistema('YOUTUBE_API_KEY', 'processar-aula-youtube').catch(() => null),
  ]);
  if (!apifyToken) return { ok: false, erro: 'APIFY_TOKEN nao encontrado no cofre' };

  // 3) Em paralelo: transcript (Apify) + metadata (YouTube Data API, se tiver chave)
  on_log({ etapa: 'baixando', video_id: videoId });
  const [transR, metaR] = await Promise.allSettled([
    _getTranscriptApify(videoId, apifyToken),
    youtubeKey ? _getMetadataYoutube(videoId, youtubeKey) : Promise.resolve(null),
  ]);

  if (transR.status === 'rejected') {
    return { ok: false, erro: `apify_falhou: ${transR.reason?.message || transR.reason}` };
  }
  const trans = transR.value || { texto: '', segmentos: 0 };
  if (!trans.texto || trans.texto.length < 100) {
    return { ok: false, erro: 'sem transcript (video sem legendas ou auto-caption indisponivel)' };
  }

  const meta = metaR.status === 'fulfilled' && metaR.value ? metaR.value : {
    titulo: `Aula YouTube ${videoId}`,
    canal: '', duracao_segundos: 0, publicado_em: null, views: 0, thumbnail: '', descricao: '',
  };

  on_log({
    etapa: 'transcript_ok',
    video_id: videoId,
    titulo: meta.titulo,
    chars: trans.texto.length,
    segmentos: trans.segmentos,
    duracao_s: meta.duracao_segundos,
  });

  // 4) Monta markdown estruturado
  const titulo = `Aula — ${meta.titulo}`.slice(0, 200);
  const dataPub = meta.publicado_em ? new Date(meta.publicado_em).toLocaleDateString('pt-BR') : '—';
  const duracaoTxt = meta.duracao_segundos
    ? `${Math.floor(meta.duracao_segundos / 60)}min ${meta.duracao_segundos % 60}s`
    : '—';

  const conteudoMd = [
    `# ${titulo}`,
    '',
    `**Canal:** ${meta.canal || '—'}`,
    `**Publicado em:** ${dataPub}`,
    `**Duracao:** ${duracaoTxt}`,
    meta.views ? `**Views:** ${meta.views.toLocaleString('pt-BR')}` : null,
    `**URL:** ${urlCanonica}`,
    `**Fonte transcript:** Apify (${APIFY_ACTOR})`,
    '',
    meta.descricao ? '## Descricao do video\n\n' + meta.descricao.slice(0, 2000) + '\n' : null,
    '## Transcricao',
    '',
    trans.texto,
  ].filter(Boolean).join('\n');

  // 5) Salva via REST (payload pode ser grande)
  on_log({ etapa: 'salvando_fonte', chars: conteudoMd.length });
  const fonte = await db.inserirFonteRest({
    cerebro_id,
    tipo: 'transcricao_midia',
    titulo,
    origem: 'youtube',
    url: urlCanonica,
    conteudo_md: conteudoMd,
  });

  // 6) Marca em fontes_processadas
  await db.rodarSQL(`
    INSERT INTO pinguim.fontes_processadas
      (cerebro_id, categoria_slug, fonte_externa_id, fonte_origem, cerebro_fonte_id, metadata)
    VALUES (
      '${cerebro_id}'::uuid,
      ${_esc(categoria_slug)},
      ${_esc(fonteExternaId)},
      'youtube',
      '${fonte.id}'::uuid,
      ${_esc(JSON.stringify({
        video_id: videoId,
        url: urlCanonica,
        titulo: meta.titulo,
        canal: meta.canal,
        duracao_segundos: meta.duracao_segundos,
        publicado_em: meta.publicado_em,
        transcript_chars: trans.texto.length,
        transcript_segmentos: trans.segmentos,
      }))}::jsonb
    ) ON CONFLICT DO NOTHING;
  `);

  // 7) Vetoriza (regra dura)
  on_log({ etapa: 'vetorizando' });
  const vet = await vetorizarFonte(fonte.id);
  on_log({ etapa: 'fim', fonte_id: fonte.id, vetorizado: vet.ok, chunks: vet.chunks });

  // 8) Promove o card no plano: sempre atualiza ultima_execucao + status_run,
  //    e se categoria estava em status "ainda nao rodou" (sem_coleta/planejada/em_construcao),
  //    promove pra "rodando" (manual). Nao mexe em nao_aplicavel/pausada/falhou.
  try {
    await db.rodarSQL(`
      UPDATE pinguim.cerebro_plano_categoria
         SET ultima_execucao = now(),
             ultimo_status_run = 'ok',
             status_automacao = CASE
               WHEN status_automacao IN ('sem_coleta','planejada','em_construcao') THEN 'rodando'
               ELSE status_automacao
             END,
             trigger_tipo = CASE
               WHEN trigger_tipo = 'manual' OR status_automacao IN ('sem_coleta','planejada','em_construcao')
                 THEN 'manual'
               ELSE trigger_tipo
             END,
             schedule_descricao = COALESCE(schedule_descricao, 'manual (cola URL no botão "Adicionar aula via YouTube")'),
             ferramenta = COALESCE(ferramenta, 'Apify pintostudio/youtube-transcript-scraper + YouTube Data API'),
             atualizado_em = now()
       WHERE cerebro_id = '${cerebro_id}'::uuid
         AND categoria_slug = ${_esc(categoria_slug)};
    `);
    on_log({ etapa: 'plano_atualizado' });
  } catch (e) {
    // Falha do update do plano NAO bloqueia: fonte ja foi salva e vetorizada
    on_log({ etapa: 'plano_atualizado_falhou', erro: e.message });
  }

  return {
    ok: true,
    fonte_id: fonte.id,
    titulo: meta.titulo,
    duracao_segundos: meta.duracao_segundos,
    transcript_chars: trans.texto.length,
    vetorizado: vet.ok,
    chunks: vet.chunks || 0,
    canal: meta.canal,
    publicado_em: meta.publicado_em,
  };
}

// ============================================================
// Extrai videoId de qualquer formato YouTube
// ============================================================
function _extrairVideoId(rawUrl) {
  if (!rawUrl) return null;
  const url = String(rawUrl).trim();
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1).split('/')[0] || null;
    }
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
    if (m) return m[2];
    return null;
  } catch {
    // Talvez seja so o videoId solto
    if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
    return null;
  }
}

// ============================================================
// Apify pintostudio/youtube-transcript-scraper
// ============================================================
async function _getTranscriptApify(videoId, apifyToken) {
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyToken}&timeout=180`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: `https://www.youtube.com/watch?v=${videoId}` }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Apify HTTP ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  if (!Array.isArray(j) || !j.length || !j[0].data) {
    return { texto: '', segmentos: 0 };
  }
  const segsRaw = Array.isArray(j[0].data) ? j[0].data : Object.values(j[0].data || {});
  if (!segsRaw.length) return { texto: '', segmentos: 0 };
  const texto = segsRaw.map(s => s.text || '').join(' ').replace(/\s+/g, ' ').trim();
  return { texto, segmentos: segsRaw.length };
}

// ============================================================
// YouTube Data API v3 — metadata (opcional)
// ============================================================
async function _getMetadataYoutube(videoId, apiKey) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`YouTube metadata HTTP ${r.status}`);
  const j = await r.json();
  if (!j.items || !j.items.length) throw new Error('Video nao encontrado (privado/deletado?)');
  const it = j.items[0];
  const sn = it.snippet || {};
  const st = it.statistics || {};
  const cd = it.contentDetails || {};
  return {
    titulo: sn.title || '',
    descricao: sn.description || '',
    canal: sn.channelTitle || '',
    views: Number(st.viewCount || 0),
    likes: Number(st.likeCount || 0),
    duracao_segundos: _parseISODuration(cd.duration || ''),
    publicado_em: sn.publishedAt || null,
    thumbnail: sn.thumbnails?.maxres?.url || sn.thumbnails?.high?.url || sn.thumbnails?.default?.url || '',
  };
}

function _parseISODuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function _esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { processarAulaYoutube, _extrairVideoId };
