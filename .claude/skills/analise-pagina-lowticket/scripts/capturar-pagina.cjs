#!/usr/bin/env node
/**
 * capturar-pagina.cjs — captura página de vendas pra análise 12 Dobras.
 *
 * Estratégia (regra: esgota determinístico antes de pagar Apify):
 *   1. fetch puro (Node) → se a página tem texto de verdade, resolve de graça
 *   2. fallback Apify website-content-crawler (Chromium real) → HTML renderizado
 *      pós-JS + screenshot full-page. Token APIFY_TOKEN vem do cofre (RPC get_chave).
 *
 * Uso:
 *   node capturar-pagina.cjs <url> [--out <dir>] [--apify] [--no-apify]
 *
 * Saída (dir padrão c:/Squad/.tmp-analise-pagina/<dominio+path>/):
 *   pagina.html     HTML final (limpo de script/noscript, com <base>)
 *   texto.txt       texto integral extraído
 *   outline.txt     headings h1-h6 + textos de botão/CTA em ordem de documento
 *   imagens/        imagens da página (mockups, provas sociais...) até 40
 *   imagens.json    mapa arquivo → url original + alt
 *   screenshot.jpg  print full-page (só quando passa pelo Apify)
 *   meta.json       url, título, fonte do scrape, contagens
 */
const fs = require('fs');
const path = require('path');

const ENV_PATH = 'c:/Squad/.env.local';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MIN_TEXTO_OK = 1500; // menos que isso = página provavelmente é shell de JS → Apify
const MAX_IMAGENS = 40;

function parseArgs() {
  const a = process.argv.slice(2);
  const url = a.find((x) => !x.startsWith('--'));
  if (!url) {
    console.error('uso: node capturar-pagina.cjs <url> [--out <dir>] [--apify] [--no-apify]');
    process.exit(1);
  }
  const outIdx = a.indexOf('--out');
  return {
    url,
    out: outIdx !== -1 ? a[outIdx + 1] : null,
    forcaApify: a.includes('--apify'),
    semApify: a.includes('--no-apify'),
  };
}

function loadEnv() {
  const env = {};
  try {
    fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).forEach((l) => {
      const m = l.match(/^([A-Z_]+)=(.+)$/);
      if (m) env[m[1]] = m[2].trim();
    });
  } catch { /* sem .env.local → Apify indisponível, fetch puro ainda funciona */ }
  return env;
}

async function getChaveCofre(env, nome) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('.env.local sem credenciais Supabase');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_chave`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'pinguim',
    },
    body: JSON.stringify({ p_nome: nome, p_consumidor: 'skill-analise-pagina-lowticket', p_origem: 'local' }),
  });
  if (!r.ok) throw new Error(`cofre ${nome}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const v = await r.json();
  if (typeof v !== 'string' || !v) throw new Error(`cofre devolveu vazio pra ${nome}`);
  return v;
}

// ---------- extração de HTML ----------
function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
}

