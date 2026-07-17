// ============================================================
// Edge Function: tool-analise-perfil-ig
// ============================================================
// Pipeline Raio-X Instagram completo (conforme ESPEC).
//
// Input: { handle, nicho, objetivo? }
// Output: { ok, html, json_intermediario, duration_seconds, custo_estimado }
//
// 9 etapas:
//  1. Apify scrape (~30-60s)
//  2. Normalização
//  3. Whisper paralelo nos reels (~25s)
//  4-5-7. IA Bio + Posts (top/worst) + Overview EM PARALELO (~13s)
//  6. IA single post nos intermediários (lotes de 4)
//  8. Imagens base64
//  9. Render HTML
//
// Tempo total: ~55-90s. Custo: ~$1 USD.
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { BIO_SYSTEM, POSTS_SYSTEM, SINGLE_POST_SYSTEM, OVERVIEW_SYSTEM, TOOL_BIO, TOOL_POSTS, TOOL_SINGLE_POST, TOOL_OVERVIEW } from './prompts.ts';
import { renderHtml } from './renderHtml.ts';

const APIFY_ACTOR = 'apify~instagram-scraper';

// ============================================================
// Utils
// ============================================================
function classifyContentBucket(p: any): 'professional' | 'personal' {
  const isVideo = p.type === 'Video' || p.productType === 'clips' || !!p.videoUrl;
  if (isVideo) return 'professional';
  const caption = (p.caption || '').toLowerCase();
  if (/(#tb|#throwback|#dubai|#travel|#viagem|#vacation)/i.test(caption)) return 'personal';
  if (caption.length < 30) return 'personal';
  return 'professional';
}

function calcEngagement(p: any, followers: number): number {
  const likes = p.likesCount || 0;
  const comments = p.commentsCount || 0;
  const views = p.videoViewCount || p.videoPlayCount || 0;
  const isVideo = p.type === 'Video' || p.productType === 'clips' || !!p.videoUrl;

  let er;
  if (isVideo && views > 0) er = (likes + 3 * comments) / views;
  else if (followers > 0) er = (likes + 3 * comments) / followers;
  else er = likes + 3 * comments;
  return parseFloat(er.toFixed(6));
}

function postType(p: any): string {
  const isVideo = p.type === 'Video' || p.productType === 'clips' || !!p.videoUrl;
  if (isVideo && p.productType === 'clips') return 'Reel';
  if (isVideo) return 'Video';
  if (p.type === 'Sidecar') return 'Carrossel';
  return 'Imagem';
}

function musicInfo(p: any): string | null {
  if (p.musicInfo?.song_name || p.musicInfo?.artist_name) {
    return [p.musicInfo.song_name, p.musicInfo.artist_name].filter(Boolean).join(' · ');
  }
  const isVideo = p.type === 'Video' || p.productType === 'clips' || !!p.videoUrl;
  return isVideo ? 'áudio original (presumido)' : null;
}

// ============================================================
// ETAPA 1: Apify scrape
// ============================================================
async function scrapeApify(handle: string, apifyToken: string): Promise<any> {
  const startResp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${apifyToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: 'details',
      resultsLimit: 9,
      searchType: 'user',
      searchLimit: 1,
      addParentData: false,
    }),
  });
  if (!startResp.ok) throw new Error(`Apify start: HTTP ${startResp.status}`);
  const startData = await startResp.json();
  const runId = startData.data?.id;
  const datasetId = startData.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error('Apify não retornou runId/datasetId');

  // Poll
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    await new Promise((r) => setTimeout(r, 3_000));
    const pollResp = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`);
    const pollData = await pollResp.json();
    const status = pollData.data?.status;
    if (status === 'SUCCEEDED') break;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) throw new Error(`Apify status: ${status}`);
  }
  if (Date.now() - start >= 90_000) throw new Error('Apify TIMEOUT');

  const dsResp = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?format=json&token=${apifyToken}`);
  const items = await dsResp.json();
  if (!Array.isArray(items) || items.length === 0) throw new Error('NOT_FOUND: perfil não encontrado');
  const data = items[0];
  if (data.private === true) throw new Error('PRIVATE_PROFILE: perfil é privado');
  return data;
}

