// ========================================================================
// Edge Function: atualizar-cotacao
// ========================================================================
// Busca cotacao USD->BRL e grava em pinguim.cotacoes. Roda 1x/dia via pg_cron.
//
// Tenta multiplas fontes em sequencia (resiliencia a rate-limit/feriado):
//  1. AwesomeAPI         (https://economia.awesomeapi.com.br/) — tempo real
//  2. exchangerate.host  (https://api.exchangerate.host/)      — fallback
//  3. Banco Central PTAX (olinda.bcb.gov.br)                   — so dia util
//
// Se TODAS falharem: nao escreve nada (cotacao_atual mantem ultimo valor).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sbAnon.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

// ---------- Fontes ----------
type Cotacao = { valor: number; fonte: string; metadata: Record<string, unknown> };

async function fonteAwesomeAPI(): Promise<Cotacao | null> {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const par = d?.USDBRL;
    const valor = Number(par?.bid);
    if (!isFinite(valor) || valor <= 0) return null;
    return {
      valor,
      fonte: 'awesomeapi',
      metadata: {
        ask: par.ask ? Number(par.ask) : null,
        high: par.high ? Number(par.high) : null,
        low: par.low ? Number(par.low) : null,
        timestamp_origem: par.timestamp,
      },
    };
  } catch { return null; }
}

async function fonteExchangerateHost(): Promise<Cotacao | null> {
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=BRL', {
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const valor = Number(d?.rates?.BRL);
    if (!isFinite(valor) || valor <= 0) return null;
    return {
      valor,
      fonte: 'exchangerate.host',
      metadata: { date: d.date },
    };
  } catch { return null; }
}

async function fonteBCB(): Promise<Cotacao | null> {
  // Tenta dia atual e ultimos 5 dias uteis (cobre fim de semana e feriado)
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mm}-${dd}-${yyyy}'&$top=1&$format=json`;
    try {
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json();
      const v = j?.value?.[0];
      const valor = Number(v?.cotacaoVenda);
      if (isFinite(valor) && valor > 0) {
        return {
          valor,
          fonte: 'bcb-ptax',
          metadata: { dataHoraCotacao: v.dataHoraCotacao, dias_atras: i },
        };
      }
    } catch { /* tenta proximo dia */ }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const inicio = Date.now();
  const tentativas: { fonte: string; ok: boolean }[] = [];

  let cotacao: Cotacao | null = null;
  for (const [nome, fn] of [
    ['awesomeapi', fonteAwesomeAPI],
    ['exchangerate.host', fonteExchangerateHost],
    ['bcb-ptax', fonteBCB],
  ] as [string, () => Promise<Cotacao | null>][]) {
    cotacao = await fn();
    tentativas.push({ fonte: nome, ok: !!cotacao });
    if (cotacao) break;
  }

  if (!cotacao) {
    return jsonResp({
      ok: false,
      erro: 'Todas as fontes falharam',
      tentativas,
      duracao_ms: Date.now() - inicio,
    }, 502);
  }

  const c = sb();
  const { error } = await c.from('cotacoes').insert({
    par: 'USD-BRL',
    valor: cotacao.valor,
    fonte: cotacao.fonte,
    metadata: { ...cotacao.metadata, tentativas },
  });
  if (error) {
    return jsonResp({ ok: false, erro: 'Erro ao salvar: ' + error.message }, 500);
  }

  return jsonResp({
    ok: true,
    par: 'USD-BRL',
    valor: cotacao.valor,
    fonte: cotacao.fonte,
    tentativas,
    duracao_ms: Date.now() - inicio,
  });
});
