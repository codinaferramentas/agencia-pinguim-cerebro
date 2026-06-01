// Teste real: pede pro copy-pagina-venda-elo escrever copy e vê se usa vocabulário da Natália
const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  const r = await fetch('https://wmelierxzpjamiofeemh.supabase.co/functions/v1/agente-executar', {
    method: 'POST',
    headers: {
      'apikey': SERVICE,
      'Authorization': `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agente_slug: 'copy-pagina-venda-elo',
      briefing: 'Preciso de uma headline killer pra topo de página de vendas do Elo. Apenas a headline.',
      cliente_id: '0d2dee5e-2989-4d8c-95ee-6e1a32e2ec46',
      tenant_id: '00000000-0000-0000-0000-000000000001',
    }),
  });

  if (!r.ok) {
    console.log('HTTP', r.status);
    console.log((await r.text()).slice(0, 500));
    return;
  }

  const j = await r.json();
  console.log('=== Resposta do agente ===');
  console.log(j.conteudo_md || JSON.stringify(j).slice(0, 2000));

  if (j.uso) {
    console.log(`\nModelo: ${j.uso.modelo} | ${j.uso.latencia_ms}ms | $${(j.uso.custo_usd || 0).toFixed(4)}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
