// ============================================================
// scheduler-proxima-edicao.js — V1 (2026-06-18 noite)
// ============================================================
// Loop background. Roda 1x/dia (5h BRT = 8h UTC). Faz 2 coisas:
//   1) detectarTodos() — LLM extrai data do proximo evento de cada
//      pagina_venda mais recente, grava em proximas_edicoes
//   2) Se tem edicao com status='atrasado' OU 'pre_aviso',
//      envia WhatsApp pro Andre
//
// Anti-disparo-duplo: 20h.
// ============================================================

const { detectarTodos } = require('./detector-proxima-edicao');
const { rodarSQL } = require('./db');

const INTERVALO_MS = 60 * 60 * 1000; // confere a cada hora
const HORA_UTC_ALVO = 8;             // 5h BRT
const TELEFONE_ANDRE = '5531995052232'; // futuro: tirar do banco

let _rodando = false;
let _parar = false;
let _stats = { ciclos: 0, ultimo_ciclo_em: null, ultima_execucao_em: null, ultimo_resultado: null, ultimo_erro: null };

function iniciar() {
  if (_rodando) { console.log('[sched-proxima-edicao] ja rodando'); return; }
  _rodando = true;
  _parar = false;
  console.log(`[sched-proxima-edicao] iniciado (roda todo dia ${HORA_UTC_ALVO}h UTC = 5h BRT)`);
  _loop();
}

function parar() { _parar = true; }
function status() { return { rodando: _rodando, ..._stats }; }

async function _loop() {
  setTimeout(() => _maybeExecutar().catch(e => console.error('[sched-proxima-edicao] erro inicial:', e.message)), 30_000);
  while (!_parar) {
    await _sleep(INTERVALO_MS);
    if (_parar) break;
    try { await _maybeExecutar(); }
    catch (e) {
      _stats.ultimo_erro = e.message || String(e);
      console.error('[sched-proxima-edicao] erro:', _stats.ultimo_erro);
    }
  }
  _rodando = false;
  console.log('[sched-proxima-edicao] parado');
}

async function _maybeExecutar() {
  _stats.ciclos++;
  _stats.ultimo_ciclo_em = new Date().toISOString();

  const agora = new Date();
  const horaUTC = agora.getUTCHours();
  if (horaUTC !== HORA_UTC_ALVO) return;

  // Anti-disparo-duplo: 20h
  if (_stats.ultima_execucao_em) {
    const diff = agora.getTime() - new Date(_stats.ultima_execucao_em).getTime();
    if (diff < 20 * 60 * 60 * 1000) return;
  }

  console.log('[sched-proxima-edicao] disparando detector diario');
  const r = await detectarTodos({
    on_log: (ev) => console.log(`  ${JSON.stringify(ev).slice(0, 300)}`),
  });
  _stats.ultima_execucao_em = new Date().toISOString();
  _stats.ultimo_resultado = r;
  console.log(`[sched-proxima-edicao] detector OK: ${r.length} produtos avaliados`);

  // Avaliar alertas e mandar WhatsApp
  await _enviarAlertasWhatsApp();
}

async function _enviarAlertasWhatsApp() {
  const alertas = await rodarSQL(`SELECT * FROM pinguim.painel_alertas_edicoes();`);
  if (!alertas || alertas.length === 0) {
    console.log('[sched-proxima-edicao] sem alertas pendentes');
    return;
  }

  const linhas = [];
  for (const a of alertas) {
    const sufixo = a.status === 'atrasado'
      ? `atrasada ${Math.abs(a.dias_para_evento)} dia(s) — sobe a aula!`
      : `em ${a.dias_para_evento} dia(s)`;
    linhas.push(`• ${a.produto_emoji || '🧠'} ${a.produto_nome} (${a.data_evento}) — ${sufixo}`);
  }

  const texto = `🔔 *Edições pendentes*\n\n${linhas.join('\n')}\n\nMatriz: https://pinguim.agenciapinguim.com/automacao-de-cerebros`;

  // Chama endpoint local /api/whatsapp/enviar (que ja resolve Evolution + Camada B)
  try {
    const port = process.env.PORT || 3737;
    const resp = await fetch(`http://localhost:${port}/api/whatsapp/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: TELEFONE_ANDRE, texto, forcar: false }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200)}`);
    }
    console.log(`[sched-proxima-edicao] WhatsApp enviado pro Andre: ${alertas.length} alertas`);
  } catch (e) {
    console.error(`[sched-proxima-edicao] erro WhatsApp: ${e.message}`);
  }
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { iniciar, parar, status };
