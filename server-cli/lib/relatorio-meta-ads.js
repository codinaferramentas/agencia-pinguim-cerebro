// ============================================================
// relatorio-meta-ads.js — V2.15.2 (Andre 2026-05-13)
// ============================================================
// Book Diário Meta Ads com plano de ação. Diferente do executivo:
//
// 1. FOCO total em Ads (sem agenda, sem email, sem discord)
// 2. 3 JANELAS: ontem (24h), 7d rolling, 30d rolling — comparativo de cards
// 3. BREAKDOWN POR AD ACCOUNT — cards por conta + alertas
// 4. SQUAD TRAFFIC-MASTERS — 5 mestres + Chief montam plano de ação real
// 5. GRÁFICOS — séries diárias 30d (gasto×faturamento, ROAS, distribuição conta)
// 6. SAÍDA: markdown rico (HTML faz parsing pra Chart.js) + estruturado
//
// Pipeline:
//   1) coletarDadosMetaAds() — chamadas paralelas db-dashboard
//   2) analisarTrafficMasters() — 5 mestres em paralelo via Claude CLI
//   3) sintetizarMetaAdsDiario() — Skill compor-meta-ads-diario via Claude CLI
//   4) Retorna {md_final, conteudo_estruturado} pra worker salvar entregavel
// ============================================================

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('./db');
const dash = require('./db-dashboard');
const googleCalendar = require('./google-calendar');
const socio = require('./socio');

// ============================================================
// Claude CLI runner (mesmo padrao do relatorio-executivo.js)
// ============================================================
function runClaudeCLI(prompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const envFiltrado = { ...process.env };
    for (const k of Object.keys(envFiltrado)) {
      if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete envFiltrado[k];
    }
    const proc = spawn('claude', ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: envFiltrado,
    });
    let stdout = '', stderr = '';
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`Claude CLI timeout ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      clearTimeout(killer);
      if (code !== 0) reject(new Error(`Claude CLI exit ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout.trim());
    });
    proc.on('error', e => { clearTimeout(killer); reject(e); });
  });
}

