// ============================================================
// template-relatorio-executivo.js — V2.14 Frente C1
// ============================================================
// Renderer HTML standalone dedicado pro Relatório Executivo Diário
// (tipo='relatorio-executivo-diario' em pinguim.entregaveis).
//
// Por que template separado e nao reusar template-html.js:
// - template-html.js parseia "# <Mestre>" + blocos por mestre (anatomia
//   de entregavel criativo: copy/parecer estrategico/etc).
// - Relatorio executivo tem anatomia FIXA da Skill compor-executivo-diario:
//   saudacao + TL;DR + NUMEROS + AGENDA + divisor + secoes detalhadas + Board.
// - Forcar um no outro e gambiarra. Layouts diferentes pedem renderers
//   diferentes (Princípio 11: separar problemas distintos).
//
// Visual: Sirius-grade dark (referencia docs/exemplos/estudo-precificacao-sirius.html).
// IBM Plex Sans + Mono, fundo #0A0A0A, cards #121212, laranja Pinguim #E85C00.
// ============================================================

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Markdown -> HTML simples (bold, italic, code, headers, listas, paragrafos).
// V2.14 C1.1 — NÃO usa tabela GFM (Andre rejeitou: "a gente nao consegue gerar
// um HTML com tabela"). Tabelas markdown sao DETECTADAS e CONVERTIDAS em lista
// bullet automaticamente, garantindo que sintetizador LLM possa usar tabela
// que o template gracefully degrade.
function md(text) {
  if (!text) return '';

  // PRE-PROCESSAMENTO: detecta blocos de tabela GFM e converte em lista bullet
  // Padrao: linha 1 = cabecalho com pipes, linha 2 = separador |---|---|, linhas seguintes = dados
  text = preprocessarTabelas(text);

  let html = esc(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // h3 com classes especiais pros kickers numerados (01·..05·) e SINTESE
  html = html.replace(/^### (.+)$/gm, (_, titulo) => {
    const t = titulo.trim();
    // Detecta "05 · PARECER DO BOARD" ou variantes como "PARECER DO BOARD"
    if (/^0?5\s*[·•.\-]?\s*PARECER\s+DO\s+BOARD/i.test(t) || /^PARECER\s+DO\s+BOARD/i.test(t)) {
      return `<h3 class="section-kicker board-kicker">${t}</h3>`;
    }
    // Detecta "🏛 SÍNTESE" (com ou sem emoji)
    if (/S[ÍI]NTESE\s*[—\-]\s*recomenda/i.test(t)) {
      return `<h3 class="section-kicker sintese-kicker">${t}</h3>`;
    }
    // Detecta seções numeradas "0X · TÍTULO"
    if (/^0?\d+\s*[·•.\-]\s*\S/.test(t)) {
      return `<h3 class="section-kicker">${t}</h3>`;
    }
    // Subseção comum
    return `<h3>${t}</h3>`;
  });
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^═{5,}$/gm, '<div class="separador-grosso"></div>');
  html = html.split(/\n\n+/).map(p => {
    if (p.match(/^<(h\d|pre|ul|ol|table|hr|div|section)/)) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}

// Converte blocos de tabela GFM markdown em lista bullet equivalente.
// Mantem header como "rotulo: valor · rotulo: valor" pra cada linha.
function preprocessarTabelas(text) {
  const linhas = text.split('\n');
  const out = [];
  let i = 0;
  while (i < linhas.length) {
    const l1 = linhas[i];
    const l2 = linhas[i + 1];
    // detecta tabela: linha 1 tem >= 1 pipe + linha 2 e separador |---|---|
    if (l1 && l2 && l1.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(l2)) {
      const cabecalhos = l1.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
      i += 2;
      const linhasDados = [];
      while (i < linhas.length && linhas[i].includes('|')) {
        const cels = linhas[i].replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        if (cels.some(c => c)) linhasDados.push(cels);
        i++;
      }
      // Renderiza como lista bullet
      for (const cels of linhasDados) {
        const partes = cabecalhos.map((h, idx) => {
          const v = cels[idx] || '';
          if (!v) return null;
          // Se cabecalho parece numerico/curto e valor tambem, formato "h: v"
          // Caso especial: 1a coluna sem cabecalho util (#, item) — pula header
          if (!h || /^#?$/.test(h) || h === '-') return v;
          return `**${h}:** ${v}`;
        }).filter(Boolean);
        out.push(`- ${partes.join(' · ')}`);
      }
      // Linha em branco depois
      out.push('');
    } else {
      out.push(l1);
      i++;
    }
  }
  return out.join('\n');
}

function renderRelatorioExecutivo({
  markdown,
  titulo,
  tipo,
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
  const modulos = meta.modulos || [];
  const sintetizador = meta.sintetizador || { ok: true };
  const socio = meta.socio || {};
  const janela = meta.janela_horas || 24;
  const diaAlvo = meta.dia_alvo_brt || '?';

  const sucessos = modulos.filter(m => m.ok && !m.skipped).length;
  const total    = modulos.filter(m => !m.skipped).length;
  const falhas   = modulos.filter(m => !m.ok && !m.skipped);

  // Versoes nav (parent_id, V1/V2/V3)
  const versionamentoHtml = (versionamento && versionamento.cadeia && versionamento.cadeia.length > 1)
    ? `<div class="versoes-nav">
        <span class="versoes-label">Versões:</span>
        ${versionamento.cadeia.map(v => v.id === versionamento.entregavel_id
          ? `<span class="versao-atual">V${v.versao}</span>`
          : `<a class="versao-link" href="/entregavel/${esc(v.id)}">V${v.versao}</a>`
        ).join('')}
      </div>`
    : '';

  // Modulos table (footer tecnico)
  const modulosHtml = modulos.length === 0 ? '' : modulos.map(m => {
    const status = m.skipped ? '⊘ skip' : (m.ok ? '✓ ok' : '✗ falhou');
    const cor = m.skipped ? 'cinza' : (m.ok ? 'good' : 'bad');
    const lat = m.latencia_ms ? `${(m.latencia_ms / 1000).toFixed(1)}s` : '-';
    const motivo = m.motivo ? ` <span class="modulo-motivo">— ${esc(m.motivo)}</span>` : '';
    return `<li class="modulo-item modulo-${cor}"><span class="modulo-status">${status}</span> <strong>${esc(m.slug)}</strong> · ${lat}${motivo}</li>`;
  }).join('');

  const conteudoHtml = md(markdown);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo || 'Executivo diário')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0A0A0A;
      --bg-card: #121212;
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
      --measure: 76ch;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
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
    /* Header topo */
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
      color: var(--txt);
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
    /* Diagnóstico técnico (colapsável no fim) */
    details.diagnostico-tecnico {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }
    details.diagnostico-tecnico summary {
      cursor: pointer;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      color: var(--txt-mute);
      letter-spacing: 0.05em;
      padding: 0.5rem 0;
    }
    details.diagnostico-tecnico summary:hover { color: var(--txt); }
    details.diagnostico-tecnico .card-meta { margin-top: 0.75rem; }
    /* Card de metricas (dentro do diagnóstico colapsável) */
    .card-meta {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-top: 3px solid var(--orange);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      margin: 0 0 2.5rem 0;
    }
    .card-meta .row {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.82rem;
      color: var(--txt-mute);
    }
    .card-meta .row strong {
      color: var(--txt);
      font-weight: 500;
    }
    .modulos-list {
      list-style: none;
      padding: 0;
      margin: 0.75rem 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.25rem;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
    }
    .modulo-item .modulo-status {
      font-weight: 600;
      margin-right: 0.25rem;
    }
    .modulo-good .modulo-status  { color: var(--good); }
    .modulo-bad  .modulo-status  { color: var(--bad);  }
    .modulo-cinza .modulo-status { color: var(--txt-dim); }
    .modulo-motivo { color: var(--txt-dim); font-size: 0.75rem; }
    /* Conteudo do relatorio */
    .conteudo h1 {
      font-size: 1.5rem;
      margin: 2rem 0 0.75rem;
      letter-spacing: -0.01em;
    }
    .conteudo h2 {
      font-size: 1.15rem;
      margin: 2rem 0 0.5rem;
      color: var(--orange);
      letter-spacing: 0.01em;
      font-weight: 600;
    }
    .conteudo h3 {
      font-size: 0.95rem;
      margin: 1.5rem 0 0.5rem;
      color: var(--txt);
      letter-spacing: 0.02em;
      font-weight: 500;
    }
    /* Kickers de seção numerada (01·..05·) — destaque forte com barra laranja
       grossa em cima + monospace caps. Detecta via regex no padrão "NN · TITULO". */
    .conteudo h3.section-kicker {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--orange);
      margin: 4rem 0 1.25rem;
      padding-top: 1.5rem;
      border-top: 3px solid var(--orange);
      position: relative;
    }
    .conteudo h3.section-kicker::after {
      content: '';
      display: block;
      height: 1px;
      background: var(--border);
      margin-top: 1.25rem;
      width: 100%;
    }
    /* Primeira seção numerada não tem margem-top tão grande (logo após divisória) */
    .conteudo h3.section-kicker:first-of-type {
      margin-top: 2.5rem;
    }
    /* Subseções dentro de uma seção numerada (ex: "Meta Ads", "Reembolsos") */
    .conteudo h3:not(.section-kicker) {
      color: var(--orange);
      margin-top: 1.5rem;
      font-family: 'IBM Plex Sans', sans-serif;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: none;
      font-size: 1rem;
      border-top: none;
    }
    /* Seção PARECER DO BOARD vai com cor ainda mais especial */
    .conteudo h3.section-kicker.board-kicker {
      color: var(--good);
      border-top-color: var(--good);
    }
    .conteudo h3.section-kicker.sintese-kicker {
      color: var(--orange);
      border-top: 3px solid var(--orange);
      background: linear-gradient(180deg, rgba(232, 92, 0, 0.06) 0%, transparent 100%);
      padding: 1.5rem 1rem 0;
      margin: 3rem -1rem 1.25rem;
    }
    .conteudo p {
      margin: 0.6rem 0;
    }
    .conteudo strong { color: var(--txt); font-weight: 600; }
    .conteudo em { color: var(--txt-mute); }
    .conteudo ul {
      list-style: none;
      padding-left: 0;
      margin: 0.6rem 0;
    }
    .conteudo ul li {
      padding-left: 1.25rem;
      position: relative;
      margin: 0.25rem 0;
    }
    .conteudo ul li::before {
      content: '·';
      position: absolute;
      left: 0.4rem;
      color: var(--orange);
      font-weight: 700;
    }
    .conteudo code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.88em;
      background: rgba(232, 92, 0, 0.08);
      border: 1px solid rgba(232, 92, 0, 0.18);
      padding: 0.1em 0.4em;
      border-radius: 4px;
      color: var(--orange);
    }
    .conteudo pre {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      overflow-x: auto;
      margin: 1rem 0;
    }
    .conteudo pre code {
      background: none;
      border: none;
      padding: 0;
      color: var(--txt);
    }
    .conteudo hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2.5rem 0;
    }
    .conteudo .separador-grosso {
      height: 1px;
      background: linear-gradient(to right, transparent 0%, var(--border-hover) 20%, var(--border-hover) 80%, transparent 100%);
      margin: 2rem 0;
    }
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
    .versoes-label { color: var(--txt-mute); }
    .versao-atual {
      color: var(--orange);
      font-weight: 600;
    }
    .versao-link {
      color: var(--txt-mute);
      text-decoration: none;
      transition: color 0.15s;
    }
    .versao-link:hover { color: var(--txt); }
    /* Footer */
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
    footer.page-footer a {
      color: var(--orange);
      text-decoration: none;
    }
    footer.page-footer a:hover { text-decoration: underline; }
    /* Print */
    @media print {
      body { background: white; color: black; }
      .card-meta, .versoes-nav, footer.page-footer { background: #f6f6f6; color: #333; }
    }
  </style>
</head>
<body>
  <div class="container">

    <header class="page-header">
      <div class="kicker">RELATÓRIO EXECUTIVO · SQUAD DATA</div>
      <h1>${esc(titulo || 'Executivo diário')}</h1>
      <div class="meta-linha">
        <span>${esc(socio.nome || 'Sócio')}</span>
        <span>janela ${janela}h</span>
        <span>dia alvo ${esc(diaAlvo)}</span>
        <span>gerado ${dataFmt}</span>
      </div>
      ${versionamentoHtml}
    </header>

    <article class="conteudo">
      ${conteudoHtml}
    </article>

    <footer class="page-footer">
      Pinguim OS · Relatório Executivo Diário · gerado em ${dataFmt} (BRT)<br>
      Discrepância? Avisa o Codina. <a href="/">← Chat</a>
    </footer>

  </div>
</body>
</html>`;
}

module.exports = { renderRelatorioExecutivo };
