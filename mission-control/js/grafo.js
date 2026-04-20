/* Grafo Fluxo — cards horizontais conectados por linhas dashed animadas.
   Refatorado 2026-04-20 após review Rauno + Karri + Brad.
   Layout: Produto (centro esquerda) → Tipos (coluna meio) → Peças (coluna direita).
   Tokens CSS lidos via cssVar() — multi-tenant ready.
*/

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#71717A';
}

const LABEL_TIPO = {
  aula: 'Aulas',
  pagina_venda: 'Páginas',
  persona: 'Persona',
  objecao: 'Objeções',
  depoimento: 'Depoimentos',
  sacada: 'Sacadas',
  externo: 'Externos',
  csv: 'CSV',
  pitch: 'Pitch',
  faq: 'FAQ',
  outro: 'Outros'
};

const ICONE_TIPO = {
  aula: '📚',
  pagina_venda: '📄',
  persona: '👤',
  objecao: '❓',
  depoimento: '⭐',
  sacada: '💡',
  externo: '🔗',
  csv: '📊',
  pitch: '🎯',
  faq: '📖',
  outro: '📦'
};

function tipoColor(tipo) { return cssVar('--peca-' + tipo.replace('_', '-')) || cssVar('--peca-outro'); }
function tipoBg(tipo)    { return cssVar('--peca-' + tipo.replace('_', '-') + '-bg') || cssVar('--peca-outro-bg'); }

/** Desenha uma curva Bezier horizontal entre 2 pontos */
function bezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const cpOffset = Math.max(dx * 0.5, 40);
  return `M ${x1},${y1} C ${x1 + cpOffset},${y1} ${x2 - cpOffset},${y2} ${x2},${y2}`;
}

