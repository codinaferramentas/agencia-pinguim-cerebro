/* Tela Cérebros — catálogo + detalhe com Grafo/Lista/Timeline */

import { fetchCerebrosCatalogo, fetchCerebroPecas } from './sb-client.js?v=20260420g';
import { renderGrafo, coresTipo, labelTipo } from './grafo.js?v=20260420g';

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
let cerebrosListenerReady = false;

export async function renderCerebros() {
  if (!cerebrosListenerReady) {
    cerebrosListenerReady = true;
    window.addEventListener('cerebro:select', (ev) => {
      const slug = ev.detail?.slug;
      if (slug) abrirCerebroDetalhe(slug);
    });
  }

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
  const atualizacao = formatarAtualizacao(c.ultima_alimentacao);
  const tiposPresentes = construirTiposDinamicos(c);
  const totalFontes = tiposPresentes.reduce((sum, t) => sum + t.val, 0);

  return el('div', {
    class: 'cerebro-card' + (isPinguim ? ' featured' : ''),
    onclick: () => abrirCerebroDetalhe(c.slug)
  }, [
    el('div', { class: 'cerebro-card-top' }, [
      el('div', { class: 'cerebro-emoji' }, c.emoji || '📦'),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { class: 'cerebro-nome' }, c.nome),
        el('div', { class: 'cerebro-desc' }, c.descricao || '—'),
      ]),
    ]),
    tiposPresentes.length > 0
      ? el('div', { class: 'cerebro-tipos-lista' },
          tiposPresentes.map(t => el('div', { class: 'cerebro-tipo-row', title: t.label }, [
            el('span', { class: 'cerebro-tipo-icon' }, t.icon),
            el('span', { class: 'cerebro-tipo-label' }, t.label),
            el('span', { class: 'cerebro-tipo-count' }, String(t.val)),
          ]))
        )
      : el('div', { class: 'cerebro-tipos-empty' }, 'Ainda sem fontes — clique em Alimentar'),
    el('div', { class: 'cerebro-card-footer' }, [
      el('div', { class: 'cerebro-total-fontes' }, `${totalFontes} fonte${totalFontes === 1 ? '' : 's'}`),
      el('span', { class: 'cerebro-atualizacao' + (atualizacao.recente ? ' recente' : '') }, atualizacao.texto),
    ]),
  ]);
}

