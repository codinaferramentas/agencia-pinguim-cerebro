/* Mission Control — bootstrap + nav + statusbar
   Orquestra o lazy-load das telas.
*/

import { dataMode, fetchOperacaoData, fetchRoadmapData, fetchCerebrosCatalogo } from './sb-client.js?v=20260421p';
import { renderHome } from './home.js?v=20260421p';
import { renderCerebros, initDrawer, abrirCerebroDetalhe } from './cerebros.js?v=20260430l';
import { renderCrons } from './crons.js?v=20260421p';
import { renderSkills, abrirSkillDetalhe } from './skills.js?v=20260427o';
import { renderStub } from './stubs.js?v=20260421p';
import { iconeNode } from './icone.js?v=20260425g';
import { renderDocs, renderDocDetalhe, DOCS_CATALOGO } from './docs.js?v=20260502a';
import { renderIntegracoes } from './integracoes.js?v=20260425n';
import { renderMapaSistema } from './mapa-sistema.js?v=20260428p';
import { renderSeguranca } from './seguranca.js?v=20260501b';
import { renderFinOps } from './finops.js?v=20260501e';
import { renderFunis } from './funis.js?v=20260428p';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'data') Object.entries(attrs[k]).forEach(([dk, dv]) => n.dataset[dk] = dv);
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
};

const STATUS_LABELS = {
  planejado: 'Planejado', em_criacao: 'Em criação', em_teste: 'Em teste',
  em_producao: 'Em produção', pausado: 'Pausado', em_execucao: 'Em execução',
  priorizado: 'Priorizado', backlog: 'Backlog', bloqueado: 'Bloqueado',
};

const KANBAN_COLS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

const STUB_PAGES = ['conteudo', 'trafego', 'vendas', 'suporte', 'biblioteca', 'debug'];

/* -------- Navegação --------
   Sempre re-renderiza a página ao navegar — evita estado "preso" de um
   detalhe antigo (ex: clicar em Cérebros mas ainda ver o detalhe do Elo
   da última vez). Lazy é bom pra inicialização; navegação explicita
   deve ser sempre fresca.
*/
let paginaAtual = null;

async function navegar(pageSlug, { forcarRender = true } = {}) {
  paginaAtual = pageSlug;
  document.getElementById('drawer')?.classList.remove('open');
  $$('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === pageSlug));
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageSlug);
  if (!page) return;
  page.classList.add('active');

  if (!forcarRender) return;

  try {
    switch (pageSlug) {
      case 'home':      await renderHome(); break;
      case 'cerebros':  await renderCerebros(); break;
      case 'personas':  await renderPersonas(); break;
      case 'docs':      await renderDocs(); break;
      case 'integracoes': await renderIntegracoes(); break;
      case 'funis':     await renderFunis(); break;
      case 'operacao':  await renderOperacao(); break;
      case 'agentes':   await renderAgentes(); break;
      case 'squads':    await renderSquadsPage(); break;
      case 'crons':     await renderCrons(); break;
      case 'skills':    await renderSkills(); break;
      case 'mapa':      await renderMapaSistema(); break;
      case 'roadmap':   await renderRoadmap(); break;
      case 'qualidade': await renderQualidade(); break;
      case 'seguranca': await renderSeguranca(); break;
      case 'finops':    await renderFinOps(); break;
      default:
        if (STUB_PAGES.includes(pageSlug)) renderStub(pageSlug);
    }
  } catch (err) {
    console.error('Erro ao renderizar', pageSlug, err);
    page.innerHTML = `<div style="padding:2rem;color:var(--status-alerta)">Erro: ${err.message}</div>`;
  }
}

function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function fecharMobileMenu() {
  document.body.classList.remove('mobile-menu-open');
}
function abrirMobileMenu() {
  document.body.classList.add('mobile-menu-open');
}

function setupMobileMenu() {
  const btn = $('#mobile-menu-btn');
  const overlay = $('#mobile-overlay');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.body.classList.toggle('mobile-menu-open');
  });
  overlay?.addEventListener('click', fecharMobileMenu);
  // Fecha menu ao redimensionar pra desktop
  window.addEventListener('resize', () => {
    if (!isMobile()) fecharMobileMenu();
  });
}

function setupNav() {
  const STORAGE_KEY_COLLAPSED = 'pinguim_nav_collapsed';
  const app = document.querySelector('.app');

  // ---- Recolhimento da sidebar inteira (botao << do topo + Ctrl+B) ----
  function isCollapsed() { return app.classList.contains('nav-collapsed'); }
  function setCollapsed(collapsed) {
    if (collapsed) app.classList.add('nav-collapsed');
    else app.classList.remove('nav-collapsed');
    try { localStorage.setItem(STORAGE_KEY_COLLAPSED, collapsed ? '1' : '0'); } catch {}
  }
  try {
    if (localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1') setCollapsed(true);
  } catch {}

  $('#nav-collapse')?.addEventListener('click', () => setCollapsed(!isCollapsed()));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      setCollapsed(!isCollapsed());
    }
  });

  // ---- Footer items (Documentacao) ----
  $$('.nav-footer .nav-item').forEach(item => {
    item.addEventListener('click', async () => {
      const slug = item.dataset.page;
      if (slug) {
        await navegar(slug);
        if (isMobile()) fecharMobileMenu();
      }
    });
  });

  // ---- Renderiza arvore primaria (Cerebros / Personas / Integracoes) ----
  renderNavTree();

  // ---- Eventos canonicos de detalhe ----
  window.addEventListener('cerebro:select', async (ev) => {
    const slug = ev.detail?.slug;
    if (!slug) return;
    await irParaDetalhe('cerebros', slug);
  });
  window.addEventListener('cerebro:filtrar-familia', async (ev) => {
    const cat = ev.detail?.categoria;
    if (paginaAtual !== 'cerebros') {
      await navegar('cerebros');
    }
    if (cat) window.__aplicarFiltroFamilia?.(cat);
    else window.__limparFiltroFamilia?.();
  });
  window.addEventListener('persona:select', async (ev) => {
    const slug = ev.detail?.slug;
    if (!slug) return;
    await irParaDetalhe('personas', slug);
  });
  window.addEventListener('skill:select', async (ev) => {
    const slug = ev.detail?.slug;
    if (!slug) return;
    await irParaDetalhe('skills', slug);
  });
  window.addEventListener('skill:filtrar-categoria', async (ev) => {
    const cat = ev.detail?.categoria;
    if (paginaAtual !== 'skills') await navegar('skills');
    if (cat) window.__aplicarFiltroSkillCategoria?.(cat);
    else window.__limparFiltroSkillCategoria?.();
  });
  window.addEventListener('docs:select', async (ev) => {
    const slug = ev.detail?.slug;
    if (!slug) return;
    await irParaDetalhe('docs', slug);
  });
  window.addEventListener('docs:back', async () => {
    await navegar('docs');
  });
  window.addEventListener('mapa:navegar', async (ev) => {
    const slug = ev.detail?.slug;
    if (!slug) return;
    await navegar(slug);
    renderNavTree();
  });
}

// ---- Estado da arvore (quem esta aberto) — persistido em localStorage ----
const NAV_OPEN = (() => {
  try {
    const raw = localStorage.getItem('pinguim_nav_open');
    return raw ? JSON.parse(raw) : { cerebros: false, skills: false, personas: false, cerebros_cat: {}, skills_cat: {} };
  } catch {
    return { cerebros: false, skills: false, personas: false, cerebros_cat: {}, skills_cat: {} };
  }
})();
if (!NAV_OPEN.cerebros_cat) NAV_OPEN.cerebros_cat = {};
if (!NAV_OPEN.skills_cat) NAV_OPEN.skills_cat = {};
if (!NAV_OPEN.cerebros_subcat) NAV_OPEN.cerebros_subcat = {};
function persistNavOpen() {
  try { localStorage.setItem('pinguim_nav_open', JSON.stringify(NAV_OPEN)); } catch {}
}

