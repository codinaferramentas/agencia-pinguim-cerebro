/**
 * Chunker de texto por tokens (usa tiktoken encoding cl100k_base, usada pelos
 * modelos OpenAI modernos de embedding e gpt-4o).
 *
 * Estratégia: sliding window com overlap.
 */
import { Tiktoken } from 'tiktoken/lite';
import cl100k from 'tiktoken/encoders/cl100k_base.json' with { type: 'json' };
import { env } from './env.mjs';

let _enc = null;
function enc() {
  if (_enc) return _enc;
  _enc = new Tiktoken(cl100k.bpe_ranks, cl100k.special_tokens, cl100k.pat_str);
  return _enc;
}

/**
 * Quebra um texto em chunks de ~CHUNK_SIZE tokens com CHUNK_OVERLAP de sobreposição.
 * Retorna array de { conteudo, token_count, chunk_index }.
 */
export function chunkText(texto, opts = {}) {
  const cfg = env();
  const size = opts.size || cfg.CHUNK_SIZE;
  const overlap = opts.overlap || cfg.CHUNK_OVERLAP;

  if (!texto || !texto.trim()) return [];

  const encoder = enc();
  const tokens = encoder.encode(texto);

  if (tokens.length <= size) {
    return [{
      chunk_index: 0,
      conteudo: texto,
      token_count: tokens.length,
    }];
  }

  const chunks = [];
  let start = 0;
  let idx = 0;

  while (start < tokens.length) {
    const end = Math.min(start + size, tokens.length);
    const slice = tokens.slice(start, end);
    // Decode volta pra string
    const bytes = encoder.decode(slice);
    const conteudo = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);

    chunks.push({
      chunk_index: idx++,
      conteudo: conteudo.trim(),
      token_count: slice.length,
    });

    if (end >= tokens.length) break;
    start = end - overlap;
  }

  return chunks;
}

/**
 * Conta tokens de um texto (pra estimativas e controle de prompt).
 */
export function countTokens(texto) {
  if (!texto) return 0;
  return enc().encode(texto).length;
}
