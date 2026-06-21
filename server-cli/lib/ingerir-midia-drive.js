// ============================================================
// ingerir-midia-drive.js — V4 (2026-06-19)
// ============================================================
// Lib GENERICA. Recebe { cerebro_id, categoria_slug, pasta_drive_id } e:
//
//   1) Lista arquivos da pasta no Drive (filtra video/* + audio/* + TXT/MD/SRT/VTT)
//   2) Pra cada arquivo NAO processado ainda (lookup em fontes_processadas):
//      A) Se MP4/MP3/WAV/etc (midia bruta):
//         a) Baixa binario do Drive
//         b) Chama transcreverMidia (extrai audio, chunks, Whisper)
//         c) Insere linha em cerebro_fontes (tipo='transcricao_midia')
//      B) Se TXT/MD/SRT/VTT (transcricao pronta — caso Pedro Aredes):
//         a) Baixa texto do Drive
//         b) Limpa formato SRT/VTT se necessario
//         c) Insere direto em cerebro_fontes (tipo='transcricao_midia') — PULA Whisper
//      d) Marca em fontes_processadas (idempotencia)
//   3) Devolve relatorio: total processados, novos, falhas
//
// Reutilizavel pra: aulas Zoom, calls de venda, podcasts internos, qualquer
// pasta de Drive com midia OU transcricao pronta.
// ============================================================

const drive = require('./google-drive-content');
const db = require('./db');
const { transcreverMidia } = require('./transcrever-midia');
const { vetorizarFonte } = require('./vetorizar-fonte');

// IDs canonicos (mesmo padrao do db.js)
const TENANT_ID_PINGUIM = '00000000-0000-0000-0000-000000000001';

const MIME_VIDEO = ['video/'];
const MIME_AUDIO = ['audio/'];

// V4 (2026-06-19): tipos de transcricao PRONTA aceitos (Pedro Aredes manda direto)
const EXT_TRANSCRICAO_PRONTA = ['.txt', '.md', '.srt', '.vtt'];
const MIME_TEXTO = ['text/plain', 'text/markdown', 'application/x-subrip', 'text/vtt'];

function ehMidiaBruta(mime) {
  return MIME_VIDEO.some(p => mime.startsWith(p)) || MIME_AUDIO.some(p => mime.startsWith(p));
}

function ehTranscricaoPronta(name, mime) {
  const lower = (name || '').toLowerCase();
  if (EXT_TRANSCRICAO_PRONTA.some(ext => lower.endsWith(ext))) return true;
  if (MIME_TEXTO.includes((mime || '').toLowerCase())) return true;
  return false;
}

function ehArquivoAceito(name, mime) {
  return ehMidiaBruta(mime) || ehTranscricaoPronta(name, mime);
}

// Limpa SRT/VTT pra texto puro (remove timestamps e numeros de cue)
function limparSrtVtt(texto) {
  if (!texto) return '';
  return texto
    .replace(/^WEBVTT.*$/im, '')                              // header VTT
    .replace(/^\d+\s*$/gm, '')                                // numeros de cue (SRT)
    .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*$/gm, '') // timecodes
    .replace(/<[^>]+>/g, '')                                   // tags VTT
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Ingere midias novas de uma pasta Drive como fontes do cerebro.
 * @param {object} args
 * @param {string} args.cerebro_id
 * @param {string} args.categoria_slug
 * @param {string} args.pasta_drive_id - ID da pasta no Drive
 * @param {string} args.cliente_id     - dono da conexao Google (default = padrao do socio)
 * @param {string} [args.label]        - label da conexao especifica (opcional)
 * @param {string} [args.tipo_fonte]   - tipo p/ gravar em cerebro_fontes (default 'transcricao_midia')
 * @param {function} [args.on_log]     - callback de log
 * @returns {Promise<{total_listados, ja_processados, novos, falhas, detalhes}>}
 */