const NAV_PRIMARY = [
  { slug: 'cerebros',    label: 'Cérebros',         icon: '⚛',  tree: true,  treeLoader: () => loadCerebrosTree() },
  { slug: 'skills',      label: 'Skills',           icon: '🛠', tree: true,  treeLoader: () => loadSkillsTree() },
  { slug: 'personas',    label: 'Personas',         icon: '👤', tree: true,  treeLoader: () => loadPersonasTree() },
  { slug: 'funis',       label: 'Funis',            icon: '🎯', tree: false },
  { slug: 'finops',      label: 'FinOps',           icon: '💰', tree: false },
  { slug: 'seguranca',   label: 'Segurança',        icon: '🛡', tree: false },
  { slug: 'integracoes', label: 'Integrações',      icon: '🔌', tree: false },
];

/**
 * Atualizacao incremental: troca classe .active nas folhas da arvore
 * SEM destruir/recriar o sidebar inteiro. Evita flash visual ao trocar
 * de Cerebro/Persona/Skill ativo.
 */
function marcarLeafAtivo(slug) {
  const list = $('#nav-list');
  if (!list) return;
  list.querySelectorAll('.nav-leaf').forEach(leaf => {
    leaf.classList.toggle('active', leaf.dataset.id === slug);
  });
}

/**
 * Cache em memoria dos dados que alimentam treeLoaders. Evita refetch ao
 * banco a cada toggle de categoria/abertura/fechamento. Invalidar via
 * window.__invalidarCacheNav() quando Cerebro/Skill/Persona for criado,
 * editado ou apagado.
 */
const NAV_CACHE = {
  cerebros: null,
  skills: null,
  personas: null,
};
window.__invalidarCacheNav = function(qual) {
  if (qual) NAV_CACHE[qual] = null;
  else { NAV_CACHE.cerebros = null; NAV_CACHE.skills = null; NAV_CACHE.personas = null; }
};

async function renderNavTree() {
  const list = $('#nav-list');
  if (!list) return;
  list.innerHTML = '';

  for (const nav of NAV_PRIMARY) {
    if (!nav.tree) {
      const item = el('button', {
        class: 'nav-item' + (paginaAtual === nav.slug ? ' active' : ''),
        type: 'button',
        data: { page: nav.slug },
        title: nav.label,
        onclick: async () => {
          await navegar(nav.slug);
          renderNavTree();
          if (isMobile()) fecharMobileMenu();
        },
      }, [
        el('span', { class: 'nav-icon' }, nav.icon),
        el('span', { class: 'nav-label' }, nav.label),
      ]);
      list.appendChild(item);
      continue;
    }

    // Item com arvore (Cerebros, Personas)
    const wrap = el('div', { class: 'nav-item-wrap' + (NAV_OPEN[nav.slug] ? ' open' : '') });
    const head = el('button', {
      class: 'nav-item has-sub' + (paginaAtual === nav.slug ? ' active' : '') + (NAV_OPEN[nav.slug] ? ' open' : ''),
      type: 'button',
      data: { page: nav.slug },
      title: nav.label,
      onclick: async () => {
        const app = document.querySelector('.app');
        // Sidebar recolhida: clique simples expande sidebar e abre arvore
        if (app.classList.contains('nav-collapsed')) {
          app.classList.remove('nav-collapsed');
          try { localStorage.setItem('pinguim_nav_collapsed', '0'); } catch {}
          NAV_OPEN[nav.slug] = true;
        } else {
          NAV_OPEN[nav.slug] = !NAV_OPEN[nav.slug];
        }
        persistNavOpen();
        await navegar(nav.slug);
        renderNavTree();
        if (isMobile()) fecharMobileMenu();
      },
    }, [
      el('span', { class: 'nav-icon' }, nav.icon),
      el('span', { class: 'nav-label' }, nav.label),
      el('span', { class: 'nav-caret' }, '›'),
    ]);
    wrap.appendChild(head);

    if (NAV_OPEN[nav.slug]) {
      const sub = el('div', { class: 'nav-sub' });
      wrap.appendChild(sub);

      // Se ja tem cache, renderiza SINCRONO sem mostrar "Carregando..."
      const cacheKey = nav.slug; // 'cerebros' | 'skills' | 'personas'
      const temCache = NAV_CACHE[cacheKey] != null;

      if (!temCache) {
        sub.appendChild(el('div', { class: 'nav-loading' }, 'Carregando…'));
      }

      nav.treeLoader().then(nodes => {
        sub.innerHTML = '';
        if (nodes.length === 0) {
          sub.appendChild(el('div', { class: 'nav-empty' }, 'Vazio'));
          return;
        }
        nodes.forEach(node => sub.appendChild(node));
      }).catch(err => {
        sub.innerHTML = '';
        sub.appendChild(el('div', { class: 'nav-empty', style: 'color:var(--danger)' }, 'Erro'));
        console.error('nav tree', nav.slug, err);
      });
    }

    list.appendChild(wrap);
  }
}

