// Auth helper das Edge Functions de Vendas de Evento.
// Valida Bearer token contra o cofre (EVENTO_TOKEN). Cache 5 min.
// Mesmo padrão de auth-externa.ts, mas chave própria do evento.
//
// Também exporta o client Supabase apontando pro schema vendas_eventos
// (schema isolado, NÃO exposto no PostgREST — só service_role acessa).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from './cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

let _sb: SupabaseClient | null = null;
/**
 * Client service_role no schema pinguim (exposto no PostgREST).
 * vendas_eventos NÃO é exposto (segurança), então o acesso é via RPCs
 * pinguim.ve_* (SECURITY DEFINER) que operam dentro de vendas_eventos.
 */
export function sbEventos(): SupabaseClient {
  if (_sb) return _sb;
  _sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
  return _sb;
}

let cache: { token: string; expira: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function validarTokenEvento(req: Request): Promise<{ ok: boolean }> {
  const auth = req.headers.get('Authorization') || '';
  const recebido = auth.replace('Bearer ', '').trim();
  if (!recebido) return { ok: false };

  const agora = Date.now();
  let esperado: string;
  if (cache && cache.expira > agora) {
    esperado = cache.token;
  } else {
    try {
      esperado = await getChave('EVENTO_TOKEN', 'edge-evento');
      cache = { token: esperado, expira: agora + TTL_MS };
    } catch (_) {
      return { ok: false };
    }
  }

  // Comparação constant-time (anti timing attack)
  if (recebido.length !== esperado.length) return { ok: false };
  let diff = 0;
  for (let i = 0; i < recebido.length; i++) {
    diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return { ok: diff === 0 };
}

// CORS: inclui x-client-info + x-supabase-api-version porque a tela chama via
// supabase.functions.invoke() (senão o browser bloqueia no preflight).
export const corsEvento = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version',
};

export function jsonEvento(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsEvento, 'Content-Type': 'application/json' },
  });
}

/** Máscara de CPF pra retorno de busca: ***.***.***-12 */
export function mascararCpf(cpf?: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, '');
  if (d.length < 4) return '***';
  return `***.***.***-${d.slice(-2)}`;
}
