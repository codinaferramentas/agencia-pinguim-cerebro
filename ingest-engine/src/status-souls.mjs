import { supabase } from '../lib/supabase.mjs';
const sb = supabase();
const { data: produtos } = await sb.from('produtos')
  .select('id, slug, subcategoria, nome')
  .eq('categoria', 'clone').order('subcategoria, nome');

const stats = {};
for (const p of produtos) {
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', p.id).single();
  const { data: f } = await sb.from('cerebro_fontes').select('id, conteudo_md').eq('cerebro_id', cer.id).limit(1).single();
  if (!f || !f.conteudo_md) continue;
  const sub = p.subcategoria;
  if (!stats[sub]) stats[sub] = { total: 0, somaChars: 0, ricos: 0 };
  stats[sub].total++;
  stats[sub].somaChars += f.conteudo_md.length;
  if (f.conteudo_md.length >= 3000) stats[sub].ricos++;
}
console.log('SQUAD                  TOTAL  RICOS  AVG_CHARS');
console.log('-'.repeat(55));
Object.entries(stats).sort().forEach(([k,v]) => {
  console.log(k.padEnd(22), String(v.total).padEnd(6), String(v.ricos).padEnd(6), Math.round(v.somaChars/v.total));
});
