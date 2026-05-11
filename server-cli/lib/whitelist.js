// ============================================================
// whitelist.js — V2.14 D Categoria I (WhatsApp WHITELIST)
// ============================================================
// Atendente Pinguim só responde números em pinguim.whatsapp_socios ativos.
// Cache RAM 60s — alivia banco em pico de mensagens.
// Tabelas: pinguim.whatsapp_socios   (canônica — fonte de verdade)
//          pinguim.whatsapp_bloqueados (log de tentativas)
// V2.14.5 — consolidado da whatsapp_autorizados (errada, dropada 2026-05-11).
// ============================================================

const db = require('./db');

const _cache = {
  numeros: new Map(),  // numero → {socio_slug, rotulo, cliente_id}
  carregado_em_ms: 0,
};
const CACHE_TTL_MS = 60 * 1000;

function normalizarNumero(numero) {
  if (!numero) return '';
  return String(numero).replace(/\D/g, '');
}

async function recarregarCache() {
  const r = await db.rodarSQL(`
    SELECT numero, socio_slug, apelido AS rotulo, cliente_id
      FROM pinguim.whatsapp_socios
     WHERE ativo = true;
  `);
  _cache.numeros.clear();
  if (Array.isArray(r)) {
    for (const row of r) {
      _cache.numeros.set(row.numero, {
        socio_slug: row.socio_slug,
        rotulo: row.rotulo,
        cliente_id: row.cliente_id,
      });
    }
  }
  _cache.carregado_em_ms = Date.now();
  return _cache.numeros.size;
}

async function obterCache() {
  if (Date.now() - _cache.carregado_em_ms > CACHE_TTL_MS || _cache.numeros.size === 0) {
    await recarregarCache();
  }
  return _cache.numeros;
}

// Decide se mensagem pode passar. Retorna {autorizado, socio_slug, rotulo, cliente_id}.
async function checarNumero(numero) {
  const norm = normalizarNumero(numero);
  if (!norm) return { autorizado: false, socio_slug: null, rotulo: null, cliente_id: null };
  const cache = await obterCache();
  const hit = cache.get(norm);
  if (hit) return { autorizado: true, ...hit };
  return { autorizado: false, socio_slug: null, rotulo: null, cliente_id: null };
}

// Loga tentativa de número não-autorizado pra auditoria
async function logarBloqueio({ numero, push_name, texto, evento, raw_payload }) {
  const norm = normalizarNumero(numero);
  const sql = `
    INSERT INTO pinguim.whatsapp_bloqueados (numero, push_name, texto_resumido, evento, raw_payload)
    VALUES (
      ${escSql(norm)},
      ${push_name ? escSql(push_name) : 'NULL'},
      ${texto ? escSql(String(texto).slice(0, 200)) : 'NULL'},
      ${evento ? escSql(evento) : 'NULL'},
      ${raw_payload ? `'${JSON.stringify(raw_payload).replace(/'/g, "''")}'::jsonb` : 'NULL'}
    );
  `;
  try { await db.rodarSQL(sql); } catch (e) { console.warn('[whitelist] falha log bloqueio:', e.message); }
}

function escSql(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// CRUD admin (usado pelos scripts shell)
async function autorizar({ numero, socio_slug, rotulo, observacao = '', cliente_id }) {
  const norm = normalizarNumero(numero);
  if (!norm) throw new Error('numero invalido');
  if (!rotulo) throw new Error('rotulo obrigatorio (vai gravado em apelido)');

  // Resolve cliente_id: prioridade arg → busca por socio_slug → fallback Codina (NOT NULL no schema)
  let cid = cliente_id;
  if (!cid) {
    if (socio_slug) {
      const r = await db.rodarSQL(`SELECT cliente_id FROM pinguim.socios WHERE slug = ${escSql(socio_slug)} AND ativo = true LIMIT 1;`);
      cid = Array.isArray(r) && r[0] ? r[0].cliente_id : null;
    }
    if (!cid) {
      // Fallback: cliente_id do Codina (convidado/teste sem sócio fixo)
      const r = await db.rodarSQL(`SELECT cliente_id FROM pinguim.socios WHERE slug = 'codina' LIMIT 1;`);
      cid = Array.isArray(r) && r[0] ? r[0].cliente_id : null;
    }
  }
  if (!cid) throw new Error('cliente_id nao resolvido (verifique pinguim.socios)');

  const sql = `
    INSERT INTO pinguim.whatsapp_socios (numero, cliente_id, socio_slug, apelido, observacao, ativo)
    VALUES (${escSql(norm)}, '${cid}'::uuid, ${socio_slug ? escSql(socio_slug) : 'NULL'}, ${escSql(rotulo)}, ${escSql(observacao)}, true)
    ON CONFLICT (numero) DO UPDATE SET
      cliente_id = EXCLUDED.cliente_id,
      socio_slug = EXCLUDED.socio_slug,
      apelido = EXCLUDED.apelido,
      observacao = EXCLUDED.observacao,
      ativo = true,
      atualizado_em = now()
    RETURNING numero, socio_slug, apelido AS rotulo, ativo;
  `;
  const r = await db.rodarSQL(sql);
  await recarregarCache();
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function revogar({ numero }) {
  const norm = normalizarNumero(numero);
  const sql = `
    UPDATE pinguim.whatsapp_socios
       SET ativo = false, atualizado_em = now()
     WHERE numero = ${escSql(norm)}
    RETURNING numero, apelido AS rotulo, ativo;
  `;
  const r = await db.rodarSQL(sql);
  await recarregarCache();
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function listar({ apenas_ativos = true } = {}) {
  const where = apenas_ativos ? 'WHERE ativo = true' : '';
  const sql = `
    SELECT numero, socio_slug, apelido AS rotulo, ativo, observacao, criado_em
      FROM pinguim.whatsapp_socios ${where}
     ORDER BY apelido;
  `;
  return await db.rodarSQL(sql);
}

async function listarBloqueios({ horas = 168, limite = 50 } = {}) {
  const sql = `
    SELECT numero, push_name, texto_resumido, criado_em
      FROM pinguim.whatsapp_bloqueados
     WHERE criado_em >= now() - interval '${parseInt(horas, 10)} hours'
     ORDER BY criado_em DESC
     LIMIT ${parseInt(limite, 10)};
  `;
  return await db.rodarSQL(sql);
}

module.exports = {
  normalizarNumero,
  checarNumero,
  logarBloqueio,
  autorizar,
  revogar,
  listar,
  listarBloqueios,
  recarregarCache,
};
