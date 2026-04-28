/* Pinguim OS — Funis (5o pilar)
   Sessao 2: drag-and-drop, conexoes bezier vivas, persistencia em tempo real,
   habilitar agentes por funil.
*/

import { getSupabase } from './sb-client.js?v=20260428b';

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
  cross_sell: 'Cross-sell',
};

const PAPEL_CORES = {
  entrada: '#22C55E',
  order_bump: '#FB923C',
  upsell: '#E85C00',
  downsell: '#A855F7',
  cross_sell: '#3B82F6',
};

let funilAtual = null;
let estadoEditor = null; // { etapas, conexoes, produtos, agentes }

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

async function fetchProdutos() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('produtos').select('id, slug, nome, emoji, icone_url, categoria, status').order('nome');
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

async function criarEtapa(funilId, produtoId, papel, x, y) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funil_etapas').insert({
    funil_id: funilId,
    produto_id: produtoId,
    papel,
    posicao_x: x,
    posicao_y: y,
  }).select().single();
  if (error) throw error;
  return data;
}

async function atualizarPosicao(etapaId, x, y) {
  const sb = getSupabase();
  const { error } = await sb.from('funil_etapas').update({ posicao_x: x, posicao_y: y }).eq('id', etapaId);
  if (error) console.error('atualizarPosicao', error);
}

async function deletarEtapa(etapaId) {
  const sb = getSupabase();
  const { error } = await sb.from('funil_etapas').delete().eq('id', etapaId);
  if (error) throw error;
}

async function criarConexao(funilId, origemId, destinoId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('funil_conexoes').insert({
    funil_id: funilId,
    etapa_origem_id: origemId,
    etapa_destino_id: destinoId,
  }).select().single();
  if (error) throw error;
  return data;
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
  if (funilAtual) {
    return renderEditor(page, funilAtual);
  }
  return renderLista(page);
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
      alert('Erro ao criar funil: ' + err.message);
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
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => modal.querySelector('input[name=nome]')?.focus(), 50);
}

/* =====================================================================
   EDITOR — drag, drop, conexoes
   ===================================================================== */
async function renderEditor(page, funil) {
  page.innerHTML = '<div class="funis-loading">Carregando editor…</div>';

  const [produtos, etapas, conexoes, agentes, agentesHab] = await Promise.all([
    fetchProdutos(),
    fetchEtapas(funil.id),
    fetchConexoes(funil.id),
    fetchAgentes(),
    fetchAgentesHabilitados(funil.id),
  ]);

  estadoEditor = {
    funil,
    produtos,
    etapas,
    conexoes,
    agentes,
    agentesHab: new Set(agentesHab),
    selecionado: null,        // id da etapa selecionada
    conectandoDe: null,        // id da etapa origem em modo conexao
  };

  page.innerHTML = '';

  const editor = el('div', { class: 'funil-editor' });

  // Toolbar
  editor.appendChild(el('div', { class: 'funil-editor-toolbar' }, [
    el('button', {
      class: 'funil-voltar',
      onclick: () => { funilAtual = null; estadoEditor = null; renderFunis(); },
    }, '← Funis'),
    el('div', { class: 'funil-editor-titulo' }, [
      el('span', { class: 'funil-editor-nome' }, funil.nome),
      el('span', { class: `badge badge-${funil.status}` }, funil.status === 'ativo' ? 'Ativo' : funil.status === 'arquivado' ? 'Arquivado' : 'Rascunho'),
    ]),
    el('div', { class: 'funil-editor-acoes' }, [
      el('button', { class: 'btn btn-ghost', onclick: abrirModalAgentes }, '🤖 Agentes'),
      el('button', { class: 'btn btn-danger', onclick: async () => {
        if (!confirm(`Deletar "${funil.nome}"? Etapas e conexões serão removidas. Não tem volta.`)) return;
        try {
          await deletarFunil(funil.id);
          funilAtual = null; estadoEditor = null;
          renderFunis();
        } catch (err) { alert('Erro ao deletar: ' + err.message); }
      } }, 'Deletar'),
    ]),
  ]));

  // Corpo: sidebar + canvas
  const sidebar = renderSidebarProdutos();
  const canvas = renderCanvas();

  const corpo = el('div', { class: 'funil-editor-corpo' }, [sidebar, canvas]);
  editor.appendChild(corpo);
  page.appendChild(editor);

  // Inicializa SVG das conexoes ja existentes
  redesenharCanvas();

  // Atalhos: Delete pra remover selecionado, Esc pra cancelar conexao
  document.addEventListener('keydown', handleKeydownEditor);
}

