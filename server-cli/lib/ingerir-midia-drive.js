// ============================================================
// ingerir-midia-drive.js — V3 (2026-06-16)
// ============================================================
// Lib GENERICA. Recebe { cerebro_id, categoria_slug, pasta_drive_id } e:
//
//   1) Lista arquivos da pasta no Drive (filtra video/* + audio/*)
//   2) Pra cada arquivo NAO processado ainda (lookup em fontes_processadas):
//      2a) Baixa binario do Drive
//      2b) Chama transcreverMidia (extrai audio, chunks, Whisper)
//      2c) Insere linha em cerebro_fontes (tipo='transcricao_midia')
//      2d) Marca em fontes_processadas (idempotencia)
//   3) Devolve relatorio: total processados, novos, falhas
//
// Reutilizavel pra: aulas Zoom, calls de venda, podcasts internos, qualquer
// pasta de Drive com midia.
// ============================================================

const drive = require('./google-drive-content');
const db = require('./db');
const { transcreverMidia } = require('./transcrever-midia');

// IDs canonicos (mesmo padrao do db.js)
const TENANT_ID_PINGUIM = '00000000-0000-0000-0000-000000000001';

const MIME_VIDEO = ['video/'];
const MIME_AUDIO = ['audio/'];

function ehMidiaCanal(mime) {
  return MIME_VIDEO.some(p => mime.startsWith(p)) || MIME_AUDIO.some(p => mime.startsWith(p));
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

  // 1. Lista arquivos
  const arquivos = await drive.listarArquivosDaPasta({
    pastaId: pasta_drive_id,
    cliente_id, label,
  });
  const midias = arquivos.filter(a => ehMidiaCanal(a.mimeType || ''));
  on_log({ etapa: 'listou', total: arquivos.length, midias: midias.length });

  if (midias.length === 0) {
    return { total_listados: arquivos.length, ja_processados: 0, novos: 0, falhas: 0, detalhes: [] };
  }

  // 2. Filtra ja processados via fontes_processadas
  const ids = midias.map(m => `'${m.id}'`).join(',');
  const jaProc = await db.rodarSQL(
    `SELECT fonte_externa_id FROM pinguim.fontes_processadas
     WHERE cerebro_id = '${cerebro_id}'::uuid
       AND categoria_slug = '${categoria_slug}'
       AND fonte_origem = 'google_drive'
       AND fonte_externa_id IN (${ids})`
  );
  const setProc = new Set((jaProc || []).map(r => r.fonte_externa_id));
  const novos = midias.filter(m => !setProc.has(m.id));
  on_log({ etapa: 'filtrou', ja_processados: setProc.size, novos: novos.length });

  // 3. Pra cada novo: baixa, transcreve, salva
  const detalhes = [];
  let falhas = 0;
  let novos_ok = 0;
  for (const arq of novos) {
    const det = { drive_file_id: arq.id, name: arq.name, mime: arq.mimeType, bytes: parseInt(arq.size || 0, 10), ok: false };
    try {
      on_log({ etapa: 'baixar', name: arq.name, bytes: det.bytes });
      const buf = await drive.baixarBinario({ fileId: arq.id, cliente_id, label });
      on_log({ etapa: 'baixou', bytes: buf.length });

      on_log({ etapa: 'transcrever', name: arq.name });
      const t = await transcreverMidia({
        arquivo_buffer: buf,
        filename: arq.name,
        language: 'pt',
        on_progress: (p) => on_log({ etapa: 'transcrever_progresso', ...p }),
      });
      on_log({ etapa: 'transcreveu', chars: t.texto.length, chunks: t.chunks, duracao_segundos: t.duracao_segundos });

      // 4. Salva em cerebro_fontes
      const fonteRow = await db.rodarSQL(`
        INSERT INTO pinguim.cerebro_fontes
          (tenant_id, cerebro_id, tipo, titulo, origem, url, conteudo, criado_em)
        VALUES (
          '${TENANT_ID_PINGUIM}'::uuid,
          '${cerebro_id}'::uuid,
          '${tipo_fonte}',
          ${esc(arq.name)},
          'google_drive',
          ${esc(arq.webViewLink || '')},
          ${esc(t.texto)},
          now()
        )
        RETURNING id;
      `);
      const fonteId = fonteRow[0].id;

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
          ${esc(JSON.stringify({ name: arq.name, mime: arq.mimeType, bytes: det.bytes, chunks: t.chunks, duracao_segundos: t.duracao_segundos, chars: t.texto.length }))}::jsonb
        )
        ON CONFLICT DO NOTHING;
      `);

      det.ok = true;
      det.cerebro_fonte_id = fonteId;
      det.chars = t.texto.length;
      det.chunks = t.chunks;
      det.duracao_segundos = t.duracao_segundos;
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
