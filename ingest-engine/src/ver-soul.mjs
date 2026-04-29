import { supabase } from '../lib/supabase.mjs';
const sb = supabase();
const slug = process.argv[2];
if (!slug) { console.log('Uso: node src/ver-soul.mjs <slug>'); process.exit(1); }
const { data: p } = await sb.from('produtos').select('id').eq('slug', slug).single();
const { data: c } = await sb.from('cerebros').select('id').eq('produto_id', p.id).single();
const { data: f } = await sb.from('cerebro_fontes').select('conteudo_md').eq('cerebro_id', c.id).limit(1).single();
console.log(f.conteudo_md);