/* Constrói lista dinâmica — só aparecem tipos que têm >0 itens, ordenados por volume */
function construirTiposDinamicos(c) {
  const todos = [
    { key: 'aulas',       icon: '📚', label: 'Aulas',       val: c.total_aulas || 0 },
    { key: 'paginas',     icon: '📄', label: 'Páginas',     val: c.total_paginas || 0 },
    { key: 'objecoes',    icon: '❓', label: 'Objeções',    val: c.total_objecoes || 0 },
    { key: 'depoimentos', icon: '⭐', label: 'Depoimentos', val: c.total_depoimentos || 0 },
    { key: 'sacadas',     icon: '💡', label: 'Sacadas',     val: c.total_sacadas || 0 },
  ];
  const contados = todos.reduce((s, t) => s + t.val, 0);
  const outros = Math.max(0, (c.total_pecas || 0) - contados);
  if (outros > 0) todos.push({ key: 'outros', icon: '📦', label: 'Outros', val: outros });

  return todos.filter(t => t.val > 0).sort((a, b) => b.val - a.val);
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
let viewModoAtual = 'kanban';

async function abrirCerebroDetalhe(slug) {
  cerebroAtual = cerebrosCache.find(c => c.slug === slug);
  if (!cerebroAtual) return;

  const page = document.getElementById('page-cerebros');
  page.innerHTML = '';
  page.append(el('div', { html: `<div style="padding:3rem;color:var(--fg-muted);text-align:center">Carregando peças do Cérebro ${cerebroAtual.nome}…</div>` }));

  const fontesServidor = await fetchCerebroPecas(slug);
  const fontesLocais = lerFontesLocaisPorCerebro(slug);
  pecasCache = [...fontesLocais, ...fontesServidor];

  page.innerHTML = '';
  const acoes = el('div', { class: 'cerebro-detail-actions' }, [
    el('button', { class: 'btn btn-primary', onclick: () => abrirModalAlimentar() }, '+ Alimentar'),
    el('button', { class: 'btn btn-ghost', onclick: () => renderCerebros() }, '← Voltar'),
  ]);

  const header = el('div', { class: 'cerebro-detail-header' }, [
    el('div', { class: 'cerebro-emoji' }, cerebroAtual.emoji || '📦'),
    el('div', { style: 'flex:1' }, [
      el('div', { class: 'cerebro-nome' }, `Cérebro ${cerebroAtual.nome}`),
      el('div', { class: 'cerebro-desc' }, cerebroAtual.descricao || '—'),
      el('div', { style: 'display:flex;gap:.75rem;margin-top:.5rem;font-size:.75rem;color:var(--fg-muted)' }, [
        el('span', {}, `${pecasCache.length} fontes`),
        el('span', {}, formatarAtualizacao(cerebroAtual.ultima_alimentacao).texto),
      ]),
    ]),
    acoes,
  ]);

  const toggle = el('div', { class: 'view-toggle' }, [
    el('button', { class: viewModoAtual === 'kanban' ? 'active' : '', onclick: () => { viewModoAtual = 'kanban'; renderView(); } }, '▦ Kanban'),
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
    b.classList.toggle('active', ['kanban','lista','timeline'][i] === viewModoAtual);
  });

  if (viewModoAtual === 'kanban') {
    const fontes = pecasCache.length > 0 ? pecasCache : gerarFontesMockadas(cerebroAtual);
    renderKanbanFontes(area, fontes);
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

/* ================================================================
   Kanban de FONTES — colunas por tipo, cards verticais
   Substitui o grafo. Mostra claramente de onde vem cada conteúdo.
   ================================================================ */

const TIPO_ORDEM = [
  'aula', 'pagina_venda', 'objecao',
  'depoimento', 'sacada', 'pitch', 'faq',
  'externo', 'csv', 'outro'
];

const TIPO_META = {
  aula:         { label: 'Aulas',        icon: '📚', desc: 'Transcrições de vídeo-aulas' },
  pagina_venda: { label: 'Páginas',      icon: '📄', desc: 'Copy de página de vendas' },
  objecao:      { label: 'Objeções',     icon: '❓', desc: 'Objeções reais do público' },
  depoimento:   { label: 'Depoimentos',  icon: '⭐', desc: 'Prints + texto de alunos' },
  sacada:       { label: 'Sacadas',      icon: '💡', desc: 'Insights do expert' },
  pitch:        { label: 'Pitch',        icon: '🎯', desc: 'Argumentos de venda' },
  faq:          { label: 'FAQ',          icon: '📖', desc: 'Perguntas frequentes' },
  externo:      { label: 'Externos',     icon: '🔗', desc: 'URLs + materiais de fora' },
  csv:          { label: 'CSV',          icon: '📊', desc: 'Planilhas importadas' },
  outro:        { label: 'Outros',       icon: '📦', desc: 'Sem categoria' },
};

const ORIGEM_META = {
  discord:   { label: 'Discord',   color: '#5865F2' },
  whatsapp:  { label: 'WhatsApp',  color: '#25D366' },
  telegram:  { label: 'Telegram',  color: '#26A5E4' },
  upload:    { label: 'Upload',    color: '#A1A1A1' },
  expert:    { label: 'Expert',    color: '#F5A524' },
  scrap:     { label: 'Scrap',     color: '#EC4899' },
  externo:   { label: 'Externo',   color: '#94A3B8' },
  csv:       { label: 'CSV',       color: '#06B6D4' },
};

function renderKanbanFontes(area, fontes) {
  // Agrupar por tipo
  const grupos = {};
  fontes.forEach(f => {
    if (!grupos[f.tipo]) grupos[f.tipo] = [];
    grupos[f.tipo].push(f);
  });

  // Só colunas que têm fontes, na ordem canonica
  const tiposVisiveis = TIPO_ORDEM.filter(t => grupos[t]?.length > 0);
  // Acrescenta tipos fora da ordem (defensivo)
  Object.keys(grupos).forEach(t => { if (!tiposVisiveis.includes(t)) tiposVisiveis.push(t); });

  const kanban = el('div', { class: 'fontes-kanban' });

  tiposVisiveis.forEach(tipo => {
    const meta = TIPO_META[tipo] || { label: tipo, icon: '📦', desc: '' };
    const cor = `var(--peca-${tipo.replace('_','-')}, var(--peca-outro))`;
    const corBg = `var(--peca-${tipo.replace('_','-')}-bg, var(--peca-outro-bg))`;
    const count = grupos[tipo].length;

    const col = el('div', { class: 'fontes-col' }, [
      el('div', { class: 'fontes-col-header', style: `--col-color: ${cor}; --col-bg: ${corBg}` }, [
        el('div', { class: 'fontes-col-icon' }, meta.icon),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { class: 'fontes-col-title' }, meta.label),
          el('div', { class: 'fontes-col-desc' }, meta.desc),
        ]),
        el('div', { class: 'fontes-col-count' }, String(count)),
      ]),
      el('div', { class: 'fontes-col-body' },
        grupos[tipo].map(f => renderFonteCard(f, tipo))
      ),
    ]);

    kanban.appendChild(col);
  });

  if (tiposVisiveis.length === 0) {
    area.append(el('div', { class: 'stub-screen' }, [
      el('div', { class: 'stub-badge' }, 'vazio'),
      el('h2', {}, 'Este Cérebro ainda não tem fontes'),
      el('p', {}, 'Clique em "+ Alimentar" pra adicionar aulas, páginas, objeções, depoimentos, sacadas, externos. Cada fonte vira uma coluna aqui.'),
    ]));
    return;
  }

  area.append(kanban);
}