// ============================================================
// 1) COLETOR DE DADOS (paralelo, ~3-5s)
// ============================================================
async function coletarDadosMetaAds({ dia_alvo_brt }) {
  // Janelas
  const j7 = dash.janelaUltimosNDias(7);
  const j30 = dash.janelaUltimosNDias(30);

  // Dia alvo (default: ontem). Janelas 7d/30d sao rolling ATÉ ontem.
  const ontem = dia_alvo_brt;

  // Dia anterior pra comparar 24h vs 24h
  const dataOntem = new Date(`${ontem}T03:00:00Z`);
  const antesOntem = new Date(dataOntem.getTime() - 24 * 60 * 60 * 1000);
  const antesOntemIso = antesOntem.toISOString().slice(0, 10);

  const [
    kpis24h,
    kpis24hAnterior,
    kpis7d,
    kpis30d,
    fatHotmart24h,
    fatHotmart24hAnterior,
    fatHotmart7d,
    fatHotmart30d,
    porConta24h,
    porConta7d,
    topCampanhas24h,
    topCampanhas7d,
    serieMeta30d,
    serieHotmart30d,
  ] = await Promise.all([
    dash.meta_kpis_range(ontem, ontem),
    dash.meta_kpis_range(antesOntemIso, antesOntemIso),
    dash.meta_kpis_range(j7.from, j7.to),
    dash.meta_kpis_range(j30.from, j30.to),
    dash.hotmart_faturamento_range(ontem, ontem),
    dash.hotmart_faturamento_range(antesOntemIso, antesOntemIso),
    dash.hotmart_faturamento_range(j7.from, j7.to),
    dash.hotmart_faturamento_range(j30.from, j30.to),
    dash.meta_por_conta(ontem, ontem),
    dash.meta_por_conta(j7.from, j7.to),
    dash.meta_top_campanhas(ontem, ontem, 10),
    dash.meta_top_campanhas(j7.from, j7.to, 10),
    dash.meta_serie_diaria(30),
    dash.hotmart_serie_diaria(30),
  ]);

  // ROAS = receita Hotmart / gasto Meta
  const roas = (gastoMeta, receitaHotmart) =>
    gastoMeta > 0 ? receitaHotmart / gastoMeta : null;

  // Delta % comparativo
  const delta = (atual, anterior) =>
    anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;

  // Calcula ROAS por conta no range (usa rateio: fatHotmart total dividido pro share de gasto)
  // Ressalva: ROAS por conta exato exige tagging UTM, que nao temos. Aproximacao
  // = share-of-spend × receita total. Marcamos como ESTIMATIVA no relatorio.
  const totalGasto24h = porConta24h.reduce((s, c) => s + c.gasto, 0);
  const porConta24hRoas = porConta24h.map(c => ({
    ...c,
    share_pct: totalGasto24h > 0 ? (c.gasto * 100) / totalGasto24h : 0,
    receita_estimada: totalGasto24h > 0 ? (c.gasto / totalGasto24h) * fatHotmart24h.receita : 0,
    roas_estimado: c.gasto > 0 ? ((c.gasto / Math.max(totalGasto24h, 0.01)) * fatHotmart24h.receita) / c.gasto : null,
  }));

  const totalGasto7d = porConta7d.reduce((s, c) => s + c.gasto, 0);
  const porConta7dRoas = porConta7d.map(c => ({
    ...c,
    share_pct: totalGasto7d > 0 ? (c.gasto * 100) / totalGasto7d : 0,
    receita_estimada: totalGasto7d > 0 ? (c.gasto / totalGasto7d) * fatHotmart7d.receita : 0,
    roas_estimado: c.gasto > 0 ? ((c.gasto / Math.max(totalGasto7d, 0.01)) * fatHotmart7d.receita) / c.gasto : null,
  }));

  return {
    janelas: {
      ontem,
      antes_ontem: antesOntemIso,
      ultimos_7d: j7,
      ultimos_30d: j30,
    },
    snapshot: {
      h24: {
        gasto: kpis24h.gasto,
        receita: fatHotmart24h.receita,
        vendas: fatHotmart24h.vendas,
        purchases_pixel: kpis24h.purchases_pixel,
        roas: roas(kpis24h.gasto, fatHotmart24h.receita),
        cpa_pixel: kpis24h.purchases_pixel > 0 ? kpis24h.gasto / kpis24h.purchases_pixel : null,
        ticket_medio: fatHotmart24h.vendas > 0 ? fatHotmart24h.receita / fatHotmart24h.vendas : null,
        impressoes: kpis24h.impressoes,
        alcance: kpis24h.alcance,
        cliques: kpis24h.cliques,
        cpm: kpis24h.cpm,
        ctr_pct: kpis24h.ctr_pct,
        cpc: kpis24h.cpc,
        frequencia: kpis24h.frequencia_media,
        contas_ativas: kpis24h.contas_ativas,
        funil_pixel: { lpv: kpis24h.lpv, checkouts: kpis24h.checkouts, purchases: kpis24h.purchases_pixel },
      },
      h24_anterior: {
        gasto: kpis24hAnterior.gasto,
        receita: fatHotmart24hAnterior.receita,
        roas: roas(kpis24hAnterior.gasto, fatHotmart24hAnterior.receita),
      },
      delta_24h: {
        gasto_pct: delta(kpis24h.gasto, kpis24hAnterior.gasto),
        receita_pct: delta(fatHotmart24h.receita, fatHotmart24hAnterior.receita),
        roas_pct: delta(
          roas(kpis24h.gasto, fatHotmart24h.receita) || 0,
          roas(kpis24hAnterior.gasto, fatHotmart24hAnterior.receita) || 0
        ),
      },
      d7: {
        gasto: kpis7d.gasto,
        receita: fatHotmart7d.receita,
        vendas: fatHotmart7d.vendas,
        roas: roas(kpis7d.gasto, fatHotmart7d.receita),
        cpa_pixel: kpis7d.purchases_pixel > 0 ? kpis7d.gasto / kpis7d.purchases_pixel : null,
        ticket_medio: fatHotmart7d.vendas > 0 ? fatHotmart7d.receita / fatHotmart7d.vendas : null,
      },
      d30: {
        gasto: kpis30d.gasto,
        receita: fatHotmart30d.receita,
        vendas: fatHotmart30d.vendas,
        roas: roas(kpis30d.gasto, fatHotmart30d.receita),
        cpa_pixel: kpis30d.purchases_pixel > 0 ? kpis30d.gasto / kpis30d.purchases_pixel : null,
        ticket_medio: fatHotmart30d.vendas > 0 ? fatHotmart30d.receita / fatHotmart30d.vendas : null,
      },
    },
    contas_24h: porConta24hRoas,
    contas_7d: porConta7dRoas,
    top_campanhas_24h: topCampanhas24h,
    top_campanhas_7d: topCampanhas7d,
    serie_meta_30d: serieMeta30d,
    serie_hotmart_30d: serieHotmart30d,
  };
}

