import { supabase } from '../lib/supabase.mjs';
const sb = supabase();
const { data, error } = await sb.from('produtos').select('subcategoria,nome').eq('categoria','clone').order('subcategoria');
if (error) throw error;
const counts = {};
data.forEach(r => counts[r.subcategoria] = (counts[r.subcategoria]||0)+1);
console.log('Clones por subcategoria:');
Object.entries(counts).sort().forEach(([k,v]) => console.log('  '+(k||'(null)').padEnd(22)+' '+v));
console.log('TOTAL:', data.length);
