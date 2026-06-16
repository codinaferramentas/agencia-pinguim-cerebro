// ============================================================
// webhook-cerebro.js — V3 (2026-06-16)
// ============================================================
// Endpoint generico que recebe payload de webhook externo (YA Forms,
// Tally, Typeform, etc) e ingere como fonte de cerebro especifico.
//
// URL: POST /api/webhook-cerebro/:slug_produto/:categoria_slug
//
// Recebe body JSON arbitrario (formato do remetente). Salva como
// cerebro_fonte tipo='resposta_pesquisa' e dispara enriquecedores
// aplicaveis (extrator de perfil do respondente, agrupador de temas, etc).
//
// Segurança: token simples por categoria armazenado em cofre.
// Cada (cerebro, categoria) tem sua URL e seu token — assim YA Forms
// configura com URL+token e a gente sabe que veio de la.
// ============================================================

const db = require('./db');
const enriquecedores = require('./enriquecedores');

/**
 * Processa um webhook de pesquisa recebido.
 *
 * @param {object} args
 * @param {string} args.slug_produto    — slug do produto/cerebro (ex: 'desafio-de-conte-do-lo-fi')
 * @param {string} args.categoria_slug  — categoria de destino (ex: 'pesquisas')
 * @param {object} args.payload         — body JSON do webhook
 * @param {string} [args.fonte_externa] — origem (ex: 'yayforms', 'tally', 'typeform')
 * @returns {Promise<{ok, cerebro_fonte_id?, enriquecedores?}>}
 */
async function processarWebhook({ slug_produto, categoria_slug, payload, fonte_externa = 'webhook' }) {
  // Resolve cerebro_id pelo slug do produto
  const cerebroRow = await db.rodarSQL(`
    SELECT c.id AS cerebro_id, p.slug AS produto_slug, p.nome AS produto_nome
    FROM pinguim.cerebros c
    JOIN pinguim.produtos p ON p.id = c.produto_id
    WHERE p.slug = ${esc(slug_produto)}
    LIMIT 1;
  `);
  if (!cerebroRow || cerebroRow.length === 0) {
    throw new Error(`cerebro nao encontrado pro produto slug='${slug_produto}'`);
  }
  const cerebro_id = cerebroRow[0].cerebro_id;
  const produto_nome = cerebroRow[0].produto_nome;

  // Resolve categoria + valida tipos_fonte aceita pesquisas
  const catRow = await db.rodarSQL(`
    SELECT vp.plano_id, vp.categoria_nome, vp.categoria_tipos_fonte
    FROM pinguim.vw_cerebro_plano_categoria vp
    WHERE vp.cerebro_id = '${cerebro_id}'::uuid AND vp.categoria_slug = ${esc(categoria_slug)}
    LIMIT 1;
  `);
  if (!catRow || catRow.length === 0) {
    throw new Error(`categoria '${categoria_slug}' nao encontrada no plano do cerebro`);
  }
  const tipos = catRow[0].categoria_tipos_fonte || [];
  const tipoFonte = tipos.includes('resposta_pesquisa') ? 'resposta_pesquisa'
                  : tipos[0] || 'resposta_pesquisa';

  // Monta titulo + conteudo amigavel a partir do payload
  const titulo = _gerarTitulo(payload, produto_nome, categoria_slug);
  const conteudoMd = _payloadParaMarkdown(payload);

  // Salva como cerebro_fonte
  const fonteRow = await db.rodarSQL(`
    INSERT INTO pinguim.cerebro_fontes
      (cerebro_id, tipo, titulo, origem, url, conteudo_md, criado_em)
    VALUES (
      '${cerebro_id}'::uuid,
      ${esc(tipoFonte)},
      ${esc(titulo.slice(0, 200))},
      ${esc(fonte_externa)},
      NULL,
      ${esc(conteudoMd)},
      now()
    )
    RETURNING id;
  `);
  const cerebro_fonte_id = fonteRow[0].id;

  // Marca em fontes_processadas (idempotencia futura: webhook duplicado nao gera 2 fontes)
  const fonteExternaId = _extrairIdExterno(payload) || `${Date.now()}-${cerebro_fonte_id.slice(0,8)}`;
  await db.rodarSQL(`
    INSERT INTO pinguim.fontes_processadas
      (cerebro_id, categoria_slug, fonte_externa_id, fonte_origem, cerebro_fonte_id, metadata)
    VALUES (
      '${cerebro_id}'::uuid,
      ${esc(categoria_slug)},
      ${esc(fonteExternaId)},
      ${esc(fonte_externa)},
      '${cerebro_fonte_id}'::uuid,
      ${esc(JSON.stringify({ titulo, fonte_externa, payload_keys: Object.keys(payload || {}) }))}::jsonb
    )
    ON CONFLICT DO NOTHING;
  `);

  // Atualiza ultima_execucao + promove status se em construcao
  await db.rodarSQL(`
    UPDATE pinguim.cerebro_plano_categoria
       SET ultima_execucao = now(),
           ultimo_status_run = 'ok',
           status_automacao = CASE
             WHEN status_automacao IN ('em_construcao','sem_coleta','planejada') THEN 'rodando'
             ELSE status_automacao
           END,
           atualizado_em = now()
     WHERE id = '${catRow[0].plano_id}';
  `);

  // Aplica enriquecedores compativeis (a criar: extrator de perfil de respondente, agrupador temas)
  let enriq = [];
  try {
    enriq = await enriquecedores.aplicarEnriquecedores({
      cerebro_id,
      cerebro_fonte_id,
      tipo_fonte: tipoFonte,
      texto: conteudoMd,
      extras: { payload },
      on_log: () => {},
    });
  } catch (e) {
    // Nao bloqueia ingestao se enriquecedor falhar
    console.warn(`[webhook-cerebro] enriquecedor falhou (nao bloqueante): ${e.message}`);
  }

  return { ok: true, cerebro_id, cerebro_fonte_id, titulo, enriquecedores: enriq };
}

