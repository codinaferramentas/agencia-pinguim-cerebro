/* Pinguim OS — Funis (5o pilar)
   Sessao 3: filtro Internos, icones reais, no condicional, mais entradas/saidas,
   bloqueio de loop, modal de confirmacao Pinguim, right-click, double-click,
   avatares de agentes no header, animacao de fluxo melhorada.
*/

import { getSupabase } from './sb-client.js?v=20260428b';
import { iconeNode } from './icone.js?v=20260425g';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'data') Object.entries(attrs[k]).forEach(([dk, dv]) => n.setAttribute(`data-${dk}`, dv));
    else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (c instanceof Node) n.appendChild(c);
    else n.appendChild(document.createTextNode(String(c)));
  });
  return n;
};

const elNS = (tag, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

const PAPEL_LABELS = {
  entrada: 'Entrada',
  order_bump: 'Order Bump',
  upsell: 'Upsell',
  downsell: 'Downsell',
};

const PAPEL_CORES = {
  entrada: '#22C55E',
  order_bump: '#FB923C',
  upsell: '#E85C00',
  downsell: '#A855F7',
  condicional: '#FBBF24',
};

const COR_SIM = '#22C55E';
const COR_NAO = '#EF4444';

let funilAtual = null;
let estadoEditor = null;
let menuContextoAberto = null;

/* =====================================================================
   QUERIES
   ===================================================================== */
async function fetchFunis() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('vw_funis_catalogo').select('*');
  if (error) { console.error('fetchFunis', error); return []; }
  return data || [];
}

async function fetchProdutosInternos() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('produtos').select('id, slug, nome, emoji, icone_url, categoria, status').eq('categoria', 'interno').order('nome');
  if (error) { console.error('fetchProdutos', error); return []; }
  return data || [];
}

async function fetchAgentes() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('agentes').select('id, slug, nome, avatar, cor, status').order('nome');
  if (error) { console.error('fetchAgentes', error); return []; }
  return data || [];
}

async function fetchEtapas(funilId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funil_etapas').select('*').eq('funil_id', funilId);
  if (error) { console.error('fetchEtapas', error); return []; }
  return data || [];
}

async function fetchConexoes(funilId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funil_conexoes').select('*').eq('funil_id', funilId);
  if (error) { console.error('fetchConexoes', error); return []; }
  return data || [];
}

async function fetchAgentesHabilitados(funilId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funil_agentes').select('agente_id').eq('funil_id', funilId);
  if (error) { console.error('fetchAgentesHab', error); return []; }
  return (data || []).map(r => r.agente_id);
}

async function criarEtapaProduto(funilId, produtoId, papel, x, y) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funil_etapas').insert({
    funil_id: funilId, produto_id: produtoId, papel, tipo: 'produto',
    posicao_x: x, posicao_y: y,
  }).select().single();
  if (error) throw error;
  return data;
}

async function criarEtapaCondicional(funilId, condicaoTexto, x, y) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funil_etapas').insert({
    funil_id: funilId, produto_id: null, papel: 'condicional', tipo: 'condicional',
    condicao_texto: condicaoTexto, posicao_x: x, posicao_y: y,
  }).select().single();
  if (error) throw error;
  return data;
}

async function atualizarPosicao(etapaId, x, y) {
  const sb = getSupabase();
  const { error } = await sb.from('funil_etapas').update({ posicao_x: x, posicao_y: y }).eq('id', etapaId);
  if (error) console.error('atualizarPosicao', error);
}

async function atualizarPapel(etapaId, novoPapel) {
  const sb = getSupabase();
  const { error } = await sb.from('funil_etapas').update({ papel: novoPapel }).eq('id', etapaId);
  if (error) throw error;
}

async function atualizarCondicao(etapaId, condicaoTexto) {
  const sb = getSupabase();
  const { error } = await sb.from('funil_etapas').update({ condicao_texto: condicaoTexto }).eq('id', etapaId);
  if (error) throw error;
}

async function deletarEtapa(etapaId) {
  const sb = getSupabase();
  const { error } = await sb.from('funil_etapas').delete().eq('id', etapaId);
  if (error) throw error;
}

async function criarConexao(funilId, origemId, destinoId, ramo = null) {
  const sb = getSupabase();
  const payload = { funil_id: funilId, etapa_origem_id: origemId, etapa_destino_id: destinoId };
  // ramo ('sim' / 'nao') é guardado como prefixo no id-de-conexao se necessário.
  // Hoje não tem coluna ramo no banco — modelagem mínima: usamos a presença de duas conexões saindo de um condicional pra inferir Sim/Não.
  // Pra MVP, salvamos sem ramo e exibimos ordem de criação.
  const { data, error } = await sb.from('funil_conexoes').insert(payload).select().single();
  if (error) throw error;
  return { ...data, ramo };
}

async function deletarConexao(conexaoId) {
  const sb = getSupabase();
  const { error } = await sb.from('funil_conexoes').delete().eq('id', conexaoId);
  if (error) throw error;
}

