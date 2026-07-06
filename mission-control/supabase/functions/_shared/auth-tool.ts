// Helper de auth pra tools que sao chamadas:
// 1. Internamente por agente-executar (via x-internal-token)
// 2. Externamente por user autenticado (via Bearer JWT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function decodeJwtPayload(jwt: string): any | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}

export async function requireAuthTool(req: Request): Promise<boolean> {
  // Caminho 1: header interno x-internal-token (chamada function-to-function)
  const internalToken = req.headers.get('x-internal-token') || '';
  if (internalToken && internalToken === SUPABASE_SERVICE_ROLE_KEY) return true;

  // Caminho 2: Bearer JWT
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace('Bearer ', '').trim();
  if (!jwt) return false;
  if (jwt === SUPABASE_SERVICE_ROLE_KEY) return true;
  const payload = decodeJwtPayload(jwt);
  if (!payload) return false;
  if (payload.role === 'service_role') return true;
  if (payload.sub && payload.aud === 'authenticated') {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!anonKey) return false;
    try {
      const sb = createClient(SUPABASE_URL, anonKey);
      const { data, error } = await sb.auth.getUser(jwt);
      return !error && !!data?.user;
    } catch { return false; }
  }
  return false;
}

export const corsTool = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Inclui os headers que o supabase-js functions.invoke manda automaticamente
  // (x-client-info, x-supabase-api-version). Faltando qualquer um, o browser
  // bloqueia no preflight e o invoke falha com "Failed to send a request".
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-internal-token, x-client-info, x-supabase-api-version',
};

export function jsonRespTool(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsTool, 'Content-Type': 'application/json' },
  });
}
