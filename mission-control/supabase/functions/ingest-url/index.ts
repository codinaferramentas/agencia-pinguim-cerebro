// ========================================================================
// Edge Function: ingest-url
// ========================================================================
// Recebe URL (YouTube, Instagram, TikTok) -> extrai texto -> cria fonte
// no Cerebro -> chunk + vetoriza. Mesmo motor que ingest-pacote, so muda
// a fonte do conteudo.
//
// Estrategia em cascata pra YouTube:
//   1. Legendas oficiais (timedtext API) — gratis, ~95% dos videos
//   2. RapidAPI YouTube Transcriber — pago, ~R$0.15 por video (fallback)
//   3. Quarentena com motivo claro
//
// Apify (Instagram/TikTok) — chamada direta com chave do usuario.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const CLASSIFIER_MODEL = 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function sbAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

async function requireAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return false;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(jwt);
  return !error && !!data?.user;
}

// ---------- URL parsing ----------
type TipoUrl = 'youtube' | 'instagram' | 'tiktok' | 'meta-ads' | 'site' | 'desconhecido';

function detectarTipoUrl(url: string): TipoUrl {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtube.com' || h === 'youtu.be' || h === 'm.youtube.com') return 'youtube';
    if (h === 'instagram.com') return 'instagram';
    if (h === 'tiktok.com' || h === 'vm.tiktok.com') return 'tiktok';
    if ((h === 'facebook.com' || h === 'm.facebook.com') && u.pathname.startsWith('/ads/library')) return 'meta-ads';
    // Qualquer URL http(s) cai como "site" (pagina de vendas, blog, artigo, etc)
    if (u.protocol === 'http:' || u.protocol === 'https:') return 'site';
    return 'desconhecido';
  } catch { return 'desconhecido'; }
}

function extrairVideoIdYoutube(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    // shorts
    const m = u.pathname.match(/\/shorts\/([^/?]+)/);
    if (m) return m[1];
    const m2 = u.pathname.match(/\/embed\/([^/?]+)/);
    if (m2) return m2[1];
    return null;
  } catch { return null; }
}

