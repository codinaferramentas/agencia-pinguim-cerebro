// Refina a ingestao do guia do app ProAlt: troca a fonte unica (chunks de
// 2000 chars misturando funcionalidades) por 1 fonte POR funcionalidade
// (semantica concentrada = ranqueia nas perguntas de dor) + 1 fonte de
// pitch/argumentos/cola. Vetoriza tudo no final.
import { env } from './lib/env.mjs';
import { supabase } from './lib/supabase.mjs';
import { embed, custoEmbedding } from './lib/openai.mjs';
import { chunkText } from './lib/chunk.mjs';
import fs from 'node:fs';

const FONTE_ANTIGA = '62d76675-2713-47ef-b4f8-a884569e1c38';
const CEREBRO_ID = '864e6f53-ce6e-4710-901c-72ba09128260';
const cfg = env();
const sb = supabase();

const md = fs.readFileSync('c:/Squad/docs/BIA-PROALT-APP-FUNCIONALIDADES.md', 'utf8');

// separa as secoes "## N. Nome"
const partes = md.split(/\n(?=## \d+\. )/);
const cabecalho = partes[0]; // pitch 15s + frase-ancora
const funcs = partes.slice(1).map(bloco => {
  const m = bloco.match(/^## \d+\. (.+)/);
  const nome = m ? m[1].trim() : 'sem-nome';
  // corta o que pertence a proxima secao de nivel 1 (# ...) se veio junto
  const corpo = bloco.split(/\n(?=# [A-ZÀ-Ú])/)[0].trim();
  return { nome, corpo };
});
// bloco final: cola rapida + argumentos de fechamento
const idxCola = md.indexOf('# COLA RÁPIDA');
const blocoVendas = idxCola >= 0 ? md.slice(idxCola) : '';

console.log(`funcionalidades: ${funcs.length}, bloco vendas: ${blocoVendas ? 'ok' : 'FALTOU'}`);
if (funcs.length < 15 || !blocoVendas) { console.error('parse suspeito — abortando'); process.exit(1); }

// remove fonte antiga (chunks primeiro)
await sb.from('cerebro_fontes_chunks').delete().eq('fonte_id', FONTE_ANTIGA);
await sb.from('cerebro_fontes').delete().eq('id', FONTE_ANTIGA);
console.log('fonte unica antiga removida');

const novas = [];
// 1 fonte por funcionalidade — titulo carrega nome; corpo carrega a dor
for (const f of funcs) {
  novas.push({
    titulo: `APP ProAlt — ${f.nome}`,
    conteudo: `# APP ProAlt — ${f.nome}\n\n${cabecalho.includes('Frase-âncora') ? '' : ''}${f.corpo}`,
  });
}
// pitch + argumentos + cola numa fonte "master de venda"
novas.push({
  titulo: 'APP ProAlt — Pitch, cola dor→funcionalidade e argumentos de fechamento',
  conteudo: `${cabecalho.trim()}\n\n${blocoVendas.trim()}`,
});

let custo = 0, totalChunks = 0;
for (const n of novas) {
  const { data: fonte, error: eF } = await sb.from('cerebro_fontes').insert({
    cerebro_id: CEREBRO_ID,
    titulo: n.titulo,
    tipo: 'material_apoio',
    origem: 'lote',
    conteudo_md: n.conteudo,
    metadata: { origem: 'app-proalt-export', uso: 'agente-vendas-bia', data_entrega: '2026-08-20' },
  }).select('id').single();
  if (eF) { console.error('erro insert', n.titulo, eF); process.exit(1); }

  const chunks = chunkText(n.conteudo);
  const vetores = await embed(chunks.map(c => c.conteudo));
  const rows = chunks.map((c, idx) => ({
    fonte_id: fonte.id,
    cerebro_id: CEREBRO_ID,
    chunk_index: c.chunk_index,
    conteudo: c.conteudo,
    token_count: c.token_count,
    embedding: vetores[idx],
    embedding_model: cfg.EMBEDDING_MODEL,
  }));
  const { error: eC } = await sb.from('cerebro_fontes_chunks').insert(rows);
  if (eC) { console.error('erro chunks', n.titulo, eC); process.exit(1); }
  await sb.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonte.id);
  totalChunks += chunks.length;
  custo += custoEmbedding(chunks.reduce((s, c) => s + (c.token_count || 0), 0));
  console.log('OK', n.titulo, `(${chunks.length} chunk${chunks.length > 1 ? 's' : ''})`);
}
console.log(`\nTotal: ${novas.length} fontes, ${totalChunks} chunks, US$ ${custo.toFixed(6)}`);
