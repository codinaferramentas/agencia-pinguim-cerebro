// ============================================================
// Edge Function: mundo-ia-motor
// ============================================================
// Motor do "Mundo IA" — monitor de perfis/canais de referências.
//
// Duas fases (body.fase):
//   'raspagem'  → pra cada alvo ativo: Apify IG scraper / YT scraper,
//                 filtra janela de 24h, transcreve lives novas (legenda
//                 nativa via Apify), upsert em mundo_ia_capturas (dedup).
//   'envio'     → pra cada sócio ativo: junta capturas das últimas 24h,
//                 resume com IA marcando ACIONÁVEL, monta HTML + cópia pro
//                 grupo, salva em mundo_ia_execucoes, envia no WhatsApp.
//
// Chamada pelos crons via pinguim.mundo_ia_disparar(fase) (net.http_post).
// Também aceita { fase, dono_socio?, dry_run? } pra teste manual.
//
// Regras do projeto respeitadas:
//   - Determinístico antes de LLM: legenda nativa YT antes de qualquer coisa.
//   - Chaves só via cofre (getChave), nunca Deno.env direto.
//   - schema pinguim. Idempotente (dedup por id_externo).
//   - "cópia à parte" pro grupo: só GERA, o dono dispara (não manda sozinho).
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }, db: { schema: 'pinguim' },
  });
}

const JANELA_HORAS = 24;
// Margem: scraper pode devolver algo de ~30h atrás; guardamos e o filtro
// de exibição (envio) usa 24h estrito. Na raspagem aceitamos 36h pra não
// perder nada por fuso/atraso de indexação.
const JANELA_RASPAGEM_HORAS = 36;

// ------------------------------------------------------------
// Apify helper
// ------------------------------------------------------------
async function apify(actor: string, input: unknown, apifyToken: string, timeout = 180): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${apifyToken}&timeout=${timeout}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`Apify ${actor} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function horasAtras(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

// ------------------------------------------------------------
// RASPAGEM — Instagram
// ------------------------------------------------------------
async function rasparInstagram(alvo: any, apifyToken: string, client: any): Promise<number> {
  const posts = await apify('apify~instagram-scraper', {
    directUrls: [alvo.url.endsWith('/') ? alvo.url : alvo.url + '/'],
    resultsType: 'posts',
    resultsLimit: 12,
    addParentData: false,
  }, apifyToken, 180);

  let novos = 0;
  for (const p of posts) {
    if (horasAtras(p.timestamp) > JANELA_RASPAGEM_HORAS) continue;
    const idExterno = p.shortCode || p.id;
    if (!idExterno) continue;
    const row = {
      alvo_id: alvo.id,
      tipo: 'instagram',
      subtipo: (p.type || '').toLowerCase() || 'post',
      id_externo: idExterno,
      url: p.url || `https://www.instagram.com/p/${idExterno}/`,
      publicado_em: p.timestamp || null,
      titulo_ou_legenda: (p.caption || '').slice(0, 4000),
      transcricao: null,
      midia_url: p.displayUrl || p.images?.[0] || null,
      metadados: {
        likes: p.likesCount ?? null, comentarios: p.commentsCount ?? null,
        video_views: p.videoViewCount ?? null, is_video: p.type === 'Video',
      },
    };
    const { error } = await client.from('mundo_ia_capturas')
      .upsert(row, { onConflict: 'alvo_id,id_externo', ignoreDuplicates: true });
    if (!error) novos++;
  }
  return novos;
}

