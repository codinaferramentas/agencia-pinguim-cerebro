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
  // Andre 2026-05-13: lê da view com destinatarios agregados em jsonb.
  // Schema legado (whatsapp_numero/email_destino) ainda existe e é populado
  // pelo cofre — só ignoramos no envio (usamos só destinatarios[] da view).
  const sql = `
    SELECT id, cliente_id, slug, nome, modulos, sintetizador,
           cron_expr, cron_descricao,
           canais, whatsapp_numero, email_destino,
           destinatarios,
           ativo, ultimo_entregavel_id
      FROM pinguim.relatorios_config_com_destinatarios
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

// ============================================================
// Extrator dedicado pro Radar IA (estrutura: TL;DR + 4 baldes)
// Pega: 1) TL;DR  2) 1º item Crítico  3) 1º item Estratégico
// ============================================================
function extrairInsightsRadarIA(md) {
  if (!md || typeof md !== 'string') return [];

  function pegarSecao(headerRegex) {
    const m = md.match(headerRegex);
    if (!m) return '';
    const startIdx = m.index + m[0].length;
    const rest = md.slice(startIdx);
    const nextHeader = rest.match(/\n##\s|\n---/);
    return nextHeader ? rest.slice(0, nextHeader.index) : rest;
  }

  // Pega 1ª linha não-vazia de uma seção
  function primeiraLinha(secao) {
    const linhas = secao.split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of linhas) {
      if (!l.startsWith('#') && !l.startsWith('>') && !l.startsWith('---')) return l;
    }
    return '';
  }

  // Pega título do 1º item bullet de um balde (linha começa com `- **`)
  function primeiroItemBalde(secao) {
    const linhas = secao.split('\n');
    for (const l of linhas) {
      const t = l.trim();
      const m = t.match(/^-\s+\*\*([^*]+)\*\*/);
      if (m) return m[1].trim();
    }
    return '';
  }

  const insights = [];

  const tldr = pegarSecao(/##\s*TL;DR[^\n]*\n/i);
  const tldrLinha = primeiraLinha(tldr);
  if (tldrLinha) insights.push({ rotulo: 'TL;DR', texto: limparMd(tldrLinha) });

  const critico = pegarSecao(/##\s*🔴\s*Cr[íi]tico[^\n]*\n/i);
  const criticoTit = primeiroItemBalde(critico);
  if (criticoTit) insights.push({ rotulo: 'Crítico', texto: limparMd(criticoTit) });

  const estrategico = pegarSecao(/##\s*🟡\s*Estrat[ée]gico[^\n]*\n/i);
  const estTit = primeiroItemBalde(estrategico);
  if (estTit) insights.push({ rotulo: 'Estratégico', texto: limparMd(estTit) });

  return insights.slice(0, 3);
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
  const prioridade = { 'Board': 0, 'TL;DR': 1, 'Crítico': 1, 'Estratégico': 2, 'Números': 2, 'Hoje': 3 };
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
// V2.15.5 Andre 2026-05-18: envio dedicado pro Highlights.
// Manda 2 mensagens separadas — corpo formatado pronto + link HTML.
// NÃO usa extrairInsights nem heurística (corpo já vem determinístico
// do sintetizador puro JS em lib/relatorio-highlights.js).
// ============================================================
async function enviarHighlightsWhatsApp({ numero, entregavel_id, corpo_whatsapp }) {
  if (!numero) return { ok: false, motivo: 'whatsapp_numero ausente' };
  if (!corpo_whatsapp) return { ok: false, motivo: 'corpo_whatsapp ausente no resultado' };

  const base = await getPublicBase();
  const link = `${base}/entregavel/${entregavel_id}`;

  try {
    // Mensagem 1: corpo completo formatado (cards + total)
    const m1 = await evolution.enviarTexto({ numero, texto: corpo_whatsapp });
    // Mensagem 2: link separado
    const m2 = await evolution.enviarTexto({
      numero,
      texto: `📄 *Relatório completo (HTML):*\n${link}`,
    });
    return {
      ok: true,
      mensagem_id: m1?.id || null,
      mensagem_link_id: m2?.id || null,
    };
  } catch (e) {
    return { ok: false, motivo: e.message };
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

  // V2.15.3 Andre 2026-05-13: dispatch por slug
  // - executivo-diario* → gerarRelatorioExecutivo
  // - meta-ads* → gerarRelatorioMetaAds
  // - triagem-emails* → gerarRelatorioTriagemEmails
  // Outros slugs sair na fila como falha controlada
  let resultado;
  const t0 = Date.now();
  if (cfg.slug.startsWith('executivo-diario')) {
    resultado = await gerarRelatorioExecutivo({
      cliente_id: cfg.cliente_id,
      janela_horas: 24,
      parent_id: cfg.ultimo_entregavel_id || null,
    });
  } else if (cfg.slug.startsWith('meta-ads')) {
    const { gerarRelatorioMetaAds } = require('./relatorio-meta-ads');
    resultado = await gerarRelatorioMetaAds({
      cliente_id: cfg.cliente_id,
      parent_id: cfg.ultimo_entregavel_id || null,
    });
  } else if (cfg.slug.startsWith('triagem-emails')) {
    const { gerarRelatorioTriagemEmails } = require('./relatorio-triagem-emails');
    resultado = await gerarRelatorioTriagemEmails({
      cliente_id: cfg.cliente_id,
      parent_id: cfg.ultimo_entregavel_id || null,
    });
  } else if (cfg.slug.startsWith('hotmart-diario') || cfg.slug.startsWith('relatorio-hotmart')) {
    // V2.15.3 Andre 2026-05-14: Hotmart Diário (universal)
    const { gerarRelatorioHotmart } = require('./relatorio-hotmart');
    resultado = await gerarRelatorioHotmart({
      cliente_id: cfg.cliente_id,
      parent_id: cfg.ultimo_entregavel_id || null,
    });
  } else if (cfg.slug.startsWith('highlights')) {
    // V2.15.5 Andre 2026-05-18: Highlights Diário (primeiro relatório do dia, universal)
    const { gerarRelatorioHighlights } = require('./relatorio-highlights');
    resultado = await gerarRelatorioHighlights({
      cliente_id: cfg.cliente_id,
      parent_id: cfg.ultimo_entregavel_id || null,
    });
  } else if (cfg.slug.startsWith('radar-ia')) {
    // V2.15 Andre 2026-05-14: Radar IA Diário (universal pra Codina hoje)
    const { gerarRelatorioRadarIA } = require('./relatorio-radar-ia');
    resultado = await gerarRelatorioRadarIA({
      cliente_id: cfg.cliente_id,
      parent_id: cfg.ultimo_entregavel_id || null,
    });
  } else {
    await marcarExecucao({ relatorio_id, status: `pulado:slug_sem_handler` });
    return {
      ok: false,
      motivo: `slug "${cfg.slug}" ainda nao tem handler. Suportados: executivo-diario*, meta-ads*, triagem-emails*, hotmart-diario*, highlights*, radar-ia*`,
    };
  }
  const dur = Date.now() - t0;

  if (!resultado.ok || !resultado.entregavel_id) {
    await marcarExecucao({ relatorio_id, status: `falhou:gerar_${dur}ms` });
    throw new Error('gerarRelatorioExecutivo nao retornou entregavel');
  }

  // V2.15.5 Andre 2026-05-18: Highlights tem corpo_whatsapp pré-formatado
  // (determinístico, sem heurística). Manda em 2 mensagens: corpo + link.
  // Outros relatórios continuam usando o fluxo de insights extraídos.
  const isHighlights = cfg.slug.startsWith('highlights');

  const insights = isHighlights
    ? []
    : (cfg.slug.startsWith('radar-ia')
        ? extrairInsightsRadarIA(resultado.md_final)
        : extrairInsights(resultado.md_final));

  // Andre 2026-05-13: itera sobre TODOS destinatários ativos da tabela
  // pinguim.relatorios_destinatarios. Antes mandava só pra whatsapp_numero único.
  const destinatarios = Array.isArray(cfg.destinatarios) ? cfg.destinatarios : [];
  const destinatariosAtivos = destinatarios.filter(d => d.ativo !== false);
  const envios = [];

  for (const d of destinatariosAtivos) {
    if (d.canal === 'whatsapp') {
      let r;
      if (isHighlights) {
        r = await enviarHighlightsWhatsApp({
          numero: d.valor,
          entregavel_id: resultado.entregavel_id,
          corpo_whatsapp: resultado.corpo_whatsapp,
        });
      } else {
        r = await enviarRelatorioWhatsApp({
          numero: d.valor,
          entregavel_id: resultado.entregavel_id,
          entregavel_versao: resultado.entregavel_versao,
          titulo: resultado.titulo,
          insights,
          relatorio_nome: cfg.nome,
        });
      }
      envios.push({ canal: 'whatsapp', valor: d.valor, nome: d.nome, ok: r.ok, motivo: r.motivo });
    }
    // canais email/discord/telegram entram em frentes futuras (Andre 2026-05-13)
  }

  const sucessos = envios.filter(e => e.ok).length;
  const falhas = envios.filter(e => !e.ok);
  let status;
  if (envios.length === 0) status = 'ok_sem_envio';
  else if (sucessos === envios.length) status = `ok:${sucessos}_envios`;
  else if (sucessos === 0) status = `ok_sem_whatsapp:${falhas[0]?.motivo || 'erro'}`;
  else status = `ok_parcial:${sucessos}de${envios.length}`;

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
    envios, // detalhamento por destinatário
    whatsapp_ok: sucessos > 0, // mantido por compatibilidade
    whatsapp_motivo: falhas[0]?.motivo || null,
    duracao_ms: dur,
    markdown: resultado.md_final,
  };
}

module.exports = {
  executarJobCronRelatorio,
  extrairInsights,
  extrairInsightsRadarIA,
  enviarRelatorioWhatsApp,
  enviarHighlightsWhatsApp,
  carregarConfig,
  marcarExecucao,
};