// ============================================================
// 2) MESTRES DE TRAFEGO — chama 5 em paralelo + Chief consolida
// ============================================================
async function analisarTrafficMasters({ dados, dataLongaBR, diaSemana }) {
  // Lê system_prompt dos 5 mestres + Chief do banco
  const r = await db.rodarSQL(`
    SELECT slug, nome, avatar, missao, system_prompt
      FROM pinguim.agentes
     WHERE squad_id = (SELECT id FROM pinguim.squads WHERE slug='traffic-masters')
       AND status = 'em_producao'
     ORDER BY slug
  `);
  const mestres = r.filter(m => m.slug !== 'traffic-chief');
  const chief = r.find(m => m.slug === 'traffic-chief');

  if (mestres.length === 0) {
    return { ok: false, motivo: 'squad traffic-masters vazia', plano_md: '', pareceres: [] };
  }

  // Briefing factual comum (passado pra cada mestre)
  const briefingFatos = montarBriefingFatos(dados, dataLongaBR);

  // Cada mestre recebe seu system_prompt + briefing + retorna parecer 2-3 parágrafos
  const pareceres = await Promise.all(mestres.map(async (m) => {
    const prompt = `${m.system_prompt}

## DADOS DO DIA (${dataLongaBR})

${briefingFatos}

## SUA TAREFA

Analise os dados acima sob seu olhar específico (${m.missao}).
Devolva APENAS 2 a 3 parágrafos compactos, em português direto, com:
- Diagnóstico específico (cite conta + número)
- 1 ação concreta sugerida

Sem floreio, sem introdução tipo "como Pedro Sobral, eu...". Vai direto.
NÃO invente número que não está no briefing.`;

    try {
      const texto = await runClaudeCLI(prompt, 90000);
      return { slug: m.slug, nome: m.nome, avatar: m.avatar, ok: true, texto: texto.trim() };
    } catch (e) {
      return { slug: m.slug, nome: m.nome, avatar: m.avatar, ok: false, motivo: e.message };
    }
  }));

  const sucessos = pareceres.filter(p => p.ok);
  if (sucessos.length === 0) {
    return { ok: false, motivo: 'todos mestres falharam', plano_md: '', pareceres };
  }

  // Chief consolida em plano de ação numerado
  let plano_md = '';
  if (chief) {
    const pareceresTexto = sucessos.map(p => `### ${p.avatar} ${p.nome}\n\n${p.texto}`).join('\n\n---\n\n');
    const promptChief = `${chief.system_prompt}

## DADOS DO DIA (${dataLongaBR})

${briefingFatos}

## PARECERES DOS 5 MESTRES

${pareceresTexto}

## SUA TAREFA

Consolide TUDO acima em um PLANO DE AÇÃO EXECUTIVO numerado (3 a 5 itens).
Cada item da lista deve ter:
- **Ação clara** (1 linha imperativa: "Pausar X", "Escalar Y para R$ Z/dia", "Trocar criativo Z")
- **Conta afetada** entre parênteses
- **Por quê** (1 frase, citando métrica específica do briefing)
- **Mestre que fundamentou** (📈 Pedro Sobral, 🎨 Felipe Mello, etc) — pode ser mais de um

Formato OBRIGATÓRIO (devolva APENAS o markdown da lista, sem introdução):

1. **[Ação clara]** ([Conta])
   *Por quê:* [motivo + métrica]
   *Fundamentou:* [emoji nome]

2. **...**

NÃO invente número. NÃO recomende escalar conta com ROAS<1. NÃO recomende pausar sem fadiga confirmada.`;

    try {
      plano_md = await runClaudeCLI(promptChief, 90000);
    } catch (e) {
      plano_md = `> ⚠ Chief falhou: ${e.message}`;
    }
  }

  return {
    ok: true,
    plano_md: plano_md.trim(),
    pareceres: sucessos.map(p => ({ slug: p.slug, nome: p.nome, avatar: p.avatar, texto: p.texto })),
  };
}

