#!/usr/bin/env node
/**
 * Diagnóstico read-only do Supabase.
 * NÃO CRIA, NÃO ALTERA NADA. Só lê e relata.
 */
import chalk from 'chalk';
import { env } from '../lib/env.mjs';
import { supabase } from '../lib/supabase.mjs';

const cfg = env();
const sb = supabase();

console.log(chalk.bold('\n🔍 Diagnóstico Supabase (read-only)\n'));
console.log(chalk.dim(`  URL: ${cfg.SUPABASE_URL}\n`));

async function rpc(sql) {
  // Supabase não expõe execução de SQL arbitrária pela lib client por segurança.
  // Vamos tentar via fetch direto no endpoint pg.
  const r = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${sql}`, {
    method: 'POST',
    headers: {
      apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!r.ok) return null;
  return await r.json();
}

// =======================================================
// 1. Testar conexão mínima via REST (tenta listar qq tabela)
// =======================================================
console.log(chalk.bold('— 1. Conexão básica'));
try {
  const r = await fetch(`${cfg.SUPABASE_URL}/rest/v1/?apikey=${cfg.SUPABASE_SERVICE_ROLE_KEY}`, {
    headers: { Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  console.log(chalk.green(`  ✓ HTTP ${r.status} ${r.statusText}`));
} catch (e) {
  console.log(chalk.red(`  ✗ erro: ${e.message}`));
  process.exit(1);
}

// =======================================================
// 2. Listar tabelas via introspecção PostgREST
// =======================================================
console.log(chalk.bold('\n— 2. Tabelas no schema public (via PostgREST OpenAPI)'));
try {
  const r = await fetch(`${cfg.SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  });
  const spec = await r.json();
  const tabelas = Object.keys(spec.definitions || spec.paths || {})
    .filter(k => !k.startsWith('/rpc/') && !k.startsWith('rpc_'))
    .map(k => k.replace(/^\//, ''))
    .filter(k => k && k !== '');

  if (tabelas.length === 0) {
    console.log(chalk.yellow('  ⚠ nenhuma tabela detectada no schema public'));
  } else {
    console.log(chalk.green(`  ✓ ${tabelas.length} tabela(s) no schema public:`));
    tabelas.forEach(t => console.log(chalk.dim(`    • ${t}`)));
  }
} catch (e) {
  console.log(chalk.red(`  ✗ erro introspeção: ${e.message}`));
}

// =======================================================
// 3. RPCs expostas
// =======================================================
console.log(chalk.bold('\n— 3. RPCs expostas'));
try {
  const r = await fetch(`${cfg.SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  });
  const spec = await r.json();
  const rpcs = Object.keys(spec.paths || {})
    .filter(p => p.startsWith('/rpc/'))
    .map(p => p.replace('/rpc/', ''));
  if (rpcs.length === 0) {
    console.log(chalk.dim('  (nenhuma RPC)'));
  } else {
    console.log(chalk.green(`  ✓ ${rpcs.length} RPC(s):`));
    rpcs.forEach(r => console.log(chalk.dim(`    • ${r}`)));
  }
} catch (e) {
  console.log(chalk.red(`  ✗ ${e.message}`));
}

// =======================================================
// 4. Contagem de linhas e tamanho por tabela pública
// =======================================================
console.log(chalk.bold('\n— 4. Volumetria por tabela public'));
try {
  const r = await fetch(`${cfg.SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  });
  const spec = await r.json();
  const tabelas = Object.keys(spec.definitions || {});
  for (const t of tabelas) {
    try {
      const cnt = await fetch(`${cfg.SUPABASE_URL}/rest/v1/${t}?select=*&limit=0`, {
        headers: {
          apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
      });
      const range = cnt.headers.get('content-range') || '';
      const total = range.split('/').pop();
      console.log(chalk.dim(`    • ${t.padEnd(30)} ${String(total).padStart(8)} linhas`));
    } catch (e) {
      console.log(chalk.dim(`    • ${t.padEnd(30)} ? (erro count)`));
    }
  }
} catch (e) {
  console.log(chalk.red(`  ✗ ${e.message}`));
}

console.log(chalk.bold('\n— 5. auth.users (sistema nativo de login do Supabase)'));
try {
  // usa a Admin API
  const r = await fetch(`${cfg.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: {
      apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const j = await r.json();
  const total = j.total || j.users?.length || 0;
  console.log(chalk.green(`  ✓ auth.users disponível — ${total} usuário(s) cadastrado(s)`));
} catch (e) {
  console.log(chalk.dim(`  ${e.message}`));
}

// =======================================================
// Conclusão
// =======================================================
console.log(chalk.bold('\n━'.repeat(60)));
console.log(chalk.bold('\nFim do diagnóstico.\n'));
console.log(chalk.yellow('Próximo passo:'));
console.log(chalk.dim('  Se você confirmar, vou criar schema `pinguim` e aplicar os schemas adaptados.'));
console.log(chalk.dim('  NENHUMA tabela do schema `public` será tocada.\n'));
