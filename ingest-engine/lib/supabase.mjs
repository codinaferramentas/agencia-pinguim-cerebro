import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';

let _client = null;

/**
 * Cliente do schema pinguim (o nosso).
 * Usa service_role_key. Fica isolado do schema public (app comercial).
 */
export function supabase() {
  if (_client) return _client;
  const cfg = env();
  _client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
  return _client;
}