async function toggleAgenteHabilitado(funilId, agenteId, habilitar) {
  const sb = getSupabase();
  if (habilitar) {
    const { error } = await sb.from('funil_agentes').insert({ funil_id: funilId, agente_id: agenteId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await sb.from('funil_agentes').delete().eq('funil_id', funilId).eq('agente_id', agenteId);
    if (error) throw error;
  }
}

async function criarFunil(nome, descricao) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funis').insert({ nome, descricao, status: 'rascunho' }).select().single();
  if (error) throw error;
  return data;
}

async function deletarFunil(id) {
  const sb = getSupabase();
  const { error } = await sb.from('funis').delete().eq('id', id);
  if (error) throw error;
}

/* =====================================================================
   ROUTER
   ===================================================================== */
export async function renderFunis() {
  const page = document.getElementById('page-funis');
  if (!page) return;
  if (funilAtual) return renderEditor(page, funilAtual);
  return renderLista(page);
}

/* =====================================================================
   MODAL DE CONFIRMACAO PINGUIM (substitui confirm() nativo)
   ===================================================================== */
function confirmarPinguim({ titulo, descricao, perigoso = false, textoOk = 'Confirmar', textoCancela = 'Cancelar' }) {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'funis-modal-overlay' });
    const modal = el('div', { class: 'funis-modal funis-modal-confirma' }, [
      el('h2', {}, titulo),
      el('p', { class: 'funis-modal-lede' }, descricao),
      el('div', { class: 'funis-modal-acoes' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { overlay.remove(); resolve(false); } }, textoCancela),
        el('button', { type: 'button', class: perigoso ? 'btn btn-danger' : 'btn btn-primary', onclick: () => { overlay.remove(); resolve(true); } }, textoOk),
      ]),
    ]);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) { overlay.remove(); resolve(false); } });
    document.body.appendChild(overlay);
  });
}

function alertaPinguim({ titulo, descricao }) {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'funis-modal-overlay' });
    const modal = el('div', { class: 'funis-modal funis-modal-confirma' }, [
      el('h2', {}, titulo),
      el('p', { class: 'funis-modal-lede' }, descricao),
      el('div', { class: 'funis-modal-acoes' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => { overlay.remove(); resolve(); } }, 'Entendi'),
      ]),
    ]);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) { overlay.remove(); resolve(); } });
    document.body.appendChild(overlay);
  });
}

/* =====================================================================
   LISTA
   ===================================================================== */
async function renderLista(page) {
  page.innerHTML = '<div class="funis-loading">Carregando funis…</div>';
  const funis = await fetchFunis();

  page.innerHTML = '';
  const wrap = el('div', { class: 'funis-lista' });

  wrap.appendChild(el('div', { class: 'funis-header' }, [
    el('div', {}, [
      el('div', { class: 'funis-eyebrow' }, '5º pilar · Estratégia comercial'),
      el('h1', { class: 'funis-titulo' }, 'Funis'),
      el('p', { class: 'funis-lede' }, 'Mapeie como produtos se conectam — entrada, order bumps, upsells, downsells. Cada funil vira inteligência consultável pelos agentes Pinguim.'),
    ]),
    el('button', { class: 'btn btn-primary', onclick: abrirModalNovoFunil }, '+ Novo funil'),
  ]));

  if (funis.length === 0) {
    wrap.appendChild(el('div', { class: 'funis-vazio' }, [
      el('div', { class: 'funis-vazio-icone' }, '🎯'),
      el('div', { class: 'funis-vazio-titulo' }, 'Nenhum funil ainda'),
      el('div', { class: 'funis-vazio-desc' }, 'Crie seu primeiro funil. Pode ser uma campanha, um lançamento, ou uma estratégia de venda. Você arrasta produtos pro canvas e conecta a sequência.'),
      el('button', { class: 'btn btn-primary', style: 'margin-top:1rem', onclick: abrirModalNovoFunil }, 'Criar primeiro funil'),
    ]));
    page.appendChild(wrap);
    return;
  }

  const grid = el('div', { class: 'funis-grid' });
  funis.forEach(f => {
    grid.appendChild(el('div', {
      class: 'funil-card',
      onclick: () => { funilAtual = f; renderFunis(); },
    }, [
      el('div', { class: 'funil-card-head' }, [
        el('h3', {}, f.nome),
        el('span', { class: `badge badge-${f.status}` }, f.status === 'ativo' ? 'Ativo' : f.status === 'arquivado' ? 'Arquivado' : 'Rascunho'),
      ]),
      el('p', { class: 'funil-card-desc' }, f.descricao || 'Sem descrição'),
      el('div', { class: 'funil-card-stats' }, [
        statMini(f.total_etapas, 'etapas'),
        statMini(f.total_conexoes, 'conexões'),
        statMini(f.total_agentes, 'agentes'),
      ]),
    ]));
  });
  wrap.appendChild(grid);
  page.appendChild(wrap);
}

function statMini(valor, label) {
  return el('div', { class: 'funil-card-stat' }, [
    el('div', { class: 'funil-card-stat-valor' }, String(valor)),
    el('div', { class: 'funil-card-stat-label' }, label),
  ]);
}

/* =====================================================================
   MODAL CRIAR FUNIL
   ===================================================================== */
function abrirModalNovoFunil() {
  const overlay = el('div', { class: 'funis-modal-overlay' });
  const modal = el('form', { class: 'funis-modal', onsubmit: async (e) => {
    e.preventDefault();
    const nome = modal.querySelector('input[name=nome]').value.trim();
    const descricao = modal.querySelector('textarea[name=descricao]').value.trim();
    if (!nome) return;
    try {
      const novo = await criarFunil(nome, descricao);
      overlay.remove();
      funilAtual = { ...novo, total_etapas: 0, total_conexoes: 0, total_agentes: 0 };
      renderFunis();
    } catch (err) {
      console.error(err);
      alertaPinguim({ titulo: 'Erro ao criar funil', descricao: err.message });
    }
  } }, [
    el('h2', {}, 'Novo funil'),
    el('p', { class: 'funis-modal-lede' }, 'Pode ser uma campanha, um lançamento ou uma estratégia. O nome aparece pra todos os agentes que consumirem esse funil.'),
    el('label', {}, [
      el('span', {}, 'Nome'),
      el('input', { name: 'nome', type: 'text', required: 'true', placeholder: 'Ex: Campanha Lançamento Elo Q2' }),
    ]),
    el('label', {}, [
      el('span', {}, 'Descrição (opcional)'),
      el('textarea', { name: 'descricao', rows: '3', placeholder: 'Pra que serve esse funil? Qual o objetivo? Que produtos entram?' }),
    ]),
    el('div', { class: 'funis-modal-acoes' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancelar'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Criar funil'),
    ]),
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => modal.querySelector('input[name=nome]')?.focus(), 50);
}

