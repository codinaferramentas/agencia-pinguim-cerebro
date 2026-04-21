// ========================================================================
// Edge Function: ingest-pacote (modo ONDAS)
// ========================================================================
// Duas fases pra caber no limite de execução da Edge Function (~150s):
//
//   modo=preparar        — baixa zip, extrai, dedup, cria ingest_arquivos
//                          com status='pendente'. Não toca em OpenAI.
//                          Retorna { total_pendentes }.
//
//   modo=processar-onda  — pega até ONDA_TAMANHO arquivos pendentes,
//                          extrai texto → classifica → cria fonte →
//                          chunka → vetoriza. Marca como 'ok' no final.
//                          Retorna { processados, restantes, concluido }.
//
// Painel dispara preparar 1x e depois processar-onda em loop até concluir.
// Se onda cair no meio, a próxima retoma do banco — nada é perdido.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { extractText as pdfExtractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';

// ========================================================================
// Config
// ========================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const CLASSIFIER_MODEL = 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const CONFIANCA_MINIMA = 0.65;
const ONDA_TAMANHO = 5;            // arquivos processados por onda
const EMBED_BATCH = 50;            // chunks por chamada OpenAI

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ========================================================================
// Helpers de conteúdo
// ========================================================================

async function classificar(nome: string, amostra: string) {
  const prompt = `Classifique o arquivo em UM destes tipos de fonte:

- aula: transcrição de aula/vídeo educacional
- pagina_venda: copy de landing/VSL
- depoimento: relato/feedback de aluno
- objecao: dúvida/resistência do público
- sacada: insight/jabá interno do expert
- pesquisa: resposta de pesquisa/form (CSV ou resumo)
- chat_export: export bruto de chat (WhatsApp/Telegram/Discord)
- pitch: roteiro de venda/abertura
- faq: pergunta-resposta
- externo: material de fora (artigo, podcast)
- csv: planilha estruturada
- outro: não se encaixa

Responda APENAS JSON: {"tipo":"...","confianca":0.00,"justificativa":"..."}

NOME: ${nome}

AMOSTRA:
${amostra.slice(0, 1200)}`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    const j = await r.json();
    const parsed = JSON.parse(j.choices[0].message.content);
    return {
      tipo: parsed.tipo || 'outro',
      confianca: Number(parsed.confianca) || 0.5,
      justificativa: parsed.justificativa || '',
      tokens_in: j.usage?.prompt_tokens || 0,
      tokens_out: j.usage?.completion_tokens || 0,
    };
  } catch (e) {
    return { tipo: 'outro', confianca: 0, justificativa: 'erro LLM: ' + (e as Error).message, tokens_in: 0, tokens_out: 0 };
  }
}

