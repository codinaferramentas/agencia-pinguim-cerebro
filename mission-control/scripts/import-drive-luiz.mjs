#!/usr/bin/env node
/**
 * Importa material do drive do Luiz (Elo + ProAlt em TXT/PDF/MD) pro Supabase.
 *
 * Suporta: .md, .txt (PDF precisa de extração prévia — usar pdf-parse ou similar).
 *
 * Uso:
 *   # 1. Colocar os arquivos em mission-control/imports/<produto>/<arquivo>
 *   #    ex: mission-control/imports/elo/aula-5-mod-2.md
 *   # 2. Preencher .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 *   # 3. node --env-file=.env scripts/import-drive-luiz.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const IMPORTS_DIR = path.resolve(__dirname, '..', 'imports');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const EXTENSOES_SUPORTADAS = new Set(['.md', '.txt']);

function inferirTipo(nomeArquivo) {
  const n = nomeArquivo.toLowerCase();
  if (n.includes('aula') || n.includes('modulo') || n.includes('mod-')) return 'aula';
  if (n.includes('pagina') || n.includes('vendas')) return 'pagina_venda';
  if (n.includes('persona') || n.includes('avatar')) return 'persona';
  if (n.includes('objec')) return 'objecao';
  if (n.includes('depoi') || n.includes('prova') || n.includes('case')) return 'depoimento';
  if (n.includes('faq') || n.includes('duvida')) return 'faq';
  if (n.includes('pitch')) return 'pitch';
  return 'outro';
}

async function importarArquivo(produtoSlug, caminhoArquivo) {
  const ext = path.extname(caminhoArquivo).toLowerCase();
  if (!EXTENSOES_SUPORTADAS.has(ext)) {
    console.warn(`⚠️  Ignorando ${caminhoArquivo} (extensão ${ext} não suportada ainda).`);
    return 'skip';
  }

  // Resolve o cérebro
  const { data: produto } = await sb.from('produtos').select('id').eq('slug', produtoSlug).single();
  if (!produto) { console.error(`❌ Produto slug=${produtoSlug} não existe.`); return 'error'; }

  const { data: cerebro } = await sb.from('cerebros').select('id').eq('produto_id', produto.id).single();
  if (!cerebro) { console.error(`❌ Cérebro do ${produtoSlug} não existe.`); return 'error'; }

  const conteudo = await fs.readFile(caminhoArquivo, 'utf-8');
  const nomeArquivo = path.basename(caminhoArquivo);
  const tipo = inferirTipo(nomeArquivo);
  const titulo = nomeArquivo.replace(ext, '').replace(/[-_]/g, ' ');

  // Evita duplicado
  const { data: existente } = await sb
    .from('cerebro_pecas')
    .select('id')
    .eq('cerebro_id', cerebro.id)
    .eq('titulo', titulo)
    .maybeSingle();
  if (existente) return 'dup';

  const { error } = await sb.from('cerebro_pecas').insert({
    cerebro_id: cerebro.id,
    tipo,
    titulo,
    conteudo_md: conteudo,
    origem: 'lote',
    autor: 'Luiz (drive inicial)',
    status_curador: 'aprovado',
    peso: 7,
    tags: [produtoSlug, 'drive-luiz', tipo],
    metadados: { arquivo_original: nomeArquivo }
  });
  if (error) { console.error(`❌ ${nomeArquivo}: ${error.message}`); return 'error'; }
  return 'ok';
}

async function run() {
  console.log(`📂 Lendo ${IMPORTS_DIR}`);
  let existePasta;
  try { existePasta = (await fs.stat(IMPORTS_DIR)).isDirectory(); } catch { existePasta = false; }
  if (!existePasta) {
    console.log('ℹ️  Pasta imports/ ainda não existe. Crie e cole o material do drive do Luiz em:');
    console.log('   mission-control/imports/elo/*');
    console.log('   mission-control/imports/proalt/*');
    console.log('Depois roda esse script de novo.');
    return;
  }

  const produtos = (await fs.readdir(IMPORTS_DIR)).filter(d => !d.startsWith('.'));
  const contadores = { ok: 0, dup: 0, skip: 0, error: 0 };

  for (const produtoSlug of produtos) {
    const dir = path.join(IMPORTS_DIR, produtoSlug);
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) continue;

    console.log(`\n📦 Processando pasta: ${produtoSlug}/`);
    const arquivos = await fs.readdir(dir, { recursive: true });

    for (const arquivo of arquivos) {
      const full = path.join(dir, arquivo);
      const s = await fs.stat(full);
      if (!s.isFile()) continue;
      const resultado = await importarArquivo(produtoSlug, full);
      contadores[resultado]++;
      process.stdout.write(resultado === 'ok' ? '.' : resultado === 'dup' ? 'd' : resultado === 'skip' ? 's' : 'E');
    }
  }

  console.log(`\n\n✅ Resumo: ${contadores.ok} ok · ${contadores.dup} duplicados · ${contadores.skip} skip · ${contadores.error} erros`);
}

run().catch(err => { console.error(err); process.exit(1); });
