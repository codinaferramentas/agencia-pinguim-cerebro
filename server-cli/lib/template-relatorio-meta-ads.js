// ============================================================
// template-relatorio-meta-ads.js — V2.15.2 (Andre 2026-05-13)
// ============================================================
// Renderer HTML dedicado pro Relatório Meta Ads Diário.
// Diferente do executivo: gráficos Chart.js inline + cards de snapshot
// (24h/7d/30d) + breakdown por conta visualmente destacado.
// ============================================================

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Markdown bem básico (mesmo padrão do executivo)
function md(s) {
  if (!s) return '';
  let html = esc(s);
  // code blocks ``` ``` (simples)
  html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // bold/italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // hr
  html = html.replace(/^---$/gm, '<hr>');
  // listas
  const linhas = html.split('\n');
  let outLines = [];
  let inUl = false, inOl = false;
  for (const lin of linhas) {
    const mBullet = lin.match(/^[-*] (.+)$/);
    const mOl = lin.match(/^(\d+)\. (.+)$/);
    if (mBullet) {
      if (inOl) { outLines.push('</ol>'); inOl = false; }
      if (!inUl) { outLines.push('<ul>'); inUl = true; }
      outLines.push(`<li>${mBullet[1]}</li>`);
    } else if (mOl) {
      if (inUl) { outLines.push('</ul>'); inUl = false; }
      if (!inOl) { outLines.push('<ol>'); inOl = true; }
      outLines.push(`<li>${mOl[2]}</li>`);
    } else {
      if (inUl) { outLines.push('</ul>'); inUl = false; }
      if (inOl) { outLines.push('</ol>'); inOl = false; }
      outLines.push(lin);
    }
  }
  if (inUl) outLines.push('</ul>');
  if (inOl) outLines.push('</ol>');
  html = outLines.join('\n');
  // paragrafos (linhas avulsas sem tag viram <p>)
  html = html.split(/\n{2,}/).map(b => {
    const t = b.trim();
    if (!t) return '';
    if (/^<(h\d|ul|ol|li|hr|pre|code|p|div|section)/i.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}

function fmtBRL(v) {
  if (v == null) return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('pt-BR');
}
function fmtPct(v, casas = 1) {
  if (v == null) return '—';
  const sinal = v > 0 ? '+' : '';
  return `${sinal}${v.toFixed(casas)}%`;
}
function fmtRoas(v) {
  if (v == null) return '—';
  return `${v.toFixed(2)}x`;
}

function renderRelatorioMetaAds({
  markdown,
  titulo,
  conteudo_estruturado = {},
  criadoEm,
  versionamento = null,
}) {
  const dataFmt = new Date(criadoEm).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const meta = conteudo_estruturado || {};
  const socio = meta.socio || {};
  const snapshot = meta.snapshot || {};
  const h24 = snapshot.h24 || {};
  const d7 = snapshot.d7 || {};
  const d30 = snapshot.d30 || {};
  const delta = snapshot.delta_24h || {};
  const serieMeta = meta.serie_meta_30d || [];
  const serieHotmart = meta.serie_hotmart_30d || [];
  const contas24h = meta.contas_24h || [];
  const conteudoHtml = md(markdown);

  // Versoes nav (colapsavel)
  const versionamentoHtml = (() => {
    if (!versionamento || !versionamento.cadeia || versionamento.cadeia.length <= 1) return '';
    const cadeia = versionamento.cadeia.slice().sort((a, b) => (a.versao || 0) - (b.versao || 0));
    const atual = cadeia.find(v => v.id === versionamento.entregavel_id) || cadeia[cadeia.length - 1];
    const anteriores = cadeia.filter(v => v.id !== atual.id);
    const linksAnteriores = anteriores.map(v =>
      `<a class="versao-link" href="/entregavel/${esc(v.id)}">V${v.versao}</a>`
    ).join('');
    return `<div class="versoes-nav">
        <span class="versao-atual">V${atual.versao}</span>
        ${anteriores.length > 0
          ? `<details class="versoes-anteriores"><summary>ver ${anteriores.length} versão${anteriores.length > 1 ? 'ões' : ''} anterior${anteriores.length > 1 ? 'es' : ''}</summary><div class="versoes-lista">${linksAnteriores}</div></details>`
          : ''}
      </div>`;
  })();

  // Cards de snapshot (3 horizontais)
  const cardSnapshot = (titulo, dados, deltaPct = null) => {
    const seta = deltaPct == null ? '' : (deltaPct > 0 ? '↗' : deltaPct < 0 ? '↘' : '→');
    const corDelta = deltaPct == null ? '' : (deltaPct > 0 ? 'good' : deltaPct < 0 ? 'bad' : 'mute');
    return `
      <div class="card-snapshot">
        <div class="snap-titulo">${esc(titulo)}</div>
        <div class="snap-roas ${dados.roas == null ? '' : dados.roas >= 1 ? 'good' : 'bad'}">${fmtRoas(dados.roas)}</div>
        <div class="snap-label">ROAS</div>
        <div class="snap-detalhes">
          <div><span class="snap-key">Gasto</span> <strong>${fmtBRL(dados.gasto)}</strong></div>
          <div><span class="snap-key">Receita</span> <strong>${fmtBRL(dados.receita)}</strong></div>
          <div><span class="snap-key">Vendas</span> <strong>${fmtNum(dados.vendas)}</strong></div>
          ${deltaPct != null ? `<div class="snap-delta ${corDelta}">${seta} ${fmtPct(deltaPct)}</div>` : ''}
        </div>
      </div>
    `;
  };

  // Cards-grid horizontais
  const snapshotHtml = `
    <div class="snapshot-grid">
      ${cardSnapshot('Ontem (24h)', h24, delta.receita_pct)}
      ${cardSnapshot('Últimos 7 dias', d7)}
      ${cardSnapshot('Últimos 30 dias', d30)}
    </div>
  `;

  // Cards por conta (24h)
  const contasHtml = contas24h.length === 0 ? '' : `
    <section class="bloco-contas">
      <h3 class="bloco-titulo">🏦 Breakdown por conta — ontem</h3>
      <div class="contas-grid">
        ${contas24h.map(c => `
          <div class="card-conta ${c.roas_estimado != null && c.roas_estimado < 1 ? 'alerta' : ''}">
            <div class="conta-nome">${esc(c.conta_nome)}</div>
            <div class="conta-share">${c.share_pct?.toFixed(0)}% do gasto</div>
            <div class="conta-gasto">${fmtBRL(c.gasto)}</div>
            <div class="conta-detalhes">
              <span><strong>ROAS est.</strong> ${fmtRoas(c.roas_estimado)}</span>
              <span><strong>Freq</strong> ${c.frequencia_media?.toFixed(2) || '—'}</span>
              <span><strong>CTR</strong> ${c.ctr_pct?.toFixed(2) || '—'}%</span>
              <span><strong>Camp.</strong> ${c.qtd_campanhas}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;

  // Series 30d pra Chart.js
  const labels30d = serieMeta.map(s => {
    const d = new Date(s.data);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const gastoSerie = serieMeta.map(s => s.gasto);
  const receitaSerie = serieHotmart.map(s => s.receita);
  // ROAS diário (receita / gasto)
  const roasSerie = serieMeta.map((s, i) => {
    const rec = serieHotmart[i]?.receita || 0;
    return s.gasto > 0 ? rec / s.gasto : 0;
  });

  // Donut de distribuição por conta (24h)
  const labelsContas = contas24h.map(c => c.conta_nome);
  const dadosContas = contas24h.map(c => c.gasto);
  const coresContas = ['#E85C00', '#3B82F6', '#22C55E', '#A855F7', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16'];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo || 'Meta Ads diário')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #0A0A0A;
      --bg-card: #121212;
      --bg-card-2: #181818;
      --border: #1F1F1F;
      --border-hover: #2A2A2A;
      --txt: #E8E8E8;
      --txt-mute: #888;
      --txt-dim: #666;
      --orange: #E85C00;
      --orange-dim: #B84800;
      --good: #6CC287;
      --warn: #E6A85C;
      --bad: #D87070;
      --note: #888;
      --measure: 96ch;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: var(--bg);
      color: var(--txt);
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 16px;
      line-height: 1.6;
    }
    .container {
      max-width: var(--measure);
      margin: 0 auto;
      padding: 3rem 1.5rem 5rem;
    }
    /* Header */
    header.page-header {
      padding-bottom: 2rem;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }
    header.page-header .kicker {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--orange);
      margin-bottom: 0.5rem;
    }
    header.page-header h1 {
      font-size: 1.9rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.01em;
    }
    header.page-header .meta-linha {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.82rem;
      color: var(--txt-mute);
    }
    header.page-header .meta-linha span + span::before {
      content: '·';
      margin: 0 0.5rem;
      opacity: 0.5;
    }

    /* Snapshot Grid (3 cards horizontais) */
    .snapshot-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin: 2rem 0;
    }
    @media (max-width: 720px) {
      .snapshot-grid { grid-template-columns: 1fr; }
    }
    .card-snapshot {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-top: 3px solid var(--orange);
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .snap-titulo {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--txt-mute);
    }
    .snap-roas {
      font-size: 2.5rem;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -0.02em;
      color: var(--txt);
    }
    .snap-roas.good { color: var(--good); }
    .snap-roas.bad { color: var(--bad); }
    .snap-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--txt-dim);
      margin-bottom: 0.4rem;
    }
    .snap-detalhes {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.85rem;
    }
    .snap-detalhes .snap-key {
      color: var(--txt-mute);
      width: 70px;
      display: inline-block;
    }
    .snap-detalhes strong { color: var(--txt); font-weight: 500; }
    .snap-delta {
      margin-top: 0.4rem;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .snap-delta.good { color: var(--good); }
    .snap-delta.bad { color: var(--bad); }
    .snap-delta.mute { color: var(--txt-mute); }

    /* Gráficos */
    .grafico-wrap {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin: 1.5rem 0;
    }
    .grafico-titulo {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--txt-mute);
      margin: 0 0 1rem 0;
    }
    .grafico-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1rem;
      margin: 1.5rem 0;
    }
    @media (max-width: 720px) {
      .grafico-row { grid-template-columns: 1fr; }
    }
    canvas { max-width: 100%; }

    /* Bloco contas */
    .bloco-contas { margin: 2.5rem 0; }
    .bloco-titulo {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 1.25rem 0;
      color: var(--txt);
    }
    .contas-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.85rem;
    }
    .card-conta {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--orange);
      border-radius: 10px;
      padding: 1.1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .card-conta.alerta { border-left-color: var(--bad); }
    .conta-nome {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--txt);
    }
    .conta-share {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      color: var(--txt-mute);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .conta-gasto {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--txt);
      letter-spacing: -0.02em;
    }
    .conta-detalhes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.3rem;
      font-size: 0.78rem;
      color: var(--txt-mute);
      margin-top: 0.3rem;
    }
    .conta-detalhes strong { color: var(--txt); font-weight: 500; }

    /* Versionamento */
    .versoes-nav {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.85rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      margin-top: 0.75rem;
    }
    .versao-atual { color: var(--orange); font-weight: 600; }
    .versao-link { color: var(--txt-mute); text-decoration: none; }
    .versao-link:hover { color: var(--txt); }
    .versoes-anteriores summary {
      cursor: pointer;
      color: var(--txt-mute);
      list-style: none;
    }
    .versoes-anteriores summary:hover { color: var(--txt); }
    .versoes-anteriores summary::-webkit-details-marker { display: none; }
    .versoes-anteriores[open] summary { color: var(--txt); }
    .versoes-lista { display: inline-flex; gap: 0.4rem; margin-left: 0.5rem; }

    /* Conteúdo markdown */
    .conteudo { font-size: 1rem; line-height: 1.7; }
    .conteudo h1 { font-size: 1.5rem; margin: 2rem 0 1rem; color: var(--txt); }
    .conteudo h2 { font-size: 1.2rem; margin: 1.75rem 0 0.85rem; color: var(--txt); }
    .conteudo h3 { font-size: 1rem; margin: 1.5rem 0 0.6rem; color: var(--txt); font-weight: 600; }
    .conteudo p { margin: 0.7rem 0; }
    .conteudo ul, .conteudo ol { padding-left: 1.5rem; margin: 0.7rem 0; }
    .conteudo li { margin: 0.35rem 0; }
    .conteudo strong { color: var(--txt); font-weight: 600; }
    .conteudo em { color: var(--orange); font-style: normal; }
    .conteudo code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.85em;
      padding: 0.1rem 0.35rem;
      background: var(--bg-card);
      border-radius: 4px;
      color: var(--orange);
    }
    .conteudo hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2rem 0;
    }

    /* Diagnóstico técnico (colapsável) */
    details.diagnostico {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }
    details.diagnostico summary {
      cursor: pointer;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      color: var(--txt-mute);
      letter-spacing: 0.05em;
      padding: 0.5rem 0;
    }
    details.diagnostico summary:hover { color: var(--txt); }
    .diagnostico-body {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 0.75rem;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      color: var(--txt-mute);
    }
    .diagnostico-body div { margin: 0.2rem 0; }

    footer.page-footer {
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      color: var(--txt-dim);
      text-align: center;
      line-height: 1.7;
    }
    footer.page-footer a { color: var(--orange); text-decoration: none; }
    footer.page-footer a:hover { text-decoration: underline; }

    @media print {
      body { background: white; color: black; }
      .card-snapshot, .card-conta, .grafico-wrap { background: #f6f6f6; color: #333; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="page-header">
      <div class="kicker">📊 META ADS · SQUAD TRÁFEGO</div>
      <h1>${esc(titulo || 'Meta Ads diário')}</h1>
      <div class="meta-linha">
        <span>${esc(socio.nome || 'Destinatário')}</span>
        <span>gerado ${esc(dataFmt)}</span>
        ${meta.duracoes_ms?.total ? `<span>${(meta.duracoes_ms.total / 1000).toFixed(1)}s</span>` : ''}
      </div>
      ${versionamentoHtml}
    </header>

    ${snapshotHtml}

    <div class="grafico-row">
      <div class="grafico-wrap">
        <h3 class="grafico-titulo">Gasto Meta vs Receita Hotmart — últimos 30 dias</h3>
        <canvas id="grafico-gasto-receita" height="120"></canvas>
      </div>
      <div class="grafico-wrap">
        <h3 class="grafico-titulo">Distribuição gasto por conta (ontem)</h3>
        <canvas id="grafico-distribuicao" height="180"></canvas>
      </div>
    </div>

    <div class="grafico-wrap">
      <h3 class="grafico-titulo">ROAS diário — últimos 30 dias</h3>
      <canvas id="grafico-roas" height="80"></canvas>
    </div>

    ${contasHtml}

    <article class="conteudo">
      ${conteudoHtml}
    </article>

    <details class="diagnostico">
      <summary>📋 Diagnóstico técnico</summary>
      <div class="diagnostico-body">
        <div>Coleta: ${meta.duracoes_ms?.coleta ? (meta.duracoes_ms.coleta / 1000).toFixed(1) + 's' : '—'}</div>
        <div>Squad (5 mestres + Chief): ${meta.duracoes_ms?.squad ? (meta.duracoes_ms.squad / 1000).toFixed(1) + 's' : '—'}</div>
        <div>Sintetizador: ${meta.duracoes_ms?.sintetizador ? (meta.duracoes_ms.sintetizador / 1000).toFixed(1) + 's' : '—'}</div>
        <div>Total: ${meta.duracoes_ms?.total ? (meta.duracoes_ms.total / 1000).toFixed(1) + 's' : '—'}</div>
        <div>Pareceres ativos: ${meta.squad?.qtd_pareceres || 0}</div>
        <div>Sintetizador ${meta.sintetizador?.ok ? '✓ ok' : '✗ ' + (meta.sintetizador?.motivo || 'falha')}</div>
      </div>
    </details>

    <footer class="page-footer">
      Pinguim OS · Meta Ads Diário · gerado em ${esc(dataFmt)} (BRT)<br>
      Dados: Supabase compartilhado (Pedro). Mestres: Squad traffic-masters.
    </footer>
  </div>

  <script>
    // Dados injetados no servidor (sem fetch — payload completo)
    const labels30d = ${JSON.stringify(labels30d)};
    const gastoSerie = ${JSON.stringify(gastoSerie)};
    const receitaSerie = ${JSON.stringify(receitaSerie)};
    const roasSerie = ${JSON.stringify(roasSerie)};
    const labelsContas = ${JSON.stringify(labelsContas)};
    const dadosContas = ${JSON.stringify(dadosContas)};
    const coresContas = ${JSON.stringify(coresContas)};

    // Defaults do Chart.js (dark theme)
    Chart.defaults.color = '#888';
    Chart.defaults.borderColor = '#1F1F1F';
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.font.size = 11;

    // Gráfico 1: Gasto Meta vs Receita Hotmart (linha dupla)
    new Chart(document.getElementById('grafico-gasto-receita'), {
      type: 'line',
      data: {
        labels: labels30d,
        datasets: [
          {
            label: 'Gasto Meta',
            data: gastoSerie,
            borderColor: '#D87070',
            backgroundColor: 'rgba(216,112,112,0.1)',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
          },
          {
            label: 'Receita Hotmart',
            data: receitaSerie,
            borderColor: '#6CC287',
            backgroundColor: 'rgba(108,194,135,0.1)',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { position: 'top', labels: { color: '#E8E8E8' } } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#1F1F1F' }, ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') } },
          x: { grid: { display: false } },
        },
      },
    });

    // Gráfico 2: Distribuição por conta (donut)
    new Chart(document.getElementById('grafico-distribuicao'), {
      type: 'doughnut',
      data: {
        labels: labelsContas,
        datasets: [{
          data: dadosContas,
          backgroundColor: coresContas.slice(0, labelsContas.length),
          borderColor: '#0A0A0A',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#E8E8E8', font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.label + ': R$ ' + ctx.parsed.toLocaleString('pt-BR'),
            },
          },
        },
      },
    });

    // Gráfico 3: ROAS diário (barras)
    new Chart(document.getElementById('grafico-roas'), {
      type: 'bar',
      data: {
        labels: labels30d,
        datasets: [{
          label: 'ROAS',
          data: roasSerie,
          backgroundColor: roasSerie.map(v => v >= 1 ? 'rgba(108,194,135,0.7)' : 'rgba(216,112,112,0.7)'),
          borderColor: roasSerie.map(v => v >= 1 ? '#6CC287' : '#D87070'),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => 'ROAS ' + ctx.parsed.y.toFixed(2) + 'x' } },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#1F1F1F' },
            ticks: { callback: v => v.toFixed(1) + 'x' },
          },
          x: { grid: { display: false } },
        },
      },
    });
  </script>
</body>
</html>`;
}

module.exports = { renderRelatorioMetaAds };
