// ============================================================
// whitelist-discord.js — V2.14 D Discord Whitelist
// ============================================================
// Discord tem 2 papéis (ajuste pos-feedback Andre 2026-05-11):
//   socio        — Codina/Pedro/Micha/Luiz — todas tools
//   funcionario  — qualquer membro do server Pinguim (Rafa, Djairo, tutores,
//                  comerciais, etc) — escopo operacional Categoria K
//
// Fallback automático: server Pinguim é fechado por convite, qualquer membro
// que marcar o bot é auto-cadastrado como funcionario (lib/discord-bot.js).
//
// Captura automática: quando Discord_user_id NÃO está cadastrado e marca o bot,
// log silencioso em discord_bloqueados + warn no console pra Andre autorizar manual.
//
// Permissões: lib/permissoes.js define o mapa role → tools.
// ============================================================

const db = require('./db');

const _cache = {
  users: new Map(),  // discord_user_id → {papel, socio_slug, cliente_id, nome, permissoes}
  carregado_em_ms: 0,
};
const CACHE_TTL_MS = 60 * 1000;

async function recarregarCache() {
  const r = await db.rodarSQL(`
    SELECT discord_user_id, papel, socio_slug, cliente_id, nome_discord, permissoes
      FROM pinguim.discord_autorizados
     WHERE ativo = true;
  `);
  _cache.users.clear();
  if (Array.isArray(r)) {
    for (const row of r) {
      _cache.users.set(row.discord_user_id, {
        papel: row.papel,
        socio_slug: row.socio_slug,
        cliente_id: row.cliente_id,
        nome: row.nome_discord,
        permissoes: row.permissoes,
      });
    }
  }
  _cache.carregado_em_ms = Date.now();
  return _cache.users.size;
}

async function obterCache() {
  if (Date.now() - _cache.carregado_em_ms > CACHE_TTL_MS || _cache.users.size === 0) {
    await recarregarCache();
  }
  return _cache.users;
}

// Decide se usuário pode falar com bot. Retorna {autorizado, papel, socio_slug, cliente_id, nome, permissoes}.
async function checarUsuario(discord_user_id) {
  if (!discord_user_id) return { autorizado: false };
  const cache = await obterCache();
  const hit = cache.get(discord_user_id);
  if (hit) return { autorizado: true, ...hit };
  return { autorizado: false };
}

// Loga tentativa não-autorizada
async function logarBloqueio({ discord_user_id, nome_discord, canal_id, canal_nome, texto }) {
  const sql = `
    INSERT INTO pinguim.discord_bloqueados (discord_user_id, nome_discord, canal_id, canal_nome, texto_resumido)
    VALUES (
      ${escSql(discord_user_id)},
      ${nome_discord ? escSql(nome_discord) : 'NULL'},
      ${canal_id ? escSql(canal_id) : 'NULL'},
      ${canal_nome ? escSql(canal_nome) : 'NULL'},
      ${texto ? escSql(String(texto).slice(0, 200)) : 'NULL'}
    );
  `;
  try { await db.rodarSQL(sql); } catch (e) { console.warn('[discord-whitelist] falha log bloqueio:', e.message); }
}

function escSql(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// CRUD admin
async function autorizar({ discord_user_id, papel, nome_discord, socio_slug = null, observacao = '' }) {
  if (!discord_user_id) throw new Error('discord_user_id obrigatorio');
  if (!papel || !['socio', 'funcionario'].includes(papel)) {
    throw new Error('papel obrigatorio (socio|funcionario)');
  }
  if (!nome_discord) throw new Error('nome_discord obrigatorio');

  let cliente_id = null;
  if (papel === 'socio') {
    if (!socio_slug) throw new Error('socio_slug obrigatorio quando papel=socio');
    const r = await db.rodarSQL(`SELECT cliente_id FROM pinguim.socios WHERE slug = ${escSql(socio_slug)} AND ativo = true LIMIT 1;`);
    if (!Array.isArray(r) || !r[0]) throw new Error(`socio_slug ${socio_slug} nao encontrado em pinguim.socios`);
    cliente_id = r[0].cliente_id;
  }

  const sql = `
    INSERT INTO pinguim.discord_autorizados (discord_user_id, papel, socio_slug, cliente_id, nome_discord, observacao, ativo)
    VALUES (${escSql(discord_user_id)}, ${escSql(papel)}, ${socio_slug ? escSql(socio_slug) : 'NULL'}, ${cliente_id ? `'${cliente_id}'::uuid` : 'NULL'}, ${escSql(nome_discord)}, ${escSql(observacao)}, true)
    ON CONFLICT (discord_user_id) DO UPDATE SET
      papel = EXCLUDED.papel,
      socio_slug = EXCLUDED.socio_slug,
      cliente_id = EXCLUDED.cliente_id,
      nome_discord = EXCLUDED.nome_discord,
      observacao = EXCLUDED.observacao,
      ativo = true,
      atualizado_em = now()
    RETURNING discord_user_id, papel, socio_slug, nome_discord, ativo;
  `;
  const r = await db.rodarSQL(sql);
  await recarregarCache();
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function revogar({ discord_user_id }) {
  const sql = `
    UPDATE pinguim.discord_autorizados
       SET ativo = false, atualizado_em = now()
     WHERE discord_user_id = ${escSql(discord_user_id)}
    RETURNING discord_user_id, nome_discord, ativo;
  `;
  const r = await db.rodarSQL(sql);
  await recarregarCache();
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function listar({ apenas_ativos = true } = {}) {
  const where = apenas_ativos ? 'WHERE ativo = true' : '';
  const sql = `
    SELECT discord_user_id, papel, socio_slug, nome_discord, ativo, observacao, criado_em
      FROM pinguim.discord_autorizados ${where}
     ORDER BY papel, nome_discord;
  `;
  return await db.rodarSQL(sql);
}

async function listarBloqueios({ horas = 168, limite = 50 } = {}) {
  const sql = `
    SELECT discord_user_id, nome_discord, canal_id, canal_nome, texto_resumido, criado_em
      FROM pinguim.discord_bloqueados
     WHERE criado_em >= now() - interval '${parseInt(horas, 10)} hours'
     ORDER BY criado_em DESC
     LIMIT ${parseInt(limite, 10)};
  `;
  return await db.rodarSQL(sql);
}

module.exports = {
  checarUsuario,
  logarBloqueio,
  autorizar,
  revogar,
  listar,
  listarBloqueios,
  recarregarCache,
};