// Loader: arvore de Cerebros (4 categorias com toggle individual)
async function loadCerebrosTree() {
  if (!NAV_CACHE.cerebros) NAV_CACHE.cerebros = await fetchCerebrosCatalogo();
  const cerebros = NAV_CACHE.cerebros;
  const filtrados = cerebros.filter(c => c.slug !== 'pinguim');
  const ordemFamilias = ['interno', 'externo', 'metodologia', 'clone'];
  const labelFamilia = {
    interno: 'Internos', externo: 'Externos',
    metodologia: 'Metodologias', clone: 'Clones',
  };
  const iconFamilia = {
    interno: '📦', externo: '🔍', metodologia: '📚', clone: '👤',
  };

  const nodes = [];
  ordemFamilias.forEach(cat => {
    const doGrupo = filtrados
      .filter(c => (c.categoria || 'interno') === cat)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    const aberto = !!NAV_OPEN.cerebros_cat[cat];
    const catWrap = el('div', { class: 'nav-cat-wrap' + (aberto ? ' open' : '') });
    const catBtn = el('button', {
      class: 'nav-cat' + (aberto ? ' open' : ''),
      type: 'button',
      title: labelFamilia[cat],
      onclick: async () => {
        const vaiAbrir = !NAV_OPEN.cerebros_cat[cat];
        // Comportamento: abrir uma categoria fecha as outras (uma por vez).
        // Isso casa com o filtro da pagina principal — uma familia ativa.
        if (vaiAbrir) {
          ordemFamilias.forEach(c => { NAV_OPEN.cerebros_cat[c] = false; });
          NAV_OPEN.cerebros_cat[cat] = true;
        } else {
          NAV_OPEN.cerebros_cat[cat] = false;
        }
        persistNavOpen();
        if (paginaAtual !== 'cerebros') await navegar('cerebros');
        window.dispatchEvent(new CustomEvent('cerebro:filtrar-familia', {
          detail: { categoria: vaiAbrir ? cat : null }
        }));
        renderNavTree();
      },
    }, [
      el('span', { class: 'nav-cat-icon' }, iconFamilia[cat]),
      el('span', { class: 'nav-cat-label' }, labelFamilia[cat]),
      el('span', { class: 'nav-cat-count' }, String(doGrupo.length)),
      el('span', { class: 'nav-cat-caret' }, '›'),
    ]);
    catWrap.appendChild(catBtn);

    if (aberto) {
      const catSub = el('div', { class: 'nav-cat-sub' });
      if (doGrupo.length === 0) {
        catSub.appendChild(el('div', { class: 'nav-empty' }, 'Nenhum ainda'));
      } else if (cat === 'clone') {
        // Clones agrupam em 2 familias visuais: Socios + Especialistas.
        // Especialistas tem 12 squads canonicas (fonte: ecossistema-squads-completo.html).
        // Cada squad e colapsavel; rotulos e dominios vem do JSON do ecossistema.
        const ESPECIALISTAS_ORDEM = [
          'advisory-board',
          'copy',
          'storytelling',
          'traffic-masters',
          'design',
          'data',
          'deep-research',
          'finops',
          'legal',
          'cybersecurity',
          'translate',
          'squad-creator-pro',
        ];
        const SQUAD_INFO = {
          'advisory-board':    { titulo: 'Advisory Board',  dominio: 'People & Psychology' },
          'copy':              { titulo: 'Copywriters',     dominio: 'Content & Marketing' },
          'storytelling':      { titulo: 'Storytellers',    dominio: 'Content & Marketing' },
          'traffic-masters':   { titulo: 'Traffic Masters', dominio: 'Content & Marketing' },
          'design':            { titulo: 'Design',          dominio: 'Design & UX' },
          'data':              { titulo: 'Data',            dominio: 'Data & Analytics' },
          'deep-research':     { titulo: 'Deep Research',   dominio: 'Data & Analytics' },
          'finops':            { titulo: 'FinOps',          dominio: 'Business Operations' },
          'legal':             { titulo: 'Legal',           dominio: 'Business Operations' },
          'cybersecurity':     { titulo: 'Cybersecurity',   dominio: 'Technical' },
          'translate':         { titulo: 'Translate',       dominio: 'Communication' },
          'squad-creator-pro': { titulo: 'Squad Creator Pro', dominio: 'Meta & Frameworks' },
        };

        const porSub = {};
        doGrupo.forEach(c => {
          const sub = c.subcategoria || 'outros';
          (porSub[sub] = porSub[sub] || []).push(c);
        });

        function renderLeaf(c) {
          const id = c.slug || c.id;
          const ativo = window.__cerebroAtivoSlug === id;
          return el('button', {
            class: 'nav-leaf nav-leaf-deep' + (ativo ? ' active' : ''),
            type: 'button',
            data: { id },
            title: c.nome,
            onclick: () => {
              window.__cerebroAtivoSlug = id;
              window.dispatchEvent(new CustomEvent('cerebro:select', { detail: { slug: id } }));
              marcarLeafAtivo(id);
              if (isMobile()) fecharMobileMenu();
            },
          }, [
            iconeNode({ icone_url: c.icone_url, emoji: c.emoji, nome: c.nome }, { size: 'sm', className: 'nav-leaf-icon' }),
            el('span', { class: 'nav-leaf-label' }, c.nome),
            (c.total_fontes != null) ? el('span', { class: 'nav-leaf-meta' }, String(c.total_fontes)) : null,
          ]);
        }

        // ---- Familia 1: Socios Pinguim ----
        const socios = porSub['socio_pinguim'] || [];
        if (socios.length) {
          const sociosKey = 'fam_socios';
          const sociosAberto = !!NAV_OPEN.cerebros_subcat[sociosKey];
          catSub.appendChild(el('button', {
            class: 'nav-subcat-toggle' + (sociosAberto ? ' open' : ''),
            type: 'button',
            onclick: () => {
              NAV_OPEN.cerebros_subcat[sociosKey] = !NAV_OPEN.cerebros_subcat[sociosKey];
              persistNavOpen();
              renderNavTree();
            },
          }, [
            el('span', { class: 'nav-subcat-caret' }, '›'),
            el('span', { class: 'nav-subcat-label-text' }, 'Sócios Pinguim'),
            el('span', { class: 'nav-subcat-count' }, String(socios.length)),
          ]));
          if (sociosAberto) socios.forEach(c => catSub.appendChild(renderLeaf(c)));
        }

        // ---- Familia 2: Especialistas (12 squads canonicas) ----
        const totalEsp = ESPECIALISTAS_ORDEM.reduce((acc, sq) => acc + (porSub[sq]?.length || 0), 0);
        if (totalEsp > 0) {
          const espKey = 'fam_especialistas';
          const espAberto = !!NAV_OPEN.cerebros_subcat[espKey];
          catSub.appendChild(el('button', {
            class: 'nav-subcat-toggle' + (espAberto ? ' open' : ''),
            type: 'button',
            onclick: () => {
              NAV_OPEN.cerebros_subcat[espKey] = !NAV_OPEN.cerebros_subcat[espKey];
              persistNavOpen();
              renderNavTree();
            },
          }, [
            el('span', { class: 'nav-subcat-caret' }, '›'),
            el('span', { class: 'nav-subcat-label-text' }, 'Especialistas'),
            el('span', { class: 'nav-subcat-count' }, String(totalEsp)),
          ]));

          if (espAberto) {
            ESPECIALISTAS_ORDEM.forEach(sq => {
              const lista = porSub[sq];
              if (!lista || !lista.length) return;
              const info = SQUAD_INFO[sq] || { titulo: sq, dominio: '' };
              const sqAberto = !!NAV_OPEN.cerebros_subcat[sq];
              const sqBtn = el('button', {
                class: 'nav-squad-toggle' + (sqAberto ? ' open' : ''),
                type: 'button',
                onclick: () => {
                  NAV_OPEN.cerebros_subcat[sq] = !NAV_OPEN.cerebros_subcat[sq];
                  persistNavOpen();
                  renderNavTree();
                },
              }, [
                el('span', { class: 'nav-squad-caret' }, '›'),
                el('span', { class: 'nav-squad-text' }, [
                  el('span', { class: 'nav-squad-titulo' }, info.titulo),
                  el('span', { class: 'nav-squad-dominio' }, info.dominio),
                ]),
                el('span', { class: 'nav-squad-count' }, String(lista.length)),
              ]);
              catSub.appendChild(sqBtn);
              if (sqAberto) lista.forEach(c => catSub.appendChild(renderLeaf(c)));
            });
          }
        }
      } else {
        doGrupo.forEach(c => {
          const id = c.slug || c.id;
          const ativo = window.__cerebroAtivoSlug === id;
          const leaf = el('button', {
            class: 'nav-leaf' + (ativo ? ' active' : ''),
            type: 'button',
            data: { id },
            title: c.nome,
            onclick: () => {
              window.__cerebroAtivoSlug = id;
              window.dispatchEvent(new CustomEvent('cerebro:select', { detail: { slug: id } }));
              marcarLeafAtivo(id);
              if (isMobile()) fecharMobileMenu();
            },
          }, [
            iconeNode({ icone_url: c.icone_url, emoji: c.emoji, nome: c.nome }, { size: 'sm', className: 'nav-leaf-icon' }),
            el('span', { class: 'nav-leaf-label' }, c.nome),
            (c.total_fontes != null) ? el('span', { class: 'nav-leaf-meta' }, String(c.total_fontes)) : null,
          ]);
          catSub.appendChild(leaf);
        });
      }
      catWrap.appendChild(catSub);
    }
    nodes.push(catWrap);
  });
  return nodes;
}

