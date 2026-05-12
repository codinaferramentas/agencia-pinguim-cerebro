// ============================================================
// oficina.js — V2.15 Oficina de Relatórios (Andre 2026-05-12)
// ============================================================
// Quando agente detecta pedido de RELATÓRIO COMPLEXO (multi-fonte, agregação,
// cruzamento, atribuição), em vez de tentar executar em runtime (P-V-E),
// abre um TICKET na pinguim.oficina_relatorios. Codina constrói Skill
// dedicada, vincula ao ticket, marca entregue. Próxima vez que o sócio
// pedir algo similar, agente consulta o catálogo e executa direto.
//
// Princípio (Andre 2026-05-12): "BI sério não é Q&A natural. Relatório
// complexo vira PRODUTO versionado, não execução em runtime."
// ============================================================

const db = require('./db');

const esc = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";
const jsonEsc = (obj) => obj == null ? 'NULL' : `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;

// ============================================================
// Cria um ticket novo (status=coletando_requisitos)
// Agente chama quando reconhece pedido complexo
// ============================================================
async function criarPedido({
  cliente_id,
  pedido_original,
  canal_origem,
  thread_id_origem = null,
  discord_canal_id = null,
  whatsapp_numero = null,
  briefing_estruturado = {},
  anexos = [],
  prioridade = 'normal',
}) {
  const cid = await db.resolverClienteId(cliente_id);
  const sql = `
    INSERT INTO pinguim.oficina_relatorios
      (cliente_id, pedido_original, canal_origem, thread_id_origem,
       discord_canal_id, whatsapp_numero, briefing_estruturado, anexos, prioridade)
    VALUES
      ('${cid}', ${esc(pedido_original)}, ${esc(canal_origem)}, ${esc(thread_id_origem)},
       ${esc(discord_canal_id)}, ${esc(whatsapp_numero)},
       ${jsonEsc(briefing_estruturado)}, ${jsonEsc(anexos)}, ${esc(prioridade)})
    RETURNING id, criado_em, status
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Atualiza briefing_estruturado (merge, não substitui)
// Agente chama conforme coleta mais info do sócio
// ============================================================
async function atualizarBriefing({ ticket_id, novos_campos = {}, status = null }) {
  // jsonb_set merge: pega o atual e mescla com novos campos via SQL
  const sets = [];
  if (Object.keys(novos_campos).length > 0) {
    // jsonb concat: brief antigo || brief novo (novos campos sobrescrevem)
    sets.push(`briefing_estruturado = briefing_estruturado || ${jsonEsc(novos_campos)}`);
  }
  if (status) {
    sets.push(`status = ${esc(status)}`);
    if (status === 'aprovado_pra_construir') sets.push(`aprovado_em = now()`);
    if (status === 'entregue') sets.push(`entregue_em = now()`);
  }
  if (sets.length === 0) return null;

  const sql = `
    UPDATE pinguim.oficina_relatorios
       SET ${sets.join(', ')}
     WHERE id = '${ticket_id}'
    RETURNING id, status, briefing_estruturado, atualizado_em
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Anexa recurso (HTML de exemplo, link, descrição extra, screenshot URL)
// ============================================================
async function anexarRecurso({ ticket_id, tipo, conteudo, descricao = null }) {
  // tipo: 'html_exemplo'|'link_referencia'|'descricao_texto'|'screenshot_url'|'planilha_drive'|'campo_extra'
  const novoAnexo = { tipo, conteudo, descricao, anexado_em: new Date().toISOString() };
  const sql = `
    UPDATE pinguim.oficina_relatorios
       SET anexos = anexos || ${jsonEsc([novoAnexo])}
     WHERE id = '${ticket_id}'
    RETURNING id, anexos
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Lista pedidos do sócio (status configurável)
// Agente chama via contexto-rico pra mostrar [OFICINA — PEDIDOS DESTE SÓCIO]
// ============================================================
async function listarPendentesDoSocio({ cliente_id, status_filtro = ['coletando_requisitos', 'aguardando_aprovacao', 'aprovado_pra_construir', 'em_construcao'], limite = 5 }) {
  const cid = await db.resolverClienteId(cliente_id);
  const lista = Array.isArray(status_filtro) ? status_filtro : [status_filtro];
  const statusIn = lista.map(s => `'${s}'`).join(',');
  const sql = `
    SELECT id, pedido_original, briefing_estruturado, anexos, status, prioridade,
           criado_em, atualizado_em, aprovado_em, skill_slug_alvo
      FROM pinguim.oficina_relatorios
     WHERE cliente_id = '${cid}'
       AND status IN (${statusIn})
     ORDER BY criado_em DESC
     LIMIT ${parseInt(limite, 10)}
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

// ============================================================
// Lista fila total da oficina (Codina ve no painel)
// ============================================================
async function listarFilaTotal({ status_filtro = null, limite = 20 }) {
  let where = '';
  if (status_filtro) {
    const lista = Array.isArray(status_filtro) ? status_filtro : [status_filtro];
    const statusIn = lista.map(s => `'${s}'`).join(',');
    where = `WHERE status IN (${statusIn})`;
  }
  // socios pode ter colunas diferentes em ambientes — pegamos o que existir
  const sql = `
    SELECT o.*,
           COALESCE(s.nome, s.slug, '—') as socio_nome,
           s.slug as socio_slug
      FROM pinguim.oficina_relatorios o
      LEFT JOIN pinguim.socios s ON s.cliente_id = o.cliente_id
     ${where}
     ORDER BY
       CASE o.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
       o.criado_em DESC
     LIMIT ${parseInt(limite, 10)}
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

// ============================================================
// Carrega ticket por id
// ============================================================
async function carregarTicket({ ticket_id }) {
  const sql = `SELECT * FROM pinguim.oficina_relatorios WHERE id = '${ticket_id}'`;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Marca ticket como entregue (Codina chamou apos construir Skill)
// ============================================================
async function marcarEntregue({ ticket_id, skill_slug_alvo, notas_codina = null }) {
  const sql = `
    UPDATE pinguim.oficina_relatorios
       SET status = 'entregue',
           skill_slug_alvo = ${esc(skill_slug_alvo)},
           notas_codina = ${esc(notas_codina)},
           entregue_em = now()
     WHERE id = '${ticket_id}'
    RETURNING id, status, skill_slug_alvo, entregue_em
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Cancela ticket (sócio mudou de ideia)
// ============================================================
async function cancelarTicket({ ticket_id, motivo = null }) {
  const sql = `
    UPDATE pinguim.oficina_relatorios
       SET status = 'cancelado',
           notas_codina = ${esc(motivo)},
           entregue_em = now()
     WHERE id = '${ticket_id}'
       AND status IN ('coletando_requisitos','aguardando_aprovacao','aprovado_pra_construir')
    RETURNING id, status
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Catálogo de relatórios prontos (Skills ativas) — agente consulta
// pra dizer "ja tenho esse, sai em 2s" antes de abrir ticket novo
// ============================================================
async function listarCatalogo({ status = 'ativo' } = {}) {
  const sql = `
    SELECT slug, nome, descricao, como_invocar, exemplos_pedido, status
      FROM pinguim.oficina_catalogo
     WHERE status = ${esc(status)}
     ORDER BY slug
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) ? r : [];
}

// Adiciona/atualiza item no catálogo (quando nova Skill nasce)
async function upsertCatalogo({ slug, nome, descricao, como_invocar, exemplos_pedido = [], status = 'ativo' }) {
  const examples = `ARRAY[${(exemplos_pedido || []).map(e => esc(e)).join(',')}]`;
  const sql = `
    INSERT INTO pinguim.oficina_catalogo (slug, nome, descricao, como_invocar, exemplos_pedido, status)
    VALUES (${esc(slug)}, ${esc(nome)}, ${esc(descricao)}, ${esc(como_invocar)}, ${examples}, ${esc(status)})
    ON CONFLICT (slug) DO UPDATE SET
      nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      como_invocar = EXCLUDED.como_invocar,
      exemplos_pedido = EXCLUDED.exemplos_pedido,
      status = EXCLUDED.status
    RETURNING slug, status
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

module.exports = {
  criarPedido,
  atualizarBriefing,
  anexarRecurso,
  listarPendentesDoSocio,
  listarFilaTotal,
  carregarTicket,
  marcarEntregue,
  cancelarTicket,
  listarCatalogo,
  upsertCatalogo,
};
