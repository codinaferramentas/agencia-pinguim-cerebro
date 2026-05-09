// ============================================================
// evolution.js — V2.14 Frente D (WhatsApp via Evolution API)
// ============================================================
// Wrapper Evolution API v2 (auto-hospedada em evolution.agenciapinguim.com).
//
// Decisões:
// - URL + API_KEY GLOBAL vivem no cofre (DOLLAR_VOLUTION_API_URL/KEY).
// - INSTANCIA do bot Pinguim vive no cofre tambem (EVOLUTION_INSTANCE_BOT)
//   pra desacoplar codigo de nome especifico.
// - Sem dependencia externa — fetch nativo Node 18+.
// - SEM API publica de send fora do server-cli (nao expoe pra internet).
// ============================================================

const db = require('./db');

let _config = null;
async function getConfig() {
  if (_config) return _config;
  const [url, apiKey, instanceName] = await Promise.all([
    db.lerChaveSistema('EVOLUTION_API_URL', 'evolution'),
    db.lerChaveSistema('EVOLUTION_API_KEY', 'evolution'),
    db.lerChaveSistema('EVOLUTION_INSTANCE_BOT', 'evolution').catch(() => null),
  ]);
  if (!url || !apiKey) {
    throw new Error('EVOLUTION_API_URL ou EVOLUTION_API_KEY nao no cofre');
  }
  _config = {
    baseUrl: url.trim().replace(/\/+$/, ''),
    apiKey: apiKey.trim(),
    instanceBot: (instanceName || '').trim() || null,
  };
  return _config;
}

function invalidarCache() { _config = null; }

// ============================================================
// Helper de chamada — usa apikey global por padrao, ou da instancia
// ============================================================
async function evoFetch({ method = 'GET', endpoint, body = null, instanceToken = null } = {}) {
  const cfg = await getConfig();
  const url = cfg.baseUrl + endpoint;
  const headers = {
    'apikey': instanceToken || cfg.apiKey,
    'Accept': 'application/json',
  };
  const opts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  const txt = await resp.text();
  let json;
  try { json = JSON.parse(txt); } catch (_) { json = { raw: txt }; }
  if (!resp.ok) {
    const msg = json?.response?.message || json?.message || json?.error || `HTTP ${resp.status}`;
    const e = new Error(`Evolution API ${resp.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200)}`);
    e.status = resp.status; e.payload = json;
    throw e;
  }
  return json;
}

// ============================================================
// LISTAR instancias (admin)
// ============================================================
async function listarInstancias() {
  const r = await evoFetch({ endpoint: '/instance/fetchInstances' });
  return Array.isArray(r) ? r.map(i => ({
    nome: i.name,
    status: i.connectionStatus,
    owner_jid: i.ownerJid,
    profile_name: i.profileName,
    numero: i.number,
    token: i.token,
    msgs: i._count?.Message,
    contatos: i._count?.Contact,
    chats: i._count?.Chat,
    criado_em: i.createdAt,
  })) : [];
}

