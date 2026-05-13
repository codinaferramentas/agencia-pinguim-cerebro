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
    return { ok: false, motivo: 'todos mestres falharam', plano_md: '', matriz: [], pareceres };
  }

  // Lista de contas reais (do briefing) pra matriz
  const contasNomes = (dados.contas_24h || []).map(c => c.conta_nome);

  // Chief faz UM call que devolve TRÊS coisas (plano + resumos + matriz)
  // num bloco JSON. Mais barato que 3 calls separados (75s → 25s).
  let plano_md = '';
  let resumos = {}; // slug → texto curto (3 linhas)
  let matriz = []; // [{conta, celulas: [{slug_mestre, frase, sinal}]}]

  if (chief) {
    const pareceresTexto = sucessos.map(p => `### ${p.avatar} ${p.nome} (${p.slug})\n\n${p.texto}`).join('\n\n---\n\n');
    const slugsMestres = sucessos.map(p => `${p.slug} (${p.nome})`).join(', ');
    const contasLista = contasNomes.length > 0 ? contasNomes.map(c => `- ${c}`).join('\n') : '- (sem contas com gasto)';

    const promptChief = `${chief.system_prompt}

## DADOS DO DIA (${dataLongaBR})

${briefingFatos}

## PARECERES DOS ${sucessos.length} MESTRES

${pareceresTexto}

## CONTAS ATIVAS ONTEM

${contasLista}

## SUA TAREFA (devolva 3 BLOCOS na ordem)

### BLOCO 1 — PLANO DE AÇÃO (markdown lista numerada 3 a 5 itens)

Formato:
\`\`\`
1. **[Ação clara]** ([Conta])
   *Por quê:* [motivo + métrica]
   *Fundamentou:* [emoji nome]

2. **...**
\`\`\`

### BLOCO 2 — RESUMOS CURTOS (JSON)

Pra cada mestre, um resumo de 2 a 3 linhas (máx 280 chars) que captura O ESSENCIAL do parecer dele. Esse resumo é o que aparece SEMPRE visível (parecer longo fica colapsado).

\`\`\`json
{
  "pedro-sobral": "texto curto até 280 chars",
  "felipe-mello": "...",
  ...
}
\`\`\`

Use EXATAMENTE estes slugs: ${slugsMestres}

### BLOCO 3 — MATRIZ CONTA × MESTRE (JSON)

Pra cada CONTA listada acima, cria uma linha. Pra cada par (conta × mestre), uma célula com:
- \`frase\`: 4-10 palavras (telegráfico, ex: "Escalar 365 R$286→570", "Pausar 48h", "Pixel cego — 0 buys")
- \`sinal\`: um de \`good\` (verde, ação positiva/oportunidade), \`bad\` (vermelho, ação destrutiva/risco), \`warn\` (amarelo, atenção), \`mute\` (cinza, neutro/sem ação)

\`\`\`json
[
  {
    "conta": "[DCL] Desafio Lofi + Quizz",
    "celulas": {
      "pedro-sobral": { "frase": "Escalar 365 R$286→570", "sinal": "good" },
      "felipe-mello": { "frase": "Pausar PVV freq 1.47", "sinal": "bad" },
      "andre-vaz": { "frase": "ROAS 8x real (8 buys)", "sinal": "good" },
      "tatiana-pizzato": { "frase": "Rebalancear 65→55%", "sinal": "warn" },
      "tiago-tessmann": { "frase": "Exclusão >75% view", "sinal": "warn" }
    }
  },
  ...
]
\`\`\`

Se uma conta NÃO foi mencionada por um mestre, ainda assim coloca uma célula com \`{ "frase": "sem observação", "sinal": "mute" }\`.

## REGRAS DURAS

- BLOCO 1: NÃO invente número. NÃO recomende escalar conta com ROAS<1. NÃO recomende pausar sem fadiga confirmada.
- BLOCO 2: resumo é DIFERENTE do parecer completo. É 2-3 linhas DENSAS que captam a ideia central + ação.
- BLOCO 3: célula deve ser TELEGRÁFICA (4-10 palavras). Sem floreio. Use abreviações ("R$" pode virar "$" se ajudar).
- Devolva SEM \`\`\`json wrapper externo, mas mantenha os 3 blocos com os separadores \`### BLOCO N\` literais pra eu parsear.`;

    try {
      const respostaChief = await runClaudeCLI(promptChief, 120000);
      // Parser: separa por "### BLOCO N"
      const partes = respostaChief.split(/### BLOCO \d+[^\n]*\n/);
      // partes[0] = lixo antes do bloco 1 (geralmente vazio)
      // partes[1] = plano
      // partes[2] = resumos json
      // partes[3] = matriz json
      plano_md = (partes[1] || '').trim();
      const blocoResumos = (partes[2] || '').trim();
      const blocoMatriz = (partes[3] || '').trim();
      // Extrai JSON entre ```json ... ```
      const extrairJson = (bloco) => {
        const m = bloco.match(/```json\s*([\s\S]*?)\s*```/);
        if (m) return m[1];
        // Tenta sem wrapper
        const inicioObj = bloco.indexOf('{');
        const inicioArr = bloco.indexOf('[');
        if (inicioObj === -1 && inicioArr === -1) return null;
        const inicio = (inicioObj !== -1 && (inicioArr === -1 || inicioObj < inicioArr)) ? inicioObj : inicioArr;
        const fimObj = bloco.lastIndexOf('}');
        const fimArr = bloco.lastIndexOf(']');
        const fim = Math.max(fimObj, fimArr);
        return bloco.slice(inicio, fim + 1);
      };
      try {
        const j = extrairJson(blocoResumos);
        if (j) resumos = JSON.parse(j);
      } catch (_) { /* segue sem resumos */ }
      try {
        const j = extrairJson(blocoMatriz);
        if (j) matriz = JSON.parse(j);
      } catch (_) { /* segue sem matriz */ }
    } catch (e) {
      plano_md = `> ⚠ Chief falhou: ${e.message}`;
    }
  }

  return {
    ok: true,
    plano_md: plano_md.trim(),
    matriz,
    pareceres: sucessos.map(p => ({
      slug: p.slug,
      nome: p.nome,
      avatar: p.avatar,
      texto: p.texto,
      resumo: resumos[p.slug] || (p.texto.split(/\n\n/)[0] || '').slice(0, 280),
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

### Bloco SNAPSHOT
- Cabeçalho: \`## 📊 SNAPSHOT\`
- 3 bullets:
  - **Ontem (24h)** · Gasto R$ X · Receita R$ Y · ROAS Zx · ΔX% vs anteontem
  - **7 dias rolling** · Gasto R$ X · Receita R$ Y · ROAS Zx
  - **30 dias rolling** · Gasto R$ X · Receita R$ Y · ROAS Zx

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
  - **[Nome conta]** — Gasto R$ X (Y%) · ROAS Zx · Freq W · CTR V% · N camp. · K purchases Pixel
- Última linha: \`**Total** — Gasto R$ X · Receita R$ Y · ROAS Zx · N vendas\`

### Bloco TOP CAMPANHAS
- Cabeçalho: \`## 🎬 TOP CAMPANHAS — ONTEM\`
- Bullets das top 5 do briefing (entity_name + conta + R$ + freq + CTR + purchases)

### Rodapé
\`---\`
\`*ROAS por conta é ESTIMATIVA (share-of-spend × receita total) — sem UTM cross-source.*\`

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
