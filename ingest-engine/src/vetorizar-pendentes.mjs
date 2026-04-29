#!/usr/bin/env node
/**
 * Vetoriza fontes que ja existem no banco mas ainda nao tem chunks.
 *
 * Caso de uso original: os 39 SOULs de Clones foram inseridos com
 * ingest_status='ok' mas sem chamar o pipeline de ingest, entao nao
 * tem chunks pra busca semantica. Este script preenche.
 *
 * Uso:
 *   node src/vetorizar-pendentes.mjs                 # vetoriza tudo que esta sem chunks
 *   node src/vetorizar-pendentes.mjs --categoria=clone   # so fontes de produtos categoria=clone
 *   node src/vetorizar-pendentes.mjs --dry-run       # so lista, nao vetoriza
 */
import chalk from 'chalk';
import { env } from '../lib/env.mjs';
import { supabase } from '../lib/supabase.mjs';
import { embed, custoEmbedding } from '../lib/openai.mjs';
import { chunkText } from '../lib/chunk.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const flagCategoria = args.find(a => a.startsWith('--categoria='));
const categoriaFiltro = flagCategoria?.split('=')[1] || null;

const cfg = env();
const sb = supabase();

console.log(chalk.bold('\nVetorizar fontes pendentes\n'));
if (categoriaFiltro) console.log(chalk.dim(`filtro: produtos.categoria = ${categoriaFiltro}`));
if (dryRun) console.log(chalk.yellow('[DRY-RUN] nao vai vetorizar de verdade'));
console.log();

// 1. Lista fontes alvo
let cerebroIdsPermitidos = null;
if (categoriaFiltro) {
  const { data: produtos, error } = await sb
    .from('produtos')
    .select('id')
    .eq('categoria', categoriaFiltro);
  if (error) throw error;
  const produtoIds = produtos.map(p => p.id);
  if (produtoIds.length === 0) {
    console.log(chalk.dim('Nenhum produto na categoria.'));
    process.exit(0);
  }
  const { data: cerebros, error: e2 } = await sb
    .from('cerebros')
    .select('id')
    .in('produto_id', produtoIds);
  if (e2) throw e2;
  cerebroIdsPermitidos = cerebros.map(c => c.id);
  if (cerebroIdsPermitidos.length === 0) {
    console.log(chalk.dim('Nenhum cerebro na categoria.'));
    process.exit(0);
  }
}

let q = sb.from('cerebro_fontes')
  .select('id, cerebro_id, titulo, conteudo_md, tipo')
  .not('conteudo_md', 'is', null);
if (cerebroIdsPermitidos) q = q.in('cerebro_id', cerebroIdsPermitidos);

const { data: fontes, error: errFontes } = await q;
if (errFontes) throw errFontes;

console.log(chalk.dim(`Fontes candidatas: ${fontes.length}`));

// 2. Filtra so as que NAO tem chunks
const fontesPendentes = [];
for (const f of fontes) {
  const { count } = await sb.from('cerebro_fontes_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('fonte_id', f.id);
  if ((count || 0) === 0) fontesPendentes.push(f);
}

console.log(chalk.bold(`Fontes sem chunks: ${fontesPendentes.length}`));
if (fontesPendentes.length === 0) {
  console.log(chalk.green('Tudo vetorizado, nada a fazer.'));
  process.exit(0);
}

for (const f of fontesPendentes) {
  console.log(chalk.dim(`  - ${f.titulo} (${f.tipo}) [${f.id.slice(0,8)}]`));
}

if (dryRun) {
  console.log(chalk.yellow('\n[DRY-RUN] saindo sem vetorizar.'));
  process.exit(0);
}

// 3. Vetoriza
console.log(chalk.bold('\nVetorizando...\n'));
const BATCH = 50;
let totalChunks = 0;
let totalCusto = 0;
let totalErros = 0;

for (const f of fontesPendentes) {
  try {
    const chunks = chunkText(f.conteudo_md);
    if (chunks.length === 0) {
      console.log(chalk.dim(`  skip (texto vazio): ${f.titulo}`));
      continue;
    }
    let chunksFonte = 0;
    let custoFonte = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
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
      const { error } = await sb.from('cerebro_fontes_chunks').insert(rows);
      if (error) throw error;
      chunksFonte += slice.length;
      const tokensBatch = slice.reduce((s, c) => s + (c.token_count || 0), 0);
      custoFonte += custoEmbedding(tokensBatch);
    }
    await sb.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', f.id);
    totalChunks += chunksFonte;
    totalCusto += custoFonte;
    console.log(chalk.green(`  OK ${f.titulo} (${chunksFonte} chunks, US$ ${custoFonte.toFixed(6)})`));
  } catch (e) {
    totalErros++;
    console.log(chalk.red(`  ERRO ${f.titulo}: ${e.message}`));
  }
}

console.log(chalk.bold(`\nResumo`));
console.log(`  Fontes processadas: ${fontesPendentes.length - totalErros}`);
console.log(`  Chunks criados:     ${totalChunks}`);
console.log(`  Erros:              ${totalErros}`);
console.log(`  Custo embedding:    US$ ${totalCusto.toFixed(6)}  ~ R$ ${(totalCusto * 5.1).toFixed(4)}`);
