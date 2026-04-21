/* Mission Control — bootstrap + nav + statusbar
   Orquestra o lazy-load das telas.
*/

import { dataMode, fetchOperacaoData, fetchRoadmapData, fetchCerebrosCatalogo } from './sb-client.js?v=20260421n';
import { renderHome } from './home.js?v=20260421n';
import { renderCerebros, initDrawer } from './cerebros.js?v=20260421n';
import { renderCrons } from './crons.js?v=20260421n';
import { renderSkills } from './skills.js?v=20260421n';
import { renderStub } from './stubs.js?v=20260421n';

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

/* -------- Navegação -------- */
const rendered = new Set();

async function navegar(pageSlug) {
  $$('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === pageSlug));
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageSlug);
  if (!page) return;
  page.classList.add('active');

  // Lazy render — só renderiza quando for navegado pela primeira vez
  if (!rendered.has(pageSlug)) {
    rendered.add(pageSlug);
    try {
      switch (pageSlug) {
        case 'home':      await renderHome(); break;
        case 'cerebros':  await renderCerebros(); break;
        case 'personas':  await renderPersonas(); break;
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
}

function setupNav() {
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const pageSlug = item.dataset.page;
      if (item.classList.contains('has-sub')) {
        abrirSubnav(pageSlug);
      } else {
        fecharSubnav();
      }
      navegar(pageSlug);
    });
  });

  $('#subnav-back')?.addEventListener('click', fecharSubnav);
}

/* -------- Sub-sidebar contextual (drill-down estilo Vercel) -------- */
const SUBNAV_CONFIG = {
  cerebros: {
    title: 'Cérebros',
    loader: async () => {
      const cerebros = await fetchCerebrosCatalogo();
      // Filtra: só cérebros com produto real, sem Pinguim Empresa (foco em cérebros de produto)
      return cerebros
        .filter(c => c.slug !== 'pinguim')
        .map(c => ({
          id: c.slug || c.id,
          label: c.nome,
          meta: (c.total_fontes ?? 0) + ' fontes',
          emoji: c.emoji || '⚛',
        }));
    },
    onSelect: (id) => {
      window.dispatchEvent(new CustomEvent('cerebro:select', { detail: { slug: id } }));
    }
  },
  personas: {
    title: 'Personas',
    loader: async () => {
      const cerebros = await fetchCerebrosCatalogo();
      // Persona só existe se Cérebro tem fonte (pai existe)
      return cerebros
        .filter(c => (c.total_fontes || 0) > 0)
        .map(c => ({
          id: c.slug || c.id,
          label: c.nome,
          meta: 'auto',
          emoji: c.emoji || '👤',
        }));
    },
    onSelect: (id) => {
      window.dispatchEvent(new CustomEvent('persona:select', { detail: { slug: id } }));
    }
  },
  squads: {
    title: 'Squads',
    loader: async () => {
      const op = await fetchOperacaoData();
      const squads = op.squads || [];
      return squads.map(s => ({
        id: s.slug || s.id,
        label: s.nome,
        meta: (s.agentes?.length || s.count || 0) + '',
        emoji: s.emoji || '▦',
      }));
    },
    onSelect: (id) => {
      window.dispatchEvent(new CustomEvent('squad:select', { detail: { slug: id } }));
    }
  },
};

async function abrirSubnav(pageSlug) {
  const cfg = SUBNAV_CONFIG[pageSlug];
  if (!cfg) { fecharSubnav(); return; }

  document.querySelector('.app').classList.add('with-subnav');
  $('#subnav').setAttribute('aria-hidden', 'false');
  $('#subnav-title').textContent = cfg.title;

  $$('.nav-item.has-sub').forEach(i => {
    i.classList.toggle('open', i.dataset.page === pageSlug);
  });

  const body = $('#subnav-body');
  body.innerHTML = '<div class="subnav-section">Carregando…</div>';

  try {
    const items = await cfg.loader();
    body.innerHTML = '';

    if (items.length === 0) {
      body.innerHTML = '<div class="subnav-section">Nenhum item</div>';
      return;
    }

    items.forEach(it => {
      const row = el('div', { class: 'subnav-item', data: { id: it.id } }, [
        el('span', { class: 'nav-icon', style: 'font-size:0.9rem' }, it.emoji || '•'),
        el('span', { class: 'subnav-label' }, it.label),
        it.meta ? el('span', { class: 'subnav-meta' }, it.meta) : null,
      ]);
      row.addEventListener('click', () => {
        $$('.subnav-item').forEach(s => s.classList.remove('active'));
        row.classList.add('active');
        cfg.onSelect?.(it.id);
      });
      body.appendChild(row);
    });
  } catch (err) {
    body.innerHTML = `<div class="subnav-section" style="color:var(--danger)">Erro: ${err.message}</div>`;
  }
}

