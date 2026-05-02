// ========================================================================
// Edge Function: webhook-clint (Fase 1 — apenas monitor)
// ========================================================================
// Recebe webhook do Clint, valida token, loga payload bruto em
// pinguim.webhook_logs e retorna 200. SEM PARSER — fase 1 e so descobrir
// o formato real do payload do Clint.
//
// URL: https://wmelierxzpjamiofeemh.supabase.co/functions/v1/webhook-clint?token=XYZ
//
// Fase 2 (depois do 1o ping real): adicionar parser que faz upsert em
// customer_profiles + insert em customer_events / customer_compras.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

// Loga TUDO — sucesso ou erro. So nao loga se request for malformado a ponto
// de nao termos nem corpo (raro). Erro de logging nao deve quebrar a resposta.
async function logar(req: Request, dados: {
  status: number;
  payload: unknown;
  erro?: string;
  query: Record<string, string>;
  duracao_ms: number;
}) {
  try {
    const c = sb();
    await c.from('webhook_logs').insert({
      origem: 'clint',
      endpoint: 'webhook-clint',
      status_resposta: dados.status,
      metodo: req.method,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
      headers: Object.fromEntries([...req.headers.entries()].filter(([k]) =>
        !k.toLowerCase().startsWith('authorization') &&
        !k.toLowerCase().startsWith('cookie')
      )),
      query_params: dados.query,
      payload: dados.payload,
      erro: dados.erro || null,
      duracao_ms: dados.duracao_ms,
    });
  } catch (e) {
    console.error('Falha ao logar webhook:', (e as Error).message);
  }
}

serve(async (req) => {
  const inicio = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Aceitamos POST (padrao) e tambem GET pra teste manual no navegador
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResp({ ok: false, erro: 'Metodo nao suportado' }, 405);
  }

  const url = new URL(req.url);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { queryParams[k] = v; });

  // 1. Valida token
  const tokenRecebido = url.searchParams.get('token') || '';
  let tokenEsperado = '';
  try {
    tokenEsperado = await getChave('CLINT_WEBHOOK_TOKEN', 'webhook-clint', { fallbackEnv: false });
  } catch (e) {
    const erro = 'Token nao configurado no cofre: ' + (e as Error).message;
    await logar(req, { status: 500, payload: null, erro, query: queryParams, duracao_ms: Date.now() - inicio });
    return jsonResp({ ok: false, erro: 'Configuracao do servidor incompleta' }, 500);
  }

  if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
    await logar(req, {
      status: 401,
      payload: null,
      erro: tokenRecebido ? 'Token invalido' : 'Token ausente',
      query: queryParams,
      duracao_ms: Date.now() - inicio,
    });
    return jsonResp({ ok: false, erro: 'Token invalido ou ausente' }, 401);
  }

  // 2. Le payload (suporta JSON e form-urlencoded — alguns webhooks mandam form)
  let payload: unknown = null;
  let erroLeitura: string | null = null;
  try {
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      payload = await req.json();
    } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const obj: Record<string, unknown> = {};
      form.forEach((v, k) => { obj[k] = v; });
      payload = obj;
    } else {
      // Tenta JSON mesmo assim
      const txt = await req.text();
      try {
        payload = JSON.parse(txt);
      } catch {
        payload = { _raw_text: txt, _content_type: ct };
      }
    }
  } catch (e) {
    erroLeitura = 'Falha ao ler payload: ' + (e as Error).message;
  }

  // 3. Loga e responde 200 (mesmo sem parser — Clint precisa receber 2xx)
  await logar(req, {
    status: 200,
    payload,
    erro: erroLeitura || undefined,
    query: queryParams,
    duracao_ms: Date.now() - inicio,
  });

  return jsonResp({
    ok: true,
    mensagem: 'Webhook recebido (Fase 1 — apenas monitor, sem processamento ainda)',
    payload_recebido: !!payload,
  });
});