/* =====================================================================
   EDITOR
   ===================================================================== */
async function renderEditor(page, funil) {
  page.innerHTML = '<div class="funis-loading">Carregando editor…</div>';

  const [produtos, etapas, conexoes, agentes, agentesHab] = await Promise.all([
    fetchProdutosInternos(),
    fetchEtapas(funil.id),
    fetchConexoes(funil.id),
    fetchAgentes(),
    fetchAgentesHabilitados(funil.id),
  ]);

  estadoEditor = {
    funil, produtos, etapas, conexoes, agentes,
    agentesHab: new Set(agentesHab),
    selecionado: null,
    conectandoDe: null,
  };

  page.innerHTML = '';

  const editor = el('div', { class: 'funil-editor' });
  editor.appendChild(renderToolbar());

  const sidebar = renderSidebarProdutos();
  const canvas = renderCanvas();

  const corpo = el('div', { class: 'funil-editor-corpo' }, [sidebar, canvas]);
  editor.appendChild(corpo);
  page.appendChild(editor);

  redesenharCanvas();
  document.addEventListener('keydown', handleKeydownEditor);
  document.addEventListener('click', fecharMenuContexto);
}

/* ----- Toolbar com avatares de agentes inline ----- */
function renderToolbar() {
  const avatares = el('div', { class: 'funil-toolbar-agentes', title: 'Agentes que leem este funil' });
  const agentesList = estadoEditor.agentes.filter(a => estadoEditor.agentesHab.has(a.id));
  if (agentesList.length === 0) {
    avatares.appendChild(el('span', { class: 'funil-toolbar-agentes-vazio' }, 'Nenhum agente lê'));
  } else {
    agentesList.slice(0, 5).forEach(a => {
      avatares.appendChild(el('div', {
        class: 'funil-agente-chip',
        style: `background:${a.cor || '#E85C00'}`,
        title: a.nome,
      }, a.avatar || a.nome?.[0] || '?'));
    });
    if (agentesList.length > 5) {
      avatares.appendChild(el('div', { class: 'funil-agente-chip funil-agente-chip-mais' }, `+${agentesList.length - 5}`));
    }
  }
  avatares.appendChild(el('button', {
    class: 'funil-agente-add',
    title: 'Adicionar/remover agentes',
    onclick: abrirModalAgentes,
  }, '+'));

  return el('div', { class: 'funil-editor-toolbar' }, [
    el('button', {
      class: 'funil-voltar',
      onclick: () => { funilAtual = null; estadoEditor = null; renderFunis(); },
    }, '← Funis'),
    el('div', { class: 'funil-editor-titulo' }, [
      el('span', { class: 'funil-editor-nome' }, estadoEditor.funil.nome),
      el('span', { class: `badge badge-${estadoEditor.funil.status}` }, estadoEditor.funil.status === 'ativo' ? 'Ativo' : estadoEditor.funil.status === 'arquivado' ? 'Arquivado' : 'Rascunho'),
    ]),
    avatares,
    el('div', { class: 'funil-editor-acoes' }, [
      el('button', {
        class: 'btn btn-ghost',
        onclick: () => abrirModalNovaCondicional(120, 120),
      }, '◇ Condicional'),
      el('button', {
        class: 'btn btn-danger',
        onclick: async () => {
          const ok = await confirmarPinguim({
            titulo: 'Deletar funil?',
            descricao: `"${estadoEditor.funil.nome}" será removido junto com todas as etapas, conexões e habilitações de agente. Não dá pra desfazer.`,
            perigoso: true,
            textoOk: 'Sim, deletar funil',
          });
          if (!ok) return;
          try {
            await deletarFunil(estadoEditor.funil.id);
            funilAtual = null; estadoEditor = null;
            renderFunis();
          } catch (err) { alertaPinguim({ titulo: 'Erro ao deletar', descricao: err.message }); }
        },
      }, 'Deletar funil'),
    ]),
  ]);
}

function handleKeydownEditor(ev) {
  if (!estadoEditor) {
    document.removeEventListener('keydown', handleKeydownEditor);
    document.removeEventListener('click', fecharMenuContexto);
    return;
  }
  if (ev.target.matches('input, textarea')) return;
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && estadoEditor.selecionado) {
    const sel = estadoEditor.selecionado;
    if (sel.tipo === 'etapa') confirmarERemoverEtapa(sel.id);
    else if (sel.tipo === 'conexao') confirmarERemoverConexao(sel.id);
  }
  if (ev.key === 'Escape') {
    estadoEditor.conectandoDe = null;
    estadoEditor.selecionado = null;
    fecharMenuContexto();
    redesenharCanvas();
  }
}

/* ----- Sidebar de produtos (so internos, com icones reais) ----- */
function renderSidebarProdutos() {
  const sidebar = el('aside', { class: 'funil-sidebar' });
  sidebar.appendChild(el('div', { class: 'funil-sidebar-titulo' }, 'Produtos'));
  sidebar.appendChild(el('div', { class: 'funil-sidebar-lede' }, 'Arraste pro canvas pra adicionar etapa.'));

  if (estadoEditor.produtos.length === 0) {
    sidebar.appendChild(el('div', { class: 'funil-sidebar-placeholder' }, 'Sem produtos internos cadastrados. Vá em Cérebros pra criar produtos primeiro.'));
    return sidebar;
  }

  estadoEditor.produtos.forEach(p => {
    const card = el('div', {
      class: 'funil-produto-card',
      draggable: 'true',
      data: { produtoId: p.id },
      ondragstart: (ev) => {
        ev.dataTransfer.setData('text/plain', p.id);
        ev.dataTransfer.effectAllowed = 'copy';
        card.classList.add('dragging');
      },
      ondragend: () => card.classList.remove('dragging'),
    });
    const ic = iconeNode(p, { size: 24 });
    ic.classList.add('funil-produto-icone-wrap');
    card.appendChild(ic);
    card.appendChild(el('span', { class: 'funil-produto-nome' }, p.nome));
    sidebar.appendChild(card);
  });

  return sidebar;
}

