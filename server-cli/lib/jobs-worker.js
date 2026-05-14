// ============================================================
// jobs-worker.js — V2.15 Fase 2 Plan-and-Execute
// ============================================================
// Loop assincrono que pega jobs com status=aprovado da fila pinguim.jobs,
// executa o plano via lib/executor.js, salva markdown em pinguim.entregaveis,
// atualiza job pra status=concluido, e dispara notificacao no canal de origem.
//
// Concorrencia: pegarProximoJob() ja usa SELECT...FOR UPDATE SKIP LOCKED,
// entao multiplos workers paralelos sao seguros. Esta versao roda 1 worker
// no proprio processo do server-cli (opt-in via WORKER_JOBS_ENABLED=1).
//
// Design:
// - setTimeout em loop (NAO setInterval — evita sobrepor execucoes longas)
// - Intervalo polling default 15s quando fila vazia, 1s quando achou job
// - Cada iteracao pega 1 job, processa ate o fim, dorme, polla de novo
// - Erro num job NAO derruba worker (try/catch no loop)
// ============================================================

const jobs = require('./jobs');
const executor = require('./executor');
const cronRelatorios = require('./cron-relatorios');
const db = require('./db');
const os = require('os');
// V2.15 Fase 4 — Reflexao Camada 2 EPP sobre output do executor de jobs
const { verificarOutput } = require('./verificador');

const POLL_INTERVALO_VAZIO_MS = parseInt(process.env.WORKER_POLL_MS, 10) || 15_000;
const POLL_INTERVALO_OCUPADO_MS = 1_000;
const WORKER_ID = `${os.hostname()}-pid${process.pid}`;

let _rodando = false;
let _parar = false;

// ============================================================
// Inicia worker em loop background. Idempotente (start 2x = no-op).
// ============================================================
function iniciar() {
  if (_rodando) {
    console.log(`[jobs-worker] ja rodando (worker_id=${WORKER_ID})`);
    return;
  }
  _rodando = true;
  _parar = false;
  console.log(`[jobs-worker] iniciado worker_id=${WORKER_ID} | poll vazio=${POLL_INTERVALO_VAZIO_MS}ms`);
  _loop();
}

// ============================================================
// Para o worker no proximo tick. Job em execucao termina normalmente.
// ============================================================
function parar() {
  _parar = true;
  console.log('[jobs-worker] solicitado parar — vai encerrar no proximo tick');
}

function status() {
  return {
    rodando: _rodando,
    worker_id: WORKER_ID,
    poll_vazio_ms: POLL_INTERVALO_VAZIO_MS,
  };
}

// ============================================================
// Loop interno. Sempre dorme antes de re-pollar.
// ============================================================
async function _loop() {
  while (!_parar) {
    let achou = false;
    try {
      achou = await _processarUmJob();
    } catch (e) {
      // Erro inesperado no proprio fluxo do worker (NAO erro do executor — esse vai pra falharJob)
      console.error(`[jobs-worker] erro no loop: ${e.message}`);
    }
    const dormir = achou ? POLL_INTERVALO_OCUPADO_MS : POLL_INTERVALO_VAZIO_MS;
    await _sleep(dormir);
  }
  _rodando = false;
  console.log('[jobs-worker] parado');
}