export function renderGrafo(container, { produto, pecas }, onNodeClick) {
  container.innerHTML = '';
  container.setAttribute('data-mode', 'fluxo');

  // Stylesheet embutido (animação de flow)
  const style = document.createElement('style');
  style.textContent = `
    .fluxo-edge {
      stroke: ${cssVar('--edge-default')};
      stroke-width: 1.5;
      fill: none;
      opacity: 0.35;
      stroke-dasharray: 5 5;
      animation: flow-dashes 1.4s linear infinite;
      transition: opacity .2s, stroke .2s;
    }
    .fluxo-edge.active {
      stroke: ${cssVar('--edge-animated')};
      opacity: 0.9;
      stroke-width: 2;
    }
    .fluxo-edge.dimmed { opacity: 0.08; }
    @keyframes flow-dashes {
      to { stroke-dashoffset: -20; }
    }
    .fluxo-node {
      cursor: pointer;
      transition: transform .15s ease-out, opacity .2s;
    }
    .fluxo-node .node-ring {
      stroke: ${cssVar('--border')};
      stroke-width: 1;
      fill: ${cssVar('--surface-2')};
      transition: stroke .15s, stroke-width .15s;
    }
    .fluxo-node .node-title {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-weight: 700;
      font-size: 13px;
      fill: ${cssVar('--fg-title')};
    }
    .fluxo-node .node-sub {
      font-family: 'Inter', sans-serif;
      font-weight: 400;
      font-size: 11px;
      fill: ${cssVar('--fg-muted')};
    }
    .fluxo-node .node-badge {
      font-family: ui-monospace, monospace;
      font-size: 10px;
      font-weight: 600;
    }
    .fluxo-node:hover .node-ring {
      stroke: ${cssVar('--pc')};
      stroke-width: 2;
    }
    .fluxo-node.dimmed { opacity: 0.35; }
    .fluxo-node.active .node-ring {
      stroke: ${cssVar('--pc')};
      stroke-width: 2.5;
    }
    .node-produto .node-card {
      fill: ${cssVar('--pc-subtle')};
      stroke: ${cssVar('--pc')};
      stroke-width: 2;
    }
    .node-produto .node-title { fill: ${cssVar('--pc-strong')}; fill-opacity: 1; font-weight: 800; font-size: 16px; }
    .node-produto .node-sub   { fill: ${cssVar('--pc-strong')}; fill-opacity: 0.7; }
    @media (prefers-reduced-motion: reduce) {
      .fluxo-edge { animation: none; }
    }
  `;
  container.appendChild(style);

  // Dimensões do canvas
  const W = container.clientWidth || 900;
  const H = container.clientHeight || 560;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.classList.add('grafo-svg');

  // --- Agrupar peças por tipo ---
  const tipos = {};
  pecas.forEach(p => {
    if (!tipos[p.tipo]) tipos[p.tipo] = [];
    tipos[p.tipo].push(p);
  });
  const tipoKeys = Object.keys(tipos).sort((a, b) => tipos[b].length - tipos[a].length);

  // --- Layout de 3 colunas ---
  const COL1_X = 120;           // Produto
  const COL2_X = W * 0.42;      // Tipos (hub)
  const COL3_X = W * 0.78;      // Peças
  const PRODUTO_W = 200, PRODUTO_H = 88;
  const TIPO_W = 180, TIPO_H = 54;
  const PECA_W = 220, PECA_H = 50;

  // Espaçamento vertical dos tipos
  const totalTipos = tipoKeys.length;
  const tipoGap = 18;
  const totalTipoH = totalTipos * TIPO_H + (totalTipos - 1) * tipoGap;
  const tipoStartY = (H - totalTipoH) / 2;

  const gEdges = document.createElementNS(svgNS, 'g');
  const gNodes = document.createElementNS(svgNS, 'g');
  svg.appendChild(gEdges);
  svg.appendChild(gNodes);

  // --- Nó Produto (centro esquerda) ---
  const produtoY = H / 2 - PRODUTO_H / 2;
  const produtoG = document.createElementNS(svgNS, 'g');
  produtoG.classList.add('fluxo-node', 'node-produto');
  produtoG.setAttribute('data-id', 'produto-root');

  const produtoRect = document.createElementNS(svgNS, 'rect');
  produtoRect.classList.add('node-card');
  produtoRect.setAttribute('x', COL1_X);
  produtoRect.setAttribute('y', produtoY);
  produtoRect.setAttribute('width', PRODUTO_W);
  produtoRect.setAttribute('height', PRODUTO_H);
  produtoRect.setAttribute('rx', 14);
  produtoG.appendChild(produtoRect);

  const produtoEmoji = document.createElementNS(svgNS, 'text');
  produtoEmoji.setAttribute('x', COL1_X + 20);
  produtoEmoji.setAttribute('y', produtoY + PRODUTO_H / 2 + 2);
  produtoEmoji.setAttribute('text-anchor', 'middle');
  produtoEmoji.setAttribute('font-size', '26');
  produtoEmoji.textContent = produto.emoji || '📦';
  produtoG.appendChild(produtoEmoji);

  const produtoTitle = document.createElementNS(svgNS, 'text');
  produtoTitle.classList.add('node-title');
  produtoTitle.setAttribute('x', COL1_X + 48);
  produtoTitle.setAttribute('y', produtoY + 36);
  produtoTitle.textContent = produto.nome || '—';
  produtoG.appendChild(produtoTitle);

  const produtoSub = document.createElementNS(svgNS, 'text');
  produtoSub.classList.add('node-sub');
  produtoSub.setAttribute('x', COL1_X + 48);
  produtoSub.setAttribute('y', produtoY + 56);
  produtoSub.textContent = `${pecas.length} peças · ${tipoKeys.length} tipos`;
  produtoG.appendChild(produtoSub);

  const produtoPct = document.createElementNS(svgNS, 'text');
  produtoPct.classList.add('node-sub');
  produtoPct.setAttribute('x', COL1_X + 48);
  produtoPct.setAttribute('y', produtoY + 72);
  produtoPct.textContent = `Preenchimento: ${produto.preenchimento_pct || 0}%`;
  produtoG.appendChild(produtoPct);

  gNodes.appendChild(produtoG);

  const produtoAnchor = { x: COL1_X + PRODUTO_W, y: produtoY + PRODUTO_H / 2 };

  // --- Nós de TIPO (coluna do meio) ---
  const tipoNodes = {};
  tipoKeys.forEach((tipo, idx) => {
    const y = tipoStartY + idx * (TIPO_H + tipoGap);
    const g = document.createElementNS(svgNS, 'g');
    g.classList.add('fluxo-node');
    g.setAttribute('data-id', 'tipo-' + tipo);

    const rect = document.createElementNS(svgNS, 'rect');
    rect.classList.add('node-ring');
    rect.setAttribute('x', COL2_X);
    rect.setAttribute('y', y);
    rect.setAttribute('width', TIPO_W);
    rect.setAttribute('height', TIPO_H);
    rect.setAttribute('rx', 12);
    rect.setAttribute('fill', tipoBg(tipo));
    rect.setAttribute('stroke', tipoColor(tipo));
    rect.setAttribute('stroke-width', '1.5');
    g.appendChild(rect);

    const icon = document.createElementNS(svgNS, 'text');
    icon.setAttribute('x', COL2_X + 18);
    icon.setAttribute('y', y + TIPO_H / 2 + 5);
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('font-size', '18');
    icon.textContent = ICONE_TIPO[tipo] || '📦';
    g.appendChild(icon);

    const title = document.createElementNS(svgNS, 'text');
    title.classList.add('node-title');
    title.setAttribute('x', COL2_X + 38);
    title.setAttribute('y', y + 22);
    title.textContent = LABEL_TIPO[tipo] || tipo;
    g.appendChild(title);

    const sub = document.createElementNS(svgNS, 'text');
    sub.classList.add('node-sub');
    sub.setAttribute('x', COL2_X + 38);
    sub.setAttribute('y', y + 38);
    sub.textContent = `${tipos[tipo].length} ${tipos[tipo].length === 1 ? 'peça' : 'peças'}`;
    g.appendChild(sub);

    // Badge com contador no canto direito
    const badgeBg = document.createElementNS(svgNS, 'rect');
    badgeBg.setAttribute('x', COL2_X + TIPO_W - 38);
    badgeBg.setAttribute('y', y + TIPO_H / 2 - 11);
    badgeBg.setAttribute('width', 26);
    badgeBg.setAttribute('height', 22);
    badgeBg.setAttribute('rx', 6);
    badgeBg.setAttribute('fill', tipoColor(tipo));
    g.appendChild(badgeBg);

    const badgeTxt = document.createElementNS(svgNS, 'text');
    badgeTxt.classList.add('node-badge');
    badgeTxt.setAttribute('x', COL2_X + TIPO_W - 25);
    badgeTxt.setAttribute('y', y + TIPO_H / 2 + 4);
    badgeTxt.setAttribute('text-anchor', 'middle');
    badgeTxt.setAttribute('fill', '#fff');
    badgeTxt.textContent = String(tipos[tipo].length);
    g.appendChild(badgeTxt);

    gNodes.appendChild(g);

    tipoNodes[tipo] = {
      el: g,
      anchorLeft: { x: COL2_X, y: y + TIPO_H / 2 },
      anchorRight: { x: COL2_X + TIPO_W, y: y + TIPO_H / 2 },
    };
  });

  // --- Edge Produto → Tipo ---
  tipoKeys.forEach((tipo) => {
    const t = tipoNodes[tipo];
    const edge = document.createElementNS(svgNS, 'path');
    edge.classList.add('fluxo-edge');
    edge.setAttribute('d', bezierPath(produtoAnchor.x, produtoAnchor.y, t.anchorLeft.x, t.anchorLeft.y));
    edge.setAttribute('data-from', 'produto-root');
    edge.setAttribute('data-to', 'tipo-' + tipo);
    gEdges.appendChild(edge);
  });

  // --- Peças (coluna direita) — até 3 por tipo visíveis + "+N mais" ---
  const MAX_PECAS_VISIVEIS = 3;
  const PECA_GAP = 8;
  const pecaNodes = {};

  tipoKeys.forEach((tipo) => {
    const pecasTipo = tipos[tipo];
    const visiveis = pecasTipo.slice(0, MAX_PECAS_VISIVEIS);
    const overflow = pecasTipo.length - visiveis.length;

    const t = tipoNodes[tipo];
    const totalH = visiveis.length * PECA_H + (visiveis.length - 1) * PECA_GAP;
    const startY = t.anchorRight.y - totalH / 2;

    visiveis.forEach((peca, idx) => {
      const y = startY + idx * (PECA_H + PECA_GAP);
      const g = document.createElementNS(svgNS, 'g');
      g.classList.add('fluxo-node');
      g.setAttribute('data-id', 'peca-' + peca.id);

      const rect = document.createElementNS(svgNS, 'rect');
      rect.classList.add('node-ring');
      rect.setAttribute('x', COL3_X);
      rect.setAttribute('y', y);
      rect.setAttribute('width', PECA_W);
      rect.setAttribute('height', PECA_H);
      rect.setAttribute('rx', 10);
      g.appendChild(rect);

      // Barra colorida à esquerda indicando tipo
      const strip = document.createElementNS(svgNS, 'rect');
      strip.setAttribute('x', COL3_X);
      strip.setAttribute('y', y);
      strip.setAttribute('width', 4);
      strip.setAttribute('height', PECA_H);
      strip.setAttribute('fill', tipoColor(tipo));
      strip.setAttribute('rx', 2);
      g.appendChild(strip);

      const title = document.createElementNS(svgNS, 'text');
      title.classList.add('node-title');
      title.setAttribute('x', COL3_X + 16);
      title.setAttribute('y', y + 21);
      title.setAttribute('font-size', '12');
      // trunca texto longo
      const tituloMax = peca.titulo.length > 32 ? peca.titulo.slice(0, 30) + '…' : peca.titulo;
      title.textContent = tituloMax;
      g.appendChild(title);

      const meta = document.createElementNS(svgNS, 'text');
      meta.classList.add('node-sub');
      meta.setAttribute('x', COL3_X + 16);
      meta.setAttribute('y', y + 38);
      meta.setAttribute('font-size', '10');
      const dataFmt = peca.criado_em ? new Date(peca.criado_em).toLocaleDateString('pt-BR') : '—';
      meta.textContent = `${peca.origem || 'upload'} · ${peca.autor || 'sem autor'} · ${dataFmt}`;
      g.appendChild(meta);

      // Tooltip nativo
      const ttl = document.createElementNS(svgNS, 'title');
      ttl.textContent = peca.titulo;
      g.appendChild(ttl);

      gNodes.appendChild(g);

      const anchor = { x: COL3_X, y: y + PECA_H / 2 };
      pecaNodes[peca.id] = { el: g, anchor, peca };

      // Edge Tipo → Peça
      const edge = document.createElementNS(svgNS, 'path');
      edge.classList.add('fluxo-edge');
      edge.setAttribute('d', bezierPath(t.anchorRight.x, t.anchorRight.y, anchor.x, anchor.y));
      edge.setAttribute('data-from', 'tipo-' + tipo);
      edge.setAttribute('data-to', 'peca-' + peca.id);
      gEdges.appendChild(edge);

      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        aplicarFoco(['peca-' + peca.id, 'tipo-' + tipo, 'produto-root']);
        onNodeClick?.(peca);
      });
    });

    if (overflow > 0) {
      // Nó "+N mais"
      const y = startY + visiveis.length * (PECA_H + PECA_GAP);
      const g = document.createElementNS(svgNS, 'g');
      g.classList.add('fluxo-node');
      g.setAttribute('data-id', 'more-' + tipo);
      g.style.cursor = 'default';

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', COL3_X);
      rect.setAttribute('y', y);
      rect.setAttribute('width', PECA_W);
      rect.setAttribute('height', 30);
      rect.setAttribute('rx', 8);
      rect.setAttribute('fill', cssVar('--surface-3'));
      rect.setAttribute('stroke', cssVar('--border-subtle'));
      rect.setAttribute('stroke-dasharray', '3 3');
      g.appendChild(rect);

      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', COL3_X + PECA_W / 2);
      txt.setAttribute('y', y + 20);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '11');
      txt.setAttribute('font-family', 'Inter, sans-serif');
      txt.setAttribute('fill', cssVar('--fg-muted'));
      txt.setAttribute('font-weight', '600');
      txt.textContent = `+${overflow} peças · ver lista completa`;
      g.appendChild(txt);

      gNodes.appendChild(g);
    }
  });

  // Clique no nó de tipo: filtra todas as peças desse tipo
  tipoKeys.forEach((tipo) => {
    const t = tipoNodes[tipo];
    t.el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const pecasDoTipo = tipos[tipo].map(p => 'peca-' + p.id);
      aplicarFoco(['tipo-' + tipo, 'produto-root', ...pecasDoTipo]);
    });
  });

  // Clique fora → limpa foco
  svg.addEventListener('click', (ev) => {
    if (ev.target === svg) limparFoco();
  });

  // --- Funções de foco/dimming ---
  function aplicarFoco(idsAtivos) {
    const set = new Set(idsAtivos);
    svg.querySelectorAll('.fluxo-node').forEach(n => {
      const id = n.getAttribute('data-id');
      if (set.has(id)) {
        n.classList.add('active');
        n.classList.remove('dimmed');
      } else {
        n.classList.remove('active');
        n.classList.add('dimmed');
      }
    });
    svg.querySelectorAll('.fluxo-edge').forEach(e => {
      const from = e.getAttribute('data-from');
      const to = e.getAttribute('data-to');
      if (set.has(from) && set.has(to)) {
        e.classList.add('active');
        e.classList.remove('dimmed');
      } else {
        e.classList.remove('active');
        e.classList.add('dimmed');
      }
    });
  }

  function limparFoco() {
    svg.querySelectorAll('.fluxo-node').forEach(n => n.classList.remove('active', 'dimmed'));
    svg.querySelectorAll('.fluxo-edge').forEach(e => e.classList.remove('active', 'dimmed'));
  }

  container.appendChild(svg);

  // --- Legenda (canto superior esquerdo) ---
  const legend = document.createElement('div');
  legend.className = 'grafo-legend';
  legend.innerHTML = `
    <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${cssVar('--fg-dim')};margin-bottom:4px">Tipos</div>
    ${tipoKeys.map(t => `
      <div class="grafo-legend-item">
        <span class="grafo-legend-dot" style="background:${tipoColor(t)}"></span>
        ${LABEL_TIPO[t] || t} <span style="color:${cssVar('--fg-dim')};margin-left:auto">${tipos[t].length}</span>
      </div>
    `).join('')}
  `;
  container.appendChild(legend);

  // --- Dica de uso (canto inferior direito) ---
  const hint = document.createElement('div');
  hint.style.cssText = `
    position: absolute;
    bottom: 0.75rem;
    right: 0.75rem;
    background: ${cssVar('--surface-overlay')};
    backdrop-filter: blur(8px);
    border: 1px solid ${cssVar('--border')};
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    font-size: 0.6875rem;
    color: ${cssVar('--fg-muted')};
    box-shadow: ${cssVar('--elev-2')};
  `;
  hint.innerHTML = `💡 Clique num card pra isolar as conexões · clique no fundo pra limpar`;
  container.appendChild(hint);
}

export function coresTipo() {
  const out = {};
  Object.keys(LABEL_TIPO).forEach(t => out[t] = tipoColor(t));
  return out;
}

export function labelTipo(tipo) { return LABEL_TIPO[tipo] || tipo; }
