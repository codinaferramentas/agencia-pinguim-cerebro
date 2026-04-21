/**
 * Extração de texto por tipo de arquivo.
 * Input: buffer + mime/extensão. Output: texto em markdown normalizado.
 *
 * Implementações:
 *   - .pdf      → pdf-parse (sem OCR; se for scan, vai falhar e ficar vazio)
 *   - .docx     → mammoth
 *   - .txt/.md  → direto (UTF-8)
 *   - .csv      → texto com tabulação preservada
 *   - .json     → stringify bonito
 *   - .mp3/.m4a/.wav → Whisper API (async, via openai.transcribe)
 *   - outros    → tenta UTF-8; se binário, retorna null
 */
import path from 'node:path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.log']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.mp4', '.webm']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic']);

export function tipoArquivo(nome) {
  const ext = path.extname(nome).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.doc') return 'doc_legacy';
  if (TEXT_EXTS.has(ext)) return 'text';
  if (ext === '.csv') return 'csv';
  if (ext === '.json') return 'json';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'unknown';
}

/**
 * Extrai texto em markdown de um buffer + nome.
 * Retorna { text, meta } ou { text: null, meta: { reason } } se não foi possível.
 * Para áudio, retorna { audio: true, path } — chamador decide se transcreve.
 */
export async function extrairTexto({ nome, buffer, caminho }) {
  const tipo = tipoArquivo(nome);

  try {
    if (tipo === 'pdf') {
      const data = await pdf(buffer);
      return {
        text: normalizar(data.text || ''),
        meta: { paginas: data.numpages, fonte_formato: 'pdf' },
      };
    }

    if (tipo === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer });
      return { text: normalizar(value || ''), meta: { fonte_formato: 'docx' } };
    }

    if (tipo === 'text') {
      return { text: normalizar(buffer.toString('utf8')), meta: { fonte_formato: 'text' } };
    }

    if (tipo === 'csv') {
      const raw = buffer.toString('utf8');
      return { text: csvParaMarkdown(raw), meta: { fonte_formato: 'csv' } };
    }

    if (tipo === 'json') {
      try {
        const obj = JSON.parse(buffer.toString('utf8'));
        return { text: '```json\n' + JSON.stringify(obj, null, 2) + '\n```', meta: { fonte_formato: 'json' } };
      } catch {
        return { text: buffer.toString('utf8'), meta: { fonte_formato: 'json_raw' } };
      }
    }

    if (tipo === 'html') {
      // strip tags simples
      const raw = buffer.toString('utf8');
      const sem = raw.replace(/<script[\s\S]*?<\/script>/gi, '')
                     .replace(/<style[\s\S]*?<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/&nbsp;/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();
      return { text: normalizar(sem), meta: { fonte_formato: 'html' } };
    }

    if (tipo === 'audio') {
      // sinaliza que precisa de Whisper (chamador lida com o custo)
      return {
        audio: true,
        path: caminho,
        nome,
        meta: { fonte_formato: 'audio' },
      };
    }

    if (tipo === 'image') {
      // V0: não fazemos OCR local. Avisa chamador.
      return {
        text: null,
        skip: true,
        meta: { fonte_formato: 'image', reason: 'OCR não implementado nesta versão' },
      };
    }

    return { text: null, skip: true, meta: { fonte_formato: 'unknown', reason: 'formato não suportado' } };

  } catch (e) {
    return { text: null, erro: e.message, meta: { fonte_formato: tipo } };
  }
}

function normalizar(texto) {
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function csvParaMarkdown(raw) {
  // Simples: detecta separador (, ou ;) e gera tabela MD do header + 10 primeiras linhas como preview
  const linhas = raw.split('\n').filter(l => l.trim());
  if (linhas.length === 0) return '';
  const sep = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const header = linhas[0].split(sep);
  const preview = linhas.slice(1, 11);
  let md = `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`;
  preview.forEach(l => {
    const cols = l.split(sep);
    md += `| ${cols.join(' | ')} |\n`;
  });
  if (linhas.length > 11) md += `\n_... +${linhas.length - 11} linhas adicionais_\n`;
  return md;
}

export function amostra(texto, palavras = 200) {
  if (!texto) return '';
  const words = texto.split(/\s+/);
  return words.slice(0, palavras).join(' ');
}
