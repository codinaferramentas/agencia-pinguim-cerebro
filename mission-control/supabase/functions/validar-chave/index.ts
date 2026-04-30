// ========================================================================
// Edge Function: validar-chave
// ========================================================================
// Valida que uma chave de API e legitima fazendo uma chamada de teste
// contra o provedor antes de gravar no cofre.
//
// Suporta hoje: OpenAI, Anthropic. Outros provedores: passa direto
// (assume valido).
//
// POST { provedor: 'OpenAI', valor: 'sk-...' }
// Retorna { ok: true, valido: bool, motivo: string }
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
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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

async function validarOpenAI(valor: string): Promise<{ valido: boolean; motivo: string }> {
  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${valor}` },
    });
    if (r.ok) return { valido: true, motivo: 'Chave aceita pela OpenAI.' };
    if (r.status === 401) {
      const body = await r.json().catch(() => ({}));
      return { valido: false, motivo: body?.error?.message || 'OpenAI rejeitou: 401 Unauthorized.' };
    }
    return { valido: false, motivo: `OpenAI respondeu HTTP ${r.status}.` };
  } catch (e) {
    return { valido: false, motivo: `Erro de rede: ${(e as Error).message}` };
  }
}

async function validarAnthropic(valor: string): Promise<{ valido: boolean; motivo: string }> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': valor,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (r.ok) return { valido: true, motivo: 'Chave aceita pela Anthropic.' };
    if (r.status === 401) return { valido: false, motivo: 'Anthropic rejeitou: 401 Unauthorized.' };
    return { valido: false, motivo: `Anthropic respondeu HTTP ${r.status}.` };
  } catch (e) {
    return { valido: false, motivo: `Erro de rede: ${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const provedor: string = String(body.provedor || '');
  const valor: string = String(body.valor || '');
  if (!valor) return jsonResp({ ok: false, valido: false, motivo: 'Valor vazio.' });

  let resultado;
  switch (provedor) {
    case 'OpenAI': resultado = await validarOpenAI(valor); break;
    case 'Anthropic': resultado = await validarAnthropic(valor); break;
    default:
      // Provedor sem validacao automatica — passa direto
      resultado = { valido: true, motivo: `Provedor ${provedor} sem validacao automatica — assumido valido.` };
  }

  return jsonResp({ ok: true, ...resultado, provedor, len: valor.length });
});
