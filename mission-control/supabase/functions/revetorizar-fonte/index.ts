// ========================================================================
// Edge Function: revetorizar-fonte
// ========================================================================
// Recebe fonte_id, le o conteudo_md atual da tabela cerebro_fontes,
// rechunka e revetoriza. Apaga chunks antigos antes de chamar (front
// ja faz isso, mas a gente garante de novo aqui pra idempotencia).
//
// Uso: edicao manual de fonte que muda conteudo_md.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const EMBED_BATCH = 50;

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

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

function chunkText(texto: string) {
  const chunks: { chunk_index: number; conteudo: string; token_count: number }[] = [];
  let i = 0, idx = 0;
  while (i < texto.length) {
    const conteudo = texto.slice(i, i + CHUNK_SIZE_CHARS);
    chunks.push({ chunk_index: idx, conteudo, token_count: Math.round(conteudo.length / 4) });
    i += CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS;
    idx++;
  }
  return chunks;
}

async function embed(textos: string[]): Promise<number[][]> {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: textos }),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Embeddings falhou: ${resp.status} ${errBody.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.data.map((d: any) => d.embedding);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);

  if (!(await requireAuth(req))) return jsonResp({ error: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON invalido' }, 400); }

  const { fonte_id } = body;
  if (!fonte_id) return jsonResp({ error: 'fonte_id obrigatorio' }, 400);

  try {
    const client = sb();

    // 1. Le a fonte atualizada
    const { data: fonte, error: errF } = await client.from('cerebro_fontes')
      .select('id, cerebro_id, conteudo_md, titulo')
      .eq('id', fonte_id)
      .single();
    if (errF || !fonte) return jsonResp({ error: 'Fonte nao encontrada' }, 404);

    const texto = (fonte.conteudo_md || '').trim();
    if (!texto || texto.length < 10) {
      // Sem conteudo: apenas garante que nao ha chunks orfaos
      await client.from('cerebro_fontes_chunks').delete().eq('fonte_id', fonte_id);
      await client.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonte_id);
      return jsonResp({ ok: true, chunks: 0, custo_usd: 0, observacao: 'Conteudo vazio, sem vetores criados.' });
    }

    // 2. Apaga chunks antigos (idempotente — front tambem faz mas garantimos)
    await client.from('cerebro_fontes_chunks').delete().eq('fonte_id', fonte_id);

    // 3. Chunk + embed
    const chunks = chunkText(texto);
    let custo_usd = 0;

    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const slice = chunks.slice(i, i + EMBED_BATCH);
      const vetores = await embed(slice.map(c => c.conteudo));
      const tokens = slice.reduce((s, c) => s + c.token_count, 0);
      custo_usd += (tokens / 1_000_000) * 0.02;

      const rows = slice.map((c, idx) => ({
        fonte_id,
        cerebro_id: fonte.cerebro_id,
        chunk_index: c.chunk_index,
        conteudo: c.conteudo,
        token_count: c.token_count,
        embedding: vetores[idx],
        embedding_model: EMBEDDING_MODEL,
      }));
      const { error: errIns } = await client.from('cerebro_fontes_chunks').insert(rows);
      if (errIns) throw new Error('Erro ao inserir chunks: ' + errIns.message);
    }

    // 4. Marca fonte como ok
    await client.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonte_id);

    return jsonResp({ ok: true, chunks: chunks.length, custo_usd: Number(custo_usd.toFixed(6)) });
  } catch (e: any) {
    console.error('revetorizar-fonte erro:', e);
    return jsonResp({ error: e.message || String(e) }, 500);
  }
});