// Loader: arvore de Skills (3 categorias com toggle individual)
async function loadSkillsTree() {
  if (!NAV_CACHE.skills) {
    const { fetchSkillsCatalogo } = await import('./sb-client.js');
    NAV_CACHE.skills = await fetchSkillsCatalogo();
  }
  const skills = NAV_CACHE.skills;
  const ordemCategorias = ['universal', 'por_area', 'especifica'];
  const labelCategoria = {
    universal: 'Universais', por_area: 'Por Área', especifica: 'Específicas',
  };
  const iconCategoria = {
    universal: '🧰', por_area: '🎯', especifica: '🎁',
  };

  const nodes = [];
  ordemCategorias.forEach(cat => {
    const doGrupo = skills
      .filter(s => s.categoria === cat)
      .sort((a, b) => (a.area || '').localeCompare(b.area || '') || (a.nome || '').localeCompare(b.nome || ''));

    const aberto = !!NAV_OPEN.skills_cat[cat];
    const catWrap = el('div', { class: 'nav-cat-wrap' + (aberto ? ' open' : '') });
    const catBtn = el('button', {
      class: 'nav-cat' + (aberto ? ' open' : ''),
      type: 'button',
      title: labelCategoria[cat],
      onclick: async () => {
        const vaiAbrir = !NAV_OPEN.skills_cat[cat];
        if (vaiAbrir) {
          ordemCategorias.forEach(c => { NAV_OPEN.skills_cat[c] = false; });
          NAV_OPEN.skills_cat[cat] = true;
        } else {
          NAV_OPEN.skills_cat[cat] = false;
        }
        persistNavOpen();
        if (paginaAtual !== 'skills') await navegar('skills');
        window.dispatchEvent(new CustomEvent('skill:filtrar-categoria', {
          detail: { categoria: vaiAbrir ? cat : null }
        }));
        renderNavTree();
      },
    }, [
      el('span', { class: 'nav-cat-icon' }, iconCategoria[cat]),
      el('span', { class: 'nav-cat-label' }, labelCategoria[cat]),
      el('span', { class: 'nav-cat-count' }, String(doGrupo.length)),
      el('span', { class: 'nav-cat-caret' }, '›'),
    ]);
    catWrap.appendChild(catBtn);

    if (aberto) {
      const catSub = el('div', { class: 'nav-cat-sub' });
      if (doGrupo.length === 0) {
        catSub.appendChild(el('div', { class: 'nav-empty' }, 'Vazio'));
      } else {
        doGrupo.forEach(s => {
          const ativo = window.__skillAtivoSlug === s.slug;
          const statusEmoji = s.status === 'ativa' ? '🟢' : s.status === 'em_construcao' ? '🟡' : '⚪';
          const leaf = el('button', {
            class: 'nav-leaf' + (ativo ? ' active' : ''),
            type: 'button',
            data: { id: s.slug },
            title: `${s.nome} · ${s.status}`,
            onclick: () => {
              window.__skillAtivoSlug = s.slug;
              window.dispatchEvent(new CustomEvent('skill:select', { detail: { slug: s.slug } }));
              marcarLeafAtivo(s.slug);
              if (isMobile()) fecharMobileMenu();
            },
          }, [
            el('span', { class: 'nav-leaf-icon', style: 'font-size:.75rem' }, statusEmoji),
            el('span', { class: 'nav-leaf-label' }, s.nome),
            (s.total_agentes > 0) ? el('span', { class: 'nav-leaf-meta' }, `${s.total_agentes}a`) : null,
          ]);
          catSub.appendChild(leaf);
        });
      }
      catWrap.appendChild(catSub);
    }
    nodes.push(catWrap);
  });
  return nodes;
}

// Loader: arvore de Personas (flat)
async function loadPersonasTree() {
  if (!NAV_CACHE.cerebros) NAV_CACHE.cerebros = await fetchCerebrosCatalogo();
  const cerebros = NAV_CACHE.cerebros;
  // Personas SO existem para Cerebros Internos e Externos.
  // Metodologias (SPIN, MEDDIC, etc) e Clones nao tem Persona.
  const lista = cerebros
    .filter(c => (c.total_fontes || 0) > 0)
    .filter(c => {
      const cat = c.categoria || 'interno';
      return cat === 'interno' || cat === 'externo';
    })
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  return lista.map(c => {
    const id = c.slug || c.id;
    const ativo = window.__personaAtivoSlug === id;
    return el('button', {
      class: 'nav-leaf' + (ativo ? ' active' : ''),
      type: 'button',
      data: { id },
      title: c.nome,
      onclick: () => {
        window.__personaAtivoSlug = id;
        window.dispatchEvent(new CustomEvent('persona:select', { detail: { slug: id } }));
        marcarLeafAtivo(id);
        if (isMobile()) fecharMobileMenu();
      },
    }, [
      iconeNode({ icone_url: c.icone_url, emoji: c.emoji, nome: c.nome }, { size: 'sm', className: 'nav-leaf-icon' }),
      el('span', { class: 'nav-leaf-label' }, c.nome),
    ]);
  });
}

// Garante: pagina ativa+renderizada -> abre detalhe especifico.
// Sem essa serializacao acontecia race (clique rapido na sidebar abria
// detalhe na pagina errada porque o listener interno ainda nao existia).
async function irParaDetalhe(pagina, slug) {
  // 1. Navega ate a pagina (await garante render completo)
  if (paginaAtual !== pagina) {
    await navegar(pagina);
  }
  // 2. Abre detalhe — funcao explicita ao inves de listener interno
  if (pagina === 'cerebros') {
    await abrirCerebroDetalhe(slug);
  } else if (pagina === 'personas') {
    await renderPersonaDetalhe(slug);
  } else if (pagina === 'docs') {
    await renderDocDetalhe(slug);
  } else if (pagina === 'skills') {
    await abrirSkillDetalhe(slug);
  }
}

/* -------- Compatibilidade com modulos antigos --------
   Outros modulos (cerebros.js, personas.js, etc) ainda chamam
   window.__refrescarSubnav e window.__marcarSubnavAtivo. Hoje a "subnav"
   virou a propria arvore da nav — entao essas funcoes recarregam/marcam
   na arvore. */

window.__refrescarSubnav = function refrescarSubnavAtual() {
  // Re-renderiza a arvore inteira (recarrega contadores e listas)
  renderNavTree();
};

window.__marcarSubnavAtivo = function marcarSubnavAtivo(id) {
  // Heuristica: se estamos na pagina cerebros, marca cerebro ativo;
  // se na pagina personas, marca persona ativa.
  if (paginaAtual === 'cerebros') window.__cerebroAtivoSlug = id;
  else if (paginaAtual === 'personas') window.__personaAtivoSlug = id;
  renderNavTree();
};

window.addEventListener('dados:atualizado', () => {
  renderNavTree();
});

