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
  // V3.1 Andre 2026-05-13: 100% Meta. Sem cruzar Hotmart.
  // Receita/vendas/ROAS são do PIXEL — action_values purchase no jsonb.
  // Razão: relatório precisa mostrar APENAS o que Meta rastreou. ROAS baixo
  // = sinal de venda não-trackeada (e por sí só é informação valiosa).

  const j7 = dash.janelaUltimosNDias(7);
  const j30 = dash.janelaUltimosNDias(30);
  const ontem = dia_alvo_brt;

  const dataOntem = new Date(`${ontem}T03:00:00Z`);
  const antesOntem = new Date(dataOntem.getTime() - 24 * 60 * 60 * 1000);
  const antesOntemIso = antesOntem.toISOString().slice(0, 10);

  const [
    kpis24h, kpis24hAnterior, kpis7d, kpis30d,
    porConta24h, porConta7d,
    topCampanhas24h, topCampanhas7d,
    serieMeta30d,
  ] = await Promise.all([
    dash.meta_kpis_range(ontem, ontem),
    dash.meta_kpis_range(antesOntemIso, antesOntemIso),
    dash.meta_kpis_range(j7.from, j7.to),
    dash.meta_kpis_range(j30.from, j30.to),
    dash.meta_por_conta(ontem, ontem),
    dash.meta_por_conta(j7.from, j7.to),
    dash.meta_top_campanhas(ontem, ontem, 10),
    dash.meta_top_campanhas(j7.from, j7.to, 10),
    dash.meta_serie_diaria(30),
  ]);

  const delta = (atual, anterior) => anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;

  // Share of spend por conta (visualização — não confunde com atribuição)
  const totalGasto24h = porConta24h.reduce((s, c) => s + c.gasto, 0);
  const porConta24hShare = porConta24h.map(c => ({
    ...c,
    share_pct: totalGasto24h > 0 ? (c.gasto * 100) / totalGasto24h : 0,
  }));
  const totalGasto7d = porConta7d.reduce((s, c) => s + c.gasto, 0);
  const porConta7dShare = porConta7d.map(c => ({
    ...c,
    share_pct: totalGasto7d > 0 ? (c.gasto * 100) / totalGasto7d : 0,
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
        receita_pixel: kpis24h.receita_pixel,
        purchases_pixel: kpis24h.purchases_pixel,
        roas_pixel: kpis24h.roas_pixel,
        cpa_pixel: kpis24h.cpa_pixel,
        ticket_medio_pixel: kpis24h.ticket_medio_pixel,
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
        receita_pixel: kpis24hAnterior.receita_pixel,
        roas_pixel: kpis24hAnterior.roas_pixel,
      },
      delta_24h: {
        gasto_pct: delta(kpis24h.gasto, kpis24hAnterior.gasto),
        receita_pixel_pct: delta(kpis24h.receita_pixel, kpis24hAnterior.receita_pixel),
        roas_pixel_pct: delta(kpis24h.roas_pixel || 0, kpis24hAnterior.roas_pixel || 0),
      },
      d7: {
        gasto: kpis7d.gasto,
        receita_pixel: kpis7d.receita_pixel,
        purchases_pixel: kpis7d.purchases_pixel,
        roas_pixel: kpis7d.roas_pixel,
        cpa_pixel: kpis7d.cpa_pixel,
        ticket_medio_pixel: kpis7d.ticket_medio_pixel,
      },
      d30: {
        gasto: kpis30d.gasto,
        receita_pixel: kpis30d.receita_pixel,
        purchases_pixel: kpis30d.purchases_pixel,
        roas_pixel: kpis30d.roas_pixel,
        cpa_pixel: kpis30d.cpa_pixel,
        ticket_medio_pixel: kpis30d.ticket_medio_pixel,
      },
    },
    contas_24h: porConta24hShare,
    contas_7d: porConta7dShare,
    top_campanhas_24h: topCampanhas24h,
    top_campanhas_7d: topCampanhas7d,
    serie_meta_30d: serieMeta30d,
  };
}