// ============================================================
// Briefing factual (texto enviado a cada mestre + ao sintetizador)
// ============================================================
function montarBriefingFatos(dados, dataLongaBR) {
  const s = dados.snapshot;
  const fmtBRL = v => v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = v => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  const fmtRoas = v => v == null ? '—' : `${v.toFixed(2)}x`;

  const linhas = [];
  linhas.push(`### KPIs principais (${dataLongaBR})`);
  linhas.push('');
  linhas.push(`**Ontem (24h):**`);
  linhas.push(`- Gasto: ${fmtBRL(s.h24.gasto)} (vs anteontem: ${fmtPct(s.delta_24h.gasto_pct)})`);
  linhas.push(`- Receita Hotmart: ${fmtBRL(s.h24.receita)} (vs anteontem: ${fmtPct(s.delta_24h.receita_pct)})`);
  linhas.push(`- ROAS real: ${fmtRoas(s.h24.roas)} (vs anteontem: ${fmtPct(s.delta_24h.roas_pct)})`);
  linhas.push(`- Vendas Hotmart: ${s.h24.vendas} · CPA Pixel: ${fmtBRL(s.h24.cpa_pixel)}`);
  linhas.push(`- Ticket médio: ${fmtBRL(s.h24.ticket_medio)}`);
  linhas.push(`- Impressões: ${s.h24.impressoes.toLocaleString('pt-BR')} · Alcance: ${s.h24.alcance.toLocaleString('pt-BR')} · CPM: ${fmtBRL(s.h24.cpm)} · CTR: ${s.h24.ctr_pct?.toFixed(2)}% · Freq: ${s.h24.frequencia?.toFixed(2)}`);
  linhas.push(`- Funil Pixel: LPV ${s.h24.funil_pixel.lpv} → Checkout ${s.h24.funil_pixel.checkouts} → Purchase ${s.h24.funil_pixel.purchases}`);
  linhas.push(`- Contas ativas: ${s.h24.contas_ativas}`);
  linhas.push('');
  linhas.push(`**Últimos 7 dias (rolling):**`);
  linhas.push(`- Gasto: ${fmtBRL(s.d7.gasto)} · Receita: ${fmtBRL(s.d7.receita)} · ROAS: ${fmtRoas(s.d7.roas)} · Vendas: ${s.d7.vendas}`);
  linhas.push(`- CPA Pixel médio: ${fmtBRL(s.d7.cpa_pixel)} · Ticket médio: ${fmtBRL(s.d7.ticket_medio)}`);
  linhas.push('');
  linhas.push(`**Últimos 30 dias (rolling):**`);
  linhas.push(`- Gasto: ${fmtBRL(s.d30.gasto)} · Receita: ${fmtBRL(s.d30.receita)} · ROAS: ${fmtRoas(s.d30.roas)} · Vendas: ${s.d30.vendas}`);
  linhas.push('');

  // Por conta (ontem)
  linhas.push(`### Breakdown por ad account (ontem 24h)`);
  if (dados.contas_24h.length === 0) {
    linhas.push('Nenhuma conta com gasto ontem.');
  } else {
    dados.contas_24h.forEach(c => {
      linhas.push(`- **${c.conta_nome}** — Gasto ${fmtBRL(c.gasto)} (${c.share_pct.toFixed(0)}%) · ROAS estimado ${fmtRoas(c.roas_estimado)} · Freq ${c.frequencia_media?.toFixed(2)} · CTR ${c.ctr_pct?.toFixed(2)}% · ${c.qtd_campanhas} campanhas ativas · Pixel ${c.purchases_pixel} purchases`);
    });
  }
  linhas.push('');

  // Top campanhas (ontem)
  linhas.push(`### Top campanhas por gasto (ontem)`);
  if (dados.top_campanhas_24h.length === 0) {
    linhas.push('Sem campanhas com gasto ontem.');
  } else {
    dados.top_campanhas_24h.slice(0, 5).forEach(c => {
      linhas.push(`- **${c.entity_name}** (${c.conta_nome}) — ${fmtBRL(c.gasto)} · Freq ${c.frequencia_media?.toFixed(2)} · CTR ${c.ctr_pct?.toFixed(2)}% · ${c.purchases_pixel} purchases Pixel`);
    });
  }
  linhas.push('');

  // Tendência (gasto 7d vs 7d anteriores via série 30d, opcional)
  return linhas.join('\n');
}