/* -------- Barra de status -------- */
async function atualizarStatusbar() {
  $('#sb-modo').textContent = dataMode() === 'supabase' ? 'SUPABASE' : 'OFFLINE';
  $('#sb-db').textContent = dataMode() === 'supabase' ? 'conectado' : 'JSON local';

  try {
    const [cerebros, op] = await Promise.all([fetchCerebrosCatalogo(), fetchOperacaoData()]);
    $('#sb-cerebros').textContent = cerebros.length;
    $('#sb-agentes').textContent = op.agentes.length;
    $('#sb-tasks').textContent = op.tasks.filter(t => t.status !== 'done').length;
  } catch {
    $('#sb-cerebros').textContent = '?';
    $('#sb-agentes').textContent = '?';
    $('#sb-tasks').textContent = '?';
  }

  function updateHora() {
    $('#sb-hora').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  updateHora();
  setInterval(updateHora, 1000);

  // Nav footer
  const badge = $('#nav-env-badge');
  if (badge) {
    badge.textContent = 'V0';
    const userEmail = await (async () => {
      try {
        const sb = (await import('./sb-client.js')).getSupabaseClient();
        if (!sb) return null;
        const { data } = await sb.auth.getUser();
        return data?.user?.email || null;
      } catch { return null; }
    })();
    badge.title = userEmail
      ? `${userEmail} · ${dataMode() === 'supabase' ? 'Supabase' : 'Offline'}`
      : (dataMode() === 'supabase' ? 'V0 · Supabase' : 'V0 · Offline');
  }
}

/* -------- Telas migradas do V0 antigo -------- */

/* Personas — output gerado a partir do Cérebro. Editável com aviso.
   Listener de persona:select vive em setupNav() (roteamento canonico),
   nao aqui — pra evitar race condition de "clica antes do render". */
async function renderPersonas(slugPreSelecionado) {
  const page = $('#page-personas');
  page.innerHTML = '';

  const cerebros = await fetchCerebrosCatalogo();
  // Cérebro é o pai de tudo: Persona só existe se o Cérebro tem fontes
  const comConteudo = cerebros.filter(c => (c.total_fontes || 0) > 0);

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Personas'),
        el('div', { class: 'page-subtitle' }, 'Uma persona por produto, gerada e mantida automaticamente pelo Cérebro. Cada alimentação do Cérebro atualiza a Persona.'),
      ]),
    ]),
    comConteudo.length === 0
      ? el('div', { class: 'stub-screen' }, [
          el('div', { class: 'stub-badge' }, 'sem dados'),
          el('h2', {}, 'Alimente um Cérebro primeiro'),
          el('p', {}, 'A Persona é gerada automaticamente a partir das fontes de cada Cérebro. Enquanto nenhum Cérebro tiver conteúdo, não há Persona pra mostrar.'),
          el('button', {
            class: 'btn btn-primary',
            style: 'margin-top:1rem',
            onclick: () => { document.querySelector('.nav-item[data-page="cerebros"]').click(); },
          }, 'Ir pra Cérebros →'),
        ])
      : el('div', { class: 'cerebros-grid' },
          comConteudo.map(c => el('div', {
            class: 'cerebro-card',
            onclick: () => renderPersonaDetalhe(c.slug)
          }, [
            el('div', { class: 'cerebro-card-top' }, [
              iconeNode({ icone_url: c.icone_url, emoji: c.emoji || '👤', nome: c.nome }, { size: 'lg', className: 'cerebro-emoji' }),
              el('div', { style: 'flex:1;min-width:0' }, [
                el('div', { class: 'cerebro-nome' }, 'Persona ' + c.nome),
                el('div', { class: 'cerebro-desc' }, 'Derivada do Cérebro ' + c.nome),
              ]),
            ]),
            el('div', { class: 'persona-status' }, [
              el('span', { class: 'persona-status-dot' }),
              el('span', {}, 'Atualizada após última alimentação'),
            ]),
          ]))
        )
  );

  if (slugPreSelecionado) renderPersonaDetalhe(slugPreSelecionado);
}

let personaReloadListenerReady = false;

async function renderPersonaDetalhe(slug) {
  const cerebros = await fetchCerebrosCatalogo();
  const c = cerebros.find(x => x.slug === slug);
  if (!c) return;

  // Mantém subnav sincronizado
  window.__marcarSubnavAtivo?.(slug);

  // Listener pra recarregar quando usuario edita um campo
  if (!personaReloadListenerReady) {
    personaReloadListenerReady = true;
    window.addEventListener('persona:reload', () => {
      const slugAtual = window.__personaSlugAtual;
      if (slugAtual) renderPersonaDetalhe(slugAtual);
    });
  }
  window.__personaSlugAtual = slug;

  const page = $('#page-personas');
  page.innerHTML = '';

  const total = c.total_fontes || 0;
  const temDados = total > 0;

  const { fetchPersonaCompleta, gerarPersonaComProgresso, renderBlocoNoPainel, exportarPDF, abrirHistoricoVersoes } = await import('./personas.js?v=20260425e');
  const persona = temDados ? await fetchPersonaCompleta(slug) : null;

  const ultimaSintese = persona
    ? `Última síntese: ${new Date(persona.atualizado_em).toLocaleString('pt-BR')}`
    : (temDados ? 'Persona ainda não gerada — clique em "Gerar agora"' : 'Aguardando 1ª alimentação');

  page.append(
    el('div', { class: 'cerebro-detail' }, [
      el('div', { class: 'cerebro-detail-header' }, [
        iconeNode({ icone_url: c.icone_url, emoji: c.emoji || '👤', nome: c.nome }, { size: 'xl', className: 'cerebro-emoji' }),
        el('div', { style: 'flex:1' }, [
          el('div', { class: 'cerebro-nome' }, 'Persona ' + c.nome),
          el('div', { class: 'cerebro-desc' }, 'Dossiê derivado do Cérebro ' + c.nome),
          el('div', { style: 'display:flex;gap:.75rem;margin-top:.5rem;font-size:.75rem;color:var(--fg-muted);flex-wrap:wrap' }, [
            el('span', {}, `Cérebro: ${total} fonte${total === 1 ? '' : 's'}`),
            el('span', {}, ultimaSintese),
            persona ? el('span', {}, `Versão ${persona.versao || 1}`) : null,
            persona ? el('span', {}, `Modelo: ${persona.modelo || '—'}`) : null,
          ].filter(Boolean)),
        ]),
        el('div', { class: 'cerebro-detail-actions' }, [
          persona ? el('button', {
            class: 'btn',
            onclick: () => abrirHistoricoVersoes(persona, c.nome),
            title: 'Ver versões anteriores e restaurar',
          }, '📜 Histórico') : null,
          persona ? el('button', {
            class: 'btn',
            onclick: () => exportarPDF(persona, c.nome),
            title: 'Abre visualização imprimível (Ctrl+P salva como PDF)',
          }, '⤓ Exportar PDF') : null,
          temDados ? el('button', {
            class: 'btn btn-primary',
            id: 'btn-gerar-persona',
            onclick: () => iniciarGeracao(slug),
          }, persona ? '↻ Regenerar' : '⚡ Gerar agora') : null,
          el('button', {
            class: 'btn btn-ghost',
            onclick: () => renderPersonas()
          }, '← Voltar'),
        ].filter(Boolean)),
      ]),

      !temDados
        ? el('div', { class: 'stub-screen' }, [
            el('div', { class: 'stub-badge' }, 'sem dados'),
            el('h2', {}, 'Alimente o Cérebro primeiro'),
            el('p', {}, 'A Persona é gerada automaticamente a partir das fontes do Cérebro. Adicione aulas, depoimentos, objeções e sacadas antes de esperar uma persona útil aqui.'),
          ])
        : !persona
          ? el('div', { class: 'stub-screen', id: 'persona-stub' }, [
              el('div', { class: 'stub-badge' }, 'pendente'),
              el('h2', {}, 'Persona ainda não gerada'),
              el('p', {}, `O Cérebro ${c.nome} já tem ${total} fontes. Clique em "Gerar agora" no topo pra sintetizar a persona a partir delas. O processo leva de 10 a 30 segundos.`),
            ])
          : (() => {
              const wrap = el('div', { class: 'persona-dossie' }, [
                el('div', { class: 'persona-aviso' }, [
                  el('strong', {}, 'Dossiê completo · 11 blocos'),
                  el('p', {}, `Sintetizado via ${persona.modelo || 'IA'} a partir de ${persona.fontes_usadas || total} fontes do Cérebro ${c.nome}. Edite qualquer bloco clicando em "Editar" — edições manuais ficam preservadas ao regenerar.`),
                ]),
                el('div', { class: 'persona-blocos' }, []),
              ]);
              const container = wrap.querySelector('.persona-blocos');
              container.appendChild(renderBlocoNoPainel(persona, c));
              return wrap;
            })(),
    ])
  );
}