// ------------------------------------------------------------
// RASPAGEM — YouTube (canal → vídeos/lives recentes → transcrição nova)
// ------------------------------------------------------------
async function rasparYouTube(alvo: any, apifyToken: string, client: any): Promise<number> {
  const videos = await apify('streamers~youtube-scraper', {
    startUrls: [{ url: `${alvo.url.replace(/\/$/, '')}/videos` }],
    maxResults: 6,
    maxResultsShorts: 0,
    maxResultStreams: 4,
  }, apifyToken, 180);

  let novos = 0;
  for (const v of videos) {
    const dataPub = v.date || v.publishedAt || v.uploadDate || null;
    if (horasAtras(dataPub) > JANELA_RASPAGEM_HORAS) continue;
    const videoId = v.id || (v.url ? new URL(v.url).searchParams.get('v') : null);
    if (!videoId) continue;

    // Já temos? Evita re-transcrever (determinístico: só transcreve o novo)
    const { data: existe } = await client.from('mundo_ia_capturas')
      .select('id').eq('alvo_id', alvo.id).eq('id_externo', videoId).maybeSingle();
    if (existe) continue;

    // Legenda nativa primeiro (regra: determinístico antes de LLM).
    let transcricao: string | null = null;
    try {
      const t = await apify('pintostudio~youtube-transcript-scraper', {
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      }, apifyToken, 150);
      if (Array.isArray(t) && t[0]?.data) {
        const segs = Array.isArray(t[0].data) ? t[0].data : Object.values(t[0].data || {});
        transcricao = segs.map((s: any) => s.text).join(' ').replace(/\s+/g, ' ').trim() || null;
      }
    } catch (_) { /* sem legenda — segue sem transcrição, marca no relatório */ }

    const subtipo = v.isLive || v.type === 'stream' ? 'live' : 'video';
    const row = {
      alvo_id: alvo.id, tipo: 'youtube', subtipo,
      id_externo: videoId,
      url: v.url || `https://www.youtube.com/watch?v=${videoId}`,
      publicado_em: dataPub,
      titulo_ou_legenda: (v.title || '').slice(0, 500),
      transcricao,
      midia_url: v.thumbnailUrl || null,
      metadados: {
        views: v.viewCount ?? null, likes: v.likes ?? null,
        duracao: v.duration ?? null, canal: v.channelName ?? alvo.apelido,
        tem_transcricao: !!transcricao,
      },
    };
    const { error } = await client.from('mundo_ia_capturas')
      .upsert(row, { onConflict: 'alvo_id,id_externo', ignoreDuplicates: true });
    if (!error) novos++;
  }
  return novos;
}

async function faseRaspagem(donoFiltro: string | null): Promise<any> {
  const client = sb();
  const apifyToken = await getChave('APIFY_TOKEN', 'mundo-ia-motor');

  let q = client.from('mundo_ia_alvos').select('*').eq('ativo', true);
  if (donoFiltro) q = q.eq('dono_socio', donoFiltro);
  const { data: alvos, error } = await q;
  if (error) throw error;

  const resultado: any[] = [];
  for (const alvo of alvos || []) {
    try {
      const novos = alvo.tipo === 'instagram'
        ? await rasparInstagram(alvo, apifyToken, client)
        : await rasparYouTube(alvo, apifyToken, client);
      resultado.push({ alvo: alvo.apelido || alvo.handle, tipo: alvo.tipo, novos });
    } catch (e: any) {
      resultado.push({ alvo: alvo.apelido || alvo.handle, tipo: alvo.tipo, erro: e.message });
    }
  }
  return { ok: true, fase: 'raspagem', alvos: resultado };
}

// ------------------------------------------------------------
// ENVIO — síntese IA + HTML + cópia grupo + WhatsApp
// ------------------------------------------------------------
type Sintese = { resumo: string; acionavel: boolean; acao: string | null; prazo: string | null };

