// ============================================================
// scheduler-cron-categorias.js — V3 (2026-06-16)
// ============================================================
// Loop background no server-cli. A cada N minutos:
//
//   - lista todas pinguim.cerebro_plano_categoria com trigger_tipo='cron'
//     e schedule_cron preenchido
//   - pra cada uma, calcula se ja passou o tempo desde ultima_execucao
//     conforme o cron expression
//   - se passou, enfileira job via RPC enfileirar_job_ingestao_categoria
//
// Implementacao simples de cron expression (suporta os formatos que usamos):
//   - "0 8 * * *"      => todo dia 8h UTC
//   - "0 8 * * 3"      => toda quarta 8h UTC
//   - "0 8 * * 1,3,5"  => seg/qua/sex 8h UTC
//   - "*/15 * * * *"   => a cada 15min
//
// IMPORTANTE: cron_expr eh UTC. UI mostra em BRT (UTC-3).
// ============================================================

const db = require('./db');

const INTERVALO_MS_DEFAULT = parseInt(process.env.SCHEDULER_INTERVALO_MS, 10) || 5 * 60 * 1000; // 5 min

let _rodando = false;
let _parar = false;
let _stats = { ciclos: 0, ultimo_ciclo_em: null, ultimo_erro: null, disparados_no_ultimo: 0 };

function iniciar({ intervalo_ms = INTERVALO_MS_DEFAULT } = {}) {
  if (_rodando) {
    console.log('[scheduler-cron] ja rodando');
    return;
  }
  _rodando = true;
  _parar = false;
  console.log(`[scheduler-cron] iniciado (intervalo=${(intervalo_ms / 60000).toFixed(1)}min)`);
  _loop(intervalo_ms);
}

function parar() { _parar = true; }
function status() { return { rodando: _rodando, ..._stats }; }

async function _loop(intervalo_ms) {
  setTimeout(() => _executarCiclo().catch(e => console.error('[scheduler-cron] erro inicial:', e.message)), 15_000);
  while (!_parar) {
    await _sleep(intervalo_ms);
    if (_parar) break;
    try { await _executarCiclo(); }
    catch (e) {
      _stats.ultimo_erro = e.message || String(e);
      console.error('[scheduler-cron] erro ciclo:', _stats.ultimo_erro);
    }
  }
  _rodando = false;
  console.log('[scheduler-cron] parado');
}

async function _executarCiclo() {
  _stats.ciclos++;
  _stats.ultimo_ciclo_em = new Date().toISOString();
  _stats.disparados_no_ultimo = 0;

  const rows = await db.rodarSQL(`
    SELECT vp.plano_id, vp.cerebro_id, vp.categoria_slug, vp.categoria_nome,
           vp.schedule_cron, vp.ultima_execucao
    FROM pinguim.vw_cerebro_plano_categoria vp
    WHERE vp.trigger_tipo = 'cron'
      AND vp.schedule_cron IS NOT NULL
      AND vp.schedule_cron <> ''
      AND vp.status_automacao IN ('ativo','rodando','em_construcao')
  `);

  if (!rows || rows.length === 0) return;
  console.log(`[scheduler-cron] ciclo ${_stats.ciclos}: ${rows.length} categoria(s) com cron`);

  const agora = new Date();
  for (const r of rows) {
    try {
      const ultima = r.ultima_execucao ? new Date(r.ultima_execucao) : null;
      if (!_deveDispararAgora({ cron: r.schedule_cron, ultima, agora })) continue;

      console.log(`  ${r.categoria_nome} (${r.categoria_slug}): cron disparou — enfileirando`);
      await db.rodarSQL(`SELECT pinguim.enfileirar_job_ingestao_categoria('${r.cerebro_id}'::uuid, '${r.categoria_slug}', 'cron')`);
      _stats.disparados_no_ultimo++;
    } catch (e) {
      console.error(`  [scheduler] erro categoria=${r.categoria_slug}: ${e.message}`);
    }
  }
}

// Decide se deve disparar agora baseado em cron expression e ultima_execucao
function _deveDispararAgora({ cron, ultima, agora }) {
  if (!cron) return false;
  const parsed = _parseCron(cron);
  if (!parsed) return false;

  // Confere se o momento atual bate com o cron
  const m = agora.getUTCMinutes();
  const h = agora.getUTCHours();
  const dia = agora.getUTCDate();
  const mes = agora.getUTCMonth() + 1;
  const diaSemana = agora.getUTCDay(); // 0=domingo

  if (!_match(parsed.minutos, m, 0, 59)) return false;
  if (!_match(parsed.horas, h, 0, 23)) return false;
  if (!_match(parsed.dias_mes, dia, 1, 31)) return false;
  if (!_match(parsed.meses, mes, 1, 12)) return false;
  if (!_match(parsed.dias_semana, diaSemana, 0, 6)) return false;

  // Anti-disparo-duplo: se ultima_execucao foi nos ultimos 5min, pula (evita rodar 2x dentro da janela do cron)
  if (ultima) {
    const diffMs = agora.getTime() - ultima.getTime();
    if (diffMs < 5 * 60 * 1000) return false;
  }
  return true;
}

function _parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minutos: _campo(parts[0]),
    horas: _campo(parts[1]),
    dias_mes: _campo(parts[2]),
    meses: _campo(parts[3]),
    dias_semana: _campo(parts[4]),
  };
}

function _campo(s) {
  // suporta: "*", "5", "1,3,5", "*/15", "0-23"
  if (s === '*') return { tipo: 'asterisco' };
  if (s.startsWith('*/')) return { tipo: 'step', passo: parseInt(s.slice(2), 10) };
  if (s.includes(',')) return { tipo: 'lista', valores: s.split(',').map(x => parseInt(x, 10)) };
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(x => parseInt(x, 10));
    return { tipo: 'range', a, b };
  }
  return { tipo: 'lista', valores: [parseInt(s, 10)] };
}

function _match(campo, valor, min, max) {
  if (!campo) return false;
  if (campo.tipo === 'asterisco') return true;
  if (campo.tipo === 'step') return valor % campo.passo === 0;
  if (campo.tipo === 'lista') return campo.valores.includes(valor);
  if (campo.tipo === 'range') return valor >= campo.a && valor <= campo.b;
  return false;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { iniciar, parar, status, _executarCiclo, _deveDispararAgora, _parseCron };
