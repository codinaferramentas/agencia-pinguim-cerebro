const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const { createClient } = require('c:/Squad/ingest-engine/node_modules/@supabase/supabase-js');
const sb = createClient('https://wmelierxzpjamiofeemh.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });

(async () => {
  // Acha cérebro do Elo
  const { data: produtoElo } = await sb.from('produtos').select('id').eq('slug', 'elo').single();
  const { data: cerebroElo } = await sb.from('cerebros').select('id').eq('produto_id', produtoElo.id).single();
  console.log('Cerebro Elo:', cerebroElo.id);

  // Pega persona mais recente
  const { data: persona } = await sb.from('personas')
    .select('*')
    .eq('cerebro_id', cerebroElo.id)
    .order('gerado_em', { ascending: false })
    .limit(1)
    .single();

  console.log('\n=== PERSONA ELO COMPLETA ===\n');
  console.log(JSON.stringify(persona, null, 2));

  // Salva pra usar no script de update
  fs.writeFileSync('c:/Squad/.tmp-sql/persona-elo.json', JSON.stringify(persona, null, 2));
  console.log('\nSalvo em persona-elo.json');
})();
