// ============================================================
// transcrever-midia.js — V3 (2026-06-16)
// ============================================================
// Lib GENERICA de transcricao de midia (audio/video) usando Whisper API OpenAI.
//
// Aceita qualquer arquivo binario (MP4, MP3, M4A, OGG, MOV, WAV, MKV...).
// Pipeline:
//   1) Se for video ou audio grande, extrai audio MP3 mono 16kHz com ffmpeg
//      (reduz drasticamente o tamanho: 1h vira ~5-10MB)
//   2) Se ainda passar de 24MB (limite Whisper), chunk em N pedacos via ffmpeg
//   3) Transcreve cada chunk via Whisper API (lib/audio-transcricao.js)
//   4) Concatena resultados, retorna texto + metadata
//
// Reutilizavel por qualquer fonte de aulas/calls/audio raspado. Nao especifica
// de Lo-Fi nem de produto algum.
// ============================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { transcrever } = require('./audio-transcricao');

const MAX_BYTES_WHISPER = 24 * 1024 * 1024; // Whisper limite 25MB; deixo margem
const CHUNK_DURATION_S = 600;                 // 10 minutos por chunk se precisar dividir

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d.toString(); });
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exit ${code}: ${stderr.slice(0, 400)}`));
    });
    p.on('error', reject);
  });
}

// ============================================================
// Extrai audio MP3 mono 16kHz (reduz tamanho drasticamente)
// ============================================================
async function extrairAudioMp3({ entrada_path, saida_path }) {
  // -vn = no video; -ac 1 = mono; -ar 16000 = 16kHz suficiente pra fala;
  // -b:a 32k = bitrate baixo, qualidade boa pra voz; -y = sobrescreve
  await runCmd('ffmpeg', [
    '-y', '-i', entrada_path,
    '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k',
    '-f', 'mp3', saida_path,
  ]);
  return saida_path;
}

// ============================================================
// Duracao do arquivo em segundos via ffprobe
// ============================================================
async function duracaoSegundos(arquivo_path) {
  const { stdout } = await runCmd('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    arquivo_path,
  ]);
  return Math.ceil(parseFloat(stdout.trim()) || 0);
}

// ============================================================
// Divide MP3 em chunks de N segundos
// ============================================================
async function chunkarMp3({ mp3_path, dir_chunks, segundos_chunk = CHUNK_DURATION_S }) {
  const padrao = path.join(dir_chunks, 'chunk-%03d.mp3');
  await runCmd('ffmpeg', [
    '-y', '-i', mp3_path,
    '-f', 'segment', '-segment_time', String(segundos_chunk),
    '-c', 'copy', padrao,
  ]);
  const arquivos = fs.readdirSync(dir_chunks)
    .filter(f => f.startsWith('chunk-') && f.endsWith('.mp3'))
    .sort()
    .map(f => path.join(dir_chunks, f));
  return arquivos;
}

// ============================================================
// API PUBLICA — recebe arquivo e devolve transcricao
// ============================================================
// Opcoes:
//   arquivo_path (string)   — path local do MP4/MP3/MOV etc
//   arquivo_buffer (Buffer) — alternativa ao path, ja em memoria
//   filename (string)       — nome do arquivo (pra deteccao + log)
//   language (string)       — codigo idioma (default 'pt')
//   on_progress (fn)        — callback opcional pra logar etapas
//
// Retorna:
//   { texto, duracao_segundos, bytes_origem, bytes_mp3, chunks, ms_total }
async function transcreverMidia({
  arquivo_path,
  arquivo_buffer,
  filename,
  language = 'pt',
  on_progress = () => {},
} = {}) {
  if (!arquivo_path && !arquivo_buffer) {
    throw new Error('arquivo_path OU arquivo_buffer obrigatorio');
  }

  const t0 = Date.now();
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinguim-transcr-'));
  let entradaPath = arquivo_path;

  try {
    // 1. Se veio buffer, salva em temp
    if (!entradaPath && arquivo_buffer) {
      entradaPath = path.join(tmpdir, filename || 'entrada.bin');
      fs.writeFileSync(entradaPath, arquivo_buffer);
    }
    const bytesOrigem = fs.statSync(entradaPath).size;
    on_progress({ etapa: 'iniciar', filename: filename || path.basename(entradaPath), bytes_origem: bytesOrigem });

    // 2. Extrai audio MP3 (sempre — barateia o resto)
    on_progress({ etapa: 'extrair_audio' });
    const mp3Path = path.join(tmpdir, 'audio.mp3');
    await extrairAudioMp3({ entrada_path: entradaPath, saida_path: mp3Path });
    const bytesMp3 = fs.statSync(mp3Path).size;
    const segundos = await duracaoSegundos(mp3Path);
    on_progress({ etapa: 'audio_extraido', bytes_mp3: bytesMp3, duracao_segundos: segundos });

    // 3. Decide se precisa chunkar
    let chunksPaths;
    if (bytesMp3 <= MAX_BYTES_WHISPER) {
      chunksPaths = [mp3Path];
    } else {
      on_progress({ etapa: 'chunkar' });
      chunksPaths = await chunkarMp3({ mp3_path: mp3Path, dir_chunks: tmpdir });
    }
    on_progress({ etapa: 'chunks_prontos', total_chunks: chunksPaths.length });

    // 4. Transcreve chunk a chunk via Whisper API
    const trechos = [];
    for (let i = 0; i < chunksPaths.length; i++) {
      const cpath = chunksPaths[i];
      on_progress({ etapa: 'transcrever_chunk', i: i + 1, total: chunksPaths.length });
      const buf = fs.readFileSync(cpath);
      const { texto } = await transcrever({
        audio_buffer: buf,
        filename: path.basename(cpath),
        language,
        mimetype: 'audio/mpeg',
      });
      trechos.push(texto);
    }

    const texto = trechos.join('\n\n').trim();
    on_progress({ etapa: 'concluido', chars: texto.length });

    return {
      texto,
      duracao_segundos: segundos,
      bytes_origem: bytesOrigem,
      bytes_mp3: bytesMp3,
      chunks: chunksPaths.length,
      ms_total: Date.now() - t0,
    };
  } finally {
    // Limpa temp
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = {
  transcreverMidia,
  // Exports auxiliares pra testes
  _extrairAudioMp3: extrairAudioMp3,
  _duracaoSegundos: duracaoSegundos,
};
