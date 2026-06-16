// ============================================================
// vetorizar-fonte.js — V3 (2026-06-16)
// ============================================================
// Helper unificado pra todo ingestor chamar APOS salvar em cerebro_fontes.
// Chama Edge Function revetorizar-fonte (mission-control/supabase/functions)
// que faz chunk + embedding text-embedding-3-small + insert em
// cerebro_fontes_chunks + UPDATE ingest_status='ok'.
//
// REGRA DURA: toda ingestao do server-cli (mídia, chat, página, pesquisa,
// depoimento, etc) chama essa função logo após inserir cerebro_fontes.
// Sem vetorização, fonte é invisível pro RAG dos agentes.
//
// Tolerante a falhas: se Edge function falhar, NAO bloqueia a ingestao.
// Loga o erro e segue — a fonte fica com ingest_status='pendente' pra
// retry posterior via cron de backfill.
// ============================================================

const path = require('path');
const fs = require('fs');

function _carregarEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const _env = _carregarEnv();

/**
 * Vetoriza uma fonte recém-salva chamando a Edge Function revetorizar-fonte.
 * NUNCA propaga exceção — sempre retorna {ok, chunks?, custo_usd?, erro?}.
 *
 * @param {string} fonte_id - UUID da row em cerebro_fontes
 * @param {object} [opts]
 * @param {boolean} [opts.silencioso=false] - se true, não loga erro no console
 * @returns {Promise<{ok: boolean, chunks?: number, custo_usd?: number, erro?: string}>}
 */
async function vetorizarFonte(fonte_id, { silencioso = false } = {}) {
  if (!fonte_id) return { ok: false, erro: 'fonte_id obrigatorio' };

  const supabaseUrl = _env.SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = _env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    const erro = 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes';
    if (!silencioso) console.warn(`[vetorizar-fonte] ${erro}`);
    return { ok: false, erro };
  }

  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/revetorizar-fonte`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fonte_id }),
    });
    if (!r.ok) {
      const t = await r.text();
      const erro = `HTTP ${r.status}: ${t.slice(0, 200)}`;
      if (!silencioso) console.warn(`[vetorizar-fonte] ${fonte_id}: ${erro}`);
      return { ok: false, erro };
    }
    const data = await r.json();
    return { ok: true, chunks: data.chunks || 0, custo_usd: data.custo_usd || 0 };
  } catch (e) {
    const erro = e.message || String(e);
    if (!silencioso) console.warn(`[vetorizar-fonte] ${fonte_id}: ${erro}`);
    return { ok: false, erro };
  }
}

module.exports = { vetorizarFonte };
