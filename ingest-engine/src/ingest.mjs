#!/usr/bin/env node
/**
 * Motor principal de ingestão em massa.
 *
 * Uso:
 *   node src/ingest.mjs <caminho-do-zip> --cerebro=<slug>
 *   node src/ingest.mjs <caminho-da-pasta> --cerebro=<slug>
 *
 * Ex:
 *   node src/ingest.mjs "C:\Users\André\Downloads\elo-tudo.zip" --cerebro=elo
 *
 * Fluxo:
 *   1. Lê o zip/pasta → lista de arquivos
 *   2. Extrai texto de cada arquivo
 *   3. Classifica tipo via LLM barato (com amostra curta)
 *   4. Casos especiais (WhatsApp, CSV) viram N fontes em vez de 1
 *   5. Chunka + embeda
 *   6. INSERT no Supabase
 *   7. Relatório final + log do lote
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

import { env } from '../lib/env.mjs';
import { supabase } from '../lib/supabase.mjs';
import { embed, classificarFonte, custoClassificacao, custoEmbedding, transcribe } from '../lib/openai.mjs';
import { chunkText, countTokens } from '../lib/chunk.mjs';
import { extrairTexto, tipoArquivo, amostra } from '../lib/extract.mjs';
import { parseWhatsApp } from '../lib/whatsapp.mjs';

const args = process.argv.slice(2);
const entrada = args[0];
const cerebroFlag = args.find(a => a.startsWith('--cerebro='));
const cerebroSlug = cerebroFlag ? cerebroFlag.split('=')[1] : null;
const origemFlag = args.find(a => a.startsWith('--origem='));
const origem = origemFlag ? origemFlag.split('=')[1] : 'lote';

if (!entrada || !cerebroSlug) {
  console.error(chalk.red('Uso: node src/ingest.mjs <zip-ou-pasta> --cerebro=<slug>'));
  process.exit(1);
}

if (!fs.existsSync(entrada)) {
  console.error(chalk.red(`Caminho não existe: ${entrada}`));
  process.exit(1);
}

const cfg = env();
const sb = supabase();

console.log(chalk.bold(`\n📦 Motor de Ingestão — Pinguim\n`));
console.log(`  Entrada:  ${chalk.cyan(entrada)}`);
console.log(`  Cérebro:  ${chalk.cyan(cerebroSlug)}`);
console.log(`  Origem:   ${chalk.cyan(origem)}\n`);

const inicio = Date.now();
const stats = {
  arquivos_totais: 0,
  arquivos_ok: 0,
  arquivos_skip: 0,
  arquivos_erro: 0,
  fontes_criadas: 0,
  chunks_criados: 0,
  em_quarentena: 0,
  custo_classificacao_usd: 0,
  custo_embedding_usd: 0,
  custo_whisper_usd: 0,
};

// =========================================================================
// 1) Localizar cérebro no banco
// =========================================================================
const { data: cerebroRow, error: errCerebro } = await sb
  .from('cerebros')
  .select('id, produto:produtos(slug, nome)')
  .filter('produtos.slug', 'eq', cerebroSlug)
  .single();

// Fallback: busca via join manual (produtos -> cerebros)
let cerebroId;
if (errCerebro || !cerebroRow) {
  const { data: prod, error: ePro } = await sb
    .from('produtos').select('id, nome').eq('slug', cerebroSlug).single();
  if (ePro || !prod) {
    console.error(chalk.red(`❌ Produto com slug "${cerebroSlug}" não existe. Rode primeiro: npm run setup-elo`));
    process.exit(1);
  }
  const { data: cer, error: eCer } = await sb
    .from('cerebros').select('id').eq('produto_id', prod.id).single();
  if (eCer || !cer) {
    console.error(chalk.red(`❌ Cérebro pro produto "${cerebroSlug}" não existe.`));
    process.exit(1);
  }
  cerebroId = cer.id;
  console.log(chalk.green(`✓ Cérebro ${prod.nome} encontrado.\n`));
} else {
  cerebroId = cerebroRow.id;
  console.log(chalk.green(`✓ Cérebro ${cerebroRow.produto.nome} encontrado.\n`));
}

// =========================================================================
// 2) Criar lote de ingestão
// =========================================================================
const { data: loteRow, error: errLote } = await sb
  .from('ingest_lotes')
  .insert({
    cerebro_id: cerebroId,
    tipo: 'pacote_zip',
    status: 'extraindo',
    nome_arquivo: path.basename(entrada),
    disparado_por: process.env.USER || 'andre',
    disparado_via: 'cli',
  })
  .select('id')
  .single();

if (errLote) {
  console.error(chalk.red(`❌ Falha ao criar lote: ${errLote.message}`));
  process.exit(1);
}
const loteId = loteRow.id;
console.log(chalk.dim(`  lote_id: ${loteId}\n`));

// =========================================================================
// 3) Extrair arquivos (de zip ou pasta)
// =========================================================================
async function listarArquivos() {
  const arquivos = [];
  const stat = fs.statSync(entrada);

  if (stat.isFile() && entrada.toLowerCase().endsWith('.zip')) {
    const zip = new AdmZip(entrada);
    zip.getEntries().forEach(e => {
      if (!e.isDirectory) {
        arquivos.push({
          nome: path.basename(e.entryName),
          caminho: e.entryName,
          buffer: e.getData(),
        });
      }
    });
  } else if (stat.isDirectory()) {
    // percorre recursivamente
    function walk(dir, prefix = '') {
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const s = fs.statSync(full);
        if (s.isDirectory()) walk(full, prefix + item + '/');
        else {
          arquivos.push({
            nome: item,
            caminho: prefix + item,
            buffer: fs.readFileSync(full),
            caminhoDisco: full,
          });
        }
      }
    }
    walk(entrada);
  } else {
    console.error(chalk.red(`Entrada deve ser .zip ou pasta.`));
    process.exit(1);
  }

  // filtrar system files
  return arquivos.filter(a => {
    if (a.nome.startsWith('.')) return false;
    if (a.nome === 'Thumbs.db' || a.nome === '.DS_Store') return false;
    if (a.caminho.includes('__MACOSX')) return false;
    return true;
  });
}

const arquivos = await listarArquivos();
stats.arquivos_totais = arquivos.length;
console.log(chalk.bold(`📂 ${arquivos.length} arquivos encontrados.\n`));

if (arquivos.length === 0) {
  await sb.from('ingest_lotes').update({ status: 'concluido', log_md: 'Nenhum arquivo encontrado', finalizado_em: new Date().toISOString() }).eq('id', loteId);
  process.exit(0);
}

// =========================================================================
// 4) Processar cada arquivo
// =========================================================================
await sb.from('ingest_lotes').update({ status: 'classificando', arquivos_totais: arquivos.length }).eq('id', loteId);

const bar = new cliProgress.SingleBar({
  format: '  [{bar}] {percentage}% · {value}/{total} · {filename}',
  barCompleteChar: '█',
  barIncompleteChar: '░',
  hideCursor: true,
}, cliProgress.Presets.shades_classic);

bar.start(arquivos.length, 0, { filename: '' });

const fontesPraVetorizar = []; // {fonte, arquivoId, chunks: []}

for (const arq of arquivos) {
  bar.update({ filename: arq.nome.slice(0, 50) });

  const sha = crypto.createHash('sha256').update(arq.buffer).digest('hex');

  // dedup: se sha já existe, pula
  const { data: dup } = await sb
    .from('ingest_arquivos')
    .select('id, fonte_id')
    .eq('sha256', sha)
    .maybeSingle();

  if (dup) {
    bar.increment();
    stats.arquivos_skip++;
    continue;
  }

  const { data: arqRow } = await sb
    .from('ingest_arquivos')
    .insert({
      lote_id: loteId,
      cerebro_id: cerebroId,
      nome_original: arq.nome,
      caminho: arq.caminho,
      tamanho_bytes: arq.buffer.length,
      sha256: sha,
      status: 'processando',
    })
    .select('id')
    .single();

  const arquivoId = arqRow.id;

  try {
    const extraido = await extrairTexto({ nome: arq.nome, buffer: arq.buffer, caminho: arq.caminhoDisco });

    // === ÁUDIO === transcreve via Whisper
    let textoFinal = extraido.text;
    let metaExtra = extraido.meta || {};
    if (extraido.audio) {
      if (!arq.caminhoDisco) {
        // áudio dentro de zip — precisa escrever num tmp primeiro
        const tmpPath = path.join('tmp', sha + path.extname(arq.nome));
        fs.mkdirSync('tmp', { recursive: true });
        fs.writeFileSync(tmpPath, arq.buffer);
        textoFinal = await transcribe(tmpPath);
        fs.unlinkSync(tmpPath);
      } else {
        textoFinal = await transcribe(arq.caminhoDisco);
      }
      // custo Whisper estimado (duração aproximada: 1KB ≈ 1s audio mp3 128kbps)
      const duracaoMin = (arq.buffer.length / 1024 / 16) / 60;
      stats.custo_whisper_usd += duracaoMin * 0.006;
      metaExtra.fonte_formato = 'audio_transcrito';
    }

    if (!textoFinal || !textoFinal.trim()) {
      await sb.from('ingest_arquivos').update({
        status: 'quarentena',
        motivo_erro: extraido.erro || extraido.meta?.reason || 'sem texto extraído',
        processado_em: new Date().toISOString(),
      }).eq('id', arquivoId);
      stats.em_quarentena++;
      bar.increment();
      continue;
    }

    // === CASOS ESPECIAIS ===

    // WhatsApp export: 1 arquivo → N conversas = N fontes
    const pareceWhatsApp = arq.nome.toLowerCase().includes('whats') ||
                          arq.nome.toLowerCase().includes('_chat') ||
                          /^\[\d{1,2}\/\d{1,2}\/\d{2,4}/.test(textoFinal);
    if (pareceWhatsApp) {
      const parsed = parseWhatsApp(textoFinal);
      if (parsed.conversas.length > 0) {
        for (const conv of parsed.conversas) {
          await criarFonte({
            arquivoId,
            tipo: 'chat_export',
            confianca: 1.0,
            justificativa: 'detectado como export WhatsApp via heurística',
            titulo: conv.titulo,
            conteudo: conv.markdown,
            origem: origem,
            autor: conv.autores[0] || null,
            arquivo_nome: arq.nome,
            mime: 'text/whatsapp',
            metadata: {
              ...metaExtra,
              whatsapp: {
                inicio: conv.inicio, fim: conv.fim, autores: conv.autores,
                total_mensagens: conv.total_mensagens,
                lote_stats: {
                  total_mensagens: parsed.total_mensagens,
                  ruido_descartado: parsed.ruido_descartado,
                  conversas_relevantes: parsed.conversas_relevantes,
                }
              }
            }
          });
        }
        await sb.from('ingest_arquivos').update({
          status: 'ok',
          tipo_sugerido: 'chat_export',
          tipo_confianca: 1.0,
          tipo_justificativa: `${parsed.conversas.length} conversas extraídas do export WhatsApp`,
          classificado_por: 'heuristica',
          processado_em: new Date().toISOString(),
        }).eq('id', arquivoId);
        stats.arquivos_ok++;
        bar.increment();
        continue;
      }
    }

    // === CASO PADRÃO: classifica via LLM ===
    const amostraCurta = amostra(textoFinal, 200);
    const cls = await classificarFonte({ nome: arq.nome, amostra: amostraCurta });
    stats.custo_classificacao_usd += custoClassificacao({
      tokens_input: cls.tokens_input,
      tokens_output: cls.tokens_output,
    });

    const emQuarentena = cls.confianca < cfg.CONFIANCA_MINIMA;

    await criarFonte({
      arquivoId,
      tipo: cls.tipo,
      confianca: cls.confianca,
      justificativa: cls.justificativa,
      titulo: arq.nome.replace(/\.[^.]+$/, ''),
      conteudo: textoFinal,
      origem,
      autor: null,
      arquivo_nome: arq.nome,
      mime: metaExtra.fonte_formato ? 'extracted/' + metaExtra.fonte_formato : null,
      metadata: metaExtra,
      quarentena: emQuarentena,
    });

    await sb.from('ingest_arquivos').update({
      status: emQuarentena ? 'quarentena' : 'ok',
      tipo_sugerido: cls.tipo,
      tipo_confianca: cls.confianca,
      tipo_justificativa: cls.justificativa,
      classificado_por: cfg.CLASSIFIER_MODEL,
      processado_em: new Date().toISOString(),
    }).eq('id', arquivoId);

    if (emQuarentena) stats.em_quarentena++;
    else stats.arquivos_ok++;

  } catch (e) {
    stats.arquivos_erro++;
    await sb.from('ingest_arquivos').update({
      status: 'erro',
      motivo_erro: e.message,
      processado_em: new Date().toISOString(),
    }).eq('id', arquivoId);
    console.error(chalk.red(`\n  erro em "${arq.nome}": ${e.message}`));
  }

  bar.increment();
}
bar.stop();

/**
 * Cria uma fonte no banco e encola ela pra vetorização em batch.
 */
