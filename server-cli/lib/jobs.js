// ============================================================
// jobs.js — V2.15 Fase 1 Plan-and-Execute
// Andre 2026-05-11 noite
// ============================================================
// Wrapper de CRUD em pinguim.jobs. Pinguim cria jobs quando detecta
// pedido complexo. Worker assíncrono pega aprovados e executa.
// ============================================================

const db = require('./db');

const esc = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";

// ============================================================
// Criar job em modo "rascunho" (Planner ainda vai preencher plano)
// ============================================================
async function criarJob({
  cliente_id,
  agente_id = null,
  canal_origem,
  thread_id_origem = null,
  discord_canal_id = null,
  discord_user_id = null,
  whatsapp_numero = null,
  pedido_original,
  tipo_pedido = null,
  squad_executora = null,
}) {
  const cid = await db.resolverClienteId(cliente_id);
  const sql = `
    INSERT INTO pinguim.jobs
      (cliente_id, agente_id, canal_origem, thread_id_origem,
       discord_canal_id, discord_user_id, whatsapp_numero,
       pedido_original, tipo_pedido, squad_executora, status)
    VALUES
      ('${cid}', ${agente_id ? `'${agente_id}'` : 'NULL'},
       ${esc(canal_origem)}, ${esc(thread_id_origem)},
       ${esc(discord_canal_id)}, ${esc(discord_user_id)}, ${esc(whatsapp_numero)},
       ${esc(pedido_original)}, ${esc(tipo_pedido)}, ${esc(squad_executora)},
       'rascunho')
    RETURNING id, criado_em
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Atualizar plano + colocar status=aguardando_aprovacao
// ============================================================
async function gravarPlano({ job_id, plano_json, briefing_resumo, tipo_pedido = null, squad_executora = null }) {
  const planoStr = JSON.stringify(plano_json).replace(/'/g, "''");
  const camposExtras = [];
  if (tipo_pedido) camposExtras.push(`tipo_pedido = ${esc(tipo_pedido)}`);
  if (squad_executora) camposExtras.push(`squad_executora = ${esc(squad_executora)}`);
  const extras = camposExtras.length ? ', ' + camposExtras.join(', ') : '';
  const sql = `
    UPDATE pinguim.jobs
       SET plano_json = '${planoStr}'::jsonb,
           briefing_resumo = ${esc(briefing_resumo)},
           status = 'aguardando_aprovacao'${extras}
     WHERE id = '${job_id}'
    RETURNING id, status, briefing_resumo
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Aprovar job (sócio respondeu "sim") — vira fila pro worker
// ============================================================
async function aprovarJob({ job_id }) {
  const sql = `
    UPDATE pinguim.jobs
       SET status = 'aprovado',
           aprovado_em = now()
     WHERE id = '${job_id}' AND status = 'aguardando_aprovacao'
    RETURNING id, status, aprovado_em
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function cancelarJob({ job_id, motivo = null }) {
  const sql = `
    UPDATE pinguim.jobs
       SET status = 'cancelado',
           erro_motivo = ${esc(motivo)},
           concluido_em = now()
     WHERE id = '${job_id}' AND status IN ('rascunho', 'aguardando_aprovacao')
    RETURNING id, status
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Worker pega 1 job aprovado (atomicamente — UPDATE...RETURNING)
// Marca executando + retorna o job pra trabalhar
// ============================================================
async function pegarProximoJob({ worker_id }) {
  const sql = `
    UPDATE pinguim.jobs
       SET status = 'executando',
           worker_id = ${esc(worker_id)},
           iniciado_em = now()
     WHERE id = (
       SELECT id FROM pinguim.jobs
        WHERE status = 'aprovado'
        ORDER BY aprovado_em ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING *
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Marcar job concluído com sucesso (worker terminou)
// ============================================================
async function concluirJob({ job_id, entregavel_id = null, resultado_json = null }) {
  const resStr = resultado_json ? `'${JSON.stringify(resultado_json).replace(/'/g, "''")}'::jsonb` : 'NULL';
  const sql = `
    UPDATE pinguim.jobs
       SET status = 'concluido',
           entregavel_id = ${entregavel_id ? `'${entregavel_id}'` : 'NULL'},
           resultado_json = ${resStr},
           concluido_em = now()
     WHERE id = '${job_id}'
    RETURNING id, status, entregavel_id
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function falharJob({ job_id, motivo }) {
  const sql = `
    UPDATE pinguim.jobs
       SET status = 'falhou',
           erro_motivo = ${esc(motivo)},
           concluido_em = now()
     WHERE id = '${job_id}'
    RETURNING id, status
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Marcar como notificado (depois que Pinguim postou link pro sócio)
// ============================================================
async function marcarNotificado({ job_id }) {
  const sql = `
    UPDATE pinguim.jobs
       SET notificado_em = now()
     WHERE id = '${job_id}'
    RETURNING id, notificado_em
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Lista jobs do sócio com status específicos (pro Pinguim verificar antes de responder)
// ============================================================
async function listarJobsDoSocio({ cliente_id, status_filtro = null, limite = 5 }) {
  const cid = await db.resolverClienteId(cliente_id);
  let where = `cliente_id = '${cid}'`;
  if (Array.isArray(status_filtro) && status_filtro.length) {
    const lista = status_filtro.map(s => `'${s}'`).join(',');
    where += ` AND status IN (${lista})`;
  } else if (typeof status_filtro === 'string') {
    where += ` AND status = '${status_filtro}'`;
  }
  const sql = `
    SELECT id, pedido_original, tipo_pedido, status, briefing_resumo,
           canal_origem, criado_em, aprovado_em, concluido_em, entregavel_id, notificado_em
      FROM pinguim.jobs
     WHERE ${where}
     ORDER BY criado_em DESC
     LIMIT ${parseInt(limite, 10)}
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

// ============================================================
// Busca jobs concluídos+não-notificados (pra Pinguim avisar sócio)
// ============================================================
async function buscarConcluidosNaoNotificados({ cliente_id }) {
  const cid = await db.resolverClienteId(cliente_id);
  const sql = `
    SELECT id, pedido_original, tipo_pedido, briefing_resumo,
           canal_origem, thread_id_origem, discord_canal_id, discord_user_id, whatsapp_numero,
           entregavel_id, concluido_em
      FROM pinguim.jobs
     WHERE cliente_id = '${cid}'
       AND status = 'concluido'
       AND notificado_em IS NULL
     ORDER BY concluido_em ASC
     LIMIT 5
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

// ============================================================
// Carrega job por id (pra Pinguim mostrar status / aprovar)
// ============================================================
async function carregarJob({ job_id }) {
  const sql = `SELECT * FROM pinguim.jobs WHERE id = '${job_id}'`;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

module.exports = {
  criarJob,
  gravarPlano,
  aprovarJob,
  cancelarJob,
  pegarProximoJob,
  concluirJob,
  falharJob,
  marcarNotificado,
  listarJobsDoSocio,
  buscarConcluidosNaoNotificados,
  carregarJob,
};
