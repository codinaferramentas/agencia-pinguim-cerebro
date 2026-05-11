// ============================================================
// aprendizados.js — V2.14.5 (memória do agente, classificada)
// ============================================================
// Lê/escreve nas tabelas existentes (Princípio 11 — não criar redundante):
//   pinguim.aprendizados_agente             — geral do agente (afeta todos clientes)
//   pinguim.aprendizados_cliente_agente     — pessoal de cada sócio
//
// O Atendente Pinguim tem agente_id fixo: 2699b1b1-769b-4b76-a8c1-4111d2e1d142
// ============================================================

const db = require('./db');

const AGENTE_PINGUIM_ID = '2699b1b1-769b-4b76-a8c1-4111d2e1d142';

function escSql(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// =====================================
// LEITURA — usadas pelo contexto-rico
// =====================================

// Retorna o markdown geral do agente (válido pra todos os sócios)
async function lerAprendizadosGerais() {
  const sql = `
    SELECT conteudo_md, versao, atualizado_em
      FROM pinguim.aprendizados_agente
     WHERE agente_id = '${AGENTE_PINGUIM_ID}'
     LIMIT 1;
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// Retorna o markdown PESSOAL do sócio sobre o agente Pinguim
async function lerAprendizadosDoSocio(cliente_id) {
  if (!cliente_id) return null;
  const sql = `
    SELECT conteudo_md, versao, atualizado_em
      FROM pinguim.aprendizados_cliente_agente
     WHERE agente_id = '${AGENTE_PINGUIM_ID}'
       AND cliente_id = '${cliente_id}'::uuid
     LIMIT 1;
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// =====================================
// ESCRITA — usadas pela mecânica de feedback
// =====================================

// Adiciona linha ao APRENDIZADOS geral do agente. Append, mantém histórico.
async function adicionarAprendizadoGeral({ texto, origem = 'feedback-socio' }) {
  if (!texto || !texto.trim()) throw new Error('texto vazio');
  const dataStr = new Date().toISOString().slice(0, 10);
  const novaEntrada = `\n\n## ${dataStr} — ${origem}\n${texto.trim()}\n`;

  const sql = `
    INSERT INTO pinguim.aprendizados_agente (agente_id, conteudo_md, versao, atualizado_em)
    VALUES ('${AGENTE_PINGUIM_ID}', ${escSql(novaEntrada)}, 1, now())
    ON CONFLICT (agente_id) DO UPDATE SET
      conteudo_md = pinguim.aprendizados_agente.conteudo_md || ${escSql(novaEntrada)},
      versao = pinguim.aprendizados_agente.versao + 1,
      atualizado_em = now()
    RETURNING versao, atualizado_em;
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// Adiciona linha ao APRENDIZADOS pessoal do sócio. Append.
async function adicionarAprendizadoPessoal({ cliente_id, texto, origem = 'feedback-chat' }) {
  if (!cliente_id) throw new Error('cliente_id obrigatorio');
  if (!texto || !texto.trim()) throw new Error('texto vazio');
  const dataStr = new Date().toISOString().slice(0, 10);
  const novaEntrada = `\n\n## ${dataStr} — ${origem}\n${texto.trim()}\n`;

  // tenant_id é NOT NULL no schema → usa cliente_id como fallback (multi-tenant futuro)
  // PK = (agente_id, cliente_id) — ON CONFLICT só nesses 2 campos.
  const sql = `
    INSERT INTO pinguim.aprendizados_cliente_agente (agente_id, cliente_id, tenant_id, conteudo_md, versao, atualizado_em)
    VALUES ('${AGENTE_PINGUIM_ID}', '${cliente_id}'::uuid, '${cliente_id}'::uuid, ${escSql(novaEntrada)}, 1, now())
    ON CONFLICT (agente_id, cliente_id) DO UPDATE SET
      conteudo_md = pinguim.aprendizados_cliente_agente.conteudo_md || ${escSql(novaEntrada)},
      versao = pinguim.aprendizados_cliente_agente.versao + 1,
      atualizado_em = now()
    RETURNING versao, atualizado_em;
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// =====================================
// LISTAGEM (admin/auditoria)
// =====================================

async function listarTodosClientes() {
  const sql = `
    SELECT aca.cliente_id, s.slug, s.nome, aca.versao, aca.atualizado_em,
           length(aca.conteudo_md) AS bytes
      FROM pinguim.aprendizados_cliente_agente aca
      LEFT JOIN pinguim.socios s ON s.cliente_id = aca.cliente_id
     WHERE aca.agente_id = '${AGENTE_PINGUIM_ID}'
     ORDER BY aca.atualizado_em DESC;
  `;
  return await db.rodarSQL(sql);
}

module.exports = {
  AGENTE_PINGUIM_ID,
  lerAprendizadosGerais,
  lerAprendizadosDoSocio,
  adicionarAprendizadoGeral,
  adicionarAprendizadoPessoal,
  listarTodosClientes,
};