async function criarFonte({ arquivoId, tipo, confianca, justificativa, titulo, conteudo, origem, autor, arquivo_nome, mime, metadata, quarentena = false }) {
  const { data: fonte, error } = await sb
    .from('cerebro_fontes')
    .insert({
      cerebro_id: cerebroId,
      tipo,
      titulo,
      conteudo_md: conteudo,
      origem,
      autor,
      arquivo_nome,
      mime,
      tamanho_bytes: conteudo ? conteudo.length : null,
      ingest_lote_id: loteId,
      ingest_status: quarentena ? 'quarentena' : 'processando',
      metadata: {
        ...(metadata || {}),
        classificacao: {
          tipo, confianca, justificativa, modelo: cfg.CLASSIFIER_MODEL,
        },
      },
    })
    .select('id')
    .single();
  if (error) throw error;

  // atualiza arquivo com fonte_id
  await sb.from('ingest_arquivos').update({ fonte_id: fonte.id }).eq('id', arquivoId);

  stats.fontes_criadas++;

  // encola pra vetorizar (se não for quarentena — quarentena espera triagem)
  if (!quarentena) {
    const chunks = chunkText(conteudo);
    fontesPraVetorizar.push({ fonteId: fonte.id, chunks });
  }
}

// =========================================================================
// 5) Vetorizar em batch
// =========================================================================
console.log(chalk.bold(`\n🔢 Vetorizando chunks…\n`));
await sb.from('ingest_lotes').update({ status: 'vetorizando' }).eq('id', loteId);