async function embed(textos: string[]): Promise<number[][]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: textos }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`embed HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.data.map((d: any) => d.embedding);
}

function chunkText(texto: string): { conteudo: string; chunk_index: number; token_count: number }[] {
  if (!texto || !texto.trim()) return [];
  texto = texto.trim();

  if (texto.length <= CHUNK_SIZE_CHARS) {
    return [{ conteudo: texto, chunk_index: 0, token_count: Math.ceil(texto.length / 4) }];
  }

  const chunks = [];
  let start = 0;
  let idx = 0;
  while (start < texto.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, texto.length);
    const slice = texto.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push({
        conteudo: slice,
        chunk_index: idx++,
        token_count: Math.ceil(slice.length / 4),
      });
    }
    if (end >= texto.length) break;
    start = end - CHUNK_OVERLAP_CHARS;
  }
  return chunks;
}

function decideTipoPorNome(nome: string): string | null {
  const n = nome.toLowerCase();
  if (n.endsWith('.csv')) return 'csv';
  if (n.includes('whats') || n.includes('_chat')) return 'chat_export';
  return null;
}

async function extrairTexto(nome: string, buffer: Uint8Array): Promise<string> {
  const ext = nome.toLowerCase().split('.').pop();

  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    return new TextDecoder('utf-8').decode(buffer);
  }

  if (ext === 'csv') {
    const raw = new TextDecoder('utf-8').decode(buffer);
    const linhas = raw.split('\n').filter(l => l.trim());
    if (linhas.length === 0) return '';
    const header = linhas[0];
    const preview = linhas.slice(1, 11).join('\n');
    const extra = linhas.length > 11 ? `\n\n... +${linhas.length - 11} linhas adicionais` : '';
    return `${header}\n---\n${preview}${extra}`;
  }

  if (ext === 'json') {
    try {
      const obj = JSON.parse(new TextDecoder('utf-8').decode(buffer));
      return JSON.stringify(obj, null, 2);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }

  if (ext === 'html' || ext === 'htm') {
    const raw = new TextDecoder('utf-8').decode(buffer);
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (ext === 'pdf') {
    try {
      const pdf = await getDocumentProxy(buffer);
      const { text } = await pdfExtractText(pdf, { mergePages: true });
      return (typeof text === 'string' ? text : text.join('\n')).trim();
    } catch (e) {
      console.error('PDF extract erro:', nome, e);
      return '';
    }
  }

  if (ext === 'docx' || ext === 'doc') return '';

  try {
    const texto = new TextDecoder('utf-8').decode(buffer);
    const naoImprimivel = texto.split('').filter(c => {
      const code = c.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    }).length;
    if (naoImprimivel > texto.length * 0.05) return '';
    return texto;
  } catch {
    return '';
  }
}

function excluir(nome: string): boolean {
  if (nome.startsWith('.')) return true;
  if (nome.includes('__MACOSX')) return true;
  const base = nome.split('/').pop() || '';
  if (base === 'Thumbs.db' || base === '.DS_Store' || base.startsWith('~$')) return true;
  return false;
}

async function listarArquivosRecursivo(
  buffer: Uint8Array,
  prefixo = '',
  profundidade = 0,
): Promise<{ nome: string; caminho: string; buffer: Uint8Array }[]> {
  if (profundidade > 5) return [];

  const zip = await JSZip.loadAsync(buffer);
  const out: { nome: string; caminho: string; buffer: Uint8Array }[] = [];

  for (const [caminho, entry] of Object.entries(zip.files)) {
    if ((entry as any).dir) continue;
    if (excluir(caminho)) continue;

    const buf = await (entry as any).async('uint8array');
    const nome = caminho.split('/').pop() || caminho;
    const caminhoCompleto = prefixo ? `${prefixo}/${caminho}` : caminho;

    if (nome.toLowerCase().endsWith('.zip')) {
      try {
        const subs = await listarArquivosRecursivo(buf, caminhoCompleto, profundidade + 1);
        out.push(...subs);
      } catch (e) {
        console.error('erro lendo zip aninhado:', caminhoCompleto, e);
      }
      continue;
    }

    out.push({ nome, caminho: caminhoCompleto, buffer: buf });
  }

  return out;
}

// ========================================================================
// MODO 1: preparar
// ========================================================================

async function preparar(lote_id: string, storage_path: string, cerebro_id: string) {
  const client = sb();
  await client.from('ingest_lotes').update({ status: 'extraindo' }).eq('id', lote_id);

  const { data: arquivo, error: errDl } = await client.storage.from('pinguim-uploads').download(storage_path);
  if (errDl || !arquivo) throw new Error(`Erro download zip: ${errDl?.message}`);

  const buffer = new Uint8Array(await arquivo.arrayBuffer());
  const todosEntries = await listarArquivosRecursivo(buffer);

  // Dedup por nome-base: PDF > DOCX > MD > TXT > demais
  const prioridade: Record<string, number> = { pdf: 10, docx: 8, md: 6, markdown: 6, txt: 4 };
  const porBase = new Map<string, typeof todosEntries[0]>();
  const descartadosDup: string[] = [];

  for (const e of todosEntries) {
    const semExt = e.caminho.replace(/\.[^.\/]+$/, '').toLowerCase();
    const ext = (e.nome.split('.').pop() || '').toLowerCase();
    const score = prioridade[ext] ?? 1;
    const atual = porBase.get(semExt);
    if (!atual) { porBase.set(semExt, e); continue; }
    const extAtual = (atual.nome.split('.').pop() || '').toLowerCase();
    const scoreAtual = prioridade[extAtual] ?? 1;
    if (score > scoreAtual) {
      descartadosDup.push(atual.caminho);
      porBase.set(semExt, e);
    } else {
      descartadosDup.push(e.caminho);
    }
  }

  const entries = Array.from(porBase.values());

  // Cria ingest_arquivos com status='pendente' (dedup por sha256 contra histórico)
  let pendentes = 0;
  let duplicadosHistorico = 0;
  for (const arq of entries) {
    const hashBuf = await crypto.subtle.digest('SHA-256', arq.buffer);
    const sha = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: dup } = await client.from('ingest_arquivos').select('id').eq('sha256', sha).maybeSingle();
    if (dup) { duplicadosHistorico++; continue; }

    await client.from('ingest_arquivos').insert({
      lote_id,
      cerebro_id,
      nome_original: arq.nome,
      caminho: arq.caminho,
      tamanho_bytes: arq.buffer.length,
      sha256: sha,
      status: 'pendente',
    });
    pendentes++;
  }

  await client.from('ingest_lotes').update({
    status: 'classificando',  // reusa enum: "preparado, aguardando ondas"
    arquivos_totais: pendentes,
  }).eq('id', lote_id);

  return {
    total_pendentes: pendentes,
    descartados_formato: descartadosDup.length,
    duplicados_historico: duplicadosHistorico,
    detectados_no_zip: todosEntries.length,
  };
}

// ========================================================================
// MODO 2: processar-onda
// ========================================================================

async function processarOnda(lote_id: string, storage_path: string, cerebro_id: string, origem: string) {
  const client = sb();

  // Marca lote como "vetorizando" (= rodando ondas)
  await client.from('ingest_lotes').update({ status: 'vetorizando' }).eq('id', lote_id);

  // Pega próximos arquivos pendentes deste lote
  const { data: pendentes } = await client.from('ingest_arquivos')
    .select('id, nome_original, caminho, sha256')
    .eq('lote_id', lote_id)
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(ONDA_TAMANHO);

  if (!pendentes || pendentes.length === 0) {
    return await concluirLote(lote_id, storage_path);
  }

  // Baixa zip uma vez por onda
  const { data: arquivoZip, error: errDl } = await client.storage.from('pinguim-uploads').download(storage_path);
  if (errDl || !arquivoZip) throw new Error(`Erro download zip na onda: ${errDl?.message}`);
  const bufZip = new Uint8Array(await arquivoZip.arrayBuffer());
  const todos = await listarArquivosRecursivo(bufZip);
  const porCaminho = new Map(todos.map(t => [t.caminho, t]));

  // Stats incrementais (lemos do lote e somamos)
  const { data: loteAtual } = await client.from('ingest_lotes')
    .select('fontes_criadas, chunks_criados, em_quarentena, custo_usd')
    .eq('id', lote_id).single();

  const stats = {
    processados: 0,
    fontes_criadas: loteAtual?.fontes_criadas || 0,
    chunks_criados: loteAtual?.chunks_criados || 0,
    em_quarentena: loteAtual?.em_quarentena || 0,
    custo_usd: Number(loteAtual?.custo_usd || 0),
  };

  for (const arq of pendentes) {
    // Marca como 'processando' (evita reentrada se outra chamada ler antes)
    await client.from('ingest_arquivos').update({ status: 'processando' }).eq('id', arq.id);

    try {
      const entry = porCaminho.get(arq.caminho);
      if (!entry) {
        await client.from('ingest_arquivos').update({
          status: 'erro',
          motivo_erro: 'arquivo não encontrado no zip (re-extração falhou)',
          processado_em: new Date().toISOString(),
        }).eq('id', arq.id);
        continue;
      }

      const texto = await extrairTexto(entry.nome, entry.buffer);
      if (!texto || !texto.trim()) {
        await client.from('ingest_arquivos').update({
          status: 'quarentena',
          motivo_erro: 'sem texto extraído (PDF escaneado, DOCX ou binário)',
          processado_em: new Date().toISOString(),
        }).eq('id', arq.id);
        stats.em_quarentena++;
        continue;
      }

      const tipoHeuristica = decideTipoPorNome(entry.nome);
      let classif;
      if (tipoHeuristica) {
        classif = { tipo: tipoHeuristica, confianca: 1.0, justificativa: 'heurística por nome', tokens_in: 0, tokens_out: 0 };
      } else {
        classif = await classificar(entry.nome, texto);
        stats.custo_usd += (classif.tokens_in / 1_000_000) * 0.15 + (classif.tokens_out / 1_000_000) * 0.60;
      }

      const emQuarentena = classif.confianca < CONFIANCA_MINIMA;

      const { data: fonte } = await client.from('cerebro_fontes').insert({
        cerebro_id,
        tipo: classif.tipo,
        titulo: entry.nome.replace(/\.[^.]+$/, ''),
        conteudo_md: texto,
        origem: origem || 'lote',
        autor: null,
        arquivo_nome: entry.nome,
        mime: null,
        tamanho_bytes: texto.length,
        ingest_lote_id: lote_id,
        ingest_status: emQuarentena ? 'quarentena' : 'processando',
        metadata: { classificacao: classif, caminho_original: entry.caminho },
      }).select('id').single();

      if (emQuarentena) {
        await client.from('ingest_arquivos').update({
          fonte_id: fonte!.id,
          status: 'quarentena',
          tipo_sugerido: classif.tipo,
          tipo_confianca: classif.confianca,
          tipo_justificativa: classif.justificativa,
          classificado_por: tipoHeuristica ? 'heuristica' : CLASSIFIER_MODEL,
          processado_em: new Date().toISOString(),
        }).eq('id', arq.id);
        stats.fontes_criadas++;
        stats.em_quarentena++;
        continue;
      }

      // Vetorização
      const chunks = chunkText(texto);
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const slice = chunks.slice(i, i + EMBED_BATCH);
        const vetores = await embed(slice.map(c => c.conteudo));
        const rows = slice.map((c, idx) => ({
          fonte_id: fonte!.id,
          cerebro_id,
          chunk_index: c.chunk_index,
          conteudo: c.conteudo,
          token_count: c.token_count,
          embedding: vetores[idx],
          embedding_model: EMBEDDING_MODEL,
        }));
        await client.from('cerebro_fontes_chunks').insert(rows);
        stats.chunks_criados += slice.length;
        const tokens = slice.reduce((s, c) => s + (c.token_count || 0), 0);
        stats.custo_usd += (tokens / 1_000_000) * 0.02;
      }

      await client.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonte!.id);
      await client.from('ingest_arquivos').update({
        fonte_id: fonte!.id,
        status: 'ok',
        tipo_sugerido: classif.tipo,
        tipo_confianca: classif.confianca,
        tipo_justificativa: classif.justificativa,
        classificado_por: tipoHeuristica ? 'heuristica' : CLASSIFIER_MODEL,
        processado_em: new Date().toISOString(),
      }).eq('id', arq.id);

      stats.fontes_criadas++;
      stats.processados++;

    } catch (e) {
      await client.from('ingest_arquivos').update({
        status: 'erro',
        motivo_erro: (e as Error).message,
        processado_em: new Date().toISOString(),
      }).eq('id', arq.id);
    }
  }

  // Atualiza contadores do lote depois da onda inteira
  await client.from('ingest_lotes').update({
    fontes_criadas: stats.fontes_criadas,
    chunks_criados: stats.chunks_criados,
    em_quarentena: stats.em_quarentena,
    custo_usd: stats.custo_usd,
  }).eq('id', lote_id);

  // Quantos ainda faltam
  const { count: restantes } = await client.from('ingest_arquivos')
    .select('id', { count: 'exact', head: true })
    .eq('lote_id', lote_id)
    .eq('status', 'pendente');

  if ((restantes || 0) === 0) {
    return await concluirLote(lote_id, storage_path);
  }

  return {
    processados: stats.processados,
    restantes: restantes || 0,
    concluido: false,
    fontes_criadas: stats.fontes_criadas,
    chunks_criados: stats.chunks_criados,
    em_quarentena: stats.em_quarentena,
  };
}

async function concluirLote(lote_id: string, storage_path: string) {
  const client = sb();

  // ============= RECONCILIAÇÃO =============
  // Antes de declarar concluído, varre fontes deste lote e corrige
  // estados intermediários que podem ter ficado pra trás (ex: update
  // do status falhou silenciosamente no meio da onda).
  //
  // Regra: fonte com chunks vetorizados → ok. Fonte sem chunks → erro.
  // ==========================================

  const { data: fontesPendentes } = await client.from('cerebro_fontes')
    .select('id')
    .eq('ingest_lote_id', lote_id)
    .eq('ingest_status', 'processando');

  const inconsistencias: string[] = [];

  if (fontesPendentes && fontesPendentes.length > 0) {
    for (const f of fontesPendentes) {
      const { count: chunksDaFonte } = await client.from('cerebro_fontes_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('fonte_id', f.id);

      if ((chunksDaFonte || 0) > 0) {
        // tem chunks, só o status ficou pra trás — corrige
        await client.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', f.id);
        inconsistencias.push(`fonte ${f.id}: status corrigido pra ok (${chunksDaFonte} chunks presentes)`);
      } else {
        // sem chunks, realmente falhou
        await client.from('cerebro_fontes').update({ ingest_status: 'erro' }).eq('id', f.id);
        inconsistencias.push(`fonte ${f.id}: marcada como erro (0 chunks)`);
      }
    }
  }

  // Recalcula contagens REAIS direto das tabelas (não confia no contador cacheado)
  const { count: realFontes } = await client.from('cerebro_fontes')
    .select('id', { count: 'exact', head: true })
    .eq('ingest_lote_id', lote_id)
    .eq('ingest_status', 'ok');

  const { count: realQuarentena } = await client.from('cerebro_fontes')
    .select('id', { count: 'exact', head: true })
    .eq('ingest_lote_id', lote_id)
    .eq('ingest_status', 'quarentena');

  const { count: realChunks } = await client.from('cerebro_fontes_chunks')
    .select('id', { count: 'exact', head: true })
    .in('fonte_id',
      (await client.from('cerebro_fontes').select('id').eq('ingest_lote_id', lote_id)).data?.map(r => r.id) || []
    );

  const { data: lote } = await client.from('ingest_lotes')
    .select('arquivos_totais, custo_usd, criado_em')
    .eq('id', lote_id).single();

  const { data: arqsPorStatus } = await client.from('ingest_arquivos')
    .select('status')
    .eq('lote_id', lote_id);
  const arqOk = (arqsPorStatus || []).filter(a => a.status === 'ok').length;
  const arqQuar = (arqsPorStatus || []).filter(a => a.status === 'quarentena').length;
  const arqErro = (arqsPorStatus || []).filter(a => a.status === 'erro').length;
  const arqPendente = (arqsPorStatus || []).filter(a => a.status === 'pendente').length;
  const arqProcessando = (arqsPorStatus || []).filter(a => a.status === 'processando').length;
  const arqTotal = (arqsPorStatus || []).length;

  // Checagem de consistência: soma dos estados tem que bater com o total
  const somaEstados = arqOk + arqQuar + arqErro + arqPendente + arqProcessando;
  if (somaEstados !== arqTotal) {
    inconsistencias.push(`contagem de ingest_arquivos não bate: soma=${somaEstados} total=${arqTotal}`);
  }
  if (arqPendente > 0 || arqProcessando > 0) {
    inconsistencias.push(`ainda há ${arqPendente} pendentes e ${arqProcessando} processando após conclusão`);
  }

  const duracao = lote?.criado_em ? (Date.now() - new Date(lote.criado_em).getTime()) : 0;
  const custoTotal = Number(lote?.custo_usd || 0);

  const statusFinal = inconsistencias.length > 0 && (arqPendente > 0 || arqProcessando > 0)
    ? 'falhou'
    : 'concluido';

  const relatorio = `# Relatório de Ingestão

