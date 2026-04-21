/**
 * Motor de ingestão — funções reutilizáveis.
 * Chamado tanto pelo CLI (ingest.mjs) quanto pelo servidor HTTP (server.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import chalk from 'chalk';

import { env } from '../lib/env.mjs';
import { supabase } from '../lib/supabase.mjs';
import { embed, classificarFonte, custoClassificacao, custoEmbedding, transcribe } from '../lib/openai.mjs';
import { chunkText } from '../lib/chunk.mjs';
import { extrairTexto, tipoArquivo, amostra } from '../lib/extract.mjs';
import { parseWhatsApp } from '../lib/whatsapp.mjs';

/**
 * Processa um zip/pasta e popula o Cérebro.
 *
 * @param {object} opts
 * @param {string} opts.caminho    - caminho absoluto do .zip ou pasta
 * @param {string} opts.cerebroId  - uuid do cérebro alvo
 * @param {string} opts.loteId     - uuid do lote (criado antes de chamar)
 * @param {string} opts.filtro     - palavra-chave (case-insensitive) pra filtrar caminhos. vazio = tudo.
 * @param {string} opts.origem     - origem padrão (lote, upload, etc)
 * @param {function} opts.onCleanup - callback após finalizar (pra limpar tmp file)
 * @returns {Promise<object>} stats finais
 */
