// ========================================================================
// Edge Function: vercel-env-vars
// ========================================================================
// Lista TODAS as env vars da Vercel do projeto Pinguim OS, MASCARADAS.
// Mostra so: nome, target (production/preview/development), ultimos 4 chars,
// e provedor inferido (OpenAI, Anthropic, Supabase, etc).
//
// Ninguem ve o valor completo. Painel "Cofre" do Pinguim OS consome.
//
// Variaveis necessarias na Edge:
//   VERCEL_TOKEN      (Personal Access Token com escopo Read)
//   VERCEL_PROJECT_ID
//   VERCEL_TEAM_ID    (opcional, se o projeto estiver em time)
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const VERCEL_TOKEN = Deno.env.get('VERCEL_TOKEN') ?? '';
const VERCEL_PROJECT_ID = Deno.env.get('VERCEL_PROJECT_ID') ?? '';
const VERCEL_TEAM_ID = Deno.env.get('VERCEL_TEAM_ID') ?? '';

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

function inferirProvedor(nome: string): string {
  const n = nome.toUpperCase();
  if (n.includes('OPENAI')) return 'OpenAI';
  if (n.includes('ANTHROPIC') || n.includes('CLAUDE')) return 'Anthropic';
  if (n.includes('GOOGLE') || n.includes('GEMINI')) return 'Google';
  if (n.includes('PERPLEXITY')) return 'Perplexity';
  if (n.includes('SUPABASE')) return 'Supabase';
  if (n.includes('VERCEL')) return 'Vercel';
  if (n.includes('GITHUB')) return 'GitHub';
  if (n.includes('STRIPE')) return 'Stripe';
  if (n.includes('DISCORD')) return 'Discord';
  if (n.includes('TWILIO')) return 'Twilio';
  if (n.includes('RESEND') || n.includes('SENDGRID') || n.includes('MAILGUN')) return 'Email';
  return 'Outro';
}

function inferirEscopo(nome: string): 'public' | 'secret' | 'unknown' {
  const n = nome.toUpperCase();
  if (n.startsWith('NEXT_PUBLIC_') || n.startsWith('VITE_') || n.startsWith('PUBLIC_')) return 'public';
  if (n.includes('SECRET') || n.includes('PRIVATE') || n.includes('SERVICE_ROLE') || n.includes('TOKEN') || n.includes('KEY')) return 'secret';
  return 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') return jsonResp({ error: 'POST or GET only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return jsonResp({
      ok: false,
      configurado: false,
      mensagem: 'Vercel nao esta configurada na Edge Function. Adicione VERCEL_TOKEN e VERCEL_PROJECT_ID nas env vars desta funcao.',
      como_configurar: {
        passo_1: 'Crie um Personal Access Token na Vercel com escopo "Read" do projeto.',
        passo_2: 'Pegue o Project ID em Settings > General do projeto na Vercel.',
        passo_3: 'No Supabase Dashboard > Edge Functions > vercel-env-vars > Secrets, adicione VERCEL_TOKEN e VERCEL_PROJECT_ID.',
        passo_4_opcional: 'Se o projeto pertence a um Team na Vercel, adicione tambem VERCEL_TEAM_ID.',
      },
    });
  }

  // Chama API da Vercel
  const url = new URL(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env`);
  if (VERCEL_TEAM_ID) url.searchParams.set('teamId', VERCEL_TEAM_ID);
  url.searchParams.set('decrypt', 'false'); // NUNCA descriptografa

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!resp.ok) {
    const err = await resp.text();
    return jsonResp({
      ok: false, configurado: true,
      erro: `Vercel API: ${resp.status} ${err.slice(0, 300)}`,
      hints: resp.status === 403
        ? ['Token sem escopo no projeto. Recrie o token na Vercel selecionando o projeto Pinguim.', 'Se o projeto está em um Team, adicione VERCEL_TEAM_ID nos secrets.']
        : (resp.status === 404 ? ['VERCEL_PROJECT_ID errado, ou projeto está em Team sem VERCEL_TEAM_ID.'] : []),
    }, 200);
  }
  const dados = await resp.json();
  const envs = dados.envs || [];

  const mascaradas = envs.map((e: any) => {
    const nome = e.key as string;
    const target = Array.isArray(e.target) ? e.target.join(', ') : (e.target || 'all');
    const valor_mascara = e.value
      ? '••••••••' + (e.value.length > 4 ? e.value.slice(-4) : '')
      : '(criptografado pela Vercel)';
    return {
      id: e.id,
      nome,
      provedor: inferirProvedor(nome),
      escopo: inferirEscopo(nome),
      target,
      tipo: e.type,                       // 'plain' | 'encrypted' | 'system' | 'secret'
      valor_mascara,
      criado_em: e.createdAt,
      atualizado_em: e.updatedAt,
    };
  });

  // Agrupa por provedor
  const porProvedor: Record<string, number> = {};
  mascaradas.forEach((m: any) => { porProvedor[m.provedor] = (porProvedor[m.provedor] || 0) + 1; });

  return jsonResp({
    ok: true,
    configurado: true,
    total: mascaradas.length,
    por_provedor: porProvedor,
    variaveis: mascaradas,
  });
});
