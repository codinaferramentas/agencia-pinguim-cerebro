// ============================================================
// processar-depoimento.js — V3 (2026-06-16)
// ============================================================
// Le mensagens novas do canal Discord #depoimentos, parseia
// "Nome - Produto", baixa imagem do anexo, usa GPT-4o vision pra
// extrair texto do print, salva como cerebro_fonte tipo 'depoimento'
// no cerebro do produto matchado, vetoriza.
//
// Quando produto nao reconhecido: depoimentos_pendentes (caixa manual).
// ============================================================

const db = require('./db');
const { vetorizarFonte } = require('./vetorizar-fonte');

const CANAL_DEPOIMENTOS = '1147227247883858041';
const CUSTO_VISION_PER_IMG = 0.005; // ~$0.005 por imagem (gpt-4o low detail)

/**
 * Processa depoimentos novos do canal #depoimentos.
 * @param {object} args
 * @param {number} [args.limite] - max mensagens por execucao (default 200)
 * @param {function} [args.on_log]
 * @returns {Promise<{processados, ja_processados, pendentes, falhas, custo_usd}>}
 */
async function processarDepoimentosNovos({ limite = 200, on_log = () => {} } = {}) {
  // 1) Lista mensagens do canal NAO processadas (NAO bot, com anexo de imagem)
  const msgs = await db.rodarSQL(`
    SELECT
      dm.message_id, dm.autor_nome, dm.conteudo, dm.postado_em,
      dm.metadata->'attachments' AS attachments
    FROM pinguim.discord_mensagens dm
    WHERE dm.canal_id = '${CANAL_DEPOIMENTOS}'
      AND NOT dm.autor_bot
      AND dm.anexos_qtd > 0
      AND NOT EXISTS (
        SELECT 1 FROM pinguim.fontes_processadas fp
        WHERE fp.fonte_origem = 'discord' AND fp.fonte_externa_id = dm.message_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM pinguim.depoimentos_pendentes dp
        WHERE dp.message_id = dm.message_id
      )
    ORDER BY dm.postado_em DESC
    LIMIT ${parseInt(limite, 10)};
  `);

  if (!msgs || msgs.length === 0) {
    on_log({ etapa: 'sem_msgs_novas' });
    return { processados: 0, ja_processados: 0, pendentes: 0, falhas: 0, custo_usd: 0 };
  }

  on_log({ etapa: 'inicio', total: msgs.length });

  let processados = 0, pendentes = 0, falhas = 0;
  let custo_total = 0;

  for (const msg of msgs) {
    try {
      const r = await _processarUma({ msg, on_log });
      if (r.processado) processados++;
      else if (r.pendente) pendentes++;
      else falhas++;
      custo_total += r.custo_usd || 0;
    } catch (e) {
      on_log({ etapa: 'falha', message_id: msg.message_id, erro: e.message });
      falhas++;
    }
  }

  on_log({ etapa: 'fim', processados, pendentes, falhas, custo_usd: custo_total });
  return { processados, pendentes, falhas, custo_usd: parseFloat(custo_total.toFixed(4)) };
}