async function sintetizarCaptura(cap: any, apiKey: string): Promise<Sintese> {
  const base = cap.tipo === 'youtube'
    ? `Vídeo/Live do YouTube.\nTítulo: ${cap.titulo_ou_legenda}\n${cap.transcricao ? 'Transcrição (trecho): ' + cap.transcricao.slice(0, 6000) : '(sem transcrição disponível)'}`
    : `Post do Instagram (${cap.subtipo}).\nLegenda: ${cap.titulo_ou_legenda}`;

  const sistema = `Você é o analista do "Mundo IA" da Agência Pinguim. Recebe UM post/vídeo de uma referência do mercado de IA e resume pro André (sócio) saber o que houve SEM assistir/ler tudo.
Responda JSON: { "resumo": "2-4 frases diretas do que a pessoa falou/anunciou", "acionavel": true/false, "acao": "se acionável, o que a Pinguim deveria fazer e por quê; senão null", "prazo": "se houver prazo/data explícito (ex: 'até dia 7'), extraia; senão null" }.
"acionavel" = true quando há uma novidade, ferramenta, lançamento, prazo ou oportunidade que o André poderia querer se antecipar (ex: 'Anthropic liberou Fable 5 até dia 7'). Post motivacional/institucional = false.
Seja direto, zero enrolação, português BR.`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: base }],
      max_completion_tokens: 800,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  try {
    const p = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    return { resumo: p.resumo || '', acionavel: !!p.acionavel, acao: p.acao || null, prazo: p.prazo || null };
  } catch {
    return { resumo: cap.titulo_ou_legenda?.slice(0, 200) || '', acionavel: false, acao: null, prazo: null };
  }
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function montarHTML(dono: string, itens: any[], janelaIni: Date, janelaFim: Date): string {
  const acionaveis = itens.filter((i) => i.sintese.acionavel);
  const fmt = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // agrupa por alvo
  const porAlvo = new Map<string, any[]>();
  for (const i of itens) {
    const k = i.cap.apelido || i.cap.handle;
    if (!porAlvo.has(k)) porAlvo.set(k, []);
    porAlvo.get(k)!.push(i);
  }

  const cardItem = (i: any) => {
    const c = i.cap, s = i.sintese;
    const tag = c.tipo === 'youtube' ? (c.subtipo === 'live' ? '🔴 LIVE' : '▶️ YouTube') : '📸 Instagram';
    const acion = s.acionavel
      ? `<div class="acion"><strong>⚡ AÇÃO${s.prazo ? ' · ⏰ ' + esc(s.prazo) : ''}:</strong> ${esc(s.acao || '')}</div>` : '';
    const transcr = c.tipo === 'youtube' && !c.transcricao
      ? `<div class="warn">⚠️ sem transcrição disponível (legenda desativada no vídeo)</div>` : '';
    return `<div class="item ${s.acionavel ? 'is-acion' : ''}">
      <div class="item-top"><span class="badge">${tag}</span>
        <span class="when">${c.publicado_em ? fmt(new Date(c.publicado_em)) : ''}</span></div>
      <div class="titulo">${esc((c.titulo_ou_legenda || '').slice(0, 180))}</div>
      <div class="resumo">${esc(s.resumo)}</div>
      ${acion}${transcr}
      <a class="link" href="${esc(c.url)}" target="_blank" rel="noopener">abrir post ↗</a>
    </div>`;
  };

  let corpo = '';
  for (const [alvo, lista] of porAlvo) {
    corpo += `<section class="alvo"><h2>${esc(alvo)} <span class="cnt">${lista.length}</span></h2>${lista.map(cardItem).join('')}</section>`;
  }
  if (!itens.length) corpo = `<div class="vazio">Nenhuma publicação nova nas últimas 24h dos seus alvos. Tudo quieto no Mundo IA. 🐧</div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🌎 Mundo IA — ${esc(dono)}</title>
<style>
  :root{--bg:#0B1120;--card:#131C2E;--line:#243247;--tx:#E8EEF7;--mut:#93A3BC;--acc:#38BDF8;--acion:#F59E0B}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:0 0 48px}
  header{padding:28px 20px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:linear-gradient(180deg,#0B1120,rgba(11,17,32,.92));backdrop-filter:blur(6px)}
  h1{margin:0;font-size:22px;letter-spacing:.3px}.sub{color:var(--mut);font-size:13px;margin-top:4px}
  .kpis{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px}
  .kpi b{font-size:18px;display:block;color:var(--acc)}.kpi.a b{color:var(--acion)}
  .wrap{max-width:720px;margin:0 auto;padding:0 16px}
  section.alvo{margin-top:26px}h2{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:8px}
  h2 .cnt{background:var(--line);color:var(--mut);border-radius:20px;font-size:12px;padding:1px 9px}
  .item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
  .item.is-acion{border-color:var(--acion);box-shadow:0 0 0 1px rgba(245,158,11,.25)}
  .item-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .badge{font-size:12px;background:var(--line);border-radius:6px;padding:2px 8px;color:var(--mut)}
  .when{font-size:12px;color:var(--mut)}.titulo{font-weight:600;margin-bottom:6px}
  .resumo{color:#CBD6E6;font-size:14px}
  .acion{margin-top:10px;background:rgba(245,158,11,.12);border-left:3px solid var(--acion);padding:8px 12px;border-radius:6px;font-size:13.5px}
  .warn{margin-top:8px;color:#FBBF24;font-size:12px}
  .link{display:inline-block;margin-top:10px;color:var(--acc);text-decoration:none;font-size:13px;font-weight:600}
  .vazio{margin-top:40px;text-align:center;color:var(--mut);padding:40px 20px;background:var(--card);border-radius:12px;border:1px dashed var(--line)}
  footer{max-width:720px;margin:32px auto 0;padding:0 16px;color:var(--mut);font-size:12px}
</style></head><body>
<header><div class="wrap"><h1>🌎 Mundo IA</h1>
  <div class="sub">${esc(dono)} · janela ${fmt(janelaIni)} → ${fmt(janelaFim)}</div>
  <div class="kpis">
    <div class="kpi"><b>${itens.length}</b>publicações</div>
    <div class="kpi a"><b>${acionaveis.length}</b>acionáveis ⚡</div>
    <div class="kpi"><b>${porAlvo.size}</b>alvos ativos</div>
  </div></div></header>
<div class="wrap">${corpo}</div>
<footer>Gerado automaticamente pelo Mundo IA · Agência Pinguim · legenda nativa YouTube quando disponível.</footer>
</body></html>`;
}

