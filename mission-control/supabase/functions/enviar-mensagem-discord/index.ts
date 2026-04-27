// ========================================================================
// Edge Function: enviar-mensagem-discord
// ========================================================================
// Envia mensagem em canal especifico do Discord da Pinguim via webhook.
// Recebe { webhook_url, conteudo, embeds? } ou { canal, conteudo, embeds? }
// (canal eh um alias mapeado em DISCORD_WEBHOOKS_<NOME>).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return false;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(jwt);
  return !error && !!data?.user;
}

// Resolve um slug de canal -> webhook_url.
// Fonte primaria: tabela pinguim.discord_canais (cadastrada pelo painel).
// Fallback: secret DISCORD_WEBHOOK_<NOME> (compatibilidade).
async function resolverCanal(canal: string): Promise<string | null> {
  // 1) banco
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      db: { schema: 'pinguim' },
    });
    const { data } = await sb
      .from('discord_canais')
      .select('webhook_url, ativo')
      .eq('slug', canal)
      .maybeSingle();
    if (data?.ativo && data.webhook_url) return data.webhook_url;
  } catch { /* cai pro fallback */ }
  // 2) env (compat)
  const slug = canal.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return Deno.env.get(`DISCORD_WEBHOOK_${slug}`) || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);

  if (!(await requireAuth(req))) return jsonResp({ error: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON invalido' }, 400); }

  const { conteudo, embeds, canal } = body;
  let webhook_url = body.webhook_url;

  if (!conteudo && !(embeds && embeds.length)) {
    return jsonResp({ error: 'conteudo ou embeds obrigatorio' }, 400);
  }

  // Resolve canal -> webhook se nao foi passado direto
  if (!webhook_url && canal) {
    webhook_url = await resolverCanal(canal);
    if (!webhook_url) {
      return jsonResp({
        error: `Canal '${canal}' nao encontrado. Cadastre em /integracoes > Canais Discord.`
      }, 400);
    }
  }

  if (!webhook_url) {
    return jsonResp({ error: 'webhook_url ou canal obrigatorio' }, 400);
  }

  // Valida que e um webhook do discord (evita SSRF — so aceitamos discord.com)
  try {
    const u = new URL(webhook_url);
    if (!u.hostname.endsWith('discord.com') && !u.hostname.endsWith('discordapp.com')) {
      return jsonResp({ error: 'webhook_url precisa ser do discord.com' }, 400);
    }
  } catch { return jsonResp({ error: 'webhook_url invalida' }, 400); }

  // Limita tamanho do conteudo (Discord tem limite de 2000 chars)
  const conteudoFinal = (conteudo || '').slice(0, 2000);

  try {
    const t0 = Date.now();
    const resp = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: conteudoFinal || undefined,
        embeds: embeds || undefined,
        allowed_mentions: { parse: [] },  // nao @ ninguem por padrao
      }),
    });
    const duracao = Date.now() - t0;

    if (!resp.ok) {
      const txt = await resp.text();
      return jsonResp({
        error: `Discord retornou ${resp.status}: ${txt.slice(0, 200)}`,
        duracao_ms: duracao,
      }, 502);
    }

    return jsonResp({
      ok: true,
      enviado_em: new Date().toISOString(),
      tamanho_conteudo: conteudoFinal.length,
      duracao_ms: duracao,
      custo_usd: 0,
    });
  } catch (e: any) {
    return jsonResp({ error: e.message || String(e) }, 500);
  }
});
