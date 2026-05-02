// ========================================================================
// Edge Function: webhook-clint (Fase 2 — parser ativo)
// ========================================================================
// Recebe webhook do Clint, valida token, loga payload e processa:
//   1. Upsert em pinguim.customer_profiles (chave: email)
//   2. Insert em pinguim.customer_compras (chave: email + produto)
//   3. Insert em pinguim.customer_events (timeline completa)
//
// Decisao Andre 2026-05-02: no Clint NAO existe lead sem compra. Toda
// origem ja e um produto. Se cair no grupo origem "Elo", e porque comprou
// Elo. Por isso status = 'cliente' direto, e ja inserimos compra.
//
// Payload Clint (descoberto na Fase 1):
//   {
//     "deal_user": "vendedor@email.com",     -- responsavel
//     "deal_origin_group": "Elo",            -- PRODUTO (chave)
//     "deal_origin": "Compras aprovadas",    -- funil dentro do produto
//     "deal_stage": "Base",                  -- etapa kanban atual
//     "deal_status": "OPEN",                 -- status (OPEN / WON / LOST)
//     "contact_name": "...",
//     "contact_email": "...",                -- chave de dedup
//     "contact_phone": "..."
//   }
//
// Idempotencia: customer_compras tem UNIQUE(gateway, gateway_id). Como o
// Clint nao manda ID unico por ping, usamos email+produto como gateway_id
// composto. Multiplos pings do mesmo lead+produto NAO duplicam compra,
// mas SIM geram eventos diferentes (cada ping = 1 evento).
//
// IMPORTANTE: NUNCA retorna 5xx mesmo se parser falhar. Clint reretentaria
// e poluiria o log. Erros do parser ficam em webhook_logs.erro.
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

// ---------- Parser do payload Clint ----------
interface ClintPayload {
  deal_user?: string;
  deal_origin_group?: string;       // produto (Elo, ProAlt, etc)
  deal_origin?: string;              // funil
  deal_stage?: string;               // etapa kanban
  deal_status?: string;              // OPEN | WON | LOST
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  [k: string]: unknown;
}

interface ResultadoParser {
  ok: boolean;
  customer_id?: string;
  produto?: string;
  acao?: string;       // 'criou_cliente' | 'atualizou_cliente' | 'criou_compra' | 'evento_unico'
  erro?: string;
}

