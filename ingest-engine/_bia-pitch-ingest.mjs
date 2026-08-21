// Ingesta o dossiê do pitch comercial ProAlt V2 (17/08/2026) no cérebro ProAlt,
// granular: 1 fonte por seção "## " do MD (mesma técnica do _bia-app-split.mjs,
// que colocou o app no top-3 de 5/5 queries de dor).
import { env } from './lib/env.mjs';
import { supabase } from './lib/supabase.mjs';
import { embed, custoEmbedding } from './lib/openai.mjs';
import { chunkText } from './lib/chunk.mjs';
import fs from 'node:fs';

const CEREBRO_ID = '864e6f53-ce6e-4710-901c-72ba09128260';
const PREFIXO = 'Pitch ProAlt V2 (17/08/2026) — ';
const cfg = env();
const sb = supabase();

const md = fs.readFileSync('c:/Squad/docs/BIA-PITCH-COMERCIAL-PROALT.md', 'utf8');
const partes = md.split(/\n(?=## )/).slice(1); // descarta preâmbulo (blockquote de contexto)
const secoes = partes.map(bloco => {
  const nome = (bloco.match(/^## (.+)/) || [])[1]?.trim() || 'sem-nome';
  return { nome, corpo: bloco.trim() };
});
console.log(`seções: ${secoes.length}`);
if (secoes.length < 8) { console.error('parse suspeito — abortando'); process.exit(1); }

// Princípio 11: SELECT antes de CREATE — remove versão anterior se existir
const { data: antigas } = await sb.from('cerebro_fontes')
  .select('id, titulo').eq('cerebro_id', CEREBRO_ID).ilike('titulo', 'Pitch ProAlt V2%');
if (antigas?.length) {
  console.log(`removendo ${antigas.length} fontes de versão anterior...`);
  const ids = antigas.map(a => a.id);
  await sb.from('cerebro_fontes_chunks').delete().in('fonte_id', ids);
  await sb.from('cerebro_fontes').delete().in('id', ids);
}

let custo = 0, totalChunks = 0;
for (const s of secoes) {
  const conteudo = `# ${PREFIXO}${s.nome}\n\n(Deck oficial de vendas usado pelo comercial — 84 slides.)\n\n${s.corpo}`;
  const { data: fonte, error: eF } = await sb.from('cerebro_fontes').insert({
    cerebro_id: CEREBRO_ID,
    titulo: `${PREFIXO}${s.nome}`,
    tipo: 'material_apoio',
    origem: 'lote',
    conteudo_md: conteudo,
    metadata: { origem: 'pitch-comercial-v2-pdf', uso: 'agente-vendas-bia', data_deck: '2026-08-17', pdf: 'clientes/proalt/ProAlt-Pitch-V2-2026-08-17.pdf' },
  }).select('id').single();
  if (eF) { console.error('erro insert', s.nome, eF); process.exit(1); }

  const chunks = chunkText(conteudo);
  const vetores = await embed(chunks.map(c => c.conteudo));
  const rows = chunks.map((c, idx) => ({
    fonte_id: fonte.id, cerebro_id: CEREBRO_ID, chunk_index: c.chunk_index,
    conteudo: c.conteudo, token_count: c.token_count,
    embedding: vetores[idx], embedding_model: cfg.EMBEDDING_MODEL,
  }));
  const { error: eC } = await sb.from('cerebro_fontes_chunks').insert(rows);
  if (eC) { console.error('erro chunks', s.nome, eC); process.exit(1); }
  await sb.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonte.id);
  totalChunks += chunks.length;
  custo += custoEmbedding(chunks.reduce((t, c) => t + (c.token_count || 0), 0));
  console.log('OK', s.nome, `(${chunks.length})`);
}
console.log(`\nTotal: ${secoes.length} fontes, ${totalChunks} chunks, US$ ${custo.toFixed(6)}`);
