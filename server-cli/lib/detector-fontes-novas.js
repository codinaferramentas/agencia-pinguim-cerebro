// ============================================================
// detector-fontes-novas.js — V3 (2026-06-16)
// ============================================================
// Loop background no server-cli.
// A cada N minutos, percorre TODAS as cerebro_plano_categoria com
// trigger_tipo in ('evento_avisar','evento_auto') e origem_pasta_drive_id
// nao-null. Pra cada uma:
//
//   - lista arquivos novos na pasta Drive (que nao estao em fontes_processadas)
//   - se trigger_tipo='evento_auto'  -> enfileira job de ingestao direto
//   - se trigger_tipo='evento_avisar'-> cria notificacao_pendente (badge no MC)
//
// Custo: zero (so call API Drive + insert no banco). Idempotente.
// ============================================================

const db = require('./db');
const drive = require('./google-drive-content');

const INTERVALO_MS_DEFAULT = parseInt(process.env.DETECTOR_INTERVALO_MS, 10) || 10 * 60 * 1000; // 10 min
const MIME_PREFIX_MIDIA = ['video/', 'audio/'];

let _rodando = false;
let _parar = false;
let _stats = { ciclos: 0, ultimo_ciclo_em: null, ultimo_erro: null, encontrados_no_ultimo: 0 };

function iniciar({ intervalo_ms = INTERVALO_MS_DEFAULT } = {}) {
  if (_rodando) {
    console.log('[detector-fontes] ja rodando');
    return;
  }
  _rodando = true;
  _parar = false;
  console.log(`[detector-fontes] iniciado (intervalo=${(intervalo_ms / 60000).toFixed(1)}min)`);
  _loop(intervalo_ms);
}

function parar() { _parar = true; }
function status() { return { rodando: _rodando, ..._stats }; }

async function _loop(intervalo_ms) {
  // Roda 1x na partida (apos 10s pra dar tempo do server ficar pronto), depois cada intervalo_ms
  setTimeout(() => _executarCiclo().catch(e => console.error('[detector-fontes] erro inicial:', e.message)), 10_000);
  while (!_parar) {
    await _sleep(intervalo_ms);
    if (_parar) break;
    try { await _executarCiclo(); }
    catch (e) {
      _stats.ultimo_erro = e.message || String(e);
      console.error('[detector-fontes] erro ciclo:', _stats.ultimo_erro);
    }
  }
  _rodando = false;
  console.log('[detector-fontes] parado');
}

async function _executarCiclo() {
  _stats.ciclos++;
  _stats.ultimo_ciclo_em = new Date().toISOString();
  _stats.encontrados_no_ultimo = 0;

  // 1) Lista categorias monitoradas
  const rows = await db.rodarSQL(`
    SELECT
      vp.plano_id, vp.cerebro_id, vp.categoria_slug, vp.categoria_nome,
      vp.trigger_tipo, vp.origem_pasta_drive_id
    FROM pinguim.vw_cerebro_plano_categoria vp
    WHERE vp.trigger_tipo IN ('evento_avisar','evento_auto')
      AND vp.origem_pasta_drive_id IS NOT NULL
      AND vp.origem_pasta_drive_id <> ''
  `);

  if (!rows || rows.length === 0) return;
  console.log(`[detector-fontes] ciclo ${_stats.ciclos}: ${rows.length} categoria(s) monitorada(s)`);

  for (const r of rows) {
    try {
      const novos = await _checarPastaDrive({
        cerebro_id: r.cerebro_id,
        categoria_slug: r.categoria_slug,
        pasta_drive_id: r.origem_pasta_drive_id,
      });
      if (novos.length === 0) continue;
      _stats.encontrados_no_ultimo += novos.length;
      console.log(`  ${r.categoria_nome} (${r.categoria_slug}): ${novos.length} arquivo(s) novo(s)`);

      if (r.trigger_tipo === 'evento_auto') {
        // Enfileira job direto (worker processa)
        for (const n of novos) {
          await _criarNotificacao({ ...r, arquivo: n }); // marca antes pra UI
        }
        await db.rodarSQL(`SELECT pinguim.enfileirar_job_ingestao_categoria('${r.cerebro_id}'::uuid, '${r.categoria_slug}', 'detector_hibrido')`);
      } else if (r.trigger_tipo === 'evento_avisar') {
        // Cria notificacao pendente (badge no MC)
        for (const n of novos) {
          await _criarNotificacao({ ...r, arquivo: n });
        }
      }
    } catch (e) {
      console.error(`  [detector] erro categoria=${r.categoria_slug}: ${e.message}`);
    }
  }
}

async function _checarPastaDrive({ cerebro_id, categoria_slug, pasta_drive_id }) {
  // Lista arquivos da pasta (video + audio)
  const arquivos = await drive.listarArquivosDaPasta({ pastaId: pasta_drive_id });
  const midias = arquivos.filter(a => MIME_PREFIX_MIDIA.some(p => (a.mimeType || '').startsWith(p)));
  if (midias.length === 0) return [];

  // Filtra ja processados
  const ids = midias.map(m => `'${m.id}'`).join(',');
  const jaProc = await db.rodarSQL(`
    SELECT fonte_externa_id FROM pinguim.fontes_processadas
     WHERE cerebro_id = '${cerebro_id}'::uuid
       AND categoria_slug = '${categoria_slug}'
       AND fonte_origem = 'google_drive'
       AND fonte_externa_id IN (${ids})
  `);
  const setProc = new Set((jaProc || []).map(x => x.fonte_externa_id));
  return midias.filter(m => !setProc.has(m.id));
}

async function _criarNotificacao({ cerebro_id, categoria_slug, categoria_nome, arquivo }) {
  const titulo = `${arquivo.name} (${formatarBytes(parseInt(arquivo.size || 0, 10))})`;
  const payload = {
    fonte_externa_id: arquivo.id,
    name: arquivo.name,
    mimeType: arquivo.mimeType,
    bytes: parseInt(arquivo.size || 0, 10),
    webViewLink: arquivo.webViewLink || null,
  };
  await db.rodarSQL(`
    INSERT INTO pinguim.notificacoes_pendentes
      (cerebro_id, categoria_slug, tipo, titulo, descricao, payload)
    VALUES (
      '${cerebro_id}'::uuid,
      '${categoria_slug}',
      'arquivo_novo_drive',
      ${esc(titulo)},
      ${esc('Arquivo novo detectado em pasta Drive monitorada — aguardando processamento (' + categoria_nome + ')')},
      '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb
    )
    ON CONFLICT DO NOTHING
  `);
}

function formatarBytes(b) {
  if (!b) return '0B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b > 10 ? 0 : 1)}${u[i]}`;
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { iniciar, parar, status, _executarCiclo };