async function buscarInstancia(nome) {
  const r = await evoFetch({ endpoint: `/instance/fetchInstances?instanceName=${encodeURIComponent(nome)}` });
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// CONVERSAO de markdown padrao -> markdown WhatsApp
// ============================================================
// WhatsApp usa: *bold*, _italic_, ~strike~, ```mono```
// Markdown padrao: **bold**, *italic*
// Conversao prioritaria: **X** -> *X* (resolve o asterisco duplicado feio)
// Tambem remove headers (# ##) que viram literal no WhatsApp.
function paraMarkdownWhatsapp(texto) {
  if (!texto) return '';
  return texto
    // Bold padrao -> bold WhatsApp (precisa antes de italic pra nao colidir)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // Headers viram bold (## Titulo -> *Titulo*)
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    // Code inline ` ` -> WhatsApp tambem usa `
    // (mantem)
    // Remove `---` divisor (vira linha em branco)
    .replace(/^---+$/gm, '')
    // Remove caracteres de tabela GFM se vazaram
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, '')
    // Limpa multiplas quebras
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================
// ENVIAR MENSAGEM DE TEXTO
// ============================================================
// numero: pode ser '5531999900591' ou '5531999900591@s.whatsapp.net' (limpa o @)
// markdown_whatsapp: se true, converte ** -> * e remove headers (default true)
async function enviarTexto({ instancia, numero, texto, delay = 0, markdown_whatsapp = true }) {
  const cfg = await getConfig();
  const inst = instancia || cfg.instanceBot;
  if (!inst) throw new Error('Instancia nao informada e EVOLUTION_INSTANCE_BOT nao no cofre');
  if (!numero) throw new Error('numero obrigatorio');
  if (!texto) throw new Error('texto obrigatorio');

  const numeroLimpo = String(numero).replace(/@.*$/, '').replace(/\D/g, '');
  const textoFinal = markdown_whatsapp ? paraMarkdownWhatsapp(texto) : texto;

  const body = {
    number: numeroLimpo,
    text: textoFinal,
  };
  if (delay > 0) body.delay = delay;

  const r = await evoFetch({
    method: 'POST',
    endpoint: `/message/sendText/${encodeURIComponent(inst)}`,
    body,
  });
  return {
    id: r.key?.id || null,
    instancia: inst,
    para: numeroLimpo,
    enviado_em: new Date().toISOString(),
    status: r.status || 'enviado',
  };
}

// ============================================================
// ENVIAR ARQUIVO (HTML, PDF, etc) — endpoint sendMedia da Evolution
// ============================================================
// args:
//   numero, instancia, mediatype ('document'|'image'|'video'),
//   mimetype (ex: 'text/html'), filename,
//   conteudo (Buffer | string base64 | string raw)
async function enviarArquivo({ instancia, numero, mediatype = 'document', mimetype, filename, conteudo, caption = '' }) {
  const cfg = await getConfig();
  const inst = instancia || cfg.instanceBot;
  if (!inst) throw new Error('Instancia nao informada');
  if (!numero) throw new Error('numero obrigatorio');
  if (!conteudo) throw new Error('conteudo obrigatorio');

  const numeroLimpo = String(numero).replace(/@.*$/, '').replace(/\D/g, '');

  // Converte pra base64 se vier Buffer ou string raw
  let media64;
  if (Buffer.isBuffer(conteudo)) {
    media64 = conteudo.toString('base64');
  } else if (typeof conteudo === 'string') {
    // Se ja é base64, mantém; senão converte
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(conteudo) && conteudo.length % 4 === 0 && conteudo.length > 100) {
      media64 = conteudo; // já é base64
    } else {
      media64 = Buffer.from(conteudo, 'utf-8').toString('base64');
    }
  } else {
    throw new Error('conteudo precisa ser Buffer ou string');
  }

  const body = {
    number: numeroLimpo,
    mediatype,
    mimetype: mimetype || 'application/octet-stream',
    media: media64,
    fileName: filename || 'arquivo',
    caption: caption || undefined,
  };

  const r = await evoFetch({
    method: 'POST',
    endpoint: `/message/sendMedia/${encodeURIComponent(inst)}`,
    body,
  });
  return {
    id: r.key?.id || null,
    instancia: inst,
    para: numeroLimpo,
    filename: body.fileName,
    enviado_em: new Date().toISOString(),
  };
}

// ============================================================
// ENVIAR ÁUDIO (TTS) — endpoint sendWhatsAppAudio da Evolution
// Para áudio de voz (Push-to-talk style — bolinha azul no WhatsApp)
// ============================================================
async function enviarAudio({ instancia, numero, audio_base64, audio_buffer }) {
  const cfg = await getConfig();
  const inst = instancia || cfg.instanceBot;
  if (!inst) throw new Error('Instancia nao informada');
  if (!numero) throw new Error('numero obrigatorio');

  const numeroLimpo = String(numero).replace(/@.*$/, '').replace(/\D/g, '');
  let audio = audio_base64;
  if (!audio && audio_buffer) audio = Buffer.from(audio_buffer).toString('base64');
  if (!audio) throw new Error('audio_base64 ou audio_buffer obrigatorio');

  const body = {
    number: numeroLimpo,
    audio,
    encoding: true,
  };
  const r = await evoFetch({
    method: 'POST',
    endpoint: `/message/sendWhatsAppAudio/${encodeURIComponent(inst)}`,
    body,
  });
  return { id: r.key?.id || null, instancia: inst, para: numeroLimpo, enviado_em: new Date().toISOString() };
}

