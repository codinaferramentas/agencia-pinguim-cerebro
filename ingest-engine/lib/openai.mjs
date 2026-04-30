import OpenAI from 'openai';
import { env } from './env.mjs';
import { getChave } from './cofre.mjs';

let _client = null;
let _clientPromise = null;

// Async — busca chave do cofre na primeira vez (com fallback .env)
export async function openaiAsync() {
  if (_client) return _client;
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    let apiKey;
    try {
      apiKey = await getChave('OPENAI_API_KEY', 'ingest-engine-local');
    } catch (e) {
      // fallback final: env.mjs (.env.local)
      apiKey = env().OPENAI_API_KEY;
    }
    _client = new OpenAI({ apiKey });
    return _client;
  })();
  return _clientPromise;
}

// Sync legado — usado em codigo antigo. Tenta env primeiro, deixa cofre pro caminho async.
export function openai() {
  if (_client) return _client;
  const cfg = env();
  _client = new OpenAI({ apiKey: cfg.OPENAI_API_KEY });
  return _client;
}

/**
 * Gera embedding de 1 ou N textos.
 * Retorna array de vetores (1536 dims).
 */
export async function embed(texts) {
  const cfg = env();
  const client = openai();
  const arr = Array.isArray(texts) ? texts : [texts];
  const res = await client.embeddings.create({
    model: cfg.EMBEDDING_MODEL,
    input: arr,
  });
  return res.data.map(d => d.embedding);
}

/**
 * Transcreve áudio via Whisper API.
 * @param {string} filePath caminho local do .mp3/.m4a/.wav
 */
export async function transcribe(filePath) {
  const client = openai();
  const fs = await import('fs');
  const res = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file: fs.createReadStream(filePath),
    response_format: 'text',
    language: 'pt',
  });
  return res; // string com transcrição
}

/**
 * Classifica um trecho num dos tipos suportados.
 * Input mínimo: nome do arquivo + primeiras ~200 palavras.
 * Retorna { tipo, confianca, justificativa } ou null se erro.
 */
const TIPOS_PERMITIDOS = [
  'aula', 'pagina_venda', 'depoimento', 'objecao', 'sacada',
  'pesquisa', 'chat_export', 'pitch', 'faq', 'externo', 'csv', 'persona', 'outro',
];

export async function classificarFonte({ nome, amostra }) {
  const cfg = env();
  const client = openai();

  const prompt = `Você recebe o NOME de um arquivo e uma AMOSTRA do seu conteúdo.
Classifique em UM destes tipos de fonte pra um Cérebro de produto digital:

- aula: transcrição de vídeo-aula, conteúdo educacional estruturado
- pagina_venda: copy de landing page, VSL, anúncio de produto
- depoimento: relato/feedback de cliente, antes-e-depois, prova social
- objecao: dúvida ou resistência recorrente do público
- sacada: insight, jabá interno, argumento de venda do expert
- pesquisa: resultado de pesquisa/form com alunos (CSV ou resumo)
- chat_export: export bruto de chat (WhatsApp, Telegram, Discord)
- pitch: roteiro de fala, abertura de live, argumentação
- faq: pergunta-resposta de suporte, FAQ, documentação
- externo: URL ou texto de fora (podcast, artigo, benchmark)
- csv: planilha estruturada (vendas, leads, métricas)
- persona: descrição de avatar/ICP do produto
- outro: não se encaixa em nenhum dos anteriores

Responda APENAS com JSON válido neste formato (sem markdown, sem explicação fora do JSON):
{"tipo": "...", "confianca": 0.00, "justificativa": "..."}

confianca vai de 0.00 (chute) a 1.00 (certeza total).
justificativa é uma frase curta em português dizendo por quê.

NOME DO ARQUIVO:
${nome}

AMOSTRA DO CONTEÚDO (primeiras palavras):
${amostra}`;

  try {
    const res = await client.chat.completions.create({
      model: cfg.CLASSIFIER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    const raw = res.choices[0]?.message?.content;
    const parsed = JSON.parse(raw);
    if (!TIPOS_PERMITIDOS.includes(parsed.tipo)) {
      return { tipo: 'outro', confianca: 0.3, justificativa: 'tipo retornado fora da lista: ' + parsed.tipo };
    }
    return {
      tipo: parsed.tipo,
      confianca: Number(parsed.confianca) || 0.5,
      justificativa: String(parsed.justificativa || ''),
      tokens_input: res.usage?.prompt_tokens || 0,
      tokens_output: res.usage?.completion_tokens || 0,
    };
  } catch (e) {
    return { tipo: 'outro', confianca: 0, justificativa: 'erro LLM: ' + e.message };
  }
}

/**
 * Custo estimado (em USD) da classificação
 * gpt-4o-mini: $0.15/1M input, $0.60/1M output
 */
export function custoClassificacao({ tokens_input, tokens_output }) {
  const i = (tokens_input || 0) / 1_000_000 * 0.15;
  const o = (tokens_output || 0) / 1_000_000 * 0.60;
  return i + o;
}

/**
 * Custo do embedding
 * text-embedding-3-small: $0.02/1M tokens
 */
export function custoEmbedding(tokens) {
  return (tokens / 1_000_000) * 0.02;
}