// ============================================================
// 3) SINTETIZADOR — Skill compor-meta-ads-diario via Claude CLI
// ============================================================
async function sintetizarMetaAdsDiario({ socioInfo, dados, planoMd, pareceres, dataBrt, diaSemana, dataHojeBrt, diaSemanaHoje, saudacao }) {
  // Carrega Skill
  const skillPath = path.join(__dirname, '..', '..', 'cerebro', 'squads', 'data', 'skills', 'compor-meta-ads-diario', 'SKILL.md');
  let skillMd = '';
  try { skillMd = fs.readFileSync(skillPath, 'utf-8'); }
  catch (_) { skillMd = '(Skill compor-meta-ads-diario não encontrada — composição ad-hoc)'; }

  const briefingFatos = montarBriefingFatos(dados, dataBrt);
  const pareceresMd = pareceres.map(p => `### ${p.avatar} **${p.nome}**\n\n${p.texto}`).join('\n\n');

  const prompt = `Você é o sintetizador do Relatório Meta Ads Diário do Pinguim OS.

## Contexto temporal
Hoje é ${diaSemanaHoje} ${dataHojeBrt} (dia em que o sócio LÊ o relatório).
Dia alvo dos DADOS: ${dataBrt} (${diaSemana}) — KPIs de ontem, comparativo 7d/30d rolling.
Destinatário: ${socioInfo.nome} (${socioInfo.empresa}).

## Sua tarefa
Compor o relatório em markdown puro seguindo a anatomia abaixo.
NUNCA invente número. SEMPRE cite a métrica que motivou cada afirmação.
Devolver APENAS o markdown final (sem comentário antes/depois, sem \`\`\`markdown wrapper).

## REGRA -1 — FORMATO
- NUNCA tabela GFM (\`| col |\`) — renderer HTML não suporta. Use **lista bullet** com bold no rótulo.
- Números monetários em BRL com R$ + separador BR (R$ 1.234,56).
- Percentuais com 1 casa decimal (+12.3%).
- ROAS com "x" no final (2.45x).

## Anatomia obrigatória

### 1. Saudação (1 linha) — usa HOJE, não dia alvo
\`☀️ ${saudacao}, ${socioInfo.nome} · Meta Ads · ${diaSemanaHoje} ${dataHojeBrt} · *dados de ${dataBrt}*\`

### 2. TL;DR (1 parágrafo de 2-3 linhas, sem bullets)
- Diga em 1 frase: ROAS de ontem foi X (positivo/negativo/neutro), tendência 7d sobe ou cai, qual conta puxou
- Conclua com 1 frase sobre o que importa pra HOJE (sem repetir o plano de ação, que vem depois)

### 3. SNAPSHOT (3 mini-cards lado a lado em bullet)
\`### 📊 SNAPSHOT\`

**Ontem (24h)** · Gasto R$ X · Receita R$ Y · ROAS Zx · ΔX% vs anteontem
**7 dias rolling** · Gasto R$ X · Receita R$ Y · ROAS Zx
**30 dias rolling** · Gasto R$ X · Receita R$ Y · ROAS Zx

### 4. PLANO DE AÇÃO DO BOARD (já consolidado pelo Traffic Chief — copie INTEGRAL)
\`### 🎯 PLANO DE AÇÃO HOJE\`
[copiar o plano consolidado abaixo na seção "PLANO CHIEF"]

### 5. ALERTAS (se houver, máximo 3)
\`### 🚨 ALERTAS\`
- Conta com ROAS < 1.0
- Frequência > 3 (fadiga)
- CTR < 0.8% (criativo morrendo)
- Queda > 30% vs ontem em alguma conta principal
Se 0 alertas reais: omita a seção inteira.

### 6. BREAKDOWN POR AD ACCOUNT (cards-lista)
\`### 🏦 POR CONTA — ONTEM\`

Pra cada conta de \`contas_24h\` (use dados brutos do briefing):
- **[Nome conta]** — Gasto R$ X (Y% do total) · ROAS estimado Zx · Freq W · CTR V% · N campanhas · K purchases Pixel

Ordene por gasto desc. Inclua um "**Total**" no final somando gastos.

### 7. TOP CAMPANHAS (ontem)
\`### 🎬 TOP CAMPANHAS — ONTEM\`
- Lista bullet das top 5 do briefing (entity_name + conta + métricas)

### 8. PARECERES INDIVIDUAIS DOS MESTRES
\`### 🧠 ANÁLISE DETALHADA\`

Cole INTEGRAL os pareceres dos mestres abaixo (use o markdown "## Pareceres" enviado).
Mantenha o emoji + nome + texto.

### 9. RODAPÉ
\`---\`
\`*Dados: dashboard Pinguim Ads (Supabase compartilhado) · Hotmart receita + Meta gasto. ROAS por conta é ESTIMATIVA (share-of-spend × receita total) pois não temos UTM cross-source.*\`

## DADOS PARA USAR (FATOS, não invente)

${briefingFatos}

## PLANO CHIEF (copiar INTEGRAL na seção 4)

${planoMd}

## PARECERES INDIVIDUAIS (copiar INTEGRAL na seção 8)

${pareceresMd}

## Saída
Comece direto pela linha 1 (\`☀️ ${saudacao}...\`). Nada antes. Só o markdown final.`;

  return await runClaudeCLI(prompt, 120000);
}

