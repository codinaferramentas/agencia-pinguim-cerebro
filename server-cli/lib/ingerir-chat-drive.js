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
const enriquecedores = require('./enriquecedores');
const { vetorizarFonte } = require('./vetorizar-fonte');

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

      // Limpa caracteres que quebram serializacao JSON do postgres/PostgREST:
      //   - control chars (mantem \t \n \r)
      //   - surrogates UTF-16 nao-pareados (comum em emojis quebrados do export iOS)
      // Bug pego em 2026-06-16 com 2 chats que falharam vetorizacao.
      const tamOriginal = texto.length;
      texto = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      // Remove surrogates orfaos (high sem low ou vice-versa)
      texto = texto.replace(/[\uD800-\uDFFF]/g, (match, offset, str) => {
        const code = match.charCodeAt(0);
        // High surrogate: precisa de low na sequencia
        if (code >= 0xD800 && code <= 0xDBFF) {
          const next = str.charCodeAt(offset + 1);
          if (next >= 0xDC00 && next <= 0xDFFF) return match; // par valido
          return '';
        }
        // Low surrogate: precisa de high antes
        const prev = str.charCodeAt(offset - 1);
        if (prev >= 0xD800 && prev <= 0xDBFF) return match;
        return '';
      });
      if (texto.length !== tamOriginal) {
        on_log({ etapa: 'limpou_chars_invalidos', removidos: tamOriginal - texto.length });
      }

      if (!texto || texto.length < 50) {
        throw new Error(`conteudo vazio ou muito curto (${texto?.length || 0} chars)`);
      }

      const estatisticas = _estatisticasChatWhatsapp(texto);
      on_log({ etapa: 'estatisticas', ...estatisticas });

      // 4. Salva em cerebro_fontes via REST (payload grande quebra Management API SQL inline)
      const novo = await db.inserirFonteRest({
        cerebro_id,
        tipo: tipo_fonte,
        titulo: arq.name,
        origem: 'google_drive',
        url: arq.webViewLink || '',
        conteudo_md: texto,
      });
      const fonteId = novo.id;

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

      // 6. Vetoriza (REGRA DURA — sem isso, fonte fica invisivel pros agentes)
      const vetR = await vetorizarFonte(fonteId);
      on_log({ etapa: 'vetorizado', ok: vetR.ok, chunks: vetR.chunks, erro: vetR.erro });

      // 7. Aplica camada de enriquecedores (LLM extrai perfis estruturados, conceitos, etc)
      const msgsParseadas = _parsearMensagensWhatsapp(texto);
      const enriqResultados = await enriquecedores.aplicarEnriquecedores({
        cerebro_id,
        cerebro_fonte_id: fonteId,
        tipo_fonte: 'chat_export',
        texto,
        extras: { msgs: msgsParseadas },
        on_log: (ev) => on_log({ etapa: 'enriquecedor', ...ev }),
      });

      det.ok = true;
      det.cerebro_fonte_id = fonteId;
      det.chars = texto.length;
      det.estatisticas = estatisticas;
      det.vetorizado = vetR.ok;
      det.enriquecedores = enriqResultados;
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

// Parseia mensagens do WhatsApp export. Suporta 2 formatos:
//  1) iOS/macOS: "[DD/MM/AAAA, HH:MM:SS] Autor: msg"
//  2) Android BR: "DD/MM/AAAA HH:MM - Autor: msg"
// Retorna lista estruturada de { data, hora, autor, texto, eh_sistema }
function _parsearMensagensWhatsapp(texto) {
  const linhas = texto.split('\n');
  const REGEX_IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+?):\s*(.*)$/;
  const REGEX_ANDROID = /^(\d{1,2}\/\d{1,2}\/\d{2,4})[\s,]+(\d{1,2}:\d{2}(?::\d{2})?)\s*[-]\s*([^:]+?):\s*(.*)$/;

  const msgs = [];
  let atual = null;
  for (const linha of linhas) {
    const limpa = linha.replace(/‎|‏/g, ''); // remove LRM/RLM marks que WhatsApp insere
    const m = limpa.match(REGEX_IOS) || limpa.match(REGEX_ANDROID);
    if (m) {
      // commit anterior
      if (atual) msgs.push(atual);
      const autor = m[3].trim();
      const txt = (m[4] || '').trim();
      const ehSistema = _ehLinhaSistema(autor, txt);
      atual = { data: m[1], hora: m[2], autor, texto: txt, eh_sistema: ehSistema };
    } else if (atual && limpa.trim()) {
      // continuacao de mensagem multilinha
      atual.texto += '\n' + limpa.trim();
    }
  }
  if (atual) msgs.push(atual);
  return msgs;
}

// Detecta linhas de sistema do WhatsApp (entrou no grupo, mudou descricao, etc)
function _ehLinhaSistema(autor, texto) {
  if (/criptografia de ponta a ponta/i.test(texto)) return true;
  if (/criou o grupo/i.test(texto)) return true;
  if (/adicionou voc[êe]/i.test(texto)) return true;
  if (/mudou as configura/i.test(texto)) return true;
  if (/mudou a descri/i.test(texto)) return true;
  if (/voc[êe] agora [eé] um admin/i.test(texto)) return true;
  if (/adicionou /i.test(texto) && /\b(Adm|Bot)\b/.test(autor)) return true;
  if (/saiu/i.test(texto) && texto.length < 50) return true;
  if (/removeu/i.test(texto)) return true;
  if (/\bmensagem apagada\b/i.test(texto)) return true;
  if (autor === texto.split(':')[0]) return true; // self-ref tipico de evento
  return false;
}

// Estatisticas basicas do export WhatsApp pra metadata.
function _estatisticasChatWhatsapp(texto) {
  const linhas = texto.split('\n');
  const msgs = _parsearMensagensWhatsapp(texto);
  const msgsReais = msgs.filter(m => !m.eh_sistema);
  const autores = new Set(msgsReais.map(m => m.autor));
  return {
    total_linhas: linhas.length,
    total_msgs: msgs.length,
    total_msgs_reais: msgsReais.length,
    autores_distintos: autores.size,
    primeira_data: msgs[0]?.data || null,
    ultima_data: msgs[msgs.length - 1]?.data || null,
  };
}

// (Funcao _extrairPerfisAlunos removida — agora vive em enriquecedores/extrator-perfis-chat.js
//  como modelo plugavel que usa LLM em vez de regex hardcoded)

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { ingerirChatPastaDrive };