function renderFonteCard(fonte, tipo) {
  const origem = fonte.origem || 'upload';
  const origemCfg = ORIGEM_META[origem] || ORIGEM_META.upload;
  const data = fonte.criado_em ? new Date(fonte.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';

  const card = el('div', { class: 'fonte-card', onclick: () => abrirDrawer(fonte) }, [
    el('div', { class: 'fonte-card-title' }, fonte.titulo),
    el('div', { class: 'fonte-card-meta' }, [
      el('span', {
        class: 'fonte-origem-badge',
        style: `--or-color: ${origemCfg.color}`
      }, origemCfg.label),
      el('span', { class: 'fonte-card-date' }, data),
    ]),
    fonte.autor ? el('div', { class: 'fonte-card-autor' }, `por ${fonte.autor}`) : null,
  ]);

  return card;
}

/* Gera fontes fake pra estressar o layout de Kanban (10+ tipos, origens variadas) */
function gerarFontesMockadas(cerebro) {
  const nome = cerebro?.nome || 'Elo';
  const hoje = Date.now();
  const d = (daysAgo) => new Date(hoje - daysAgo * 86400000).toISOString();

  return [
    // Aulas (6)
    { id: 'm1', tipo: 'aula', titulo: `Aula 1 — Fundamentos do ${nome}`, origem: 'upload', autor: 'Luiz Fernando', criado_em: d(40) },
    { id: 'm2', tipo: 'aula', titulo: 'Aula 2 — Diagnóstico do aluno', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(38) },
    { id: 'm3', tipo: 'aula', titulo: 'Aula 3 — Protocolo 1: Raio-X', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(35) },
    { id: 'm4', tipo: 'aula', titulo: 'Aula 4 — Protocolo 2: Posicionamento', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(32) },
    { id: 'm5', tipo: 'aula', titulo: 'Aula 5 — Protocolo 3: Oferta irresistível', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(28) },
    { id: 'm6', tipo: 'aula', titulo: 'Aula 6 — Protocolo 4: Venda Viral', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(25) },

    // Páginas (3)
    { id: 'p1', tipo: 'pagina_venda', titulo: 'Página de vendas v1 (Abr/26)', origem: 'externo', autor: 'André', criado_em: d(20) },
    { id: 'p2', tipo: 'pagina_venda', titulo: 'Checkout order bump — Bônus Viral', origem: 'externo', autor: 'André', criado_em: d(18) },
    { id: 'p3', tipo: 'pagina_venda', titulo: 'VSL de abertura do Desafio', origem: 'externo', autor: 'Luiz Fernando', criado_em: d(15) },

    // Depoimentos Discord (5)
    { id: 'd1', tipo: 'depoimento', titulo: 'Aluna fechou R$8k no 3º dia', origem: 'discord', autor: '@maria.freitas', criado_em: d(3) },
    { id: 'd2', tipo: 'depoimento', titulo: 'Feedback sobre aula 4', origem: 'discord', autor: '@rodrigosa', criado_em: d(5) },
    { id: 'd3', tipo: 'depoimento', titulo: 'Resultado primeira semana', origem: 'whatsapp', autor: '+55 11 98…', criado_em: d(6) },
    { id: 'd4', tipo: 'depoimento', titulo: 'Virada de chave após Raio-X', origem: 'discord', autor: '@paula.hc', criado_em: d(8) },
    { id: 'd5', tipo: 'depoimento', titulo: 'Aluno triplicou faturamento', origem: 'telegram', autor: '@jc_marketing', criado_em: d(10) },

    // Objeções (4)
    { id: 'o1', tipo: 'objecao', titulo: '"Não tenho tempo pra implementar"', origem: 'scrap', autor: 'Grupo WhatsApp', criado_em: d(12) },
    { id: 'o2', tipo: 'objecao', titulo: '"Já tentei e não deu certo"', origem: 'scrap', autor: 'Grupo WhatsApp', criado_em: d(14) },
    { id: 'o3', tipo: 'objecao', titulo: '"Muito caro pra mim agora"', origem: 'discord', autor: '@lucas99', criado_em: d(16) },
    { id: 'o4', tipo: 'objecao', titulo: '"Preciso falar com meu sócio"', origem: 'whatsapp', autor: '+55 21 99…', criado_em: d(17) },

    // Sacadas (5)
    { id: 's1', tipo: 'sacada', titulo: 'Gatilho da urgência sazonal', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(2) },
    { id: 's2', tipo: 'sacada', titulo: 'Ancoragem R$47k → R$4.997', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(7) },
    { id: 's3', tipo: 'sacada', titulo: 'História do aluno da aula 2', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(11) },
    { id: 's4', tipo: 'sacada', titulo: 'Protocolo secreto: call de 90min', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(13) },
    { id: 's5', tipo: 'sacada', titulo: 'Script do último e-mail (88% open)', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(19) },

    // Pitch (2)
    { id: 'pi1', tipo: 'pitch', titulo: 'Abertura live — primeiros 7 min', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(22) },
    { id: 'pi2', tipo: 'pitch', titulo: 'Fechamento com prova social', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(21) },

    // FAQ (3)
    { id: 'f1', tipo: 'faq', titulo: 'Como funciona o acesso vitalício?', origem: 'upload', autor: 'Suporte', criado_em: d(24) },
    { id: 'f2', tipo: 'faq', titulo: 'Tem garantia de 7 dias?', origem: 'upload', autor: 'Suporte', criado_em: d(23) },
    { id: 'f3', tipo: 'faq', titulo: 'Funciona pra iniciantes?', origem: 'upload', autor: 'Suporte', criado_em: d(26) },

    // Externos (3)
    { id: 'e1', tipo: 'externo', titulo: 'Podcast Empreendendo — ep.142', origem: 'externo', autor: 'Rodrigo Perez', criado_em: d(45) },
    { id: 'e2', tipo: 'externo', titulo: 'Artigo concorrente — metodologia', origem: 'externo', autor: 'Agência X', criado_em: d(50) },
    { id: 'e3', tipo: 'externo', titulo: 'Benchmarks Dolphin', origem: 'externo', autor: 'Pedro Soli', criado_em: d(55) },

    // CSV (2)
    { id: 'c1', tipo: 'csv', titulo: 'Planilha de vendas T1/26', origem: 'csv', autor: 'FinOps', criado_em: d(33) },
    { id: 'c2', tipo: 'csv', titulo: 'Base de alunos ativos', origem: 'csv', autor: 'André', criado_em: d(34) },
  ];
}

/* ================================================================
   MODAL "+ Alimentar" — upload manual + configuração de cron
   Persiste no localStorage por enquanto (mission-control-fontes).
   Quando Supabase estiver conectado, esse blob vira bulk insert.
   ================================================================ */

const LS_KEY_FONTES = 'mc.fontes.v1';

function abrirModalAlimentar() {
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => {
    if (e.target === backdrop) fecharModal();
  }});
  const modal = el('div', { class: 'modal-card modal-alimentar' });
  modal.append(renderStepModo());
  backdrop.append(modal);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

