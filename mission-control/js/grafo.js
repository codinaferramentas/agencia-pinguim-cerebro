/* Grafo de força simples em SVG — sem dependências externas.
   Não é D3 completo, mas entrega o visual: nó central (produto) + nós por tipo + linhas conectando.
*/

// Cores lidas dos tokens CSS — fonte única de verdade no :root
// Brad: "Purga todo rgba(232,92,0,...) hardcoded. Tenant muda --pc e tudo segue."
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#71717A';
}

const CORES_TIPO = {
  aula:          cssVar('--peca-aula'),
  pagina_venda:  cssVar('--peca-pagina-venda'),
  persona:       cssVar('--peca-persona'),
  objecao:       cssVar('--peca-objecao'),
  depoimento:    cssVar('--peca-depoimento'),
  sacada:        cssVar('--peca-sacada'),
  externo:       cssVar('--peca-externo'),
  csv:           cssVar('--peca-csv'),
  pitch:         cssVar('--peca-pitch'),
  faq:           cssVar('--peca-faq'),
  outro:         cssVar('--peca-outro')
};

const LABEL_TIPO = {
  aula: 'Aula',
  pagina_venda: 'Página',
  persona: 'Persona',
  objecao: 'Objeção',
  depoimento: 'Depoimento',
  sacada: 'Sacada',
  externo: 'Externo',
  csv: 'CSV',
  pitch: 'Pitch',
  faq: 'FAQ',
  outro: 'Outro'
};

