// ========================================================================
// Edge Function: chaves-gateway
// ========================================================================
// Gateway central de leitura do cofre. Outras Edge Functions chamam aqui
// pra pegar chaves em vez de Deno.env.get diretamente.
//
// Vantagens:
//   - Cofre vira fonte canônica (rotacao sem deploy)
//   - Auditoria: cada leitura grava em pinguim.chave_uso
//   - Cache 5min em memória (reduz round-trips ao banco)
//
// Uso (POST):
//   { nomes: ['OPENAI_API_KEY', 'OUTRA_KEY'], consumidor: 'buscar-cerebro' }
//
// Resposta:
//   { ok: true, chaves: { OPENAI_API_KEY: '...valor...', ... }, faltando: [] }
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

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const nomes: string[] = Array.isArray(body.nomes) ? body.nomes : [];
  const consumidor: string = String(body.consumidor || 'edge-function-desconhecida');
  if (nomes.length === 0) return jsonResp({ ok: false, error: 'nomes vazio' }, 400);

  const c = sb();
  const chaves: Record<string, string> = {};
  const faltando: string[] = [];

  for (const nome of nomes) {
    const { data, error } = await c.rpc('get_chave', {
      p_nome: nome,
      p_consumidor: consumidor,
      p_origem: 'edge-function',
    });
    if (error || data == null) {
      faltando.push(nome);
    } else {
      chaves[nome] = data as string;
    }
  }

  return jsonResp({
    ok: true,
    consumidor,
    total: nomes.length,
    encontradas: nomes.length - faltando.length,
    faltando,
    chaves,
  });
});
