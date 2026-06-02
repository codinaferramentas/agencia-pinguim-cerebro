const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const { createClient } = require('c:/Squad/ingest-engine/node_modules/@supabase/supabase-js');
const sb = createClient('https://wmelierxzpjamiofeemh.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });
(async () => {
  const { data: produtos } = await sb.from('produtos').select('id, slug');
  const map = new Map(produtos.map(p => [p.id, p.slug]));

  const { data: provas } = await sb.from('provas_sociais').select('produto_id');
  const cont = {};
  for (const p of provas) {
    const s = map.get(p.produto_id) || '(órfão)';
    cont[s] = (cont[s] || 0) + 1;
  }
  console.log('Provas sociais por produto:');
  Object.entries(cont).sort((a,b) => b[1]-a[1]).forEach(([s,c]) => console.log(`  ${s.padEnd(35)} ${c}`));
})();
