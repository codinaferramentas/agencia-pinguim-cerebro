// ========================================================================
// Edge Function: scraping-pagina-publica
// ========================================================================
// Pega HTML/texto de URL publica. Tenta leitura direta de HTML primeiro
// (gratis, ~95% das paginas tradicionais). Se falhar (SPA, bloqueio), retorna
// erro pedindo Apify (ja existe ingest-url com esse fallback).
//
// Recebe { url, max_chars? }, devolve { titulo, texto, custo_usd, metodo }.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

async function requireAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return false;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(jwt);
  return !error && !!data?.user;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function scrapHTML(url: string, maxChars: number) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
    throw new Error(`Content-type nao HTML: ${ct}`);
  }

  const html = await resp.text();
  if (!html || html.length < 200) throw new Error('HTML muito curto (provavel SPA ou erro)');

  // Extrai titulo
  let titulo = '';
  const mTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (mTitle) titulo = mTitle[1].trim();
  if (!titulo) {
    const mOg = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (mOg) titulo = mOg[1].trim();
  }
  if (!titulo) titulo = `Página ${new URL(url).hostname}`;
  titulo = decodeHtmlEntities(titulo).slice(0, 200);

  // Extrai meta description (util pra contexto)
  let descricao = '';
  const mDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (mDesc) descricao = decodeHtmlEntities(mDesc[1].trim()).slice(0, 500);

  // Remove ruido
  let limpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ');

  // Tenta isolar <main> ou <article>
  const mMain = limpo.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mMain && mMain[1].length > 500) {
    limpo = mMain[1];
  } else {
    const mArt = limpo.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (mArt && mArt[1].length > 500) limpo = mArt[1];
  }

  let texto = limpo
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  texto = decodeHtmlEntities(texto);

  if (texto.length < 300) {
    throw new Error(`Texto muito curto (${texto.length} chars) — pagina provavelmente e SPA. Use a skill scraping-pagina-spa (Apify) como fallback.`);
  }

  if (texto.length > maxChars) {
    texto = texto.slice(0, maxChars) + '\n\n…(conteudo truncado)';
  }

  return { titulo, descricao, texto, custo_usd: 0, metodo: 'fetch-html-direto' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);

  if (!(await requireAuth(req))) return jsonResp({ error: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON invalido' }, 400); }

  const { url, max_chars = 50000 } = body;
  if (!url) return jsonResp({ error: 'url obrigatoria' }, 400);

  // Valida URL
  let parsed: URL;
  try { parsed = new URL(url); } catch { return jsonResp({ error: 'URL invalida' }, 400); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return jsonResp({ error: 'Apenas http/https sao suportados' }, 400);
  }
  // Bloqueia hosts internos/privados (SSRF basico)
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.startsWith('127.') || host.startsWith('10.') ||
      host.startsWith('192.168.') || host.startsWith('169.254.') ||
      host.endsWith('.internal') || host.endsWith('.local')) {
    return jsonResp({ error: 'Host privado bloqueado' }, 400);
  }

  try {
    const t0 = Date.now();
    const r = await scrapHTML(url, Number(max_chars) || 50000);
    return jsonResp({
      ok: true,
      url,
      titulo: r.titulo,
      descricao: r.descricao,
      texto: r.texto,
      tamanho_chars: r.texto.length,
      metodo: r.metodo,
      custo_usd: r.custo_usd,
      duracao_ms: Date.now() - t0,
    });
  } catch (e: any) {
    return jsonResp({ error: e.message || String(e) }, 422);
  }
});