async function montarCopiaGrupo(dono: string, acionaveis: any[], apiKey: string): Promise<string> {
  if (!acionaveis.length) return '';
  const lista = acionaveis.map((i) => `- [${i.cap.apelido || i.cap.handle}] ${i.sintese.resumo}${i.sintese.prazo ? ' (prazo: ' + i.sintese.prazo + ')' : ''} | ${i.cap.url}`).join('\n');
  const sistema = `Você escreve uma mensagem CURTA de WhatsApp pro grupo interno dos sócios da Agência Pinguim. O ${dono} viu novidades relevantes no mercado de IA e quer avisar o time "olha isso que saiu, a gente precisa dar uma olhada". Tom: direto, sócio pra sócio, sem clichê de marketing, sem emoji em excesso (1-2 no máximo). Cite as novidades e o que fazer. Formato WhatsApp (linhas curtas, negrito com *asteriscos* se ajudar). Máximo ~8 linhas.`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: `Novidades acionáveis de hoje:\n${lista}` }],
      max_completion_tokens: 600,
    }),
  });
  if (!r.ok) return '';
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() || '';
}

// Gera o link clicável do relatório. Aponta pra página PÚBLICA do Mission
// Control no Vercel (/relatorio.html), que busca o HTML e o renderiza num
// iframe. Precisa ser no Vercel porque o Supabase (Storage e Edge Functions)
// blinda qualquer HTML com sandbox/text-plain (anti-XSS) — no celular
// mostraria código-fonte. O token aleatório torna o link "secreto".
const MC_BASE_URL = 'https://mission-control-pink-three.vercel.app';
function montarLinkRelatorio(execId: string, token: string): string {
  // Sem .html: o Vercel usa cleanUrls (redireciona .html -> sem extensão).
  return `${MC_BASE_URL}/relatorio?id=${execId}&t=${token}`;
}

