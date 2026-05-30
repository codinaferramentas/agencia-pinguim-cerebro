// ============================================================
// _shared/oauth-google.ts
// ============================================================
// Helper pra Edge Functions consumirem APIs Google (Gmail/Calendar/Drive)
// usando refresh_token salvo em pinguim.conexoes_google.
//
// Uso típico:
//   const accessToken = await obterAccessTokenSocio(cliente_id);
//   const resp = await fetch('https://gmail.googleapis.com/...', {
//     headers: { Authorization: `Bearer ${accessToken}` }
//   });
//
// Cache em memória (TTL = expires_in - 60s).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from './cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CacheEntry {
  token: string;
  expira_em_ms: number;
}
const cache = new Map<string, CacheEntry>();

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

// Busca conexão ativa do sócio. Se label/conexao_id, filtra. Senão pega is_padrao.
export async function buscarConexaoSocio(opts: { cliente_id: string; conexao_id?: string; label?: string }): Promise<{ id: string; refresh_token: string; email_google: string; label: string } | null> {
  const { cliente_id, conexao_id, label } = opts;
  let q = sb().from('conexoes_google')
    .select('id, refresh_token, email_google, label, is_padrao')
    .eq('cliente_id', cliente_id)
    .is('revogado_em', null);
  if (conexao_id) q = q.eq('id', conexao_id);
  if (label) q = q.eq('label', label);

  const { data, error } = await q.order('is_padrao', { ascending: false }).limit(1);
  if (error) throw new Error('buscarConexaoSocio: ' + error.message);
  return data && data[0] ? data[0] as any : null;
}

// Lista todas conexões ativas do sócio (pra desambiguar quando tem >1)
export async function listarConexoesSocio(cliente_id: string): Promise<Array<{ id: string; label: string; email_google: string; is_padrao: boolean }>> {
  const { data, error } = await sb().from('conexoes_google')
    .select('id, label, email_google, is_padrao')
    .eq('cliente_id', cliente_id)
    .is('revogado_em', null)
    .order('is_padrao', { ascending: false })
    .order('criado_em', { ascending: true });
  if (error) throw new Error('listarConexoesSocio: ' + error.message);
  return (data || []) as any;
}

// Renova access_token usando refresh_token. Faz cache.
async function renovarAccessToken(refresh_token: string, client_id: string, client_secret: string): Promise<{ access_token: string; expires_in: number; scope?: string }> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token,
      client_id,
      client_secret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await r.json();
  if (!r.ok || json.error) {
    throw new Error(`renovar access_token: ${json.error_description || json.error || 'desconhecido'}`);
  }
  return json;
}

// Pega access_token válido pra um sócio (1 chamada Google se cache miss).
export async function obterAccessTokenSocio(opts: { cliente_id: string; conexao_id?: string; label?: string }): Promise<{ access_token: string; conexao: { id: string; email_google: string; label: string } }> {
  const conexao = await buscarConexaoSocio(opts);
  if (!conexao) {
    throw new Error(`Sócio ${opts.cliente_id} sem conexão Google ativa${opts.label ? ` (label "${opts.label}")` : ''}. Conecte em Mission Control > Integrações.`);
  }

  const cacheKey = `${opts.cliente_id}:${conexao.id}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expira_em_ms > Date.now()) {
    return { access_token: cached.token, conexao };
  }

  const [client_id, client_secret] = await Promise.all([
    getChave('GOOGLE_OAUTH_CLIENT_ID', 'oauth-google-edge'),
    getChave('GOOGLE_OAUTH_CLIENT_SECRET', 'oauth-google-edge'),
  ]);
  if (!client_id || !client_secret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET ausentes no cofre');
  }

  const tokens = await renovarAccessToken(conexao.refresh_token, client_id, client_secret);
  const expira_em_ms = Date.now() + (tokens.expires_in * 1000) - 60_000;
  cache.set(cacheKey, { token: tokens.access_token, expira_em_ms });

  return { access_token: tokens.access_token, conexao };
}