function fecharModal() {
  const b = document.querySelector('.modal-backdrop');
  if (!b) return;
  b.classList.remove('open');
  setTimeout(() => b.remove(), 180);
}

/* --- PASSO 1: escolher modo (manual vs automático) --- */
function renderStepModo() {
  const step = el('div', { class: 'modal-step' });
  step.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, 'Alimentar Cérebro ' + (cerebroAtual?.nome || '')),
      el('div', { class: 'modal-sub' }, 'Como você quer adicionar fontes agora?'),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'modo-grid' }, [
        el('button', {
          class: 'modo-card',
          onclick: () => trocarStep(renderStepManual()),
        }, [
          el('div', { class: 'modo-icon' }, '📤'),
          el('div', { class: 'modo-title' }, 'Manual'),
          el('div', { class: 'modo-desc' }, 'Upload de arquivos (.md, .txt, .pdf, .csv), colar texto ou link. Você escolhe o tipo no próximo passo.'),
        ]),
        el('button', {
          class: 'modo-card',
          onclick: () => trocarStep(renderStepAutomatico()),
        }, [
          el('div', { class: 'modo-icon' }, '⏱'),
          el('div', { class: 'modo-title' }, 'Automático'),
          el('div', { class: 'modo-desc' }, 'Configurar cron que busca e classifica fontes recorrentes (Discord, WhatsApp, Telegram, RSS).'),
        ]),
      ]),
    ]),
  );
  return step;
}

