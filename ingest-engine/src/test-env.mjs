#!/usr/bin/env node
/**
 * Testa conexões: Supabase + OpenAI + pgvector instalado.
 * Roda antes do primeiro ingest real pra garantir que tudo tá no lugar.
 */
import chalk from 'chalk';
import { env } from '../lib/env.mjs';
import { supabase } from '../lib/supabase.mjs';
import { embed } from '../lib/openai.mjs';

console.log(chalk.bold('\n🔌 Testando conexões\n'));

const cfg = env();
console.log(chalk.green('✓ .env carregado'));
console.log(chalk.dim(`  SUPABASE_URL: ${cfg.SUPABASE_URL}`));
console.log(chalk.dim(`  OPENAI key:   ${cfg.OPENAI_API_KEY.slice(0, 7)}…${cfg.OPENAI_API_KEY.slice(-4)}`));
console.log(chalk.dim(`  modelos:      ${cfg.CLASSIFIER_MODEL} + ${cfg.EMBEDDING_MODEL}\n`));

// --- Supabase
const sb = supabase();
const { data: produtos, error } = await sb.from('produtos').select('slug, nome').limit(5);
if (error) {
  console.error(chalk.red(`✗ Supabase: ${error.message}`));
  if (error.code === '42P01') {
    console.error(chalk.yellow('  tabela "produtos" não existe. Rode o schema.sql + schema-002-rag.sql antes.'));
  }
  process.exit(1);
}
console.log(chalk.green(`✓ Supabase conectado (${produtos.length} produto(s) encontrado(s))`));
produtos.forEach(p => console.log(chalk.dim(`  • ${p.slug} — ${p.nome}`)));

// --- pgvector
const { error: errVec } = await sb.from('cerebro_fontes_chunks').select('id').limit(1);
if (errVec) {
  console.error(chalk.red(`\n✗ Tabela cerebro_fontes_chunks: ${errVec.message}`));
  console.error(chalk.yellow('  rode schema-002-rag.sql no SQL editor do Supabase.'));
  process.exit(1);
}
console.log(chalk.green(`\n✓ Tabelas RAG disponíveis (cerebro_fontes + chunks)`));

// --- OpenAI embeddings
try {
  const v = await embed('teste de embedding');
  if (v[0]?.length === 1536) {
    console.log(chalk.green(`✓ OpenAI embeddings OK (vetor dim 1536)\n`));
  } else {
    console.error(chalk.red(`✗ embedding retornou dim inesperada: ${v[0]?.length}`));
    process.exit(1);
  }
} catch (e) {
  console.error(chalk.red(`✗ OpenAI: ${e.message}`));
  process.exit(1);
}

console.log(chalk.bold.green('Tudo pronto. Agora você pode rodar:\n'));
console.log(chalk.cyan('  npm run setup-elo        # cria produtos + cérebros no banco'));
console.log(chalk.cyan('  npm run ingest -- <zip> --cerebro=elo\n'));
