import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';

let _client = null;

export function supabase() {
  if (_client) return _client;
  const cfg = env();
  _client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return _client;
}
