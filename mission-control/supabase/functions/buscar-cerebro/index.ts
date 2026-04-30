// ========================================================================
// Edge Function: buscar-cerebro
// ========================================================================
// Busca semantica em um Cerebro especifico. Recebe { cerebro_id, query },
// gera embedding da query, chama RPC pinguim.buscar_chunks_semantico,
// retorna top chunks ordenados por similaridade.
//
// Uso: barra de busca no painel + futuro motor de copy/persona/agentes.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const EMBEDDING_MODEL = 'text-embedding-3-small';

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

async function gerarEmbedding(texto: string): Promise<number[]> {
  const OPENAI_API_KEY = await getChave('OPENAI_API_KEY', 'buscar-cerebro');
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texto }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embeddings ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);

  if (!(await requireAuth(req))) return jsonResp({ error: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON invalido' }, 400); }

  const { cerebro_id, query, top_k = 8, min_similarity = 0.3 } = body;
  if (!cerebro_id || !query) return jsonResp({ error: 'cerebro_id e query obrigatorios' }, 400);

  const queryClean = String(query).trim();
  if (queryClean.length < 3) return jsonResp({ error: 'Query muito curta (min 3 caracteres)' }, 400);

  try {
    // 1. Gera embedding da query
    const embedding = await gerarEmbedding(queryClean);
    // Custo desprezivel: ~$0.00002 por busca
    const custo_usd = (queryClean.length / 4 / 1_000_000) * 0.02;

    // 2. RPC busca semantica
    const client = sb();
    const { data, error } = await client.rpc('buscar_chunks_semantico', {
      query_embedding: embedding,
      target_cerebro_id: cerebro_id,
      top_k,
      min_similarity,
    });

    if (error) return jsonResp({ error: 'RPC erro: ' + error.message }, 500);

    return jsonResp({
      ok: true,
      query: queryClean,
      total: (data || []).length,
      custo_usd: Number(custo_usd.toFixed(8)),
      resultados: (data || []).map((r: any) => ({
        chunk_id: r.chunk_id,
        fonte_id: r.fonte_id,
        tipo: r.tipo,
        titulo: r.titulo,
        conteudo: r.conteudo,
        similarity: Number(Number(r.similarity).toFixed(4)),
      })),
    });
  } catch (e: any) {
    return jsonResp({ error: e.message || String(e) }, 500);
  }
});