function squadLigado() {
  return localStorage.getItem('pinguim_squad_animacao') === 'on';
}

async function iniciarGeracao(slug) {
  // Roteia: squad animado ou barra tradicional (preservada intacta)
  if (squadLigado()) return iniciarGeracaoComSquad(slug);
  return iniciarGeracaoComBarra(slug);
}

async function iniciarGeracaoComSquad(slug) {
  const cerebros = await fetchCerebrosCatalogo();
  const c = cerebros.find(x => x.slug === slug);
  const cerebroNome = c?.nome || slug;

  const { abrirSquadModal } = await import('./squad-modal.js?v=20260425e');
  const { gerarPersonaComProgresso } = await import('./personas.js?v=20260425e');

  try {
    // apiCall e resolvida pelo roteiro. Encapsulamos a chamada real numa promise unica.
    const apiCall = () => gerarPersonaComProgresso(slug, () => {}); // callback de etapa vira no-op no modo squad
    await abrirSquadModal({
      roteiro: 'gerarPersona',
      titulo: 'Atualizando persona',
      subtitulo: `Cerebro ${cerebroNome}`,
      cerebroNome,
      apiCall,
    });
    await renderPersonaDetalhe(slug);
  } catch (e) {
    // Modal squad ja mostra o erro; so logamos no console
    console.error('Squad modal erro:', e);
  }
}

async function iniciarGeracaoComBarra(slug) {
  const { gerarPersonaComProgresso } = await import('./personas.js?v=20260425e');

  // Overlay modal centralizado — impossivel de nao ver
  const overlay = el('div', { class: 'persona-progresso-overlay' }, [
    el('div', { class: 'persona-progresso-modal' }, [
      el('div', { class: 'persona-progresso-badge' }, 'Gerando persona'),
      el('div', { class: 'persona-progresso-label', id: 'pp-label' }, 'Iniciando...'),
      el('div', { class: 'persona-progresso-bar' }, [
        el('div', { class: 'persona-progresso-fill', id: 'pp-fill', style: 'width:0%' }),
      ]),
      el('div', { class: 'persona-progresso-etapa', id: 'pp-etapa' }, '—'),
      el('div', { class: 'persona-progresso-hint' }, 'Pode levar até 30 segundos. Não feche a aba.'),
    ]),
  ]);
  document.body.appendChild(overlay);

  try {
    await gerarPersonaComProgresso(slug, ({ etapa, total, label }) => {
      const pct = Math.round((etapa / total) * 100);
      $('#pp-fill').style.width = pct + '%';
      $('#pp-label').textContent = label;
      $('#pp-etapa').textContent = `Etapa ${etapa} de ${total}`;
    });
    overlay.remove();
    window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'persona_atualizada', slug } }));
    await renderPersonaDetalhe(slug);
  } catch (e) {
    overlay.querySelector('.persona-progresso-modal').innerHTML = `
      <div class="persona-progresso-badge" style="background:rgba(255,85,85,0.15);color:#FF5555">Falha</div>
      <div style="color:var(--fg);font-size:0.9375rem;margin:0.5rem 0">Não consegui gerar a persona</div>
      <div style="color:var(--fg-muted);font-size:0.8125rem;margin-bottom:1rem">${e.message}</div>
      <button class="btn btn-ghost" onclick="this.closest('.persona-progresso-overlay').remove()">Fechar</button>
    `;
  }
}

function setupSquadToggle() {
  const btn = $('#nav-squad-toggle');
  if (!btn) return;
  const label = $('#nav-squad-label');
  const aplicar = (on) => {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (label) label.textContent = on ? 'Squad · ON' : 'Squad · OFF';
    btn.title = on
      ? 'Squad · ON — animação ligada (clique para desligar)'
      : 'Squad · OFF — animação desligada (clique para ligar)';
  };
  aplicar(squadLigado());
  btn.addEventListener('click', () => {
    const novo = !squadLigado();
    localStorage.setItem('pinguim_squad_animacao', novo ? 'on' : 'off');
    aplicar(novo);
  });
}

async function renderOperacao() {
  const page = $('#page-operacao');
  page.innerHTML = '';
  const DATA = await fetchOperacaoData();
  const agenteMap = Object.fromEntries(DATA.agentes.map(a => [a.id || a.slug, a]));

  const sidebarAgentes = DATA.agentes.filter(a => a.squad_id || a.squad === 'suporte-operacional' || a.squad_slug === 'suporte-operacional').slice(0, 6);
  const todosAgentes = sidebarAgentes.length > 0 ? sidebarAgentes : DATA.agentes.slice(0, 6);

  const sidebar = el('aside', { class: 'agents-sidebar' }, [
    el('div', { class: 'agents-sidebar-header' }, [
      el('div', { class: 'agents-sidebar-title' }, 'Agentes'),
      el('span', { class: 'agents-count' }, String(todosAgentes.length)),
    ]),
    ...todosAgentes.map(a => el('div', { class: 'agent-item' }, [
      el('div', { class: 'agent-avatar', style: `background:${a.cor||'#E85C00'}` }, a.avatar || a.nome?.[0] || '?'),
      el('div', {}, [
        el('div', { class: 'agent-name' }, a.nome),
        el('div', { class: 'agent-role' }, STATUS_LABELS[a.status] || a.status || '—'),
        el('div', { class: 'agent-meta' }, [
          el('span', { class: `agent-online-dot ${a.online === false ? 'offline' : ''}` }),
          el('span', { class: 'agent-tasks' }, `${a.tasks_ativas||0} ativas · ${a.tasks_hoje||0} hoje`),
        ]),
      ]),
    ])),
  ]);

  const kanban = el('div', { class: 'kanban' }, KANBAN_COLS.map(col => {
    const tasksCol = DATA.tasks.filter(t => t.status === col.id);
    return el('div', { class: 'kanban-col', data: { status: col.id } }, [
      el('div', { class: 'kanban-col-header' }, [
        el('div', { class: 'kanban-col-title' }, col.label),
        el('span', { class: 'kanban-col-count' }, String(tasksCol.length)),
      ]),
      el('div', { class: 'kanban-cards' }, tasksCol.map(t => {
        const classes = ['task-card'];
        if (t.alerta) classes.push('alerta');
        if (t.aguardando_aprovacao) classes.push('aguardando_aprovacao');
        return el('div', { class: classes.join(' ') }, [
          el('div', { class: 'task-title' }, t.titulo),
          el('div', { class: 'task-desc' }, t.descricao || ''),
          el('div', { class: 'task-meta' }, [
            el('span', { class: `badge badge-${t.prioridade||'normal'}` }, t.prioridade || 'normal'),
            t.aguardando_aprovacao ? el('span', { class: 'task-tag' }, 'aguarda aprovação') : null,
            t.alerta ? el('span', { class: 'task-tag', style: 'color:#EF4444;background:rgba(239,68,68,.1)' }, 'alerta') : null,
            el('span', { class: 'task-requester' }, t.requester || '—'),
          ]),
        ]);
      })),
    ]);
  }));

  const feed = el('aside', { class: 'feed' }, [
    el('div', { class: 'feed-header' }, [
      el('div', { class: 'feed-title' }, [el('span', { class: 'feed-live-dot' }), 'Live Feed']),
    ]),
    el('div', { class: 'feed-items' }, (DATA.liveFeed || []).map(f =>
      el('div', { class: 'feed-item' }, [
        el('div', { class: 'feed-item-header' }, [
          el('span', { class: 'feed-item-agent' }, f.agente),
          el('span', { class: 'feed-item-time' }, f.hora),
        ]),
        el('div', { class: 'feed-item-action' }, f.acao),
      ])
    )),
  ]);

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Operação'),
        el('div', { class: 'page-subtitle' }, 'Kanban ao vivo + agentes atuando + live feed'),
      ]),
      el('div', { class: 'page-stats' }, [
        stat(DATA.tasks.filter(t => t.status !== 'done').length, 'Ativas'),
        stat(DATA.tasks.filter(t => t.status === 'done').length, 'Done hoje'),
        stat(DATA.agentes.filter(a => a.online !== false).length, 'Online'),
      ]),
    ]),
    el('div', { class: 'op-layout' }, [sidebar, kanban, feed]),
  );
}