// ============================================================
// 2) MESTRES DE TRAFEGO — chama 5 em paralelo + Chief consolida
// ============================================================
async function analisarTrafficMasters({ dados, dataLongaBR, diaSemana }) {
  // Lê 5 mestres + Chief ativos
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
    return { ok: false, motivo: 'squad traffic-masters vazia', plano_md: '', matriz: [], pareceres: [] };
  }

  const contasNomes = (dados.contas_24h || []).map(c => c.conta_nome);
  const briefingFatos = montarBriefingFatos(dados, dataLongaBR);

  // Helper: extrai JSON do output (tolerante a wrappers ```json e ruído)
  const extrairJson = (bloco) => {
    if (!bloco) return null;
    const m = bloco.match(/```json\s*([\s\S]*?)\s*```/);
    if (m) return m[1];
    const inicioObj = bloco.indexOf('{');
    const inicioArr = bloco.indexOf('[');
    if (inicioObj === -1 && inicioArr === -1) return null;
    const inicio = (inicioObj !== -1 && (inicioArr === -1 || inicioObj < inicioArr)) ? inicioObj : inicioArr;
    const fimObj = bloco.lastIndexOf('}');
    const fimArr = bloco.lastIndexOf(']');
    const fim = Math.max(fimObj, fimArr);
    return bloco.slice(inicio, fim + 1);
  };

  // V3 (Andre 2026-05-13): cada mestre devolve JSON estruturado POR CONTA.
  // Drill-down vira navegável (mestre → contas → diagnóstico + ação imperativa).
  const pareceres = await Promise.all(mestres.map(async (m) => {
    const prompt = `${m.system_prompt}

## DADOS DO DIA (${dataLongaBR})

${briefingFatos}

## CONTAS ATIVAS A ANALISAR

${contasNomes.map(c => `- ${c}`).join('\n')}

## SUA TAREFA — RETORNE JSON ESTRUTURADO POR CONTA

Para cada conta acima, devolva um objeto com:

- "acao_curta": **VERBO + NOME DA CONTA/CAMPANHA, MÁXIMO 3-5 PALAVRAS, SEM NÚMERO**. Exemplos válidos:
  - "Escalar [365]"
  - "Pausar [PVV]"
  - "Cortar [DLT]"
  - "Implementar UTM"
  - "Trocar criativo"
  - "Manter budget"
  - "Sem observação"
  Esse campo vai pra MATRIZ visual (precisa caber em célula pequena). NUNCA mais que 5 palavras. NÃO inclua números nem detalhes.

- "acao_completa": A AÇÃO COMPLETA com números e justificativa (até ~150 chars). Ex: "Escalar [365] Público Quente R$286→R$570/dia, manter freq <1.5". Vai no drill-down.

- "diagnostico": 1-2 frases (max ~200 chars) com o que VOCÊ vê nessa conta sob seu olhar específico (${m.missao}). Vai no drill-down também.

- "sinal": "good" (oportunidade/escalar) | "warn" (atenção/manter) | "bad" (cortar/pausar/risco) | "mute" (sem observação)

DEVOLVA APENAS o JSON abaixo (sem texto antes/depois, sem markdown wrapper extra):

\`\`\`json
{
  "por_conta": [
    {
      "conta": "<nome exato da conta>",
      "acao_curta": "<3-5 palavras, sem número>",
      "acao_completa": "<verbo + métrica completa>",
      "diagnostico": "<1-2 frases>",
      "sinal": "good|warn|bad|mute"
    }
  ],
  "tese_geral": "<1 frase resumindo a TESE central que conecta as 3 análises, max 200 chars>"
}
\`\`\`

REGRAS DURAS:
- NÃO invente número que não está no briefing
- "acao_curta" SEMPRE 3-5 palavras MÁXIMO — sem número, sem detalhe
- "acao_completa" tem número + métrica específica
- Se a conta não tem nada acionável pelo SEU olhar, sinal=mute / acao_curta="Sem observação" / acao_completa=""
- Pedro Sobral NÃO recomenda escalar conta com ROAS<1 (regra dura)`;

    try {
      const respostaRaw = await runClaudeCLI(prompt, 90000);
      let analise = { por_conta: [], tese_geral: '' };
      try {
        const j = extrairJson(respostaRaw);
        if (j) analise = JSON.parse(j);
      } catch (e) {
        analise = { por_conta: [], tese_geral: respostaRaw.slice(0, 400) };
      }
      return {
        slug: m.slug,
        nome: m.nome,
        avatar: m.avatar,
        ok: true,
        por_conta: Array.isArray(analise.por_conta) ? analise.por_conta : [],
        tese_geral: analise.tese_geral || '',
      };
    } catch (e) {
      return { slug: m.slug, nome: m.nome, avatar: m.avatar, ok: false, motivo: e.message };
    }
  }));

  const sucessos = pareceres.filter(p => p.ok);
  if (sucessos.length === 0) {
    return { ok: false, motivo: 'todos mestres falharam', plano_md: '', matriz: [], pareceres };
  }

  // Monta matriz Conta×Mestre DIRETO dos JSONs dos mestres.
  // Célula: frase curta (3-5 palavras, vai pra matriz visual).
  // acao_completa + diagnostico ficam no drill-down do mestre.
  const matriz = contasNomes.map(conta => {
    const celulas = {};
    sucessos.forEach(p => {
      const ana = (p.por_conta || []).find(x => x.conta === conta);
      celulas[p.slug] = ana
        ? {
            frase: ana.acao_curta || ana.acao || 'Sem observação',
            sinal: ana.sinal || 'mute',
          }
        : { frase: 'Sem observação', sinal: 'mute' };
    });
    return { conta, celulas };
  });

  // Chief só consolida em PLANO DE AÇÃO (a matriz e tese vêm dos mestres já)
  let plano_md = '';
  if (chief) {
    const pareceresJson = sucessos.map(p => ({
      mestre: p.nome,
      slug: p.slug,
      avatar: p.avatar,
      tese: p.tese_geral,
      por_conta: p.por_conta,
    }));

    const promptChief = `${chief.system_prompt}

## DADOS DO DIA (${dataLongaBR})

${briefingFatos}

## ANÁLISES POR CONTA DOS ${sucessos.length} MESTRES (já estruturado)

\`\`\`json
${JSON.stringify(pareceresJson, null, 2)}
\`\`\`

## SUA TAREFA

Consolide as análises acima em um PLANO DE AÇÃO EXECUTIVO numerado de 3 a 5 itens.

Cada item deve ter EXATAMENTE este formato em markdown:

\`\`\`
1. **[VERBO IMPERATIVO + ação específica]** ([Conta afetada])
   *Por quê:* [1 frase com motivo + métrica específica]
   *Fundamentou:* [emoji nome] [, emoji nome2 se mais de um]

2. ...
\`\`\`

REGRAS DURAS:
- VERBO IMPERATIVO: "Escalar", "Pausar", "Implementar", "Migrar", "Cortar", "Trocar", "Auditar"
- NÃO use: "considerar", "talvez", "poderia", "vale a pena"
- Cite a CONTA específica entre parênteses
- Cite o MESTRE (com emoji) que fundamentou a ação
- "Por quê" deve ter NÚMERO REAL do briefing
- NÃO invente número
- NÃO recomende escalar conta com ROAS<1
- Devolva APENAS o markdown da lista numerada, SEM texto antes/depois`;

    try {
      plano_md = await runClaudeCLI(promptChief, 90000);
      plano_md = plano_md.trim();
      // Remove eventual ```markdown wrapper externo
      plano_md = plano_md.replace(/^```\w*\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    } catch (e) {
      plano_md = `> ⚠ Chief falhou: ${e.message}`;
    }
  }

  return {
    ok: true,
    plano_md,
    matriz,
    pareceres: sucessos.map(p => ({
      slug: p.slug,
      nome: p.nome,
      avatar: p.avatar,
      tese_geral: p.tese_geral,
      por_conta: p.por_conta,
    })),
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
  linhas.push(`### KPIs Meta Ads (${dataLongaBR}) — 100% Pixel`);
  linhas.push(`> Fonte única: tabela \`metricas_diarias\` (Meta Marketing API). Receita e vendas vêm do Pixel — venda fora do rastreamento NÃO aparece aqui.`);
  linhas.push('');
  linhas.push(`**Ontem (24h):**`);
  linhas.push(`- Gasto: ${fmtBRL(s.h24.gasto)} (vs anteontem: ${fmtPct(s.delta_24h.gasto_pct)})`);
  linhas.push(`- Receita Pixel: ${fmtBRL(s.h24.receita_pixel)} (vs anteontem: ${fmtPct(s.delta_24h.receita_pixel_pct)})`);
  linhas.push(`- ROAS Pixel: ${fmtRoas(s.h24.roas_pixel)} (vs anteontem: ${fmtPct(s.delta_24h.roas_pixel_pct)})`);
  linhas.push(`- Purchases Pixel: ${s.h24.purchases_pixel} · CPA Pixel: ${fmtBRL(s.h24.cpa_pixel)} · Ticket médio Pixel: ${fmtBRL(s.h24.ticket_medio_pixel)}`);
  linhas.push(`- Impressões: ${s.h24.impressoes.toLocaleString('pt-BR')} · Alcance: ${s.h24.alcance.toLocaleString('pt-BR')} · CPM: ${fmtBRL(s.h24.cpm)} · CTR: ${s.h24.ctr_pct?.toFixed(2)}% · Freq: ${s.h24.frequencia?.toFixed(2)}`);
  linhas.push(`- Funil Pixel: LPV ${s.h24.funil_pixel.lpv} → Checkout ${s.h24.funil_pixel.checkouts} → Purchase ${s.h24.funil_pixel.purchases}`);
  linhas.push(`- Contas ativas: ${s.h24.contas_ativas}`);
  linhas.push('');
  linhas.push(`**Últimos 7 dias (rolling):**`);
  linhas.push(`- Gasto: ${fmtBRL(s.d7.gasto)} · Receita Pixel: ${fmtBRL(s.d7.receita_pixel)} · ROAS Pixel: ${fmtRoas(s.d7.roas_pixel)} · Purchases: ${s.d7.purchases_pixel}`);
  linhas.push(`- CPA Pixel médio: ${fmtBRL(s.d7.cpa_pixel)} · Ticket médio Pixel: ${fmtBRL(s.d7.ticket_medio_pixel)}`);
  linhas.push('');
  linhas.push(`**Últimos 30 dias (rolling):**`);
  linhas.push(`- Gasto: ${fmtBRL(s.d30.gasto)} · Receita Pixel: ${fmtBRL(s.d30.receita_pixel)} · ROAS Pixel: ${fmtRoas(s.d30.roas_pixel)} · Purchases: ${s.d30.purchases_pixel}`);
  linhas.push('');

  linhas.push(`### Breakdown por ad account (ontem 24h)`);
  if (dados.contas_24h.length === 0) {
    linhas.push('Nenhuma conta com gasto ontem.');
  } else {
    dados.contas_24h.forEach(c => {
      linhas.push(`- **${c.conta_nome}** — Gasto ${fmtBRL(c.gasto)} (${c.share_pct.toFixed(0)}%) · Receita Pixel ${fmtBRL(c.receita_pixel)} · ROAS Pixel ${fmtRoas(c.roas_pixel)} · Freq ${c.frequencia_media?.toFixed(2)} · CTR ${c.ctr_pct?.toFixed(2)}% · ${c.qtd_campanhas} camp. · ${c.purchases_pixel} purchases Pixel`);
    });
  }
  linhas.push('');

  linhas.push(`### Top campanhas por gasto (ontem)`);
  if (dados.top_campanhas_24h.length === 0) {
    linhas.push('Sem campanhas com gasto ontem.');
  } else {
    dados.top_campanhas_24h.slice(0, 5).forEach(c => {
      linhas.push(`- **${c.entity_name}** (${c.conta_nome}) — ${fmtBRL(c.gasto)} · Receita Pixel ${fmtBRL(c.receita_pixel)} · ROAS Pixel ${fmtRoas(c.roas_pixel)} · Freq ${c.frequencia_media?.toFixed(2)} · CTR ${c.ctr_pct?.toFixed(2)}% · ${c.purchases_pixel} purchases`);
    });
  }
  linhas.push('');

  return linhas.join('\n');
}

// ============================================================
// 3) SINTETIZADOR — Skill compor-meta-ads-diario via Claude CLI
// ============================================================
async function sintetizarMetaAdsDiario({ socioInfo, dados, planoMd, matriz, pareceres, dataBrt, diaSemana, dataHojeBrt, diaSemanaHoje, saudacao }) {
  // Andre 2026-05-13 redesign: matriz + pareceres ficam no TEMPLATE HTML
  // (renderizado por lib/template-relatorio-meta-ads.js).
  // Sintetizador só monta TL;DR + snapshot bullet + plano + alertas + breakdown + top.
  // Pareceres NÃO entram no markdown — template HTML mostra resumos + colapsável.

  const briefingFatos = montarBriefingFatos(dados, dataBrt);

  const prompt = `Você é o sintetizador do Relatório Meta Ads Diário do Pinguim OS.

## Contexto temporal
Hoje é ${diaSemanaHoje} ${dataHojeBrt} (dia em que o sócio LÊ o relatório).
Dia alvo dos DADOS: ${dataBrt} (${diaSemana}).

## Sua tarefa
Compor o relatório em markdown puro seguindo a anatomia EXATA abaixo.
NUNCA invente número.
Devolver APENAS o markdown final (sem comentário antes/depois, sem \`\`\`markdown wrapper).
Texto enxuto. Sócio lê em <30 segundos.

## REGRA -1 — FORMATO
- NUNCA tabela GFM — use **lista bullet** com bold no rótulo
- BRL com separador BR (R$ 1.234,56)
- Percentuais com 1 casa (+12.3%)
- ROAS com "x" no final (2.45x)

## Anatomia obrigatória (NÃO INVENTE seções extras)

### Linha 1 — Saudação
\`☀️ ${saudacao}, ${socioInfo.nome} · Meta Ads · ${diaSemanaHoje} ${dataHojeBrt} · *dados de ${dataBrt}*\`

### Bloco TL;DR
- Cabeçalho: \`## TL;DR\`
- 1 parágrafo de NO MÁXIMO 2 linhas, direto:
  - ROAS de ontem + tendência 7d (sobe/cai/estável) + qual conta puxou
  - 1 frase sobre o que importa HOJE (sem repetir o plano)

### Bloco SNAPSHOT (100% Pixel — fonte única Meta)
- Cabeçalho: \`## 📊 SNAPSHOT · 100% Meta Pixel\`
- 3 bullets — SEMPRE inclui quantidade de Compras (purchases Pixel):
  - **Ontem (24h)** · Gasto R$ X · Receita Pixel R$ Y · Compras Pixel N · CPA R$ W · ROAS Pixel Zx · ΔX% vs anteontem
  - **7 dias rolling** · Gasto R$ X · Receita Pixel R$ Y · Compras N · ROAS Pixel Zx
  - **30 dias rolling** · Gasto R$ X · Receita Pixel R$ Y · Compras N · ROAS Pixel Zx

### Bloco PLANO DE AÇÃO
- Cabeçalho: \`## 🎯 PLANO DE AÇÃO HOJE\`
- COPIAR INTEGRAL o markdown abaixo na seção "PLANO CHIEF"

### Bloco ALERTAS (omitir se vazio)
- Cabeçalho: \`## 🚨 ALERTAS\`
- Máximo 3 bullets curtos, só riscos reais:
  - Conta com ROAS<1 (queimando)
  - Frequência > 2.5 + CTR caindo (fadiga)
  - Conta com 0 purchases mas alto gasto
- Cada alerta em 1 linha bullet, em **bold** o nome da conta

### Bloco BREAKDOWN POR CONTA
- Cabeçalho: \`## 🏦 POR CONTA — ONTEM\`
- Pra cada item de \`contas_24h\` do briefing, 1 bullet:
  - **[Nome conta]** — Gasto R$ X (Y%) · ROAS Pixel Zx · Freq W · CTR V% · N camp. · K purchases Pixel
- Última linha: \`**Total** — Gasto R$ X · Receita Pixel R$ Y · ROAS Pixel Zx · N purchases\`

### Bloco TOP CAMPANHAS
- Cabeçalho: \`## 🎬 TOP CAMPANHAS — ONTEM\`
- Bullets das top 5 do briefing (entity_name + conta + R$ + freq + CTR + purchases)

### Rodapé
\`---\`
\`*Fonte única: Meta Marketing API · tabela \`metricas_diarias\`. Receita/ROAS/Vendas são do PIXEL — venda não-trackeada não aparece aqui (recurso, não bug).*\`

**NÃO** inclua "Análise Detalhada" / "Pareceres dos Mestres" — template HTML cuida disso.

## DADOS PARA USAR (FATOS — não invente nada além disso)

${briefingFatos}

## PLANO CHIEF (copiar INTEGRAL na seção PLANO DE AÇÃO)

${planoMd || '_(plano não disponível)_'}

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
      matriz: squad.matriz || [],
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
          // V2.15.2 redesign Andre 2026-05-13
          matriz: squad.matriz || [],
          pareceres: squad.pareceres, // já inclui {resumo, texto, slug, nome, avatar}
          plano_md: squad.plano_md || '',
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
