// Verifica quais produtos tem prova social cadastrada
const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const { createClient } = require('c:/Squad/ingest-engine/node_modules/@supabase/supabase-js');
const sb = createClient('https://wmelierxzpjamiofeemh.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });

(async () => {
  // Procura tabelas relacionadas a prova social
  // Padrões prováveis: provas_sociais, depoimentos, casos_sucesso, prova_social_*
  const tabelas = [
    'provas_sociais', 'prova_social', 'depoimentos', 'casos_sucesso',
    'provas_discord', 'prova_discord', 'prova_social_discord', 'depoimentos_discord',
  ];
  for (const t of tabelas) {
    const r = await fetch(`https://wmelierxzpjamiofeemh.supabase.co/rest/v1/${t}?select=*&limit=3`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Accept-Profile': 'pinguim',
      },
    });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d.length > 0) {
        console.log(`\n=== TABELA pinguim.${t} ===`);
        console.log(`Colunas: ${Object.keys(d[0]).join(', ')}`);
        console.log(`Total amostra: ${d.length}`);
        console.log(JSON.stringify(d[0], null, 2).slice(0, 800));
      } else if (Array.isArray(d) && d.length === 0) {
        console.log(`\npinguim.${t}: EXISTE mas vazia`);
      }
    }
  }

  // Se prova-social-elo existe, ver qual tool ela usa
  const { data: agElo } = await sb.from('agentes')
    .select('ferramentas, system_prompt')
    .eq('slug', 'prova-social-elo')
    .single();
  if (agElo) {
    console.log('\n=== Ferramentas do prova-social-elo ===');
    console.log(agElo.ferramentas);
    // Trecho do prompt que diz qual tool/tabela usa
    const prompt = agElo.system_prompt || '';
    const trecho = prompt.split('\n').filter(l =>
      l.includes('tabela') || l.includes('buscar_prova') || l.includes('discord') || l.includes('pinguim.')
    ).slice(0, 10).join('\n');
    console.log('\nTrechos relevantes do prompt:');
    console.log(trecho);
  }
})();