function extrairTexto(html) {
  let t = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(h[1-6]|p|div|section|li|br|tr)\b[^>]*>/gi, '\n$&')
    .replace(/<[^>]+>/g, ' ');
  t = decode(t);
  return t.split(/\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function extrairOutline(html) {
  const linhas = [];
  const re = /<(h[1-6]|button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    const inner = decode(m[3].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!inner) continue;
    if (tag.startsWith('h')) linhas.push(`${'#'.repeat(+tag[1])} ${inner}`);
    else if (tag === 'button') linhas.push(`[BOTÃO] ${inner}`);
    else if (/class="[^"]*(btn|button|cta)[^"]*"/i.test(attrs) && inner.length < 120) linhas.push(`[CTA] ${inner}`);
  }
  return linhas.join('\n');
}

function extrairTitulo(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decode(m[1]).trim() : '';
}

function maiorDoSrcset(srcset) {
  let melhor = null, melhorW = -1;
  for (const parte of srcset.split(',')) {
    const [u, d] = parte.trim().split(/\s+/);
    const w = d && d.endsWith('w') ? parseInt(d) : 0;
    if (u && w >= melhorW) { melhorW = w; melhor = u; }
  }
  return melhor;
}

const LIXO_RE = /(favicon|sprite|pixel\.|1x1|spacer|tracking|analytics|\.ico($|\?))/i;

function extrairImagens(html, baseUrl) {
  const achadas = new Map(); // url absoluta → { alt }
  const add = (u, alt) => {
    if (!u || u.startsWith('data:') || LIXO_RE.test(u)) return;
    try {
      const abs = new URL(u, baseUrl).href;
      if (!achadas.has(abs)) achadas.set(abs, { alt: alt || '' });
      else if (alt && !achadas.get(abs).alt) achadas.get(abs).alt = alt;
    } catch { /* url inválida */ }
  };

  const imgRe = /<img\b[^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const attr = (n) => { const r = tag.match(new RegExp(`${n}\\s*=\\s*"([^"]+)"`, 'i')); return r ? r[1] : null; };
    const alt = attr('alt');
    const srcset = attr('srcset') || attr('data-srcset');
    if (srcset) add(maiorDoSrcset(srcset), alt);
    add(attr('data-src') || attr('data-lazy-src') || attr('src'), alt);
  }
  const ogRe = /<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/gi;
  while ((m = ogRe.exec(html)) !== null) add(m[1], 'og:image');
  const bgRe = /background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = bgRe.exec(html)) !== null) add(m[1], 'background');

  return [...achadas.entries()].slice(0, MAX_IMAGENS).map(([url, v]) => ({ url, alt: v.alt }));
}

function limparHtml(html, urlBase) {
  let limpo = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  if (!/<base\b/i.test(limpo)) limpo = limpo.replace(/<head[^>]*>/i, (x) => `${x}\n<base href="${urlBase}">`);
  return limpo;
}

// ---------- captura ----------
async function capturaFetch(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  return { html, texto: extrairTexto(html), titulo: extrairTitulo(html), screenshotUrl: null };
}

