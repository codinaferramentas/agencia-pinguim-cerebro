#!/usr/bin/env node
/**
 * Aplica o schema-pinguim.sql no banco via endpoint SQL do Supabase.
 *
 * O PostgREST da lib supabase-js não permite DDL. Usamos o Management API
 * (Supabase dashboard) OU executamos statement-by-statement via psql-like
 * endpoint que requer ser admin.
 *
 * Alternativa oficial: rodar manualmente no SQL Editor do dashboard.
 * Este script tenta via pg REST genérico (fallback).
 */
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { env } from '../lib/env.mjs';

const cfg = env();

const schemaPath = path.resolve('../mission-control/supabase/schema-pinguim.sql');
if (!fs.existsSync(schemaPath)) {
  console.error(chalk.red(`Schema não encontrado: ${schemaPath}`));
  process.exit(1);
}

const sql = fs.readFileSync(schemaPath, 'utf8');
console.log(chalk.bold(`\n📄 Schema carregado: ${sql.length} caracteres\n`));

// O Supabase não expõe execução de SQL arbitrária via REST pública.
// Mas expõe via função customizada `exec_sql` se criada, OU via conexão
// pg direta na string postgres:// (que requer psql/pg).
//
// Abordagem aqui: imprimir instruções pro usuário colar no SQL Editor.

console.log(chalk.yellow(`
⚠  O Supabase NÃO expõe execução de DDL arbitrária via REST API.

Pra aplicar o schema, cole o conteúdo de:
  ${chalk.cyan(schemaPath)}

No SQL Editor do dashboard:
  ${chalk.cyan(cfg.SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/').replace('.supabase.co', '') + '/sql/new')}

Ou, se preferir, posso gerar um arquivo único pronto pra copy-paste.

Depois de aplicar, rode:
  ${chalk.cyan('npm run test-env')}
`));
