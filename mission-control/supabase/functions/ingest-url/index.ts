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
function detectarTipoUrl(url: string): 'youtube' | 'instagram' | 'tiktok' | 'desconhecido' {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtube.com' || h === 'youtu.be' || h === 'm.youtube.com') return 'youtube';
    if (h === 'instagram.com') return 'instagram';
    if (h === 'tiktok.com' || h === 'vm.tiktok.com') return 'tiktok';
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

// ---------- YouTube: RapidAPI fallback ----------
async function tentarRapidApiYoutube(videoId: string): Promise<{ titulo: string; texto: string; custo_usd: number } | null> {
  // Busca chave da integracao
  const sb = sbAdmin();
  const { data: integ } = await sb.from('integracoes')
    .select('chave_secreta, status')
    .eq('slug', 'rapidapi-youtube')
    .single();
  if (!integ?.chave_secreta || integ.status !== 'ativa') return null;

  try {
    const resp = await fetch(`https://youtube-transcriber-api.p.rapidapi.com/api/transcript?videoId=${videoId}`, {
      headers: {
        'x-rapidapi-key': integ.chave_secreta,
        'x-rapidapi-host': 'youtube-transcriber-api.p.rapidapi.com',
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const texto = Array.isArray(data) ? data.map((s: any) => s.text || '').join(' ') : (data.transcript || data.text || '');
    if (!texto || texto.length < 100) return null;
    return { titulo: `YouTube ${videoId}`, texto: texto.trim(), custo_usd: 0.025 }; // estimativa
  } catch (e) {
    console.error('RapidAPI erro:', e);
    return null;
  }
}

// ---------- Apify: Instagram/TikTok ----------
async function tentarApify(url: string, tipo: 'instagram' | 'tiktok'): Promise<{ titulo: string; texto: string; custo_usd: number } | null> {
  const sb = sbAdmin();
  const { data: integ } = await sb.from('integracoes')
    .select('chave_secreta, status')
    .eq('slug', 'apify-instagram')
    .single();
  if (!integ?.chave_secreta || integ.status !== 'ativa') return null;

  // Apify Instagram Post Scraper / TikTok Scraper publicos
  const actorId = tipo === 'instagram' ? 'apify~instagram-post-scraper' : 'clockworks~tiktok-scraper';

  try {
    const resp = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${integ.chave_secreta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tipo === 'instagram' ? { directUrls: [url] } : { postURLs: [url] }),
    });
    if (!resp.ok) {
      console.error(`Apify HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return null;
    }
    const items = await resp.json();
    if (!Array.isArray(items) || items.length === 0) return null;
    const post = items[0];

    // Monta texto consolidado: caption + hashtags + transcricao se houver
    const partes: string[] = [];
    if (post.caption || post.text) partes.push((post.caption || post.text).trim());
    if (Array.isArray(post.hashtags)) partes.push('Hashtags: ' + post.hashtags.join(' '));
    if (post.musicMeta?.musicName) partes.push(`Som: ${post.musicMeta.musicName}`);
    if (post.diggCount != null) partes.push(`${post.diggCount} curtidas`);

    const titulo = post.caption?.slice(0, 80) || post.title || `${tipo} post`;
    const texto = partes.join('\n\n');
    if (!texto || texto.length < 30) return null;
    return { titulo, texto, custo_usd: 0.015 };
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
  if (tipo === 'desconhecido') throw new Error('URL nao reconhecida. Suportado: YouTube, Instagram, TikTok.');

  let resultado: { titulo: string; texto: string; custo_usd?: number; metodo: string } | null = null;
  let custo_total_usd = 0;

  if (tipo === 'youtube') {
    const videoId = extrairVideoIdYoutube(url);
    if (!videoId) throw new Error('Video do YouTube nao identificado na URL.');

    // 1. Legendas oficiais (gratis)
    const legendas = await tentarLegendasYoutube(videoId);
    if (legendas) {
      resultado = { ...legendas, custo_usd: 0, metodo: 'youtube-legendas' };
    } else {
      // 2. RapidAPI fallback
      const rapid = await tentarRapidApiYoutube(videoId);
      if (rapid) {
        resultado = { ...rapid, metodo: 'youtube-rapidapi' };
        custo_total_usd += rapid.custo_usd;
      }
    }
  } else if (tipo === 'instagram' || tipo === 'tiktok') {
    const apify = await tentarApify(url, tipo);
    if (apify) {
      resultado = { ...apify, metodo: `apify-${tipo}` };
      custo_total_usd += apify.custo_usd;
    } else {
      throw new Error(`Integracao Apify nao configurada. Configure em "Integrações" no menu lateral pra processar links de ${tipo}.`);
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
    : resultado.metodo === 'youtube-rapidapi' ? 'rapidapi-youtube'
    : resultado.metodo.startsWith('apify-') ? 'apify-instagram'
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
