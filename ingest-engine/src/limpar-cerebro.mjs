#!/usr/bin/env node
/**
 * Limpa um cérebro no banco: apaga fontes, chunks, lotes e arquivos de ingest.
 * Uso: node src/limpar-cerebro.mjs --cerebro=elo
 *
 * Deixa o produto + cerebro em si (só esvazia o conteúdo).
 */
import chalk from 'chalk';
import { supabase } from '../lib/supabase.mjs';

const args = process.argv.slice(2);
const flagCerebro = args.find(a => a.startsWith('--cerebro='));
const cerebroSlug = flagCerebro?.split('=')[1];

if (!cerebroSlug) {
  console.error(chalk.red('Uso: node src/limpar-cerebro.mjs --cerebro=<slug>'));
  process.exit(1);
}

const sb = supabase();

const { data: prod } = await sb.from('produtos').select('id, nome').eq('slug', cerebroSlug).single();
if (!prod) { console.error(chalk.red(`Produto "${cerebroSlug}" não existe.`)); process.exit(1); }
const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
if (!cer) { console.error(chalk.red(`Cérebro não existe.`)); process.exit(1); }

console.log(chalk.bold(`\n🧹 Limpando Cérebro ${prod.nome}\n`));

// Conta antes
const { count: countFontes }   = await sb.from('cerebro_fontes').select('*', { count: 'exact', head: true }).eq('cerebro_id', cer.id);
const { count: countChunks }   = await sb.from('cerebro_fontes_chunks').select('*', { count: 'exact', head: true }).eq('cerebro_id', cer.id);
const { count: countLotes }    = await sb.from('ingest_lotes').select('*', { count: 'exact', head: true }).eq('cerebro_id', cer.id);
const { count: countArquivos } = await sb.from('ingest_arquivos').select('*', { count: 'exact', head: true }).eq('cerebro_id', cer.id);

console.log(`  Fontes a apagar:          ${countFontes}`);
console.log(`  Chunks a apagar:          ${countChunks}`);
console.log(`  Lotes a apagar:           ${countLotes}`);
console.log(`  Arquivos ingest a apagar: ${countArquivos}\n`);

// CASCADE: apagar fontes apaga chunks automaticamente.
// Apagar lote apaga arquivos ingest automaticamente.
// Vamos usar a abordagem explícita pra garantir.

const { error: e1 } = await sb.from('cerebro_fontes_chunks').delete().eq('cerebro_id', cer.id);
if (e1) console.log(chalk.red(`  ✗ chunks: ${e1.message}`)); else console.log(chalk.green(`  ✓ chunks apagados`));

const { error: e2 } = await sb.from('cerebro_fontes').delete().eq('cerebro_id', cer.id);
if (e2) console.log(chalk.red(`  ✗ fontes: ${e2.message}`)); else console.log(chalk.green(`  ✓ fontes apagadas`));

const { error: e3 } = await sb.from('ingest_arquivos').delete().eq('cerebro_id', cer.id);
if (e3) console.log(chalk.red(`  ✗ arquivos: ${e3.message}`)); else console.log(chalk.green(`  ✓ arquivos ingest apagados`));

const { error: e4 } = await sb.from('ingest_lotes').delete().eq('cerebro_id', cer.id);
if (e4) console.log(chalk.red(`  ✗ lotes: ${e4.message}`)); else console.log(chalk.green(`  ✓ lotes apagados`));

// Reset ultima_alimentacao
await sb.from('cerebros').update({ ultima_alimentacao: null }).eq('id', cer.id);
console.log(chalk.green(`  ✓ cérebro resetado (ultima_alimentacao = null)`));

console.log(chalk.bold('\n✓ Cérebro limpo. Pronto pra nova carga.\n'));