// ---------- YouTube: legendas oficiais (timedtext API) ----------
// Endpoint publico do YouTube que devolve XML com legendas.
async function tentarLegendasYoutube(videoId: string): Promise<{ titulo: string; texto: string } | null> {
  // Pega meta + lista de tracks via oembed (titulo) e timedtext (legendas)
  let titulo = `YouTube ${videoId}`;
  try {
    const oembedResp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedResp.ok) {
      const meta = await oembedResp.json();
      if (meta.title) titulo = meta.title;
    }
  } catch {}

  // Tenta linguagens em ordem (pt-BR, pt, en, qualquer)
  const langs = ['pt-BR', 'pt', 'en'];
  for (const lang of langs) {
    try {
      const tt = await fetch(`https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}`);
      if (!tt.ok) continue;
      const xml = await tt.text();
      if (!xml || xml.length < 50) continue;
      const texto = parseTimedTextXml(xml);
      if (texto && texto.length > 100) return { titulo, texto };
    } catch {}
  }

  // Fallback sem lang especifica (YouTube as vezes serve a default)
  try {
    const tt = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}`);
    if (tt.ok) {
      const xml = await tt.text();
      const texto = parseTimedTextXml(xml);
      if (texto && texto.length > 100) return { titulo, texto };
    }
  } catch {}

  return null;
}

function parseTimedTextXml(xml: string): string {
  // Extrai conteudo de cada <text>...</text>
  const matches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g) || [];
  const linhas = matches.map(m => {
    const conteudo = m.replace(/<[^>]+>/g, '');
    return decodeHtml(conteudo).trim();
  }).filter(l => l.length > 0);
  return linhas.join(' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ---------- Apify: token unico, escolhe ator pelo dominio da URL ----------
// Mapa: tipo de URL -> ator Apify oficial recomendado + builder de input
const APIFY_ATORES: Record<string, { actor: string; buildInput: (url: string) => any; custoEstimado: number }> = {
  instagram: {
    // Instagram Reel Scraper — retorna caption + transcript + metricas
    actor: 'apify~instagram-reel-scraper',
    buildInput: (url: string) => {
      // Aceita URLs de reel diretas OU usernames (nesse caso vira "username")
      if (/instagram\.com\/(p|reel|tv)\//.test(url)) {
        return { directUrls: [url], resultsLimit: 1 };
      }
      // URL de perfil — extrai username
      const m = url.match(/instagram\.com\/([^/?]+)/);
      const username = m ? m[1] : null;
      return username
        ? { username: [username], resultsLimit: 5 }
        : { directUrls: [url], resultsLimit: 1 };
    },
    custoEstimado: 0.005, // ~$1/1000 reels
  },
  tiktok: {
    actor: 'clockworks~free-tiktok-scraper',
    buildInput: (url: string) => ({
      postURLs: [url],
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: true, // pega legenda do video se tiver
    }),
    custoEstimado: 0.003,
  },
  youtube: {
    actor: 'streamers~youtube-scraper',
    buildInput: (url: string) => ({
      startUrls: [{ url }],
      maxResults: 1,
      subtitlesLanguage: 'any',
      subtitlesFormat: 'plaintext',
      saveSubsToKVS: false,
    }),
    custoEstimado: 0.005,
  },
  site: {
    // Web scraper genérico — pega texto de qualquer URL (página de vendas, blog, artigo)
    actor: 'apify~website-content-crawler',
    buildInput: (url: string) => ({
      startUrls: [{ url }],
      maxCrawlPages: 1,           // só a página em questão (sem seguir links)
      maxCrawlDepth: 0,
      crawlerType: 'cheerio',     // mais rápido e barato que browser
      saveHtml: false,
      saveMarkdown: true,
      removeCookieWarnings: true,
      maxRequestRetries: 2,
    }),
    custoEstimado: 0.002,
  },
  'meta-ads': {
    // Meta Ad Library — espia anúncios de concorrente
    actor: 'curious_coder~facebook-ads-library-scraper',
    buildInput: (url: string) => ({
      urls: [{ url }],
      count: 50,                  // até 50 anúncios da query
    }),
    custoEstimado: 0.01,
  },
};

async function tentarApify(url: string, tipo: 'instagram' | 'tiktok' | 'youtube' | 'site' | 'meta-ads'): Promise<{ titulo: string; texto: string; custo_usd: number; metodo: string } | null> {
  const sb = sbAdmin();
  const { data: integ } = await sb.from('integracoes')
    .select('chave_secreta, status')
    .eq('slug', 'apify')
    .single();
  if (!integ?.chave_secreta || integ.status !== 'ativa') return null;

  const config = APIFY_ATORES[tipo];
  if (!config) return null;

  try {
    const input = config.buildInput(url);
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${config.actor}/run-sync-get-dataset-items?timeout=120`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${integ.chave_secreta}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      }
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`Apify ${config.actor} HTTP ${resp.status}: ${errBody.slice(0, 300)}`);
      return null;
    }

    const items = await resp.json();
    if (!Array.isArray(items) || items.length === 0) return null;

    // Consolida items em texto unico
    const partes: string[] = [];
    let titulo = '';

    // ----- Tratamento por tipo (cada ator retorna estrutura diferente) -----
    if (tipo === 'site') {
      // website-content-crawler: { url, title, text, markdown, metadata }
      items.forEach((page: any, idx: number) => {
        if (idx === 0) titulo = page.title || page.metadata?.title || `Página ${url.slice(-40)}`;
        const conteudo = page.markdown || page.text || page.content || '';
        if (conteudo) partes.push(conteudo.trim());
      });
    } else if (tipo === 'meta-ads') {
      // Ad Library: cada item é um anúncio com adText, snapshot, etc
      titulo = `Biblioteca de Anúncios · ${url.slice(-50)}`;
      partes.push(`URL pesquisada: ${url}\n\nTotal de anúncios capturados: ${items.length}\n`);
      items.forEach((ad: any, idx: number) => {
        const linhas: string[] = [`--- Anúncio ${idx + 1} ---`];
        if (ad.pageName) linhas.push(`Página: ${ad.pageName}`);
        const texto = ad.adText || ad.snapshot?.body?.text || ad.body || '';
        if (texto) linhas.push(texto.trim());
        if (ad.snapshot?.title) linhas.push(`Headline: ${ad.snapshot.title}`);
        if (ad.snapshot?.cta_text) linhas.push(`CTA: ${ad.snapshot.cta_text}`);
        if (ad.startDate) linhas.push(`Veiculação desde: ${ad.startDate}`);
        if (ad.publisherPlatforms?.length) linhas.push(`Plataformas: ${ad.publisherPlatforms.join(', ')}`);
        partes.push(linhas.join('\n'));
      });
    } else {
      // Instagram / TikTok / YouTube — caminho original
      items.forEach((post: any, idx: number) => {
        const linhas: string[] = [];

        // Titulo do primeiro item vira o titulo da fonte
        if (idx === 0) {
          titulo = post.title || post.caption?.slice(0, 80) || post.text?.slice(0, 80) || `${tipo} ${url.slice(-30)}`;
        }

        // Header do item (se for multi)
        if (items.length > 1) linhas.push(`--- Item ${idx + 1} ---`);

        // Caption / texto
        const caption = post.caption || post.text || post.title || '';
        if (caption) linhas.push(caption.trim());

        // Transcript (Reel scraper retorna isso direto, TikTok via subtitle, YouTube via subtitle)
        const transcript = post.transcript || post.subtitles || post.subtitle || post.captionText;
        if (transcript && typeof transcript === 'string' && transcript.trim()) {
          linhas.push('\n[Transcrição do áudio]');
          linhas.push(transcript.trim());
        }

        // Hashtags
        if (Array.isArray(post.hashtags) && post.hashtags.length) {
          linhas.push(`Hashtags: ${post.hashtags.map((h: string) => h.startsWith('#') ? h : '#' + h).join(' ')}`);
        }

        // Musica
        if (post.musicInfo?.song_name || post.musicMeta?.musicName) {
          linhas.push(`Som: ${post.musicInfo?.song_name || post.musicMeta?.musicName}`);
        }

        // Metricas (sinaliza viralidade)
        const metricas: string[] = [];
        if (post.likesCount != null) metricas.push(`${post.likesCount} curtidas`);
        if (post.diggCount != null) metricas.push(`${post.diggCount} curtidas`);
        if (post.viewsCount != null) metricas.push(`${post.viewsCount} views`);
        if (post.playsCount != null) metricas.push(`${post.playsCount} plays`);
        if (post.commentsCount != null) metricas.push(`${post.commentsCount} comentários`);
        if (post.commentCount != null) metricas.push(`${post.commentCount} comentários`);
        if (post.shareCount != null) metricas.push(`${post.shareCount} compart.`);
        if (post.viewCount != null) metricas.push(`${post.viewCount} views`);
        if (metricas.length) linhas.push(`Métricas: ${metricas.join(' · ')}`);

        // Comentarios recentes (se tiver — vira sinal de objeção/depoimento)
        const comments = post.latestComments || post.comments || [];
        if (Array.isArray(comments) && comments.length) {
          linhas.push('\n[Comentários recentes]');
          comments.slice(0, 10).forEach((c: any) => {
            const txt = c.text || c.content || '';
            const autor = c.ownerUsername || c.user || c.uniqueId || '';
            if (txt) linhas.push(`@${autor}: ${txt}`);
          });
        }

        partes.push(linhas.join('\n'));
      });
    }

    const texto = partes.join('\n\n').trim();
    if (!texto || texto.length < 30) return null;

    return {
      titulo: titulo || `${tipo} post`,
      texto,
      custo_usd: config.custoEstimado * items.length,
      metodo: `apify-${tipo}`,
    };
  } catch (e) {
    console.error('Apify erro:', e);
    return null;
  }
}

