// ============================================================
// enriquecedores/index.js — motor generico de enriquecimento (V3)
// ============================================================
// Le pinguim.enriquecedores_catalogo, decide quais aplicar a uma fonte
// recem-criada, executa cada um, salva log em enriquecedores_execucoes.
//
// Cada handler especifico (ex: extrator-perfis-chat) eh um arquivo neste
// diretorio com mesmo slug. Exporta funcao executar({cerebro_id, cerebro_fonte_id, texto, prompt_template, modelo_llm}).
//
// Reusabilidade total: novo enriquecedor = novo SQL INSERT no catalogo
// + novo arquivo .js neste dir. Nenhum handler de ingestao precisa mudar.
// ============================================================

const path = require('path');
const fs = require('fs');
const db = require('../db');

// Cache de handlers carregados
const _handlersCache = {};

function _carregarHandler(slug) {
  if (_handlersCache[slug]) return _handlersCache[slug];
  const candidato = path.join(__dirname, `${slug}.js`);
  if (!fs.existsSync(candidato)) {
    throw new Error(`Handler nao encontrado em disco: ${slug}.js`);
  }
  const mod = require(candidato);
  if (typeof mod.executar !== 'function') {
    throw new Error(`Handler ${slug} nao exporta funcao executar`);
  }
  _handlersCache[slug] = mod;
  return mod;
}

/**
 * Aplica todos os enriquecedores ativos compativeis com um tipo_fonte.
 * Chamado pelos handlers de ingestao (ingerir-chat-drive, ingerir-midia-drive, etc)
 * logo apos salvar a fonte em cerebro_fontes.
 *
 * @param {object} args
 * @param {string} args.cerebro_id
 * @param {string} args.cerebro_fonte_id
 * @param {string} args.tipo_fonte         — 'chat_export', 'transcricao_midia', etc
 * @param {string} args.texto              — conteudo da fonte (mesmo conteudo_md)
 * @param {object} [args.extras]           — dados auxiliares (ex: msgs parseadas pra chat)
 * @param {function} [args.on_log]
 * @returns {Promise<Array<{slug, ok, itens, custo_usd, duracao_ms, erro?}>>}
 */
async function aplicarEnriquecedores({ cerebro_id, cerebro_fonte_id, tipo_fonte, texto, extras = {}, on_log = () => {} }) {
  if (!cerebro_id || !cerebro_fonte_id || !tipo_fonte) {
    throw new Error('cerebro_id + cerebro_fonte_id + tipo_fonte obrigatorios');
  }

  const catalogo = await db.rodarSQL(`
    SELECT slug, nome, modelo_llm, prompt_template, output_tabela, ordem
    FROM pinguim.enriquecedores_catalogo
    WHERE tipo_fonte_aceito = ${esc(tipo_fonte)} AND ativo = true
    ORDER BY ordem;
  `);

  if (!catalogo || catalogo.length === 0) {
    on_log({ etapa: 'enriquecedores_nenhum', tipo_fonte });
    return [];
  }

  on_log({ etapa: 'enriquecedores_aplicaveis', total: catalogo.length, slugs: catalogo.map(e => e.slug) });

  const resultados = [];
  for (const e of catalogo) {
    const t0 = Date.now();
    let execId;
    try {
      // Cria/upsert registro de execucao em 'executando'
      const execRow = await db.rodarSQL(`
        INSERT INTO pinguim.enriquecedores_execucoes
          (enriquecedor_slug, cerebro_id, cerebro_fonte_id, status, iniciado_em)
        VALUES (${esc(e.slug)}, '${cerebro_id}'::uuid, '${cerebro_fonte_id}'::uuid, 'executando', now())
        ON CONFLICT (enriquecedor_slug, cerebro_fonte_id) DO UPDATE SET
          status = 'executando', iniciado_em = now(), erro = NULL
        RETURNING id;
      `);
      execId = execRow[0].id;

      const handler = _carregarHandler(e.slug);
      const out = await handler.executar({
        cerebro_id,
        cerebro_fonte_id,
        texto,
        extras,
        prompt_template: e.prompt_template,
        modelo_llm: e.modelo_llm,
        on_log: (ev) => on_log({ enriquecedor: e.slug, ...ev }),
      });

      const dur = Date.now() - t0;
      await db.rodarSQL(`
        UPDATE pinguim.enriquecedores_execucoes
           SET status = 'ok',
               itens_gerados = ${out.itens_gerados || 0},
               custo_usd = ${out.custo_usd || 0},
               duracao_ms = ${dur},
               concluido_em = now()
         WHERE id = '${execId}';
      `);
      resultados.push({ slug: e.slug, ok: true, itens: out.itens_gerados || 0, custo_usd: out.custo_usd || 0, duracao_ms: dur });
      on_log({ enriquecedor: e.slug, etapa: 'ok', itens: out.itens_gerados || 0, custo_usd: out.custo_usd, duracao_ms: dur });
    } catch (err) {
      const dur = Date.now() - t0;
      const msg = (err.message || String(err)).slice(0, 800);
      if (execId) {
        await db.rodarSQL(`
          UPDATE pinguim.enriquecedores_execucoes
             SET status = 'falhou', erro = ${esc(msg)}, duracao_ms = ${dur}, concluido_em = now()
           WHERE id = '${execId}';
        `).catch(() => {});
      }
      resultados.push({ slug: e.slug, ok: false, erro: msg, duracao_ms: dur });
      on_log({ enriquecedor: e.slug, etapa: 'falha', erro: msg });
    }
  }
  return resultados;
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { aplicarEnriquecedores };
