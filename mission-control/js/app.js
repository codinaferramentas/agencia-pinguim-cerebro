/* Mission Control — Pinguim
   Vanilla JS: lê JSONs em data/, renderiza as 6 telas.
   V1 troca fetch de JSON por chamada ao Supabase — UI não muda. */

(async function () {
  'use strict';

  // ---- Load data ----
  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Falha ao carregar ${path}`);
    return res.json();
  }

  let DATA = {};
  try {
    const [agentes, tasks, squads, roadmap] = await Promise.all([
      loadJSON('data/agentes.json'),
      loadJSON('data/tasks.json'),
      loadJSON('data/squads.json'),
      loadJSON('data/roadmap.json'),
    ]);
    DATA = { agentes: agentes.agentes, tasks: tasks.tasks, liveFeed: tasks.live_feed, squads: squads.squads, roadmap };
  } catch (e) {
    document.body.innerHTML = `<div style="padding:2rem;font-family:Inter,sans-serif;color:#FAFAFA;background:#121212;min-height:100vh"><h1>Erro ao carregar dados</h1><p style="color:#A1A1AA">${e.message}</p><p style="color:#71717A;font-size:.875rem">Abra via <code>http://localhost</code> (não via <code>file://</code>). Rode <code>python -m http.server</code> na pasta mission-control.</p></div>`;
    return;
  }

  // Lookup de agente por id
  const agenteMap = Object.fromEntries(DATA.agentes.map(a => [a.id, a]));

  // ---- Utils ----
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

  const statusLabel = {
    planejado: 'Planejado',
    em_criacao: 'Em criação',
    em_teste: 'Em teste',
    em_producao: 'Em produção',
    pausado: 'Pausado',
    em_execucao: 'Em execução',
    priorizado: 'Priorizado',
    backlog: 'Backlog',
    bloqueado: 'Bloqueado',
  };

  const statusColumns = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'assigned', label: 'Assigned' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' },
  ];

  // ---- Navegação ----
  function setupNav() {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        $$('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        $$('.page').forEach(p => p.classList.remove('active'));
        $(`#page-${page}`).classList.add('active');
      });
    });
  }

  // ---- TELA 2: OPERAÇÃO ----
  function renderOperacao() {
    const page = $('#page-operacao');

    const sidebarAgentes = DATA.agentes.filter(a => a.squad === 'suporte-operacional');
    const sidebar = el('aside', { class: 'agents-sidebar' }, [
      el('div', { class: 'agents-sidebar-header' }, [
        el('div', { class: 'agents-sidebar-title' }, 'Agentes'),
        el('span', { class: 'agents-count' }, String(sidebarAgentes.length)),
      ]),
      ...sidebarAgentes.map(a => el('div', { class: 'agent-item' }, [
        el('div', { class: 'agent-avatar', style: `background:${a.cor}` }, a.avatar),
        el('div', {}, [
          el('div', { class: 'agent-name' }, a.nome),
          el('div', { class: 'agent-role' }, statusLabel[a.status] || a.status),
          el('div', { class: 'agent-meta' }, [
            el('span', { class: `agent-online-dot ${a.online ? '' : 'offline'}` }),
            el('span', { class: 'agent-tasks' }, `${a.tasks_ativas} ativas · ${a.tasks_hoje} hoje`),
          ]),
        ]),
      ])),
    ]);

    const kanban = el('div', { class: 'kanban' }, statusColumns.map(col => {
      const tasksCol = DATA.tasks.filter(t => t.status === col.id);
      return el('div', { class: 'kanban-col', data: { status: col.id } }, [
        el('div', { class: 'kanban-col-header' }, [
          el('div', { class: 'kanban-col-title' }, col.label),
          el('span', { class: 'kanban-col-count' }, String(tasksCol.length)),
        ]),
        el('div', { class: 'kanban-cards' }, tasksCol.map(renderTaskCard)),
      ]);
    }));

    const feed = el('aside', { class: 'feed' }, [
      el('div', { class: 'feed-header' }, [
        el('div', { class: 'feed-title' }, [el('span', { class: 'feed-live-dot' }), 'Live Feed']),
      ]),
      el('div', { class: 'feed-items' }, DATA.liveFeed.map(f =>
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
          el('div', { class: 'page-subtitle' }, 'O que está acontecendo agora no squad ativo'),
        ]),
        el('div', { class: 'page-stats' }, [
          stat(DATA.tasks.filter(t => t.status !== 'done').length, 'Ativas'),
          stat(DATA.tasks.filter(t => t.status === 'done').length, 'Done hoje'),
          stat(DATA.agentes.filter(a => a.online).length, 'Online'),
        ]),
      ]),
      el('div', { class: 'op-layout' }, [sidebar, kanban, feed]),
    );
  }

  function renderTaskCard(t) {
    const agente = agenteMap[t.agente_id];
    const classes = ['task-card'];
    if (t.alerta) classes.push('alerta');
    if (t.aguardando_aprovacao) classes.push('aguardando_aprovacao');

    return el('div', { class: classes.join(' ') }, [
      el('div', { class: 'task-title' }, t.titulo),
      el('div', { class: 'task-desc' }, t.descricao),
      el('div', { class: 'task-meta' }, [
        el('span', { class: `badge badge-${t.prioridade}` }, t.prioridade),
        ...(t.aguardando_aprovacao ? [el('span', { class: 'task-tag' }, 'aguarda aprovação')] : []),
        ...(t.alerta ? [el('span', { class: 'task-tag', style: 'color:#EF4444;background:rgba(239,68,68,.1)' }, 'alerta')] : []),
        el('span', { class: 'task-requester' }, t.requester),
      ]),
    ]);
  }

  function stat(val, lbl) {
    return el('div', { class: 'page-stat' }, [
      el('div', { class: 'page-stat-value' }, String(val)),
      el('div', { class: 'page-stat-label' }, lbl),
    ]);
  }

  // ---- TELA 1: MAPA ----
  function renderMapa() {
    const page = $('#page-mapa');

    const dominios = [
      {
        emoji: '🐧', nome: 'Agência Pinguim',
        desc: 'Squad principal + mini-squads por caso de uso.',
        squadsFiltro: ['suporte-operacional', 'low-ticket', 'high-ticket', 'lancamento-pago'],
      },
      {
        emoji: '🗺️', nome: 'Capacidades do mapa estratégico',
        desc: 'Os 30 squads / 211 agentes do ecossistema completo — serão pintados conforme entram em produção.',
        squadsFiltro: [],
      },
    ];

    const legenda = el('div', { class: 'mapa-legenda' }, [
      legendaItem('#71717A', 'Planejado'),
      legendaItem('#FB923C', 'Em criação'),
      legendaItem('#E85C00', 'Em teste'),
      legendaItem('#22C55E', 'Em produção'),
    ]);

    page.append(
      el('div', { class: 'page-header' }, [
        el('div', {}, [
          el('h1', { class: 'page-title' }, 'Mapa'),
          el('div', { class: 'page-subtitle' }, 'Universo completo da Pinguim — cada squad ganha cor conforme evolui'),
        ]),
      ]),
      el('div', { class: 'mapa-intro' }, [
        el('div', { class: 'mapa-intro-text' }, [
          el('h3', {}, 'Como ler o mapa'),
          el('p', {}, 'Cada squad é pintado pelo status de maturidade. Resolvemos uma dor, pomos em produção, pintamos de verde. A meta é pintar o mapa inteiro.'),
        ]),
        legenda,
      ]),
      el('div', { class: 'mapa-dominios' }, [
        renderDominioSquads(dominios[0]),
        renderDominioPlaceholder(dominios[1]),
      ]),
    );
  }

  function legendaItem(color, label) {
    return el('div', { class: 'legenda-item' }, [
      el('span', { class: 'legenda-dot', style: `background:${color}` }),
      label,
    ]);
  }

  function renderDominioSquads(dom) {
    const squads = DATA.squads.filter(s => dom.squadsFiltro.includes(s.id));
    return el('div', { class: 'dominio' }, [
      el('div', { class: 'dominio-header' }, [
        el('div', { class: 'dominio-emoji' }, dom.emoji),
        el('div', {}, [
          el('div', { class: 'dominio-name' }, dom.nome),
          el('div', { class: 'dominio-desc' }, dom.desc),
        ]),
      ]),
      el('div', { class: 'squads-grid' }, squads.map(s => el('div', { class: 'squad-card-mapa', data: { status: s.status } }, [
        el('div', { class: 'squad-card-header' }, [
          el('div', { class: 'squad-card-name' }, [el('span', {}, s.emoji), s.nome]),
          el('span', { class: `badge badge-${s.status}` }, statusLabel[s.status]),
        ]),
        el('div', { style: 'font-size:.8125rem;color:var(--fg-muted);line-height:1.5' }, s.caso_de_uso),
        el('div', { class: 'squad-card-stats' }, [
          statMini(s.agentes_ids.length, 'Agentes'),
          statMini(s.metricas && s.metricas.tasks_resolvidas_7d != null ? s.metricas.tasks_resolvidas_7d : '—', 'Tasks 7d'),
          statMini(`#${s.prioridade}`, 'Prioridade'),
        ]),
      ]))),
    ]);
  }

  function renderDominioPlaceholder(dom) {
    return el('div', { class: 'dominio' }, [
      el('div', { class: 'dominio-header' }, [
        el('div', { class: 'dominio-emoji' }, dom.emoji),
        el('div', {}, [
          el('div', { class: 'dominio-name' }, dom.nome),
          el('div', { class: 'dominio-desc' }, dom.desc),
        ]),
      ]),
      el('div', { style: 'padding:1.5rem;color:var(--fg-muted);font-size:.875rem' }, [
        el('p', { style: 'margin-bottom:.75rem' }, '30 squads · 211 agentes · 397 tasks · 75 workflows organizados em 10 domínios.'),
        el('p', {}, [
          'Consultar versão completa em ',
          el('a', { href: '../ecossistema-squads-completo.html', target: '_blank' }, 'ecossistema-squads-completo.html'),
          ' (HTML existente — será absorvido no painel conforme squads entram em produção).',
        ]),
      ]),
    ]);
  }

  function statMini(val, lbl) {
    return el('div', { class: 'squad-card-stat' }, [
      el('div', { class: 'squad-card-stat-val' }, String(val)),
      el('div', { class: 'squad-card-stat-lbl' }, lbl),
    ]);
  }

  // ---- TELA 3: SQUADS (drill-down) ----
  function renderSquads() {
    const page = $('#page-squads');
    const squadsAtivos = DATA.squads.filter(s => s.status !== 'planejado' || s.agentes_ids.length > 0);

    page.append(
      el('div', { class: 'page-header' }, [
        el('div', {}, [
          el('h1', { class: 'page-title' }, 'Squads'),
          el('div', { class: 'page-subtitle' }, 'Drill-down nos mini-squads — agentes com cards de contrato'),
        ]),
      ]),
      el('div', { class: 'squads-list' }, squadsAtivos.map(renderSquadBlock)),
    );
  }

  function renderSquadBlock(s) {
    const agentes = s.agentes_ids.map(id => agenteMap[id]).filter(Boolean);
    const m = s.metricas || {};
    const metrics = [
      metric(m.tasks_resolvidas_7d ?? '—', 'Tasks 7d'),
      metric(m.sla_medio_minutos != null ? `${m.sla_medio_minutos}m` : '—', 'SLA médio'),
      metric(m.taxa_aprovacao_humana != null ? `${Math.round(m.taxa_aprovacao_humana * 100)}%` : '—', 'Aprovação humana'),
      metric(m.custo_medio_task_usd != null ? `$${m.custo_medio_task_usd.toFixed(3)}` : '—', 'Custo/task'),
    ];

    return el('div', { class: 'squad-block' }, [
      el('div', { class: 'squad-block-header' }, [
        el('div', { class: 'squad-block-emoji' }, s.emoji),
        el('div', { class: 'squad-block-info' }, [
          el('div', { class: 'squad-block-name' }, s.nome),
          el('div', { class: 'squad-block-desc' }, s.caso_de_uso),
        ]),
        el('span', { class: `badge badge-${s.status}` }, statusLabel[s.status]),
      ]),
      el('div', { class: 'squad-block-metrics' }, metrics),
      agentes.length === 0
        ? el('div', { style: 'padding:1.5rem;color:var(--fg-muted);font-size:.875rem' }, 'Nenhum agente cadastrado ainda. Capacidade no mapa aguardando priorização.')
        : el('div', { class: 'agent-cards-grid' }, agentes.map(renderAgentCard)),
    ]);
  }

  function metric(val, lbl) {
    const isEmBranco = val === '—';
    return el('div', { class: 'metric' }, [
      el('div', { class: `metric-val ${isEmBranco ? 'em-branco' : ''}` }, String(val)),
      el('div', { class: 'metric-lbl' }, lbl),
    ]);
  }

  function renderAgentCard(a) {
    return el('div', { class: 'agent-card' }, [
      el('div', { class: 'agent-card-header' }, [
        el('div', { class: 'agent-avatar', style: `background:${a.cor}` }, a.avatar),
        el('div', { class: 'agent-card-title' }, [
          el('div', { class: 'agent-card-name' }, a.nome),
          el('div', { class: 'agent-card-model' }, a.modelo),
        ]),
        el('span', { class: `badge badge-${a.status}` }, statusLabel[a.status]),
      ]),
      field('Missão', a.missao),
      field('Entrada', a.entrada),
      field('Saída esperada', a.saida_esperada),
      field('Limites', a.limites),
      field('Handoff', a.handoff),
      field('Critério de qualidade', a.criterio_qualidade),
      field('Métrica de sucesso', a.metrica_sucesso),
      el('div', { class: 'agent-card-actions' }, [
        el('button', { class: 'btn' }, 'Ver SOUL'),
        el('button', { class: 'btn' }, 'Editar card'),
        el('button', { class: 'btn btn-ghost' }, 'Clonar'),
      ]),
    ]);
  }

  function field(label, value) {
    return el('div', { class: 'agent-card-field' }, [
      el('div', { class: 'agent-card-field-label' }, label),
      el('div', { class: 'agent-card-field-value' }, value),
    ]);
  }

  // ---- TELA 4: ROADMAP ----
  function renderRoadmap() {
    const page = $('#page-roadmap');
    page.append(
      el('div', { class: 'page-header' }, [
        el('div', {}, [
          el('h1', { class: 'page-title' }, 'Roadmap'),
          el('div', { class: 'page-subtitle' }, 'Capacidades priorizadas por fase — o que entra agora, depois, e depois de depois'),
        ]),
      ]),
      el('div', { class: 'roadmap-fases' }, DATA.roadmap.fases.map(fase => el('div', { class: 'fase-block' }, [
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
            el('span', { style: 'margin-right:.75rem' }, statusLabel[item.status] || item.status),
            item.previsao ? el('span', {}, item.previsao) : null,
          ].filter(Boolean)),
        ]))),
      ]))),
    );
  }

  // ---- TELA 5: EVOLUÇÃO ----
  function renderEvolucao() {
    const page = $('#page-evolucao');
    const stages = [
      { id: 'planejado', label: 'Planejado' },
      { id: 'em_criacao', label: 'Em criação' },
      { id: 'em_teste', label: 'Em teste' },
      { id: 'em_producao', label: 'Em produção' },
    ];

    page.append(
      el('div', { class: 'page-header' }, [
        el('div', {}, [
          el('h1', { class: 'page-title' }, 'Evolução'),
          el('div', { class: 'page-subtitle' }, 'Pipeline de ciclo de vida dos agentes — governança de nascimento até produção'),
        ]),
      ]),
      el('div', { class: 'pipeline' }, stages.map(st => el('div', { class: 'pipeline-col', data: { stage: st.id } }, [
        el('div', { class: 'pipeline-col-header' }, [
          el('div', { class: 'pipeline-col-title' }, st.label + ` · ${(DATA.roadmap.pipeline_evolucao[st.id] || []).length}`),
        ]),
        ...(DATA.roadmap.pipeline_evolucao[st.id] || []).map(ag => el('div', { class: 'pipeline-card' }, [
          el('div', { class: 'pipeline-card-name' }, ag.agente),
          el('div', { class: 'pipeline-card-squad' }, ag.squad),
        ])),
      ]))),
    );
  }

  // ---- TELA 6: QUALIDADE ----
  function renderQualidade() {
    const page = $('#page-qualidade');
    const q = DATA.roadmap.qualidade;

    page.append(
      el('div', { class: 'page-header' }, [
        el('div', {}, [
          el('h1', { class: 'page-title' }, 'Qualidade'),
          el('div', { class: 'page-subtitle' }, 'Saúde do sistema — latência, acerto, gargalos, alertas'),
        ]),
      ]),
      el('div', { class: 'quali-grid' }, [
        qualiCard(`${q.top_performers.length}`, 'Agentes monitorados'),
        qualiCard(`${q.retrabalho_semana}`, 'Retrabalhos (7d)'),
        qualiCard(`${q.alertas_ativos}`, 'Alertas ativos', true),
      ]),
      el('div', { class: 'quali-section' }, [
        el('div', { class: 'quali-section-title' }, 'Top performers'),
        el('div', { class: 'quali-list' }, q.top_performers.map(p => el('div', { class: 'quali-row' }, [
          el('div', { class: 'quali-row-name' }, p.agente),
          el('div', { class: 'quali-row-stat good' }, `${Math.round(p.taxa_acerto * 100)}% acerto`),
          el('div', { class: 'quali-row-stat' }, `p50: ${p.latencia_p50_ms}ms`),
        ]))),
      ]),
      el('div', { class: 'quali-section' }, [
        el('div', { class: 'quali-section-title' }, 'Gargalos'),
        el('div', { class: 'quali-list' }, q.gargalos.map(g => el('div', { class: 'quali-row', style: 'flex-direction:column;align-items:flex-start;gap:.25rem' }, [
          el('div', { style: 'display:flex;align-items:center;gap:.875rem;width:100%' }, [
            el('div', { class: 'quali-row-name' }, g.agente),
            el('div', { class: 'quali-row-stat bad' }, g.tipo),
          ]),
          el('div', { class: 'quali-desc' }, g.descricao),
        ]))),
      ]),
    );
  }

  function qualiCard(val, lbl, alerta = false) {
    return el('div', { class: 'quali-summary-card' }, [
      el('div', { class: 'quali-summary-lbl' }, lbl),
      el('div', { class: 'quali-summary-val', style: alerta && val !== '0' ? 'color:var(--status-alerta)' : '' }, val),
    ]);
  }

  // ---- Init ----
  setupNav();
  renderOperacao();
  renderMapa();
  renderSquads();
  renderRoadmap();
  renderEvolucao();
  renderQualidade();
})();