function handleKeydownEditor(ev) {
  if (!estadoEditor) {
    document.removeEventListener('keydown', handleKeydownEditor);
    return;
  }
  if (ev.target.matches('input, textarea')) return;
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && estadoEditor.selecionado) {
    const sel = estadoEditor.selecionado;
    if (sel.tipo === 'etapa') removerEtapa(sel.id);
    else if (sel.tipo === 'conexao') removerConexao(sel.id);
  }
  if (ev.key === 'Escape') {
    estadoEditor.conectandoDe = null;
    estadoEditor.selecionado = null;
    redesenharCanvas();
  }
}

/* ----- Sidebar de produtos ----- */
function renderSidebarProdutos() {
  const sidebar = el('aside', { class: 'funil-sidebar' });
  sidebar.appendChild(el('div', { class: 'funil-sidebar-titulo' }, 'Produtos'));
  sidebar.appendChild(el('div', { class: 'funil-sidebar-lede' }, 'Arraste pro canvas pra adicionar etapa.'));

  // Agrupar por categoria
  const porCat = {};
  estadoEditor.produtos.forEach(p => {
    const cat = p.categoria || 'interno';
    (porCat[cat] = porCat[cat] || []).push(p);
  });

  const ordemCat = ['interno', 'metodologia', 'externo', 'clone'];
  const labelCat = { interno: 'Internos', metodologia: 'Metodologias', externo: 'Externos', clone: 'Clones' };

  ordemCat.forEach(cat => {
    if (!porCat[cat] || porCat[cat].length === 0) return;
    sidebar.appendChild(el('div', { class: 'funil-sidebar-cat' }, labelCat[cat] || cat));
    porCat[cat].forEach(p => {
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
      }, [
        el('span', { class: 'funil-produto-icone' }, p.emoji || '📦'),
        el('span', { class: 'funil-produto-nome' }, p.nome),
      ]);
      sidebar.appendChild(card);
    });
  });

  if (estadoEditor.produtos.length === 0) {
    sidebar.appendChild(el('div', { class: 'funil-sidebar-placeholder' }, 'Sem produtos cadastrados. Vá em Cérebros pra criar produtos primeiro.'));
  }

  return sidebar;
}

/* ----- Canvas com SVG ----- */
function renderCanvas() {
  const canvas = el('div', { class: 'funil-canvas-area', id: 'funil-canvas-area' });

  // SVG layer pras conexoes
  const svg = elNS('svg', { class: 'funil-svg', id: 'funil-svg' });
  // Defs pra marker (seta)
  const defs = elNS('defs');
  const marker = elNS('marker', {
    id: 'funil-arrow',
    viewBox: '0 0 10 10',
    refX: '8', refY: '5',
    markerWidth: '7', markerHeight: '7',
    orient: 'auto-start-reverse',
  });
  marker.appendChild(elNS('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#E85C00' }));
  defs.appendChild(marker);
  svg.appendChild(defs);
  canvas.appendChild(svg);

  // Layer dos nos
  const nos = el('div', { class: 'funil-nos', id: 'funil-nos' });
  canvas.appendChild(nos);

  // Drop target
  canvas.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
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
    const y = ev.clientY - rect.top + canvas.scrollTop - 30;
    abrirModalPapel(produtoId, x, y);
  });

  // Click no fundo do canvas: deseleciona
  canvas.addEventListener('click', (ev) => {
    if (ev.target === canvas || ev.target === svg || ev.target === nos) {
      estadoEditor.conectandoDe = null;
      estadoEditor.selecionado = null;
      redesenharCanvas();
    }
  });

  return canvas;
}

