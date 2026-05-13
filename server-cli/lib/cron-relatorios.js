// ============================================================
// cron-relatorios.js — V2.15 cron de relatórios (Andre 2026-05-12)
// ============================================================
// Plugado em jobs-worker via jobs.tipo_pedido='cron-relatorio'.
// Pipeline por job:
//   1) Carrega config (relatorios_config) pelo relatorio_id do plano
//   2) Roda gerarRelatorioExecutivo({ cliente_id, parent_id=ultimo_entregavel_id })
//      → salva entregavel versionado (v1 na 1ª, v2 v3 ... nas próximas)
//   3) Extrai 3-4 insights do md_final (heurística)
//   4) Envia WhatsApp com link público + insights (tom "dá uma olhada em...")
//   5) Atualiza relatorios_config (ultima_execucao, ultimo_status, ultimo_entregavel_id)
// ============================================================

const db = require('./db');
const evolution = require('./evolution');
const { gerarRelatorioExecutivo } = require('./relatorio-executivo');

const esc = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";

// ============================================================
// Carrega config completa do relatório pelo id
// ============================================================
async function carregarConfig(relatorio_id) {
  const sql = `
    SELECT id, cliente_id, slug, nome, modulos, sintetizador,
           cron_expr, cron_descricao,
           canais, whatsapp_numero, email_destino,
           ativo, ultimo_entregavel_id
      FROM pinguim.relatorios_config
     WHERE id = ${esc(relatorio_id)}
     LIMIT 1
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Atualiza tracking depois da execução
// ============================================================
async function marcarExecucao({ relatorio_id, status, entregavel_id = null }) {
  const sets = [
    `ultima_execucao = now()`,
    `ultimo_status = ${esc(status)}`,
    `atualizado_em = now()`,
  ];
  if (entregavel_id) sets.push(`ultimo_entregavel_id = ${esc(entregavel_id)}`);
  const sql = `
    UPDATE pinguim.relatorios_config
       SET ${sets.join(', ')}
     WHERE id = ${esc(relatorio_id)}
    RETURNING id, ultima_execucao, ultimo_status, ultimo_entregavel_id
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Heurística pra extrair 3-4 insights do md_final do executivo diário
// Estrutura do md_final (Skill compor-executivo-diario):
//   ☀️ Bom dia
//   ## TL;DR
//   ## Por que isso? (Board)        ← opcional
//   ## Números
//   ## Hoje
//   ---
//   ### 01 · FINANCEIRO ... 05 · PARECER ...
//
// Vamos extrair:
//   - 1 linha do TL;DR (primeira bullet)
//   - 1 linha do Números (primeira bullet) → "dá uma olhada nos números"
//   - 1 linha do Hoje (primeira linha não-vazia) → "agenda do dia"
//   - 1 destaque do Board se presente → "o board sinalizou X"
// ============================================================
function extrairInsights(md) {
  if (!md || typeof md !== 'string') return [];

  // Helper: extrai conteúdo de uma seção até a próxima seção/divisória
  function pegarSecao(headerRegex) {
    const m = md.match(headerRegex);
    if (!m) return '';
    const startIdx = m.index + m[0].length;
    const rest = md.slice(startIdx);
    const nextHeader = rest.match(/\n##\s|\n---/);
    return nextHeader ? rest.slice(0, nextHeader.index) : rest;
  }

  // Primeira bullet (- ou *) ou primeira linha não-vazia limpa
  function primeiraBullet(secao) {
    const linhas = secao.split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of linhas) {
      if (l.startsWith('-') || l.startsWith('*')) {
        return l.replace(/^[-*]\s*/, '').trim();
      }
    }
    // Fallback: primeira linha não-cabeçalho
    for (const l of linhas) {
      if (!l.startsWith('#') && !l.startsWith('>')) return l;
    }
    return '';
  }

  const insights = [];

  // 1) TL;DR
  const tldr = pegarSecao(/##\s*TL;DR[^\n]*\n/i);
  const tldrBullet = primeiraBullet(tldr);
  if (tldrBullet) insights.push({ rotulo: 'TL;DR', texto: limparMd(tldrBullet) });

  // 2) Números
  const numeros = pegarSecao(/##\s*N[ÚU]MEROS[^\n]*\n/i);
  const numerosBullet = primeiraBullet(numeros);
  if (numerosBullet) insights.push({ rotulo: 'Números', texto: limparMd(numerosBullet) });

  // 3) Hoje (agenda)
  const hoje = pegarSecao(/##\s*HOJE[^\n]*\n/i);
  const hojeLinha = primeiraBullet(hoje) || hoje.split('\n').map(l=>l.trim()).filter(Boolean).find(l=>!l.startsWith('#')) || '';
  if (hojeLinha) insights.push({ rotulo: 'Hoje', texto: limparMd(hojeLinha) });

  // 4) Board (síntese, opcional)
  const sintese = pegarSecao(/###\s*🏛?\s*S[ÍI]NTESE[^\n]*\n/i);
  if (sintese && sintese.trim()) {
    const lin = sintese.split('\n').map(l=>l.trim()).filter(Boolean).find(l => !l.startsWith('#'));
    if (lin) insights.push({ rotulo: 'Board', texto: limparMd(lin) });
  }

  return insights.slice(0, 4);
}

function limparMd(s) {
  if (!s) return '';
  return String(s)
    .replace(/\*\*([^*]+)\*\*/g, '*$1*') // **bold** → *bold* (WhatsApp markdown)
    .replace(/`([^`]+)`/g, '$1')         // remove code ticks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links viram texto
    .trim();
}

// Andre 2026-05-13: insights pra WhatsApp vinham gigantes (parágrafos 4-5 linhas)
// e poluíam visual. Corta no ponto final mais próximo do limite, max 140 chars.
function encurtarInsight(texto, max = 140) {
  if (!texto) return '';
  const t = String(texto).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const ultimoPonto = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '));
  if (ultimoPonto > max * 0.5) return corte.slice(0, ultimoPonto + 1).trim();
  return corte.replace(/\s+\S*$/, '').trim() + '…';
}

// Andre 2026-05-12: 2 insights só. Prioriza Board > TL;DR > Números > Hoje.
// Board é mais valioso pq é leitura cruzada, não fato isolado. TL;DR vem em 2º.
function priorizarInsights(insights, max = 2) {
  if (!Array.isArray(insights) || insights.length === 0) return [];
  const prioridade = { 'Board': 0, 'TL;DR': 1, 'Números': 2, 'Hoje': 3 };
  return [...insights]
    .sort((a, b) => (prioridade[a.rotulo] ?? 99) - (prioridade[b.rotulo] ?? 99))
    .slice(0, max);
}

// ============================================================
// Resolve URL pública do entregável (cofre PUBLIC_BASE_URL)
// ============================================================
let _publicBase = null;
async function getPublicBase() {
  if (_publicBase) return _publicBase;
  try {
    _publicBase = (await db.lerChaveSistema('PUBLIC_BASE_URL', 'cron-relatorios')).trim().replace(/\/+$/, '');
  } catch (_) {
    _publicBase = `http://localhost:${process.env.PORT || 3737}`;
  }
  return _publicBase;
}

// ============================================================
// Monta texto curto pro WhatsApp e dispara via Evolution
// ============================================================
async function enviarRelatorioWhatsApp({ numero, entregavel_id, entregavel_versao, titulo, insights, relatorio_nome }) {
  if (!numero) return { ok: false, motivo: 'whatsapp_numero ausente' };
  const base = await getPublicBase();
  const link = `${base}/entregavel/${entregavel_id}`;
  const versaoStr = entregavel_versao && entregavel_versao > 1 ? ` (v${entregavel_versao})` : '';

  // Andre 2026-05-13: estrutura escaneável (não parágrafo corrido).
  // Prioriza TL;DR e Board, encurta cada um pra max 140 chars.
  const insightsCurtos = priorizarInsights(insights, 2).map(ins => ({
    rotulo: ins.rotulo,
    texto: encurtarInsight(ins.texto, 140),
  }));

  const linhas = [];
  linhas.push(`☀️ *${relatorio_nome || titulo || 'Relatório'}*${versaoStr}`);
  linhas.push('');

  if (insightsCurtos.length) {
    insightsCurtos.forEach(ins => {
      linhas.push(`*${ins.rotulo}:* ${ins.texto}`);
      linhas.push('');
    });
  }

  linhas.push(`📄 Relatório completo: ${link}`);

  const texto = linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  try {
    const r = await evolution.enviarTexto({ numero, texto });
    return { ok: true, mensagem_id: r?.id || null, texto };
  } catch (e) {
    return { ok: false, motivo: e.message, texto };
  }
}

// ============================================================
// Executa 1 job de cron-relatorio. Chamado pelo jobs-worker.
// Retorna { entregavel_id, entregavel_versao, whatsapp_ok, ... }
// ============================================================
async function executarJobCronRelatorio(job) {
  const plano = job.plano_json || {};
  const relatorio_id = plano.relatorio_id;
  if (!relatorio_id) throw new Error('plano_json.relatorio_id ausente');

  const cfg = await carregarConfig(relatorio_id);
  if (!cfg) {
    await marcarExecucao({ relatorio_id, status: `falhou:config_nao_encontrada` });
    throw new Error(`Config ${relatorio_id} nao encontrada ou inativa`);
  }

  // Por enquanto só sabemos rodar 'executivo-diario' (e 'executivo-diario-teste').
  // Outros slugs vão sair na fila como falha controlada — frente futura.
  if (!cfg.slug.startsWith('executivo-diario')) {
    await marcarExecucao({ relatorio_id, status: `pulado:slug_sem_handler` });
    return {
      ok: false,
      motivo: `slug "${cfg.slug}" ainda nao tem handler de execucao no worker. So 'executivo-diario*' implementado.`,
    };
  }

  const t0 = Date.now();
  const resultado = await gerarRelatorioExecutivo({
    cliente_id: cfg.cliente_id,
    janela_horas: 24,
    parent_id: cfg.ultimo_entregavel_id || null, // versionamento automatico
  });
  const dur = Date.now() - t0;

  if (!resultado.ok || !resultado.entregavel_id) {
    await marcarExecucao({ relatorio_id, status: `falhou:gerar_${dur}ms` });
    throw new Error('gerarRelatorioExecutivo nao retornou entregavel');
  }

  // Extrai insights pro WhatsApp
  const insights = extrairInsights(resultado.md_final);

  // Envia WhatsApp se canal whatsapp + numero
  let whatsapp_resultado = { ok: false, motivo: 'whatsapp nao configurado' };
  if (Array.isArray(cfg.canais) && cfg.canais.includes('whatsapp') && cfg.whatsapp_numero) {
    whatsapp_resultado = await enviarRelatorioWhatsApp({
      numero: cfg.whatsapp_numero,
      entregavel_id: resultado.entregavel_id,
      entregavel_versao: resultado.entregavel_versao,
      titulo: resultado.titulo,
      insights,
      relatorio_nome: cfg.nome,
    });
  }

  // Atualiza config: ultimo_entregavel_id (importante! próxima execução versiona)
  const status = whatsapp_resultado.ok ? 'ok' : `ok_sem_whatsapp:${whatsapp_resultado.motivo}`;
  await marcarExecucao({
    relatorio_id,
    status,
    entregavel_id: resultado.entregavel_id,
  });

  return {
    ok: true,
    entregavel_id: resultado.entregavel_id,
    entregavel_versao: resultado.entregavel_versao,
    insights_extraidos: insights.length,
    whatsapp_ok: whatsapp_resultado.ok,
    whatsapp_motivo: whatsapp_resultado.motivo || null,
    duracao_ms: dur,
    markdown: resultado.md_final, // worker usa pra salvar conteudo_md no entregavel-job (não confundir com entregável já salvo pelo gerarRelatorioExecutivo)
  };
}

module.exports = {
  executarJobCronRelatorio,
  extrairInsights,
  enviarRelatorioWhatsApp,
  carregarConfig,
  marcarExecucao,
};