// ============================================================
// BAIXAR mídia recebida (áudio/imagem/etc) — Evolution armazena base64 do payload,
// mas pra áudios vale a pena chamar /chat/getBase64FromMediaMessage pra garantir
// ============================================================
async function baixarMidia({ instancia, message_id, payload_data }) {
  const cfg = await getConfig();
  const inst = instancia || cfg.instanceBot;

  // Se o payload já trouxe base64 inline, usa direto
  const m = payload_data?.message || {};
  const inlineBase64 =
    m.audioMessage?.body ||
    m.imageMessage?.body ||
    m.videoMessage?.body ||
    m.documentMessage?.body ||
    null;
  if (inlineBase64) return { base64: inlineBase64, fonte: 'inline' };

  // Caso contrário, pede pra Evolution
  const body = {
    message: {
      key: payload_data?.key || { id: message_id },
    },
  };
  const r = await evoFetch({
    method: 'POST',
    endpoint: `/chat/getBase64FromMediaMessage/${encodeURIComponent(inst)}`,
    body,
  });
  return { base64: r.base64 || r, fonte: 'api' };
}

// ============================================================
// CONFIGURAR WEBHOOK pra instancia receber eventos
// ============================================================
// Quando alguem manda msg pro numero do bot, Evolution chama nosso webhook.
// Url tipica: https://<host-publico>/api/whatsapp/webhook
async function configurarWebhook({ instancia, url, eventos = ['MESSAGES_UPSERT'] }) {
  const cfg = await getConfig();
  const inst = instancia || cfg.instanceBot;
  if (!inst) throw new Error('Instancia nao informada');
  if (!url) throw new Error('url obrigatoria');

  const body = {
    webhook: {
      enabled: true,
      url,
      headers: {},
      byEvents: false,
      base64: false,
      events: eventos,
    },
  };

  const r = await evoFetch({
    method: 'POST',
    endpoint: `/webhook/set/${encodeURIComponent(inst)}`,
    body,
  });
  return r;
}

async function pegarWebhook({ instancia }) {
  const cfg = await getConfig();
  const inst = instancia || cfg.instanceBot;
  return await evoFetch({ endpoint: `/webhook/find/${encodeURIComponent(inst)}` });
}

// ============================================================
// PARSER de payload de webhook (Evolution v2 — MESSAGES_UPSERT)
// ============================================================
// Devolve objeto normalizado pra logica do server-cli usar.
// Filtra: mensagens do proprio bot (fromMe), grupos (opcional), status updates.
function parseMensagemRecebida(payload) {
  if (!payload || !payload.data) return null;
  const d = payload.data;

  const fromMe = !!d.key?.fromMe;
  const remoteJid = d.key?.remoteJid || '';
  const isGroup = remoteJid.endsWith('@g.us');
  const isStatus = remoteJid === 'status@broadcast';

  // Extrai texto da mensagem (varios formatos possiveis)
  let texto = '';
  const m = d.message || {};
  if (m.conversation)              texto = m.conversation;
  else if (m.extendedTextMessage?.text) texto = m.extendedTextMessage.text;
  else if (m.imageMessage?.caption)     texto = m.imageMessage.caption;
  else if (m.videoMessage?.caption)     texto = m.videoMessage.caption;
  else if (m.documentMessage?.caption)  texto = m.documentMessage.caption;
  else if (m.buttonsResponseMessage?.selectedDisplayText) texto = m.buttonsResponseMessage.selectedDisplayText;
  else if (m.listResponseMessage?.title) texto = m.listResponseMessage.title;

  const tipo = m.imageMessage ? 'imagem'
             : m.videoMessage ? 'video'
             : m.audioMessage ? 'audio'
             : m.documentMessage ? 'documento'
             : m.stickerMessage ? 'sticker'
             : 'texto';

  const numeroRemetente = String(remoteJid || '').replace(/@.*$/, '');

  return {
    instancia: payload.instance || null,
    message_id: d.key?.id || null,
    from_me: fromMe,
    is_group: isGroup,
    is_status: isStatus,
    remote_jid: remoteJid,
    numero_remetente: numeroRemetente,
    push_name: d.pushName || null,
    tipo,
    texto: texto || '',
    timestamp_evt: d.messageTimestamp ? new Date(d.messageTimestamp * 1000).toISOString() : new Date().toISOString(),
    payload_bruto: d,
  };
}

module.exports = {
  getConfig,
  invalidarCache,
  listarInstancias,
  buscarInstancia,
  enviarTexto,
  enviarArquivo,
  enviarAudio,
  baixarMidia,
  configurarWebhook,
  pegarWebhook,
  parseMensagemRecebida,
  paraMarkdownWhatsapp,
};