async function processar(payload: ClintPayload): Promise<ResultadoParser> {
  const c = sb();

  const email = (payload.contact_email || '').trim().toLowerCase();
  const produto = (payload.deal_origin_group || '').trim();
  const nome = (payload.contact_name || '').trim() || null;
  const telefone = (payload.contact_phone || '').trim() || null;
  const stage = (payload.deal_stage || '').trim();
  const status = (payload.deal_status || '').trim().toUpperCase();
  const funil = (payload.deal_origin || '').trim();
  const vendedor = (payload.deal_user || '').trim();

  if (!email) return { ok: false, erro: 'Payload sem contact_email' };
  if (!produto) return { ok: false, erro: 'Payload sem deal_origin_group (produto)' };

  // 1. UPSERT customer_profile
  const { data: existente } = await c.from('customer_profiles')
    .select('id, nome, telefone')
    .eq('email', email)
    .maybeSingle();

  let customer_id: string;
  let acao: string;

  if (existente) {
    customer_id = existente.id;
    acao = 'atualizou_cliente';
    // So atualiza nome/telefone se vier valor novo (nao sobrescreve com vazio)
    const updates: Record<string, unknown> = { ultima_atividade_em: new Date().toISOString() };
    if (nome && nome !== existente.nome) updates.nome = nome;
    if (telefone && telefone !== existente.telefone) updates.telefone = telefone;
    await c.from('customer_profiles').update(updates).eq('id', customer_id);
  } else {
    // Cria como cliente direto (decisao Andre: no Clint nao existe lead sem compra)
    const { data: novo, error: errNovo } = await c.from('customer_profiles').insert({
      email,
      nome,
      telefone,
      status: 'cliente',
      origem: 'clint',
      ultima_atividade_em: new Date().toISOString(),
      metadata: { primeiro_funil: funil, primeiro_vendedor: vendedor },
    }).select('id').single();
    if (errNovo) return { ok: false, erro: 'Falha ao criar profile: ' + errNovo.message };
    customer_id = novo!.id;
    acao = 'criou_cliente';
  }

  // 2. UPSERT customer_compras (uma compra por cliente+produto)
  // gateway_id composto = email|produto pra idempotencia
  const gateway_id = `${email}|${produto}`;
  const { data: compraExistente } = await c.from('customer_compras')
    .select('id, status')
    .eq('gateway', 'clint')
    .eq('gateway_id', gateway_id)
    .maybeSingle();

  if (!compraExistente) {
    // Primeira vez que vemos esse cliente nesse produto
    // valor_brl = 0 por enquanto (Clint nao manda valor — ajustar Fase 3 com tabela de precos ou Hotmart)
    await c.from('customer_compras').insert({
      customer_id,
      produto_nome: produto,
      valor_brl: 0,
      status: status === 'WON' || status === 'PAID' || status === 'APPROVED' ? 'paga' : 'pendente',
      gateway: 'clint',
      gateway_id,
      comprado_em: new Date().toISOString(),
      metadata: { funil, stage_inicial: stage, vendedor },
    });
    if (acao === 'atualizou_cliente') acao = 'criou_compra';
  } else {
    // Compra ja existe — pode atualizar status se mudou (ex: era OPEN, virou WON)
    let novoStatus: string | null = null;
    if (status === 'WON' || status === 'PAID' || status === 'APPROVED') novoStatus = 'paga';
    else if (status === 'LOST' || status === 'REFUSED' || status === 'CANCELED') novoStatus = 'reembolsada';
    if (novoStatus && novoStatus !== compraExistente.status) {
      await c.from('customer_compras').update({
        status: novoStatus,
      }).eq('id', compraExistente.id);
    }
  }

  // 3. INSERT customer_events (cada ping vira 1 evento — timeline completa)
  await c.from('customer_events').insert({
    customer_id,
    tipo: stage ? `kanban_${stage.toLowerCase().replace(/\s+/g, '_')}` : 'webhook_clint',
    origem: 'clint',
    titulo: `${produto} · ${stage || 'sem etapa'}${funil ? ` (${funil})` : ''}${vendedor ? ` · ${vendedor}` : ''}`,
    payload: {
      produto,
      funil,
      stage,
      status,
      vendedor,
    },
    ocorrido_em: new Date().toISOString(),
  });

  return { ok: true, customer_id, produto, acao };
}

serve(async (req) => {
  const inicio = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

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

  // 2. Le payload
  let payload: ClintPayload | null = null;
  let erroLeitura: string | null = null;
  try {
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      payload = await req.json();
    } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const obj: Record<string, unknown> = {};
      form.forEach((v, k) => { obj[k] = v; });
      payload = obj as ClintPayload;
    } else {
      const txt = await req.text();
      try {
        payload = JSON.parse(txt);
      } catch {
        payload = { _raw_text: txt, _content_type: ct } as ClintPayload;
      }
    }
  } catch (e) {
    erroLeitura = 'Falha ao ler payload: ' + (e as Error).message;
  }

  // 3. Processa (parser). Se falhar, NUNCA retorna 5xx — Clint reretentaria.
  let resultado: ResultadoParser = { ok: false };
  let erroParser: string | null = null;
  if (payload && !erroLeitura) {
    try {
      resultado = await processar(payload);
      if (!resultado.ok) erroParser = resultado.erro || 'Parser falhou (sem mensagem)';
    } catch (e) {
      erroParser = 'Excecao no parser: ' + (e as Error).message;
    }
  }

  // 4. Log + resposta 200
  await logar(req, {
    status: 200,
    payload,
    erro: erroLeitura || erroParser || undefined,
    query: queryParams,
    duracao_ms: Date.now() - inicio,
  });

  return jsonResp({
    ok: true,
    mensagem: resultado.ok
      ? `Processado: ${resultado.acao} (${resultado.produto})`
      : 'Recebido (parser nao processou — ver webhook_logs)',
    parser_ok: resultado.ok,
    acao: resultado.acao,
  });
});
