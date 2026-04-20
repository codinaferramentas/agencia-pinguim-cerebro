/* Tela Cérebros — catálogo + detalhe com Grafo/Lista/Timeline */

import { fetchCerebrosCatalogo, fetchCerebroPecas } from './sb-client.js?v=20260420c';
import { renderGrafo, coresTipo, labelTipo } from './grafo.js?v=20260420c';

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

let cerebrosCache = [];

export async function renderCerebros() {
  const page = document.getElementById('page-cerebros');
  page.innerHTML = '';
  page.append(el('div', { html: '<div style="padding:3rem;color:var(--fg-muted);text-align:center">Carregando cérebros…</div>' }));

  try {
    cerebrosCache = await fetchCerebrosCatalogo();
  } catch (e) {
    page.innerHTML = `<div style="padding:2rem;color:var(--status-alerta)">Erro: ${e.message}</div>`;
    return;
  }

  page.innerHTML = '';
  page.append(
    el('div', { class: 'cerebros-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Cérebros'),
        el('div', { class: 'page-subtitle' }, 'Um Cérebro por produto — contexto + skills + rotinas. Agentes consultam antes de agir.'),
      ]),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => abrirModalNovoProduto()
      }, '+ Novo Produto'),
    ]),
    el('div', { class: 'cerebros-grid' }, [
      ...cerebrosCache.map(renderCerebroCard),
      el('button', {
        class: 'btn-add-produto',
        onclick: () => abrirModalNovoProduto()
      }, '+ Cadastrar novo produto'),
    ]),
  );
}

function renderCerebroCard(c) {
  const isPinguim = c.slug === 'pinguim';
  const tipos = [
    { key: 'aulas', icon: '📚', label: 'Aulas', val: c.total_aulas },
    { key: 'paginas', icon: '📄', label: 'Páginas', val: c.total_paginas },
    { key: 'objecoes', icon: '❓', label: 'Objeções', val: c.total_objecoes },
    { key: 'depoimentos', icon: '⭐', label: 'Depos', val: c.total_depoimentos },
    { key: 'sacadas', icon: '💡', label: 'Sacadas', val: c.total_sacadas },
    { key: 'outros', icon: '📦', label: 'Outros', val: Math.max(0, (c.total_pecas || 0) - (c.total_aulas || 0) - (c.total_paginas || 0) - (c.total_objecoes || 0) - (c.total_depoimentos || 0) - (c.total_sacadas || 0)) },
  ];

  const fontes = detectarFontes(c);
  const atualizacao = formatarAtualizacao(c.ultima_alimentacao);

  return el('div', {
    class: 'cerebro-card' + (isPinguim ? ' featured' : ''),
    onclick: () => abrirCerebroDetalhe(c.slug)
  }, [
    el('div', { class: 'cerebro-card-top' }, [
      el('div', { class: 'cerebro-emoji' }, c.emoji || '📦'),
      el('div', { style: 'flex:1' }, [
        el('div', { class: 'cerebro-nome' }, c.nome),
        el('div', { class: 'cerebro-desc' }, c.descricao || '—'),
      ]),
    ]),
    el('div', { class: 'preenchimento-wrap' }, [
      el('div', { class: 'preenchimento-label' }, [
        el('span', {}, 'Preenchimento'),
        el('strong', {}, `${c.preenchimento_pct || 0}%`),
      ]),
      el('div', { class: 'preenchimento-bar' }, [
        el('div', { class: 'preenchimento-fill', style: `width:${Math.max(2, c.preenchimento_pct || 0)}%` }),
      ]),
    ]),
    el('div', { class: 'tipos-mini' }, tipos.map(t => el('div', { class: 'tipo-item', title: t.label }, [
      el('div', { class: 'tipo-icon' }, t.icon),
      el('div', { class: 'tipo-num' }, String(t.val || 0)),
      el('div', { class: 'tipo-label' }, t.label),
    ]))),
    el('div', { class: 'cerebro-card-footer' }, [
      el('div', { class: 'cerebro-card-badges' }, fontes.map(f => el('span', { class: 'badge-fonte' }, f))),
      el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:.25rem' }, [
        c.pecas_ultima_semana > 0
          ? el('span', { class: 'cerebro-growth' }, `+${c.pecas_ultima_semana} nesta semana`)
          : null,
        el('span', { class: 'cerebro-atualizacao' + (atualizacao.recente ? ' recente' : '') }, atualizacao.texto),
      ]),
    ]),
  ]);
}