function trocarStep(newStep) {
  const card = document.querySelector('.modal-alimentar');
  if (!card) return;
  card.innerHTML = '';
  card.append(newStep);
}

/* --- PASSO 2A: Manual --- */
function renderStepManual() {
  const TIPOS_CHIPS = [
    { k: 'aula', l: 'Aula' },
    { k: 'pagina_venda', l: 'Página' },
    { k: 'objecao', l: 'Objeção' },
    { k: 'depoimento', l: 'Depoimento' },
    { k: 'sacada', l: 'Sacada' },
    { k: 'pitch', l: 'Pitch' },
    { k: 'faq', l: 'FAQ' },
    { k: 'externo', l: 'Externo' },
    { k: 'csv', l: 'CSV' },
  ];

  let tipoSelecionado = 'aula';
  let arquivosSelecionados = [];

  const step = el('div', { class: 'modal-step' });

  const chips = el('div', { class: 'chips' });
  TIPOS_CHIPS.forEach((t, i) => {
    const c = el('button', {
      class: 'chip' + (i === 0 ? ' selected' : ''),
      onclick: () => {
        chips.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        tipoSelecionado = t.k;
        inputOutro.value = '';
      }
    }, t.l);
    chips.append(c);
  });

  const inputOutro = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Outro tipo (ex: entrevista, podcast, benchmark…)',
    oninput: (e) => {
      if (e.target.value.trim()) {
        chips.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
        tipoSelecionado = e.target.value.trim().toLowerCase().replace(/\s+/g, '_');
      }
    }
  });

  const listaArquivos = el('div', { class: 'arquivos-lista' });

  const renderListaArquivos = () => {
    listaArquivos.innerHTML = '';
    arquivosSelecionados.forEach((f, idx) => {
      listaArquivos.append(el('div', { class: 'arquivo-row' }, [
        el('span', { class: 'arquivo-icon' }, '📄'),
        el('span', { class: 'arquivo-nome' }, f.name),
        el('span', { class: 'arquivo-size' }, `${(f.size/1024).toFixed(1)} KB`),
        el('button', { class: 'arquivo-remove', onclick: () => {
          arquivosSelecionados.splice(idx, 1);
          renderListaArquivos();
        }}, '×'),
      ]));
    });
  };

  const inputArquivo = el('input', {
    type: 'file',
    multiple: '',
    accept: '.md,.txt,.pdf,.csv,.docx',
    style: 'display:none',
    id: 'modal-file-input',
    onchange: (e) => {
      arquivosSelecionados = [...arquivosSelecionados, ...Array.from(e.target.files)];
      renderListaArquivos();
    }
  });

  const btnUpload = el('button', {
    class: 'btn',
    onclick: () => inputArquivo.click()
  }, '📎 Selecionar arquivos');

  const textoColar = el('textarea', {
    class: 'textarea',
    placeholder: 'Ou cole texto aqui (transcrição, depoimento, etc)…',
    rows: '4',
  });

  const autorInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Autor (opcional — ex: Luiz Fernando, @user discord)',
  });

  const origemInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Origem (ex: upload, discord, whatsapp, scrap, expert)',
    value: 'upload',
  });

  const urlInput = el('input', {
    class: 'input',
    type: 'url',
    placeholder: 'URL da fonte (opcional)',
  });

  const btnSalvar = el('button', {
    class: 'btn btn-primary',
    onclick: () => {
      const arquivos = arquivosSelecionados;
      const textoPuro = textoColar.value.trim();
      if (arquivos.length === 0 && !textoPuro) {
        alert('Selecione ao menos 1 arquivo ou cole um texto.');
        return;
      }

      const novasFontes = [];

      arquivos.forEach(f => {
        novasFontes.push({
          id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6),
          cerebro_slug: cerebroAtual.slug,
          tipo: tipoSelecionado,
          titulo: f.name.replace(/\.[^.]+$/, ''),
          origem: origemInput.value.trim() || 'upload',
          autor: autorInput.value.trim() || null,
          criado_em: new Date().toISOString(),
          arquivo_nome: f.name,
          arquivo_size: f.size,
          url: urlInput.value.trim() || null,
        });
      });

      if (textoPuro) {
        const titulo = textoPuro.slice(0, 60).replace(/\n/g,' ') + (textoPuro.length > 60 ? '…' : '');
        novasFontes.push({
          id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
          cerebro_slug: cerebroAtual.slug,
          tipo: tipoSelecionado,
          titulo,
          conteudo_md: textoPuro,
          origem: origemInput.value.trim() || 'upload',
          autor: autorInput.value.trim() || null,
          criado_em: new Date().toISOString(),
          url: urlInput.value.trim() || null,
        });
      }

      salvarFontesLocais(novasFontes);
      fecharModal();

      alert(`${novasFontes.length} fonte${novasFontes.length === 1 ? '' : 's'} adicionada${novasFontes.length === 1 ? '' : 's'} ao Cérebro ${cerebroAtual.nome}.\n\nObs: salvo em localStorage (demo). Quando o Supabase estiver conectado, vira persist real no banco.`);

      abrirCerebroDetalhe(cerebroAtual.slug);
    }
  }, 'Alimentar Cérebro');

  step.append(
    el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-back', onclick: () => trocarStep(renderStepModo()) }, '‹'),
      el('h2', {}, 'Alimentação manual'),
      el('div', { class: 'modal-sub' }, `Cérebro ${cerebroAtual?.nome || ''} — adicione uma ou várias fontes`),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'field' }, [
        el('label', {}, 'Tipo da fonte'),
        chips,
        inputOutro,
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Arquivos'),
        btnUpload,
        inputArquivo,
        listaArquivos,
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Ou cole texto'),
        textoColar,
      ]),
      el('div', { class: 'row2' }, [
        el('div', { class: 'field' }, [
          el('label', {}, 'Origem'),
          origemInput,
        ]),
        el('div', { class: 'field' }, [
          el('label', {}, 'Autor'),
          autorInput,
        ]),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'URL (opcional)'),
        urlInput,
      ]),
    ]),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', onclick: fecharModal }, 'Cancelar'),
      btnSalvar,
    ]),
  );

  return step;
}