export async function processarZip({ caminho, cerebroId, loteId, filtro = '', origem = 'lote', onCleanup }) {
  const cfg = env();
  const sb = supabase();
  const inicio = Date.now();
  const filtroNormalizado = filtro.toLowerCase().trim();

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

  const logLinhas = [];
  function log(msg) { logLinhas.push(msg); console.log(chalk.dim(`[lote ${loteId.slice(0,8)}] ${msg}`)); }

  try {
    // ==== listar arquivos ====
    log(`caminho: ${caminho}`);
    if (filtroNormalizado) log(`filtro: "${filtroNormalizado}" (só caminhos contendo essa palavra)`);

    const arquivos = await listarArquivos(caminho);
    // aplicar filtro
    const filtrados = filtroNormalizado
      ? arquivos.filter(a => a.caminho.toLowerCase().includes(filtroNormalizado) || a.nome.toLowerCase().includes(filtroNormalizado))
      : arquivos;

    stats.arquivos_totais = filtrados.length;
    log(`${arquivos.length} arquivos encontrados no pacote · ${filtrados.length} depois do filtro`);

    await sb.from('ingest_lotes').update({
      status: 'classificando',
      arquivos_totais: filtrados.length,
    }).eq('id', loteId);

    if (filtrados.length === 0) {
      await sb.from('ingest_lotes').update({
        status: 'concluido',
        log_md: 'Nenhum arquivo depois do filtro.',
        finalizado_em: new Date().toISOString(),
      }).eq('id', loteId);
      if (onCleanup) onCleanup();
      return stats;
    }

    const fontesPraVetorizar = [];

    // ==== processar cada arquivo ====
    for (const arq of filtrados) {
      const sha = crypto.createHash('sha256').update(arq.buffer).digest('hex');

      // dedup
      const { data: dup } = await sb
        .from('ingest_arquivos')
        .select('id')
        .eq('sha256', sha)
        .maybeSingle();

      if (dup) {
        stats.arquivos_skip++;
        continue;
      }

      const { data: arqRow } = await sb.from('ingest_arquivos').insert({
        lote_id: loteId,
        cerebro_id: cerebroId,
        nome_original: arq.nome,
        caminho: arq.caminho,
        tamanho_bytes: arq.buffer.length,
        sha256: sha,
        status: 'processando',
      }).select('id').single();

      const arquivoId = arqRow.id;

      try {
        const extraido = await extrairTexto({ nome: arq.nome, buffer: arq.buffer, caminho: arq.caminhoDisco });
        let textoFinal = extraido.text;
        const metaExtra = extraido.meta || {};

        // === áudio (transcreve) ===
        if (extraido.audio) {
          let audioPath = arq.caminhoDisco;
          if (!audioPath) {
            const tmpDir = path.join(process.env.TEMP || '/tmp', 'pinguim-audio');
            fs.mkdirSync(tmpDir, { recursive: true });
            audioPath = path.join(tmpDir, sha + path.extname(arq.nome));
            fs.writeFileSync(audioPath, arq.buffer);
          }
          textoFinal = await transcribe(audioPath);
          const duracaoMin = (arq.buffer.length / 1024 / 16) / 60;
          stats.custo_whisper_usd += duracaoMin * 0.006;
          metaExtra.fonte_formato = 'audio_transcrito';
          if (!arq.caminhoDisco) { try { fs.unlinkSync(audioPath); } catch {} }
        }

        if (!textoFinal || !textoFinal.trim()) {
          await sb.from('ingest_arquivos').update({
            status: 'quarentena',
            motivo_erro: extraido.erro || extraido.meta?.reason || 'sem texto extraído',
            processado_em: new Date().toISOString(),
          }).eq('id', arquivoId);
          stats.em_quarentena++;
          continue;
        }

        // === WhatsApp ===
        const pareceWA = arq.nome.toLowerCase().includes('whats') ||
                        arq.nome.toLowerCase().includes('_chat') ||
                        /^\[\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}/.test(textoFinal.trim());
        if (pareceWA) {
          const parsed = parseWhatsApp(textoFinal);
          if (parsed.conversas.length > 0) {
            for (const conv of parsed.conversas) {
              await criarFonte({
                sb, cerebroId, loteId, arquivoId, fontesPraVetorizar, stats,
                tipo: 'chat_export',
                titulo: conv.titulo,
                conteudo: conv.markdown,
                origem,
                autor: conv.autores[0] || null,
                arquivo_nome: arq.nome,
                mime: 'text/whatsapp',
                metadata: { ...metaExtra, whatsapp: {
                  inicio: conv.inicio, fim: conv.fim, autores: conv.autores,
                  total_mensagens: conv.total_mensagens,
                  lote_stats: {
                    total_mensagens: parsed.total_mensagens,
                    ruido_descartado: parsed.ruido_descartado,
                    conversas_relevantes: parsed.conversas_relevantes,
                  }
                }},
                confianca: 1.0,
              });
            }
            await sb.from('ingest_arquivos').update({
              status: 'ok',
              tipo_sugerido: 'chat_export',
              tipo_confianca: 1.0,
              tipo_justificativa: `${parsed.conversas.length} conversas extraídas`,
              classificado_por: 'heuristica',
              processado_em: new Date().toISOString(),
            }).eq('id', arquivoId);
            stats.arquivos_ok++;
            continue;
          }
        }

        // === caso padrão: classifica via LLM ===
        const amostraCurta = amostra(textoFinal, 200);
        const cls = await classificarFonte({ nome: arq.nome, amostra: amostraCurta });
        stats.custo_classificacao_usd += custoClassificacao({
          tokens_input: cls.tokens_input, tokens_output: cls.tokens_output,
        });

        const emQuarentena = cls.confianca < cfg.CONFIANCA_MINIMA;

        await criarFonte({
          sb, cerebroId, loteId, arquivoId, fontesPraVetorizar, stats,
          tipo: cls.tipo,
          titulo: arq.nome.replace(/\.[^.]+$/, ''),
          conteudo: textoFinal,
          origem,
          autor: null,
          arquivo_nome: arq.nome,
          mime: metaExtra.fonte_formato ? 'extracted/' + metaExtra.fonte_formato : null,
          metadata: { ...metaExtra, classificacao: cls },
          confianca: cls.confianca,
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
        log(`  ✗ erro em "${arq.nome}": ${e.message}`);
      }
    }

    // ==== vetorizar em batch ====
    await sb.from('ingest_lotes').update({ status: 'vetorizando' }).eq('id', loteId);

    const BATCH = 50;
    for (const { fonteId, chunks } of fontesPraVetorizar) {
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const vetores = await embed(slice.map(c => c.conteudo));
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
        if (error) log(`  erro insert chunks: ${error.message}`);
        stats.chunks_criados += slice.length;
        const tokensBatch = slice.reduce((s, c) => s + (c.token_count || 0), 0);
        stats.custo_embedding_usd += custoEmbedding(tokensBatch);
      }
      await sb.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonteId);
    }

    // ==== relatório ====
    const duracao = Date.now() - inicio;
    const custoTotal = stats.custo_classificacao_usd + stats.custo_embedding_usd + stats.custo_whisper_usd;

    const relatorio = `# Relatório de Ingestão

**Duração:** ${(duracao / 1000).toFixed(1)}s
**Filtro aplicado:** ${filtroNormalizado || '(sem filtro)'}

## Arquivos
- Totais no pacote: ${stats.arquivos_totais}
- Processados com sucesso: ${stats.arquivos_ok}
- Em quarentena (baixa confiança / erro): ${stats.em_quarentena}
- Duplicados (já existiam): ${stats.arquivos_skip}
- Erros: ${stats.arquivos_erro}

## Fontes + Chunks
- Fontes criadas: ${stats.fontes_criadas}
- Chunks vetorizados: ${stats.chunks_criados}

## Custos (USD)
- Classificação (gpt-4o-mini): ${stats.custo_classificacao_usd.toFixed(6)}
- Embedding (text-embedding-3-small): ${stats.custo_embedding_usd.toFixed(6)}
- Whisper (áudio): ${stats.custo_whisper_usd.toFixed(6)}
- **Total: US$ ${custoTotal.toFixed(6)}  ·  ~ R$ ${(custoTotal * 5.1).toFixed(4)}**
`;

    await sb.from('ingest_lotes').update({
      status: 'concluido',
      fontes_criadas: stats.fontes_criadas,
      chunks_criados: stats.chunks_criados,
      em_quarentena: stats.em_quarentena,
      custo_usd: custoTotal,
      duracao_ms: duracao,
      log_md: relatorio,
      finalizado_em: new Date().toISOString(),
    }).eq('id', loteId);

    log(`✓ concluído em ${(duracao / 1000).toFixed(1)}s · ${stats.fontes_criadas} fontes · ${stats.chunks_criados} chunks · US$ ${custoTotal.toFixed(4)}`);

  } catch (e) {
    await sb.from('ingest_lotes').update({
      status: 'falhou',
      erro_detalhes: e.message,
      finalizado_em: new Date().toISOString(),
    }).eq('id', loteId);
    log(`✗ FALHOU: ${e.message}`);
    throw e;
  } finally {
    if (onCleanup) onCleanup();
  }

  return stats;
}

