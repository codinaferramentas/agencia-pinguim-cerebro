// ============================================================
// template-relatorio-meta-ads.js — V2.15.2 redesign (Andre 2026-05-13)
// ============================================================
// Redesign após feedback do Andre:
// - Gráficos: ApexCharts (gradients + glow + animações sutis)
// - Matriz Conta × Mestre como bloco visual (substitui pareceres longos)
// - Pareceres: resumo curto sempre visível + <details> colapsável
// ============================================================

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Markdown rendering básico
function md(s) {
  if (!s) return '';
  let html = esc(s);
  html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/^---$/gm, '<hr>');
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
function fmtBRLcompact(v) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1000) return 'R$ ' + (v / 1000).toFixed(1) + 'k';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  const serieMeta30dFull = meta.serie_meta_30d || []; // tem receita_pixel
  const contas24h = meta.contas_24h || [];
  const matriz = meta.matriz || [];
  const pareceres = meta.pareceres || [];

  // Markdown do sintetizador (já SEM pareceres — agora só TLDR + snapshot + plano + alertas + breakdown + top)
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

  // Cards de Snapshot (3 horizontais) — hero KPIs
  const cardSnapshot = (titulo, dados, deltaPct = null) => {
    const seta = deltaPct == null ? '' : (deltaPct > 0 ? '↗' : deltaPct < 0 ? '↘' : '→');
    const corDelta = deltaPct == null ? '' : (deltaPct > 0 ? 'good' : deltaPct < 0 ? 'bad' : 'mute');
    const corRoas = dados.roas == null ? '' : dados.roas >= 1.5 ? 'good' : dados.roas >= 1 ? 'warn' : 'bad';
    return `
      <div class="card-snapshot ${corRoas}">
        <div class="snap-glow"></div>
        <div class="snap-titulo">${esc(titulo)}</div>
        <div class="snap-roas">${fmtRoas(dados.roas)}</div>
        <div class="snap-label">ROAS</div>
        <div class="snap-detalhes">
          <div><span class="snap-key">Gasto</span> <strong>${fmtBRL(dados.gasto)}</strong></div>
          <div><span class="snap-key">Receita</span> <strong>${fmtBRL(dados.receita)}</strong></div>
          <div><span class="snap-key">Vendas</span> <strong>${fmtNum(dados.vendas)}</strong></div>
          ${deltaPct != null ? `<div class="snap-delta ${corDelta}">${seta} ${fmtPct(deltaPct)} vs anteontem</div>` : ''}
        </div>
      </div>
    `;
  };

  // Matriz Conta × Mestre
  const corSinal = {
    good: { bg: 'rgba(108,194,135,0.12)', border: 'rgba(108,194,135,0.35)', txt: '#7FD296', icon: '↗' },
    bad: { bg: 'rgba(216,112,112,0.12)', border: 'rgba(216,112,112,0.35)', txt: '#E58787', icon: '⛔' },
    warn: { bg: 'rgba(230,168,92,0.12)', border: 'rgba(230,168,92,0.35)', txt: '#F0BC73', icon: '⚠' },
    mute: { bg: 'rgba(136,136,136,0.06)', border: 'rgba(136,136,136,0.18)', txt: '#888', icon: '—' },
  };

  const matrizHtml = (() => {
    if (!matriz || matriz.length === 0 || pareceres.length === 0) return '';
    // Ordem das colunas: ordem dos pareceres
    const colunas = pareceres.map(p => ({ slug: p.slug, nome: p.nome, avatar: p.avatar }));
    return `
      <section class="bloco-matriz">
        <div class="bloco-cabecalho">
          <h2 class="bloco-titulo">🗂 Matriz · Conta × Análise</h2>
          <div class="bloco-sub">Como cada mestre vê cada conta — visão rápida</div>
        </div>
        <div class="matriz-wrap">
          <table class="matriz-tabela">
            <thead>
              <tr>
                <th class="matriz-conta-th">Conta</th>
                ${colunas.map(c => `<th class="matriz-mestre-th"><span class="matriz-emoji">${esc(c.avatar)}</span><span class="matriz-nome">${esc(c.nome)}</span></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${matriz.map(linha => {
                const contaDados = contas24h.find(c => c.conta_nome === linha.conta) || {};
                const gastoStr = contaDados.gasto != null ? fmtBRLcompact(contaDados.gasto) : '';
                const roasStr = contaDados.roas_pixel != null ? fmtRoas(contaDados.roas_pixel) : '';
                return `
                  <tr>
                    <td class="matriz-conta">
                      <div class="matriz-conta-nome">${esc(linha.conta)}</div>
                      <div class="matriz-conta-kpi">${gastoStr} · ${roasStr}</div>
                    </td>
                    ${colunas.map(c => {
                      const cel = linha.celulas?.[c.slug] || { frase: '—', sinal: 'mute' };
                      const cor = corSinal[cel.sinal] || corSinal.mute;
                      return `
                        <td class="matriz-celula" style="background:${cor.bg};border-color:${cor.border}">
                          <div class="matriz-icone" style="color:${cor.txt}">${cor.icon}</div>
                          <div class="matriz-frase" style="color:${cor.txt}">${esc(cel.frase)}</div>
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="matriz-legenda">
          <span><span class="legenda-bola good"></span> oportunidade / OK</span>
          <span><span class="legenda-bola warn"></span> atenção</span>
          <span><span class="legenda-bola bad"></span> ação destrutiva / risco</span>
          <span><span class="legenda-bola mute"></span> sem observação</span>
        </div>
      </section>
    `;
  })();

  // Cards de pareceres com drill-down POR CONTA (V3 Andre 2026-05-13)
  // Hierarquia: Mestre → tese geral + lista de contas → cada conta com diagnóstico + ação
  const pareceresHtml = (() => {
    if (!pareceres || pareceres.length === 0) return '';
    const corSinalCard = {
      good: '#7FD296', warn: '#F0BC73', bad: '#E58787', mute: '#888',
    };
    return `
      <section class="bloco-pareceres">
        <div class="bloco-cabecalho">
          <h2 class="bloco-titulo">🧠 Análise dos Mestres</h2>
          <div class="bloco-sub">Clica no mestre → vê análise por conta</div>
        </div>
        <div class="pareceres-grid">
          ${pareceres.map(p => `
            <details class="card-parecer">
              <summary>
                <div class="parecer-header">
                  <span class="parecer-avatar">${esc(p.avatar)}</span>
                  <span class="parecer-nome">${esc(p.nome)}</span>
                  <span class="parecer-toggle">▾</span>
                </div>
                <div class="parecer-tese">${esc(p.tese_geral || '')}</div>
              </summary>
              <div class="parecer-contas">
                ${(p.por_conta || []).map(pc => {
                  const cor = corSinalCard[pc.sinal] || corSinalCard.mute;
                  return `
                    <div class="parecer-conta-item" style="border-left-color: ${cor}">
                      <div class="pc-conta-nome">${esc(pc.conta)}</div>
                      <div class="pc-acao" style="color: ${cor}">${esc(pc.acao || 'sem observação')}</div>
                      <div class="pc-diag">${esc(pc.diagnostico || '')}</div>
                    </div>
                  `;
                }).join('') || '<div class="parecer-vazio">Sem análise por conta disponível.</div>'}
              </div>
            </details>
          `).join('')}
        </div>
      </section>
    `;
  })();

  // Cards por conta (24h) — design system melhor com glow lateral
  const contasHtml = contas24h.length === 0 ? '' : `
    <section class="bloco-contas">
      <h2 class="bloco-titulo">🏦 Breakdown · Por conta · ontem</h2>
      <div class="contas-grid">
        ${contas24h.map(c => `
          <div class="card-conta ${c.roas_pixel != null && c.roas_pixel < 1 ? 'alerta' : ''}">
            <div class="conta-glow"></div>
            <div class="conta-nome">${esc(c.conta_nome)}</div>
            <div class="conta-share">${c.share_pct?.toFixed(0)}% do gasto</div>
            <div class="conta-gasto">${fmtBRL(c.gasto)}</div>
            <div class="conta-detalhes">
              <span><strong>ROAS Pixel</strong> ${fmtRoas(c.roas_pixel)}</span>
              <span><strong>Freq</strong> ${c.frequencia_media?.toFixed(2) || '—'}</span>
              <span><strong>CTR</strong> ${c.ctr_pct?.toFixed(2) || '—'}%</span>
              <span><strong>Camp.</strong> ${c.qtd_campanhas}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;

  // Series 30d pra ApexCharts
  const labels30d = serieMeta.map(s => {
    const d = new Date(s.data);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const datas30dIso = serieMeta.map(s => s.data);
  const gastoSerie = serieMeta.map(s => s.gasto);
  const receitaSerie = serieMeta30dFull.map(s => s.receita_pixel || 0);
  const roasSerie = serieMeta.map((s, i) => {
    const rec = serieMeta30dFull[i]?.receita_pixel || 0;
    return s.gasto > 0 ? +(rec / s.gasto).toFixed(2) : 0;
  });
  const labelsContas = contas24h.map(c => c.conta_nome);
  const dadosContas = contas24h.map(c => c.gasto);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo || 'Meta Ads diário')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.49.1/dist/apexcharts.min.js"></script>
  <style>
    :root {
      --bg: #06070A;
      --bg-card: #0F1117;
      --bg-card-2: #14171F;
      --bg-card-3: #1A1E28;
      --border: #1F232E;
      --border-hover: #2D3340;
      --txt: #F0F2F6;
      --txt-mute: #8E96A8;
      --txt-dim: #5A6075;
      --orange: #FF6B1A;
      --orange-glow: rgba(255,107,26,0.4);
      --orange-soft: rgba(255,107,26,0.08);
      --good: #6CC287;
      --good-glow: rgba(108,194,135,0.35);
      --warn: #E6A85C;
      --warn-glow: rgba(230,168,92,0.35);
      --bad: #E58787;
      --bad-glow: rgba(229,135,135,0.35);
      --purple: #A78BFA;
      --cyan: #67E8F9;
      --measure: 1180px;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background:
        radial-gradient(ellipse at top left, rgba(255,107,26,0.04) 0%, transparent 50%),
        radial-gradient(ellipse at bottom right, rgba(167,139,250,0.03) 0%, transparent 50%),
        var(--bg);
      background-attachment: fixed;
      color: var(--txt);
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: var(--measure);
      margin: 0 auto;
      padding: 3rem 1.5rem 5rem;
    }
    /* Header */
    header.page-header {
      padding-bottom: 2rem;
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border);
    }
    header.page-header .kicker {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--orange);
      margin-bottom: 0.65rem;
    }
    header.page-header h1 {
      font-size: 2rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.015em;
      line-height: 1.2;
    }
    header.page-header .meta-linha {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.8rem;
      color: var(--txt-mute);
    }
    header.page-header .meta-linha span + span::before {
      content: '·';
      margin: 0 0.5rem;
      opacity: 0.5;
    }

    /* Snapshot Grid (3 cards horizontais hero) */
    .snapshot-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
      margin: 0 0 2.5rem 0;
    }
    @media (max-width: 820px) {
      .snapshot-grid { grid-template-columns: 1fr; }
    }
    .card-snapshot {
      position: relative;
      background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card-2) 100%);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.65rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      overflow: hidden;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card-snapshot::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--orange), var(--orange) 60%, transparent);
    }
    .card-snapshot.good::before { background: linear-gradient(90deg, var(--good), var(--good) 60%, transparent); }
    .card-snapshot.warn::before { background: linear-gradient(90deg, var(--warn), var(--warn) 60%, transparent); }
    .card-snapshot.bad::before { background: linear-gradient(90deg, var(--bad), var(--bad) 60%, transparent); }
    .card-snapshot:hover { transform: translateY(-2px); border-color: var(--border-hover); }
    .snap-glow {
      position: absolute;
      width: 200px; height: 200px;
      right: -80px; top: -80px;
      background: radial-gradient(circle, var(--orange-glow) 0%, transparent 70%);
      filter: blur(40px);
      opacity: 0.5;
      pointer-events: none;
    }
    .card-snapshot.good .snap-glow { background: radial-gradient(circle, var(--good-glow) 0%, transparent 70%); }
    .card-snapshot.warn .snap-glow { background: radial-gradient(circle, var(--warn-glow) 0%, transparent 70%); }
    .card-snapshot.bad .snap-glow { background: radial-gradient(circle, var(--bad-glow) 0%, transparent 70%); }
    .snap-titulo {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--txt-mute);
      z-index: 1;
    }
    .snap-roas {
      font-size: 3rem;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -0.03em;
      color: var(--txt);
      margin-top: 0.3rem;
      z-index: 1;
    }
    .card-snapshot.good .snap-roas { color: var(--good); }
    .card-snapshot.warn .snap-roas { color: var(--warn); }
    .card-snapshot.bad .snap-roas { color: var(--bad); }
    .snap-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.65rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--txt-dim);
      margin-bottom: 0.7rem;
      z-index: 1;
    }
    .snap-detalhes {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.88rem;
      z-index: 1;
    }
    .snap-detalhes .snap-key {
      color: var(--txt-mute);
      width: 75px;
      display: inline-block;
      font-size: 0.78rem;
    }
    .snap-detalhes strong { color: var(--txt); font-weight: 500; }
    .snap-delta {
      margin-top: 0.5rem;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .snap-delta.good { color: var(--good); }
    .snap-delta.bad { color: var(--bad); }
    .snap-delta.mute { color: var(--txt-mute); }

    /* Gráficos */
    .grafico-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.25rem;
      margin: 0 0 1.25rem 0;
    }
    @media (max-width: 820px) {
      .grafico-row { grid-template-columns: 1fr; }
    }
    .grafico-wrap {
      background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-card-2) 100%);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.5rem 1.5rem 1rem;
      position: relative;
      overflow: hidden;
    }
    .grafico-titulo {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--txt-mute);
      margin: 0 0 1rem 0;
      font-weight: 500;
    }

    /* Bloco genérico */
    .bloco-cabecalho {
      margin: 0 0 1.25rem 0;
    }
    .bloco-titulo {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: var(--txt);
      letter-spacing: -0.005em;
    }
    .bloco-sub {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.75rem;
      color: var(--txt-mute);
      margin-top: 0.3rem;
      letter-spacing: 0.04em;
    }

    /* Matriz Conta × Mestre */
    .bloco-matriz {
      margin: 2.5rem 0;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.75rem;
    }
    .matriz-wrap {
      overflow-x: auto;
      margin: 0 -0.5rem;
    }
    .matriz-tabela {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0.4rem;
      min-width: 720px;
    }
    .matriz-conta-th {
      text-align: left;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--txt-mute);
      padding: 0.5rem 0.5rem;
      font-weight: 500;
      vertical-align: bottom;
    }
    .matriz-mestre-th {
      text-align: center;
      padding: 0.4rem 0.3rem 0.6rem;
      font-weight: 500;
      vertical-align: bottom;
    }
    .matriz-emoji {
      display: block;
      font-size: 1.3rem;
      line-height: 1;
      margin-bottom: 0.3rem;
    }
    .matriz-nome {
      display: block;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.65rem;
      color: var(--txt-mute);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .matriz-conta {
      background: var(--bg-card-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      min-width: 180px;
      max-width: 240px;
      vertical-align: middle;
    }
    .matriz-conta-nome {
      font-weight: 600;
      font-size: 0.92rem;
      color: var(--txt);
      line-height: 1.2;
    }
    .matriz-conta-kpi {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
      color: var(--txt-mute);
      margin-top: 0.35rem;
    }
    .matriz-celula {
      border: 1px solid;
      border-radius: 10px;
      padding: 0.75rem 0.7rem;
      text-align: center;
      vertical-align: middle;
      min-width: 130px;
      transition: transform 0.15s, filter 0.15s;
    }
    .matriz-celula:hover {
      transform: scale(1.02);
      filter: brightness(1.15);
    }
    .matriz-icone {
      font-size: 1.1rem;
      margin-bottom: 0.3rem;
      font-weight: 600;
    }
    .matriz-frase {
      font-size: 0.78rem;
      line-height: 1.35;
      font-weight: 500;
    }
    .matriz-legenda {
      display: flex;
      flex-wrap: wrap;
      gap: 1.2rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
      color: var(--txt-mute);
    }
    .matriz-legenda span { display: flex; align-items: center; gap: 0.4rem; }
    .legenda-bola {
      display: inline-block;
      width: 10px; height: 10px;
      border-radius: 50%;
    }
    .legenda-bola.good { background: var(--good); }
    .legenda-bola.warn { background: var(--warn); }
    .legenda-bola.bad { background: var(--bad); }
    .legenda-bola.mute { background: var(--txt-dim); }

    /* Cards de pareceres (resumo visível + details colapsado) */
    .bloco-pareceres {
      margin: 2.5rem 0;
    }
    .pareceres-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 0.85rem;
    }
    details.card-parecer {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      transition: border-color 0.2s, background 0.2s;
      overflow: hidden;
    }
    details.card-parecer[open] {
      background: var(--bg-card-2);
      border-color: var(--border-hover);
    }
    details.card-parecer summary {
      cursor: pointer;
      padding: 1.1rem 1.25rem;
      list-style: none;
      transition: background 0.15s;
    }
    details.card-parecer summary::-webkit-details-marker { display: none; }
    details.card-parecer summary:hover { background: var(--bg-card-2); }
    .parecer-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.6rem;
    }
    .parecer-avatar { font-size: 1.4rem; line-height: 1; }
    .parecer-nome {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--txt);
      flex: 1;
    }
    .parecer-toggle {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.85rem;
      color: var(--txt-dim);
      transition: transform 0.2s, color 0.2s;
    }
    details.card-parecer[open] .parecer-toggle {
      transform: rotate(180deg);
      color: var(--orange);
    }
    .parecer-resumo {
      font-size: 0.88rem;
      color: var(--txt);
      line-height: 1.5;
      opacity: 0.92;
    }
    .parecer-tese {
      font-size: 0.86rem;
      color: var(--txt);
      line-height: 1.55;
      opacity: 0.88;
      font-style: italic;
      padding-left: 0.5rem;
      border-left: 2px solid var(--orange);
    }
    .parecer-contas {
      padding: 0.6rem 1rem 1.1rem;
      border-top: 1px solid var(--border);
      margin-top: 0.6rem;
      padding-top: 0.9rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .parecer-conta-item {
      background: var(--bg);
      border: 1px solid var(--border);
      border-left: 3px solid;
      border-radius: 8px;
      padding: 0.75rem 0.9rem;
    }
    .pc-conta-nome {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--txt-mute);
      margin-bottom: 0.35rem;
    }
    .pc-acao {
      font-size: 0.92rem;
      font-weight: 600;
      line-height: 1.35;
      margin-bottom: 0.35rem;
    }
    .pc-diag {
      font-size: 0.82rem;
      color: var(--txt-mute);
      line-height: 1.55;
    }
    .parecer-vazio {
      padding: 1rem;
      text-align: center;
      color: var(--txt-mute);
      font-size: 0.85rem;
      font-style: italic;
    }
    .parecer-completo {
      padding: 0 1.25rem 1.4rem;
      border-top: 1px solid var(--border);
      margin-top: 0.5rem;
      padding-top: 1.1rem;
      font-size: 0.92rem;
      line-height: 1.7;
      color: var(--txt);
    }
    .parecer-completo p { margin: 0.6rem 0; }
    .parecer-completo strong { color: var(--txt); font-weight: 600; }

    /* Bloco contas */
    .bloco-contas { margin: 2.5rem 0; }
    .contas-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1rem;
    }
    .card-conta {
      position: relative;
      background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card-2) 100%);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      overflow: hidden;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card-conta::before {
      content: '';
      position: absolute;
      top: 0; left: 0; bottom: 0;
      width: 3px;
      background: var(--orange);
      box-shadow: 0 0 12px var(--orange-glow);
    }
    .card-conta.alerta::before {
      background: var(--bad);
      box-shadow: 0 0 12px var(--bad-glow);
    }
    .card-conta:hover { transform: translateY(-2px); border-color: var(--border-hover); }
    .conta-glow {
      position: absolute;
      width: 120px; height: 120px;
      right: -40px; top: -40px;
      background: radial-gradient(circle, var(--orange-soft) 0%, transparent 70%);
      filter: blur(20px);
      pointer-events: none;
    }
    .card-conta.alerta .conta-glow {
      background: radial-gradient(circle, rgba(229,135,135,0.1) 0%, transparent 70%);
    }
    .conta-nome {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--txt);
      z-index: 1;
    }
    .conta-share {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      color: var(--txt-mute);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      z-index: 1;
    }
    .conta-gasto {
      font-size: 1.7rem;
      font-weight: 700;
      color: var(--txt);
      letter-spacing: -0.02em;
      z-index: 1;
    }
    .conta-detalhes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
      font-size: 0.78rem;
      color: var(--txt-mute);
      margin-top: 0.3rem;
      z-index: 1;
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
    .versoes-anteriores summary { cursor: pointer; color: var(--txt-mute); list-style: none; }
    .versoes-anteriores summary:hover { color: var(--txt); }
    .versoes-anteriores summary::-webkit-details-marker { display: none; }
    .versoes-anteriores[open] summary { color: var(--txt); }
    .versoes-lista { display: inline-flex; gap: 0.4rem; margin-left: 0.5rem; }

    /* Conteúdo markdown (TLDR, snapshot, plano, alertas, breakdown, top campanhas) */
    .conteudo {
      font-size: 1rem;
      line-height: 1.75;
      margin: 0 0 2.5rem 0;
    }
    .conteudo h1 {
      font-size: 1.5rem;
      margin: 2rem 0 1rem;
      color: var(--txt);
    }
    .conteudo h2 {
      font-size: 1.2rem;
      margin: 2rem 0 0.85rem;
      color: var(--txt);
      letter-spacing: -0.005em;
    }
    .conteudo h3 {
      font-size: 1rem;
      margin: 1.5rem 0 0.6rem;
      color: var(--txt);
      font-weight: 600;
    }
    .conteudo p { margin: 0.7rem 0; }
    .conteudo ul, .conteudo ol { padding-left: 1.5rem; margin: 0.7rem 0; }
    .conteudo li { margin: 0.35rem 0; }
    .conteudo strong { color: var(--txt); font-weight: 600; }
    .conteudo em { color: var(--orange); font-style: normal; font-weight: 500; }
    .conteudo code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.85em;
      padding: 0.1rem 0.4rem;
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
      font-size: 0.75rem;
      color: var(--txt-dim);
      text-align: center;
      line-height: 1.7;
    }

    @media print {
      body { background: white; color: black; }
      .card-snapshot, .card-conta, .grafico-wrap, .bloco-matriz, details.card-parecer { background: #f6f6f6; color: #333; }
      .snap-glow, .conta-glow { display: none; }
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

    <div class="snapshot-grid">
      ${cardSnapshot('Ontem (24h)', h24, delta.receita_pct)}
      ${cardSnapshot('Últimos 7 dias', d7)}
      ${cardSnapshot('Últimos 30 dias', d30)}
    </div>

    <div class="grafico-row">
      <div class="grafico-wrap">
        <h3 class="grafico-titulo">Gasto Meta × Receita Pixel · últimos 30 dias</h3>
        <div id="grafico-gasto-receita"></div>
      </div>
      <div class="grafico-wrap">
        <h3 class="grafico-titulo">Distribuição do gasto · ontem</h3>
        <div id="grafico-distribuicao"></div>
      </div>
    </div>

    <div class="grafico-wrap">
      <h3 class="grafico-titulo">ROAS diário · últimos 30 dias</h3>
      <div id="grafico-roas"></div>
    </div>

    <article class="conteudo">
      ${conteudoHtml}
    </article>

    ${matrizHtml}

    ${contasHtml}

    ${pareceresHtml}

    <details class="diagnostico">
      <summary>📋 Diagnóstico técnico</summary>
      <div class="diagnostico-body">
        <div><strong style="color:var(--orange)">Fonte de dados</strong></div>
        <div>· Tabela: <code>metricas_diarias</code> (Supabase compartilhado Pinguim)</div>
        <div>· Origem: Meta Marketing API · Pixel + ads insights · nivel=campaign</div>
        <div>· Receita / vendas / ROAS: <code>action_values[].purchase</code> (Pixel Meta)</div>
        <div>· Hotmart NÃO é cruzado — relatório 100% Meta. Venda sem Pixel não aparece.</div>
        <div style="margin-top:.5rem"><strong style="color:var(--orange)">Performance</strong></div>
        <div>· Coleta SQL: ${meta.duracoes_ms?.coleta ? (meta.duracoes_ms.coleta / 1000).toFixed(1) + 's' : '—'}</div>
        <div>· Squad (5 mestres + Chief): ${meta.duracoes_ms?.squad ? (meta.duracoes_ms.squad / 1000).toFixed(1) + 's' : '—'}</div>
        <div>· Sintetizador: ${meta.duracoes_ms?.sintetizador ? (meta.duracoes_ms.sintetizador / 1000).toFixed(1) + 's' : '—'}</div>
        <div>· Total: ${meta.duracoes_ms?.total ? (meta.duracoes_ms.total / 1000).toFixed(1) + 's' : '—'}</div>
        <div>· Pareceres ativos: ${meta.squad?.qtd_pareceres || 0}</div>
        <div>· Sintetizador ${meta.sintetizador?.ok ? '✓ ok' : '✗ ' + (meta.sintetizador?.motivo || 'falha')}</div>
      </div>
    </details>

    <footer class="page-footer">
      Pinguim OS · Meta Ads Diário · gerado ${esc(dataFmt)} BRT<br>
      Dados: Supabase compartilhado · Squad Traffic Masters
    </footer>
  </div>

  <script>
    // Dados injetados
    const labels30d = ${JSON.stringify(labels30d)};
    const datas30dIso = ${JSON.stringify(datas30dIso)};
    const gastoSerie = ${JSON.stringify(gastoSerie)};
    const receitaSerie = ${JSON.stringify(receitaSerie)};
    const roasSerie = ${JSON.stringify(roasSerie)};
    const labelsContas = ${JSON.stringify(labelsContas)};
    const dadosContas = ${JSON.stringify(dadosContas)};

    // Tema dark common
    const themeDark = {
      mode: 'dark',
      palette: 'palette1',
    };
    const baseChartOpts = {
      chart: {
        background: 'transparent',
        foreColor: '#8E96A8',
        fontFamily: "'IBM Plex Sans', sans-serif",
        toolbar: { show: false },
        animations: { enabled: true, easing: 'easeinout', speed: 600 },
      },
      grid: {
        borderColor: '#1F232E',
        strokeDashArray: 3,
        padding: { top: 0, right: 16, bottom: 0, left: 8 },
        yaxis: { lines: { show: true } },
        xaxis: { lines: { show: false } },
      },
      tooltip: {
        theme: 'dark',
        style: { fontSize: '12px' },
      },
    };

    // Gráfico 1: Gasto × Receita Pixel (linha dupla com gradient sutil — V2 restored)
    new ApexCharts(document.getElementById('grafico-gasto-receita'), {
      ...baseChartOpts,
      chart: { ...baseChartOpts.chart, type: 'area', height: 280 },
      series: [
        { name: 'Gasto Meta', data: gastoSerie },
        { name: 'Receita Pixel', data: receitaSerie },
      ],
      colors: ['#FF6B1A', '#6CC287'],
      stroke: {
        curve: 'smooth',
        width: 2.5,
        lineCap: 'round',
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 100],
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: labels30d,
        labels: { style: { fontSize: '10px', colors: '#8E96A8' }, rotate: 0 },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tickAmount: 8,
      },
      yaxis: {
        labels: {
          formatter: v => v >= 1000 ? 'R$ ' + (v/1000).toFixed(0) + 'k' : 'R$ ' + v.toFixed(0),
          style: { fontSize: '10px', colors: '#8E96A8' },
        },
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        labels: { colors: '#F0F2F6' },
        markers: { width: 10, height: 10, radius: 5 },
        itemMargin: { horizontal: 16 },
      },
      tooltip: {
        ...baseChartOpts.tooltip,
        y: { formatter: v => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) },
      },
    }).render();

    // Gráfico 2: Donut distribuição por conta (V2 restored — sem glow exagerado)
    new ApexCharts(document.getElementById('grafico-distribuicao'), {
      ...baseChartOpts,
      chart: { ...baseChartOpts.chart, type: 'donut', height: 280 },
      series: dadosContas,
      labels: labelsContas,
      colors: ['#FF6B1A', '#A78BFA', '#67E8F9', '#6CC287', '#E6A85C', '#E58787', '#EC4899', '#84CC16'],
      stroke: { width: 2, colors: ['#06070A'] },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              name: {
                show: true,
                fontSize: '11px',
                fontFamily: "'IBM Plex Mono', monospace",
                color: '#8E96A8',
                offsetY: -8,
              },
              value: {
                show: true,
                fontSize: '20px',
                fontFamily: "'IBM Plex Sans', sans-serif",
                color: '#F0F2F6',
                fontWeight: 700,
                formatter: v => 'R$ ' + Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 0}),
                offsetY: 5,
              },
              total: {
                show: true,
                showAlways: false,
                label: 'Total',
                fontSize: '11px',
                fontFamily: "'IBM Plex Mono', monospace",
                color: '#8E96A8',
                formatter: chart => 'R$ ' + chart.globals.series.reduce((a, b) => a + b, 0).toLocaleString('pt-BR', {maximumFractionDigits: 0}),
              },
            },
          },
        },
      },
      dataLabels: { enabled: false },
      legend: {
        position: 'bottom',
        labels: { colors: '#F0F2F6' },
        fontSize: '11px',
        markers: { width: 10, height: 10, radius: 5 },
        itemMargin: { horizontal: 8, vertical: 4 },
      },
      tooltip: {
        ...baseChartOpts.tooltip,
        y: { formatter: v => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits: 2}) },
      },
    }).render();

    // Gráfico 3: ROAS Pixel diário (barras coloridas por valor — V2 restored)
    new ApexCharts(document.getElementById('grafico-roas'), {
      ...baseChartOpts,
      chart: { ...baseChartOpts.chart, type: 'bar', height: 240 },
      series: [{ name: 'ROAS Pixel', data: roasSerie }],
      plotOptions: {
        bar: {
          borderRadius: 4,
          columnWidth: '60%',
          distributed: true,
          colors: {
            ranges: [
              { from: 0, to: 0.99, color: '#E58787' },
              { from: 1, to: 2.99, color: '#E6A85C' },
              { from: 3, to: 999, color: '#6CC287' },
            ],
          },
        },
      },
      colors: roasSerie.map(v => v < 1 ? '#E58787' : v < 3 ? '#E6A85C' : '#6CC287'),
      dataLabels: { enabled: false },
      xaxis: {
        categories: labels30d,
        labels: { style: { fontSize: '10px', colors: '#8E96A8' }, rotate: 0 },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tickAmount: 8,
      },
      yaxis: {
        labels: {
          formatter: v => v.toFixed(1) + 'x',
          style: { fontSize: '10px', colors: '#8E96A8' },
        },
      },
      legend: { show: false },
      tooltip: {
        ...baseChartOpts.tooltip,
        y: { formatter: v => v.toFixed(2) + 'x' },
      },
    }).render();
  </script>
</body>
</html>`;
}

module.exports = { renderRelatorioMetaAds };