/* ----- Canvas ----- */
function renderCanvas() {
  const canvas = el('div', { class: 'funil-canvas-area', id: 'funil-canvas-area' });

  const svg = elNS('svg', { class: 'funil-svg', id: 'funil-svg' });
  const defs = elNS('defs');

  // Marker laranja
  const marker = elNS('marker', {
    id: 'funil-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5',
    markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
  });
  marker.appendChild(elNS('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#E85C00' }));
  defs.appendChild(marker);

  // Marker verde (Sim)
  const markerSim = elNS('marker', {
    id: 'funil-arrow-sim', viewBox: '0 0 10 10', refX: '8', refY: '5',
    markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
  });
  markerSim.appendChild(elNS('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: COR_SIM }));
  defs.appendChild(markerSim);

  // Marker vermelho (Nao)
  const markerNao = elNS('marker', {
    id: 'funil-arrow-nao', viewBox: '0 0 10 10', refX: '8', refY: '5',
    markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
  });
  markerNao.appendChild(elNS('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: COR_NAO }));
  defs.appendChild(markerNao);

  svg.appendChild(defs);
  canvas.appendChild(svg);

  const nos = el('div', { class: 'funil-nos', id: 'funil-nos' });
  canvas.appendChild(nos);

  // Legenda de atalhos
  canvas.appendChild(el('div', { class: 'funil-canvas-atalhos' }, [
    el('span', { class: 'funil-canvas-atalho' }, [el('kbd', {}, 'DEL'), ' apaga']),
    el('span', { class: 'funil-canvas-atalho' }, [el('kbd', {}, 'DBL CLIQUE'), ' edita']),
    el('span', { class: 'funil-canvas-atalho' }, [el('kbd', {}, 'BOTÃO DIREITO'), ' menu']),
    el('span', { class: 'funil-canvas-atalho' }, [el('kbd', {}, 'ESC'), ' cancela']),
  ]));

  canvas.addEventListener('dragover', (ev) => {
    ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy';
    canvas.classList.add('dragover');
  });
  canvas.addEventListener('dragleave', (ev) => {
    if (ev.target === canvas) canvas.classList.remove('dragover');
  });
  canvas.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    canvas.classList.remove('dragover');
    const produtoId = ev.dataTransfer.getData('text/plain');
    if (!produtoId) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left + canvas.scrollLeft - 90;
    const y = ev.clientY - rect.top + canvas.scrollTop - 35;
    abrirModalPapel(produtoId, x, y);
  });

  canvas.addEventListener('click', (ev) => {
    if (ev.target === canvas || ev.target === svg || ev.target === nos) {
      estadoEditor.conectandoDe = null;
      estadoEditor.selecionado = null;
      redesenharCanvas();
    }
  });

  canvas.addEventListener('contextmenu', (ev) => {
    if (ev.target === canvas || ev.target === svg || ev.target === nos) {
      ev.preventDefault();
      fecharMenuContexto();
    }
  });

  return canvas;
}

/* ----- Modal: papel da etapa nova (so produto, sem cross_sell) ----- */
function abrirModalPapel(produtoId, x, y) {
  const produto = estadoEditor.produtos.find(p => p.id === produtoId);
  if (!produto) return;
  const overlay = el('div', { class: 'funis-modal-overlay' });
  const modal = el('div', { class: 'funis-modal' }, [
    el('h2', {}, 'Qual o papel?'),
    el('p', { class: 'funis-modal-lede' }, [el('strong', {}, produto.nome), ' nesse funil é:']),
    el('div', { class: 'funil-papel-grid' }, Object.entries(PAPEL_LABELS).map(([key, label]) => {
      return el('button', {
        type: 'button',
        class: 'funil-papel-btn',
        style: `--papel-cor: ${PAPEL_CORES[key]}`,
        onclick: async () => {
          overlay.remove();
          try {
            const etapa = await criarEtapaProduto(estadoEditor.funil.id, produtoId, key, x, y);
            estadoEditor.etapas.push(etapa);
            redesenharCanvas();
          } catch (err) { alertaPinguim({ titulo: 'Erro ao criar etapa', descricao: err.message }); }
        },
      }, [
        el('div', { class: 'funil-papel-cor' }),
        el('div', { class: 'funil-papel-label' }, label),
      ]);
    })),
    el('div', { class: 'funis-modal-acoes' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancelar'),
    ]),
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* ----- Modal: criar/editar condicional ----- */
function abrirModalNovaCondicional(x, y) {
  const overlay = el('div', { class: 'funis-modal-overlay' });
  const modal = el('form', { class: 'funis-modal', onsubmit: async (ev) => {
    ev.preventDefault();
    const txt = modal.querySelector('input[name=condicao]').value.trim();
    if (!txt) return;
    try {
      const etapa = await criarEtapaCondicional(estadoEditor.funil.id, txt, x, y);
      estadoEditor.etapas.push(etapa);
      overlay.remove();
      redesenharCanvas();
    } catch (err) { alertaPinguim({ titulo: 'Erro ao criar condicional', descricao: err.message }); }
  } }, [
    el('h2', {}, 'Nova condicional'),
    el('p', { class: 'funis-modal-lede' }, 'Bifurca o funil em dois caminhos baseado numa pergunta. As duas conexões que sairem dela viram Sim (1ª) e Não (2ª).'),
    el('label', {}, [
      el('span', {}, 'Pergunta da condição'),
      el('input', { name: 'condicao', type: 'text', required: 'true', placeholder: 'Ex: Comprou order bump? · Ticket > R$ 500? · Veio do Discord?' }),
    ]),
    el('div', { class: 'funis-modal-acoes' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancelar'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Adicionar'),
    ]),
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => modal.querySelector('input[name=condicao]')?.focus(), 50);
}

function abrirModalEditarEtapa(etapa) {
  if (etapa.tipo === 'condicional') {
    const overlay = el('div', { class: 'funis-modal-overlay' });
    const modal = el('form', { class: 'funis-modal', onsubmit: async (ev) => {
      ev.preventDefault();
      const txt = modal.querySelector('input[name=condicao]').value.trim();
      if (!txt) return;
      try {
        await atualizarCondicao(etapa.id, txt);
        etapa.condicao_texto = txt;
        overlay.remove();
        redesenharCanvas();
      } catch (err) { alertaPinguim({ titulo: 'Erro ao salvar', descricao: err.message }); }
    } }, [
      el('h2', {}, 'Editar condicional'),
      el('label', {}, [
        el('span', {}, 'Pergunta da condição'),
        el('input', { name: 'condicao', type: 'text', required: 'true', value: etapa.condicao_texto || '' }),
      ]),
      el('div', { class: 'funis-modal-acoes' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancelar'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'),
      ]),
    ]);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return;
  }
  // Etapa produto: muda papel
  abrirModalMudarPapel(etapa);
}

function abrirModalMudarPapel(etapa) {
  const produto = estadoEditor.produtos.find(p => p.id === etapa.produto_id);
  const overlay = el('div', { class: 'funis-modal-overlay' });
  const modal = el('div', { class: 'funis-modal' }, [
    el('h2', {}, 'Mudar papel'),
    el('p', { class: 'funis-modal-lede' }, [el('strong', {}, produto?.nome || 'Produto'), ' agora é:']),
    el('div', { class: 'funil-papel-grid' }, Object.entries(PAPEL_LABELS).map(([key, label]) => {
      const ativo = etapa.papel === key;
      return el('button', {
        type: 'button',
        class: 'funil-papel-btn' + (ativo ? ' ativo' : ''),
        style: `--papel-cor: ${PAPEL_CORES[key]}`,
        onclick: async () => {
          overlay.remove();
          if (key === etapa.papel) return;
          try {
            await atualizarPapel(etapa.id, key);
            etapa.papel = key;
            redesenharCanvas();
          } catch (err) { alertaPinguim({ titulo: 'Erro ao mudar papel', descricao: err.message }); }
        },
      }, [
        el('div', { class: 'funil-papel-cor' }),
        el('div', { class: 'funil-papel-label' }, label),
      ]);
    })),
    el('div', { class: 'funis-modal-acoes' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancelar'),
    ]),
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* =====================================================================
   RENDER NOS + CONEXOES
   ===================================================================== */
const NO_LARGURA = 200;
const NO_ALTURA = 78;
const COND_TAMANHO = 110;

function redesenharCanvas() {
  const nos = document.getElementById('funil-nos');
  const svg = document.getElementById('funil-svg');
  if (!nos || !svg) return;

  nos.innerHTML = '';
  Array.from(svg.querySelectorAll('.funil-conexao, .funil-conexao-hit, .funil-conexao-label')).forEach(n => n.remove());

  estadoEditor.etapas.forEach(etapa => {
    const noEl = etapa.tipo === 'condicional'
      ? renderNoCondicional(etapa)
      : renderNoProduto(etapa);
    if (noEl) nos.appendChild(noEl);
  });

  estadoEditor.conexoes.forEach(conexao => {
    const origem = estadoEditor.etapas.find(e => e.id === conexao.etapa_origem_id);
    const destino = estadoEditor.etapas.find(e => e.id === conexao.etapa_destino_id);
    if (!origem || !destino) return;
    desenharConexao(svg, conexao, origem, destino);
  });

  ajustarTamanhoSvg();
}

function renderNoProduto(etapa) {
  const produto = estadoEditor.produtos.find(p => p.id === etapa.produto_id);
  if (!produto) return null;
  const isSel = estadoEditor.selecionado?.tipo === 'etapa' && estadoEditor.selecionado.id === etapa.id;
  const isConn = estadoEditor.conectandoDe === etapa.id;
  const cor = PAPEL_CORES[etapa.papel] || '#888';

  const ic = iconeNode(produto, { size: 28 });
  ic.classList.add('funil-no-icone-wrap');

  const no = el('div', {
    class: 'funil-no funil-no-produto' + (isSel ? ' selecionado' : '') + (isConn ? ' conectando' : ''),
    style: `left:${etapa.posicao_x}px;top:${etapa.posicao_y}px;border-color:${cor}`,
    data: { etapaId: etapa.id },
  }, [
    // Handle de entrada (esquerda)
    el('div', { class: 'funil-no-handle entrada', title: 'Entrada' }),
    el('div', { class: 'funil-no-head' }, [
      ic,
      el('span', { class: 'funil-no-nome' }, produto.nome),
    ]),
    el('div', { class: 'funil-no-papel', style: `color:${cor};border-color:${cor}` }, PAPEL_LABELS[etapa.papel]),
    // Handle de saida (direita)
    el('button', {
      class: 'funil-no-handle saida',
      title: 'Conectar a outra etapa (clique aqui, depois clique no destino)',
      onclick: (ev) => {
        ev.stopPropagation();
        estadoEditor.conectandoDe = estadoEditor.conectandoDe === etapa.id ? null : etapa.id;
        redesenharCanvas();
      },
    }, '→'),
  ]);

  instalarInteracoesNo(no, etapa);
  return no;
}

function renderNoCondicional(etapa) {
  const isSel = estadoEditor.selecionado?.tipo === 'etapa' && estadoEditor.selecionado.id === etapa.id;
  const isConn = estadoEditor.conectandoDe === etapa.id;
  const cor = PAPEL_CORES.condicional;

  // Conta saidas pra mostrar Sim/Nao
  const saidas = estadoEditor.conexoes.filter(c => c.etapa_origem_id === etapa.id);

  const no = el('div', {
    class: 'funil-no funil-no-condicional' + (isSel ? ' selecionado' : '') + (isConn ? ' conectando' : ''),
    style: `left:${etapa.posicao_x}px;top:${etapa.posicao_y}px;width:${COND_TAMANHO}px;height:${COND_TAMANHO}px`,
    data: { etapaId: etapa.id },
  }, [
    el('div', { class: 'funil-no-cond-losango', style: `border-color:${cor}` }, [
      el('div', { class: 'funil-no-cond-conteudo' }, [
        el('div', { class: 'funil-no-cond-icone' }, '◇'),
        el('div', { class: 'funil-no-cond-texto' }, etapa.condicao_texto || 'Condição'),
      ]),
    ]),
    // Handle entrada esquerda
    el('div', { class: 'funil-no-handle entrada cond', title: 'Entrada' }),
    // Handle saida Sim (direita-cima)
    el('button', {
      class: 'funil-no-handle saida cond-sim',
      title: saidas[0] ? 'SIM (já conectada)' : 'Conectar Sim',
      onclick: (ev) => {
        ev.stopPropagation();
        estadoEditor.conectandoDe = estadoEditor.conectandoDe === etapa.id + ':sim' ? null : etapa.id + ':sim';
        redesenharCanvas();
      },
    }, '✓'),
    // Handle saida Nao (direita-baixo)
    el('button', {
      class: 'funil-no-handle saida cond-nao',
      title: saidas[1] ? 'NÃO (já conectada)' : 'Conectar Não',
      onclick: (ev) => {
        ev.stopPropagation();
        estadoEditor.conectandoDe = estadoEditor.conectandoDe === etapa.id + ':nao' ? null : etapa.id + ':nao';
        redesenharCanvas();
      },
    }, '✗'),
  ]);

  instalarInteracoesNo(no, etapa);
  return no;
}

function instalarInteracoesNo(noEl, etapa) {
  // Drag pra mover
  let inicio = null;
  noEl.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.funil-no-handle')) return;
    if (ev.button !== 0) return;
    inicio = {
      mouseX: ev.clientX, mouseY: ev.clientY,
      x0: etapa.posicao_x, y0: etapa.posicao_y, moveu: false,
    };
    noEl.setPointerCapture(ev.pointerId);
  });
  noEl.addEventListener('pointermove', (ev) => {
    if (!inicio) return;
    const dx = ev.clientX - inicio.mouseX;
    const dy = ev.clientY - inicio.mouseY;
    if (!inicio.moveu && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) inicio.moveu = true;
    if (!inicio.moveu) return;
    etapa.posicao_x = Math.max(0, inicio.x0 + dx);
    etapa.posicao_y = Math.max(0, inicio.y0 + dy);
    noEl.style.left = etapa.posicao_x + 'px';
    noEl.style.top = etapa.posicao_y + 'px';
    redesenharApenasConexoes();
  });
  noEl.addEventListener('pointerup', (ev) => {
    if (!inicio) return;
    const moveu = inicio.moveu;
    noEl.releasePointerCapture(ev.pointerId);
    if (moveu) atualizarPosicao(etapa.id, etapa.posicao_x, etapa.posicao_y);
    inicio = null;
  });
  noEl.addEventListener('pointercancel', () => { inicio = null; });

  // Click: selecionar OU conectar
  noEl.addEventListener('click', async (ev) => {
    if (ev.target.closest('.funil-no-handle')) return;
    ev.stopPropagation();
    const conn = estadoEditor.conectandoDe;
    const origemId = conn?.split(':')[0];
    if (origemId && origemId !== etapa.id) {
      tentarConectar(origemId, etapa.id, conn.split(':')[1] || null);
      return;
    }
    estadoEditor.selecionado = { tipo: 'etapa', id: etapa.id };
    redesenharCanvas();
  });

  // Double-click: editar
  noEl.addEventListener('dblclick', (ev) => {
    ev.stopPropagation();
    abrirModalEditarEtapa(etapa);
  });

  // Right-click: menu de contexto
  noEl.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    abrirMenuContexto(ev.clientX, ev.clientY, etapa);
  });
}

async function tentarConectar(origemId, destinoId, ramo) {
  // Bloqueio: A → A
  if (origemId === destinoId) {
    await alertaPinguim({ titulo: 'Conexão inválida', descricao: 'Uma etapa não pode se conectar a si mesma.' });
    estadoEditor.conectandoDe = null;
    redesenharCanvas();
    return;
  }
  // Bloqueio: ja existe
  const ja = estadoEditor.conexoes.find(c => c.etapa_origem_id === origemId && c.etapa_destino_id === destinoId);
  if (ja) {
    await alertaPinguim({ titulo: 'Conexão duplicada', descricao: 'Essas duas etapas já estão conectadas.' });
    estadoEditor.conectandoDe = null;
    redesenharCanvas();
    return;
  }
  // Bloqueio: loop curto A → B → A
  const voltariaPraOrigem = estadoEditor.conexoes.some(c => c.etapa_origem_id === destinoId && c.etapa_destino_id === origemId);
  if (voltariaPraOrigem) {
    await alertaPinguim({
      titulo: 'Funil não pode ter ciclo',
      descricao: 'Essa conexão criaria um loop (A → B → A). Funil de venda é direcional — pessoa avança, não volta.',
    });
    estadoEditor.conectandoDe = null;
    redesenharCanvas();
    return;
  }
  try {
    const conexao = await criarConexao(estadoEditor.funil.id, origemId, destinoId, ramo);
    estadoEditor.conexoes.push(conexao);
    estadoEditor.conectandoDe = null;
    redesenharCanvas();
  } catch (err) {
    if (err.code === '23505') {
      await alertaPinguim({ titulo: 'Conexão duplicada', descricao: 'Essas duas etapas já estão conectadas.' });
    } else {
      await alertaPinguim({ titulo: 'Erro ao conectar', descricao: err.message });
    }
    estadoEditor.conectandoDe = null;
    redesenharCanvas();
  }
}

function desenharConexao(svg, conexao, origem, destino) {
  const ehCondOrigem = origem.tipo === 'condicional';
  const saidasOrigem = ehCondOrigem ? estadoEditor.conexoes.filter(c => c.etapa_origem_id === origem.id) : null;
  const ramo = ehCondOrigem ? (saidasOrigem[0]?.id === conexao.id ? 'sim' : 'nao') : null;

  // Pontos de saida
  let x1, y1;
  if (ehCondOrigem) {
    if (ramo === 'sim') {
      x1 = origem.posicao_x + COND_TAMANHO * 0.85;
      y1 = origem.posicao_y + COND_TAMANHO * 0.25;
    } else {
      x1 = origem.posicao_x + COND_TAMANHO * 0.85;
      y1 = origem.posicao_y + COND_TAMANHO * 0.75;
    }
  } else {
    x1 = origem.posicao_x + NO_LARGURA;
    y1 = origem.posicao_y + NO_ALTURA / 2;
  }
  // Pontos de entrada
  let x2, y2;
  if (destino.tipo === 'condicional') {
    x2 = destino.posicao_x + COND_TAMANHO * 0.15;
    y2 = destino.posicao_y + COND_TAMANHO * 0.5;
  } else {
    x2 = destino.posicao_x;
    y2 = destino.posicao_y + NO_ALTURA / 2;
  }

  const dx = Math.abs(x2 - x1);
  const cx1 = x1 + Math.max(50, dx * 0.45);
  const cx2 = x2 - Math.max(50, dx * 0.45);
  const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  const isSel = estadoEditor.selecionado?.tipo === 'conexao' && estadoEditor.selecionado.id === conexao.id;

  // Hit area invisivel
  const hit = elNS('path', {
    class: 'funil-conexao-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': '14',
  });
  hit.style.cursor = 'pointer';
  hit.addEventListener('click', (ev) => {
    ev.stopPropagation();
    estadoEditor.selecionado = { tipo: 'conexao', id: conexao.id };
    redesenharCanvas();
  });
  hit.addEventListener('contextmenu', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    abrirMenuContextoConexao(ev.clientX, ev.clientY, conexao);
  });
  svg.appendChild(hit);

  // Cor da linha
  let stroke = '#E85C00';
  let markerEnd = 'url(#funil-arrow)';
  if (ramo === 'sim') { stroke = COR_SIM; markerEnd = 'url(#funil-arrow-sim)'; }
  else if (ramo === 'nao') { stroke = COR_NAO; markerEnd = 'url(#funil-arrow-nao)'; }
  if (isSel) stroke = '#FF6B00';

  const path = elNS('path', {
    class: 'funil-conexao' + (isSel ? ' selecionada' : ''),
    d, fill: 'none',
    stroke,
    'stroke-width': isSel ? '3' : '2',
    'stroke-linecap': 'round',
    'marker-end': markerEnd,
  });
  if (!isSel) {
    path.setAttribute('stroke-dasharray', '6 5');
    path.style.animation = 'funilFlow 1s linear infinite';
  }
  svg.appendChild(path);

  // Label "Sim"/"Nao" em condicional
  if (ramo) {
    const label = elNS('text', {
      class: 'funil-conexao-label',
      x: String((x1 + cx1) / 2),
      y: String(y1 - 6),
      fill: stroke,
      'font-family': 'JetBrains Mono, ui-monospace, monospace',
      'font-size': '10',
      'font-weight': '700',
      'text-anchor': 'middle',
    });
    label.textContent = ramo === 'sim' ? 'SIM' : 'NÃO';
    svg.appendChild(label);
  }
}

function ajustarTamanhoSvg() {
  const svg = document.getElementById('funil-svg');
  const area = document.getElementById('funil-canvas-area');
  if (!svg || !area) return;
  let maxX = 0, maxY = 0;
  estadoEditor.etapas.forEach(e => {
    const w = e.tipo === 'condicional' ? COND_TAMANHO : NO_LARGURA;
    const h = e.tipo === 'condicional' ? COND_TAMANHO : NO_ALTURA;
    maxX = Math.max(maxX, e.posicao_x + w + 80);
    maxY = Math.max(maxY, e.posicao_y + h + 80);
  });
  svg.setAttribute('width', String(Math.max(area.clientWidth, maxX)));
  svg.setAttribute('height', String(Math.max(area.clientHeight, maxY)));
}

function redesenharApenasConexoes() {
  const svg = document.getElementById('funil-svg');
  if (!svg) return;
  Array.from(svg.querySelectorAll('.funil-conexao, .funil-conexao-hit, .funil-conexao-label')).forEach(n => n.remove());
  estadoEditor.conexoes.forEach(conexao => {
    const origem = estadoEditor.etapas.find(e => e.id === conexao.etapa_origem_id);
    const destino = estadoEditor.etapas.find(e => e.id === conexao.etapa_destino_id);
    if (origem && destino) desenharConexao(svg, conexao, origem, destino);
  });
  ajustarTamanhoSvg();
}

/* ----- Menu de contexto ----- */
function fecharMenuContexto() {
  if (menuContextoAberto) { menuContextoAberto.remove(); menuContextoAberto = null; }
}

function abrirMenuContexto(x, y, etapa) {
  fecharMenuContexto();
  const menu = el('div', { class: 'funil-menu-contexto', style: `left:${x}px;top:${y}px` }, [
    el('button', { onclick: () => { fecharMenuContexto(); abrirModalEditarEtapa(etapa); } }, [
      el('span', { class: 'funil-menu-icone' }, '✎'), 'Editar'
    ]),
    etapa.tipo === 'produto' ? el('button', { onclick: () => { fecharMenuContexto(); abrirModalMudarPapel(etapa); } }, [
      el('span', { class: 'funil-menu-icone' }, '◐'), 'Mudar papel'
    ]) : null,
    el('div', { class: 'funil-menu-divisor' }),
    el('button', { class: 'funil-menu-perigo', onclick: () => { fecharMenuContexto(); confirmarERemoverEtapa(etapa.id); } }, [
      el('span', { class: 'funil-menu-icone' }, '🗑'), 'Deletar'
    ]),
  ]);
  document.body.appendChild(menu);
  menuContextoAberto = menu;
  // Ajusta posicao se sair da tela
  setTimeout(() => {
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth) menu.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight) menu.style.top = (y - r.height) + 'px';
  }, 0);
}