async function _processarUma({ msg, on_log }) {
  const texto = (msg.conteudo || '').trim();

  // 1) Parse "Nome - Produto" (regex tolerante a variações)
  const parsed = _parsearTexto(texto);

  // 2) Resolve produto via aliases
  let cerebro_id = null, produto_slug = null, produto_nome_canonico = null;
  if (parsed.produto) {
    const r = await db.rodarSQL(`
      SELECT c.id AS cerebro_id, p.slug, p.nome
      FROM pinguim.produto_aliases pa
      JOIN pinguim.produtos p ON p.id = pa.produto_id
      JOIN pinguim.cerebros c ON c.produto_id = p.id
      WHERE lower(pa.alias) = lower(${esc(parsed.produto)})
      LIMIT 1;
    `);
    if (r && r[0]) {
      cerebro_id = r[0].cerebro_id;
      produto_slug = r[0].slug;
      produto_nome_canonico = r[0].nome;
    }
  }

  // 3) Se nao tem produto OU nao tem anexo, vai pra pendentes
  const attachments = msg.attachments || [];
  if (!cerebro_id || attachments.length === 0) {
    const motivo = !cerebro_id ? 'produto_nao_reconhecido' : 'sem_anexo';
    await db.rodarSQL(`
      INSERT INTO pinguim.depoimentos_pendentes
        (message_id, canal_id, autor_nome, conteudo_msg, produto_mencionado, motivo_pendente, attachments_meta, postado_em)
      VALUES (
        ${esc(msg.message_id)}, '${CANAL_DEPOIMENTOS}',
        ${esc(msg.autor_nome)}, ${esc(texto)},
        ${esc(parsed.produto || null)},
        ${esc(motivo)},
        ${esc(JSON.stringify(attachments))}::jsonb,
        ${esc(msg.postado_em)}
      ) ON CONFLICT (message_id) DO NOTHING;
    `);
    on_log({ etapa: 'pendente', message_id: msg.message_id, motivo, produto: parsed.produto });
    return { pendente: true };
  }

  // 4) Le texto dos prints via GPT-4o vision
  const imagensVisao = attachments.filter(a => (a.content_type || '').startsWith('image/'));
  if (imagensVisao.length === 0) {
    // Nao tem imagem (audio/video?). Marca pendente pra revisao
    await db.rodarSQL(`
      INSERT INTO pinguim.depoimentos_pendentes
        (message_id, canal_id, autor_nome, conteudo_msg, produto_mencionado, motivo_pendente, attachments_meta, postado_em)
      VALUES (
        ${esc(msg.message_id)}, '${CANAL_DEPOIMENTOS}',
        ${esc(msg.autor_nome)}, ${esc(texto)},
        ${esc(parsed.produto || null)},
        'anexo_nao_e_imagem',
        ${esc(JSON.stringify(attachments))}::jsonb,
        ${esc(msg.postado_em)}
      ) ON CONFLICT (message_id) DO NOTHING;
    `);
    on_log({ etapa: 'pendente', message_id: msg.message_id, motivo: 'anexo_nao_e_imagem' });
    return { pendente: true };
  }

  on_log({ etapa: 'extraindo_vision', message_id: msg.message_id, nome: parsed.nome, produto: produto_nome_canonico, qtd_imagens: imagensVisao.length });

  let textoDepoimento = '';
  let custoVision = 0;
  for (const img of imagensVisao) {
    try {
      const t = await _extrairTextoComVision({ url: img.url, on_log });
      if (t) textoDepoimento += (textoDepoimento ? '\n---\n' : '') + t;
      custoVision += CUSTO_VISION_PER_IMG;
    } catch (e) {
      on_log({ etapa: 'vision_falha', url: img.url, erro: e.message });
    }
  }

  if (!textoDepoimento.trim()) {
    on_log({ etapa: 'vision_vazio', message_id: msg.message_id });
    return { falha: true };
  }

  // 5) Monta markdown estruturado
  const titulo = parsed.nome
    ? `Depoimento — ${parsed.nome} (${produto_nome_canonico})`
    : `Depoimento — ${produto_nome_canonico} — ${new Date(msg.postado_em).toLocaleDateString('pt-BR')}`;

  const linkAnexo = imagensVisao[0]?.url || '';
  const conteudoMd = [
    `# ${titulo}`,
    '',
    parsed.nome ? `**Aluno:** ${parsed.nome}` : '',
    `**Produto:** ${produto_nome_canonico}`,
    `**Postado em:** ${msg.postado_em}`,
    `**Por (admin):** ${msg.autor_nome}`,
    '',
    '## Depoimento (extraído da imagem por GPT-4o vision)',
    '',
    textoDepoimento,
    '',
    `[Imagem original no Discord](${linkAnexo})`,
  ].filter(Boolean).join('\n');

  // 6) Salva via REST (paylaod grande tolera)
  const fonte = await db.inserirFonteRest({
    cerebro_id,
    tipo: 'depoimento',
    titulo: titulo.slice(0, 200),
    origem: 'discord',
    url: `https://discord.com/channels/1083429941300969574/${CANAL_DEPOIMENTOS}/${msg.message_id}`,
    conteudo_md: conteudoMd,
  });

  // 7) Marca em fontes_processadas (idempotente)
  await db.rodarSQL(`
    INSERT INTO pinguim.fontes_processadas
      (cerebro_id, categoria_slug, fonte_externa_id, fonte_origem, cerebro_fonte_id, metadata)
    VALUES (
      '${cerebro_id}'::uuid,
      'depoimentos',
      ${esc(msg.message_id)},
      'discord',
      '${fonte.id}'::uuid,
      ${esc(JSON.stringify({ produto_slug, nome_aluno: parsed.nome, qtd_imagens: imagensVisao.length, custo_vision_usd: custoVision }))}::jsonb
    ) ON CONFLICT DO NOTHING;
  `);

  // 8) Vetoriza
  const vet = await vetorizarFonte(fonte.id);
  on_log({ etapa: 'salvou', cerebro_fonte_id: fonte.id, vetorizado: vet.ok, chunks: vet.chunks });

  // 9) Atualiza ultima_execucao do plano. Sem isso o painel mente "nunca rodou".
  await db.marcarPlanoExecutado({ cerebro_id, categoria_slug: 'depoimentos' });

  return { processado: true, custo_usd: custoVision };
}