// ============================================================
// ETAPA 2: Normalização
// ============================================================
function normalize(raw: any) {
  const followers = raw.followersCount || 0;
  const profile = {
    handle: raw.username,
    full_name: raw.fullName || raw.username,
    avatar_url: raw.profilePicUrlHD || raw.profilePicUrl,
    bio_text: raw.biography || '',
    followers,
    following: raw.followsCount || 0,
    posts_count: raw.postsCount || 0,
    is_verified: !!raw.verified,
    is_business: !!raw.isBusinessAccount,
    business_category: raw.businessCategoryName || null,
    bio_link: raw.externalUrls?.[0]?.url || '',
  };

  const posts = (raw.latestPosts || []).map((p: any) => {
    const isVideo = p.type === 'Video' || p.productType === 'clips' || !!p.videoUrl;
    return {
      post_id: p.id,
      shortcode: p.shortCode,
      url: p.url,
      post_type: postType(p),
      is_video: isVideo,
      timestamp: p.timestamp,
      likes: p.likesCount || 0,
      comments: p.commentsCount || 0,
      views: p.videoViewCount || p.videoPlayCount || 0,
      engagement_score: calcEngagement(p, followers),
      content_bucket: classifyContentBucket(p),
      full_caption: p.caption || '',
      hashtags: p.hashtags || [],
      mentions: p.mentions || [],
      location_name: p.locationName || null,
      music_info: musicInfo(p),
      thumb_url: p.displayUrl,
      video_url: p.videoUrl,
      video_duration: p.videoDuration,
      is_pinned: !!p.isPinned,
      tier: 'silver' as 'gold' | 'silver' | 'bronze',
    };
  });

  // Tiers (relativos à média)
  if (posts.length > 0) {
    const avg = posts.reduce((s: number, p: any) => s + p.engagement_score, 0) / posts.length;
    for (const p of posts) {
      if (p.engagement_score > avg * 2) p.tier = 'gold';
      else if (p.engagement_score >= avg) p.tier = 'silver';
      else p.tier = 'bronze';
    }
  }

  // Top/Worst (só profissional, fallback all)
  const pool = posts.filter((p: any) => p.content_bucket === 'professional');
  const target = pool.length > 0 ? pool : posts;
  let top = target[0], worst = target[0];
  for (const p of target) {
    if (p.engagement_score > top.engagement_score) top = p;
    if (p.engagement_score < worst.engagement_score) worst = p;
  }

  const professional = posts.filter((p: any) => p.content_bucket === 'professional');
  const personal = posts.filter((p: any) => p.content_bucket === 'personal');
  const metrics = {
    total_posts: posts.length,
    professional_count: professional.length,
    personal_count: personal.length,
    avg_likes_pro: professional.length ? professional.reduce((s: number, p: any) => s + p.likes, 0) / professional.length : 0,
    avg_comments_pro: professional.length ? professional.reduce((s: number, p: any) => s + p.comments, 0) / professional.length : 0,
    avg_views_pro: professional.length ? professional.reduce((s: number, p: any) => s + p.views, 0) / professional.length : 0,
    avg_engagement_pro: professional.length ? professional.reduce((s: number, p: any) => s + p.engagement_score, 0) / professional.length : 0,
  };

  return { profile, posts, top, worst, metrics, professional, personal };
}

// ============================================================
// ETAPA 3: Whisper (parallel)
// ============================================================
async function transcribePost(post: any, openaiKey: string): Promise<{ text: string | null; skipped_reason: string | null }> {
  if (!post.video_url) return { text: null, skipped_reason: 'sem video_url' };
  try {
    // Download video
    const vidResp = await fetch(post.video_url);
    if (!vidResp.ok) return { text: null, skipped_reason: 'download falhou' };
    const arrayBuffer = await vidResp.arrayBuffer();
    if (arrayBuffer.byteLength > 25 * 1024 * 1024) return { text: null, skipped_reason: 'video > 25MB' };

    // Whisper
    const form = new FormData();
    form.append('file', new Blob([arrayBuffer], { type: 'video/mp4' }), `${post.post_id}.mp4`);
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', 'pt');
    form.append('response_format', 'json');

    const wResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!wResp.ok) {
      const txt = await wResp.text();
      return { text: null, skipped_reason: `whisper ${wResp.status}: ${txt.slice(0, 80)}` };
    }
    const j = await wResp.json();
    const text = (j.text || '').trim();
    if (text.length < 20) return { text: null, skipped_reason: 'transcript < 20 chars' };
    return { text, skipped_reason: null };
  } catch (e) {
    return { text: null, skipped_reason: 'erro: ' + (e instanceof Error ? e.message : 'desconhecido') };
  }
}

