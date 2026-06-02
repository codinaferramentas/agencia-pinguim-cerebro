const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const { createClient } = require('c:/Squad/ingest-engine/node_modules/@supabase/supabase-js');
const sb = createClient('https://wmelierxzpjamiofeemh.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });

(async () => {
  // Pra cada produto exibido no painel, lista agentes liberados
  const produtos = ['elo', 'proalt', 'tuarus', 'lyra', 'mentoria-express', 'desafio-de-conte-do-lo-fi'];
  for (const p of produtos) {
    const { data: ags } = await sb.from('agentes')
      .select('slug, nome, status_publicacao, pronto_pra_uso')
      .eq('produto_inferido', p)
      .eq('status_publicacao', 'liberado');
    console.log(`\n=== ${p} (${ags?.length || 0} liberados) ===`);
    for (const a of ags || []) {
      console.log(`  ${a.slug.padEnd(40)} | pronto=${a.pronto_pra_uso}`);
    }
  }
})();
