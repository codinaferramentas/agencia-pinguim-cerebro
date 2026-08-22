// Driver de teste da Bia: manda uma mensagem (ou evento) e imprime a resposta.
// Uso: node _bia-conversa.cjs <telefone> <evento|-> "mensagem" ["nome"]
const fs = require('fs');
const env = fs.readFileSync('c:/Squad/.env.local', 'utf8');
env.split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const [telefone, evento, mensagem, nome, midiaUrl] = process.argv.slice(2);

(async () => {
  const body = {
    telefone,
    teste: true,
    ...(evento && evento !== '-' ? { evento } : {}),
    ...(mensagem && mensagem !== '-' ? { mensagem } : {}),
    ...(nome && nome !== '-' ? { nome } : {}),
    ...(midiaUrl ? { midia_url: midiaUrl } : {}),
  };
  const t0 = Date.now();
  const r = await fetch(process.env.SUPABASE_URL + '/functions/v1/bia-vendas-proalt', {
    method: 'POST',
    headers: {
      'x-internal-token': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) { console.error('ERRO', r.status, JSON.stringify(d).slice(0, 500)); process.exit(1); }
  (d.mensagens || []).forEach(m => console.log('🐧 BIA:', m, '\n'));
  console.log(`-- etapa=${d.etapa} estado=${d.lead_estado} tools=[${(d.tools || []).join(',')}] anexos=${(d.anexos || []).length} custo=$${d.custo_usd} ${Date.now() - t0}ms`);
})();