const BATCH = 50;
const bar2 = new cliProgress.SingleBar({
  format: '  [{bar}] {percentage}% · {value}/{total} chunks',
  barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true,
}, cliProgress.Presets.shades_classic);

const totalChunks = fontesPraVetorizar.reduce((s, f) => s + f.chunks.length, 0);
bar2.start(totalChunks, 0);

for (const { fonteId, chunks } of fontesPraVetorizar) {
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const textos = slice.map(c => c.conteudo);
    const vetores = await embed(textos);
    const rows = slice.map((c, idx) => ({
      fonte_id: fonteId,
      cerebro_id: cerebroId,
      chunk_index: c.chunk_index,
      conteudo: c.conteudo,
      token_count: c.token_count,
      embedding: vetores[idx],
      embedding_model: cfg.EMBEDDING_MODEL,
    }));
    const { error } = await sb.from('cerebro_fontes_chunks').insert(rows);
    if (error) {
      console.error(chalk.red(`  erro insert chunks: ${error.message}`));
    }
    stats.chunks_criados += slice.length;
    const tokensBatch = slice.reduce((s, c) => s + (c.token_count || 0), 0);
    stats.custo_embedding_usd += custoEmbedding(tokensBatch);
    bar2.increment(slice.length);
  }
  // marca fonte como processada
  await sb.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonteId);
}
bar2.stop();

