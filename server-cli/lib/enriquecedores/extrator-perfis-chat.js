// ============================================================
// extrator-perfis-chat.js — enriquecedor (V3)
// ============================================================
// Le mensagens parseadas de um chat WhatsApp e, pra cada AUTOR distinto,
// envia as primeiras N msgs do autor pro LLM decidir:
//   - eh apresentacao de aluno?
//   - se sim: extrai nome_curto, instagram, nicho, dor_principal
//
// Output salva em pinguim.perfis_alunos_chat (extraido_via='llm').
// Idempotente: ON CONFLICT (cerebro_fonte_id, autor) atualiza com novo valor.
//
// Generico: funciona pra qualquer desafio/produto que tenha chat WhatsApp.
// Sem hardcoded de nicho, nome de admin, etc — LLM generaliza.
// ============================================================

const db = require('../db');

const MAX_MSGS_POR_AUTOR = 5;       // primeiras 5 msgs do autor pro contexto
const MIN_CHARS_AUTOR = 30;         // ignora autores com so reacao "obrigada", emoji, etc
const CUSTO_INPUT_USD_PER_M = 0.150;   // gpt-4o-mini input ~$0.15/M tokens
const CUSTO_OUTPUT_USD_PER_M = 0.600;  // ~$0.60/M tokens
const TOKENS_POR_CHAR_APROX = 0.25;    // estimativa grosseira

async function executar({ cerebro_id, cerebro_fonte_id, texto, extras, prompt_template, modelo_llm, on_log }) {
  // Espera que ingerir-chat-drive tenha passado msgs parseadas em extras.msgs
  // Se nao passou, re-parse aqui
  const msgs = extras.msgs || _parsearMensagens(texto);
  if (!Array.isArray(msgs) || msgs.length === 0) {
    on_log({ etapa: 'sem_mensagens' });
    return { itens_gerados: 0, custo_usd: 0 };
  }

  // Agrupa msgs por autor (excluindo sistema)
  const porAutor = new Map();
  for (const m of msgs) {
    if (m.eh_sistema) continue;
    if (!porAutor.has(m.autor)) porAutor.set(m.autor, []);
    porAutor.get(m.autor).push(m);
  }

  on_log({ etapa: 'autores_detectados', total: porAutor.size });

  // Pra cada autor com >=MIN_CHARS de conteudo, chama LLM
  const apiKey = await db.lerChaveSistema('OPENAI_API_KEY', 'extrator-perfis-chat');
  if (!apiKey) throw new Error('OPENAI_API_KEY nao encontrada no cofre');

  const modeloId = (modelo_llm || 'openai:gpt-4o-mini').replace(/^openai:/, '');
  let custoTotal = 0;
  let itens = 0;
  let analisados = 0;

  for (const [autor, autorMsgs] of porAutor.entries()) {
    const primeiras = autorMsgs.slice(0, MAX_MSGS_POR_AUTOR);
    const totalChars = primeiras.reduce((acc, m) => acc + (m.texto || '').length, 0);
    if (totalChars < MIN_CHARS_AUTOR) continue;  // descarta interacoes triviais

    const mensagensFormatadas = primeiras.map((m, i) => `[${i+1}] ${m.texto}`).join('\n');
    const prompt = prompt_template
      .replace('{autor}', autor)
      .replace('{mensagens}', mensagensFormatadas);

    try {
      analisados++;
      const t0 = Date.now();
      const resposta = await chamarLLM({ apiKey, modeloId, prompt });
      const dur = Date.now() - t0;

      // Estimativa de custo (gpt-4o-mini)
      const tokensIn = Math.ceil(prompt.length * TOKENS_POR_CHAR_APROX);
      const tokensOut = Math.ceil(resposta.length * TOKENS_POR_CHAR_APROX);
      const custo = (tokensIn / 1e6) * CUSTO_INPUT_USD_PER_M + (tokensOut / 1e6) * CUSTO_OUTPUT_USD_PER_M;
      custoTotal += custo;

      const dados = _parseJsonSeguro(resposta);
      if (!dados) {
        on_log({ etapa: 'json_invalido', autor, resposta: resposta.slice(0, 200) });
        continue;
      }

      if (dados.eh_apresentacao === false) {
        on_log({ etapa: 'pulou_nao_apresentacao', autor, dur_ms: dur });
        continue;
      }

      // Salva/atualiza perfil
      await db.rodarSQL(`
        INSERT INTO pinguim.perfis_alunos_chat
          (cerebro_id, cerebro_fonte_id, autor, instagram, primeira_mencao_em, primeira_mensagem,
           total_msgs, nicho_hints, nome_curto, nicho, dor_principal, eh_admin, extraido_via, extraido_em)
        VALUES (
          '${cerebro_id}'::uuid,
          '${cerebro_fonte_id}'::uuid,
          ${esc(autor)},
          ${esc(dados.instagram || null)},
          ${esc(`${primeiras[0].data} ${primeiras[0].hora}`)},
          ${esc(primeiras[0].texto.slice(0, 500))},
          ${autorMsgs.length},
          ARRAY[]::text[],
          ${esc(dados.nome_curto || null)},
          ${esc(dados.nicho || null)},
          ${esc(dados.dor_principal || null)},
          ${dados.eh_admin === true ? 'true' : 'false'},
          'llm',
          now()
        )
        ON CONFLICT (cerebro_fonte_id, autor) DO UPDATE SET
          instagram = COALESCE(EXCLUDED.instagram, pinguim.perfis_alunos_chat.instagram),
          nome_curto = COALESCE(EXCLUDED.nome_curto, pinguim.perfis_alunos_chat.nome_curto),
          nicho = COALESCE(EXCLUDED.nicho, pinguim.perfis_alunos_chat.nicho),
          dor_principal = COALESCE(EXCLUDED.dor_principal, pinguim.perfis_alunos_chat.dor_principal),
          eh_admin = EXCLUDED.eh_admin,
          total_msgs = EXCLUDED.total_msgs,
          extraido_via = 'llm',
          extraido_em = now();
      `);
      itens++;
      on_log({ etapa: 'extraiu', autor, nome: dados.nome_curto, nicho: dados.nicho, ig: dados.instagram, eh_admin: dados.eh_admin, dur_ms: dur, custo_usd: custo.toFixed(6) });
    } catch (e) {
      on_log({ etapa: 'erro_autor', autor, erro: e.message });
    }
  }

  return { itens_gerados: itens, custo_usd: parseFloat(custoTotal.toFixed(6)), analisados };
}