// ============================================================
// helpers
// ============================================================

async function listarArquivos(caminho) {
  const arquivos = [];
  const stat = fs.statSync(caminho);

  if (stat.isFile() && caminho.toLowerCase().endsWith('.zip')) {
    const zip = new AdmZip(caminho);
    zip.getEntries().forEach(e => {
      if (!e.isDirectory && !excluir(e.entryName)) {
        arquivos.push({
          nome: path.basename(e.entryName),
          caminho: e.entryName,
          buffer: e.getData(),
        });
      }
    });
  } else if (stat.isDirectory()) {
    function walk(dir, prefix = '') {
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const relPath = prefix + item;
        const s = fs.statSync(full);
        if (s.isDirectory()) walk(full, relPath + '/');
        else if (!excluir(relPath)) {
          arquivos.push({
            nome: item,
            caminho: relPath,
            buffer: fs.readFileSync(full),
            caminhoDisco: full,
          });
        }
      }
    }
    walk(caminho);
  } else {
    throw new Error('Entrada deve ser .zip ou pasta');
  }

  return arquivos;
}

function excluir(nome) {
  if (nome.startsWith('.')) return true;
  if (nome.includes('__MACOSX')) return true;
  const base = path.basename(nome);
  if (base === 'Thumbs.db' || base === '.DS_Store' || base.startsWith('~$')) return true;
  return false;
}

async function criarFonte({ sb, cerebroId, loteId, arquivoId, fontesPraVetorizar, stats, tipo, titulo, conteudo, origem, autor, arquivo_nome, mime, metadata, confianca, quarentena = false }) {
  const { data: fonte, error } = await sb.from('cerebro_fontes').insert({
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
    metadata: metadata || {},
  }).select('id').single();
  if (error) throw error;

  await sb.from('ingest_arquivos').update({ fonte_id: fonte.id }).eq('id', arquivoId);
  stats.fontes_criadas++;

  if (!quarentena) {
    const chunks = chunkText(conteudo);
    fontesPraVetorizar.push({ fonteId: fonte.id, chunks });
  }
}
