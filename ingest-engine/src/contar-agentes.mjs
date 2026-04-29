import { supabase } from '../lib/supabase.mjs';
const sb = supabase();
const { data, count, error } = await sb.from('agentes')
  .select('id, slug, nome, status', { count: 'exact' });
if (error) throw error;
console.log('Total agentes no banco:', count);
data.forEach(a => console.log(`  ${a.slug.padEnd(28)} ${a.nome.padEnd(24)} [${a.status}]`));
