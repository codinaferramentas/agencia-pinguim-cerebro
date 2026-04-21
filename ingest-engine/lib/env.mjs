import 'dotenv/config';
import chalk from 'chalk';

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
];

export function env() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(chalk.red(`\nErro: variáveis de ambiente faltando no .env:`));
    missing.forEach(k => console.error(chalk.red(`  - ${k}`)));
    console.error(chalk.dim(`\nCopie .env.example pra .env e preencha.\n`));
    process.exit(1);
  }

  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CLASSIFIER_MODEL: process.env.CLASSIFIER_MODEL || 'gpt-4o-mini',
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE || '500', 10),
    CHUNK_OVERLAP: parseInt(process.env.CHUNK_OVERLAP || '50', 10),
    CONFIANCA_MINIMA: parseFloat(process.env.CONFIANCA_MINIMA || '0.65'),
  };
}