async function renderAgentes() {
  const page = $('#page-agentes');
  page.innerHTML = '';
  const op = await fetchOperacaoData();

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Agentes'),
        el('div', { class: 'page-subtitle' }, 'Catálogo de agentes — missão, entrada, saída, modelo, squad'),
      ]),
    ]),
    el('div', { class: 'agent-cards-grid', style: 'padding:0' },
      op.agentes.length === 0
        ? [el('div', { class: 'stub-screen' }, [
            el('h2', {}, 'Nenhum agente cadastrado'),
            el('p', {}, 'Agentes aparecem aqui depois do seed do Supabase ou dos JSONs locais.')
          ])]
        : op.agentes.map(a => renderAgentCard(a))
    )
  );
}

function renderAgentCard(a) {
  const field = (label, value) => el('div', { class: 'agent-card-field' }, [
    el('div', { class: 'agent-card-field-label' }, label),
    el('div', { class: 'agent-card-field-value' }, value || '—'),
  ]);
  return el('div', { class: 'agent-card' }, [
    el('div', { class: 'agent-card-header' }, [
      el('div', { class: 'agent-avatar', style: `background:${a.cor||'#E85C00'}` }, a.avatar || a.nome?.[0] || '?'),
      el('div', { class: 'agent-card-title' }, [
        el('div', { class: 'agent-card-name' }, a.nome),
        el('div', { class: 'agent-card-model' }, a.modelo || 'modelo não definido'),
      ]),
      el('span', { class: `badge badge-${a.status||'planejado'}` }, STATUS_LABELS[a.status] || a.status || 'planejado'),
    ]),
    field('Missão', a.missao || a.missão),
    field('Entrada', a.entrada),
    field('Saída esperada', a.saida_esperada || a.saída_esperada),
    field('Limites', a.limites),
    field('Handoff', a.handoff),
    field('Critério de qualidade', a.criterio_qualidade || a.critério_qualidade),
    field('Métrica de sucesso', a.metrica_sucesso || a.métrica_sucesso),
    el('div', { class: 'agent-card-actions', style: 'display:flex;gap:.5rem;margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border-subtle)' }, [
      el('button', {
        class: 'btn',
        style: 'font-size:.75rem',
        onclick: () => abrirModalClonesAgente(a),
      }, '👤 Clones consultados'),
    ]),
  ]);
}

async function abrirModalClonesAgente(agente) {
  const { getSupabase } = await import('./sb-client.js?v=20260429d');
  const sb = getSupabase();
  if (!sb) return;
  // Carrega clones disponiveis + ativos pra esse agente
  const [clonesRes, atualRes] = await Promise.all([
    sb.from('vw_cerebros_catalogo').select('produto_id, slug, nome, emoji, subcategoria').eq('categoria', 'clone').order('subcategoria').order('nome'),
    sb.from('agente_clones').select('clone_produto_id, ativo, ordem').eq('agente_id', agente.id),
  ]);
  if (clonesRes.error) { console.error(clonesRes.error); return; }
  const clones = clonesRes.data || [];
  const ativos = new Map((atualRes.data || []).map(r => [r.clone_produto_id, r.ativo]));

  const SUB_LABEL = {
    socio_pinguim: 'Sócios Pinguim',
    'advisory-board': 'Advisory Board',
    'copy': 'Copywriters',
    'storytelling': 'Storytellers',
    'traffic-masters': 'Traffic Masters',
    'design': 'Design',
    'data': 'Data',
    'deep-research': 'Deep Research',
    'finops': 'FinOps',
    'legal': 'Legal',
    'cybersecurity': 'Cybersecurity',
    'translate': 'Translate',
    'squad-creator-pro': 'Squad Creator Pro',
  };

  // Agrupa por subcategoria
  const grupos = {};
  for (const c of clones) {
    const k = c.subcategoria || 'outros';
    (grupos[k] = grupos[k] || []).push(c);
  }

  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.style.zIndex = 10000;
  back.onclick = (e) => { if (e.target === back) fechar(); };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.style.cssText = 'max-width:780px;max-height:90vh;display:flex;flex-direction:column';
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const lista = document.createElement('div');
  lista.style.cssText = 'flex:1;min-height:0;overflow-y:auto;padding-right:.25rem;display:flex;flex-direction:column;gap:.875rem';

  // Estado local: mapa produto_id -> ativo
  const estado = new Map();
  clones.forEach(c => estado.set(c.produto_id, ativos.has(c.produto_id) ? !!ativos.get(c.produto_id) : false));

  const ORDEM = ['socio_pinguim','advisory-board','copy','storytelling','traffic-masters','design','data','deep-research','finops','legal','cybersecurity','translate','squad-creator-pro'];
  ORDEM.forEach(sub => {
    const lst = grupos[sub];
    if (!lst || !lst.length) return;
    const grupo = document.createElement('div');
    const titulo = document.createElement('div');
    titulo.style.cssText = 'font-family:var(--font-mono);font-size:.6875rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);margin-bottom:.375rem';
    titulo.textContent = `${SUB_LABEL[sub] || sub} · ${lst.length}`;
    grupo.appendChild(titulo);
    const grade = document.createElement('div');
    grade.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.375rem';
    lst.forEach(c => {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:flex;align-items:center;gap:.5rem;padding:.5rem .625rem;border:1px solid var(--border-subtle);border-radius:.375rem;cursor:pointer;background:var(--surface-2);font-size:.8125rem';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!estado.get(c.produto_id);
      cb.onchange = () => estado.set(c.produto_id, cb.checked);
      const span = document.createElement('span');
      span.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      span.textContent = `${c.emoji || '👤'} ${c.nome}`;
      lab.appendChild(cb);
      lab.appendChild(span);
      grade.appendChild(lab);
    });
    grupo.appendChild(grade);
    lista.appendChild(grupo);
  });

  const btnSalvar = document.createElement('button');
  btnSalvar.type = 'button';
  btnSalvar.className = 'btn btn-primary';
  btnSalvar.textContent = 'Salvar';
  btnSalvar.onclick = async () => {
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando…';
    try {
      const linhasNovas = [];
      const idsParaApagar = [];
      for (const [pid, ativo] of estado.entries()) {
        const tinha = ativos.has(pid);
        if (ativo && !tinha) {
          linhasNovas.push({ agente_id: agente.id, clone_produto_id: pid, ativo: true });
        } else if (!ativo && tinha) {
          idsParaApagar.push(pid);
        }
      }
      if (linhasNovas.length) {
        const { error } = await sb.from('agente_clones').insert(linhasNovas);
        if (error) throw error;
      }
      if (idsParaApagar.length) {
        const { error } = await sb.from('agente_clones').delete()
          .eq('agente_id', agente.id)
          .in('clone_produto_id', idsParaApagar);
        if (error) throw error;
      }
      fechar();
    } catch (e) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar';
      alert('Erro: ' + (e.message || e));
    }
  };

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.className = 'btn btn-ghost';
  btnCancel.textContent = 'Cancelar';
  btnCancel.onclick = fechar;

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:0 0 1rem;border-bottom:1px solid var(--border-subtle);margin-bottom:1rem';
  const titulo = document.createElement('div');
  titulo.innerHTML = `<div style="font-family:var(--font-heading);font-size:1rem;font-weight:600">Clones consultados — ${agente.nome}</div><div style="font-size:.8125rem;color:var(--fg-muted);margin-top:.125rem">Marque os Clones que esse agente carrega no contexto. Vira diretiva <code>clones_consultados</code> no AGENT-CARD em runtime.</div>`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = fechar;
  head.appendChild(titulo);
  head.appendChild(closeBtn);

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-subtle)';
  footer.appendChild(btnCancel);
  footer.appendChild(btnSalvar);

  card.appendChild(head);
  card.appendChild(lista);
  card.appendChild(footer);
  back.appendChild(card);
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