// ============================================================
// ETAPA 4: IA Bio
// ============================================================
async function callOpenAI(opts: {
  systemPrompt: string;
  userMsg: string;
  tool: any;
  openaiKey: string;
  maxTokens: number;
  temperature?: number;
  model?: string;
}): Promise<any> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model || 'gpt-4o',
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userMsg },
      ],
      tools: [opts.tool],
      tool_choice: { type: 'function', function: { name: opts.tool.function.name } },
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const j = await resp.json();
  const toolCall = j.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error('Sem tool_call no retorno');
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch (e) {
    // Tenta reparo simples
    try {
      const raw = toolCall.function.arguments || '';
      return JSON.parse(raw + (raw.endsWith('}') ? '' : '}'));
    } catch {
      throw new Error('JSON inválido no tool_call: ' + (e instanceof Error ? e.message : ''));
    }
  }
}

function postBlock(label: string, post: any, transcript: { text: string | null; skipped_reason: string | null } | null): string {
  const lines = [`--- ${label} ---`];
  lines.push(`Tipo: ${post.post_type}${post.is_video ? ' (Reel/Vídeo)' : ''}`);
  lines.push(`Data: ${post.timestamp || 'N/A'}`);
  lines.push(`Métricas: ${post.likes} likes | ${post.comments} comentários${post.views ? ' | ' + post.views + ' views' : ''}`);
  lines.push(`Engagement score: ${post.engagement_score} | Tier: ${post.tier}`);
  lines.push(`Localização: ${post.location_name || 'N/A'}`);
  lines.push(`Música/áudio: ${post.music_info || 'N/A'}`);
  lines.push(`Hashtags (${(post.hashtags || []).length}): ${(post.hashtags || []).map((h: string) => '#' + h).join(' ') || 'NENHUMA'}`);
  lines.push(`Mentions: ${(post.mentions || []).map((m: string) => '@' + m).join(' ') || 'nenhuma'}`);
  lines.push('');
  lines.push('LEGENDA COMPLETA (literal):');
  lines.push('"""');
  lines.push(post.full_caption || '');
  lines.push('"""');
  lines.push('');
  if (transcript?.text) {
    lines.push('TRANSCRIÇÃO LITERAL DO ÁUDIO (Whisper):');
    lines.push('"""');
    lines.push(transcript.text);
    lines.push('"""');
  } else if (transcript?.skipped_reason) {
    lines.push(`TRANSCRIÇÃO: não disponível (${transcript.skipped_reason})`);
  } else if (!post.is_video) {
    lines.push('TRANSCRIÇÃO: não aplicável (não é vídeo)');
  }
  return lines.join('\n');
}

// ============================================================
// Validadores Bio (anti-alucinação)
// ============================================================
const NUMERIC_CLAIM_REGEX = /(?:\+?\d[\d.,]*\s*(?:k|mil|milhões?|milhoes?|M|bi|empresas?|clientes?|alunos?|pacientes?|protocolos?|semanas?|dias?|meses?|anos?|projetos?|pessoas?|%|reais?))|(?:R\$\s*[\d.,]+[kKmM]?)|(?:mais\s+de\s+\d[\d.,]*)/gi;
const OFFER_TERMS_REGEX = /\b(masterclass|workshop|curso|ebook|e-book|mentoria|consultoria|programa|método|metodo|imersão|imersao|treinamento|bootcamp|guia|planilha|template|checklist|webinar|aula)\b/gi;
const CTA_PATTERN = /👇|⬇|🔗|⚡|link|bio|clique|acesse|saiba|confira|descubra|comece|agende|entre|fale|baixe|comente/i;
const CTA_BY_OBJETIVO: Record<string, string> = {
  crescer: 'Conteúdo que transforma 👇',
  engajar: 'Confira o conteúdo 👇',
  vender: 'Saiba mais 🔗',
  autoridade: 'Descubra mais 👇',
  consistencia: 'Acompanhe a jornada 👇',
};