function abrirMenuContextoConexao(x, y, conexao) {
  fecharMenuContexto();
  const menu = el('div', { class: 'funil-menu-contexto', style: `left:${x}px;top:${y}px` }, [
    el('button', { class: 'funil-menu-perigo', onclick: () => { fecharMenuContexto(); confirmarERemoverConexao(conexao.id); } }, [
      el('span', { class: 'funil-menu-icone' }, '🗑'), 'Deletar conexão'
    ]),
  ]);
  document.body.appendChild(menu);
  menuContextoAberto = menu;
}

async function confirmarERemoverEtapa(etapaId) {
  const etapa = estadoEditor.etapas.find(e => e.id === etapaId);
  if (!etapa) return;
  const produto = etapa.tipo === 'produto' ? estadoEditor.produtos.find(p => p.id === etapa.produto_id) : null;
  const nome = etapa.tipo === 'condicional' ? `Condicional "${etapa.condicao_texto || 'sem texto'}"` : (produto?.nome || 'Etapa');
  const conexoesAfetadas = estadoEditor.conexoes.filter(c => c.etapa_origem_id === etapaId || c.etapa_destino_id === etapaId).length;

  const ok = await confirmarPinguim({
    titulo: 'Deletar etapa?',
    descricao: `${nome} será removida do funil${conexoesAfetadas > 0 ? `, junto com ${conexoesAfetadas} conexão(ões) ligada(s) a ela` : ''}. Não dá pra desfazer.`,
    perigoso: true,
    textoOk: 'Sim, deletar',
  });
  if (!ok) return;

  try {
    await deletarEtapa(etapaId);
    estadoEditor.etapas = estadoEditor.etapas.filter(e => e.id !== etapaId);
    estadoEditor.conexoes = estadoEditor.conexoes.filter(c => c.etapa_origem_id !== etapaId && c.etapa_destino_id !== etapaId);
    estadoEditor.selecionado = null;
    redesenharCanvas();
  } catch (err) { alertaPinguim({ titulo: 'Erro', descricao: err.message }); }
}