function detectarFontes(c) {
  // No V0 inferimos pelas quantidades; em V1 vem do campo origem real
  const fontes = [];
  if (c.total_aulas > 0) fontes.push('Transcrições');
  if (c.total_paginas > 0) fontes.push('Páginas');
  if (c.total_depoimentos > 0) fontes.push('Depoimentos');
  if (c.total_sacadas > 0) fontes.push('Sacadas');
  if (fontes.length === 0) fontes.push('Vazio');
  return fontes;
}

function formatarAtualizacao(iso) {
  if (!iso) return { texto: 'Sem atualização', recente: false };
  const d = new Date(iso);
  const horas = Math.floor((Date.now() - d.getTime()) / 3600000);
  const dias = Math.floor(horas / 24);
  if (horas < 1) return { texto: 'Agora há pouco', recente: true };
  if (horas < 24) return { texto: `há ${horas}h`, recente: horas < 6 };
  if (dias === 1) return { texto: 'Ontem', recente: false };
  if (dias < 7) return { texto: `há ${dias}d`, recente: false };
  if (dias < 30) return { texto: `há ${Math.floor(dias / 7)} sem`, recente: false };
  return { texto: `há ${Math.floor(dias / 30)} meses`, recente: false };
}

function abrirModalNovoProduto() {
  // V0: prompt simples. Em V1 vira modal real com form.
  const nome = prompt('Nome do produto (ex: "Novo Desafio"):');
  if (!nome) return;
  const emoji = prompt('Emoji (1 só):', '📦') || '📦';
  alert(`Produto "${nome}" ${emoji} seria criado.\n\nEm V1 isto gera registro no Supabase + pasta cerebros/<slug>/ + MAPA.md inicial.`);
}

/* ----- Tela detalhada de 1 cérebro ----- */
let pecasCache = [];
let cerebroAtual = null;
let viewModoAtual = 'grafo';

async function abrirCerebroDetalhe(slug) {
  cerebroAtual = cerebrosCache.find(c => c.slug === slug);
  if (!cerebroAtual) return;

  const page = document.getElementById('page-cerebros');
  page.innerHTML = '';
  page.append(el('div', { html: `<div style="padding:3rem;color:var(--fg-muted);text-align:center">Carregando peças do Cérebro ${cerebroAtual.nome}…</div>` }));

  pecasCache = await fetchCerebroPecas(slug);

  page.innerHTML = '';
  const acoes = el('div', { class: 'cerebro-detail-actions' }, [
    el('button', { class: 'btn', onclick: () => alert('Upload de arquivo — V0: placeholder. V1: upload real.') }, '+ Alimentar'),
    el('button', { class: 'btn' }, 'Configurar curador'),
    el('button', { class: 'btn btn-ghost' }, 'Exportar'),
    el('button', { class: 'btn btn-ghost', onclick: () => renderCerebros() }, '← Voltar'),
  ]);

  const header = el('div', { class: 'cerebro-detail-header' }, [
    el('div', { class: 'cerebro-emoji' }, cerebroAtual.emoji || '📦'),
    el('div', { style: 'flex:1' }, [
      el('div', { class: 'cerebro-nome' }, `Cérebro ${cerebroAtual.nome}`),
      el('div', { class: 'cerebro-desc' }, cerebroAtual.descricao || '—'),
      el('div', { style: 'display:flex;gap:.75rem;margin-top:.5rem;font-size:.75rem;color:var(--fg-muted)' }, [
        el('span', {}, `Preenchimento: ${cerebroAtual.preenchimento_pct}%`),
        el('span', {}, `${pecasCache.length} peças`),
        el('span', {}, formatarAtualizacao(cerebroAtual.ultima_alimentacao).texto),
      ]),
    ]),
    acoes,
  ]);

  const toggle = el('div', { class: 'view-toggle' }, [
    el('button', { class: viewModoAtual === 'grafo' ? 'active' : '', onclick: () => { viewModoAtual = 'grafo'; renderView(); } }, '◉ Grafo'),
    el('button', { class: viewModoAtual === 'lista' ? 'active' : '', onclick: () => { viewModoAtual = 'lista'; renderView(); } }, '☰ Lista'),
    el('button', { class: viewModoAtual === 'timeline' ? 'active' : '', onclick: () => { viewModoAtual = 'timeline'; renderView(); } }, '⌚ Timeline'),
  ]);

  const viewArea = el('div', { id: 'cerebro-view-area' });

  page.append(el('div', { class: 'cerebro-detail' }, [header, toggle, viewArea]));

  renderView();
}

