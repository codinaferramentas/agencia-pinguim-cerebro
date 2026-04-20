#!/usr/bin/env node
/**
 * Importa as 21 transcrições existentes do Elo pro Supabase como cerebro_pecas.
 *
 * Uso:
 *   cp .env.example .env   # preencher SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 *   node scripts/import-transcricoes-elo.mjs
 *
 * Requer: @supabase/supabase-js
 *   npm i @supabase/supabase-js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TRANSCRIPTS_DIR = path.join(ROOT, 'cerebro', 'agentes', 'estrategistas', 'elo', 'contexto', 'transcricoes');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (use .env).');
  console.error('   Dica: carregue com: node --env-file=.env scripts/import-transcricoes-elo.mjs');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function parseNome(filename) {
  // Exemplos:
  //   mod1_mod1---aula-1---agora-vai.md
  //   mod3_aula-live_2025-10-08h10_41.md
  const base = filename.replace(/\.md$/, '');
  const parts = base.split('_');
  const modulo = parts[0] || 'mod?';
  const resto = parts.slice(1).join(' — ').replace(/-/g, ' ');
  return {
    modulo,
    titulo: `${modulo.toUpperCase()} — ${resto}`,
    tags: [modulo, 'elo', 'transcricao', 'aula']
  };
}

async function run() {
  console.log('🔍 Procurando produto Elo...');
  const { data: produto, error: e1 } = await sb.from('produtos').select('id').eq('slug', 'elo').single();
  if (e1 || !produto) { console.error('❌ Produto Elo não existe. Rode o seed.sql primeiro.'); process.exit(1); }

  const { data: cerebro, error: e2 } = await sb.from('cerebros').select('id').eq('produto_id', produto.id).single();
  if (e2 || !cerebro) { console.error('❌ Cérebro do Elo não existe.'); process.exit(1); }

  console.log(`✅ Cérebro Elo id=${cerebro.id}`);
  console.log(`📂 Lendo pasta ${TRANSCRIPTS_DIR}`);

  const files = (await fs.readdir(TRANSCRIPTS_DIR)).filter(f => f.endsWith('.md'));
  console.log(`📄 ${files.length} arquivos encontrados.`);

  let inseridos = 0, duplicados = 0, erros = 0;

  for (const file of files) {
    const full = path.join(TRANSCRIPTS_DIR, file);
    const conteudo = await fs.readFile(full, 'utf-8');
    const { titulo, tags } = parseNome(file);

    // Evita duplicar (procura por título idêntico no mesmo cérebro)
    const { data: existente } = await sb
      .from('cerebro_pecas')
      .select('id')
      .eq('cerebro_id', cerebro.id)
      .eq('titulo', titulo)
      .maybeSingle();

    if (existente) { duplicados++; continue; }

    const { error } = await sb.from('cerebro_pecas').insert({
      cerebro_id: cerebro.id,
      tipo: 'aula',
      titulo,
      conteudo_md: conteudo,
      origem: 'upload',
      autor: 'André (import inicial)',
      status_curador: 'aprovado',
      peso: 7,
      tags,
      metadados: { arquivo_original: file }
    });

    if (error) { console.error(`❌ ${file}: ${error.message}`); erros++; continue; }
    inseridos++;
    process.stdout.write('.');
  }

  console.log(`\n✅ Concluído. Inseridos: ${inseridos} · Duplicados (pulados): ${duplicados} · Erros: ${erros}`);
}

run().catch(err => { console.error(err); process.exit(1); });
