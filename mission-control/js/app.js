/* Mission Control — bootstrap + nav + statusbar
   Orquestra o lazy-load das telas.
*/

import { dataMode, fetchOperacaoData, fetchRoadmapData, fetchCerebrosCatalogo } from './sb-client.js?v=20260421p';
import { renderHome } from './home.js?v=20260421p';
import { renderCerebros, initDrawer, abrirCerebroDetalhe } from './cerebros.js?v=20260421p';
import { renderCrons } from './crons.js?v=20260421p';
import { renderSkills, abrirSkillDetalhe } from './skills.js?v=20260427h';
import { renderStub } from './stubs.js?v=20260421p';
import { iconeNode } from './icone.js?v=20260425g';
import { renderDocs, renderDocDetalhe, DOCS_CATALOGO } from './docs.js?v=20260425k';
import { renderIntegracoes } from './integracoes.js?v=20260425n';

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

const STUB_PAGES = ['conteudo', 'funis', 'trafego', 'vendas', 'suporte', 'biblioteca', 'seguranca', 'debug'];

/* -------- Navegação --------
   Sempre re-renderiza a página ao navegar — evita estado "preso" de um
   detalhe antigo (ex: clicar em Cérebros mas ainda ver o detalhe do Elo
   da última vez). Lazy é bom pra inicialização; navegação explicita
   deve ser sempre fresca.
*/
let paginaAtual = null;

async function navegar(pageSlug, { forcarRender = true } = {}) {
  paginaAtual = pageSlug;
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
      case 'operacao':  await renderOperacao(); break;
      case 'agentes':   await renderAgentes(); break;
      case 'squads':    await renderSquadsPage(); break;
      case 'crons':     await renderCrons(); break;
      case 'skills':    await renderSkills(); break;
      case 'mapa':      await renderMapa(); break;
      case 'roadmap':   await renderRoadmap(); break;
      case 'qualidade': await renderQualidade(); break;
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
function persistNavOpen() {
  try { localStorage.setItem('pinguim_nav_open', JSON.stringify(NAV_OPEN)); } catch {}
}

const NAV_PRIMARY = [
  { slug: 'cerebros',    label: 'Cérebros',    icon: '⚛',  tree: true,  treeLoader: () => loadCerebrosTree() },
  { slug: 'skills',      label: 'Skills',      icon: '🛠', tree: true,  treeLoader: () => loadSkillsTree() },
  { slug: 'personas',    label: 'Personas',    icon: '👤', tree: true,  treeLoader: () => loadPersonasTree() },
  { slug: 'integracoes', label: 'Integrações', icon: '🔌', tree: false },
];

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
      sub.appendChild(el('div', { class: 'nav-loading' }, 'Carregando…'));
      wrap.appendChild(sub);
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
  const cerebros = await fetchCerebrosCatalogo();
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
              renderNavTree();
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
  const { fetchSkillsCatalogo } = await import('./sb-client.js');
  const skills = await fetchSkillsCatalogo();
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
              renderNavTree();
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
  const cerebros = await fetchCerebrosCatalogo();
  const lista = cerebros
    .filter(c => (c.total_fontes || 0) > 0)
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
        renderNavTree();
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
  const aplicar = (on) => {
    btn.classList.toggle('on', on);
    btn.title = on
      ? 'Squad · ON — animação do Squad ligada'
      : 'Squad · OFF — animação do Squad desligada';
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
  ]);
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

async function renderMapa() {
  const page = $('#page-mapa');
  page.innerHTML = '';
  const cerebros = await fetchCerebrosCatalogo();

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Mapa'),
        el('div', { class: 'page-subtitle' }, 'Universo estratégico — produtos com Cérebros e ecossistema completo.'),
      ]),
    ]),
    el('div', { class: 'mapa-intro' }, [
      el('div', { class: 'mapa-intro-text' }, [
        el('h3', {}, 'Como ler o mapa'),
        el('p', {}, 'Cada produto Pinguim tem seu Cérebro (tela Cérebros). Os 30 squads / 211 agentes do ecossistema completo serão pintados conforme entram em produção.'),
      ]),
      el('div', { class: 'mapa-legenda' }, [
        legendaItem('#71717A', 'Em construção'),
        legendaItem('#FB923C', 'Em criação'),
        legendaItem('#E85C00', 'Em teste'),
        legendaItem('#22C55E', 'Ativo'),
      ]),
    ]),
    el('div', { class: 'mapa-dominios' }, [
      renderDominio('🐧 Produtos Pinguim', 'Cada produto tem 1 Cérebro', cerebros.map(c => renderSquadCardMapa(c))),
      renderDominioLink('🗺️ Ecossistema completo', '30 squads · 211 agentes · 397 tasks · 75 workflows', '../ecossistema-squads-completo.html'),
    ])
  );
}

function renderSquadCardMapa(c) {
  return el('div', { class: 'squad-card-mapa', data: { status: c.status } }, [
    el('div', { class: 'squad-card-header' }, [
      el('div', { class: 'squad-card-name' }, [el('span', {}, c.emoji || '📦'), c.nome]),
      el('span', { class: `badge badge-${c.status==='ativo'?'em_producao':c.status==='em_construcao'?'em_criacao':'planejado'}` },
        c.status==='ativo' ? 'Ativo' : c.status==='em_construcao' ? 'Em construção' : 'Rascunho'),
    ]),
    el('div', { style: 'font-size:.8125rem;color:var(--fg-muted);line-height:1.5' }, c.descricao || '—'),
    el('div', { class: 'squad-card-stats' }, [
      statMini(c.total_fontes || 0, 'Fontes'),
      statMini(`${c.preenchimento_pct || 0}%`, 'Preench.'),
      statMini(c.fontes_ultima_semana || 0, '7d'),
    ]),
  ]);
}

function renderDominio(emoji, desc, cards) {
  return el('div', { class: 'dominio' }, [
    el('div', { class: 'dominio-header' }, [
      el('div', { class: 'dominio-emoji' }, emoji.split(' ')[0]),
      el('div', {}, [
        el('div', { class: 'dominio-name' }, emoji.split(' ').slice(1).join(' ')),
        el('div', { class: 'dominio-desc' }, desc),
      ]),
    ]),
    el('div', { class: 'squads-grid' }, cards),
  ]);
}

function renderDominioLink(emoji, desc, href) {
  return el('div', { class: 'dominio' }, [
    el('div', { class: 'dominio-header' }, [
      el('div', { class: 'dominio-emoji' }, emoji.split(' ')[0]),
      el('div', {}, [
        el('div', { class: 'dominio-name' }, emoji.split(' ').slice(1).join(' ')),
        el('div', { class: 'dominio-desc' }, desc),
      ]),
    ]),
    el('div', { style: 'padding:1.5rem;color:var(--fg-muted);font-size:.875rem' }, [
      el('p', {}, [
        'Consultar versão completa em ',
        el('a', { href, target: '_blank' }, 'ecossistema-squads-completo.html'),
        ' (HTML existente). À medida que os squads entram em produção, serão absorvidos aqui no painel.'
      ])
    ])
  ]);
}

function legendaItem(color, label) {
  return el('div', { class: 'legenda-item' }, [
    el('span', { class: 'legenda-dot', style: `background:${color}` }),
    label,
  ]);
}

function statMini(val, lbl) {
  return el('div', { class: 'squad-card-stat' }, [
    el('div', { class: 'squad-card-stat-val' }, String(val)),
    el('div', { class: 'squad-card-stat-lbl' }, lbl),
  ]);
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