function validateBioHallucinations(bio: string, corpus: string): string {
  if (!bio) return bio;
  const corpusLower = corpus.toLowerCase();
  const lines = bio.split('\n');
  const cleanedLines = lines.map((line) => {
    const matches = line.match(NUMERIC_CLAIM_REGEX);
    if (matches) {
      for (const m of matches) {
        if (!corpusLower.includes(m.toLowerCase())) return '';
      }
    }
    return line;
  }).filter((l) => l !== '');
  const cleaned = cleanedLines.join('\n').trim();
  return cleaned.length < 30 ? bio : cleaned;
}

function validateBioTextClaims(bio: string, corpus: string): string {
  if (!bio) return bio;
  const corpusLower = corpus.toLowerCase();
  const lines = bio.split('\n');
  const cleanedLines = lines.filter((line) => {
    const matches = line.match(OFFER_TERMS_REGEX);
    if (!matches) return true;
    for (const m of matches) {
      if (!corpusLower.includes(m.toLowerCase())) return false;
    }
    return true;
  });
  const cleaned = cleanedLines.join('\n').trim();
  return cleaned.length < 30 ? bio : cleaned;
}

function enforceBioQuality(bio: string, objetivo: string): string {
  if (!bio) return bio;
  let lines = bio.split('\n').filter((l) => l.trim());
  // CTA na última linha
  if (lines.length > 0 && !CTA_PATTERN.test(lines[lines.length - 1])) {
    lines.push(CTA_BY_OBJETIVO[objetivo] || CTA_BY_OBJETIVO.autoridade);
  }
  // Max 3 linhas
  if (lines.length > 3) {
    const meio = lines.slice(1, -1).join(' | ');
    lines = [lines[0], meio, lines[lines.length - 1]];
  }
  let result = lines.join('\n');
  // Trunca a 149
  if (result.length > 149) result = result.slice(0, 149);
  return result;
}

function rubricaTo10(r: any): number {
  if (!r) return 0;
  const vals = Object.values(r).filter((v) => typeof v === 'number') as number[];
  if (!vals.length) return 0;
  const sum = vals.reduce((a, b) => a + b, 0);
  return parseFloat(((sum / (vals.length * 5)) * 10).toFixed(1));
}

