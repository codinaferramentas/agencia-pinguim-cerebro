// ============================================================
// scheduler-depoimentos.js — V3 (2026-06-16)
// ============================================================
// Loop background no server-cli. Roda 1x por dia (4h BRT = 7h UTC)
// processarDepoimentosNovos pra raspar canal Discord #depoimentos,
// rotear pra cada cerebro de produto, salvar e vetorizar.
//
// Vantagem de ser scheduler dedicado (vs criar categoria por cerebro):
// o motor le UM canal e DISTRIBUI pros cerebros conforme o produto
// mencionado. Logica de roteamento centralizada.
// ============================================================

const { processarDepoimentosNovos } = require('./processar-depoimento');

const INTERVALO_MS = 60 * 60 * 1000; // confere a cada hora se cabe rodar
const HORA_UTC_ALVO = 7;  // 4h BRT = 7h UTC

let _rodando = false;
let _parar = false;
let _stats = { ciclos: 0, ultimo_ciclo_em: null, ultima_execucao_em: null, ultimo_resultado: null, ultimo_erro: null };

function iniciar() {
  if (_rodando) {
    console.log('[scheduler-depoimentos] ja rodando');
    return;
  }
  _rodando = true;
  _parar = false;
  console.log(`[scheduler-depoimentos] iniciado (roda 1x/dia as ${HORA_UTC_ALVO}h UTC = 4h BRT)`);
  _loop();
}

function parar() { _parar = true; }
function status() { return { rodando: _rodando, ..._stats }; }

async function _loop() {
  setTimeout(() => _maybeExecutar().catch(e => console.error('[sched-depoimentos] erro inicial:', e.message)), 30_000);
  while (!_parar) {
    await _sleep(INTERVALO_MS);
    if (_parar) break;
    try { await _maybeExecutar(); }
    catch (e) {
      _stats.ultimo_erro = e.message || String(e);
      console.error('[sched-depoimentos] erro:', _stats.ultimo_erro);
    }
  }
  _rodando = false;
  console.log('[sched-depoimentos] parado');
}

async function _maybeExecutar() {
  _stats.ciclos++;
  _stats.ultimo_ciclo_em = new Date().toISOString();

  const agora = new Date();
  const horaUTC = agora.getUTCHours();
  if (horaUTC !== HORA_UTC_ALVO) return;  // so executa no horario alvo

  // Anti-disparo-duplo: se rodou nas ultimas 23h, pula
  if (_stats.ultima_execucao_em) {
    const diff = agora.getTime() - new Date(_stats.ultima_execucao_em).getTime();
    if (diff < 23 * 60 * 60 * 1000) return;
  }

  console.log('[sched-depoimentos] disparando — janela diaria 4h BRT');
  const r = await processarDepoimentosNovos({
    limite: 500,
    on_log: (ev) => console.log(`  ${JSON.stringify(ev).slice(0, 200)}`),
  });
  _stats.ultima_execucao_em = new Date().toISOString();
  _stats.ultimo_resultado = r;
  console.log(`[sched-depoimentos] OK: processados=${r.processados} pendentes=${r.pendentes} falhas=${r.falhas} custo=$${r.custo_usd}`);
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { iniciar, parar, status };
