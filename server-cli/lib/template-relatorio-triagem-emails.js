// ============================================================
// template-relatorio-triagem-emails.js — V3 (Andre 2026-05-13 noite)
// ============================================================
// Renderer HTML do RELATÓRIO DE TRIAGEM INTERATIVO.
// Evolução do V2 (chief of staff) com 4 mudanças confirmadas pelo Codina:
//   A. Resumo de contagem por balde no TOPO (em linha, clicável)
//   B. Baldes secundários COLAPSÁVEIS (clica e expande)
//   C. AÇÕES por item: 📥 arquivar · ✓ lido+arquivar · ⭐ importante · 🗑 lixo (com pop-up)
//   D. AÇÕES em massa: arquivar/lido/lixo todos (com confirmação)
//   E. Toast com desfazer (6s) — padrão Gmail/Superhuman
//
// Backend que sustenta as ações: POST /api/relatorio/triagem-acao
// ============================================================

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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
    if (/^<(h\d|ul|ol|li|hr|pre|code|p|div|section|a)/i.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}

function truncar(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function renderRelatorioTriagemEmails({
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
  const total = meta.total_emails || 0;
  const top3 = meta.top3 || [];
  const baldes = meta.baldes || {};
  const contagens = meta.contagens || {};
  const baldesCustom = meta.baldes_custom || []; // V5
  const clienteId = socio.cliente_id || socio.id || '';

  // V5 — Descrições canônicas dos baldes nativos (sempre visíveis)
  const DESCRICOES_NATIVAS = {
    responder_hoje: 'Só você resolve. Cliente urgente, reclamação, proposta com prazo, jurídico/fiscal.',
    decidir: 'Pedem aprovação/OK seu. Funcionário ou sócio aguardando validação, contrato pra revisar.',
    pagar: 'Boleto ativo, fatura, NF, reembolso a aprovar, cobrança. Recibos já pagos ficam em arquivar.',
    delegar: 'Funcionário do time resolve. Cadastro Princípia Pay, dúvida operacional sobre produto, agendamento.',
    acompanhar: 'Você está esperando o outro responder. Follow-up que você iniciou.',
    arquivar: 'Newsletter, confirmação automática, notificação Slack/GitHub/Drive, CC informativo, recibo já pago.',
  };

  const conteudoHtml = md(markdown);

  // Versões nav (colapsável)
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

  // ============================================================
  // HERO — Saudação
  // ============================================================
  const heroResumo = (() => {
    const nome = (socio.nome || 'Sócio').split(' ')[0];
    const qtdTop3 = top3.length;
    if (total === 0) {
      return `<div class="hero-resumo"><div class="hero-saudacao">Inbox limpa, ${esc(nome)}.</div><div class="hero-sub">0 emails na janela — aproveita.</div></div>`;
    }
    const subText = qtdTop3 === 0
      ? `${total} email${total > 1 ? 's' : ''} desde ontem. Nada urgente que SÓ você resolve.`
      : `${total} email${total > 1 ? 's' : ''} desde ontem. <strong>${qtdTop3}</strong> ${qtdTop3 > 1 ? 'precisam' : 'precisa'} de você hoje.`;
    return `<div class="hero-resumo">
      <div class="hero-saudacao">Bom dia, ${esc(nome)}.</div>
      <div class="hero-sub">${subText}</div>
    </div>`;
  })();

  // ============================================================
  // RESUMO DE CONTAGEM POR BALDE — em linha, clicável
  // ============================================================
  const resumoContagem = (() => {
    const itens = [
      { slug: 'hoje',           icon: '🎯', label: 'hoje',       count: top3.length, target: 'balde-hoje' },
      { slug: 'decidir',        icon: '✋', label: 'decidir',    count: contagens.decidir || 0,    target: 'balde-decidir' },
      { slug: 'pagar',          icon: '💸', label: 'pagar',      count: contagens.pagar || 0,      target: 'balde-pagar' },
      { slug: 'delegar',        icon: '🤝', label: 'delegar',    count: contagens.delegar || 0,    target: 'balde-delegar' },
      { slug: 'acompanhar',     icon: '⏳', label: 'acompanhar', count: contagens.acompanhar || 0, target: 'balde-acompanhar' },
      ...baldesCustom.map(bc => ({
        slug: bc.slug, icon: bc.icone || '🏷', label: (bc.nome || bc.slug).toLowerCase().slice(0, 18),
        count: (baldes[bc.slug] || []).length, target: `balde-${bc.slug}`,
      })),
      { slug: 'arquivar',       icon: '📦', label: 'arquivar',   count: (contagens.arquivar || 0) + (contagens.spam || 0), target: 'balde-arquivar' },
    ];
    return `
      <nav class="resumo-contagem" aria-label="Resumo da inbox">
        ${itens.map(it => `
          <a href="#${it.target}" class="resumo-chip ${it.count === 0 ? 'is-vazio' : ''}" data-balde="${it.slug}">
            <span class="resumo-icon">${it.icon}</span>
            <span class="resumo-count">${it.count}</span>
            <span class="resumo-label">${it.label}</span>
          </a>
        `).join('')}
      </nav>
    `;
  })();

  // ============================================================
  // TOP 3 — sempre aberto, cards numerados
  // ============================================================
  const heroTop3 = (() => {
    if (top3.length === 0) return '';
    return `
      <section class="bloco-top3" id="balde-hoje">
        <h2 class="bloco-titulo">🎯 Hoje (${top3.length})</h2>
        <div class="top3-grid">
          ${top3.map((item, i) => {
            // top3 vem do priorizarTop3 com {id, acao_curta, acao_completa, link_gmail}
            // mas o email original (com snippet) tá em baldes.responder_hoje/decidir/pagar
            const todosEmails = [
              ...(baldes.responder_hoje || []),
              ...(baldes.decidir || []),
              ...(baldes.pagar || []),
            ];
            const emailOriginal = todosEmails.find(e => e.id === item.id) || {};
            const snippet = emailOriginal.snippet || '';
            return `
            <div class="top3-card" data-message-id="${esc(item.id)}" data-balde-atual="responder_hoje" data-assunto="${esc(emailOriginal.assunto || '')}" data-snippet="${esc(snippet)}" data-remetente-email="${esc(emailOriginal.email_de || '')}" data-remetente-nome="${esc(emailOriginal.nome_de || '')}">
              <div class="top3-clicavel" data-toggle-expandir="1">
                <div class="top3-num">${i + 1}</div>
                <div class="top3-conteudo">
                  <div class="top3-acao">${esc(item.acao_curta)}</div>
                  <div class="top3-completa">${esc(item.acao_completa)}</div>
                  ${snippet ? `<div class="balde-snippet">${esc(truncar(snippet, 220))}</div>` : ''}
                </div>
                <div class="top3-toggle">▾</div>
              </div>
              <div class="balde-corpo-expandido" data-corpo-expandido="1">
                <div class="corpo-loading">carregando…</div>
              </div>
              <div class="item-acoes" role="group" aria-label="Ações">
                <button class="btn-acao btn-acao-vermais" data-toggle-expandir="1" title="Ver corpo completo">▾ ver mais</button>
                <button class="btn-acao btn-acao-reclassificar" data-action="reclassificar" title="Reclassificar">↻</button>
                <button class="btn-acao" data-op="starred" title="Marcar como importante">⭐</button>
                <button class="btn-acao" data-op="arquivar" title="Arquivar">📥</button>
                <button class="btn-acao" data-op="lido_arquivar" title="Marcar como lido (e arquivar)">✓</button>
                <button class="btn-acao btn-acao-perigo" data-op="lixo" title="Mover pra Lixeira" data-confirma="1">🗑</button>
                <a class="btn-gmail" href="${esc(item.link_gmail || '#')}" target="_blank" rel="noopener" title="Abrir no Gmail">↗ Gmail</a>
              </div>
            </div>
          `;}).join('')}
        </div>
      </section>
    `;
  })();

  // ============================================================
  // Função genérica de renderizar balde colapsável
  // ============================================================
  function renderBalde({ slug, icone, titulo, lista, aberto = false, maxItens = 999, acoesMassa = [], descricao = '' }) {
    if (!lista || lista.length === 0) return '';

    const idBalde = `balde-${slug}`;
    const listaFiltrada = lista.slice(0, maxItens);
    const sobra = lista.length - listaFiltrada.length;

    const acoesMassaHtml = acoesMassa.length === 0 ? '' : `
      <div class="balde-acoes-massa">
        ${acoesMassa.map(a => `
          <button class="btn-massa ${a.perigo ? 'btn-massa-perigo' : ''}" data-balde="${slug}" data-op="${a.op}" data-label="${esc(a.label)}" data-confirma="${a.confirma ? '1' : '0'}">
            ${a.icone} ${esc(a.label)}
          </button>
        `).join('')}
      </div>
    `;

    return `
      <details class="bloco-balde" id="${idBalde}" data-balde-slug="${slug}" ${aberto ? 'open' : ''}>
        <summary class="balde-summary">
          <h3 class="balde-titulo"><span class="balde-icone">${icone}</span> ${esc(titulo)} <span class="balde-count" data-count-do-balde="${slug}">${lista.length}</span></h3>
          <span class="balde-toggle">▾</span>
        </summary>
        ${descricao ? `<div class="balde-descricao">${esc(descricao)}</div>` : ''}
        <div class="balde-corpo">
          ${acoesMassaHtml}
          <ul class="balde-lista">
            ${listaFiltrada.map(e => `
              <li class="balde-item" data-message-id="${esc(e.id)}" data-balde-atual="${slug}" data-assunto="${esc(e.assunto || '')}" data-snippet="${esc(e.snippet || '')}" data-remetente-email="${esc(e.email_de || '')}" data-remetente-nome="${esc(e.nome_de || '')}">
                <div class="balde-clicavel" data-toggle-expandir="1">
                  <div class="balde-cabecalho">
                    <span class="balde-assunto">${esc(truncar(e.assunto || '(sem assunto)', 90))}</span>
                    <span class="balde-meta">${esc(truncar(e.nome_de || '?', 30))}${e.data ? ' · ' + esc(e.data.split(',')[0] || '') : ''}</span>
                  </div>
                  ${e.snippet ? `<div class="balde-snippet">${esc(truncar(e.snippet, 220))}</div>` : ''}
                </div>
                <div class="balde-corpo-expandido" data-corpo-expandido="1">
                  <div class="corpo-loading">carregando…</div>
                </div>
                <div class="item-acoes" role="group" aria-label="Ações">
                  <button class="btn-acao btn-acao-vermais" data-toggle-expandir="1" title="Ver corpo completo">▾ ver mais</button>
                  <button class="btn-acao btn-acao-reclassificar" data-action="reclassificar" title="Reclassificar">↻</button>
                  <button class="btn-acao" data-op="starred" title="Marcar como importante">⭐</button>
                  <button class="btn-acao" data-op="arquivar" title="Arquivar">📥</button>
                  <button class="btn-acao" data-op="lido_arquivar" title="Marcar como lido (e arquivar)">✓</button>
                  <button class="btn-acao btn-acao-perigo" data-op="lixo" title="Mover pra Lixeira" data-confirma="1">🗑</button>
                  <a class="btn-gmail" href="${esc(e.link_gmail || '#')}" target="_blank" rel="noopener" title="Abrir no Gmail">↗ Gmail</a>
                </div>
              </li>
            `).join('')}
          </ul>
          ${sobra > 0 ? `<div class="balde-mais">+${sobra} não listados (use a lista completa do Gmail)</div>` : ''}
        </div>
      </details>
    `;
  }

  // ============================================================
  // Baldes secundários — colapsados por padrão
  // ============================================================
  const idsTop3 = new Set(top3.map(t => t.id));
  const decidirFora = (baldes.decidir || []).filter(e => !idsTop3.has(e.id));
  const pagarFora = (baldes.pagar || []).filter(e => !idsTop3.has(e.id));
  const delegar = baldes.delegar || [];
  const acompanhar = baldes.acompanhar || [];
  const arquivarLista = baldes.arquivar || [];
  const spamLista = baldes.spam || [];
  const arquivarTodos = [...arquivarLista, ...spamLista]; // junta arquivar + spam num balde só

  const baldeDecidirHtml = renderBalde({
    slug: 'decidir', icone: '✋', titulo: 'Esperando sua decisão',
    lista: decidirFora, maxItens: 20,
    descricao: DESCRICOES_NATIVAS.decidir,
  });

  const baldePagarHtml = renderBalde({
    slug: 'pagar', icone: '💸', titulo: 'Financeiro',
    lista: pagarFora, maxItens: 20,
    descricao: DESCRICOES_NATIVAS.pagar,
  });

  const baldeDelegarHtml = renderBalde({
    slug: 'delegar', icone: '🤝', titulo: 'Pode delegar',
    lista: delegar, maxItens: 20,
    descricao: DESCRICOES_NATIVAS.delegar,
  });

  const baldeAcompanharHtml = renderBalde({
    slug: 'acompanhar', icone: '⏳', titulo: 'Aguardando resposta de terceiros',
    lista: acompanhar, maxItens: 20,
    descricao: DESCRICOES_NATIVAS.acompanhar,
    acoesMassa: [
      { op: 'lido_arquivar', label: 'Marcar todos como lidos', icone: '✓', confirma: false },
    ],
  });

  const baldeArquivarHtml = renderBalde({
    slug: 'arquivar', icone: '📦', titulo: 'Pode arquivar sem ler',
    lista: arquivarTodos, maxItens: 50,
    descricao: DESCRICOES_NATIVAS.arquivar,
    acoesMassa: [
      { op: 'arquivar', label: 'Arquivar todos', icone: '📥', confirma: true },
      { op: 'lido_arquivar', label: 'Marcar todos como lidos', icone: '✓', confirma: true },
      { op: 'lixo', label: 'Apagar todos', icone: '🗑', confirma: true, perigo: true },
    ],
  });

  // V5 — Baldes custom como seções próprias
  const baldesCustomHtml = baldesCustom.map(bc => renderBalde({
    slug: bc.slug,
    icone: bc.icone || '🏷',
    titulo: bc.nome,
    lista: baldes[bc.slug] || [],
    descricao: bc.descricao || '',
    maxItens: 20,
  })).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo || 'Triagem de Emails')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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
      --accent: #FF6B1A;
      --accent-glow: rgba(255,107,26,0.4);
      --accent-soft: rgba(255,107,26,0.08);
      --good: #6CC287;
      --good-soft: rgba(108,194,135,0.12);
      --warn: #E6A85C;
      --bad: #E58787;
      --bad-soft: rgba(229,135,135,0.1);
      --measure: 920px;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background:
        radial-gradient(ellipse at top left, rgba(255,107,26,0.04) 0%, transparent 50%),
        var(--bg);
      background-attachment: fixed;
      color: var(--txt);
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: var(--measure); margin: 0 auto; padding: 3rem 1.5rem 5rem; }

    /* Header */
    header.page-header { padding-bottom: 1.25rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    header.page-header .kicker { font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 0.5rem; }
    header.page-header h1 { font-size: 1.3rem; font-weight: 500; margin: 0 0 0.35rem 0; letter-spacing: -0.005em; line-height: 1.3; color: var(--txt-mute); }
    header.page-header .meta-linha { font-family: 'IBM Plex Mono', monospace; font-size: 0.74rem; color: var(--txt-dim); }
    header.page-header .meta-linha span + span::before { content: '·'; margin: 0 0.45rem; opacity: 0.5; }

    .hero-resumo { margin: 0 0 1.75rem 0; padding: 1.5rem 0 1.25rem; }
    .hero-saudacao { font-size: 2rem; font-weight: 600; margin-bottom: 0.55rem; letter-spacing: -0.02em; color: var(--txt); }
    .hero-sub { font-size: 1.05rem; color: var(--txt-mute); line-height: 1.55; max-width: 600px; }
    .hero-sub strong { color: var(--accent); font-weight: 600; }

    /* Resumo de contagem por balde */
    .resumo-contagem {
      display: flex; flex-wrap: wrap; gap: 0.5rem;
      margin: 0 0 2.5rem 0;
      padding: 0.85rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .resumo-chip {
      display: inline-flex; align-items: center; gap: 0.45rem;
      padding: 0.55rem 0.85rem;
      background: var(--bg-card-2);
      border: 1px solid var(--border);
      border-radius: 999px;
      text-decoration: none;
      color: var(--txt);
      font-size: 0.85rem;
      transition: border-color 0.15s, transform 0.15s, background 0.15s;
      cursor: pointer;
    }
    .resumo-chip:hover { border-color: var(--accent); transform: translateY(-1px); background: var(--accent-soft); }
    .resumo-chip.is-vazio { color: var(--txt-dim); opacity: 0.55; }
    .resumo-chip.is-vazio:hover { border-color: var(--border-hover); background: var(--bg-card-2); transform: none; }
    .resumo-icon { font-size: 1rem; line-height: 1; }
    .resumo-count { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--accent); min-width: 1ch; text-align: center; }
    .resumo-chip.is-vazio .resumo-count { color: var(--txt-dim); }
    .resumo-label { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--txt-mute); }

    /* Bloco TOP 3 */
    .bloco-top3 { margin: 0 0 2.5rem 0; }
    .bloco-titulo { font-size: 1.15rem; font-weight: 600; margin: 0 0 1.15rem 0; color: var(--txt); letter-spacing: -0.005em; }
    .top3-grid { display: flex; flex-direction: column; gap: 0.75rem; }
    .top3-card {
      position: relative;
      background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card-2) 100%);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 12px;
      transition: transform 0.18s, border-color 0.18s, background 0.18s, opacity 0.18s, max-height 0.3s;
      overflow: hidden;
    }
    .top3-card.is-removendo { opacity: 0; transform: translateX(50px); max-height: 0; padding: 0; border-width: 0; margin: 0; }
    .top3-card:hover { transform: translateX(3px); border-color: var(--border-hover); background: var(--bg-card-2); }
    .top3-card:hover .item-acoes { opacity: 1; }
    .top3-link, .top3-clicavel {
      display: grid;
      grid-template-columns: 48px 1fr auto;
      align-items: start;
      gap: 1rem;
      padding: 1.15rem 1.25rem;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }
    .top3-toggle { font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--txt-dim); align-self: center; transition: transform 0.2s, color 0.2s; }
    .top3-card.is-expandido .top3-toggle { transform: rotate(180deg); color: var(--accent); }
    .top3-num {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 1.55rem;
      font-weight: 700;
      color: var(--accent);
      line-height: 1;
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px;
      background: var(--accent-soft);
      border-radius: 50%;
      flex-shrink: 0;
    }
    .top3-conteudo { min-width: 0; }
    .top3-acao { font-size: 1.02rem; font-weight: 600; color: var(--txt); margin-bottom: 0.3rem; line-height: 1.35; }
    .top3-completa { font-size: 0.88rem; color: var(--txt-mute); line-height: 1.55; }
    .top3-abrir { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; color: var(--accent); white-space: nowrap; align-self: center; opacity: 0.75; }
    .top3-card:hover .top3-abrir { opacity: 1; }

    /* Item acoes (botões dos itens) */
    .item-acoes {
      display: flex;
      gap: 0.25rem;
      padding: 0 1.25rem 0.85rem;
      opacity: 0.55;
      transition: opacity 0.15s;
    }
    .balde-item .item-acoes { padding: 0.4rem 0.9rem 0.65rem; }
    .balde-item:hover .item-acoes { opacity: 1; }
    .btn-acao {
      background: var(--bg-card-3);
      border: 1px solid var(--border);
      color: var(--txt-mute);
      font-size: 0.95rem;
      width: 30px; height: 30px;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
    }
    .btn-acao:hover { background: var(--bg-card-2); color: var(--txt); border-color: var(--accent); transform: translateY(-1px); }
    .btn-acao-perigo:hover { color: var(--bad); border-color: var(--bad); background: var(--bad-soft); }
    .btn-acao:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Baldes secundários — <details> */
    .bloco-balde { margin: 0 0 1rem 0; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: border-color 0.15s; }
    .bloco-balde:hover { border-color: var(--border-hover); }
    .bloco-balde[open] { background: var(--bg-card); }
    .balde-summary {
      list-style: none;
      cursor: pointer;
      padding: 0.95rem 1.15rem;
      display: flex; align-items: center; justify-content: space-between;
      transition: background 0.12s;
    }
    .balde-summary::-webkit-details-marker { display: none; }
    .balde-summary:hover { background: var(--bg-card-2); }
    .balde-titulo { font-size: 0.98rem; font-weight: 600; margin: 0; color: var(--txt); display: flex; align-items: center; gap: 0.55rem; }
    .balde-icone { font-size: 1.05rem; }
    .balde-count { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; font-weight: 500; color: var(--txt-mute); background: var(--bg-card-2); padding: 0.15rem 0.6rem; border-radius: 999px; min-width: 1.6rem; text-align: center; }
    .balde-toggle { font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; color: var(--txt-dim); transition: transform 0.2s, color 0.2s; }
    .bloco-balde[open] .balde-toggle { transform: rotate(180deg); color: var(--accent); }
    .balde-corpo { padding: 0.25rem 1.15rem 1.1rem; }

    /* Descrição do balde (sempre visível, embaixo do header) */
    .balde-descricao {
      padding: 0.15rem 1.15rem 0.85rem;
      font-size: 0.78rem;
      color: var(--txt-mute);
      line-height: 1.55;
      border-bottom: 1px solid var(--border);
      margin-bottom: 0.4rem;
    }

    /* Dropdown de reclassificar — anexado ao body com position fixed pra não ser cortado */
    .reclassificar-dropdown {
      position: fixed;
      background: var(--bg-card-2);
      border: 1px solid var(--border-hover);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      padding: 0.4rem;
      min-width: 240px;
      max-height: 70vh;
      overflow-y: auto;
      z-index: 10000;
      animation: fadein 0.15s ease;
    }
    @keyframes fadein {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .reclassificar-titulo { font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--txt-mute); padding: 0.35rem 0.5rem 0.5rem; }
    .reclassificar-opcao {
      display: flex; align-items: center; gap: 0.55rem;
      width: 100%;
      padding: 0.55rem 0.65rem;
      background: transparent;
      border: none;
      color: var(--txt);
      font-size: 0.86rem;
      cursor: pointer;
      border-radius: 6px;
      text-align: left;
      transition: background 0.1s;
      font-family: inherit;
    }
    .reclassificar-opcao:hover { background: var(--bg-card-3); }
    .reclassificar-opcao.is-atual { opacity: 0.4; cursor: not-allowed; }
    .reclassificar-opcao.is-novo { color: var(--accent); border-top: 1px solid var(--border); margin-top: 0.35rem; padding-top: 0.7rem; }
    .item-acoes { position: relative; }

    /* Modal criar balde novo */
    .modal-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.65);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      animation: fadein 0.15s ease;
    }
    .modal-conteudo {
      background: var(--bg-card);
      border: 1px solid var(--border-hover);
      border-radius: 14px;
      padding: 1.75rem;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    }
    .modal-titulo { font-size: 1.15rem; font-weight: 600; margin: 0 0 0.4rem; color: var(--txt); }
    .modal-sub { font-size: 0.85rem; color: var(--txt-mute); margin-bottom: 1.15rem; line-height: 1.5; }
    .modal-campo { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.85rem; }
    .modal-campo label { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; text-transform: uppercase; color: var(--txt-mute); letter-spacing: 0.05em; }
    .modal-campo input { background: var(--bg-card-2); border: 1px solid var(--border); color: var(--txt); padding: 0.6rem 0.8rem; border-radius: 7px; font-size: 0.92rem; font-family: inherit; transition: border-color 0.15s; }
    .modal-campo input:focus { outline: none; border-color: var(--accent); }
    .modal-campo .hint { font-size: 0.72rem; color: var(--txt-dim); font-style: italic; }
    .modal-acoes { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
    .modal-btn { padding: 0.55rem 1rem; font-size: 0.85rem; border-radius: 7px; cursor: pointer; transition: all 0.15s; font-family: inherit; }
    .modal-btn-secundario { background: transparent; border: 1px solid var(--border); color: var(--txt-mute); }
    .modal-btn-secundario:hover { color: var(--txt); border-color: var(--border-hover); }
    .modal-btn-principal { background: var(--accent); border: 1px solid var(--accent); color: white; font-weight: 600; }
    .modal-btn-principal:hover { filter: brightness(1.1); }
    .modal-btn-principal:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Ações em massa */
    .balde-acoes-massa { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.5rem 0 0.85rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--border); }
    .btn-massa {
      background: var(--bg-card-2);
      border: 1px solid var(--border);
      color: var(--txt);
      font-size: 0.78rem;
      font-family: 'IBM Plex Mono', monospace;
      padding: 0.45rem 0.85rem;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-massa:hover { background: var(--bg-card-3); border-color: var(--accent); }
    .btn-massa-perigo:hover { border-color: var(--bad); color: var(--bad); background: var(--bad-soft); }
    .btn-massa:disabled { opacity: 0.4; cursor: not-allowed; }

    .balde-lista { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
    .balde-item {
      margin: 0;
      background: var(--bg-card-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      transition: border-color 0.15s, transform 0.15s, opacity 0.25s, max-height 0.3s;
      overflow: hidden;
    }
    .balde-item.is-removendo { opacity: 0; transform: translateX(50px); max-height: 0; padding: 0; border-width: 0; margin: 0; }
    .balde-item:hover { border-color: var(--border-hover); }
    .balde-clicavel {
      padding: 0.7rem 0.95rem 0.55rem;
      cursor: pointer;
    }
    .balde-cabecalho { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
    .balde-assunto { font-size: 0.9rem; font-weight: 500; color: var(--txt); line-height: 1.4; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .balde-meta { font-size: 0.76rem; color: var(--txt-mute); font-family: 'IBM Plex Mono', monospace; white-space: nowrap; flex-shrink: 0; }
    .balde-snippet {
      font-size: 0.82rem;
      color: var(--txt-mute);
      line-height: 1.5;
      margin-top: 0.4rem;
      opacity: 0.85;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .top3-clicavel .balde-snippet { margin-top: 0.55rem; }
    .balde-corpo-expandido {
      display: none;
      padding: 0.85rem 0.95rem;
      margin: 0 0.5rem 0.5rem;
      background: var(--bg-card-3);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.85rem;
      line-height: 1.65;
      color: var(--txt);
      max-height: 360px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'IBM Plex Sans', sans-serif;
    }
    .balde-item.is-expandido .balde-corpo-expandido,
    .top3-card.is-expandido .balde-corpo-expandido { display: block; }
    .balde-item.is-expandido .balde-snippet,
    .top3-card.is-expandido .balde-snippet { display: none; }
    .corpo-loading { font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; color: var(--txt-dim); text-align: center; padding: 0.5rem; }
    .corpo-erro { color: var(--bad); font-size: 0.8rem; }
    .btn-acao-vermais {
      width: auto !important;
      padding: 0 0.65rem !important;
      font-size: 0.74rem !important;
      font-family: 'IBM Plex Mono', monospace !important;
      color: var(--txt-mute) !important;
    }
    .btn-acao-vermais:hover { color: var(--accent) !important; }
    .balde-item.is-expandido .btn-acao-vermais, .top3-card.is-expandido .btn-acao-vermais { color: var(--accent) !important; }
    .btn-gmail {
      display: inline-flex; align-items: center;
      padding: 0 0.7rem;
      height: 30px;
      background: var(--bg-card-3);
      border: 1px solid var(--border);
      color: var(--txt-mute);
      font-size: 0.74rem;
      font-family: 'IBM Plex Mono', monospace;
      text-decoration: none;
      border-radius: 6px;
      transition: all 0.15s;
      margin-left: auto;
    }
    .btn-gmail:hover { color: var(--accent); border-color: var(--accent); }
    .balde-mais { font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; color: var(--txt-dim); text-align: center; padding: 0.5rem; }

    /* Toast container (canto inferior direito) */
    #toast-container {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      display: flex; flex-direction: column; gap: 0.55rem;
      z-index: 9999;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--good);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      min-width: 280px;
      max-width: 360px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: space-between; gap: 0.85rem;
      font-size: 0.88rem;
      color: var(--txt);
      transform: translateX(120%);
      transition: transform 0.25s ease;
    }
    .toast.is-shown { transform: translateX(0); }
    .toast.is-erro { border-left-color: var(--bad); }
    .toast-msg { flex: 1; min-width: 0; }
    .toast-msg strong { color: var(--good); }
    .toast.is-erro .toast-msg strong { color: var(--bad); }
    .toast-acoes { display: flex; gap: 0.4rem; }
    .toast-btn {
      background: var(--bg-card-3);
      border: 1px solid var(--border);
      color: var(--txt-mute);
      font-size: 0.78rem;
      font-family: 'IBM Plex Mono', monospace;
      padding: 0.35rem 0.7rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .toast-btn:hover { color: var(--accent); border-color: var(--accent); }
    .toast-btn-fechar { padding: 0.3rem 0.55rem; }

    /* Conteúdo markdown (escondido por padrão) */
    .conteudo { font-size: 0.92rem; line-height: 1.7; margin: 2.5rem 0 1.5rem 0; padding: 1.25rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; display: none; }
    .conteudo.mostrar { display: block; }
    .conteudo h1 { font-size: 1.3rem; margin: 1rem 0 0.65rem; color: var(--txt); }
    .conteudo h2 { font-size: 1.05rem; margin: 1.2rem 0 0.6rem; color: var(--txt); }
    .conteudo h3 { font-size: 0.92rem; margin: 1rem 0 0.45rem; color: var(--txt); font-weight: 600; }
    .conteudo p { margin: 0.55rem 0; }
    .conteudo ul, .conteudo ol { padding-left: 1.4rem; margin: 0.55rem 0; }
    .conteudo li { margin: 0.25rem 0; }
    .conteudo strong { color: var(--txt); font-weight: 600; }
    .conteudo em { color: var(--accent); font-style: normal; font-weight: 500; }
    .conteudo a { color: var(--accent); text-decoration: none; }
    .conteudo a:hover { text-decoration: underline; }
    .conteudo hr { border: none; border-top: 1px solid var(--border); margin: 1.25rem 0; }

    /* Versionamento */
    .versoes-nav { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.75rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; margin-top: 0.55rem; }
    .versao-atual { color: var(--accent); font-weight: 600; }
    .versao-link { color: var(--txt-mute); text-decoration: none; }
    .versao-link:hover { color: var(--txt); }
    .versoes-anteriores summary { cursor: pointer; color: var(--txt-mute); list-style: none; }
    .versoes-anteriores summary:hover { color: var(--txt); }
    .versoes-anteriores summary::-webkit-details-marker { display: none; }
    .versoes-anteriores[open] summary { color: var(--txt); }
    .versoes-lista { display: inline-flex; gap: 0.4rem; margin-left: 0.5rem; }

    /* Diagnóstico técnico */
    details.diagnostico { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    details.diagnostico summary { cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 0.74rem; color: var(--txt-mute); letter-spacing: 0.05em; padding: 0.45rem 0; }
    details.diagnostico summary:hover { color: var(--txt); }
    .diagnostico-body { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-top: 0.5rem; font-family: 'IBM Plex Mono', monospace; font-size: 0.74rem; color: var(--txt-mute); line-height: 1.65; }
    .diagnostico-body div { margin: 0.15rem 0; }
    .diagnostico-body strong { color: var(--txt); }

    /* Toggle markdown */
    .toggle-md { display: inline-block; margin-top: 0.85rem; padding: 0.35rem 0.75rem; font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; color: var(--txt-mute); background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: color 0.15s; }
    .toggle-md:hover { color: var(--txt); }

    footer.page-footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; color: var(--txt-dim); text-align: center; line-height: 1.7; }
    footer.page-footer .fundamento { display: block; margin-top: 0.45rem; max-width: 600px; margin-left: auto; margin-right: auto; opacity: 0.7; }

    @media print {
      body { background: white; color: black; }
      .top3-card, .balde-link, .bloco-balde { background: #f6f6f6; color: #333; }
      .item-acoes, .balde-acoes-massa, #toast-container, .toggle-md { display: none; }
    }
    @media (max-width: 640px) {
      .container { padding: 2rem 1rem 4rem; }
      .hero-saudacao { font-size: 1.5rem; }
      .top3-link { grid-template-columns: 36px 1fr; gap: 0.75rem; padding: 0.95rem 1rem; }
      .top3-abrir { display: none; }
      .resumo-chip { padding: 0.45rem 0.7rem; font-size: 0.8rem; }
      .item-acoes { opacity: 1; }
      #toast-container { right: 0.75rem; left: 0.75rem; bottom: 0.75rem; }
      .toast { min-width: 0; max-width: none; }
    }
  </style>
</head>
<body data-cliente-id="${esc(clienteId)}">
  <div class="container">
    <header class="page-header">
      <div class="kicker">📧 TRIAGEM DE EMAILS · CHIEF OF STAFF</div>
      <h1>${esc(titulo || 'Triagem de Emails diária')}</h1>
      <div class="meta-linha">
        <span>${esc(socio.nome || 'Destinatário')}</span>
        <span>gerado ${esc(dataFmt)}</span>
        ${meta.duracoes_ms?.total ? `<span>${(meta.duracoes_ms.total / 1000).toFixed(1)}s</span>` : ''}
      </div>
      ${versionamentoHtml}
    </header>

    ${heroResumo}

    ${resumoContagem}

    ${heroTop3}

    ${baldeDecidirHtml}
    ${baldePagarHtml}
    ${baldeDelegarHtml}
    ${baldeAcompanharHtml}
    ${baldesCustomHtml}
    ${baldeArquivarHtml}

    <article class="conteudo" id="conteudo-md">
      ${conteudoHtml}
    </article>

    <button class="toggle-md" id="btn-toggle-md">ver versão markdown (para WhatsApp/chat)</button>

    <details class="diagnostico">
      <summary>📋 Diagnóstico técnico</summary>
      <div class="diagnostico-body">
        <div><strong>Fonte de dados</strong></div>
        <div>· Gmail API v1 (lib/google-gmail.js) · OAuth refresh_token por sócio</div>
        <div>· Janela: dia BRT inteiro</div>
        <div>· Classificação: heurística regex (alta confiança) + Claude CLI batch (ambíguos)</div>
        <div style="margin-top:.5rem"><strong>Performance</strong></div>
        <div>· Coleta Gmail: ${meta.duracoes_ms?.coleta ? (meta.duracoes_ms.coleta / 1000).toFixed(1) + 's' : '—'}</div>
        <div>· Classificação LLM: ${meta.duracoes_ms?.classificacao_llm ? (meta.duracoes_ms.classificacao_llm / 1000).toFixed(1) + 's' : '—'}</div>
        <div>· Priorização Top 3: ${meta.duracoes_ms?.top3 ? (meta.duracoes_ms.top3 / 1000).toFixed(1) + 's' : '—'}</div>
        <div>· Total: ${meta.duracoes_ms?.total ? (meta.duracoes_ms.total / 1000).toFixed(1) + 's' : '—'}</div>
        ${meta.top3_motivo ? `<div>· Top 3 método: ${esc(meta.top3_motivo)}</div>` : ''}
      </div>
    </details>

    <footer class="page-footer">
      Pinguim OS · Triagem de Emails Diária · gerado ${esc(dataFmt)} BRT
      <span class="fundamento">Estrutura baseada em Inbox Zero (Mann), GTD (Allen), 4HWW (Ferriss), A World Without Email (Newport) e HBR — How to Brief a Senior Executive.</span>
    </footer>
  </div>

  <div id="toast-container" aria-live="polite" aria-atomic="true"></div>

  <script>
  (function() {
    'use strict';

    // ============================================================
    // V3 — Lógica interativa: ações Gmail diretamente do relatório
    // Endpoint: POST /api/relatorio/triagem-acao
    // ============================================================

    const CLIENTE_ID = document.body.getAttribute('data-cliente-id') || null;

    // Op inversa pra desfazer (usada no toast "desfazer")
    const OP_INVERSA = {
      'arquivar': 'unarchive',
      'lido_arquivar': 'unread_unarchive',
      'starred': 'unstarred',
      'unstarred': 'starred',
      'lixo': 'untrash',
    };

    // Op pra label humano
    const OP_LABEL = {
      'arquivar': 'arquivado',
      'lido_arquivar': 'arquivado',
      'starred': 'marcado como importante',
      'unstarred': 'estrela removida',
      'lixo': 'movido pra Lixeira',
      'unarchive': 'restaurado',
      'unread_unarchive': 'restaurado',
      'untrash': 'restaurado',
    };

    // ============================================================
    // Helper: atualiza contagem do balde + chip do topo
    // ============================================================
    function atualizarContagens() {
      // V5.1 — Conta items visíveis em TODOS os baldes do DOM (inclui custom dinâmicos)
      const baldes = document.querySelectorAll('[data-balde-slug]');
      baldes.forEach(balde => {
        const slug = balde.getAttribute('data-balde-slug');
        if (!slug) return;
        const items = balde.querySelectorAll('.balde-item:not(.is-removendo)');
        const count = items.length;
        const elCount = balde.querySelector('[data-count-do-balde="' + slug + '"]');
        if (elCount) elCount.textContent = count;
        const chipCount = document.querySelector('.resumo-chip[data-balde="' + slug + '"] .resumo-count');
        if (chipCount) chipCount.textContent = count;
        const chip = document.querySelector('.resumo-chip[data-balde="' + slug + '"]');
        if (chip) {
          if (count === 0) chip.classList.add('is-vazio');
          else chip.classList.remove('is-vazio');
        }
      });
      // Top 3 (hoje)
      const top3Cards = document.querySelectorAll('.top3-card:not(.is-removendo)');
      const chipHoje = document.querySelector('.resumo-chip[data-balde="hoje"] .resumo-count');
      if (chipHoje) chipHoje.textContent = top3Cards.length;
    }

    // ============================================================
    // Toast — feedback visual
    // ============================================================
    function mostrarToast({ msg, tipo = 'sucesso', undoFn = null, duracao = 6000 }) {
      const cont = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + (tipo === 'erro' ? 'is-erro' : '');
      const msgHtml = document.createElement('div');
      msgHtml.className = 'toast-msg';
      msgHtml.innerHTML = msg;
      const acoes = document.createElement('div');
      acoes.className = 'toast-acoes';
      if (undoFn) {
        const btnUndo = document.createElement('button');
        btnUndo.className = 'toast-btn';
        btnUndo.textContent = 'desfazer';
        btnUndo.onclick = () => {
          fecharToast(toast);
          undoFn();
        };
        acoes.appendChild(btnUndo);
      }
      const btnX = document.createElement('button');
      btnX.className = 'toast-btn toast-btn-fechar';
      btnX.textContent = '✕';
      btnX.onclick = () => fecharToast(toast);
      acoes.appendChild(btnX);
      toast.appendChild(msgHtml);
      toast.appendChild(acoes);
      cont.appendChild(toast);
      // Trigger animação
      requestAnimationFrame(() => toast.classList.add('is-shown'));
      // Auto-hide
      const timer = setTimeout(() => fecharToast(toast), duracao);
      toast._timer = timer;
    }
    function fecharToast(toast) {
      if (!toast) return;
      if (toast._timer) clearTimeout(toast._timer);
      toast.classList.remove('is-shown');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 280);
    }

    // ============================================================
    // Executar ação no backend
    // ============================================================
    async function executarAcao(messageIds, op) {
      const resp = await fetch('/api/relatorio/triagem-acao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: CLIENTE_ID, messageIds, op }),
      });
      const data = await resp.json();
      return data;
    }

    // ============================================================
    // Helpers DOM — esconder/mostrar items
    // ============================================================
    function acharItemPorId(messageId) {
      return document.querySelector('[data-message-id="' + messageId + '"]');
    }
    function esconderItem(item) {
      item.classList.add('is-removendo');
    }
    function mostrarItem(item) {
      item.classList.remove('is-removendo');
    }

    // ============================================================
    // Ação INDIVIDUAL (1 email)
    // ============================================================
    async function acaoIndividual(messageId, op, btn) {
      const item = acharItemPorId(messageId);
      if (!item) return;

      // Confirmação pra ação destrutiva (lixo)
      if (op === 'lixo') {
        const ok = window.confirm('Mover esse email pra Lixeira do Gmail?\\n\\n(Fica 30 dias na lixeira, pode recuperar.)');
        if (!ok) return;
      }

      // Desabilita botão
      if (btn) btn.disabled = true;
      esconderItem(item);

      try {
        const r = await executarAcao([messageId], op);
        if (!r.ok && r.falhas > 0) throw new Error(r.detalhes?.[0]?.erro || 'falha');

        // Sucesso — atualiza contagens
        atualizarContagens();

        const labelOp = OP_LABEL[op] || op;
        const podeDesfazer = !!OP_INVERSA[op] && op !== 'lixo'; // lixo já tem confirm, sem desfazer no toast

        mostrarToast({
          msg: '<strong>✓</strong> 1 email ' + labelOp,
          tipo: 'sucesso',
          undoFn: podeDesfazer ? async () => {
            const opInv = OP_INVERSA[op];
            // Mostra de novo, manda desfazer
            mostrarItem(item);
            atualizarContagens();
            const rUndo = await executarAcao([messageId], opInv);
            if (!rUndo.ok) {
              // Falhou desfazer — esconde de novo e avisa
              esconderItem(item);
              atualizarContagens();
              mostrarToast({ msg: '<strong>⚠</strong> Falha ao desfazer', tipo: 'erro' });
            }
          } : null,
        });
      } catch (e) {
        // Falhou — REAPARECE item, avisa
        mostrarItem(item);
        atualizarContagens();
        if (btn) btn.disabled = false;
        mostrarToast({ msg: '<strong>⚠</strong> Falha ao ' + (OP_LABEL[op] || op) + ' — tente de novo', tipo: 'erro' });
      }
    }

    // ============================================================
    // Ação EM MASSA (todos do balde)
    // ============================================================
    async function acaoEmMassa(slug, op, label, confirma) {
      const balde = document.querySelector('[data-balde-slug="' + slug + '"]');
      if (!balde) return;
      const items = Array.from(balde.querySelectorAll('.balde-item:not(.is-removendo)'));
      if (items.length === 0) return;

      if (confirma) {
        const acaoTxt = op === 'lixo' ? 'mover pra Lixeira do Gmail' :
                        op === 'arquivar' ? 'arquivar' :
                        op === 'lido_arquivar' ? 'marcar como lido e arquivar' : op;
        const ok = window.confirm('Vai ' + acaoTxt + ' ' + items.length + ' email' + (items.length > 1 ? 's' : '') + '. Continuar?');
        if (!ok) return;
      }

      const ids = items.map(it => it.getAttribute('data-message-id')).filter(Boolean);
      items.forEach(esconderItem);

      try {
        const r = await executarAcao(ids, op);
        atualizarContagens();

        const labelOp = OP_LABEL[op] || op;
        const sucessos = r.sucessos || 0;
        const falhas = r.falhas || 0;
        const podeDesfazer = !!OP_INVERSA[op] && op !== 'lixo';

        if (falhas > 0 && sucessos === 0) {
          // Tudo falhou — reaparece
          items.forEach(mostrarItem);
          atualizarContagens();
          mostrarToast({ msg: '<strong>⚠</strong> Falha ao ' + labelOp + ' os ' + items.length + ' emails', tipo: 'erro' });
          return;
        }

        const idsSucesso = (r.detalhes || []).filter(d => d.ok).map(d => d.messageId);
        const idsFalha = (r.detalhes || []).filter(d => !d.ok).map(d => d.messageId);

        // Reaparece os que falharam
        idsFalha.forEach(id => {
          const it = acharItemPorId(id);
          if (it) mostrarItem(it);
        });
        atualizarContagens();

        let msg = '<strong>✓</strong> ' + sucessos + ' email' + (sucessos > 1 ? 's' : '') + ' ' + labelOp;
        if (falhas > 0) msg += ' · ' + falhas + ' falharam';

        mostrarToast({
          msg,
          tipo: falhas > 0 ? 'erro' : 'sucesso',
          undoFn: podeDesfazer && idsSucesso.length > 0 ? async () => {
            const opInv = OP_INVERSA[op];
            idsSucesso.forEach(id => { const it = acharItemPorId(id); if (it) mostrarItem(it); });
            atualizarContagens();
            const rUndo = await executarAcao(idsSucesso, opInv);
            if (!rUndo.ok) {
              idsSucesso.forEach(id => { const it = acharItemPorId(id); if (it) esconderItem(it); });
              atualizarContagens();
              mostrarToast({ msg: '<strong>⚠</strong> Falha ao desfazer', tipo: 'erro' });
            }
          } : null,
        });
      } catch (e) {
        items.forEach(mostrarItem);
        atualizarContagens();
        mostrarToast({ msg: '<strong>⚠</strong> Erro: ' + (e.message || 'desconhecido'), tipo: 'erro' });
      }
    }

    // ============================================================
    // V4 — Expandir item pra ver corpo completo (lazy load)
    // ============================================================
    const corpoCache = new Map(); // messageId → {texto, snippet, ...}

    async function toggleExpandir(item) {
      if (!item) return;
      const messageId = item.getAttribute('data-message-id');
      if (!messageId) return;
      const expandido = item.classList.contains('is-expandido');
      if (expandido) {
        item.classList.remove('is-expandido');
        return;
      }
      // Expandir
      item.classList.add('is-expandido');
      const corpoEl = item.querySelector('[data-corpo-expandido]');
      if (!corpoEl) return;

      // Se já carregado, não busca de novo
      if (corpoCache.has(messageId)) {
        renderCorpo(corpoEl, corpoCache.get(messageId));
        return;
      }
      corpoEl.innerHTML = '<div class="corpo-loading">carregando…</div>';
      try {
        const resp = await fetch('/api/relatorio/triagem-corpo-completo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: CLIENTE_ID, messageId }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'falha ao ler email');
        corpoCache.set(messageId, data);
        renderCorpo(corpoEl, data);
      } catch (e) {
        corpoEl.innerHTML = '<div class="corpo-loading corpo-erro">⚠ Falha ao carregar: ' + (e.message || 'erro desconhecido') + '</div>';
      }
    }

    function renderCorpo(corpoEl, data) {
      const texto = data.texto || data.snippet || '(corpo vazio)';
      // Limita a ~2500 chars no render, mas mantém botão pra Gmail web ver tudo
      const limitado = texto.length > 2500 ? texto.slice(0, 2500) + '\\n\\n… (truncado, abra no Gmail pra ver completo)' : texto;
      corpoEl.textContent = limitado;
    }

    // ============================================================
    // Event delegation — botões de ação (individuais + em massa)
    // ============================================================
    document.addEventListener('click', function(ev) {
      // V5 — Botão reclassificar abre dropdown
      const btnReclass = ev.target.closest('.btn-acao-reclassificar');
      if (btnReclass) {
        ev.preventDefault();
        ev.stopPropagation();
        const item = btnReclass.closest('[data-message-id]');
        if (item) abrirDropdownReclassificar(item, btnReclass);
        return;
      }

      // V5 — Click fora do dropdown fecha
      if (!ev.target.closest('.reclassificar-dropdown')) {
        fecharDropdownsAbertos();
      }

      // V4 — toggle expandir (clique na área clicável OU botão "ver mais")
      const toggleEl = ev.target.closest('[data-toggle-expandir]');
      if (toggleEl) {
        // Mas se o clique foi num botão de ação ou link, ignora
        if (ev.target.closest('.btn-acao:not(.btn-acao-vermais)') || ev.target.closest('.btn-gmail') || ev.target.closest('.btn-massa')) {
          // deixa o handler abaixo cuidar
        } else {
          ev.preventDefault();
          ev.stopPropagation();
          const item = toggleEl.closest('[data-message-id]');
          toggleExpandir(item);
          return;
        }
      }

      const btn = ev.target.closest('.btn-acao');
      if (btn && !btn.classList.contains('btn-acao-vermais') && !btn.classList.contains('btn-acao-reclassificar')) {
        ev.preventDefault();
        ev.stopPropagation();
        const op = btn.getAttribute('data-op');
        const item = btn.closest('[data-message-id]');
        if (!item || !op) return;
        const messageId = item.getAttribute('data-message-id');
        acaoIndividual(messageId, op, btn);
        return;
      }
      const btnMassa = ev.target.closest('.btn-massa');
      if (btnMassa) {
        ev.preventDefault();
        ev.stopPropagation();
        const slug = btnMassa.getAttribute('data-balde');
        const op = btnMassa.getAttribute('data-op');
        const label = btnMassa.getAttribute('data-label');
        const confirma = btnMassa.getAttribute('data-confirma') === '1';
        acaoEmMassa(slug, op, label, confirma);
        return;
      }
    });

    // ============================================================
    // V5 — Reclassificar item + criar balde novo
    // ============================================================
    const BALDES_NATIVOS_UI = [
      { slug: 'responder_hoje', icone: '🔴', nome: 'Responder hoje' },
      { slug: 'decidir',        icone: '✋', nome: 'Esperando sua decisão' },
      { slug: 'pagar',          icone: '💸', nome: 'Financeiro' },
      { slug: 'delegar',        icone: '🤝', nome: 'Pode delegar' },
      { slug: 'acompanhar',     icone: '⏳', nome: 'Aguardando resposta' },
      { slug: 'arquivar',       icone: '📦', nome: 'Arquivar' },
    ];

    // Baldes custom já vêm no DOM em <details data-balde-slug=...> (renderizados pelo backend)
    function listarBaldesCustomDoDOM() {
      const sec = document.querySelectorAll('details.bloco-balde[data-balde-slug]');
      const customs = [];
      for (const s of sec) {
        const slug = s.getAttribute('data-balde-slug');
        if (!BALDES_NATIVOS_UI.find(b => b.slug === slug)) {
          const titulo = s.querySelector('.balde-titulo');
          const icone = s.querySelector('.balde-icone')?.textContent || '🏷';
          const nome = titulo ? titulo.childNodes[1]?.textContent?.trim() || slug : slug;
          customs.push({ slug, icone, nome });
        }
      }
      return customs;
    }

    function fecharDropdownsAbertos() {
      document.querySelectorAll('.reclassificar-dropdown').forEach(d => d.remove());
    }

    function abrirDropdownReclassificar(item, btn) {
      fecharDropdownsAbertos();
      const baldeAtual = item.getAttribute('data-balde-atual') || '';
      const baldes = [...BALDES_NATIVOS_UI, ...listarBaldesCustomDoDOM()];

      const dropdown = document.createElement('div');
      dropdown.className = 'reclassificar-dropdown';
      dropdown.innerHTML = '<div class="reclassificar-titulo">Mover pra:</div>' +
        baldes.map(b => {
          const isAtual = b.slug === baldeAtual;
          return '<button class="reclassificar-opcao' + (isAtual ? ' is-atual' : '') + '" data-balde-novo="' + b.slug + '"' + (isAtual ? ' disabled' : '') + '>' +
                 '<span>' + b.icone + '</span><span>' + b.nome + '</span>' +
                 '</button>';
        }).join('') +
        '<button class="reclassificar-opcao is-novo" data-acao="criar-balde-novo">+ Criar balde novo…</button>';

      // Posiciona dropdown no BODY com position fixed (evita ser cortado por overflow:hidden de ancestrais)
      document.body.appendChild(dropdown);
      const rect = btn.getBoundingClientRect();
      // Tenta alinhar à direita do botão; se passar da viewport, alinha à direita da janela
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Mede depois de inserir (precisa estar no DOM pra ter width)
      const ddRect = dropdown.getBoundingClientRect();
      let left = rect.right - ddRect.width;
      if (left < 8) left = 8;
      if (left + ddRect.width > vw - 8) left = vw - ddRect.width - 8;
      let top = rect.bottom + 6;
      // Se não couber pra baixo, abre pra cima
      if (top + ddRect.height > vh - 8 && rect.top - ddRect.height - 6 > 8) {
        top = rect.top - ddRect.height - 6;
      }
      dropdown.style.left = left + 'px';
      dropdown.style.top = top + 'px';

      // Click handler
      dropdown.addEventListener('click', function(ev) {
        const opcao = ev.target.closest('.reclassificar-opcao');
        if (!opcao || opcao.disabled) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (opcao.getAttribute('data-acao') === 'criar-balde-novo') {
          fecharDropdownsAbertos();
          abrirModalCriarBalde(item);
          return;
        }
        const baldeNovo = opcao.getAttribute('data-balde-novo');
        reclassificarItem(item, baldeNovo);
        fecharDropdownsAbertos();
      });
    }

    async function reclassificarItem(item, baldeNovo) {
      const messageId = item.getAttribute('data-message-id');
      const baldeAntigo = item.getAttribute('data-balde-atual');
      if (!messageId || !baldeNovo || baldeNovo === baldeAntigo) return;

      const assunto = item.getAttribute('data-assunto') || '';
      const snippet = item.getAttribute('data-snippet') || '';
      const remetenteEmail = item.getAttribute('data-remetente-email') || '';
      const remetenteNome = item.getAttribute('data-remetente-nome') || '';

      // V5.1 — Move o item visualmente pro balde novo (clona pra nova seção + esconde no antigo)
      // Garante que o balde novo exista no DOM (cria seção vazia se for custom novo)
      garantirSecaoBalde(baldeNovo);
      moverItemParaBalde(item, baldeNovo);
      atualizarContagens();

      try {
        const resp = await fetch('/api/relatorio/triagem-reclassificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente_id: CLIENTE_ID,
            messageId, balde_antigo: baldeAntigo, balde_novo: baldeNovo,
            assunto, snippet, remetente_email: remetenteEmail, remetente_nome: remetenteNome,
          }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'falha');

        const todosBaldes = [...BALDES_NATIVOS_UI, ...listarBaldesCustomDoDOM()];
        const baldeNomeNovo = todosBaldes.find(b => b.slug === baldeNovo)?.nome || baldeNovo;
        mostrarToast({
          msg: '<strong>✓</strong> Movido pra "' + baldeNomeNovo + '" · próxima triagem aprende',
          tipo: 'sucesso',
          undoFn: async () => {
            // Volta pro balde antigo
            moverItemParaBalde(item, baldeAntigo);
            atualizarContagens();
            // Não desfaz aprendizado no banco (decisão: histórico mantém)
          },
        });
      } catch (e) {
        // Falhou — devolve pro balde antigo + erro
        moverItemParaBalde(item, baldeAntigo);
        atualizarContagens();
        mostrarToast({ msg: '<strong>⚠</strong> Falha ao reclassificar: ' + (e.message || 'desconhecido'), tipo: 'erro' });
      }
    }

    // V5.1 — Move item entre baldes no DOM (clona pra novo balde, remove do antigo)
    function moverItemParaBalde(item, baldeDestinoSlug) {
      const baldeDestino = document.querySelector('[data-balde-slug="' + baldeDestinoSlug + '"]');
      if (!baldeDestino) {
        console.error('[moverItem] balde destino não encontrado:', baldeDestinoSlug);
        esconderItem(item);
        return;
      }
      const listaDestino = baldeDestino.querySelector('.balde-lista');
      if (!listaDestino) {
        console.error('[moverItem] lista do balde destino não encontrada:', baldeDestinoSlug);
        esconderItem(item);
        return;
      }
      // Atualiza data-balde-atual + move item
      item.setAttribute('data-balde-atual', baldeDestinoSlug);
      item.classList.remove('is-removendo');
      // Se o item ainda está no antigo, remove fisicamente e adiciona no novo
      if (item.parentNode !== listaDestino) {
        if (item.parentNode) item.parentNode.removeChild(item);
        listaDestino.appendChild(item);
      }
      // Abre o balde destino pro sócio ver o item chegar
      if (baldeDestino.tagName === 'DETAILS' && !baldeDestino.open) {
        baldeDestino.open = true;
      }
    }

    // V5.1 — Garante que existe <section> visual pro balde (cria dinamicamente se for custom novo)
    function garantirSecaoBalde(slug) {
      if (document.querySelector('[data-balde-slug="' + slug + '"]')) return; // já existe

      // Busca metadados do balde no menu de reclassificar (que foi populado com baldes custom recém-criados)
      // Como fallback, usa slug como nome
      const dropdownOptions = document.querySelectorAll('.reclassificar-opcao[data-balde-novo="' + slug + '"]');
      let nome = slug, icone = '🏷', descricao = '';
      // Tenta achar no cache local do JS
      if (BALDES_CUSTOM_RUNTIME[slug]) {
        nome = BALDES_CUSTOM_RUNTIME[slug].nome;
        icone = BALDES_CUSTOM_RUNTIME[slug].icone;
        descricao = BALDES_CUSTOM_RUNTIME[slug].descricao || '';
      }

      const idBalde = 'balde-' + slug;
      const section = document.createElement('details');
      section.className = 'bloco-balde';
      section.id = idBalde;
      section.setAttribute('data-balde-slug', slug);
      section.open = true;
      section.innerHTML = ''
        + '<summary class="balde-summary">'
        + '  <h3 class="balde-titulo"><span class="balde-icone">' + icone + '</span> ' + nome + ' <span class="balde-count" data-count-do-balde="' + slug + '">0</span></h3>'
        + '  <span class="balde-toggle">▾</span>'
        + '</summary>'
        + (descricao ? '<div class="balde-descricao">' + descricao + '</div>' : '')
        + '<div class="balde-corpo">'
        + '  <ul class="balde-lista"></ul>'
        + '</div>';

      // Insere ANTES do balde "arquivar" (último visual)
      const baldeArquivar = document.querySelector('[data-balde-slug="arquivar"]');
      if (baldeArquivar && baldeArquivar.parentNode) {
        baldeArquivar.parentNode.insertBefore(section, baldeArquivar);
      } else {
        // fallback: insere antes do toggle-md
        const btnToggleMd = document.getElementById('btn-toggle-md');
        if (btnToggleMd && btnToggleMd.parentNode) {
          btnToggleMd.parentNode.insertBefore(section, btnToggleMd);
        } else {
          document.querySelector('.container').appendChild(section);
        }
      }

      // Adiciona chip no resumo do topo
      const resumo = document.querySelector('.resumo-contagem');
      if (resumo) {
        const chipArquivar = resumo.querySelector('.resumo-chip[data-balde="arquivar"]');
        const chipNovo = document.createElement('a');
        chipNovo.className = 'resumo-chip is-vazio';
        chipNovo.setAttribute('href', '#' + idBalde);
        chipNovo.setAttribute('data-balde', slug);
        chipNovo.innerHTML = '<span class="resumo-icon">' + icone + '</span>'
                          + '<span class="resumo-count">0</span>'
                          + '<span class="resumo-label">' + (nome.toLowerCase().slice(0, 18)) + '</span>';
        // Smooth scroll handler (igual aos outros chips)
        chipNovo.addEventListener('click', function(ev) {
          ev.preventDefault();
          if (section.tagName === 'DETAILS' && !section.open) section.open = true;
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        if (chipArquivar) {
          resumo.insertBefore(chipNovo, chipArquivar);
        } else {
          resumo.appendChild(chipNovo);
        }
      }
    }

    // Cache de baldes custom criados em runtime (preenchido por criarBaldeNovo antes de garantirSecaoBalde)
    const BALDES_CUSTOM_RUNTIME = {};

    // ============================================================
    // Modal de criar balde novo
    // ============================================================
    function abrirModalCriarBalde(itemTrigger) {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = ''
        + '<div class="modal-conteudo">'
        + '  <div class="modal-titulo">Criar balde novo</div>'
        + '  <div class="modal-sub">Cria uma categoria pessoal pro seu sistema. Aparece em todas próximas triagens.</div>'
        + '  <div class="modal-campo">'
        + '    <label for="balde-nome">Nome</label>'
        + '    <input type="text" id="balde-nome" placeholder="Ex: Notificação de venda" maxlength="50" />'
        + '  </div>'
        + '  <div class="modal-campo">'
        + '    <label for="balde-icone">Ícone (emoji)</label>'
        + '    <input type="text" id="balde-icone" value="🏷" maxlength="4" />'
        + '  </div>'
        + '  <div class="modal-campo">'
        + '    <label for="balde-descricao">Descrição curta</label>'
        + '    <input type="text" id="balde-descricao" placeholder="Quando esse balde se aplica" maxlength="200" />'
        + '    <span class="hint">Aparece embaixo do header pra ajudar a IA classificar corretamente.</span>'
        + '  </div>'
        + '  <div class="modal-acoes">'
        + '    <button type="button" class="modal-btn modal-btn-secundario" data-acao="cancelar">Cancelar</button>'
        + '    <button type="button" class="modal-btn modal-btn-principal" data-acao="criar">Criar e mover este email</button>'
        + '  </div>'
        + '</div>';

      // Click no backdrop (fora do modal-conteudo) fecha
      backdrop.addEventListener('click', function(ev) {
        if (ev.target === backdrop) {
          backdrop.remove();
        }
      });

      // Click nos botões do modal — handler dedicado, sem stopPropagation no DOM
      backdrop.querySelectorAll('.modal-btn').forEach(btn => {
        btn.addEventListener('click', function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          const acao = btn.getAttribute('data-acao');
          if (acao === 'cancelar') {
            backdrop.remove();
            return;
          }
          if (acao === 'criar') {
            const nome = backdrop.querySelector('#balde-nome').value.trim();
            const icone = backdrop.querySelector('#balde-icone').value.trim() || '🏷';
            const descricao = backdrop.querySelector('#balde-descricao').value.trim();
            if (!nome) {
              backdrop.querySelector('#balde-nome').focus();
              return;
            }
            btn.disabled = true;
            btn.textContent = 'Criando…';
            const slug = nome.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
            criarBaldeNovo({ slug, nome, icone, descricao, itemTrigger, backdrop, btn });
          }
        });
      });

      document.body.appendChild(backdrop);
      setTimeout(() => backdrop.querySelector('#balde-nome')?.focus(), 50);
    }

    async function criarBaldeNovo({ slug, nome, icone, descricao, itemTrigger, backdrop, btn }) {
      let data = null;
      let erroChamada = null;
      try {
        const resp = await fetch('/api/relatorio/triagem-balde-novo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: CLIENTE_ID, slug, nome, icone, descricao }),
        });
        data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'falha');
      } catch (e) {
        erroChamada = e;
        console.error('[criarBaldeNovo] fetch erro:', e);
      }

      // SEMPRE fecha o modal — independente de sucesso/falha
      if (backdrop && backdrop.parentNode) backdrop.remove();

      if (erroChamada || !data || !data.ok) {
        try { mostrarToast({ msg: '<strong>⚠</strong> Falha ao criar balde: ' + (erroChamada?.message || 'desconhecido'), tipo: 'erro' }); } catch (_) {}
        return;
      }

      // V5.1 — Registra balde novo no cache runtime ANTES de reclassificar
      // (garantirSecaoBalde vai usar isso pra criar a section visual)
      if (data.balde) {
        BALDES_CUSTOM_RUNTIME[data.balde.slug] = {
          slug: data.balde.slug,
          nome: data.balde.nome || nome,
          icone: data.balde.icone || icone,
          descricao: data.balde.descricao || descricao,
        };
      }

      // Sucesso — toast + reclassifica
      try {
        mostrarToast({
          msg: '<strong>✓</strong> Balde "' + nome + '" criado · aparece agora aqui na tela',
          tipo: 'sucesso',
        });
      } catch (e) { console.error('[criarBaldeNovo] mostrarToast erro:', e); }

      // Reclassifica item — protegido (vai criar a seção do balde dinamicamente)
      if (itemTrigger && data.balde && data.balde.slug) {
        try { await reclassificarItem(itemTrigger, data.balde.slug); }
        catch (e) { console.error('[criarBaldeNovo] reclassificarItem erro:', e); }
      }
    }

    // ============================================================
    // Toggle markdown
    // ============================================================
    const btnToggleMd = document.getElementById('btn-toggle-md');
    if (btnToggleMd) {
      btnToggleMd.addEventListener('click', function() {
        const c = document.getElementById('conteudo-md');
        c.classList.toggle('mostrar');
        this.textContent = c.classList.contains('mostrar') ? 'esconder versão markdown' : 'ver versão markdown (para WhatsApp/chat)';
      });
    }

    // ============================================================
    // Smooth scroll pros chips de contagem
    // ============================================================
    document.querySelectorAll('.resumo-chip').forEach(chip => {
      chip.addEventListener('click', function(ev) {
        const href = this.getAttribute('href');
        if (!href || !href.startsWith('#')) return;
        const target = document.getElementById(href.slice(1));
        if (target) {
          ev.preventDefault();
          // Se for um <details> fechado, abre primeiro
          if (target.tagName === 'DETAILS' && !target.open) target.open = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  })();
  </script>
</body>
</html>`;
}

module.exports = { renderRelatorioTriagemEmails };
