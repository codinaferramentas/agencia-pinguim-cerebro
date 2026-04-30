/**
 * Cofre client local — espelho do _shared/cofre.ts das Edge Functions.
 * Le chaves de pinguim.cofre_chaves via service_role, com cache 5min.
 * Fallback pra .env.local (Deno.env) se cofre nao tiver.
 *
 * Uso:
 *   import { getChave } from './cofre.mjs';
 *   const apiKey = await getChave('OPENAI_API_KEY', 'meu-script');
 */
import { supabase } from './supabase.mjs';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export async function getChave(nome, consumidor = 'ingest-engine-local', opts = {}) {
  const agora = Date.now();
  if (!opts.forceRefresh) {
    const c = cache.get(nome);
    if (c && c.expira_em > agora) return c.valor;
  }
  try {
    const sb = supabase();
    const { data, error } = await sb.rpc('get_chave', {
      p_nome: nome,
      p_consumidor: consumidor,
      p_origem: 'local',
    });
    if (!error && typeof data === 'string' && data.length > 0) {
      cache.set(nome, { valor: data, expira_em: agora + TTL_MS });
      return data;
    }
  } catch (_) { /* cai no fallback */ }

  if (opts.fallbackEnv !== false) {
    const env = process.env[nome];
    if (env) {
      cache.set(nome, { valor: env, expira_em: agora + TTL_MS });
      return env;
    }
  }
  throw new Error(`Chave '${nome}' nao encontrada no cofre nem em env (consumidor: ${consumidor}).`);
}

export function invalidarCache(nome) {
  if (nome) cache.delete(nome); else cache.clear();
}