function fecharSubnav() {
  document.querySelector('.app').classList.remove('with-subnav');
  $('#subnav').setAttribute('aria-hidden', 'true');
  $$('.nav-item.has-sub').forEach(i => i.classList.remove('open'));
}

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
  $('#nav-env-badge').textContent = dataMode() === 'supabase' ? 'V0 · Supabase' : 'V0 · Offline';
  $('#nav-env-hint').textContent = dataMode() === 'supabase' ? 'conectado ao banco' : 'rode com Supabase pra V0 real';
}

/* -------- Telas migradas do V0 antigo -------- */

/* Personas — output gerado a partir do Cérebro. Editável com aviso. */
let personasListenerReady = false;
async function renderPersonas(slugPreSelecionado) {
  if (!personasListenerReady) {
    personasListenerReady = true;
    window.addEventListener('persona:select', (ev) => {
      const slug = ev.detail?.slug;
      if (slug) renderPersonaDetalhe(slug);
    });
  }

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
              el('div', { class: 'cerebro-emoji' }, c.emoji || '👤'),
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

async function renderPersonaDetalhe(slug) {
  const cerebros = await fetchCerebrosCatalogo();
  const c = cerebros.find(x => x.slug === slug);
  if (!c) return;

  const page = $('#page-personas');
  page.innerHTML = '';

  const total = c.total_fontes || 0;
  const temDados = total > 0;

  page.append(
    el('div', { class: 'cerebro-detail' }, [
      el('div', { class: 'cerebro-detail-header' }, [
        el('div', { class: 'cerebro-emoji' }, c.emoji || '👤'),
        el('div', { style: 'flex:1' }, [
          el('div', { class: 'cerebro-nome' }, 'Persona ' + c.nome),
          el('div', { class: 'cerebro-desc' }, 'Derivada do Cérebro ' + c.nome),
          el('div', { style: 'display:flex;gap:.75rem;margin-top:.5rem;font-size:.75rem;color:var(--fg-muted)' }, [
            el('span', {}, `Cérebro: ${total} fonte${total === 1 ? '' : 's'}`),
            el('span', {}, temDados ? 'Última síntese: agora há pouco' : 'Aguardando 1ª alimentação'),
          ]),
        ]),
        el('div', { class: 'cerebro-detail-actions' }, [
          el('button', {
            class: 'btn',
            disabled: !temDados ? '' : null,
            onclick: () => alert('Editar Persona — esta edição fica registrada. Se você apontar falta de contexto, o sistema vai sugerir alimentar o Cérebro primeiro (não editar manualmente). V1 com Supabase conectado.')
          }, '✎ Editar'),
          el('button', {
            class: 'btn btn-ghost',
            onclick: () => renderPersonas()
          }, '← Voltar'),
        ]),
      ]),

      !temDados
        ? el('div', { class: 'stub-screen' }, [
            el('div', { class: 'stub-badge' }, 'sem dados'),
            el('h2', {}, 'Alimente o Cérebro primeiro'),
            el('p', {}, 'A Persona é gerada automaticamente a partir das fontes do Cérebro. Adicione aulas, depoimentos, objeções e sacadas antes de esperar uma persona útil aqui.'),
          ])
        : el('div', { class: 'persona-detail' }, [
            el('div', { class: 'persona-aviso' }, [
              el('strong', {}, '🧠 Como esta persona foi gerada'),
              el('p', {}, `Síntese automática a partir de ${total} fontes do Cérebro ${c.nome}. Edições manuais ficam sinalizadas — se algo parecer faltar, alimente o Cérebro em vez de corrigir direto aqui.`),
            ]),
            el('div', { class: 'persona-secoes' }, [
              personaSecao('Quem é', 'Persona síntese — aguardando integração com o Cérebro real. Mock temporário.'),
              personaSecao('Dor principal', 'Principal objeção recorrente detectada nas fontes.'),
              personaSecao('Gatilhos de compra', 'Sacadas do expert + padrões nos depoimentos.'),
              personaSecao('Objeções', 'Top 3 objeções do grupo, ordenadas por frequência.'),
              personaSecao('Linguagem', 'Vocabulário coletado de depoimentos e perguntas reais.'),
            ]),
          ]),
    ])
  );
}

function personaSecao(titulo, texto) {
  return el('div', { class: 'persona-secao' }, [
    el('h3', {}, titulo),
    el('p', {}, texto),
  ]);
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
  initDrawer();
  await atualizarStatusbar();
  // Renderiza Home primeiro (tela default)
  navegar('cerebros');
})();