**Duração total:** ${(duracao / 1000).toFixed(1)}s
**Status:** ${statusFinal === 'concluido' ? '✅ Concluído' : '❌ Finalizado com inconsistência'}

## Resultado (contagem real no banco)
- Arquivos no pacote: ${arqTotal}
- OK: ${arqOk}
- Quarentena: ${arqQuar}
- Erros: ${arqErro}
- Fontes ativas no Cérebro: ${realFontes || 0}
- Chunks vetorizados: ${realChunks || 0}

## Custo
- **Total: US$ ${custoTotal.toFixed(6)} · ~ R$ ${(custoTotal * 5.1).toFixed(4)}**
${inconsistencias.length > 0 ? `\n## ⚠ Reconciliação\n${inconsistencias.map(i => `- ${i}`).join('\n')}\n` : ''}`;

  // Atualiza contadores cacheados com os valores reais + status final
  await client.from('ingest_lotes').update({
    status: statusFinal,
    fontes_criadas: realFontes || 0,
    chunks_criados: realChunks || 0,
    em_quarentena: realQuarentena || 0,
    duracao_ms: duracao,
    log_md: relatorio,
    erro_detalhes: inconsistencias.length > 0 ? inconsistencias.join(' | ') : null,
    finalizado_em: new Date().toISOString(),
  }).eq('id', lote_id);

  if (storage_path) {
    await client.storage.from('pinguim-uploads').remove([storage_path]).catch(() => {});
  }

  return {
    processados: 0,
    restantes: 0,
    concluido: true,
    fontes_criadas: realFontes || 0,
    chunks_criados: realChunks || 0,
    em_quarentena: realQuarentena || 0,
    inconsistencias: inconsistencias.length,
  };
}

// ========================================================================
// Handler
// ========================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST required' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'body inválido' }, 400); }

  const { modo, lote_id, storage_path, cerebro_id, origem } = body;

  if (!lote_id || !cerebro_id) {
    return jsonResp({ error: 'lote_id e cerebro_id obrigatórios' }, 400);
  }

  const client = sb();

  try {
    if (modo === 'preparar') {
      if (!storage_path) return jsonResp({ error: 'storage_path obrigatório em preparar' }, 400);
      const r = await preparar(lote_id, storage_path, cerebro_id);
      return jsonResp({ ok: true, ...r });
    }

    if (modo === 'processar-onda') {
      if (!storage_path) return jsonResp({ error: 'storage_path obrigatório em processar-onda' }, 400);
      const r = await processarOnda(lote_id, storage_path, cerebro_id, origem || 'lote');
      return jsonResp({ ok: true, ...r });
    }

    return jsonResp({ error: `modo inválido: ${modo}. use 'preparar' ou 'processar-onda'` }, 400);

  } catch (e) {
    await client.from('ingest_lotes').update({
      status: 'falhou',
      erro_detalhes: (e as Error).message,
      finalizado_em: new Date().toISOString(),
    }).eq('id', lote_id).catch(() => {});

    return jsonResp({ error: (e as Error).message }, 500);
  }
});