async function renderSquadsPage() {
  const page = $('#page-squads');
  page.innerHTML = '';
  const op = await fetchOperacaoData();

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Squads'),
        el('div', { class: 'page-subtitle' }, 'Mini-agências por caso de uso — cada squad consulta Cérebros relevantes.'),
      ]),
    ]),
    el('div', { class: 'squads-list' }, op.squads.map(s => {
      const agentes = op.agentes.filter(a => a.squad_id === s.id || a.squad === s.slug || a.squad_slug === s.slug);
      return el('div', { class: 'squad-block' }, [
        el('div', { class: 'squad-block-header' }, [
          el('div', { class: 'squad-block-emoji' }, s.emoji || '🤖'),
          el('div', { class: 'squad-block-info' }, [
            el('div', { class: 'squad-block-name' }, s.nome),
            el('div', { class: 'squad-block-desc' }, s.caso_de_uso || '—'),
          ]),
          el('span', { class: `badge badge-${s.status||'planejado'}` }, STATUS_LABELS[s.status] || s.status),
        ]),
        agentes.length === 0
          ? el('div', { style: 'padding:1.5rem;color:var(--fg-muted);font-size:.875rem' }, 'Nenhum agente ainda.')
          : el('div', { class: 'agent-cards-grid' }, agentes.map(renderAgentCard)),
      ]);
    }))
  );
}

function stat(val, lbl) {
  return el('div', { class: 'page-stat' }, [
    el('div', { class: 'page-stat-value' }, String(val)),
    el('div', { class: 'page-stat-label' }, lbl),
  ]);
}

async function renderRoadmap() {
  const page = $('#page-roadmap');
  page.innerHTML = '';
  const roadmap = await fetchRoadmapData();

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Roadmap'),
        el('div', { class: 'page-subtitle' }, 'Fases do projeto + priorização de capacidades.'),
      ]),
    ]),
    el('div', { class: 'roadmap-fases' }, (roadmap.fases || []).length === 0
      ? [el('div', { class: 'stub-screen' }, [
          el('h2', {}, 'Roadmap vazio'),
          el('p', {}, 'Adicionar fases via Supabase ou data/roadmap.json.'),
        ])]
      : roadmap.fases.map(fase => el('div', { class: 'fase-block' }, [
          el('div', { class: 'fase-header' }, [
            el('div', {}, [
              el('div', { class: 'fase-name' }, fase.nome),
              el('div', { class: 'fase-desc' }, fase.descricao),
            ]),
            el('span', { class: 'fase-badge' }, `${fase.itens.length} itens`),
          ]),
          el('div', { class: 'fase-items' }, fase.itens.map(item => el('div', { class: 'fase-item' }, [
            el('span', { class: 'fase-item-status', data: { status: item.status } }),
            el('div', { class: 'fase-item-title' }, item.capacidade),
            el('div', { class: 'fase-item-meta' }, [
              el('span', { style: 'margin-right:.75rem' }, STATUS_LABELS[item.status] || item.status),
              item.previsao ? el('span', {}, item.previsao) : null,
            ].filter(Boolean)),
          ]))),
        ]))
    )
  );
}

async function renderQualidade() {
  const page = $('#page-qualidade');
  page.innerHTML = '';
  const roadmap = await fetchRoadmapData();
  const q = roadmap.qualidade || {};
  const performers = q.top_performers || [];
  const gargalos = q.gargalos || [];

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Qualidade'),
        el('div', { class: 'page-subtitle' }, 'Saúde do sistema — latência, acerto, gargalos, logs do curador.'),
      ]),
    ]),
    el('div', { class: 'quali-grid' }, [
      qualiCard(String(performers.length), 'Agentes monitorados'),
      qualiCard(String(q.retrabalho_semana || 0), 'Retrabalhos (7d)'),
      qualiCard(String(q.alertas_ativos || 0), 'Alertas ativos', q.alertas_ativos > 0),
    ]),
    performers.length > 0
      ? el('div', { class: 'quali-section' }, [
          el('div', { class: 'quali-section-title' }, 'Top performers'),
          el('div', { class: 'quali-list' }, performers.map(p => el('div', { class: 'quali-row' }, [
            el('div', { class: 'quali-row-name' }, p.agente),
            el('div', { class: 'quali-row-stat good' }, `${Math.round((p.taxa_acerto||0)*100)}% acerto`),
            el('div', { class: 'quali-row-stat' }, `p50: ${p.latencia_p50_ms}ms`),
          ]))),
        ])
      : null,
    gargalos.length > 0
      ? el('div', { class: 'quali-section' }, [
          el('div', { class: 'quali-section-title' }, 'Gargalos'),
          el('div', { class: 'quali-list' }, gargalos.map(g => el('div', { class: 'quali-row', style: 'flex-direction:column;align-items:flex-start;gap:.25rem' }, [
            el('div', { style: 'display:flex;align-items:center;gap:.875rem;width:100%' }, [
              el('div', { class: 'quali-row-name' }, g.agente),
              el('div', { class: 'quali-row-stat bad' }, g.tipo),
            ]),
            el('div', { class: 'quali-desc' }, g.descricao),
          ]))),
        ])
      : null,
    (performers.length === 0 && gargalos.length === 0)
      ? el('div', { class: 'stub-screen' }, [
          el('h2', {}, 'Sem dados ainda'),
          el('p', {}, 'Assim que os agentes começarem a executar tasks, as métricas aparecem aqui.'),
        ])
      : null
  );
}

function qualiCard(val, lbl, alerta = false) {
  return el('div', { class: 'quali-summary-card' }, [
    el('div', { class: 'quali-summary-lbl' }, lbl),
    el('div', { class: 'quali-summary-val', style: alerta ? 'color:var(--status-alerta)' : '' }, val),
  ]);
}

/* -------- Init -------- */
(async function boot() {
  setupNav();
  setupMobileMenu();
  setupSquadToggle();
  initDrawer();
  await atualizarStatusbar();
  // Boot: abre Cérebros (arvore comeca fechada — usuario clica pra expandir)
  await navegar('cerebros');
  // Re-render da arvore pra marcar item ativo correto
  renderNavTree();
})();