async function chamarLLM({ apiKey, modeloId, prompt }) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modeloId,
      messages: [
        { role: 'system', content: 'Voce devolve APENAS JSON puro, sem markdown nem comentario.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

function _parseJsonSeguro(s) {
  try { return JSON.parse(s); } catch {}
  // tenta extrair JSON entre primeiro { e ultimo }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// Fallback parser embutido se extras.msgs nao veio
function _parsearMensagens(texto) {
  const linhas = (texto || '').split('\n');
  const REGEX_IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+?):\s*(.*)$/;
  const REGEX_ANDROID = /^(\d{1,2}\/\d{1,2}\/\d{2,4})[\s,]+(\d{1,2}:\d{2}(?::\d{2})?)\s*[-]\s*([^:]+?):\s*(.*)$/;
  const msgs = [];
  let atual = null;
  for (const linha of linhas) {
    const limpa = linha.replace(/‎|‏/g, '');
    const m = limpa.match(REGEX_IOS) || limpa.match(REGEX_ANDROID);
    if (m) {
      if (atual) msgs.push(atual);
      atual = { data: m[1], hora: m[2], autor: m[3].trim(), texto: (m[4] || '').trim(), eh_sistema: false };
    } else if (atual && limpa.trim()) {
      atual.texto += '\n' + limpa.trim();
    }
  }
  if (atual) msgs.push(atual);
  return msgs;
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { executar };