// ============================================================
// MAIN PIPELINE
// ============================================================
async function executarPipeline(input: { handle: string; nicho: string; objetivo?: string; modelo_intermediarios?: string; analisar_intermediarios?: boolean }): Promise<any> {
  const tInicio = Date.now();
  const objetivo = input.objetivo || 'autoridade';

  // Carrega chaves
  const [apifyToken, openaiKey] = await Promise.all([
    getChave('APIFY_TOKEN', 'tool-analise-perfil-ig'),
    getChave('OPENAI_API_KEY', 'tool-analise-perfil-ig'),
  ]);

  // ETAPA 1: Scrape
  const raw = await scrapeApify(input.handle, apifyToken);

  // ETAPA 2: Normalize
  const norm = normalize(raw);
  if (norm.posts.length === 0) throw new Error('NOT_FOUND: perfil sem posts');

  // ETAPA 3: Whisper paralelo nos profissionais
  const transcriptByPostId = new Map<string, { text: string | null; skipped_reason: string | null }>();
  const profissionais = norm.professional;
  const analisarIntermediarios = input.analisar_intermediarios !== false;
  // quando não vamos analisar os reels do meio, também não precisamos
  // transcrever eles — só o top e o worst entram no Whisper (economia extra)
  const reelsParaTranscrever = profissionais.filter((p: any) => {
    if (!p.is_video || !p.video_url) return false;
    if (analisarIntermediarios) return true;
    return p.post_id === norm.top.post_id || p.post_id === norm.worst.post_id;
  });
  if (reelsParaTranscrever.length > 0) {
    const transcripts = await Promise.all(reelsParaTranscrever.map((p: any) => transcribePost(p, openaiKey)));
    reelsParaTranscrever.forEach((p: any, i: number) => transcriptByPostId.set(p.post_id, transcripts[i]));
  }

  // Anexa transcripts nos posts
  for (const p of norm.posts) {
    const t = transcriptByPostId.get(p.post_id);
    p.transcript = t?.text || null;
    p.transcript_skipped_reason = t?.skipped_reason || null;
  }

  // ETAPAS 4-5-7 EM PARALELO
  const corpusBio = (norm.profile.bio_text || '') + ' ' + profissionais.slice(0, 8).map((p: any) => p.full_caption).join(' ');
  const capPreviews = profissionais.slice(0, 8).map((p: any, i: number) => `[${i + 1}] "${(p.full_caption || '').slice(0, 200)}"`).join('\n');

  const userBio = `Analise a bio do perfil @${input.handle}.
Nicho: ${input.nicho}.
Objetivo principal: ${objetivo.toUpperCase()}.

Bio atual:
${norm.profile.bio_text || '(vazio)'}

Link da bio: ${norm.profile.bio_link || '(sem link)'}
Seguidores: ${norm.profile.followers} | Seguindo: ${norm.profile.following} | Posts: ${norm.profile.posts_count} | Verificada: ${norm.profile.is_verified ? 'sim' : 'nao'}
Categoria do negócio: ${norm.profile.business_category || 'não declarada'}

Execute o processo completo de duas fases. Retorne análise diagnóstica detalhada,
rubrica da bio atual (1-5 cada critério), pontos fortes/melhorias, keyword sugerida
para o campo Nome, nova bio (max 149 chars), rubrica da bio nova, justificativa,
CTA sugerido e 3 variações estratégicas (autoridade, conexão, ação).

Legendas recentes (use para extrair tom de voz e ancorar afirmações):
${capPreviews}`;

  const contextoPosts = norm.posts.map((p: any, i: number) => `${i + 1}. [${p.tier}] [${p.content_bucket}] ${p.post_type} | likes ${p.likes} | com ${p.comments}${p.views ? ' | views ' + p.views : ''} | score ${p.engagement_score} | "${(p.full_caption || '').slice(0, 100)}..."`).join('\n');
  const userPosts = `Analise os posts TOP e WORST do perfil @${input.handle}.
Nicho: ${input.nicho}.
Objetivo do perfil: ${objetivo.toUpperCase()}.
Seguidores: ${norm.profile.followers} | Posts no perfil: ${norm.profile.posts_count}

CONTEXTO COMPARATIVO — últimos ${norm.posts.length} posts capturados:
${contextoPosts}

Médias do perfil (apenas conteúdo profissional, ${profissionais.length} posts):
- Likes médios: ${Math.round(norm.metrics.avg_likes_pro)}
- Comentários médios: ${Math.round(norm.metrics.avg_comments_pro)}
- Views médias: ${Math.round(norm.metrics.avg_views_pro)}
- Engagement score médio: ${norm.metrics.avg_engagement_pro.toFixed(4)}

${postBlock('TOP POST (maior engagement rate)', norm.top, transcriptByPostId.get(norm.top.post_id) || null)}

${postBlock('WORST POST (menor engagement rate)', norm.worst, transcriptByPostId.get(norm.worst.post_id) || null)}

Execute a análise completa para AMBOS os posts + cross_insights comparando TOP vs WORST.
IMPORTANTE: o TOP teve menos views absolutas que outros posts. Explique POR QUE ele é o TOP em engajamento ponderado e o que isso significa estrategicamente.`;

  const userOverview = `Diagnóstico estratégico do perfil @${input.handle}.
Nicho declarado: ${input.nicho}.
Objetivo declarado: ${objetivo.toUpperCase()}.

DADOS DO PERFIL:
- Nome: ${norm.profile.full_name}
- Bio: """${norm.profile.bio_text}"""
- Link na bio: ${norm.profile.bio_link || '(nenhum)'}
- Seguidores: ${norm.profile.followers} | Seguindo: ${norm.profile.following} | Posts totais: ${norm.profile.posts_count}
- Verificada: ${norm.profile.is_verified ? 'sim' : 'não'} | Conta business: ${norm.profile.is_business ? 'sim' : 'não'}
- Categoria: ${norm.profile.business_category || 'não declarada'}

PERFORMANCE MÉDIA (últimos ${norm.posts.length} posts capturados, ${profissionais.length} profissionais):
- Avg likes (pro): ${Math.round(norm.metrics.avg_likes_pro)}
- Avg comentários (pro): ${Math.round(norm.metrics.avg_comments_pro)}
- Avg views (pro): ${Math.round(norm.metrics.avg_views_pro)}
- Avg engagement (pro): ${norm.metrics.avg_engagement_pro.toFixed(4)}

CONTEÚDO REAL — amostra:
${profissionais.slice(0, 8).map((p: any, i: number) => `[${i + 1}] [${p.tier}] ${p.post_type} | ${p.likes}❤ ${p.comments}💬${p.views ? ' | ' + p.views + 'v' : ''} | "${(p.full_caption || '').slice(0, 100)}..."`).join('\n')}

POST DE MAIOR PERFORMANCE:
- Tipo: ${norm.top.post_type} | Engagement: ${norm.top.engagement_score}
- Legenda: "${(norm.top.full_caption || '').slice(0, 500)}"
${norm.top.transcript ? `- Trecho da fala: "${norm.top.transcript.slice(0, 400)}..."` : ''}

POST DE MENOR PERFORMANCE:
- Tipo: ${norm.worst.post_type} | Engagement: ${norm.worst.engagement_score}
- Legenda: "${(norm.worst.full_caption || '').slice(0, 500)}"
${norm.worst.transcript ? `- Trecho da fala: "${norm.worst.transcript.slice(0, 400)}..."` : ''}

Faça o diagnóstico estratégico completo: identidade, pilares, oportunidades, riscos, próximos passos. Seja específico, ancorado nas evidências acima.`;

  // PARALELO
  const [bioAnalysis, postsAnalysis, overview] = await Promise.all([
    callOpenAI({ systemPrompt: BIO_SYSTEM, userMsg: userBio, tool: TOOL_BIO, openaiKey, maxTokens: 3000, temperature: 0.7 }),
    callOpenAI({ systemPrompt: POSTS_SYSTEM, userMsg: userPosts, tool: TOOL_POSTS, openaiKey, maxTokens: 4500, temperature: 0.7 }),
    callOpenAI({ systemPrompt: OVERVIEW_SYSTEM, userMsg: userOverview, tool: TOOL_OVERVIEW, openaiKey, maxTokens: 6000, temperature: 0.7 }),
  ]);

  // Pós-processamento Bio
  if (bioAnalysis.bio_sugerida) {
    bioAnalysis.bio_sugerida = enforceBioQuality(validateBioTextClaims(validateBioHallucinations(bioAnalysis.bio_sugerida, corpusBio), corpusBio), objetivo);
  }
  for (const k of ['bio_variacao_autoridade', 'bio_variacao_conexao', 'bio_variacao_acao']) {
    if (bioAnalysis[k]) bioAnalysis[k] = enforceBioQuality(validateBioTextClaims(validateBioHallucinations(bioAnalysis[k], corpusBio), corpusBio), objetivo);
  }

  // ETAPA 6: Single post nos intermediários
  const top_post = { ...norm.top, analysis: postsAnalysis.top_post_analysis };
  const worst_post = { ...norm.worst, analysis: postsAnalysis.worst_post_analysis };
  const intermediarios = profissionais.filter((p: any) => p.post_id !== norm.top.post_id && p.post_id !== norm.worst.post_id);

  // analisar_intermediarios=false (Book Comercial): pula a análise por IA de
  // cada reel do meio. O consultor só precisa do maior e do menor. Economiza
  // 1 chamada gpt-4o por post intermediário (~6-8 chamadas). Default true
  // pra não alterar quem já chama o motor (uso na extensão/Mission Control).
  const other_posts_analyzed: any[] = [];
  if (analisarIntermediarios) {
    for (let i = 0; i < intermediarios.length; i += 4) {
      const batch = intermediarios.slice(i, i + 4);
      const results = await Promise.all(batch.map((p: any) => callOpenAI({
        systemPrompt: SINGLE_POST_SYSTEM,
        userMsg: `Analise este post individual do perfil @${input.handle}.
Nicho: ${input.nicho}.
Seguidores: ${norm.profile.followers}

Médias do perfil (conteúdo profissional, ${profissionais.length} posts):
- Likes médios: ${Math.round(norm.metrics.avg_likes_pro)}
- Comentários médios: ${Math.round(norm.metrics.avg_comments_pro)}
- Views médias: ${Math.round(norm.metrics.avg_views_pro)}
- Engagement médio: ${norm.metrics.avg_engagement_pro.toFixed(4)}

${postBlock('POST EM ANÁLISE', p, transcriptByPostId.get(p.post_id) || null)}

Faça a análise completa e profunda. Compare contra a média do perfil. Cite frases literais do áudio/legenda quando houver algo marcante.`,
        tool: TOOL_SINGLE_POST,
        openaiKey,
        maxTokens: 2500,
        temperature: 0.7,
        // opcional: modelo mais barato só pros posts intermediários
        // (top/worst/bio/overview seguem sempre no gpt-4o)
        model: input.modelo_intermediarios,
      }).then((analysis) => ({ ...p, analysis })).catch((e) => {
        console.error('[single_post] erro:', e.message);
        return { ...p, analysis: null };
      })));
      other_posts_analyzed.push(...results);
    }
  }

  // Ordena intermediários por nota_geral desc (com fallback engagement_score)
  other_posts_analyzed.sort((a, b) => {
    const na = a.analysis?.nota_geral ?? -1;
    const nb = b.analysis?.nota_geral ?? -1;
    if (nb !== na) return nb - na;
    return b.engagement_score - a.engagement_score;
  });

  // ============================================================
  // ETAPA 8: Imagens em base64 (HTML standalone offline)
  // Avatar + thumbs do top/worst/intermediários/pessoais.
  // Sem isso, links do CDN do Instagram bloqueiam por CORS quando
  // o HTML é aberto localmente (file://).
  // ============================================================
  async function imageToDataUrl(url: string | undefined | null): Promise<string | null> {
    if (!url) return null;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 15_000);
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      clearTimeout(tid);
      if (!r.ok) return null;
      const ct = r.headers.get('content-type') || 'image/jpeg';
      if (!ct.startsWith('image/')) return null;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > 5 * 1024 * 1024) return null; // > 5MB skip
      // Convert to base64 (Deno-friendly)
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        bin += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const b64 = btoa(bin);
      return `data:${ct};base64,${b64}`;
    } catch (_) {
      return null;
    }
  }

  // Coleta TODAS as URLs em paralelo
  const allPosts = [top_post, worst_post, ...other_posts_analyzed, ...norm.personal];
  const imageJobs: Promise<void>[] = [];

  // Avatar
  imageJobs.push((async () => {
    const data = await imageToDataUrl(norm.profile.avatar_url);
    if (data) norm.profile.avatar_url = data;
  })());

  // Thumbs de cada post
  for (const p of allPosts) {
    imageJobs.push((async () => {
      const data = await imageToDataUrl(p.thumb_url);
      if (data) p.thumb_url = data;
    })());
  }

  await Promise.all(imageJobs);

  // Estrutura final
  const result = {
    meta: {
      generated_at: new Date().toISOString(),
      handle: input.handle,
      nicho: input.nicho,
      objetivo,
      duration_seconds: Math.round((Date.now() - tInicio) / 1000),
      version: 'v1.0',
    },
    profile: norm.profile,
    metrics: norm.metrics,
    top_post,
    worst_post,
    other_posts_analyzed,
    bio_analysis: bioAnalysis,
    cross_insights: postsAnalysis.cross_insights,
    overview,
    personal_posts: norm.personal,
    posts: norm.posts,
  };

  return result;
}

// ============================================================
// SERVE
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ ok: false, erro: 'JSON invalido' }, 400); }

  const handle = String(body.handle || '').trim().replace(/^@/, '').toLowerCase();
  const nicho = String(body.nicho || '').trim();
  const objetivo = String(body.objetivo || 'autoridade').trim();
  const modeloIntermediarios = body.modelo_intermediarios ? String(body.modelo_intermediarios).trim() : undefined;
  const analisarIntermediarios = body.analisar_intermediarios !== false; // default true

  if (!handle || !/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return jsonRespTool({ ok: false, erro: 'handle invalido (1-30 chars, a-z, 0-9, . e _)' }, 400);
  if (!nicho) return jsonRespTool({ ok: false, erro: 'nicho obrigatorio' }, 400);

  try {
    const result = await executarPipeline({ handle, nicho, objetivo, modelo_intermediarios: modeloIntermediarios, analisar_intermediarios: analisarIntermediarios });
    const html = renderHtml(result);
    return jsonRespTool({
      ok: true,
      handle,
      nicho,
      duration_seconds: result.meta.duration_seconds,
      html,
      json: result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[analise-perfil-ig] erro:', msg);
    return jsonRespTool({ ok: false, erro: msg }, 500);
  }
});