// ============================================================
// 4) ORQUESTRADOR PRINCIPAL — gera relatorio end-to-end
// ============================================================
async function gerarRelatorioMetaAds({
  cliente_id = null,
  dia_alvo_brt = null,
  salvar = true,
  parent_id = null, // V2.15 versionamento
} = {}) {
  const t0 = Date.now();

  // 1) Sócio
  const cid = await db.resolverClienteId(cliente_id);
  let socioInfo;
  try { socioInfo = await socio.getSocioAtual(); }
  catch (e) { socioInfo = { cliente_id: cid, slug: 'desconhecido', nome: 'Sócio', empresa: '?' }; }

  // 2) Dia alvo (default: ontem BRT)
  const agora = new Date();
  if (!dia_alvo_brt) {
    dia_alvo_brt = dash.ontemBRT();
  }

  // 3) Dados temporais pra headlines
  const dataLongaBR = googleCalendar.dataLongaBRdoDiaAlvo(dia_alvo_brt);
  const diaSemana = googleCalendar.diaSemanaBRdoDiaAlvo(dia_alvo_brt);

  const fmtHoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const partsHoje = fmtHoje.formatToParts(agora);
  const hoje_brt = `${partsHoje.find(p => p.type === 'year').value}-${partsHoje.find(p => p.type === 'month').value}-${partsHoje.find(p => p.type === 'day').value}`;
  const dataHojeBrt = googleCalendar.dataLongaBRdoDiaAlvo(hoje_brt);
  const diaSemanaHoje = googleCalendar.diaSemanaBRdoDiaAlvo(hoje_brt);

  const horaBRT = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora), 10);
  let saudacao = 'Bom dia';
  if (horaBRT >= 12 && horaBRT < 18) saudacao = 'Boa tarde';
  else if (horaBRT >= 18 || horaBRT < 5) saudacao = 'Boa noite';

  // 4) Coleta dados
  const t_coleta = Date.now();
  const dados = await coletarDadosMetaAds({ dia_alvo_brt });
  const dur_coleta = Date.now() - t_coleta;

  // 5) Squad traffic-masters
  const t_squad = Date.now();
  const squad = await analisarTrafficMasters({ dados, dataLongaBR, diaSemana });
  const dur_squad = Date.now() - t_squad;

  // 6) Sintetiza
  const t_sint = Date.now();
  let md_final;
  let sintetizador_ok = true;
  let sintetizador_motivo = null;

  const fallback = () => {
    const linhas = [];
    linhas.push(`# Meta Ads Diário — ${diaSemana} ${dataLongaBR}`);
    linhas.push('');
    linhas.push(`> ⚠ Sintetizador (Claude CLI) ${sintetizador_motivo ? 'falhou: ' + sintetizador_motivo : 'devolveu vazio'}.`);
    linhas.push(`> Mostrando briefing factual + pareceres mestres + plano Chief.`);
    linhas.push('');
    linhas.push(montarBriefingFatos(dados, dataLongaBR));
    linhas.push('');
    if (squad.plano_md) {
      linhas.push('## 🎯 PLANO DE AÇÃO');
      linhas.push('');
      linhas.push(squad.plano_md);
      linhas.push('');
    }
    if (squad.pareceres.length > 0) {
      linhas.push('## 🧠 ANÁLISE DETALHADA');
      linhas.push('');
      squad.pareceres.forEach(p => {
        linhas.push(`### ${p.avatar} **${p.nome}**`);
        linhas.push('');
        linhas.push(p.texto);
        linhas.push('');
      });
    }
    return linhas.join('\n');
  };

  try {
    md_final = await sintetizarMetaAdsDiario({
      socioInfo, dados,
      planoMd: squad.plano_md || '',
      pareceres: squad.pareceres,
      dataBrt: dataLongaBR, diaSemana,
      dataHojeBrt, diaSemanaHoje, saudacao,
    });
    if (!md_final || md_final.trim().length < 300) {
      sintetizador_ok = false;
      sintetizador_motivo = `stdout vazio/curto (${md_final ? md_final.trim().length : 0} chars)`;
      md_final = fallback();
    }
  } catch (e) {
    sintetizador_ok = false;
    sintetizador_motivo = e.message;
    md_final = fallback();
  }
  const dur_sint = Date.now() - t_sint;

  // 7) Salva entregavel
  let entregavel = null;
  if (salvar) {
    try {
      const titulo = `Meta Ads diário — ${diaSemanaHoje} ${dataHojeBrt} · dados de ${dataLongaBR}`;
      entregavel = await db.salvarEntregavel({
        cliente_id: cid,
        tipo: 'relatorio-meta-ads-diario',
        titulo,
        parent_id,
        conteudo_md: md_final,
        conteudo_estruturado: {
          dia_alvo_brt,
          gerado_em: agora.toISOString(),
          snapshot: dados.snapshot,
          contas_24h: dados.contas_24h,
          contas_7d: dados.contas_7d,
          top_campanhas_24h: dados.top_campanhas_24h,
          top_campanhas_7d: dados.top_campanhas_7d,
          serie_meta_30d: dados.serie_meta_30d,
          serie_hotmart_30d: dados.serie_hotmart_30d,
          squad: { ok: squad.ok, motivo: squad.motivo || null, qtd_pareceres: squad.pareceres.length },
          sintetizador: { ok: sintetizador_ok, motivo: sintetizador_motivo },
          socio: socioInfo,
          duracoes_ms: { coleta: dur_coleta, squad: dur_squad, sintetizador: dur_sint, total: Date.now() - t0 },
        },
      });
    } catch (e) {
      console.error(`[relatorio-meta-ads] erro salvando entregavel: ${e.message}`);
    }
  }

  return {
    ok: true,
    entregavel_id: entregavel?.id || null,
    entregavel_url: entregavel?.id ? `/entregavel/${entregavel.id}` : null,
    entregavel_versao: entregavel?.versao || null,
    titulo: entregavel ? `Meta Ads diário — ${diaSemanaHoje} ${dataHojeBrt} · dados de ${dataLongaBR}` : null,
    dia_alvo_brt,
    md_final,
    sintetizador: { ok: sintetizador_ok, motivo: sintetizador_motivo },
    squad: { ok: squad.ok, motivo: squad.motivo || null, qtd_pareceres: squad.pareceres.length },
    duracoes_ms: { coleta: dur_coleta, squad: dur_squad, sintetizador: dur_sint, total: Date.now() - t0 },
  };
}

module.exports = {
  gerarRelatorioMetaAds,
  coletarDadosMetaAds,
  analisarTrafficMasters,
  montarBriefingFatos,
};