async function confirmarERemoverConexao(conexaoId) {
  const ok = await confirmarPinguim({
    titulo: 'Deletar conexão?',
    descricao: 'A linha entre as duas etapas será removida. As etapas continuam no funil.',
    perigoso: true,
    textoOk: 'Sim, deletar',
  });
  if (!ok) return;
  try {
    await deletarConexao(conexaoId);
    estadoEditor.conexoes = estadoEditor.conexoes.filter(c => c.id !== conexaoId);
    estadoEditor.selecionado = null;
    redesenharCanvas();
  } catch (err) { alertaPinguim({ titulo: 'Erro', descricao: err.message }); }
}

/* ----- Modal de agentes (mantido, redesenhado pra abrir do header) ----- */
function abrirModalAgentes() {
  const overlay = el('div', { class: 'funis-modal-overlay' });
  const modal = el('div', { class: 'funis-modal funis-modal-grande' }, [
    el('h2', {}, 'Quem lê este funil?'),
    el('p', { class: 'funis-modal-lede' }, 'Marque os agentes Pinguim que devem consultar este funil. Cada funil pode ter combinação própria — SDR e Co-piloto podem ter visões diferentes da mesma campanha.'),
    el('div', { class: 'funil-agentes-lista' },
      estadoEditor.agentes.length === 0
        ? [el('div', { class: 'funis-vazio-desc' }, 'Nenhum agente cadastrado ainda.')]
        : estadoEditor.agentes.map(a => {
            const habilitado = estadoEditor.agentesHab.has(a.id);
            const item = el('label', { class: 'funil-agente-item' + (habilitado ? ' habilitado' : '') }, [
              el('input', { type: 'checkbox', checked: habilitado ? 'true' : null }),
              el('div', { class: 'funil-agente-avatar', style: `background:${a.cor || '#E85C00'}` }, a.avatar || a.nome?.[0] || '?'),
              el('div', { class: 'funil-agente-info' }, [
                el('div', { class: 'funil-agente-nome' }, a.nome),
                el('div', { class: 'funil-agente-status' }, a.status || '—'),
              ]),
            ]);
            const checkbox = item.querySelector('input');
            checkbox.addEventListener('change', async () => {
              const marcar = checkbox.checked;
              try {
                await toggleAgenteHabilitado(estadoEditor.funil.id, a.id, marcar);
                if (marcar) estadoEditor.agentesHab.add(a.id);
                else estadoEditor.agentesHab.delete(a.id);
                item.classList.toggle('habilitado', marcar);
              } catch (err) {
                checkbox.checked = !marcar;
                alertaPinguim({ titulo: 'Erro', descricao: err.message });
              }
            });
            return item;
          })
    ),
    el('div', { class: 'funis-modal-acoes' }, [
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        overlay.remove();
        // Re-renderiza toolbar pra atualizar avatares
        renderEditor(document.getElementById('page-funis'), estadoEditor.funil);
      } }, 'Concluído'),
    ]),
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