// =========================================================================
// 6) Relatório final
// =========================================================================
const duracao = Date.now() - inicio;
const custoTotal = stats.custo_classificacao_usd + stats.custo_embedding_usd + stats.custo_whisper_usd;

const relatorio = `# Relatório de Ingestão — Cérebro ${cerebroSlug}

**Data:** ${new Date().toISOString()}
**Entrada:** ${entrada}
**Duração:** ${(duracao / 1000).toFixed(1)}s

## Números

- Arquivos encontrados: ${stats.arquivos_totais}
- Processados com sucesso: ${stats.arquivos_ok}
- Em quarentena (baixa confiança / erro extração): ${stats.em_quarentena}
- Duplicados (sha existia): ${stats.arquivos_skip}
- Erros: ${stats.arquivos_erro}

## Fontes criadas

- Total de fontes: ${stats.fontes_criadas}
- Total de chunks vetorizados: ${stats.chunks_criados}

## Custos

| Etapa | Custo (USD) | Custo (BRL ~5.10) |
|---|---|---|
| Classificação | ${stats.custo_classificacao_usd.toFixed(6)} | R$ ${(stats.custo_classificacao_usd * 5.1).toFixed(4)} |
| Embedding | ${stats.custo_embedding_usd.toFixed(6)} | R$ ${(stats.custo_embedding_usd * 5.1).toFixed(4)} |
| Whisper (áudio) | ${stats.custo_whisper_usd.toFixed(6)} | R$ ${(stats.custo_whisper_usd * 5.1).toFixed(4)} |
| **TOTAL** | **${custoTotal.toFixed(6)}** | **R$ ${(custoTotal * 5.1).toFixed(4)}** |
`;

await sb.from('ingest_lotes').update({
  status: stats.em_quarentena > 0 ? 'concluido' : 'concluido',
  fontes_criadas: stats.fontes_criadas,
  chunks_criados: stats.chunks_criados,
  em_quarentena: stats.em_quarentena,
  custo_usd: custoTotal,
  duracao_ms: duracao,
  log_md: relatorio,
  finalizado_em: new Date().toISOString(),
}).eq('id', loteId);

console.log('\n' + chalk.bold('━'.repeat(60)));
console.log(relatorio);
console.log(chalk.bold('━'.repeat(60)));

if (stats.em_quarentena > 0) {
  console.log(chalk.yellow(`\n⚠  ${stats.em_quarentena} arquivo(s) em quarentena — use a tela Triagem no painel pra revisar.\n`));
}
console.log(chalk.green(`\n✓ Lote ${loteId} concluído.\n`));
