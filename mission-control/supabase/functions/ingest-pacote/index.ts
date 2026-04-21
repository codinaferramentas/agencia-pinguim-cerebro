// ========================================================================
// Edge Function: ingest-pacote
// ========================================================================
// Recebe um pacote .zip já uploaded no Supabase Storage (bucket pinguim-uploads)
// + metadados (cerebro_slug, lote_id) e processa:
//   - extrai arquivos do zip
//   - extrai texto (pdf, docx, txt, md, csv)
//   - classifica via OpenAI gpt-4o-mini
//   - chunka em ~500 tokens
//   - vetoriza via text-embedding-3-small
//   - INSERT em cerebro_fontes + cerebro_fontes_chunks
//
// Todo upload passa pelo mesmo caminho: Storage → função → banco.
// Nenhum código executa na máquina do usuário.
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
const CHUNK_SIZE_CHARS = 2000;  // ~500 tokens (aproximação por caracteres — Deno não tem tiktoken fácil)
const CHUNK_OVERLAP_CHARS = 200;
const CONFIANCA_MINIMA = 0.65;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

// ========================================================================
// Helpers
// ========================================================================

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

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
    return { tipo: 'outro', confianca: 0, justificativa: 'erro LLM: ' + e.message, tokens_in: 0, tokens_out: 0 };
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
  return null; // deixa LLM classificar
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

  // PDF via unpdf (funciona em Deno)
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

  // DOCX — ainda não fácil em Deno puro. Por enquanto skip.
  if (ext === 'docx' || ext === 'doc') {
    return '';
  }

  // Tenta UTF-8 como fallback
  try {
    const texto = new TextDecoder('utf-8').decode(buffer);
    // heurística simples: se tem muitos caracteres não-printáveis, é binário
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

/**
 * Lista recursivamente arquivos de um zip. Se encontrar .zip dentro,
 * entra nele também. Protege contra profundidade infinita (max 5 níveis).
 *
 * Retorna lista com { nome, caminho, buffer } onde `caminho` reflete o
 * aninhamento (ex: "Elo.zip > Mod2 > aula.pdf").
 */
async function listarArquivosRecursivo(
  buffer: Uint8Array,
  prefixo = '',
  profundidade = 0,
): Promise<{ nome: string; caminho: string; buffer: Uint8Array }[]> {
  if (profundidade > 5) {
    console.warn('profundidade máxima alcançada, parando recursão:', prefixo);
    return [];
  }

  const zip = await JSZip.loadAsync(buffer);
  const out: { nome: string; caminho: string; buffer: Uint8Array }[] = [];

  for (const [caminho, entry] of Object.entries(zip.files)) {
    if ((entry as any).dir) continue;
    if (excluir(caminho)) continue;

    const buf = await (entry as any).async('uint8array');
    const nome = caminho.split('/').pop() || caminho;
    const caminhoCompleto = prefixo ? `${prefixo}/${caminho}` : caminho;

    // Se for zip aninhado, recurse
    if (nome.toLowerCase().endsWith('.zip')) {
      console.log('zip aninhado detectado:', caminhoCompleto);
      try {
        const subArquivos = await listarArquivosRecursivo(buf, caminhoCompleto, profundidade + 1);
        out.push(...subArquivos);
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
// Handler
// ========================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const { lote_id, storage_path, cerebro_id, origem } = body;

  if (!lote_id || !storage_path || !cerebro_id) {
    return new Response(JSON.stringify({ error: 'lote_id, storage_path, cerebro_id obrigatórios' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const client = sb();
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
  };

  try {
    await client.from('ingest_lotes').update({ status: 'extraindo' }).eq('id', lote_id);

    // Baixa zip do Storage
    const { data: arquivo, error: errDl } = await client.storage.from('pinguim-uploads').download(storage_path);
    if (errDl || !arquivo) throw new Error(`Erro download zip: ${errDl?.message}`);

    const buffer = new Uint8Array(await arquivo.arrayBuffer());
    // Lista recursiva — entra em zips aninhados
    const todosEntries = await listarArquivosRecursivo(buffer);

    // Dedup por nome-base (sem extensão): prioridade PDF > DOCX > MD > TXT > demais
    // Por quê: PDF preserva estrutura (parágrafos, tabelas) que ajuda o embedding.
    // TXT é texto cru, pior sinal semântico. Se tem "aula.pdf" E "aula.txt", usa o PDF.
    const prioridade: Record<string, number> = { pdf: 10, docx: 8, md: 6, markdown: 6, txt: 4 };
    const porBase = new Map<string, typeof todosEntries[0]>();
    const descartadosDup: string[] = [];

    for (const e of todosEntries) {
      // chave: caminho sem extensão (normalizado)
      const semExt = e.caminho.replace(/\.[^.\/]+$/, '').toLowerCase();
      const ext = (e.nome.split('.').pop() || '').toLowerCase();
      const score = prioridade[ext] ?? 1;

      const atual = porBase.get(semExt);
      if (!atual) {
        porBase.set(semExt, e);
      } else {
        const extAtual = (atual.nome.split('.').pop() || '').toLowerCase();
        const scoreAtual = prioridade[extAtual] ?? 1;
        if (score > scoreAtual) {
          descartadosDup.push(atual.caminho);
          porBase.set(semExt, e);
        } else {
          descartadosDup.push(e.caminho);
        }
      }
    }

    const entries = Array.from(porBase.values());
    console.log(`dedup: ${todosEntries.length} -> ${entries.length} (descartados ${descartadosDup.length} duplicados por formato)`);
    if (descartadosDup.length > 0) {
      stats.arquivos_skip += descartadosDup.length;
    }

    stats.arquivos_totais = entries.length;
    await client.from('ingest_lotes').update({
      status: 'classificando',
      arquivos_totais: entries.length,
    }).eq('id', lote_id);

    // Processa cada arquivo
    const fontesPraVetorizar: { fonteId: string; chunks: any[] }[] = [];

    for (const arq of entries) {
      // sha256 simples pra dedup
      const hashBuf = await crypto.subtle.digest('SHA-256', arq.buffer);
      const sha = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      // dedup
      const { data: dup } = await client.from('ingest_arquivos').select('id').eq('sha256', sha).maybeSingle();
      if (dup) {
        stats.arquivos_skip++;
        continue;
      }

      const { data: arqRow } = await client.from('ingest_arquivos').insert({
        lote_id,
        cerebro_id,
        nome_original: arq.nome,
        caminho: arq.caminho,
        tamanho_bytes: arq.buffer.length,
        sha256: sha,
        status: 'processando',
      }).select('id').single();

      const arquivoId = arqRow!.id;

      try {
        const texto = await extrairTexto(arq.nome, arq.buffer);

        if (!texto || !texto.trim()) {
          await client.from('ingest_arquivos').update({
            status: 'quarentena',
            motivo_erro: 'sem texto extraído (PDF/DOCX ainda não suportado ou arquivo binário)',
            processado_em: new Date().toISOString(),
          }).eq('id', arquivoId);
          stats.em_quarentena++;
          continue;
        }

        // Classificação: tenta heurística rápida primeiro
        const tipoHeuristica = decideTipoPorNome(arq.nome);
        let classif;
        if (tipoHeuristica) {
          classif = { tipo: tipoHeuristica, confianca: 1.0, justificativa: 'heurística por nome', tokens_in: 0, tokens_out: 0 };
        } else {
          classif = await classificar(arq.nome, texto);
          // custo
          stats.custo_classificacao_usd += (classif.tokens_in / 1_000_000) * 0.15 + (classif.tokens_out / 1_000_000) * 0.60;
        }

        const emQuarentena = classif.confianca < CONFIANCA_MINIMA;

        const { data: fonte } = await client.from('cerebro_fontes').insert({
          cerebro_id,
          tipo: classif.tipo,
          titulo: arq.nome.replace(/\.[^.]+$/, ''),
          conteudo_md: texto,
          origem: origem || 'lote',
          autor: null,
          arquivo_nome: arq.nome,
          mime: null,
          tamanho_bytes: texto.length,
          ingest_lote_id: lote_id,
          ingest_status: emQuarentena ? 'quarentena' : 'processando',
          metadata: { classificacao: classif, caminho_original: arq.caminho },
        }).select('id').single();

        await client.from('ingest_arquivos').update({
          fonte_id: fonte!.id,
          status: emQuarentena ? 'quarentena' : 'ok',
          tipo_sugerido: classif.tipo,
          tipo_confianca: classif.confianca,
          tipo_justificativa: classif.justificativa,
          classificado_por: tipoHeuristica ? 'heuristica' : CLASSIFIER_MODEL,
          processado_em: new Date().toISOString(),
        }).eq('id', arquivoId);

        stats.fontes_criadas++;
        if (emQuarentena) { stats.em_quarentena++; continue; }
        stats.arquivos_ok++;

        // Encola pra vetorizar
        const chunks = chunkText(texto);
        fontesPraVetorizar.push({ fonteId: fonte!.id, chunks });

        // Atualiza contador no banco a cada 5 arquivos pra UI não parecer travada
        if (stats.fontes_criadas % 5 === 0) {
          await client.from('ingest_lotes').update({
            fontes_criadas: stats.fontes_criadas,
            em_quarentena: stats.em_quarentena,
          }).eq('id', lote_id);
        }

      } catch (e) {
        stats.arquivos_erro++;
        await client.from('ingest_arquivos').update({
          status: 'erro',
          motivo_erro: (e as Error).message,
          processado_em: new Date().toISOString(),
        }).eq('id', arquivoId);
      }
    }

    // Vetorizar em batches
    await client.from('ingest_lotes').update({ status: 'vetorizando' }).eq('id', lote_id);
    const BATCH = 50;

    let fontesVetorizadas = 0;
    for (const { fonteId, chunks } of fontesPraVetorizar) {
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const vetores = await embed(slice.map(c => c.conteudo));
        const rows = slice.map((c, idx) => ({
          fonte_id: fonteId,
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
        stats.custo_embedding_usd += (tokens / 1_000_000) * 0.02;
      }
      await client.from('cerebro_fontes').update({ ingest_status: 'ok' }).eq('id', fonteId);
      fontesVetorizadas++;

      // Atualiza contador de chunks no banco a cada 3 fontes vetorizadas
      if (fontesVetorizadas % 3 === 0) {
        await client.from('ingest_lotes').update({
          chunks_criados: stats.chunks_criados,
        }).eq('id', lote_id);
      }
    }

    // Relatório
    const duracao = Date.now() - inicio;
    const custoTotal = stats.custo_classificacao_usd + stats.custo_embedding_usd;

    const relatorio = `# Relatório de Ingestão

**Duração:** ${(duracao / 1000).toFixed(1)}s

## Arquivos no pacote
- Detectados no zip: ${todosEntries.length}
- Descartados por formato duplicado (PDF > DOCX > MD > TXT): ${descartadosDup.length}
- Processados: ${stats.arquivos_ok}
- Em quarentena (confiança baixa ou sem texto): ${stats.em_quarentena}
- Já existiam (sha256 igual, evitado reprocessamento): ${Math.max(0, stats.arquivos_skip - descartadosDup.length)}
- Erros: ${stats.arquivos_erro}

## Fontes + Chunks no Cérebro
- Fontes criadas: ${stats.fontes_criadas}
- Chunks vetorizados: ${stats.chunks_criados}

## Custos
- Classificação: US$ ${stats.custo_classificacao_usd.toFixed(6)}
- Embedding: US$ ${stats.custo_embedding_usd.toFixed(6)}
- **Total: US$ ${custoTotal.toFixed(6)} · ~ R$ ${(custoTotal * 5.1).toFixed(4)}**

${descartadosDup.length > 0 ? '\n## Arquivos descartados por duplicata de formato\n' + descartadosDup.slice(0, 30).map(d => `- ${d}`).join('\n') + (descartadosDup.length > 30 ? `\n- ... + ${descartadosDup.length - 30} outros` : '') : ''}
`;

    await client.from('ingest_lotes').update({
      status: 'concluido',
      fontes_criadas: stats.fontes_criadas,
      chunks_criados: stats.chunks_criados,
      em_quarentena: stats.em_quarentena,
      custo_usd: custoTotal,
      duracao_ms: duracao,
      log_md: relatorio,
      finalizado_em: new Date().toISOString(),
    }).eq('id', lote_id);

    // Apaga o zip do storage (economia de espaço — não precisamos mais)
    await client.storage.from('pinguim-uploads').remove([storage_path]);

    return new Response(JSON.stringify({ ok: true, lote_id, stats }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    await client.from('ingest_lotes').update({
      status: 'falhou',
      erro_detalhes: (e as Error).message,
      finalizado_em: new Date().toISOString(),
    }).eq('id', lote_id);

    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
