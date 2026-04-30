import { supabase } from '../lib/supabase.mjs';
const sb = supabase();

console.log('=== listar_tabelas_rls ===');
const r1 = await sb.rpc('listar_tabelas_rls');
if (r1.error) { console.log('ERR', r1.error); }
else {
  const sem = r1.data.filter(t => !t.rls_ativo);
  console.log(`Total: ${r1.data.length} | Sem RLS: ${sem.length}`);
  if (sem.length) sem.forEach(t => console.log('  X', t.tabela));
}

console.log('\n=== listar_tabelas_policies ===');
const r2 = await sb.rpc('listar_tabelas_policies');
if (r2.error) { console.log('ERR', r2.error); }
else {
  const sem = r2.data.filter(t => t.rls_ativo && t.total_policies === 0);
  console.log(`Total: ${r2.data.length} | RLS+sem policy: ${sem.length}`);
  if (sem.length) sem.forEach(t => console.log('  X', t.tabela));
}

console.log('\n=== listar_funcoes_security_definer ===');
const r3 = await sb.rpc('listar_funcoes_security_definer');
if (r3.error) { console.log('ERR', r3.error); }
else {
  const sd = r3.data.filter(f => f.security_definer);
  const inseguras = sd.filter(f => !f.search_path_seguro);
  console.log(`Total funcoes: ${r3.data.length} | SECURITY DEFINER: ${sd.length} | sem search_path seguro: ${inseguras.length}`);
  if (inseguras.length) inseguras.forEach(f => console.log('  X', f.nome));
}

console.log('\n=== raio_x_banco (top 10) ===');
const r4 = await sb.rpc('raio_x_banco');
if (r4.error) { console.log('ERR', r4.error); }
else {
  const top = r4.data.slice(0, 10);
  console.log('TABELA'.padEnd(35), 'LINHAS', 'TAMANHO_KB');
  top.forEach(t => console.log(t.tabela.padEnd(35), String(t.total_linhas).padEnd(7), Math.round(t.tamanho_total_bytes/1024)));
}

console.log('\n=== contar_tabela(\'produtos\') ===');
const r5 = await sb.rpc('contar_tabela', { nome_tabela: 'produtos' });
if (r5.error) console.log('ERR', r5.error); else console.log('produtos:', r5.data);
