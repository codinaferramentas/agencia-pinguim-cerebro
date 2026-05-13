// ============================================================
// agendamentos.js — V2.15 wrapper de pinguim.relatorios_config + pg_cron
// Andre 2026-05-12
// ============================================================
// Wrapper de CRUD + agenda no pg_cron pra a categoria "agendamentos"
// (visão sócio = "minha agenda de relatórios automáticos").
//
// Hoje o universo é executivo-diario (cron 8h BRT) e executivo-diario-teste
// (cron */15 min). Mas o schema já é genérico (slug, modulos, sintetizador),
// então quando outros relatórios virarem Skills no catálogo Oficina,
// adicionar agendamento é só UPSERT aqui + cron.schedule.
// ============================================================

const db = require('./db');

const esc = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";
const escArr = (arr) => {
  if (!Array.isArray(arr)) return "'{}'::text[]";
  const inner = arr.map(v => "'" + String(v).replace(/'/g, "''") + "'").join(',');
  return `ARRAY[${inner}]::text[]`;
};

// ============================================================
// Lista agendamentos (com filtro por sócio opcional)
// ============================================================
async function listar({ cliente_id = null, somente_ativos = false } = {}) {
  let where = ['1=1'];
  if (cliente_id) where.push(`cliente_id = ${esc(cliente_id)}`);
  if (somente_ativos) where.push('ativo = true');
  // V2.15.1 Andre 2026-05-13: lê da view que agrega destinatários em jsonb
  const sql = `
    SELECT id, cliente_id, slug, nome, descricao,
           modulos, sintetizador,
           cron_expr, cron_descricao, cron_job_id,
           canais, whatsapp_numero, email_destino,
           destinatarios,
           ativo, ultima_execucao, ultimo_status, ultimo_entregavel_id,
           criado_em, atualizado_em
      FROM pinguim.relatorios_config_com_destinatarios
     WHERE ${where.join(' AND ')}
     ORDER BY ativo DESC, slug ASC
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

async function carregar(id) {
  const sql = `SELECT * FROM pinguim.relatorios_config_com_destinatarios WHERE id = ${esc(id)} LIMIT 1`;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Cria agendamento novo via UI (sem usar RPC, pois RPC valida slugs canônicos).
// Andre 2026-05-13: validação mais flexível — slug do RELATÓRIO (Skill),
// não dos módulos internos. Módulos internos rolam de acordo com a Skill.
// ============================================================
async function criar({
  cliente_id,
  slug,                   // ex: 'executivo-diario', 'top-engajados'
  nome,
  descricao = null,
  modulos = [],           // peças internas (varia por relatório)
  sintetizador = null,
  cron_expr,
  cron_descricao,
  destinatarios = [],     // [{canal, valor, nome}]
  ativo_inicial = true,
}) {
  if (!cliente_id || !slug || !nome || !cron_expr) {
    throw new Error('cliente_id, slug, nome, cron_expr são obrigatórios');
  }

  // 1) INSERT em relatorios_config (sem cron_job_id ainda)
  const sqlInsert = `
    INSERT INTO pinguim.relatorios_config
      (cliente_id, slug, nome, descricao, modulos, sintetizador,
       cron_expr, cron_descricao, canais, ativo)
    VALUES
      (${esc(cliente_id)},
       ${esc(slug)},
       ${esc(nome)},
       ${esc(descricao)},
       ${escArr(modulos)},
       ${esc(sintetizador)},
       ${esc(cron_expr)},
       ${esc(cron_descricao)},
       ${escArr(['whatsapp'])},
       false)
    ON CONFLICT (cliente_id, slug) DO UPDATE SET
      nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      modulos = EXCLUDED.modulos,
      sintetizador = EXCLUDED.sintetizador,
      cron_expr = EXCLUDED.cron_expr,
      cron_descricao = EXCLUDED.cron_descricao,
      atualizado_em = now()
    RETURNING id
  `;
  const r1 = await db.rodarSQL(sqlInsert);
  if (!Array.isArray(r1) || !r1[0]) throw new Error('falha INSERT');
  const id = r1[0].id;

  // 2) Insere destinatários (limpando antigos primeiro se for UPSERT)
  await db.rodarSQL(`DELETE FROM pinguim.relatorios_destinatarios WHERE relatorio_id = ${esc(id)}`);
  for (const d of destinatarios) {
    if (!d.canal || !d.valor) continue;
    await db.rodarSQL(`
      INSERT INTO pinguim.relatorios_destinatarios (relatorio_id, canal, valor, nome, ativo)
      VALUES (${esc(id)}, ${esc(d.canal)}, ${esc(d.valor)}, ${esc(d.nome || null)}, true)
      ON CONFLICT (relatorio_id, canal, valor) DO UPDATE SET ativo = true, nome = EXCLUDED.nome
    `);
  }

  // 3) Se ativo_inicial, agenda no pg_cron
  if (ativo_inicial) {
    const cfg = await carregar(id);
    const jobName = `pinguim-relatorio-${cfg.slug}-${cfg.cliente_id.slice(0, 8)}`;
    const cmd = `SELECT pinguim.enfileirar_job_relatorio('${cfg.id}'::uuid);`;
    const r2 = await db.rodarSQL(`SELECT cron.schedule(job_name => '${jobName}', schedule => '${cfg.cron_expr.replace(/'/g, "''")}', command => '${cmd.replace(/'/g, "''")}') AS jid;`);
    const jid = Array.isArray(r2) && r2[0] ? r2[0].jid : null;
    await db.rodarSQL(`UPDATE pinguim.relatorios_config SET ativo=true, cron_job_id=${jid || 'NULL'}, atualizado_em=now() WHERE id=${esc(id)}`);
  }

  return await carregar(id);
}

// ============================================================
// Destinatários — CRUD individual
// ============================================================
async function adicionarDestinatario(relatorio_id, { canal, valor, nome = null }) {
  if (!relatorio_id || !canal || !valor) throw new Error('relatorio_id, canal, valor obrigatórios');
  const sql = `
    INSERT INTO pinguim.relatorios_destinatarios (relatorio_id, canal, valor, nome, ativo)
    VALUES (${esc(relatorio_id)}, ${esc(canal)}, ${esc(valor)}, ${esc(nome)}, true)
    ON CONFLICT (relatorio_id, canal, valor) DO UPDATE SET ativo = true, nome = EXCLUDED.nome, atualizado_em = now()
    RETURNING *
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function removerDestinatario(destinatario_id) {
  await db.rodarSQL(`DELETE FROM pinguim.relatorios_destinatarios WHERE id = ${esc(destinatario_id)}`);
  return true;
}

async function toggleDestinatario(destinatario_id) {
  const sql = `
    UPDATE pinguim.relatorios_destinatarios
       SET ativo = NOT ativo, atualizado_em = now()
     WHERE id = ${esc(destinatario_id)}
    RETURNING *
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

async function listarDestinatarios(relatorio_id) {
  const sql = `
    SELECT id, canal, valor, nome, ativo, criado_em
      FROM pinguim.relatorios_destinatarios
     WHERE relatorio_id = ${esc(relatorio_id)}
     ORDER BY criado_em
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

// ============================================================
// Edita campos de um agendamento. Se cron_expr mudar, reagenda no pg_cron.
// ============================================================
async function atualizar({ id, campos = {} }) {
  if (!id) throw new Error('id obrigatorio');
  const camposPermitidos = ['nome', 'descricao', 'modulos', 'sintetizador', 'cron_expr', 'cron_descricao', 'canais', 'whatsapp_numero', 'email_destino'];
  const sets = [];
  for (const k of camposPermitidos) {
    if (Object.prototype.hasOwnProperty.call(campos, k)) {
      if (k === 'modulos' || k === 'canais') sets.push(`${k} = ${escArr(campos[k])}`);
      else sets.push(`${k} = ${esc(campos[k])}`);
    }
  }
  if (sets.length === 0) throw new Error('nenhum campo permitido foi passado pra atualizar');
  sets.push('atualizado_em = now()');

  const sql = `UPDATE pinguim.relatorios_config SET ${sets.join(', ')} WHERE id = ${esc(id)} RETURNING *`;
  const r = await db.rodarSQL(sql);
  const atualizado = Array.isArray(r) && r[0] ? r[0] : null;
  if (!atualizado) return null;

  // Se cron_expr mudou, reagenda no pg_cron
  if (Object.prototype.hasOwnProperty.call(campos, 'cron_expr') && atualizado.cron_job_id) {
    const newExpr = String(campos.cron_expr).replace(/'/g, "''");
    await db.rodarSQL(`SELECT cron.alter_job(job_id := ${atualizado.cron_job_id}::bigint, schedule := '${newExpr}');`);
  }
  return atualizado;
}

// ============================================================
// Pausa = ativo=false + cron.unschedule (mantém registro pra reativar depois)
// ============================================================
async function pausar(id) {
  const cfg = await carregar(id);
  if (!cfg) return null;
  if (cfg.cron_job_id) {
    try {
      await db.rodarSQL(`SELECT cron.unschedule(${cfg.cron_job_id}::bigint);`);
    } catch (e) { /* já desagendado */ }
  }
  const sql = `UPDATE pinguim.relatorios_config SET ativo=false, cron_job_id=NULL, atualizado_em=now() WHERE id=${esc(id)} RETURNING *`;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Reativa = ativo=true + re-schedule no pg_cron
// ============================================================
async function reativar(id) {
  const cfg = await carregar(id);
  if (!cfg) return null;
  const jobName = `pinguim-relatorio-${cfg.slug}-${cfg.cliente_id.slice(0,8)}`;
  const cmd = `SELECT pinguim.enfileirar_job_relatorio('${cfg.id}'::uuid);`;
  const r1 = await db.rodarSQL(`SELECT cron.schedule(job_name => '${jobName}', schedule => '${cfg.cron_expr.replace(/'/g, "''")}', command => '${cmd.replace(/'/g, "''")}') AS jid;`);
  const newJid = Array.isArray(r1) && r1[0] ? r1[0].jid : null;
  const sql = `UPDATE pinguim.relatorios_config SET ativo=true, cron_job_id=${newJid || 'NULL'}, atualizado_em=now() WHERE id=${esc(id)} RETURNING *`;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Excluir = remove cron + remove linha (definitivo)
// ============================================================
async function excluir(id) {
  const cfg = await carregar(id);
  if (!cfg) return false;
  if (cfg.cron_job_id) {
    try { await db.rodarSQL(`SELECT cron.unschedule(${cfg.cron_job_id}::bigint);`); } catch (_) {}
  }
  await db.rodarSQL(`DELETE FROM pinguim.relatorios_config WHERE id = ${esc(id)};`);
  return true;
}

// ============================================================
// Dispara manualmente AGORA (insere job direto, worker pega)
// ============================================================
async function dispararAgora(id) {
  const r = await db.rodarSQL(`SELECT pinguim.enfileirar_job_relatorio('${id}'::uuid) AS job_id;`);
  return Array.isArray(r) && r[0] ? r[0].job_id : null;
}

// ============================================================
// Listar últimos disparos (job_run_details do pg_cron) — debug do agendamento
// ============================================================
async function ultimosDisparos(id, limite = 10) {
  const cfg = await carregar(id);
  if (!cfg || !cfg.cron_job_id) return [];
  const sql = `
    SELECT start_time, end_time, status, return_message
      FROM cron.job_run_details
     WHERE jobid = ${cfg.cron_job_id}::bigint
     ORDER BY start_time DESC
     LIMIT ${parseInt(limite, 10)}
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

module.exports = {
  listar,
  carregar,
  criar,
  atualizar,
  pausar,
  reativar,
  excluir,
  dispararAgora,
  ultimosDisparos,
  adicionarDestinatario,
  removerDestinatario,
  toggleDestinatario,
  listarDestinatarios,
};
