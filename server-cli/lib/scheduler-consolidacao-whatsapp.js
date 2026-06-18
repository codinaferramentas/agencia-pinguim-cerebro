// ============================================================
// scheduler-consolidacao-whatsapp.js — V1 (2026-06-18)
// ============================================================
// Loop background no server-cli. Roda 1x/semana — DOMINGO 4h BRT (7h UTC).
// Pra cada grupo ativo em whatsapp_grupos_monitorados, consolida ultimos
// 7 dias num markdown e salva como cerebro_fonte tipo chat_export.
//
// Anti-disparo-duplo: se rodou nas ultimas 6 dias, pula.
// ============================================================

const { consolidarTodosGruposAtivos } = require('./consolidar-chat-grupo-semanal');

const INTERVALO_MS = 60 * 60 * 1000; // confere a cada hora
const HORA_UTC_ALVO = 7;             // 4h BRT
const DIA_SEMANA_ALVO = 0;           // domingo (0=dom, 1=seg, ...)

let _rodando = false;
let _parar = false;
let _stats = { ciclos: 0, ultimo_ciclo_em: null, ultima_execucao_em: null, ultimo_resultado: null, ultimo_erro: null };

function iniciar() {
  if (_rodando) { console.log('[scheduler-wa-consolidacao] ja rodando'); return; }
  _rodando = true;
  _parar = false;
  console.log(`[scheduler-wa-consolidacao] iniciado (roda domingo ${HORA_UTC_ALVO}h UTC = 4h BRT)`);
  _loop();
}

function parar() { _parar = true; }
function status() { return { rodando: _rodando, ..._stats }; }

async function _loop() {
  setTimeout(() => _maybeExecutar().catch(e => console.error('[sched-wa-cons] erro inicial:', e.message)), 30_000);
  while (!_parar) {
    await _sleep(INTERVALO_MS);
    if (_parar) break;
    try { await _maybeExecutar(); }
    catch (e) {
      _stats.ultimo_erro = e.message || String(e);
      console.error('[sched-wa-cons] erro:', _stats.ultimo_erro);
    }
  }
  _rodando = false;
  console.log('[sched-wa-cons] parado');
}

async function _maybeExecutar() {
  _stats.ciclos++;
  _stats.ultimo_ciclo_em = new Date().toISOString();

  const agora = new Date();
  const diaSemana = agora.getUTCDay();
  const horaUTC = agora.getUTCHours();

  if (diaSemana !== DIA_SEMANA_ALVO) return;
  if (horaUTC !== HORA_UTC_ALVO) return;

  // Anti-disparo-duplo: 6 dias
  if (_stats.ultima_execucao_em) {
    const diff = agora.getTime() - new Date(_stats.ultima_execucao_em).getTime();
    if (diff < 6 * 24 * 60 * 60 * 1000) return;
  }

  console.log('[sched-wa-cons] disparando consolidacao semanal');
  const r = await consolidarTodosGruposAtivos({
    on_log: (ev) => console.log(`  ${JSON.stringify(ev).slice(0, 300)}`),
  });
  _stats.ultima_execucao_em = new Date().toISOString();
  _stats.ultimo_resultado = r;
  console.log(`[sched-wa-cons] OK: ${r.length} grupos | ${JSON.stringify(r.map(g => ({n: g.grupo, msgs: g.qtd_msgs})))}`);
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { iniciar, parar, status };