/* --- PASSO 2B: Automático (configura cron) --- */
function renderStepAutomatico() {
  const step = el('div', { class: 'modal-step' });

  step.append(
    el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-back', onclick: () => trocarStep(renderStepModo()) }, '‹'),
      el('h2', {}, 'Alimentação automática'),
      el('div', { class: 'modal-sub' }, 'Configure um cron que roda no Supabase'),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'cron-infobox' }, [
        el('strong', {}, '💡 Como funciona'),
        el('p', {}, 'Crons rodam direto no Supabase (pg_cron + edge functions) — não dependem do OpenClaw. Cada cron busca conteúdo num canal, classifica o tipo e grava no Cérebro correto automaticamente.'),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Fonte'),
        el('select', { class: 'input', id: 'cron-canal' }, [
          el('option', { value: 'discord' }, 'Discord (canal #depoimentos)'),
          el('option', { value: 'whatsapp' }, 'WhatsApp (grupo via webhook)'),
          el('option', { value: 'telegram' }, 'Telegram (bot + chat_id)'),
          el('option', { value: 'rss' }, 'RSS / feed externo'),
          el('option', { value: 'drive' }, 'Google Drive (pasta monitorada)'),
        ]),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Frequência'),
        el('select', { class: 'input', id: 'cron-freq' }, [
          el('option', { value: '*/15 * * * *' }, 'A cada 15 minutos'),
          el('option', { value: '0 * * * *' }, 'A cada hora'),
          el('option', { value: '0 */6 * * *' }, 'A cada 6 horas'),
          el('option', { value: '0 9 * * *' }, 'Diariamente às 9h'),
          el('option', { value: '0 9 * * 1' }, 'Semanalmente (segunda 9h)'),
        ]),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Tipo padrão (quando curador não conseguir classificar)'),
        el('input', { class: 'input', type: 'text', placeholder: 'ex: depoimento', id: 'cron-tipo', value: 'depoimento' }),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Observação'),
        el('textarea', { class: 'textarea', rows: '2', placeholder: 'Ex: Scrape do canal #depoimentos do Discord, prioridade tag @validado', id: 'cron-obs' }),
      ]),
    ]),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', onclick: fecharModal }, 'Cancelar'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          const canal = document.getElementById('cron-canal').value;
          const freq = document.getElementById('cron-freq').value;
          const tipo = document.getElementById('cron-tipo').value;
          const obs = document.getElementById('cron-obs').value;

          const cron = {
            id: 'cr' + Date.now(),
            cerebro_slug: cerebroAtual.slug,
            canal, freq, tipo_padrao: tipo, obs,
            criado_em: new Date().toISOString(),
            status: 'pendente_supabase',
          };

          const crons = JSON.parse(localStorage.getItem('mc.crons.v1') || '[]');
          crons.push(cron);
          localStorage.setItem('mc.crons.v1', JSON.stringify(crons));

          fecharModal();
          alert(`Cron configurado para ${cerebroAtual.nome}.\n\nCanal: ${canal}\nFrequência: ${freq}\n\nPendente de ativação no Supabase (pg_cron). Veja a tela Crons no sidebar.`);
        }
      }, 'Criar cron'),
    ]),
  );

  return step;
}

/* --- Persistência local --- */
function salvarFontesLocais(fontes) {
  const atual = JSON.parse(localStorage.getItem(LS_KEY_FONTES) || '[]');
  atual.push(...fontes);
  localStorage.setItem(LS_KEY_FONTES, JSON.stringify(atual));
}

export function lerFontesLocaisPorCerebro(slug) {
  const atual = JSON.parse(localStorage.getItem(LS_KEY_FONTES) || '[]');
  return atual.filter(f => f.cerebro_slug === slug);
}
