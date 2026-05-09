// ============================================================
// audio-transcricao.js — V2.14 Frente D6 (audio WhatsApp)
// ============================================================
// STT (audio -> texto): OpenAI Whisper-1 (~$0.006/min)
// TTS (texto -> audio): OpenAI TTS-1 voz nova/onyx/etc (~$0.015/1k chars)
// Ambos via API HTTP direto (sem SDK pesado).
//
// Decisao: nao misturar com lib/evolution.js — evolution sabe ENVIAR audio,
// audio-transcricao sabe CRIAR/INTERPRETAR audio. Separation of concerns.
// ============================================================

const db = require('./db');

let _openaiKey = null;
async function getOpenAIKey() {
  if (_openaiKey) return _openaiKey;
  _openaiKey = await db.lerChaveSistema('OPENAI_API_KEY', 'audio-transcricao');
  if (!_openaiKey) throw new Error('OPENAI_API_KEY nao encontrada no cofre');
  return _openaiKey.trim();
}

// ============================================================
// TRANSCREVER audio -> texto (Whisper)
// ============================================================
// audio_buffer: Buffer com bytes do audio (formato OGG opus do WhatsApp funciona)
// filename: nome com extensao (.ogg / .m4a / .mp3) — Whisper detecta pelo content
async function transcrever({ audio_buffer, filename = 'audio.ogg', language = 'pt', mimetype = 'audio/ogg' }) {
  if (!audio_buffer || !Buffer.isBuffer(audio_buffer)) {
    throw new Error('audio_buffer (Buffer) obrigatorio');
  }
  const key = await getOpenAIKey();

  const form = new FormData();
  const blob = new Blob([audio_buffer], { type: mimetype });
  form.append('file', blob, filename);
  form.append('model', 'whisper-1');
  form.append('language', language);
  form.append('response_format', 'json');

  const t0 = Date.now();
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Whisper API ${resp.status}: ${json?.error?.message || JSON.stringify(json).slice(0, 200)}`);
  }
  return {
    texto: json.text || '',
    duracao_ms: Date.now() - t0,
    bytes: audio_buffer.length,
  };
}

// ============================================================
// SINTETIZAR texto -> audio (TTS)
// ============================================================
// voice: alloy / echo / fable / onyx / nova / shimmer
// model: tts-1 (rapido, barato) ou tts-1-hd (alta qualidade, 2x preco)
// formato: mp3 (default) / opus (WhatsApp adora opus) / aac / flac
async function sintetizar({ texto, voice = 'nova', model = 'tts-1', formato = 'opus' }) {
  if (!texto || !texto.trim()) throw new Error('texto obrigatorio');
  const key = await getOpenAIKey();

  // Limita tamanho — TTS aceita ate 4096 chars por request
  const textoLim = texto.length > 4000 ? texto.slice(0, 4000) + '...' : texto;

  const t0 = Date.now();
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: textoLim,
      voice,
      response_format: formato,
    }),
  });
  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => '');
    throw new Error(`TTS API ${resp.status}: ${errTxt.slice(0, 200)}`);
  }
  const arr = await resp.arrayBuffer();
  return {
    buffer: Buffer.from(arr),
    bytes: arr.byteLength,
    voice,
    formato,
    duracao_ms: Date.now() - t0,
  };
}

module.exports = { transcrever, sintetizar };
