// Auth helper para edge functions do projeto externo.
// Valida Bearer token contra cofre_chaves (TOKEN_PROJETO_EXTERNO_CRIATIVOS).
// Cache 5 min em memoria.

import { getChave } from './cofre.ts';

let cache: { token: string; expira: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function validarTokenExterno(req: Request): Promise<{ ok: boolean; origem?: string; tokenHash?: string }> {
  const auth = req.headers.get('Authorization') || '';
  const recebido = auth.replace('Bearer ', '').trim();
  if (!recebido) return { ok: false };

  const agora = Date.now();
  let tokenEsperado: string;
  if (cache && cache.expira > agora) {
    tokenEsperado = cache.token;
  } else {
    try {
      tokenEsperado = await getChave('TOKEN_PROJETO_EXTERNO_CRIATIVOS', 'edge-externa');
      cache = { token: tokenEsperado, expira: agora + TTL_MS };
    } catch (_) {
      return { ok: false };
    }
  }

  // Comparacao constant-time pra evitar timing attack
  if (recebido.length !== tokenEsperado.length) return { ok: false };
  let diff = 0;
  for (let i = 0; i < recebido.length; i++) {
    diff |= recebido.charCodeAt(i) ^ tokenEsperado.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false };

  // Hash do token usado (para gravar auditoria sem expor o valor)
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(recebido));
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  return { ok: true, origem: 'projeto-externo-criativos', tokenHash };
}

export const corsExterno = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsExterno, 'Content-Type': 'application/json' },
  });
}
