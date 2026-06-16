// ============================================================
// extrator-perfis-pesquisa.js — enriquecedor (V3)
// ============================================================
// Le uma resposta de pesquisa (tipo 'resposta_pesquisa') e extrai perfil
// estruturado do respondente: nome, email, whatsapp, instagram, idade,
// genero, nicho, profissao, dor_principal, expectativa.
//
// Generico — funciona pra qualquer pesquisa (YA Forms, Tally, Typeform) e
// pra qualquer cerebro. LLM decide mapeamento a partir do markdown ja
// formatado pelo webhook-cerebro.
//
// Output: pinguim.perfis_alunos_chat (mesma tabela do extrator-chat,
// origem='pesquisa' pra rastrear)
// ============================================================

const db = require('../db');

const CUSTO_INPUT_USD_PER_M = 0.150;
const CUSTO_OUTPUT_USD_PER_M = 0.600;
const TOKENS_POR_CHAR_APROX = 0.25;

async function executar({ cerebro_id, cerebro_fonte_id, texto, extras, prompt_template, modelo_llm, on_log }) {
  if (!texto || texto.length < 50) {
    on_log({ etapa: 'texto_vazio' });
    return { itens_gerados: 0, custo_usd: 0 };
  }

  const apiKey = await db.lerChaveSistema('OPENAI_API_KEY', 'extrator-perfis-pesquisa');
  if (!apiKey) throw new Error('OPENAI_API_KEY nao encontrada no cofre');

  const modeloId = (modelo_llm || 'openai:gpt-4o-mini').replace(/^openai:/, '');

  const prompt = (prompt_template || PROMPT_DEFAULT).replace('{texto}', texto);

  const t0 = Date.now();
  const resposta = await chamarLLM({ apiKey, modeloId, prompt });
  const dur = Date.now() - t0;

  const tokensIn = Math.ceil(prompt.length * TOKENS_POR_CHAR_APROX);
  const tokensOut = Math.ceil(resposta.length * TOKENS_POR_CHAR_APROX);
  const custo = (tokensIn / 1e6) * CUSTO_INPUT_USD_PER_M + (tokensOut / 1e6) * CUSTO_OUTPUT_USD_PER_M;

  const dados = _parseJsonSeguro(resposta);
  if (!dados || dados.eh_resposta_valida === false) {
    on_log({ etapa: 'resposta_invalida', dur_ms: dur });
    return { itens_gerados: 0, custo_usd: custo };
  }

  // Usa nome_completo como "autor" pra unique key (resposta + autor)
  // Se vazio, usa email, depois instagram, depois cerebro_fonte_id como fallback
  const autor = dados.nome_completo || dados.email || dados.instagram || `pesquisa-${cerebro_fonte_id.slice(0, 8)}`;

  await db.rodarSQL(`
    INSERT INTO pinguim.perfis_alunos_chat
      (cerebro_id, cerebro_fonte_id, autor, instagram, primeira_mencao_em, primeira_mensagem,
       total_msgs, nicho_hints, nome_curto, nicho, dor_principal, eh_admin, extraido_via, extraido_em)
    VALUES (
      '${cerebro_id}'::uuid,
      '${cerebro_fonte_id}'::uuid,
      ${esc(autor)},
      ${esc(dados.instagram || null)},
      ${esc(dados.respondido_em || null)},
      ${esc((dados.dor_principal || dados.expectativa || '').slice(0, 500) || null)},
      1,
      ARRAY[]::text[],
      ${esc(dados.nome_curto || null)},
      ${esc(dados.nicho || null)},
      ${esc(dados.dor_principal || null)},
      false,
      'llm-pesquisa',
      now()
    )
    ON CONFLICT (cerebro_fonte_id, autor) DO UPDATE SET
      instagram = COALESCE(EXCLUDED.instagram, pinguim.perfis_alunos_chat.instagram),
      nome_curto = COALESCE(EXCLUDED.nome_curto, pinguim.perfis_alunos_chat.nome_curto),
      nicho = COALESCE(EXCLUDED.nicho, pinguim.perfis_alunos_chat.nicho),
      dor_principal = COALESCE(EXCLUDED.dor_principal, pinguim.perfis_alunos_chat.dor_principal),
      extraido_via = 'llm-pesquisa',
      extraido_em = now();
  `);

  on_log({ etapa: 'extraiu', nome: dados.nome_curto, nicho: dados.nicho, ig: dados.instagram, dur_ms: dur, custo_usd: custo.toFixed(6) });
  return { itens_gerados: 1, custo_usd: parseFloat(custo.toFixed(6)) };
}

const PROMPT_DEFAULT = `Voce esta analisando 1 resposta de pesquisa/formulario de aluno de um desafio/curso.

A resposta vem em markdown com "## Contexto" + "## Respostas" (lista de perguntas e respostas livres do aluno).

Sua tarefa: extrair perfil estruturado do RESPONDENTE.

Output JSON puro (sem markdown):
{
  "eh_resposta_valida": boolean,        // false se markdown vazio/lixo
  "nome_completo": string|null,
  "nome_curto": string|null,            // primeiro nome
  "email": string|null,
  "whatsapp": string|null,
  "instagram": string|null,             // sempre com @
  "idade_faixa": string|null,           // "18-25", "26-35", "36-45", "46-55", "56+"
  "genero": string|null,
  "estado_civil": string|null,
  "renda_faixa": string|null,           // string como veio
  "escolaridade": string|null,
  "cidade": string|null,
  "estado_uf": string|null,
  "nicho": string|null,                 // sintetiza em ate 40 chars o nicho/area principal
  "profissao": string|null,             // profissao especifica se mencionou
  "vende": string|null,                 // o que vende (servico/produto)
  "seguidores_instagram": number|null,  // se mencionou numero exato
  "dor_principal": string|null,         // ate 200 chars, copia voz do respondente
  "expectativa": string|null,           // o que considera sucesso do desafio
  "objecao": string|null                // o que quase impediu de se inscrever
}

Markdown da resposta:
{texto}`;

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
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { executar };