async function enviarWhatsApp(numero: string, texto: string): Promise<boolean> {
  // Lê credenciais Evolution direto do cofre (edge é service_role) e manda via
  // instância global do bot (EVOLUTION_INSTANCE_BOT). Mesmo padrão do server-cli.
  try {
    const [urlRaw, apiKey, instRaw] = await Promise.all([
      getChave('EVOLUTION_API_URL', 'mundo-ia-motor'),
      getChave('EVOLUTION_API_KEY', 'mundo-ia-motor'),
      getChave('EVOLUTION_INSTANCE_BOT', 'mundo-ia-motor').catch(() => 'Agente Pinguim'),
    ]);
    const url = (urlRaw || '').trim().replace(/\/+$/, '');
    const instancia = (instRaw || 'Agente Pinguim').trim();
    if (!url || !apiKey) return false;
    const send = await fetch(`${url}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      headers: { apikey: apiKey.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    return send.ok;
  } catch { return false; }
}

async function faseEnvio(donoFiltro: string | null, dryRun: boolean): Promise<any> {
  const client = sb();
  const apiKey = await getChave('OPENAI_API_KEY', 'mundo-ia-motor');

  let cq = client.from('mundo_ia_config').select('*').eq('ativo', true);
  if (donoFiltro) cq = cq.eq('dono_socio', donoFiltro);
  const { data: configs, error: ce } = await cq;
  if (ce) throw ce;

  const janelaFim = new Date();
  const janelaIni = new Date(Date.now() - JANELA_HORAS * 3_600_000);
  const saida: any[] = [];

  for (const cfg of configs || []) {
    // alvos ativos do sócio
    const { data: alvos } = await client.from('mundo_ia_alvos')
      .select('id,handle,apelido,tipo').eq('dono_socio', cfg.dono_socio).eq('ativo', true);
    const alvoIds = (alvos || []).map((a: any) => a.id);
    const mapaAlvo = new Map((alvos || []).map((a: any) => [a.id, a]));
    if (!alvoIds.length) { saida.push({ dono: cfg.dono_socio, status: 'sem_alvos' }); continue; }

    // capturas na janela de 24h
    const { data: caps } = await client.from('mundo_ia_capturas')
      .select('*').in('alvo_id', alvoIds)
      .gte('publicado_em', janelaIni.toISOString())
      .order('publicado_em', { ascending: false });

    const itens: any[] = [];
    for (const cap of caps || []) {
      const a: any = mapaAlvo.get(cap.alvo_id) || {};
      const sintese = await sintetizarCaptura(cap, apiKey);
      itens.push({ cap: { ...cap, apelido: a.apelido, handle: a.handle }, sintese });
    }

    const acionaveis = itens.filter((i) => i.sintese.acionavel);
    const html = montarHTML(cfg.dono_socio, itens, janelaIni, janelaFim);
    const resumoGrupo = await montarCopiaGrupo(cfg.dono_socio, acionaveis, apiKey);

    let execId: string | null = null;
    if (!dryRun) {
      // Token secreto do link — gravado junto, valida o acesso em mundo-ia-ver.
      const linkToken = crypto.randomUUID().replace(/-/g, '');
      const { data: exec } = await client.from('mundo_ia_execucoes').insert({
        dono_socio: cfg.dono_socio, janela_inicio: janelaIni.toISOString(), janela_fim: janelaFim.toISOString(),
        html, resumo_grupo: resumoGrupo, total_posts: itens.length, total_acionaveis: acionaveis.length,
        status: itens.length ? 'ok' : 'sem_novidade', link_token: linkToken,
      }).select('id').single();
      execId = exec?.id || null;

      // Link clicável que abre e RENDERIZA no celular (via função mundo-ia-ver).
      const linkPublico = execId ? montarLinkRelatorio(execId, linkToken) : null;
      if (execId && linkPublico) await client.from('mundo_ia_execucoes').update({ link_publico: linkPublico }).eq('id', execId);

      // WhatsApp: resumo curto + acionáveis + LINK do relatório completo.
      if (cfg.envia_whatsapp && cfg.whatsapp_destino) {
        const linhas = [
          `🌎 *Mundo IA* — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
          `${itens.length} publicações nas últimas 24h · *${acionaveis.length} acionáveis* ⚡`,
        ];
        for (const i of acionaveis.slice(0, 5)) {
          linhas.push(`\n• [${i.cap.apelido || i.cap.handle}] ${i.sintese.resumo.slice(0, 140)}${i.sintese.prazo ? ` (⏰ ${i.sintese.prazo})` : ''}`);
        }
        if (!acionaveis.length && itens.length) {
          linhas.push(`\nSem itens acionáveis hoje — mas tem novidade pra ver no relatório.`);
        }
        linhas.push(linkPublico
          ? `\n📄 *Relatório completo:*\n${linkPublico}`
          : `\n📄 Relatório completo no Mission Control → aba 🌎 Mundo IA`);
        const enviado = await enviarWhatsApp(cfg.whatsapp_destino, linhas.join('\n'));
        if (execId) await client.from('mundo_ia_execucoes').update({ enviado_whatsapp: enviado }).eq('id', execId);
      }
    }

    saida.push({
      dono: cfg.dono_socio, total: itens.length, acionaveis: acionaveis.length,
      exec_id: execId, tem_copia_grupo: !!resumoGrupo,
      ...(dryRun ? { html, resumo_grupo: resumoGrupo } : {}),
    });
  }
  return { ok: true, fase: 'envio', dry_run: dryRun, resultado: saida };
}

// ------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  if (!(await requireAuthTool(req))) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* body vazio do cron é ok */ }

  const fase = String(body.fase || '').trim();
  const dono = body.dono_socio ? String(body.dono_socio) : null;
  const dryRun = !!body.dry_run;

  try {
    let resp: any;
    if (fase === 'raspagem') resp = await faseRaspagem(dono);
    else if (fase === 'envio') resp = await faseEnvio(dono, dryRun);
    else return jsonRespTool({ ok: false, erro: `fase inválida: '${fase}' (use 'raspagem' ou 'envio')` }, 400);
    return jsonRespTool(resp);
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e), fase }, 500);
  }
});