// ============================================================
// Pega 1 job aprovado e processa. Retorna true se pegou (fila tinha algo).
// ============================================================
async function _processarUmJob() {
  const job = await jobs.pegarProximoJob({ worker_id: WORKER_ID });
  if (!job) return false;

  console.log(`[jobs-worker] pegou job=${job.id} tipo=${job.tipo_pedido || 'generico'} | pedido="${(job.pedido_original || '').slice(0, 80)}..."`);
  const t0 = Date.now();

  try {
    // ========================================================
    // Desvio por tipo_pedido (V2.15 — cron-relatorio é fluxo dedicado)
    // ========================================================
    if (job.tipo_pedido === 'cron-relatorio') {
      const r = await cronRelatorios.executarJobCronRelatorio(job);
      const dur_total = Date.now() - t0;
      if (!r.ok) {
        // Caso "pulado:slug_sem_handler" — marca como falha controlada, libera fila
        await jobs.falharJob({ job_id: job.id, motivo: r.motivo || 'cron-relatorio retornou ok=false' });
        console.log(`[jobs-worker] cron-relatorio NAO executou job=${job.id} motivo="${r.motivo}"`);
        return true;
      }
      await jobs.concluirJob({
        job_id: job.id,
        entregavel_id: r.entregavel_id,
        resultado_json: {
          entregavel_id: r.entregavel_id,
          entregavel_versao: r.entregavel_versao,
          insights_extraidos: r.insights_extraidos,
          whatsapp_ok: r.whatsapp_ok,
          whatsapp_motivo: r.whatsapp_motivo,
          duracao_gerar_ms: r.duracao_ms,
        },
      });
      // marca notificado se WhatsApp foi (cron não precisa do Pinguim avisar de novo)
      if (r.whatsapp_ok) {
        try { await jobs.marcarNotificado({ job_id: job.id }); } catch (_) {}
      }
      console.log(`[jobs-worker] cron-relatorio OK job=${job.id} | entregavel=${r.entregavel_id} v${r.entregavel_versao} | whatsapp=${r.whatsapp_ok ? 'OK' : 'NAO:'+r.whatsapp_motivo} | total=${dur_total}ms`);
      return true;
    }

    // ========================================================
    // Fluxo padrão (V2.15 Plan-and-Execute) — Claude CLI background
    // ========================================================
    const resultado = await executor.executarJob({
      pedido_original: job.pedido_original,
      plano_json: job.plano_json,
    });

    const dur_exec = Date.now() - t0;
    console.log(`[jobs-worker] executor OK job=${job.id} dur=${dur_exec}ms | md=${resultado.markdown.length} chars`);

    // ========================================================
    // V2.15 Fase 4 — Reflexao Camada 2 EPP sobre output do executor
    // Roda antes de salvar entregavel. Nao refaz: anexa bloco
    // critico no markdown se reprovar. Skip se output curto (< 500 chars).
    // ========================================================
    let markdownFinal = resultado.markdown;
    let reflexao = null;
    if (markdownFinal.length >= 500) {
      try {
        const tRef0 = Date.now();
        reflexao = await verificarOutput({
          briefing: `${job.pedido_original}\n\n[BRIEFING APROVADO]\n${job.briefing_resumo || ''}`,
          output_md: markdownFinal,
          agente_slug: `executor-${job.tipo_pedido || 'job'}`,
          agente_role: 'orquestrador-de-squad',
          expectativa: `Output factual de executor P-V-E. Sem invencao de numero/preco/data. Cita fontes consultadas. Honesto sobre falhas. Formato markdown limpo.`,
        });
        const durRef = Date.now() - tRef0;
        console.log(`[jobs-worker] reflexao ${reflexao.aprovado ? 'APROVOU' : 'REPROVOU'} em ${(durRef / 1000).toFixed(1)}s job=${job.id}${reflexao.problemas.length ? ` | ${reflexao.problemas.length} problema(s)` : ''}`);

        if (!reflexao.aprovado && reflexao.problemas.length > 0) {
          markdownFinal += `\n\n---\n\n## ⚠ Revisão crítica (Camada 2 EPP)\n\n`;
          markdownFinal += `_Verifier automatizado identificou pontos pra reavaliar. Não é bloqueio — é segunda opinião automática antes de você aprovar o entregável._\n\n`;
          reflexao.problemas.forEach((p) => { markdownFinal += `- ${p}\n`; });
          if (reflexao.recomendacao_refazer) {
            markdownFinal += `\n_**Recomendação:** ${reflexao.recomendacao_refazer}_\n`;
          }
        }
      } catch (e) {
        console.warn(`[jobs-worker] reflexao falhou (nao bloqueante): ${e.message}`);
      }
    } else {
      console.log(`[jobs-worker] reflexao pulada: output curto (${markdownFinal.length} chars)`);
    }

    // Salva entregavel
    const titulo = job.briefing_resumo
      ? `Job ${job.id.slice(0, 8)} — ${job.briefing_resumo.slice(0, 100)}`
      : `Job ${job.id.slice(0, 8)} — ${job.pedido_original.slice(0, 80)}`;

    const entregavel = await db.salvarEntregavel({
      cliente_id: job.cliente_id,
      tipo: 'job-resultado',
      titulo,
      conteudo_md: markdownFinal,
      conteudo_estruturado: {
        job_id: job.id,
        pedido_original: job.pedido_original,
        plano_json: job.plano_json,
        canal_origem: job.canal_origem,
        executor_duracao_ms: resultado.duracao_ms,
        worker_id: WORKER_ID,
        gerado_em: new Date().toISOString(),
        // V2.15 Fase 4 — Reflexao Camada 2
        reflexao: reflexao ? {
          aprovado: reflexao.aprovado,
          problemas_n: reflexao.problemas.length,
          latencia_ms: reflexao.latencia_ms,
        } : null,
      },
    });

    // Atualiza job pra concluido (V2.15 Fase 3: grava custo/tokens do executor)
    const m = resultado.metricas || {};
    await jobs.concluirJob({
      job_id: job.id,
      entregavel_id: entregavel?.id || null,
      resultado_json: {
        markdown_chars: markdownFinal.length,
        markdown_chars_original: resultado.markdown.length,
        duracao_ms: resultado.duracao_ms,
        entregavel_id: entregavel?.id || null,
        custo_usd: m.custo_usd,
        tokens_in: m.tokens_in,
        tokens_out: m.tokens_out,
        session_id: m.session_id,
        // V2.15 Fase 4
        reflexao_aprovou: reflexao ? reflexao.aprovado : null,
        reflexao_problemas_n: reflexao ? reflexao.problemas.length : 0,
      },
      executor_custo_usd: m.custo_usd,
      executor_tokens_in: m.tokens_in,
      executor_tokens_out: m.tokens_out,
      executor_duracao_ms: m.duracao_ms || resultado.duracao_ms,
    });

    console.log(`[jobs-worker] OK job=${job.id} | entregavel=${entregavel?.id || 'NAO_SALVO'} | custo=$${(m.custo_usd || 0).toFixed(4)} | in/out=${m.tokens_in || 0}/${m.tokens_out || 0} | total=${Date.now() - t0}ms`);
    return true;
  } catch (e) {
    const dur_fail = Date.now() - t0;
    console.error(`[jobs-worker] FALHOU job=${job.id} dur=${dur_fail}ms | erro: ${e.message}`);
    try {
      await jobs.falharJob({ job_id: job.id, motivo: e.message.slice(0, 1000) });
    } catch (e2) {
      console.error(`[jobs-worker] erro ao marcar falha do job ${job.id}: ${e2.message}`);
    }
    return true; // pega proximo mesmo assim
  }
}

function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = {
  iniciar,
  parar,
  status,
  // exposto pra teste manual
  _processarUmJob,
};
