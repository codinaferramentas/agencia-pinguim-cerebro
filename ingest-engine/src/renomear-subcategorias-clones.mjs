#!/usr/bin/env node
/**
 * Renomeia subcategorias dos Clones pros slugs canonicos das squads
 * (fonte: ecossistema-squads-completo.html + ecossistema-mapeamento.json).
 *
 * One-shot. Pode ser re-executado, e idempotente.
 */
import chalk from 'chalk';
import { supabase } from '../lib/supabase.mjs';

const sb = supabase();

const RENAME = {
  'externo_copy': 'copy',
  'externo_storytelling': 'storytelling',
  'externo_advisor': 'advisory-board',
  'externo_traffic': 'traffic-masters',
  'externo_design': 'design',
  'externo_data': 'data',
  'externo_finops': 'finops',
  'externo_research': 'deep-research',
  'externo_translate': 'translate',
  'externo_creator': 'squad-creator-pro',
  // socio_pinguim mantem
};

console.log(chalk.bold('\nRenomear subcategorias de Clones (canonico do HTML)\n'));
let total = 0;
for (const [from, to] of Object.entries(RENAME)) {
  const { data, error } = await sb.from('produtos')
    .update({ subcategoria: to })
    .eq('subcategoria', from)
    .select('id');
  if (error) {
    console.error(chalk.red(`  ERRO ${from}: ${error.message}`));
    continue;
  }
  const n = (data || []).length;
  total += n;
  console.log(`  ${from.padEnd(22)} -> ${to.padEnd(22)} (${n} produtos)`);
}
console.log(chalk.bold(`\nTotal renomeados: ${total}\n`));
