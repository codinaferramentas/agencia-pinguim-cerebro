#!/usr/bin/env node
/**
 * CLI de ingestão.
 *
 * Uso:
 *   node src/ingest.mjs <zip-ou-pasta> --cerebro=<slug> [--filtro=<palavra>] [--origem=lote]
 *
 * Ex:
 *   node src/ingest.mjs "C:\Users\andre\Downloads\tudo.zip" --cerebro=elo --filtro=elo
 */
import fs from 'node:fs';
import chalk from 'chalk';
import { supabase } from '../lib/supabase.mjs';
import { processarZip } from './engine.mjs';

const args = process.argv.slice(2);
const entrada = args[0];
const flagCerebro = args.find(a => a.startsWith('--cerebro='));
const flagFiltro = args.find(a => a.startsWith('--filtro='));
const flagOrigem = args.find(a => a.startsWith('--origem='));

const cerebroSlug = flagCerebro?.split('=')[1];
const filtro = flagFiltro?.split('=')[1] || '';
const origem = flagOrigem?.split('=')[1] || 'lote';

if (!entrada || !cerebroSlug) {
  console.error(chalk.red('Uso: node src/ingest.mjs <zip-ou-pasta> --cerebro=<slug> [--filtro=<palavra>]'));
  process.exit(1);
}
if (!fs.existsSync(entrada)) {
  console.error(chalk.red(`Caminho não existe: ${entrada}`));
  process.exit(1);
}

const sb = supabase();

// Localiza cérebro
const { data: prod } = await sb.from('produtos').select('id, nome').eq('slug', cerebroSlug).single();
if (!prod) { console.error(chalk.red(`Produto "${cerebroSlug}" não existe. Rode: npm run setup-elo`)); process.exit(1); }
const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
if (!cer) { console.error(chalk.red(`Cérebro pro "${cerebroSlug}" não existe.`)); process.exit(1); }

console.log(chalk.bold(`\n📦 Ingest — Cérebro ${prod.nome}\n`));
console.log(`  Entrada: ${chalk.cyan(entrada)}`);
if (filtro) console.log(`  Filtro:  ${chalk.cyan(filtro)}`);
console.log(`  Origem:  ${chalk.cyan(origem)}\n`);

// Cria lote
const { data: lote } = await sb.from('ingest_lotes').insert({
  cerebro_id: cer.id,
  tipo: 'pacote_zip',
  status: 'recebido',
  nome_arquivo: entrada.split(/[\\/]/).pop(),
  disparado_por: process.env.USER || process.env.USERNAME || 'cli',
  disparado_via: 'cli',
}).select('id').single();

await processarZip({
  caminho: entrada,
  cerebroId: cer.id,
  loteId: lote.id,
  filtro,
  origem,
});

// Busca log final
const { data: final } = await sb.from('ingest_lotes').select('log_md, duracao_ms, fontes_criadas, chunks_criados, custo_usd').eq('id', lote.id).single();

console.log('\n' + chalk.bold('━'.repeat(60)));
console.log(final?.log_md || '(sem relatório)');
console.log(chalk.bold('━'.repeat(60)));
console.log(chalk.green(`\n✓ lote ${lote.id}\n`));
