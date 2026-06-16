// ============================================================
// ingerir-chat-drive.js — V3 (2026-06-16)
// ============================================================
// Lib GENERICA pra ingerir chat exports (.txt do WhatsApp ou .zip) de
// uma pasta do Google Drive como fontes do cerebro.
//
// Hoje suporta:
//   - .txt  (export direto de "Exportar conversa sem midia" do WhatsApp)
//   - .zip  (export com midia — extrai _chat.txt do zip)
//
// Resto e' identico ao ingerir-midia-drive.js: idempotencia via fontes_processadas,
// salva em cerebro_fontes com tipo='chat_export'.
// ============================================================

const drive = require('./google-drive-content');
const db = require('./db');

const MIME_TEXT = ['text/'];
const MIME_ZIP = ['application/zip', 'application/x-zip-compressed'];

function ehChatCandidato(arq) {
  const mime = (arq.mimeType || '').toLowerCase();
  const name = (arq.name || '').toLowerCase();
  if (MIME_TEXT.some(p => mime.startsWith(p))) return true;
  if (MIME_ZIP.includes(mime)) return true;
  if (name.endsWith('.txt') || name.endsWith('.zip')) return true;
  return false;
}

async function ingerirChatPastaDrive({
  cerebro_id,
  categoria_slug,
  pasta_drive_id,
  cliente_id,
  label = null,
  tipo_fonte = 'chat_export',
  on_log = () => {},
}) {
  if (!cerebro_id) throw new Error('cerebro_id obrigatorio');
  if (!categoria_slug) throw new Error('categoria_slug obrigatorio');
  if (!pasta_drive_id) throw new Error('pasta_drive_id obrigatorio');

  on_log({ etapa: 'inicio', pasta_drive_id });

  // 1. Lista + filtra arquivos
  const arquivos = await drive.listarArquivosDaPasta({ pastaId: pasta_drive_id, cliente_id, label });
  const candidatos = arquivos.filter(ehChatCandidato);
  on_log({ etapa: 'listou', total: arquivos.length, candidatos: candidatos.length });

  if (candidatos.length === 0) {
    return { total_listados: arquivos.length, ja_processados: 0, novos: 0, falhas: 0, detalhes: [] };
  }

  // 2. Filtra ja processados
  const ids = candidatos.map(m => `'${m.id}'`).join(',');
  const jaProc = await db.rodarSQL(
    `SELECT fonte_externa_id FROM pinguim.fontes_processadas
     WHERE cerebro_id = '${cerebro_id}'::uuid
       AND categoria_slug = '${categoria_slug}'
       AND fonte_origem = 'google_drive'
       AND fonte_externa_id IN (${ids})`
  );
  const setProc = new Set((jaProc || []).map(r => r.fonte_externa_id));
  const novos = candidatos.filter(m => !setProc.has(m.id));
  on_log({ etapa: 'filtrou', ja_processados: setProc.size, novos: novos.length });

  // 3. Pra cada novo: baixa, extrai texto se zip, salva
  const detalhes = [];
  let falhas = 0;
  let novos_ok = 0;
  for (const arq of novos) {
    const det = { drive_file_id: arq.id, name: arq.name, mime: arq.mimeType, bytes: parseInt(arq.size || 0, 10), ok: false };
    try {
      on_log({ etapa: 'baixar', name: arq.name, bytes: det.bytes });
      const buf = await drive.baixarBinario({ fileId: arq.id, cliente_id, label });

      let texto;
      const nameLower = (arq.name || '').toLowerCase();
      if (nameLower.endsWith('.zip') || /zip/i.test(arq.mimeType || '')) {
        texto = await _extrairTxtDoZip(buf);
        on_log({ etapa: 'extraiu_zip', chars: texto.length });
      } else {
        // Trata como texto puro UTF-8
        texto = buf.toString('utf-8');
        on_log({ etapa: 'leu_txt', chars: texto.length });
      }

      if (!texto || texto.length < 50) {
        throw new Error(`conteudo vazio ou muito curto (${texto?.length || 0} chars)`);
      }

      const estatisticas = _estatisticasChatWhatsapp(texto);
      on_log({ etapa: 'estatisticas', ...estatisticas });

      // 4. Salva em cerebro_fontes
      const fonteRow = await db.rodarSQL(`
        INSERT INTO pinguim.cerebro_fontes
          (cerebro_id, tipo, titulo, origem, url, conteudo_md, criado_em)
        VALUES (
          '${cerebro_id}'::uuid,
          '${tipo_fonte}',
          ${esc(arq.name)},
          'google_drive',
          ${esc(arq.webViewLink || '')},
          ${esc(texto)},
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
          ${esc(JSON.stringify({ name: arq.name, mime: arq.mimeType, bytes: det.bytes, chars: texto.length, ...estatisticas }))}::jsonb
        )
        ON CONFLICT DO NOTHING;
      `);

      det.ok = true;
      det.cerebro_fonte_id = fonteId;
      det.chars = texto.length;
      det.estatisticas = estatisticas;
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
  return { total_listados: arquivos.length, candidatos: candidatos.length, ja_processados: setProc.size, novos: novos_ok, falhas, detalhes };
}

// ============================================================
// Helpers
// ============================================================

// Extrai _chat.txt (ou qualquer .txt) de um zip do WhatsApp.
// Usa fflate (puro JS, sem depender de ferramenta nativa).
async function _extrairTxtDoZip(buf) {
  let fflate;
  try { fflate = require('fflate'); } catch (e) {
    throw new Error('fflate nao instalado — npm install fflate no server-cli');
  }
  return await new Promise((resolve, reject) => {
    fflate.unzip(new Uint8Array(buf), (err, unzipped) => {
      if (err) return reject(new Error('zip invalido: ' + err.message));
      const txtKey = Object.keys(unzipped).find(k => /\.txt$/i.test(k)) ||
                     Object.keys(unzipped).find(k => /^_chat/i.test(k));
      if (!txtKey) return reject(new Error('zip nao contem arquivo .txt'));
      const decoder = new TextDecoder('utf-8');
      resolve(decoder.decode(unzipped[txtKey]));
    });
  });
}

// Estatisticas basicas do export WhatsApp pra metadata.
function _estatisticasChatWhatsapp(texto) {
  const linhas = texto.split('\n');
  // Padrao do export: "DD/MM/AAAA HH:MM - Autor: msg" (formato brasileiro)
  // Outros formatos: "[DD/MM/AAAA HH:MM:SS] Autor: msg" (formato iOS)
  let primeira_data = null, ultima_data = null;
  const autores = new Set();
  let total_msgs = 0;
  for (const linha of linhas) {
    const m = linha.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})[ ,]+\d{1,2}:\d{2}(?::\d{2})?[\s-]+([^:]+?):/);
    if (m) {
      total_msgs++;
      const data = m[1];
      const autor = m[2].trim();
      autores.add(autor);
      if (!primeira_data) primeira_data = data;
      ultima_data = data;
    }
  }
  return {
    total_linhas: linhas.length,
    total_msgs,
    autores_distintos: autores.size,
    primeira_data,
    ultima_data,
  };
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { ingerirChatPastaDrive };