async function ingerirPastaDrive({
  cerebro_id,
  categoria_slug,
  pasta_drive_id,
  cliente_id,
  label = null,
  tipo_fonte = 'transcricao_midia',
  on_log = () => {},
}) {
  if (!cerebro_id) throw new Error('cerebro_id obrigatorio');
  if (!categoria_slug) throw new Error('categoria_slug obrigatorio');
  if (!pasta_drive_id) throw new Error('pasta_drive_id obrigatorio');

  on_log({ etapa: 'inicio', pasta_drive_id });

  // 1. Lista arquivos (midia bruta OU transcricao pronta TXT/MD/SRT/VTT)
  const arquivos = await drive.listarArquivosDaPasta({
    pastaId: pasta_drive_id,
    cliente_id, label,
  });
  const aceitos = arquivos.filter(a => ehArquivoAceito(a.name || '', a.mimeType || ''));
  on_log({ etapa: 'listou', total: arquivos.length, aceitos: aceitos.length });

  if (aceitos.length === 0) {
    return { total_listados: arquivos.length, ja_processados: 0, novos: 0, falhas: 0, detalhes: [] };
  }

  // 2. Filtra ja processados via fontes_processadas
  const ids = aceitos.map(m => `'${m.id}'`).join(',');
  const jaProc = await db.rodarSQL(
    `SELECT fonte_externa_id FROM pinguim.fontes_processadas
     WHERE cerebro_id = '${cerebro_id}'::uuid
       AND categoria_slug = '${categoria_slug}'
       AND fonte_origem = 'google_drive'
       AND fonte_externa_id IN (${ids})`
  );
  const setProc = new Set((jaProc || []).map(r => r.fonte_externa_id));
  const novos = aceitos.filter(m => !setProc.has(m.id));
  on_log({ etapa: 'filtrou', ja_processados: setProc.size, novos: novos.length });

  // 3. Pra cada novo: decide caminho A (midia + Whisper) ou B (texto pronto)
  const detalhes = [];
  let falhas = 0;
  let novos_ok = 0;
  for (const arq of novos) {
    const det = { drive_file_id: arq.id, name: arq.name, mime: arq.mimeType, bytes: parseInt(arq.size || 0, 10), ok: false };
    const caminhoTextoPronto = ehTranscricaoPronta(arq.name, arq.mimeType);
    det.caminho = caminhoTextoPronto ? 'texto_pronto' : 'whisper';
    try {
      on_log({ etapa: 'baixar', name: arq.name, bytes: det.bytes, caminho: det.caminho });
      const buf = await drive.baixarBinario({ fileId: arq.id, cliente_id, label });
      on_log({ etapa: 'baixou', bytes: buf.length });

      let texto, chars, chunks = null, duracao_segundos = null;
      if (caminhoTextoPronto) {
        // CAMINHO B: transcricao pronta — pula Whisper
        let raw = buf.toString('utf8');
        // Se for SRT/VTT, limpa timestamps
        const lower = (arq.name || '').toLowerCase();
        if (lower.endsWith('.srt') || lower.endsWith('.vtt')) {
          raw = limparSrtVtt(raw);
        }
        texto = raw;
        chars = texto.length;
        on_log({ etapa: 'texto_pronto', chars });
      } else {
        // CAMINHO A: midia bruta — Whisper
        on_log({ etapa: 'transcrever', name: arq.name });
        const t = await transcreverMidia({
          arquivo_buffer: buf,
          filename: arq.name,
          language: 'pt',
          on_progress: (p) => on_log({ etapa: 'transcrever_progresso', ...p }),
        });
        texto = t.texto;
        chars = t.texto.length;
        chunks = t.chunks;
        duracao_segundos = t.duracao_segundos;
        on_log({ etapa: 'transcreveu', chars, chunks, duracao_segundos });
      }

      // 4. Salva em cerebro_fontes via REST API
      const fonteRow = await db.inserirFonteRest({
        cerebro_id,
        tipo: tipo_fonte,
        titulo: arq.name,
        origem: 'google_drive',
        url: arq.webViewLink || '',
        conteudo_md: texto,
      });
      const fonteId = fonteRow.id;

      // 4.5. Vetoriza (REGRA DURA — sem isso, fonte fica invisivel pros agentes)
      const vetR = await vetorizarFonte(fonteId);
      on_log({ etapa: 'vetorizado', ok: vetR.ok, chunks: vetR.chunks, erro: vetR.erro });

      // 5. Marca em fontes_processadas
      await db.rodarSQL(`
        INSERT INTO pinguim.fontes_processadas
          (cerebro_id, categoria_slug, fonte_externa_id, fonte_origem, cerebro_fonte_id, metadata)
        VALUES (
          '${cerebro_id}'::uuid,
          ${esc(categoria_slug)},
          ${esc(arq.id)},
          'google_drive',
          '${fonteId}'::uuid,
          ${esc(JSON.stringify({ name: arq.name, mime: arq.mimeType, bytes: det.bytes, chunks, duracao_segundos, chars, caminho: det.caminho }))}::jsonb
        )
        ON CONFLICT DO NOTHING;
      `);

      det.ok = true;
      det.cerebro_fonte_id = fonteId;
      det.chars = chars;
      det.chunks = chunks;
      det.duracao_segundos = duracao_segundos;
      novos_ok++;
      on_log({ etapa: 'salvou', cerebro_fonte_id: fonteId });
    } catch (e) {
      det.erro = e.message || String(e);
      falhas++;
      on_log({ etapa: 'falha', name: arq.name, erro: det.erro });
    }
    detalhes.push(det);
  }

  on_log({ etapa: 'fim', novos_ok, falhas });

  // Marca o plano (Andre 2026-06-20).
  const statusRun = falhas > 0 && novos_ok === 0 ? 'falha' : 'ok';
  await db.marcarPlanoExecutado({ cerebro_id, categoria_slug, status: statusRun });

  return {
    total_listados: arquivos.length,
    midias_encontradas: midias.length,
    ja_processados: setProc.size,
    novos: novos_ok,
    falhas,
    detalhes,
  };
}

// Helper de escape SQL (mesmo padrao do db.js)
function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { ingerirPastaDrive };
