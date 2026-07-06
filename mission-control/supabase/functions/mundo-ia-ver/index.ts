// ============================================================
// Edge Function: mundo-ia-ver
// ============================================================
// Serve o HTML de um relatório do Mundo IA como text/html DE VERDADE,
// pra abrir e RENDERIZAR direto no navegador do celular.
//
// Por que existe: o Supabase Storage público serve HTML como text/plain
// (proteção anti-XSS), então o celular mostraria o código-fonte. Esta
// função lê o registro e devolve com Content-Type: text/html.
//
// Acesso: link "secreto" — precisa do token aleatório (col. link_token)
// que só quem recebeu a mensagem tem. GET público, sem login (pra abrir
// no zap), mas não-enumerável.
//   GET /mundo-ia-ver?id=<uuid>&t=<token>
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }, db: { schema: 'pinguim' },
  });
}

const paginaErro = (msg: string) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Mundo IA</title>
<style>body{margin:0;background:#0B1120;color:#E8EEF7;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
.box{max-width:420px}h1{font-size:20px}</style></head>
<body><div class="box"><h1>🐧 ${msg}</h1></div></body></html>`;

serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const token = url.searchParams.get('t') || '';

  // CORS liberado: a página pública /relatorio.html (Vercel) faz fetch aqui.
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version',
      },
    });
  }

  const htmlResp = (html: string, status = 200) =>
    new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });

  if (!id || !token) return htmlResp(paginaErro('Link inválido.'), 400);

  try {
    const { data, error } = await sb().from('mundo_ia_execucoes')
      .select('html, link_token').eq('id', id).maybeSingle();
    if (error || !data) return htmlResp(paginaErro('Relatório não encontrado.'), 404);
    if (!data.link_token || data.link_token !== token) return htmlResp(paginaErro('Link inválido ou expirado.'), 403);
    return htmlResp(data.html || paginaErro('Relatório vazio.'));
  } catch (e) {
    return htmlResp(paginaErro('Erro ao carregar. Tente pelo Mission Control.'), 500);
  }
});