function renderView() {
  const area = document.getElementById('cerebro-view-area');
  if (!area) return;
  area.innerHTML = '';
  document.querySelectorAll('.view-toggle button').forEach((b, i) => {
    b.classList.toggle('active', ['grafo','lista','timeline'][i] === viewModoAtual);
  });

  if (viewModoAtual === 'grafo') {
    if (pecasCache.length === 0) {
      area.append(el('div', { class: 'stub-screen' }, [
        el('div', { class: 'stub-badge' }, 'vazio'),
        el('h2', {}, 'Este Cérebro ainda não tem peças'),
        el('p', {}, 'Clique em "+ Alimentar" acima pra adicionar transcrições, páginas, objeções, depoimentos. Assim que ele for alimentado, os nós aparecem aqui conectados.'),
      ]));
      return;
    }
    const container = el('div', { class: 'grafo-container' });
    area.append(container);
    // espera o DOM calcular dimensões
    requestAnimationFrame(() => {
      renderGrafo(container, { produto: cerebroAtual, pecas: pecasCache }, abrirDrawer);
    });
  } else if (viewModoAtual === 'lista') {
    const tabela = el('table', { class: 'pecas-tabela' });
    tabela.innerHTML = `<thead><tr>
      <th>Título</th><th>Tipo</th><th>Origem</th><th>Autor</th><th>Data</th><th>Peso</th>
    </tr></thead>`;
    const tbody = el('tbody');
    pecasCache.forEach(p => {
      const tr = el('tr', { onclick: () => abrirDrawer(p) }, [
        el('td', {}, p.titulo),
        el('td', { html: `<span style="color:${coresTipo()[p.tipo]||'#71717A'};font-weight:600">${labelTipo(p.tipo)}</span>` }),
        el('td', {}, p.origem || '—'),
        el('td', {}, p.autor || '—'),
        el('td', {}, new Date(p.criado_em).toLocaleDateString('pt-BR')),
        el('td', {}, String(p.peso || '—')),
      ]);
      tbody.append(tr);
    });
    tabela.append(tbody);
    area.append(tabela);
  } else {
    // timeline
    const tl = el('div', { class: 'timeline' });
    [...pecasCache]
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
      .forEach(p => {
        tl.append(el('div', { class: 'timeline-item', onclick: () => abrirDrawer(p), style: 'cursor:pointer' }, [
          el('h4', {}, p.titulo),
          el('div', { class: 'meta' }, `${labelTipo(p.tipo)} · ${p.autor || 'sem autor'} · ${new Date(p.criado_em).toLocaleString('pt-BR')}`),
        ]));
      });
    area.append(tl);
  }
}

function abrirDrawer(peca) {
  const d = document.getElementById('drawer');
  const title = document.getElementById('drawer-title');
  const body = document.getElementById('drawer-body');
  title.textContent = peca.titulo;
  body.innerHTML = `
    <div class="drawer-meta">
      <b>Tipo</b><span style="color:${coresTipo()[peca.tipo]||'#71717A'};font-weight:600">${labelTipo(peca.tipo)}</span>
      <b>Origem</b><span>${peca.origem || '—'}</span>
      <b>Autor</b><span>${peca.autor || '—'}</span>
      <b>Data</b><span>${new Date(peca.criado_em).toLocaleString('pt-BR')}</span>
      <b>Peso</b><span>${peca.peso || '—'}</span>
      <b>Tags</b><span>${(peca.tags || []).map(t => `<span class="task-tag" style="margin-right:.25rem">${t}</span>`).join('') || '—'}</span>
      ${peca.fonte_url ? `<b>URL</b><span><a href="${peca.fonte_url}" target="_blank">${peca.fonte_url}</a></span>` : ''}
    </div>
    ${peca.conteudo_md ? `<pre>${escapeHtml(peca.conteudo_md.slice(0, 2000))}${peca.conteudo_md.length > 2000 ? '\n\n…(conteúdo truncado, abra no repositório)' : ''}</pre>` : '<em style="color:var(--fg-muted)">Sem conteúdo — peça criada como referência (ex: URL externa).</em>'}
  `;
  d.classList.add('open');
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function initDrawer() {
  const btn = document.getElementById('drawer-close');
  btn?.addEventListener('click', () => document.getElementById('drawer').classList.remove('open'));
}
