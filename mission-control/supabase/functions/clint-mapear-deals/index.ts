// ========================================================================
// Edge Function: clint-mapear-deals (Fase A — V2 corrigida)
// ========================================================================
// Mapeia produtos do Clint via /v1/deals + /v1/origins:
//   - origin.group.name = NOME DO PRODUTO (ProAlt, Elo, Lyra)
//   - deal.origin_id -> aponta pro funil dentro do produto
//
// Descoberta 2026-05-04: a abordagem anterior (varrer contatos pelo
// fields.nome_do_produto) so capturava contatos legados. Os negocios
// atuais (Elo, ProAlt, Lyra, 365 Roteiros) NAO preenchem esse campo
// nos contatos. Estao em /v1/deals com origin_id que mapeia em
// /v1/origins -> group.name.
//
// Estrategia:
// 1. Carregar todas origens (/v1/origins, ~237 itens) em mapa origin_id -> group_name
// 2. Varrer /v1/deals paginado, contar por group_name
// 3. Acumular em pinguim.clint_produto_mapeamento via RPC acumular_clint_produto
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

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
function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
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
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sbAnon.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

const RATE_DELAY_MS = 200;
const PAGE_SIZE = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface ClintOrigin {
  id: string;
  name: string;
  group?: { id: string; name: string } | null;
  archived_at?: string | null;
}

interface ClintDeal {
  id: string;
  origin_id?: string;
  status?: string;            // OPEN | WON | LOST
  created_at?: string;
  updated_at?: string;
  contact?: { email?: string | null };
}

async function clintGet(token: string, path: string) {
  const r = await fetch(`https://api.clint.digital${path}`, {
    headers: { 'api-token': token, 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`Clint ${path} HTTP ${r.status}`);
  return await r.json();
}

serve(async (req) => {
  const inicio = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const modo: string = body.modo || 'amostra';
  const paginaInicial: number = Math.max(1, Number(body.pagina_inicial || 1));
  const tempoMaxMs = modo === 'amostra' ? 60000 : 80000;
  const limitePaginas = modo === 'amostra' ? 5 : 99999;

  let token: string;
  try {
    token = await getChave('CLINT_API_TOKEN', 'clint-mapear-deals', { fallbackEnv: false });
    if (!token) throw new Error('vazio');
  } catch (e) {
    return jsonResp({ ok: false, erro: 'Token Clint nao configurado: ' + (e as Error).message }, 500);
  }

  const c = sb();
  const doze_meses_atras = new Date();
  doze_meses_atras.setMonth(doze_meses_atras.getMonth() - 12);
  const cutoff_12m = doze_meses_atras.toISOString();

  // 1. Carrega TODAS as origens (carregamento rapido, ~237 itens em 2 paginas)
  const origemMapa = new Map<string, string>(); // origin_id -> group_name
  try {
    for (let p = 1; p <= 5; p++) {
      const resp = await clintGet(token, `/v1/origins?limit=${PAGE_SIZE}&page=${p}`);
      const origens: ClintOrigin[] = resp?.data || [];
      for (const o of origens) {
        const grupo = o.group?.name?.trim();
        if (grupo) origemMapa.set(o.id, grupo);
      }
      if (!resp?.hasNext) break;
      await sleep(RATE_DELAY_MS);
    }
  } catch (e) {
    return jsonResp({ ok: false, erro: 'Falha ao carregar origens: ' + (e as Error).message }, 500);
  }

  if (origemMapa.size === 0) {
    return jsonResp({ ok: false, erro: 'Nenhuma origem com group encontrada — estrutura inesperada' }, 500);
  }

  // 2. Acumuladores por produto
  type Acc = { qtd_total: number; qtd_12m: number; primeiro: string | null; ultimo: string | null };
  const mapa = new Map<string, Acc>();

  let pagina = paginaInicial;
  const paginaInicialEfetiva = paginaInicial;
  let totalDealsLidos = 0;
  let semProduto = 0;
  let totalCount = 0;
  let temMais = false;
  const erros: string[] = [];

  try {
    while (pagina < paginaInicialEfetiva + limitePaginas && (Date.now() - inicio) < tempoMaxMs) {
      const url = `/v1/deals?limit=${PAGE_SIZE}&page=${pagina}`;
      let respDeals;
      try {
        respDeals = await clintGet(token, url);
      } catch (e) {
        erros.push(`page ${pagina}: ${(e as Error).message}`);
        break;
      }
      if (pagina === paginaInicialEfetiva) totalCount = respDeals.totalCount || 0;

      const deals: ClintDeal[] = respDeals?.data || [];
      if (deals.length === 0) break;

      for (const deal of deals) {
        totalDealsLidos++;
        const grupo = deal.origin_id ? origemMapa.get(deal.origin_id) : null;
        if (!grupo) { semProduto++; continue; }

        const created = deal.created_at || null;
        const updated = deal.updated_at || created;
        const acc = mapa.get(grupo) || { qtd_total: 0, qtd_12m: 0, primeiro: null, ultimo: null };
        acc.qtd_total++;
        if (updated && updated >= cutoff_12m) acc.qtd_12m++;
        if (created && (!acc.primeiro || created < acc.primeiro)) acc.primeiro = created;
        if (updated && (!acc.ultimo || updated > acc.ultimo)) acc.ultimo = updated;
        mapa.set(grupo, acc);
      }

      temMais = !!respDeals.hasNext;
      if (!temMais) break;
      pagina++;
      await sleep(RATE_DELAY_MS);
    }

    // Persiste acumulado via RPC (SOMA, nao SET)
    let inseridos = 0;
    for (const [nome, acc] of mapa.entries()) {
      const { error: errUp } = await c.rpc('acumular_clint_produto', {
        p_nome: nome,
        p_qtd_total: acc.qtd_total,
        p_qtd_12m: acc.qtd_12m,
        p_primeiro_visto: acc.primeiro,
        p_ultimo_visto: acc.ultimo,
      });
      if (errUp) erros.push(`acumular ${nome}: ${errUp.message}`);
      else inseridos++;
    }

    const top20 = [...mapa.entries()]
      .sort((a, b) => b[1].qtd_total - a[1].qtd_total)
      .slice(0, 20)
      .map(([nome, acc]) => ({ nome, qtd_total: acc.qtd_total, qtd_12m: acc.qtd_12m }));

    return jsonResp({
      ok: true,
      modo,
      duracao_ms: Date.now() - inicio,
      pagina_inicial: paginaInicialEfetiva,
      pagina_final_processada: pagina,
      paginas_processadas: pagina - paginaInicialEfetiva + 1,
      tem_mais_paginas: temMais,
      proxima_pagina: temMais ? pagina + 1 : null,
      total_count_clint: totalCount,
      origens_carregadas: origemMapa.size,
      deals_lidos: totalDealsLidos,
      sem_produto: semProduto,
      produtos_unicos: mapa.size,
      produtos_inseridos_ou_atualizados: inseridos,
      top20,
      erros: erros.slice(0, 5),
    });
  } catch (e) {
    return jsonResp({
      ok: false,
      erro: (e as Error).message,
      paginas_processadas: pagina,
      deals_lidos: totalDealsLidos,
      duracao_ms: Date.now() - inicio,
    }, 500);
  }
});
