/* Tela Home — overview da operação Pinguim */

import { fetchCerebrosCatalogo, fetchOperacaoData, fetchCrons } from './sb-client.js?v=20260421p';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
};

export async function renderHome() {
  const page = document.getElementById('page-home');
  page.innerHTML = '';

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Home'),
        el('div', { class: 'page-subtitle' }, 'Visão geral da operação Pinguim — o que existe, o que está rolando, onde focar.'),
      ]),
    ])
  );

  const grid = el('div', { class: 'home-grid' });
  page.append(grid);

  // Cards de saúde
  const [cerebros, op, crons] = await Promise.all([
    fetchCerebrosCatalogo(),
    fetchOperacaoData(),
    fetchCrons(),
  ]);

  const totalPecas = cerebros.reduce((s, c) => s + (c.total_pecas || 0), 0);
  const cerebrosAtivos = cerebros.filter(c => c.status === 'ativo').length;
  const cerebrosConstrucao = cerebros.filter(c => c.status === 'em_construcao').length;
  const tasksAtivas = op.tasks.filter(t => t.status !== 'done').length;
  const cronsAtivos = crons.filter(c => c.ativo).length;
  const cronsPlanejados = crons.filter(c => !c.ativo).length;

  grid.append(
    homeCard('Cérebros ativos', cerebrosAtivos, `${cerebrosConstrucao} em construção`, '→ Cérebros', () => navegarPara('cerebros')),
    homeCard('Peças de contexto', totalPecas, 'Total acumulado em todos os Cérebros', '→ ver detalhe', () => navegarPara('cerebros')),
    homeCard('Agentes', op.agentes.length, `${op.agentes.filter(a => a.online !== false).length} online`, '→ Agentes', () => navegarPara('agentes')),
    homeCard('Squads', op.squads.length, 'Mini-agências configuradas', '→ Squads', () => navegarPara('squads')),
    homeCard('Tasks ativas', tasksAtivas, 'Em execução agora', '→ Operação', () => navegarPara('operacao')),
    homeCard('Crons', cronsAtivos, `${cronsPlanejados} ${cronsPlanejados === 1 ? 'planejado' : 'planejados'} (V1)`, '→ Crons', () => navegarPara('crons')),
  );

  // Aviso contextual
  const aviso = el('div', { class: 'home-card', style: 'grid-column: 1 / -1' }, [
    el('h3', {}, 'Próximos passos'),
    el('div', { style: 'font-size:.9375rem;color:var(--fg-muted);line-height:1.6' }, [
      el('p', { style: 'margin-bottom:.5rem' }, [
        '🎯 ',
        el('strong', { style: 'color:var(--fg)' }, 'Alimentar Cérebros Elo e ProAlt'),
        ' — Luiz mandou o drive. Processo: ',
        el('code', { style: 'background:var(--bg);padding:.125rem .375rem;border-radius:4px;font-size:.8125rem' }, 'node --env-file=.env scripts/import-drive-luiz.mjs')
      ]),
      el('p', { style: 'margin-bottom:.5rem' }, '🔌 Pedir ao Pedro: assinar OpenClaw + decidir onde roda. Único bloqueador do V1.'),
      el('p', {}, '🧠 Apresentar pros sócios: abrir URL do Vercel, clicar em um Cérebro, mostrar grafo ao vivo.'),
    ]),
  ]);
  grid.append(aviso);
}

function homeCard(title, big, lbl, linkText, onClick) {
  return el('div', { class: 'home-card', onclick: onClick, style: 'cursor:pointer' }, [
    el('h3', {}, title),
    el('div', { class: 'big' }, String(big)),
    el('div', { class: 'lbl' }, lbl),
    el('span', { class: 'home-card-link' }, linkText + ' ›'),
  ]);
}

function navegarPara(pageSlug) {
  const item = document.querySelector(`.nav-item[data-page="${pageSlug}"]`);
  item?.click();
}
