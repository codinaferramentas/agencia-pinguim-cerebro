// ============================================================
// detector-proxima-edicao.js — V1 (2026-06-18 noite)
// ============================================================
// Le pagina_venda mais recente de cada produto, chama LLM gpt-4o-mini
// pra extrair "data do proximo evento" (desafio, lancamento), e grava
// em pinguim.proximas_edicoes via RPC proxima_edicao_upsert.
//
// Tambem chama RPC proximas_edicoes_recalcular_status() pra atualizar
// status (futuro -> pre_aviso -> atrasado) das edicoes ja registradas.
//
// Reutilizavel pra Lo-fi, Low Ticket, ProAlt, qualquer produto com
// pagina de venda + categoria aulas/transcricoes_aula_ao_vivo.
// ============================================================

const { rodarSQL, lerChaveSistema } = require('./db');

const MODELO_LLM = 'gpt-4o-mini';
const MAX_CONTEUDO_CHARS = 12000; // ~3k tokens

async function _chamarLLM(prompt) {
  const apiKey = await lerChaveSistema('OPENAI_API_KEY');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO_LLM,
      messages: [
        { role: 'system', content: 'Voce extrai datas de eventos futuros de paginas de venda. Sempre devolva JSON puro, sem markdown.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM erro ${resp.status}: ${t.slice(0, 300)}`);
  }
  const j = await resp.json();
  return j.choices?.[0]?.message?.content || '{}';
}

async function _carregarPromptCatalogo() {
  const r = await rodarSQL(`SELECT prompt_template FROM pinguim.enriquecedores_catalogo WHERE slug='extrator-data-proxima-edicao' LIMIT 1;`);
  if (!r || r.length === 0) throw new Error('enricher extrator-data-proxima-edicao nao encontrado no catalogo');
  return r[0].prompt_template;
}

// Extrai data de UMA fonte
async function _extrairDe(fonte, promptTemplate) {
  const hoje = new Date().toISOString().slice(0, 10);
  const conteudo = (fonte.conteudo_md || '').slice(0, MAX_CONTEUDO_CHARS);
  if (!conteudo.trim()) return { ok: false, motivo: 'pagina sem conteudo' };

  const prompt = promptTemplate
    .replace('{data_hoje}', hoje)
    .replace('{conteudo}', conteudo);

  let resp;
  try {
    const raw = await _chamarLLM(prompt);
    resp = JSON.parse(raw);
  } catch (e) {
    return { ok: false, motivo: `LLM/parse erro: ${e.message}` };
  }

  if (!resp.data_evento) {
    return { ok: true, encontrou: false, motivo: resp.motivo || 'nao mencionou data' };
  }

  // Valida formato
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resp.data_evento)) {
    return { ok: false, motivo: `data invalida: ${resp.data_evento}` };
  }

  return {
    ok: true,
    encontrou: true,
    data_evento: resp.data_evento,
    confianca: Number(resp.confianca) || 0,
  };
}

// Detecta proxima edicao pra UM produto (passa cerebro_id pra achar pagina mais recente)
async function detectarParaProduto({ produto_id, produto_nome, cerebro_id, on_log = () => {} }) {
  on_log({ event: 'inicio', produto_nome });

  // Pega pagina_venda mais recente do cerebro
  const fontes = await rodarSQL(`
    SELECT id, url, conteudo_md, criado_em
      FROM pinguim.cerebro_fontes
     WHERE cerebro_id = '${cerebro_id}'
       AND tipo = 'pagina_venda'
       AND conteudo_md IS NOT NULL
     ORDER BY criado_em DESC
     LIMIT 1;
  `);
  if (!fontes || fontes.length === 0) {
    on_log({ event: 'skip', motivo: 'sem pagina_venda', produto_nome });
    return { ok: true, pulado: true, motivo: 'sem_pagina' };
  }

  const fonte = fontes[0];
  const promptTemplate = await _carregarPromptCatalogo();
  const extracao = await _extrairDe(fonte, promptTemplate);
  on_log({ event: 'llm_resultado', produto_nome, extracao });

  if (!extracao.ok) {
    return { ok: false, erro: extracao.motivo };
  }
  if (!extracao.encontrou) {
    return { ok: true, encontrou: false, motivo: extracao.motivo };
  }

  // Grava via RPC
  const urlEsc = (fonte.url || '').replace(/'/g, "''");
  await rodarSQL(`
    SELECT pinguim.proxima_edicao_upsert(
      '${produto_id}'::uuid,
      '${extracao.data_evento}'::date,
      '${urlEsc}',
      '${fonte.id}'::uuid,
      ${extracao.confianca}
    );
  `);

  on_log({ event: 'gravado', produto_nome, data: extracao.data_evento, confianca: extracao.confianca });
  return { ok: true, encontrou: true, data_evento: extracao.data_evento, confianca: extracao.confianca };
}

// Roda pra TODOS os produtos com cerebro
async function detectarTodos({ on_log = () => {} } = {}) {
  // Recalcular status ANTES (futuro -> pre_aviso -> atrasado)
  await rodarSQL(`SELECT pinguim.proximas_edicoes_recalcular_status();`);

  // Produtos elegiveis: SO os que tem motor de paginas_venda RODANDO.
  // Se nao tem motor, a pagina no banco eh semente da carga inicial e nao
  // deve gerar alerta de proxima edicao (Andre cravou 2026-06-18).
  const produtos = await rodarSQL(`
    SELECT p.id AS produto_id, p.nome AS produto_nome, c.id AS cerebro_id
      FROM pinguim.produtos p
      JOIN pinguim.cerebros c ON c.produto_id = p.id
      JOIN pinguim.cerebro_plano_categoria cpc ON cpc.cerebro_id = c.id
     WHERE cpc.categoria_slug = 'paginas_venda'
       AND cpc.status_automacao = 'ativo'
       AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                      'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
     ORDER BY p.nome;
  `);

  const resultados = [];
  for (const p of produtos) {
    try {
      const r = await detectarParaProduto({
        produto_id: p.produto_id,
        produto_nome: p.produto_nome,
        cerebro_id: p.cerebro_id,
        on_log,
      });
      resultados.push({ produto: p.produto_nome, ...r });
    } catch (e) {
      on_log({ event: 'erro', produto_nome: p.produto_nome, erro: e.message });
      resultados.push({ produto: p.produto_nome, ok: false, erro: e.message });
    }
  }
  return resultados;
}

module.exports = { detectarParaProduto, detectarTodos };
