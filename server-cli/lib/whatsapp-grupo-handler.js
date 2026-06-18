// ============================================================
// whatsapp-grupo-handler.js — V1 (2026-06-18)
// ============================================================
// Recebe payload do webhook Evolution (event=messages.upsert) e salva
// em pinguim.whatsapp_msgs_brutas APENAS se for de grupo monitorado.
//
// Filtragem:
// - Sem chat_id de grupo (@g.us) -> ignora.
// - chat_id nao cadastrado em whatsapp_grupos_monitorados -> ignora.
// - Eh do proprio bot (fromMe=true) -> ignora.
//
// Parse:
// - texto: messages[].message.conversation OR extendedTextMessage.text
// - imagem/video/audio/document/sticker: tipo + caption (se houver)
// - reply: contextInfo.quotedMessage + participant
// ============================================================

const db = require('./db');

const TIPOS_MSG = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
  locationMessage: 'location',
};

function _esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function _detectarTipo(message) {
  if (!message) return { tipo: 'unknown', texto: null, caption: null };
  for (const k of Object.keys(message)) {
    if (TIPOS_MSG[k]) {
      const tipo = TIPOS_MSG[k];
      const sub = message[k];
      if (tipo === 'text') {
        const texto = typeof sub === 'string' ? sub : (sub.text || null);
        return { tipo, texto, caption: null };
      }
      if (tipo === 'image' || tipo === 'video' || tipo === 'document') {
        return { tipo, texto: null, caption: sub.caption || null };
      }
      return { tipo, texto: null, caption: null };
    }
  }
  return { tipo: 'unknown', texto: null, caption: null };
}

function _extrairReply(message) {
  const contextInfo = message?.extendedTextMessage?.contextInfo
    || message?.imageMessage?.contextInfo
    || message?.videoMessage?.contextInfo
    || message?.audioMessage?.contextInfo
    || message?.documentMessage?.contextInfo;
  if (!contextInfo || !contextInfo.quotedMessage) return null;

  const q = contextInfo.quotedMessage;
  let preview = null;
  if (q.conversation) preview = q.conversation;
  else if (q.extendedTextMessage?.text) preview = q.extendedTextMessage.text;
  else if (q.imageMessage) preview = '[imagem]' + (q.imageMessage.caption ? ': ' + q.imageMessage.caption : '');
  else if (q.audioMessage) preview = '[audio]';
  else if (q.videoMessage) preview = '[video]' + (q.videoMessage.caption ? ': ' + q.videoMessage.caption : '');
  else if (q.documentMessage) preview = '[documento]';
  return {
    reply_to_message_id: contextInfo.stanzaId || null,
    reply_to_autor: contextInfo.participant || null,
    reply_to_preview: preview ? preview.slice(0, 200) : null,
  };
}

/**
 * Processa 1 payload de webhook Evolution event=messages.upsert.
 * Retorna { acao, motivo, msg_id? } com:
 *   acao: 'ignorado' | 'salvo' | 'duplicado' | 'erro'
 */
async function processarWebhookEvolution(payload) {
  try {
    // Payload da Evolution v2: { event, instance, data: { key, message, pushName, messageTimestamp, ... } }
    const data = payload?.data || payload;
    const key = data?.key || {};
    const chat_id = key.remoteJid;
    const message_id = key.id;
    const fromMe = key.fromMe === true;
    const participant = key.participant || null;

    // 1) Filtros rapidos
    if (!chat_id || !message_id) return { acao: 'ignorado', motivo: 'sem chat_id ou message_id' };
    if (!chat_id.endsWith('@g.us')) return { acao: 'ignorado', motivo: 'nao eh grupo' };
    if (fromMe) return { acao: 'ignorado', motivo: 'mensagem do proprio bot' };

    // 2) Confere se o grupo eh monitorado
    const grupo = await db.rodarSQL(`
      SELECT id, ativo FROM pinguim.whatsapp_grupos_monitorados
      WHERE chat_id = ${_esc(chat_id)} AND ativo = true
      LIMIT 1;
    `);
    if (!grupo || !grupo[0]) return { acao: 'ignorado', motivo: 'grupo nao monitorado' };

    // 3) Parse da msg
    const message = data.message || {};
    const { tipo, texto, caption } = _detectarTipo(message);
    const reply = _extrairReply(message);
    const pushName = data.pushName || null;
    const tsUnix = data.messageTimestamp || data.timestamp;
    const enviadaEm = tsUnix
      ? new Date((typeof tsUnix === 'number' ? tsUnix : parseInt(tsUnix, 10)) * 1000).toISOString()
      : new Date().toISOString();

    // 4) Insere (idempotente via UNIQUE chat_id+message_id)
    const r = await db.rodarSQL(`
      INSERT INTO pinguim.whatsapp_msgs_brutas
        (chat_id, message_id, autor_telefone, autor_push_name,
         tipo_msg, texto, caption,
         reply_to_message_id, reply_to_autor, reply_to_preview,
         enviada_em, payload_raw)
      VALUES (
        ${_esc(chat_id)},
        ${_esc(message_id)},
        ${_esc(participant)},
        ${_esc(pushName)},
        ${_esc(tipo)},
        ${_esc(texto)},
        ${_esc(caption)},
        ${_esc(reply?.reply_to_message_id || null)},
        ${_esc(reply?.reply_to_autor || null)},
        ${_esc(reply?.reply_to_preview || null)},
        ${_esc(enviadaEm)},
        ${_esc(JSON.stringify(payload).slice(0, 50000))}::jsonb
      )
      ON CONFLICT (chat_id, message_id) DO NOTHING
      RETURNING id;
    `);
    if (r && r[0]) return { acao: 'salvo', msg_id: r[0].id, tipo };
    return { acao: 'duplicado', motivo: 'message_id ja existe' };
  } catch (e) {
    console.error('[whatsapp-grupo-handler]', e.message);
    return { acao: 'erro', motivo: e.message };
  }
}

module.exports = { processarWebhookEvolution };
