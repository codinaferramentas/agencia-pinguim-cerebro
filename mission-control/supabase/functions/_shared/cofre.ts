// ========================================================================
// _shared/cofre.ts
// ========================================================================
// Helper que toda Edge Function usa pra ler chaves do cofre Pinguim OS.
// Substitui Deno.env.get('OPENAI_API_KEY') por await getChave('OPENAI_API_KEY').
//
// Cache 5 min em memória (por instância de função). Quando o Andre rotaciona
// uma chave no painel, na próxima invocação após 5 min ela vem nova.
// Pra invalidar manual: passa { forceRefresh: true }.
//
// Bootstrap: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY continuam vindo de
// Deno.env (esses 2 não vêm do cofre — não tem como, é o que a gente usa
// pra autenticar no banco e ler o cofre).
// ========================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  valor: string;
  expira_em: number;
}

const cache = new Map<string, CacheEntry>();

let _client: SupabaseClient | null = null;
function client() {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
  return _client;
}

/**
 * Le 1 chave do cofre. Cache 5 min.
 * Fallback Deno.env caso cofre nao tenha (transicao gradual).
 *
 * @param nome - nome da chave (ex.: 'OPENAI_API_KEY')
 * @param consumidor - identificador do consumidor (ex.: 'buscar-cerebro')
 * @param opts.forceRefresh - ignora cache
 * @param opts.fallbackEnv - usa Deno.env se cofre nao tiver
 */
export async function getChave(
  nome: string,
  consumidor: string,
  opts: { forceRefresh?: boolean; fallbackEnv?: boolean } = {},
): Promise<string> {
  const agora = Date.now();
  if (!opts.forceRefresh) {
    const c = cache.get(nome);
    if (c && c.expira_em > agora) return c.valor;
  }

  // Le do cofre
  try {
    const { data, error } = await client().rpc('get_chave', {
      p_nome: nome,
      p_consumidor: consumidor,
      p_origem: 'edge-function',
    });
    if (!error && typeof data === 'string' && data.length > 0) {
      cache.set(nome, { valor: data, expira_em: agora + TTL_MS });
      return data;
    }
  } catch (_) { /* cai no fallback */ }

  // Fallback Deno.env (pra periodo de transicao + bootstrap)
  if (opts.fallbackEnv !== false) {
    const env = Deno.env.get(nome);
    if (env) {
      cache.set(nome, { valor: env, expira_em: agora + TTL_MS });
      return env;
    }
  }

  throw new Error(`Chave '${nome}' nao encontrada no cofre nem em env (consumidor: ${consumidor}).`);
}

/**
 * Le multiplas chaves de uma vez.
 */
export async function getChaves(
  nomes: string[],
  consumidor: string,
  opts: { forceRefresh?: boolean; fallbackEnv?: boolean } = {},
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(nomes.map(async (n) => {
    out[n] = await getChave(n, consumidor, opts);
  }));
  return out;
}

export function invalidarCache(nome?: string) {
  if (nome) cache.delete(nome);
  else cache.clear();
}
