// ========================================================================
// Edge Function: clint-debug
// ========================================================================
// Debug helper temporario — chama 1 endpoint do Clint e devolve resposta
// bruta. Pra descobrir formato real da API antes de ajustar parser.
//
// POST { path: '/v1/contacts?limit=2' }
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const headerJwt = auth.replace('Bearer ', '');
  if (!headerJwt) return false;
  if (headerJwt === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (headerJwt.startsWith('eyJ')) {
    try {
      const adminClient = createClient(SUPABASE_URL, headerJwt, { auth: { persistSession: false } });
      const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) return true;
    } catch (_) {}
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const path: string = body.path || '/v1/contacts?limit=2';

  let token: string;
  try {
    token = await getChave('CLINT_API_TOKEN', 'clint-debug', { fallbackEnv: false });
  } catch (e) {
    return jsonResp({ erro: 'Token: ' + (e as Error).message }, 500);
  }

  const url = `https://api.clint.digital${path}`;
  const r = await fetch(url, {
    headers: { 'api-token': token, 'Accept': 'application/json' },
  });

  let bodyResp: unknown;
  try {
    bodyResp = await r.json();
  } catch {
    bodyResp = { _erro: 'nao-json', _texto: await r.text().catch(() => '') };
  }

  return jsonResp({
    request: { url, status: r.status, ok: r.ok },
    response_keys: bodyResp && typeof bodyResp === 'object' ? Object.keys(bodyResp) : [],
    response: bodyResp,
  });
});
