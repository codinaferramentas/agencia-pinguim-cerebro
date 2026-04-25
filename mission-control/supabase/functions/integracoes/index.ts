// ========================================================================
// Edge Function: integracoes
// ========================================================================
// Gerencia credenciais de servicos externos (Apify, RapidAPI, etc).
// Front nao acessa pinguim.integracoes diretamente — chave_secreta vive
// la mas nunca eh exposta. Toda escrita passa por aqui (service_role).
//
// Modos:
//   modo=salvar-chave    — atualiza chave_secreta + status='ativa'
//   modo=remover-chave   — limpa chave_secreta + status='nao_configurada'
//   modo=testar          — testa se a chave funciona (chamada minima)
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

// Verifica que o caller esta logado (anon key + JWT do usuario)
async function requireAuth(req: Request): Promise<{ ok: boolean; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return { ok: false };

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return { ok: false };
  return { ok: true, userId: data.user.id };
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

async function salvarChave(slug: string, chave: string) {
  const client = sb();
  const { data, error } = await client.from('integracoes')
    .update({
      chave_secreta: chave,
      status: 'ativa',
      atualizado_em: new Date().toISOString(),
    })
    .eq('slug', slug)
    .select('id, slug, nome, status')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function removerChave(slug: string) {
  const client = sb();
  const { data, error } = await client.from('integracoes')
    .update({
      chave_secreta: null,
      status: 'nao_configurada',
      atualizado_em: new Date().toISOString(),
    })
    .eq('slug', slug)
    .select('id, slug, nome, status')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Testa chave da integracao (chamada minima de validacao)
async function testarChave(slug: string) {
  const client = sb();
  const { data: integ } = await client.from('integracoes')
    .select('chave_secreta, configuracao')
    .eq('slug', slug)
    .single();
  if (!integ?.chave_secreta) return { ok: false, erro: 'Chave nao configurada' };

  if (slug === 'rapidapi-youtube') {
    // Testa pingando o host
    const resp = await fetch('https://youtube-transcriber-api.p.rapidapi.com/api/transcript?videoId=dQw4w9WgXcQ', {
      headers: {
        'x-rapidapi-key': integ.chave_secreta,
        'x-rapidapi-host': 'youtube-transcriber-api.p.rapidapi.com',
      },
    });
    return { ok: resp.ok, status: resp.status };
  }

  if (slug === 'apify-instagram') {
    const resp = await fetch(`https://api.apify.com/v2/acts?token=${integ.chave_secreta}&limit=1`);
    return { ok: resp.ok, status: resp.status };
  }

  return { ok: true, obs: 'Sem teste especifico, chave salva.' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);

  const auth = await requireAuth(req);
  if (!auth.ok) return jsonResp({ error: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON invalido' }, 400); }

  const { modo, slug, chave } = body;

  try {
    if (modo === 'salvar-chave') {
      if (!slug || !chave) return jsonResp({ error: 'slug e chave obrigatorios' }, 400);
      const r = await salvarChave(slug, chave);
      return jsonResp({ ok: true, integracao: r });
    }
    if (modo === 'remover-chave') {
      if (!slug) return jsonResp({ error: 'slug obrigatorio' }, 400);
      const r = await removerChave(slug);
      return jsonResp({ ok: true, integracao: r });
    }
    if (modo === 'testar') {
      if (!slug) return jsonResp({ error: 'slug obrigatorio' }, 400);
      const r = await testarChave(slug);
      return jsonResp(r);
    }
    return jsonResp({ error: `modo invalido: ${modo}` }, 400);
  } catch (e: any) {
    return jsonResp({ error: e.message }, 500);
  }
});