function _gerarTitulo(payload, produto_nome, categoria_slug) {
  // Tenta achar nome do respondente em campos comuns
  const cand = payload?.respondent?.name || payload?.name || payload?.nome ||
               payload?.respondent_name || payload?.email || payload?.respondent?.email;
  const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  if (cand) return `${produto_nome} — ${categoria_slug}: ${cand} (${data})`;
  return `${produto_nome} — ${categoria_slug} (${data})`;
}

function _extrairIdExterno(payload) {
  return payload?.response_id || payload?.id || payload?.submission_id || payload?.respondent?.id || null;
}

function _payloadParaMarkdown(payload) {
  if (!payload || typeof payload !== 'object') return String(payload || '');
  const linhas = [];

  // Forma YA Forms / Tally / Typeform tipica: {data: {fields: [{label, value}]}} ou {answers: [...]}
  const answers = payload?.data?.fields || payload?.answers || payload?.fields || payload?.respostas;
  if (Array.isArray(answers)) {
    for (const a of answers) {
      const k = a.label || a.question || a.title || a.key || a.pergunta || 'campo';
      const v = a.value ?? a.answer ?? a.resposta ?? '';
      linhas.push(`**${k}**\n${_normalizarValor(v)}\n`);
    }
  } else {
    // Forma plana {pergunta1: 'resposta1', ...}
    for (const [k, v] of Object.entries(payload)) {
      if (k.startsWith('_') || typeof v === 'object' && v === null) continue;
      linhas.push(`**${k}**\n${_normalizarValor(v)}\n`);
    }
  }
  return linhas.join('\n') || '_(payload vazio)_';
}

function _normalizarValor(v) {
  if (v === null || v === undefined) return '_(vazio)_';
  if (typeof v === 'object') return '```json\n' + JSON.stringify(v, null, 2) + '\n```';
  return String(v);
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { processarWebhook };
