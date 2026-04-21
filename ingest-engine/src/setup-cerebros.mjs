#!/usr/bin/env node
/**
 * Garante que os produtos + cérebros base existam no Supabase.
 * Idempotente — pode rodar várias vezes.
 */
import chalk from 'chalk';
import { supabase } from '../lib/supabase.mjs';

const sb = supabase();

const PRODUTOS = [
  { slug: 'pinguim',  nome: 'Pinguim (Empresa)', emoji: '🐧', descricao: 'Cérebro da agência (institucional).' },
  { slug: 'elo',      nome: 'Elo',              emoji: '🔗', descricao: 'Programa Elo — desafio / aceleração.' },
  { slug: 'proalt',   nome: 'ProAlt',           emoji: '⚡', descricao: 'Programa ProAlt — produto high ticket.' },
  { slug: 'taurus',   nome: 'Taurus',           emoji: '🐂', descricao: 'Programa Taurus — mentoria premium.' },
  { slug: 'lira',     nome: 'Lira',             emoji: '🎵', descricao: 'Programa Lira.' },
  { slug: 'orion',    nome: 'Orion',            emoji: '✨', descricao: 'Programa Orion.' },
];

console.log(chalk.bold('\n🧠 Configurando produtos + cérebros base\n'));

for (const p of PRODUTOS) {
  const { data: existing } = await sb.from('produtos').select('id, nome').eq('slug', p.slug).maybeSingle();

  let produtoId;
  if (existing) {
    produtoId = existing.id;
    console.log(chalk.dim(`  • ${p.slug.padEnd(10)} produto já existe`));
  } else {
    const { data, error } = await sb.from('produtos').insert({
      slug: p.slug,
      nome: p.nome,
      emoji: p.emoji,
      descricao: p.descricao,
      status: 'em_construcao',
    }).select('id').single();
    if (error) {
      console.error(chalk.red(`  ✗ ${p.slug}: ${error.message}`));
      continue;
    }
    produtoId = data.id;
    console.log(chalk.green(`  ✓ ${p.slug.padEnd(10)} produto criado`));
  }

  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', produtoId).maybeSingle();
  if (!cer) {
    const { error } = await sb.from('cerebros').insert({ produto_id: produtoId });
    if (error) console.error(chalk.red(`    ✗ cérebro ${p.slug}: ${error.message}`));
    else console.log(chalk.green(`    ✓ cérebro criado`));
  } else {
    console.log(chalk.dim(`    • cérebro já existe`));
  }
}

console.log(chalk.bold('\n✓ Setup concluído.\n'));
