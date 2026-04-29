import { supabase } from '../lib/supabase.mjs';
const sb = supabase();

// Pega todos os clones com cerebro_id, fontes count, chunks count
const { data: produtos, error } = await sb.from('produtos')
  .select('id, slug, nome, subcategoria')
  .eq('categoria', 'clone')
  .order('subcategoria');
if (error) throw error;

console.log(`Total clones: ${produtos.length}\n`);

const stats = {};
let semFonte = 0, semChunks = 0, soulCurto = 0, semIcone = 0;

for (const p of produtos) {
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', p.id).single();
  if (!cer) { console.log(`SEM CEREBRO: ${p.slug}`); continue; }

  const { data: fontes } = await sb.from('cerebro_fontes')
    .select('id, conteudo_md, ingest_status')
    .eq('cerebro_id', cer.id);
  const total = (fontes || []).length;
  const totalOk = (fontes || []).filter(f => f.ingest_status === 'ok').length;
  if (total === 0) semFonte++;

  let chunkCount = 0;
  if (fontes && fontes.length) {
    const { count } = await sb.from('cerebro_fontes_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('cerebro_id', cer.id);
    chunkCount = count || 0;
  }
  if (chunkCount === 0) semChunks++;

  // Tamanho do SOUL
  const soulFonte = (fontes || []).find(f => /soul/i.test(''));
  const soul = (fontes || []).find(f => f.conteudo_md && f.conteudo_md.length > 0);
  const soulLen = soul ? soul.conteudo_md.length : 0;
  if (soulLen < 800) soulCurto++;

  const { data: prodFull } = await sb.from('produtos').select('emoji,icone_url').eq('id', p.id).single();
  if (!prodFull?.emoji && !prodFull?.icone_url) semIcone++;

  const sub = p.subcategoria || '(null)';
  if (!stats[sub]) stats[sub] = { total: 0, comFonte: 0, comChunks: 0, soulMedio: 0, soulMin: 999999, soulMax: 0 };
  stats[sub].total++;
  if (total > 0) stats[sub].comFonte++;
  if (chunkCount > 0) stats[sub].comChunks++;
  stats[sub].soulMedio += soulLen;
  if (soulLen > 0 && soulLen < stats[sub].soulMin) stats[sub].soulMin = soulLen;
  if (soulLen > stats[sub].soulMax) stats[sub].soulMax = soulLen;
}

console.log('Por squad:\n');
console.log('SQUAD'.padEnd(22), 'TOTAL', 'C/FONTE', 'C/CHUNK', 'SOUL_MIN', 'SOUL_MED', 'SOUL_MAX');
console.log('-'.repeat(85));
Object.entries(stats).sort().forEach(([sq, s]) => {
  const med = Math.round(s.soulMedio / s.total);
  console.log(
    sq.padEnd(22),
    String(s.total).padEnd(5),
    String(s.comFonte).padEnd(7),
    String(s.comChunks).padEnd(7),
    String(s.soulMin === 999999 ? 0 : s.soulMin).padEnd(8),
    String(med).padEnd(8),
    String(s.soulMax)
  );
});

console.log('\nResumo:');
console.log(`  Clones sem fonte alguma: ${semFonte}`);
console.log(`  Clones sem chunks vetorizados: ${semChunks}`);
console.log(`  Clones com SOUL muito curto (<800 chars): ${soulCurto}`);
console.log(`  Clones sem icone (emoji/icone_url): ${semIcone}`);