/* ----- Modal: escolher papel da nova etapa ----- */
function abrirModalPapel(produtoId, x, y) {
  const produto = estadoEditor.produtos.find(p => p.id === produtoId);
  if (!produto) return;
  const overlay = el('div', { class: 'funis-modal-overlay' });
  const modal = el('div', { class: 'funis-modal' }, [
    el('h2', {}, 'Qual o papel?'),
    el('p', { class: 'funis-modal-lede' }, [
      el('strong', {}, produto.nome),
      ' nesse funil é:',
    ]),
    el('div', { class: 'funil-papel-grid' }, Object.entries(PAPEL_LABELS).map(([key, label]) => {
      return el('button', {
        type: 'button',
        class: 'funil-papel-btn',
        style: `--papel-cor: ${PAPEL_CORES[key]}`,
        onclick: async () => {
          overlay.remove();
          try {
            const etapa = await criarEtapa(estadoEditor.funil.id, produtoId, key, x, y);
            estadoEditor.etapas.push(etapa);
            redesenharCanvas();
          } catch (err) { alert('Erro ao criar etapa: ' + err.message); }
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

/* ----- Renderiza nos + conexoes ----- */
const NO_LARGURA = 180;
const NO_ALTURA = 70;

function redesenharCanvas() {
  const nos = document.getElementById('funil-nos');
  const svg = document.getElementById('funil-svg');
  if (!nos || !svg) return;

  // Limpa
  nos.innerHTML = '';
  // Remove paths antigos (mantem defs)
  Array.from(svg.querySelectorAll('.funil-conexao, .funil-conexao-hit')).forEach(n => n.remove());

  // Renderiza nos
  estadoEditor.etapas.forEach(etapa => {
    const produto = estadoEditor.produtos.find(p => p.id === etapa.produto_id);
    if (!produto) return;
    const isConectandoDe = estadoEditor.conectandoDe === etapa.id;
    const isSelecionado = estadoEditor.selecionado?.tipo === 'etapa' && estadoEditor.selecionado.id === etapa.id;
    const cor = PAPEL_CORES[etapa.papel] || '#888';

    const no = el('div', {
      class: 'funil-no' + (isSelecionado ? ' selecionado' : '') + (isConectandoDe ? ' conectando' : ''),
      style: `left:${etapa.posicao_x}px;top:${etapa.posicao_y}px;border-color:${cor}`,
      data: { etapaId: etapa.id },
    }, [
      el('div', { class: 'funil-no-head' }, [
        el('span', { class: 'funil-no-icone' }, produto.emoji || '📦'),
        el('span', { class: 'funil-no-nome' }, produto.nome),
      ]),
      el('div', { class: 'funil-no-papel', style: `color:${cor};border-color:${cor}` }, PAPEL_LABELS[etapa.papel]),
      // Handle de saida
      el('button', {
        class: 'funil-no-handle saida',
        title: 'Conectar a outra etapa',
        onclick: (ev) => {
          ev.stopPropagation();
          if (estadoEditor.conectandoDe === etapa.id) {
            estadoEditor.conectandoDe = null;
          } else {
            estadoEditor.conectandoDe = etapa.id;
          }
          redesenharCanvas();
        },
      }, '→'),
    ]);

    // Click no no: selecionar OU conectar
    no.addEventListener('click', async (ev) => {
      if (ev.target.closest('.funil-no-handle')) return;
      ev.stopPropagation();
      if (estadoEditor.conectandoDe && estadoEditor.conectandoDe !== etapa.id) {
        // Cria conexao
        try {
          const conexao = await criarConexao(estadoEditor.funil.id, estadoEditor.conectandoDe, etapa.id);
          estadoEditor.conexoes.push(conexao);
          estadoEditor.conectandoDe = null;
          redesenharCanvas();
        } catch (err) {
          if (err.code === '23505') {
            alert('Essa conexão já existe.');
          } else {
            alert('Erro ao conectar: ' + err.message);
          }
          estadoEditor.conectandoDe = null;
          redesenharCanvas();
        }
        return;
      }
      estadoEditor.selecionado = { tipo: 'etapa', id: etapa.id };
      redesenharCanvas();
    });

    // Drag pra mover
    instalarDragMover(no, etapa);

    nos.appendChild(no);
  });

  // Renderiza conexoes
  estadoEditor.conexoes.forEach(conexao => {
    const origem = estadoEditor.etapas.find(e => e.id === conexao.etapa_origem_id);
    const destino = estadoEditor.etapas.find(e => e.id === conexao.etapa_destino_id);
    if (!origem || !destino) return;
    desenharConexao(svg, conexao, origem, destino);
  });

  // Atualiza tamanho do SVG pra cobrir o canvas
  ajustarTamanhoSvg();
}

function desenharConexao(svg, conexao, origem, destino) {
  const x1 = origem.posicao_x + NO_LARGURA;
  const y1 = origem.posicao_y + NO_ALTURA / 2;
  const x2 = destino.posicao_x;
  const y2 = destino.posicao_y + NO_ALTURA / 2;

  // Bezier control points
  const dx = Math.abs(x2 - x1);
  const cx1 = x1 + Math.max(40, dx * 0.4);
  const cx2 = x2 - Math.max(40, dx * 0.4);

  const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  const isSelecionado = estadoEditor.selecionado?.tipo === 'conexao' && estadoEditor.selecionado.id === conexao.id;

  // Path invisivel grosso pra clique
  const hit = elNS('path', {
    class: 'funil-conexao-hit',
    d, fill: 'none', stroke: 'transparent', 'stroke-width': '14',
  });
  hit.style.cursor = 'pointer';
  hit.addEventListener('click', (ev) => {
    ev.stopPropagation();
    estadoEditor.selecionado = { tipo: 'conexao', id: conexao.id };
    redesenharCanvas();
  });
  svg.appendChild(hit);

  // Path visivel
  const path = elNS('path', {
    class: 'funil-conexao' + (isSelecionado ? ' selecionada' : ''),
    d, fill: 'none',
    stroke: isSelecionado ? '#FF6B00' : '#E85C00',
    'stroke-width': isSelecionado ? '2.5' : '1.75',
    'marker-end': 'url(#funil-arrow)',
  });
  if (!isSelecionado) {
    path.setAttribute('stroke-dasharray', '5 4');
    path.style.animation = 'funilFlow 1.2s linear infinite';
  }
  svg.appendChild(path);
}

function ajustarTamanhoSvg() {
  const svg = document.getElementById('funil-svg');
  const area = document.getElementById('funil-canvas-area');
  if (!svg || !area) return;
  // Calcula maior x/y dos nos
  let maxX = 0, maxY = 0;
  estadoEditor.etapas.forEach(e => {
    maxX = Math.max(maxX, e.posicao_x + NO_LARGURA + 80);
    maxY = Math.max(maxY, e.posicao_y + NO_ALTURA + 80);
  });
  const w = Math.max(area.clientWidth, maxX);
  const h = Math.max(area.clientHeight, maxY);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
}

/* ----- Drag pra mover etapa ----- */
function instalarDragMover(noEl, etapa) {
  let inicio = null;
  noEl.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.funil-no-handle')) return;
    if (ev.button !== 0) return;
    inicio = {
      mouseX: ev.clientX,
      mouseY: ev.clientY,
      x0: etapa.posicao_x,
      y0: etapa.posicao_y,
      moveu: false,
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
    // Redesenha conexoes (sem refazer todos os nos)
    redesenharApenasConexoes();
  });
  noEl.addEventListener('pointerup', (ev) => {
    if (!inicio) return;
    const moveu = inicio.moveu;
    noEl.releasePointerCapture(ev.pointerId);
    if (moveu) {
      atualizarPosicao(etapa.id, etapa.posicao_x, etapa.posicao_y);
    }
    inicio = null;
  });
  noEl.addEventListener('pointercancel', () => { inicio = null; });
}

function redesenharApenasConexoes() {
  const svg = document.getElementById('funil-svg');
  if (!svg) return;
  Array.from(svg.querySelectorAll('.funil-conexao, .funil-conexao-hit')).forEach(n => n.remove());
  estadoEditor.conexoes.forEach(conexao => {
    const origem = estadoEditor.etapas.find(e => e.id === conexao.etapa_origem_id);
    const destino = estadoEditor.etapas.find(e => e.id === conexao.etapa_destino_id);
    if (!origem || !destino) return;
    desenharConexao(svg, conexao, origem, destino);
  });
  ajustarTamanhoSvg();
}

/* ----- Delete ----- */
async function removerEtapa(etapaId) {
  if (!confirm('Remover essa etapa? Conexões dela também serão removidas.')) return;
  try {
    await deletarEtapa(etapaId);
    estadoEditor.etapas = estadoEditor.etapas.filter(e => e.id !== etapaId);
    estadoEditor.conexoes = estadoEditor.conexoes.filter(c => c.etapa_origem_id !== etapaId && c.etapa_destino_id !== etapaId);
    estadoEditor.selecionado = null;
    redesenharCanvas();
  } catch (err) { alert('Erro: ' + err.message); }
}

async function removerConexao(conexaoId) {
  try {
    await deletarConexao(conexaoId);
    estadoEditor.conexoes = estadoEditor.conexoes.filter(c => c.id !== conexaoId);
    estadoEditor.selecionado = null;
    redesenharCanvas();
  } catch (err) { alert('Erro: ' + err.message); }
}

/* ----- Modal: agentes habilitados ----- */
function abrirModalAgentes() {
  const overlay = el('div', { class: 'funis-modal-overlay' });
  const modal = el('div', { class: 'funis-modal funis-modal-grande' }, [
    el('h2', {}, 'Quem lê esse funil?'),
    el('p', { class: 'funis-modal-lede' }, 'Marque os agentes Pinguim que devem consultar esse funil quando precisarem entender a estratégia comercial. Funis específicos por agente é diferencial — SDR e Co-piloto podem ter visões diferentes da mesma campanha.'),
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
                alert('Erro: ' + err.message);
              }
            });
            return item;
          })
    ),
    el('div', { class: 'funis-modal-acoes' }, [
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => overlay.remove() }, 'Concluído'),
    ]),
  ]);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