// Parser tolerante de "Nome - Produto" ou variacoes
function _parsearTexto(texto) {
  if (!texto) return { nome: null, produto: null };

  // Remove ** ao redor + emojis no fim + espacos
  let limpo = texto.replace(/\*\*/g, '').trim();
  limpo = limpo.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+$/u, '').trim();

  // Casos "Aluno do Produto" / "Aluno Fernando do ProAlt" -> sem nome canonico
  const mAluno = limpo.match(/^Aluno(?:\s+([A-Z][\w\s]+))?\s+do\s+([A-Z][\w\s]+?)$/i);
  if (mAluno) {
    return { nome: mAluno[1] ? mAluno[1].trim() : null, produto: mAluno[2].trim() };
  }

  // "Aluno do CICLO/LYRA: Leandro Rodriguez"
  const mAlunoCol = limpo.match(/^Aluno\s+do\s+([A-Z][\w\s/]+?):\s*(.+?)$/i);
  if (mAlunoCol) {
    return { nome: mAlunoCol[2].trim(), produto: mAlunoCol[1].split('/')[0].trim() };
  }

  // "Produto: Nome" (formato com :) — PRIMEIRO porque "Taurus: Rodrigo" colaria no padrao N-P se nao tratado antes
  const mDoisPontos = limpo.match(/^([A-Za-z][\w]+)\s*:\s*(.+?)$/);
  if (mDoisPontos) {
    const cand = mDoisPontos[1].trim();
    // So vale como "Produto: Nome" se cand bate com produto conhecido
    if (_ehProdutoConhecido(cand)) {
      return { nome: mDoisPontos[2].trim(), produto: cand };
    }
  }

  // Padrao principal: "Nome - Produto" ou "Nome- Produto"
  const m = limpo.match(/^(.+?)\s*[-–—]\s*([A-Za-z][\w\s/]+?)(?:\s|$)/);
  if (m) {
    return { nome: m[1].trim(), produto: m[2].trim().split('/')[0].trim() };
  }

  // Sem padrao reconhecivel: tenta achar so o produto
  const PRODUTOS = ['ProAlt', 'Pro Alt', 'ELO', 'Elo', 'CICLO', 'Ciclo', 'Lyra', 'Taurus', 'Tuarus', 'Orion', 'Lo-fi', 'LoFi'];
  for (const p of PRODUTOS) {
    if (new RegExp(`\\b${p}\\b`, 'i').test(limpo)) {
      return { nome: null, produto: p };
    }
  }

  return { nome: null, produto: null };
}

function _ehProdutoConhecido(s) {
  const PRODUTOS = ['proalt', 'proa', 'elo', 'ciclo', 'lyra', 'taurus', 'tuarus', 'orion', 'lo-fi', 'lofi'];
  return PRODUTOS.includes(s.toLowerCase());
}

// Extrai texto de uma imagem via GPT-4o vision
async function _extrairTextoComVision({ url, on_log }) {
  const apiKey = await db.lerChaveSistema('OPENAI_API_KEY', 'processar-depoimento');
  if (!apiKey) throw new Error('OPENAI_API_KEY nao encontrada');

  const prompt = `Voce esta lendo um PRINT de mensagem do WhatsApp ou Instagram. Esse print contem um DEPOIMENTO de aluno sobre um curso/produto.

Sua tarefa: extrair APENAS o texto do depoimento, em portugues, preservando:
- nome do aluno (se visivel)
- todas as frases do depoimento
- emojis usados (se forem relevantes)

NAO extrair:
- timestamps (hora/data)
- nomes de contato do remetente
- elementos de UI (botoes, icones)
- horarios de mensagem
- "Visualizado por" / "Online"

Se a imagem NAO eh print de mensagem (ex: foto de pessoa, screenshot de outra coisa), retorne string vazia.

Output: APENAS o texto do depoimento, sem markdown nem comentarios.`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Voce le imagens e extrai texto em portugues.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url, detail: 'low' } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 1000,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI: ${r.status} ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { processarDepoimentosNovos, _parsearTexto };
