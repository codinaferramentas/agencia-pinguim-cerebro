// Vetoriza APENAS a fonte do guia do app ProAlt (material de vendas Bia).
// Necessario porque vetorizar-pendentes.mjs varre so as primeiras 1000 fontes.
import { env } from './lib/env.mjs';
import { supabase } from './lib/supabase.mjs';
import { embed, custoEmbedding } from './lib/openai.mjs';
import { chunkText } from './lib/chunk.mjs';

const FONTE_ID = '62d76675-2713-47ef-b4f8-a884569e1c38';
const cfg = env();
const sb = supabase();

const { data: f, error } = await sb.from('cerebro_fontes')
  .select('id, cerebro_id, titulo, conteudo_md')
  .eq('id', FONTE_ID).single();
if (error || !f) { console.error('fonte nao encontrada', error); process.exit(1); }

const { count } = await sb.from('cerebro_fontes_chunks')
  .select('id', { count: 'exact', head: true }).eq('fonte_id', f.id);
if ((count || 0) > 0) { console.log(`ja tem ${count} chunks — nada a fazer.`); process.exit(0); }

const chunks = chunkText(f.conteudo_md);
console.log(`"${f.titulo}" → ${chunks.length} chunks`);

let custo = 0;
for (let i = 0; i < chunks.length; i += 50) {
  const slice = chunks.slice(i, i + 50);
  const vetores = await embed(slice.map(c => c.conteudo));
  const rows = slice.map((c, idx) => ({
    fonte_id: f.id,
    cerebro_id: f.cerebro_id,
    chunk_index: c.chunk_index,
    conteudo: c.conteudo,
    token_count: c.token_count,
    embedding: vetores[idx],
    embedding_model: cfg.EMBEDDING_MODEL,
  }));
  const { error: eI } = await sb.from('cerebro_fontes_chunks').insert(rows);
  if (eI) { console.error('erro insert chunks', eI); process.exit(1); }
  custo += custoEmbedding(slice.reduce((s, c) => s + (c.token_count || 0), 0));
}
await sb.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', f.id);
console.log(`OK — ${chunks.length} chunks, US$ ${custo.toFixed(6)}`);
