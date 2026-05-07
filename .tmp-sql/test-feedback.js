// Testa fluxo completo: pergunta → resposta → feedback (👎 com crítica) → resposta refeita.
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

const PEDIDO = process.argv[2] || 'me da uma copy curta pro Desafio Lo-fi';
const CRITICA = process.argv[3] || 'ficou genérico, quero mais matemática estilo Hormozi com número específico';

(async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('TESTE FLUXO COMPLETO: pergunta → 👎 com crítica → re-execução');
  console.log('═══════════════════════════════════════════════════════');
  console.log('PEDIDO:', PEDIDO);
  console.log('CRÍTICA simulada:', CRITICA);
  console.log('───────────────────────────────────────────────────────\n');

  // 1. Faz a pergunta inicial
  console.log('▶ Passo 1: enviando pedido pro Atendente Pinguim...');
  const t0 = Date.now();
  const r1 = await fetch(`${SUPABASE_URL}/functions/v1/atendente-pinguim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT, cliente_id: CLIENTE, mensagem: PEDIDO }),
  });
  const data1 = await r1.json();
  if (!r1.ok) {
    console.error('✗ ERRO:', data1);
    process.exit(1);
  }
  console.log(`  ✓ resposta em ${((Date.now() - t0) / 1000).toFixed(1)}s, custo US$ ${data1.uso?.custo_usd}`);
  console.log(`  caso_id: ${data1.caso_id}`);
  console.log(`\n  RESPOSTA 1 (truncada):`);
  console.log('  ' + data1.resposta.slice(0, 400).replace(/\n/g, '\n  ') + '...\n');

  // 2. Manda feedback 👎 com crítica
  console.log('▶ Passo 2: simulando humano clicando 👎 + crítica...');
  const t1 = Date.now();
  const r2 = await fetch(`${SUPABASE_URL}/functions/v1/feedback-pinguim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: TENANT,
      cliente_id: CLIENTE,
      caso_id: data1.caso_id,
      mensagem_humana: PEDIDO,
      mensagem_agente: data1.resposta,
      tipo: 'rejeitou',
      comentario: CRITICA,
    }),
  });
  const data2 = await r2.json();
  if (!r2.ok) {
    console.error('✗ ERRO:', data2);
    process.exit(1);
  }
  console.log(`  ✓ feedback registrado em perfil em ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`  mensagem composta: "${(data2.mensagem_pra_reenviar || '').slice(0, 100)}..."`);

  // 3. Simula frontend reenviando mensagem composta pro Atendente Pinguim
  console.log('\n▶ Passo 3: frontend reenvia pro Atendente Pinguim (com JWT do usuário)...');
  const t2 = Date.now();
  const r3 = await fetch(`${SUPABASE_URL}/functions/v1/atendente-pinguim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: TENANT, cliente_id: CLIENTE,
      caso_id: data1.caso_id,
      mensagem: data2.mensagem_pra_reenviar,
    }),
  });
  const data3 = await r3.json();
  if (!r3.ok) {
    console.error('✗ ERRO no reenvio:', data3);
    process.exit(1);
  }
  console.log(`  ✓ resposta refeita em ${((Date.now() - t2) / 1000).toFixed(1)}s, custo US$ ${data3.uso?.custo_usd}`);
  console.log(`\n  RESPOSTA 2 (refeita após crítica):`);
  console.log('  ' + (data3.resposta || '(vazio)').slice(0, 600).replace(/\n/g, '\n  ') + '...\n');

  data2.proxima_resposta = data3.resposta;
  data2.uso = data3.uso;

  // 3. Compara as duas
  console.log('───────────────────────────────────────────────────────');
  console.log('COMPARAÇÃO:');
  console.log(`  Resp 1 — ${data1.resposta.length} chars, custo US$ ${data1.uso?.custo_usd}`);
  console.log(`  Resp 2 — ${(data2.proxima_resposta || '').length} chars, custo US$ ${data2.uso?.custo_usd}`);
  console.log(`  Custo total fluxo (resp + feedback): US$ ${(Number(data1.uso?.custo_usd || 0) + Number(data2.uso?.custo_usd || 0)).toFixed(6)}`);
  console.log(`  Latência total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════════');
})();