// ---------- Classificacao + chunk + embed (mesmo da ingest-pacote) ----------
async function classificar(nome: string, amostra: string) {
  const prompt = `Classifique o conteudo em UM destes tipos:
- aula: transcricao de aula/video educacional
- pagina_venda: copy de landing/VSL
- depoimento: relato/feedback de aluno
- objecao: duvida/resistencia do publico
- sacada: insight/jaba interno
- pesquisa: resposta de pesquisa
- chat_export: export de chat
- pitch: roteiro de venda
- faq: pergunta-resposta
- externo: material de fora (artigo, podcast, video do YouTube, post de Instagram)
- outro: nao se encaixa

Responda APENAS JSON: {"tipo":"...","confianca":0.00,"justificativa":"..."}

Nome: ${nome}
Amostra:
${amostra.slice(0, 1500)}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    }),
  });
  if (!resp.ok) {
    return { tipo: 'externo', confianca: 0.5, justificativa: 'classifier indisponivel', tokens_in: 0, tokens_out: 0 };
  }
  const data = await resp.json();
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    return {
      tipo: parsed.tipo || 'externo',
      confianca: Number(parsed.confianca) || 0.5,
      justificativa: parsed.justificativa || '',
      tokens_in: data.usage?.prompt_tokens || 0,
      tokens_out: data.usage?.completion_tokens || 0,
    };
  } catch {
    return { tipo: 'externo', confianca: 0.5, justificativa: 'parse erro', tokens_in: 0, tokens_out: 0 };
  }
}

function chunkText(texto: string) {
  const chunks: { chunk_index: number; conteudo: string; token_count: number }[] = [];
  let i = 0, idx = 0;
  while (i < texto.length) {
    const conteudo = texto.slice(i, i + CHUNK_SIZE_CHARS);
    chunks.push({ chunk_index: idx, conteudo, token_count: Math.round(conteudo.length / 4) });
    i += CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS;
    idx++;
  }
  return chunks;
}

async function embed(textos: string[]): Promise<number[][]> {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: textos }),
  });
  if (!resp.ok) throw new Error(`embeddings ${resp.status}`);
  const data = await resp.json();
  return data.data.map((d: any) => d.embedding);
}

// ---------- Handler principal ----------
async function processarUrl(url: string, cerebro_id: string) {
  const tipo = detectarTipoUrl(url);
  if (tipo === 'desconhecido') throw new Error('URL inválida.');

  let resultado: { titulo: string; texto: string; custo_usd?: number; metodo: string } | null = null;
  let custo_total_usd = 0;

  if (tipo === 'youtube') {
    const videoId = extrairVideoIdYoutube(url);
    if (!videoId) throw new Error('Video do YouTube nao identificado na URL.');

    // 1. Legendas oficiais (gratis, ~95% dos videos)
    const legendas = await tentarLegendasYoutube(videoId);
    if (legendas) {
      resultado = { ...legendas, custo_usd: 0, metodo: 'youtube-legendas' };
    } else {
      // 2. Apify YouTube Scraper (fallback se Apify configurado)
      const apify = await tentarApify(url, 'youtube');
      if (apify) {
        resultado = apify;
        custo_total_usd += apify.custo_usd;
      } else {
        throw new Error('Vídeo sem legendas oficiais. Pra rodar fallback, configure Apify em "Integrações" no menu lateral.');
      }
    }
  } else if (tipo === 'instagram' || tipo === 'tiktok' || tipo === 'site' || tipo === 'meta-ads') {
    const apify = await tentarApify(url, tipo);
    if (apify) {
      resultado = apify;
      custo_total_usd += apify.custo_usd;
    } else {
      const labelTipo = {
        instagram: 'Instagram',
        tiktok: 'TikTok',
        site: 'site (página de vendas, blog, artigo)',
        'meta-ads': 'Biblioteca de Anúncios do Meta',
      }[tipo];
      throw new Error(`Integração Apify não configurada. Configure em "Integrações" no menu lateral pra processar links de ${labelTipo}.`);
    }
  }

  if (!resultado || !resultado.texto || resultado.texto.length < 50) {
    throw new Error(`Nao foi possivel extrair texto da URL. ${tipo === 'youtube' ? 'Video pode nao ter legendas — configure RapidAPI em Integracoes pra fallback.' : ''}`);
  }

  // Classifica + insere fonte + chunks
  const sb = sbAdmin();
  const classif = await classificar(resultado.titulo, resultado.texto);
  custo_total_usd += (classif.tokens_in / 1_000_000) * 0.15 + (classif.tokens_out / 1_000_000) * 0.60;

  const { data: fonte, error: errFonte } = await sb.from('cerebro_fontes').insert({
    cerebro_id,
    tipo: classif.tipo,
    titulo: resultado.titulo,
    conteudo_md: resultado.texto,
    origem: 'url',
    autor: null,
    url,
    arquivo_nome: null,
    mime: null,
    tamanho_bytes: resultado.texto.length,
    ingest_status: 'processando',
    metadata: {
      classificacao: classif,
      url_original: url,
      metodo_extracao: resultado.metodo,
      custo_usd: custo_total_usd,
    },
  }).select('id').single();
  if (errFonte) throw new Error('Erro ao salvar fonte: ' + errFonte.message);

  // Chunk + embed
  const chunks = chunkText(resultado.texto);
  for (let i = 0; i < chunks.length; i += 50) {
    const slice = chunks.slice(i, i + 50);
    const vetores = await embed(slice.map(c => c.conteudo));
    const tokensSlice = slice.reduce((s, c) => s + c.token_count, 0);
    custo_total_usd += (tokensSlice / 1_000_000) * 0.02;
    const rows = slice.map((c, idx) => ({
      fonte_id: fonte!.id,
      cerebro_id,
      chunk_index: c.chunk_index,
      conteudo: c.conteudo,
      token_count: c.token_count,
      embedding: vetores[idx],
      embedding_model: EMBEDDING_MODEL,
    }));
    await sb.from('cerebro_fontes_chunks').insert(rows);
  }

  await sb.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonte!.id);

  // Atualiza ultima_alimentacao do cerebro
  await sb.from('cerebros').update({ ultima_alimentacao: new Date().toISOString() }).eq('id', cerebro_id);

  // Contabiliza uso na integracao
  const slugInteg = resultado.metodo === 'youtube-legendas' ? 'youtube-legendas'
    : resultado.metodo.startsWith('apify-') ? 'apify'
    : null;
  if (slugInteg) {
    const { data: cur } = await sb.from('integracoes').select('total_chamadas, custo_acumulado_usd').eq('slug', slugInteg).single();
    await sb.from('integracoes').update({
      ultimo_uso: new Date().toISOString(),
      total_chamadas: (cur?.total_chamadas || 0) + 1,
      custo_acumulado_usd: Number(cur?.custo_acumulado_usd || 0) + custo_total_usd,
    }).eq('slug', slugInteg);
  }

  return {
    ok: true,
    fonte_id: fonte!.id,
    titulo: resultado.titulo,
    metodo: resultado.metodo,
    chunks: chunks.length,
    custo_usd: Number(custo_total_usd.toFixed(6)),
    tipo: classif.tipo,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);

  if (!(await requireAuth(req))) return jsonResp({ error: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON invalido' }, 400); }

  const { url, cerebro_id } = body;
  if (!url || !cerebro_id) return jsonResp({ error: 'url e cerebro_id obrigatorios' }, 400);

  try {
    const r = await processarUrl(url, cerebro_id);
    return jsonResp(r);
  } catch (e: any) {
    return jsonResp({ error: e.message || String(e) }, 500);
  }
});