async function capturaApify(url, env) {
  const token = await getChaveCofre(env, 'APIFY_TOKEN');
  console.log('[apify] token ok (cofre), rodando website-content-crawler (Chromium)... ~30-90s');
  const r = await fetch(
    `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${token}&timeout=120`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url }],
        crawlerType: 'playwright:chrome',
        maxCrawlPages: 1,
        maxCrawlDepth: 0,
        saveHtml: true,
        saveScreenshots: true,
        htmlTransformer: 'none', // Readability desligado — senão filtra bônus/dores como "navegação"
        readableTextCharThreshold: 0,
        removeElementsCssSelector: 'script, noscript',
        initialConcurrency: 1,
      }),
      signal: AbortSignal.timeout(180000),
    }
  );
  if (!r.ok) throw new Error(`Apify HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  if (!Array.isArray(data) || !data.length) throw new Error('Apify retornou dataset vazio');
  const item = data[0];
  const html = item.html || '';
  return {
    html,
    texto: item.text || extrairTexto(html),
    titulo: item.metadata?.title || extrairTitulo(html),
    screenshotUrl: item.screenshotUrl || null,
  };
}

async function baixarArquivo(url, destino) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 100 || buf.length > 20 * 1024 * 1024) return null;
  return { buf, ct };
}

function extensaoPor(ct, url) {
  if (/jpe?g/.test(ct)) return 'jpg';
  if (/png/.test(ct)) return 'png';
  if (/webp/.test(ct)) return 'webp';
  if (/gif/.test(ct)) return 'gif';
  if (/svg/.test(ct)) return 'svg';
  const m = url.match(/\.(jpe?g|png|webp|gif|svg)(\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'bin';
}

async function baixarImagens(imagens, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const mapa = [];
  let i = 0;
  for (const img of imagens) {
    i++;
    try {
      const res = await baixarArquivo(img.url, null);
      if (!res || !/image\//.test(res.ct)) continue;
      const nome = `${String(i).padStart(2, '0')}.${extensaoPor(res.ct, img.url)}`;
      fs.writeFileSync(path.join(dir, nome), res.buf);
      mapa.push({ arquivo: nome, url: img.url, alt: img.alt, bytes: res.buf.length });
    } catch { /* imagem fora do ar — segue */ }
  }
  return mapa;
}

(async () => {
  const { url, out, forcaApify, semApify } = parseArgs();
  const env = loadEnv();
  const u = new URL(url);
  const slug = (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, ''))
    .replace(/[^a-z0-9.]+/gi, '-').replace(/-+$/, '').toLowerCase();
  const outDir = out || `c:/Squad/.tmp-analise-pagina/${slug}`;
  fs.mkdirSync(outDir, { recursive: true });

  let cap = null;
  let fonte = 'fetch';

  if (!forcaApify) {
    try {
      cap = await capturaFetch(url);
      console.log(`[fetch] ok — ${cap.html.length} chars html, ${cap.texto.length} chars texto`);
    } catch (e) {
      console.log(`[fetch] falhou: ${e.message}`);
    }
  }

  const textoInsuficiente = !cap || cap.texto.length < MIN_TEXTO_OK;
  if ((forcaApify || textoInsuficiente) && !semApify) {
    if (textoInsuficiente && !forcaApify) console.log(`[fetch] texto < ${MIN_TEXTO_OK} chars — página parece renderizar via JS, indo pro Apify`);
    try {
      cap = await capturaApify(url, env);
      fonte = 'apify';
      console.log(`[apify] ok — ${cap.html.length} chars html, ${cap.texto.length} chars texto`);
    } catch (e) {
      console.log(`[apify] falhou: ${e.message}`);
      if (!cap) { console.error('ERRO: fetch e Apify falharam. Nada capturado.'); process.exit(2); }
      console.log('[apify] seguindo com o resultado do fetch mesmo assim');
    }
  }
  if (!cap) { console.error('ERRO: nenhuma captura disponível.'); process.exit(2); }

  // salva artefatos
  fs.writeFileSync(path.join(outDir, 'pagina.html'), limparHtml(cap.html, url));
  fs.writeFileSync(path.join(outDir, 'texto.txt'), cap.texto);
  fs.writeFileSync(path.join(outDir, 'outline.txt'), extrairOutline(cap.html));

  let screenshot = null;
  if (cap.screenshotUrl) {
    try {
      const s = await baixarArquivo(cap.screenshotUrl, null);
      if (s) {
        screenshot = /png/.test(s.ct) ? 'screenshot.png' : 'screenshot.jpg';
        fs.writeFileSync(path.join(outDir, screenshot), s.buf);
      }
    } catch { /* sem screenshot */ }
  }

  const imagens = extrairImagens(cap.html, url);
  console.log(`[imagens] ${imagens.length} encontradas no HTML, baixando...`);
  const mapa = await baixarImagens(imagens, path.join(outDir, 'imagens'));
  fs.writeFileSync(path.join(outDir, 'imagens.json'), JSON.stringify(mapa, null, 2));

  const meta = {
    url,
    titulo: cap.titulo,
    fonte_scrape: fonte,
    capturado_em: new Date().toISOString(),
    texto_chars: cap.texto.length,
    html_chars: cap.html.length,
    screenshot,
    imagens_encontradas: imagens.length,
    imagens_baixadas: mapa.length,
  };
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log('\n=== CAPTURA CONCLUÍDA ===');
  console.log(JSON.stringify(meta, null, 2));
  console.log(`\nSaída: ${outDir}`);
})().catch((e) => { console.error('ERRO fatal:', e.message); process.exit(2); });
