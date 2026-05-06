// Script de teste local — chama Atendente Pinguim direto via Edge Function
// e imprime resultado completo (mestres invocados, custo, conteúdo).
// Uso: node .tmp-sql/test-atendente.js "<mensagem>" [caso_id?]

const fs = require('fs');

const dotenv = fs.readFileSync('c:/Squad/.env.local', 'utf8');
const env = Object.fromEntries(
  dotenv.split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
  })
);
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

const TENANT = '00000000-0000-0000-0000-000000000001';
const CLIENTE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const mensagem = process.argv[2];
const casoId = process.argv[3] || null;

if (!mensagem) {
  console.error('Uso: node .tmp-sql/test-atendente.js "<mensagem>" [caso_id]');
  process.exit(1);
}

(async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('TESTE ATENDENTE PINGUIM');
  console.log('═══════════════════════════════════════════════════════');
  console.log('MENSAGEM:', mensagem);
  console.log('CASO_ID:', casoId || '(novo)');
  console.log('───────────────────────────────────────────────────────\n');

  const t0 = Date.now();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/atendente-pinguim`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: TENANT,
      cliente_id: CLIENTE,
      caso_id: casoId,
      mensagem,
    }),
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = await r.json();

  if (!r.ok) {
    console.error('✗ ERRO HTTP', r.status);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('CASO_ID gerado:', data.caso_id);
  console.log('Latência local:', elapsed + 's');
  console.log('');

  console.log('▸ USO:');
  if (data.uso) {
    console.log('  Modelo:', data.uso.modelo);
    console.log('  Tokens in/out/cached:', data.uso.tokens_in, '/', data.uso.tokens_out, '/', data.uso.tokens_cached);
    console.log('  Cache hit:', data.uso.cache_hit_pct + '%');
    console.log('  Custo USD:', data.uso.custo_usd);
    console.log('  Custo BRL:', (data.uso.custo_usd * 5.65).toFixed(4));
    console.log('  Tool rounds:', data.uso.tool_rounds);
    console.log('  Latência LLM:', (data.uso.latencia_llm_ms / 1000).toFixed(1) + 's');
  }
  console.log('');

  if (data.tools_executadas && data.tools_executadas.length) {
    console.log('▸ TOOLS EXECUTADAS:', data.tools_executadas.join(' → '));
    console.log('');
  }

  if (data.produtos_detectados && data.produtos_detectados.length) {
    console.log('▸ CÉREBROS CONSULTADOS:');
    data.produtos_detectados.forEach(p => {
      console.log(`  - ${p.cerebro_slug} (confiança ${(p.confianca * 100).toFixed(0)}%)`);
    });
    console.log('');
  }

  if (data.plano_card) {
    console.log('▸ PLANO DA MISSÃO:');
    console.log(JSON.stringify(data.plano_card, null, 2));
    console.log('');
  }

  console.log('▸ RESPOSTA:');
  console.log('───────────────────────────────────────────────────────');
  console.log(data.resposta);
  console.log('───────────────────────────────────────────────────────');
  console.log('');

  // Buscar últimas execuções do banco pra ver mestres invocados
  console.log('▸ ÚLTIMAS EXECUÇÕES NO BANCO (pra ver mestres invocados):');
  const REF = SUPABASE_URL.replace(/^https:\/\//, '').replace(/\..*$/, '');
  const TOKEN = env.SUPABASE_ACCESS_TOKEN;
  const sqlR = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `SELECT a.slug, a.nome, e.custo_usd, e.tokens_entrada, e.tokens_saida, e.executado_em
              FROM pinguim.agente_execucoes e
              JOIN pinguim.agentes a ON a.id = e.agente_id
              WHERE e.executado_em > now() - interval '2 minutes'
              ORDER BY e.executado_em ASC;`,
    }),
  });
  const execs = await sqlR.json();
  if (Array.isArray(execs) && execs.length) {
    let totalCusto = 0;
    execs.forEach(ex => {
      console.log(`  ${ex.slug.padEnd(20)} | ${String(ex.tokens_entrada).padStart(6)}in / ${String(ex.tokens_saida).padStart(5)}out | US$ ${Number(ex.custo_usd).toFixed(6)}`);
      totalCusto += Number(ex.custo_usd);
    });
    console.log(`  ${''.padEnd(20)}   ${''.padStart(6)}     ${''.padStart(5)}      ─────────────`);
    console.log(`  ${'TOTAL'.padEnd(20)} | ${''.padStart(6)}     ${''.padStart(5)}      US$ ${totalCusto.toFixed(6)} (R$ ${(totalCusto * 5.65).toFixed(4)})`);
  } else {
    console.log('  (nenhuma execução nos últimos 2min)');
  }
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
})();
