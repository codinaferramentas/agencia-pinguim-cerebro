// ========================================================================
// Edge Function: clint-mapear-produtos (Fase A da coleta)
// ========================================================================
// Varre todos os contatos do Clint via paginacao, extrai nome_do_produto
// (fields.nome_do_produto), agrupa, conta. Popula clint_produto_mapeamento.
//
// SEM custo OpenAI — nao classifica nada, so lista produtos.
// SEM coleta de mensagens — so descoberta.
//
// Tempo estimado: 134k contatos / 200 por pagina = ~670 paginas.
// Com rate limit 200ms entre paginas = ~135s = 2-3 min.
//
// POST { modo: 'amostra' } -> primeiras 5 paginas (1000 contatos), pra teste
// POST { modo: 'total' }   -> varredura completa
//
// Idempotencia: ON CONFLICT (nome_clint) DO UPDATE acumula contadores.
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

const RATE_DELAY_MS = 200;
const PAGE_SIZE = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

interface ClintContact {
  id: string;
  created_at?: string;
  updated_at?: string;
  email?: string;
  fields?: Record<string, string | number | null>;
}

interface ClintListResp {
  status?: number;
  totalCount?: number;
  page?: number;
  totalPages?: number;
  hasNext?: boolean;
  data?: ClintContact[];
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
  // Edge function timeout efetivo ~120s. Cada pagina leva ~3s na pratica
  // (Clint API lento). Paramos quando passar de 100s pra ter margem
  // de gravar resposta.
  const limitePaginas = modo === 'amostra' ? 5 : 99999;
  // Tempo max de processamento. Edge function timeout ~150s, deixamos 80s pra
  // garantir margem de grilhar upserts no banco + responder antes do timeout.
  const tempoMaxMs = modo === 'amostra' ? 60000 : 80000;

  let token: string;
  try {
    token = await getChave('CLINT_API_TOKEN', 'clint-mapear-produtos', { fallbackEnv: false });
    if (!token) throw new Error('CLINT_API_TOKEN vazio');
  } catch (e) {
    return jsonResp({ ok: false, erro: 'Token Clint nao configurado: ' + (e as Error).message }, 500);
  }

  const c = sb();
  const doze_meses_atras = new Date();
  doze_meses_atras.setMonth(doze_meses_atras.getMonth() - 12);
  const cutoff_12m = doze_meses_atras.toISOString();

  // Acumuladores por nome de produto
  type Acumulador = {
    qtd_total: number;
    qtd_12m: number;
    primeiro_visto: string | null;
    ultimo_visto: string | null;
  };
  const mapa = new Map<string, Acumulador>();

  let pagina = paginaInicial;
  const paginaInicialEfetiva = paginaInicial;
  let totalContatosLidos = 0;
  let semProduto = 0;
  let totalCount = 0;
  let temMaisPaginas = false;
  const erros: string[] = [];

  try {
    while (pagina < paginaInicialEfetiva + limitePaginas && (Date.now() - inicio) < tempoMaxMs) {
      const url = `https://api.clint.digital/v1/contacts?limit=${PAGE_SIZE}&page=${pagina}`;
      const r = await fetch(url, {
        headers: { 'api-token': token, 'Accept': 'application/json' },
      });
      if (!r.ok) {
        erros.push(`page ${pagina} HTTP ${r.status}`);
        break;
      }
      const j: ClintListResp = await r.json();
      if (pagina === 1) totalCount = j.totalCount || 0;

      const contatos = j.data || [];
      if (contatos.length === 0) break;

      for (const ct of contatos) {
        totalContatosLidos++;
        const nomeProduto = (ct.fields?.nome_do_produto || '').toString().trim();
        if (!nomeProduto) { semProduto++; continue; }

        const updated = ct.updated_at || ct.created_at || null;
        const created = ct.created_at || null;
        const acc = mapa.get(nomeProduto) || {
          qtd_total: 0, qtd_12m: 0,
          primeiro_visto: null, ultimo_visto: null,
        };
        acc.qtd_total++;
        if (updated && updated >= cutoff_12m) acc.qtd_12m++;
        if (created && (!acc.primeiro_visto || created < acc.primeiro_visto)) acc.primeiro_visto = created;
        if (updated && (!acc.ultimo_visto || updated > acc.ultimo_visto)) acc.ultimo_visto = updated;
        mapa.set(nomeProduto, acc);
      }

      temMaisPaginas = !!j.hasNext;
      if (!j.hasNext) break;
      pagina++;
      await sleep(RATE_DELAY_MS);
    }

    // Persiste os agregados — usa RPC que SOMA contadores (nao substitui).
    // Critico pra processamento em ondas: cada onda ve so seus produtos,
    // sem RPC o segundo upsert sobrescreveria o primeiro.
    let inseridos = 0;
    for (const [nome, acc] of mapa.entries()) {
      const { error: errUp } = await c.rpc('acumular_clint_produto', {
        p_nome: nome,
        p_qtd_total: acc.qtd_total,
        p_qtd_12m: acc.qtd_12m,
        p_primeiro_visto: acc.primeiro_visto,
        p_ultimo_visto: acc.ultimo_visto,
      });
      if (errUp) {
        erros.push(`acumular ${nome}: ${errUp.message}`);
      } else {
        inseridos++;
      }
    }

    // Top 20 produtos pra resposta
    const top20 = [...mapa.entries()]
      .sort((a, b) => b[1].qtd_total - a[1].qtd_total)
      .slice(0, 20)
      .map(([nome, acc]) => ({
        nome,
        qtd_total: acc.qtd_total,
        qtd_12m: acc.qtd_12m,
      }));

    return jsonResp({
      ok: true,
      modo,
      duracao_ms: Date.now() - inicio,
      pagina_inicial: paginaInicialEfetiva,
      pagina_final_processada: pagina,
      paginas_processadas: pagina - paginaInicialEfetiva + 1,
      tem_mais_paginas: temMaisPaginas,
      proxima_pagina: temMaisPaginas ? pagina + 1 : null,
      total_count_clint: totalCount,
      contatos_lidos: totalContatosLidos,
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
      contatos_lidos: totalContatosLidos,
      duracao_ms: Date.now() - inicio,
    }, 500);
  }
});