export function renderGrafo(container, { produto, pecas }, onNodeClick) {
  container.innerHTML = '';

  const W = container.clientWidth || 900;
  const H = container.clientHeight || 560;
  const CENTER = { x: W / 2, y: H / 2 };

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.classList.add('grafo-svg');

  // defs — filtros
  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = `<filter id="glow"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg.appendChild(defs);

  // Grupos
  const gEdges = document.createElementNS(svgNS, 'g');
  const gNodes = document.createElementNS(svgNS, 'g');
  svg.appendChild(gEdges);
  svg.appendChild(gNodes);

  // Distribui peças em círculos concêntricos agrupados por tipo
  const tipos = [...new Set(pecas.map(p => p.tipo))];
  const anguloPorTipo = (360 / Math.max(tipos.length, 1));
  const nodes = [];

  tipos.forEach((tipo, tIdx) => {
    const pecasTipo = pecas.filter(p => p.tipo === tipo);
    const baseAngulo = tIdx * anguloPorTipo;
    const raioBase = 170 + Math.min(pecasTipo.length, 10) * 8;
    pecasTipo.forEach((peca, pIdx) => {
      const spreadAngulo = Math.min(anguloPorTipo * 0.85, 60);
      const angulo = (baseAngulo - spreadAngulo / 2 + (pIdx / Math.max(pecasTipo.length - 1, 1)) * spreadAngulo) * Math.PI / 180;
      const raio = raioBase + (pIdx % 3) * 28;
      const x = CENTER.x + Math.cos(angulo) * raio;
      const y = CENTER.y + Math.sin(angulo) * raio;
      const size = Math.max(6, Math.min(14, 6 + (peca.peso || 5)));
      nodes.push({ id: peca.id, x, y, size, peca });
    });
  });

  // Edges — cada peça conecta ao centro; se peças têm tags em comum, conectam entre si
  nodes.forEach(n => {
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', CENTER.x);
    l.setAttribute('y1', CENTER.y);
    l.setAttribute('x2', n.x);
    l.setAttribute('y2', n.y);
    l.setAttribute('stroke', cssVar('--edge-default'));
    l.setAttribute('stroke-width', '1');
    l.setAttribute('opacity', '0.55');
    gEdges.appendChild(l);
  });

  // Conexões por tag compartilhada (máx 2 por nó pra não poluir)
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    let linked = 0;
    for (let j = i + 1; j < nodes.length && linked < 2; j++) {
      const b = nodes[j];
      const tagsA = a.peca.tags || [];
      const tagsB = b.peca.tags || [];
      const shared = tagsA.filter(t => tagsB.includes(t));
      if (shared.length >= 2 && a.peca.tipo !== b.peca.tipo) {
        const l = document.createElementNS(svgNS, 'line');
        l.setAttribute('x1', a.x);
        l.setAttribute('y1', a.y);
        l.setAttribute('x2', b.x);
        l.setAttribute('y2', b.y);
        l.setAttribute('stroke', cssVar('--edge-animated'));
        l.setAttribute('stroke-width', '1');
        l.setAttribute('opacity', '0.22');
        l.setAttribute('stroke-dasharray', '3 3');
        gEdges.appendChild(l);
        linked++;
      }
    }
  }

  // Nó central
  const centerG = document.createElementNS(svgNS, 'g');
  const centerCircle = document.createElementNS(svgNS, 'circle');
  centerCircle.setAttribute('cx', CENTER.x);
  centerCircle.setAttribute('cy', CENTER.y);
  centerCircle.setAttribute('r', 38);
  centerCircle.setAttribute('fill', cssVar('--pc'));
  centerCircle.setAttribute('stroke', cssVar('--surface-2'));
  centerCircle.setAttribute('stroke-width', '2');
  centerCircle.setAttribute('filter', 'url(#glow)');
  centerG.appendChild(centerCircle);
  const centerText = document.createElementNS(svgNS, 'text');
  centerText.setAttribute('x', CENTER.x);
  centerText.setAttribute('y', CENTER.y + 10);
  centerText.setAttribute('text-anchor', 'middle');
  centerText.setAttribute('font-size', '28');
  centerText.textContent = produto.emoji || '📦';
  centerG.appendChild(centerText);
  const centerLabel = document.createElementNS(svgNS, 'text');
  centerLabel.setAttribute('x', CENTER.x);
  centerLabel.setAttribute('y', CENTER.y + 58);
  centerLabel.setAttribute('text-anchor', 'middle');
  centerLabel.setAttribute('font-size', '12');
  centerLabel.setAttribute('fill', cssVar('--pc-on'));
  centerLabel.setAttribute('font-family', 'Plus Jakarta Sans, sans-serif');
  centerLabel.setAttribute('font-weight', '800');
  centerLabel.textContent = produto.nome || '—';
  centerG.appendChild(centerLabel);
  gNodes.appendChild(centerG);

  // Nós das peças
  nodes.forEach(n => {
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('transform', `translate(${n.x}, ${n.y})`);
    g.style.cursor = 'pointer';

    const halo = document.createElementNS(svgNS, 'circle');
    halo.setAttribute('r', n.size + 3);
    halo.setAttribute('fill', CORES_TIPO[n.peca.tipo] || '#71717A');
    halo.setAttribute('opacity', '0.2');
    g.appendChild(halo);

    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('r', n.size);
    c.setAttribute('fill', CORES_TIPO[n.peca.tipo] || '#71717A');
    c.setAttribute('stroke', cssVar('--surface-2'));
    c.setAttribute('stroke-width', '1.5');
    g.appendChild(c);

    // Hover — título em tooltip nativo
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${LABEL_TIPO[n.peca.tipo] || n.peca.tipo}: ${n.peca.titulo}`;
    g.appendChild(title);

    g.addEventListener('click', () => onNodeClick?.(n.peca));
    g.addEventListener('mouseenter', () => {
      c.setAttribute('stroke', cssVar('--fg-title'));
      halo.setAttribute('opacity', '0.5');
    });
    g.addEventListener('mouseleave', () => {
      c.setAttribute('stroke', cssVar('--surface-2'));
      halo.setAttribute('opacity', '0.2');
    });

    gNodes.appendChild(g);
  });

  container.appendChild(svg);

  // Legenda
  const tiposPresentes = [...new Set(pecas.map(p => p.tipo))];
  const legend = document.createElement('div');
  legend.className = 'grafo-legend';
  legend.innerHTML = tiposPresentes
    .map(t => `<div class="grafo-legend-item"><span class="grafo-legend-dot" style="background:${CORES_TIPO[t]||'#71717A'}"></span>${LABEL_TIPO[t] || t}</div>`)
    .join('');
  container.appendChild(legend);
}

export function coresTipo() { return { ...CORES_TIPO }; }
export function labelTipo(tipo) { return LABEL_TIPO[tipo] || tipo; }
