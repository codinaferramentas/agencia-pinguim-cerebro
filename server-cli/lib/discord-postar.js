// ============================================================
// discord-postar.js — V2.14 D Categoria L (Cross-canal)
// ============================================================
// Atendente posta mensagem em canal Discord. Usado quando sócio pede
// "marca o X no #suporte e pede tal coisa" no WhatsApp.
//
// Reusa instância singleton do discord-bot (mesma conexão Gateway ativa).
// Camada B anti-duplicação (60s) — mesma proteção do gmail/whatsapp.
// ============================================================

const db = require('./db');

let _botInstancia = null;
function setBotInstancia(bot) { _botInstancia = bot; }
function getBotInstancia() { return _botInstancia; }

async function postarEmCanal({ canal_id, texto, reply_to_message_id = null }) {
  if (!_botInstancia) throw new Error('discord-bot nao inicializado');
  if (!_botInstancia.enviarMensagem) throw new Error('discord-bot sem metodo enviarMensagem (versao antiga?)');
  if (!canal_id) throw new Error('canal_id obrigatorio');
  if (!texto) throw new Error('texto obrigatorio');
  return await _botInstancia.enviarMensagem(canal_id, texto, { reply_to_message_id });
}

// V2.14 D — Caminho 1: apagar mensagem do próprio bot
async function apagarMensagem({ canal_id, message_id }) {
  if (!_botInstancia) throw new Error('discord-bot nao inicializado');
  return await _botInstancia.apagarMensagem(canal_id, message_id);
}

// V2.14 D — Caminho 1: editar mensagem do próprio bot
async function editarMensagem({ canal_id, message_id, texto }) {
  if (!_botInstancia) throw new Error('discord-bot nao inicializado');
  return await _botInstancia.editarMensagem(canal_id, message_id, texto);
}

// Helper: acha última mensagem do bot num canal (ou em geral)
async function ultimaMensagemDoBot({ canal_id = null } = {}) {
  if (!_botInstancia) throw new Error('discord-bot nao inicializado');
  if (canal_id) return await _botInstancia.ultimaMensagemDoBotNoCanal(canal_id);
  const lista = await _botInstancia.ultimasMensagensDoBot(1);
  return Array.isArray(lista) && lista[0] ? lista[0] : null;
}

async function ultimasMensagensDoBot({ limite = 5 } = {}) {
  if (!_botInstancia) throw new Error('discord-bot nao inicializado');
  return await _botInstancia.ultimasMensagensDoBot(limite);
}

// Resolve nome de canal → id (cache do bot tem mapa)
function resolverCanalPorNome(nome) {
  if (!_botInstancia || !_botInstancia.canalNomes) return null;
  for (const [id, info] of _botInstancia.canalNomes.entries()) {
    if (info && info.nome && info.nome.toLowerCase() === String(nome).toLowerCase().replace(/^#/, '')) {
      return { id, nome: info.nome, tipo: info.tipo };
    }
  }
  return null;
}

// Resolve nome Discord → user_id (usa pinguim.discord_autorizados pra time interno)
async function resolverUsuarioPorNome(nome) {
  const sql = `
    SELECT discord_user_id, nome_discord, papel, socio_slug
      FROM pinguim.discord_autorizados
     WHERE LOWER(nome_discord) ILIKE LOWER('%' || ${escSql(nome)} || '%')
       AND ativo = true
     ORDER BY nome_discord
     LIMIT 5;
  `;
  return await db.rodarSQL(sql);
}

function escSql(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

module.exports = {
  setBotInstancia,
  getBotInstancia,
  postarEmCanal,
  apagarMensagem,
  editarMensagem,
  ultimaMensagemDoBot,
  ultimasMensagensDoBot,
  resolverCanalPorNome,
  resolverUsuarioPorNome,
};
