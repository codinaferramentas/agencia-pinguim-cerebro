/* Pinguim OS — Funis (5º pilar)
   Sessão 1: lista + criação + esqueleto de canvas vazio.
   Sessão 2 (futura): drag-and-drop, conexões com bezier, salvamento ao vivo.
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

let funilAtual = null; // funil aberto no editor

async function fetchFunis() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('vw_funis_catalogo').select('*');
  if (error) { console.error('fetchFunis', error); return []; }
  return data || [];
}

async function criarFunil(nome, descricao) {
  const sb = getSupabase();
  if (!sb) throw new Error('sem conexão com banco');
  const { data, error } = await sb.from('funis').insert({ nome, descricao, status: 'rascunho' }).select().single();
  if (error) throw error;
  return data;
}

async function deletarFunil(id) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('funis').delete().eq('id', id);
  if (error) throw error;
}

/* =====================================================================
   TELA PRINCIPAL — lista de funis ou editor (depende do estado)
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
   LISTA DE FUNIS — entrada principal
   ===================================================================== */
async function renderLista(page) {
  page.innerHTML = '<div class="funis-loading">Carregando funis…</div>';
  const funis = await fetchFunis();

  page.innerHTML = '';
  const wrap = el('div', { class: 'funis-lista' });

  // Header
  wrap.appendChild(el('div', { class: 'funis-header' }, [
    el('div', {}, [
      el('div', { class: 'funis-eyebrow' }, '5º pilar · Estratégia comercial'),
      el('h1', { class: 'funis-titulo' }, 'Funis'),
      el('p', { class: 'funis-lede' }, 'Mapeie como produtos se conectam — entrada, order bumps, upsells, downsells. Cada funil vira inteligência consultável pelos agentes Pinguim.'),
    ]),
    el('button', {
      class: 'btn btn-primary',
      onclick: abrirModalNovoFunil,
    }, '+ Novo funil'),
  ]));

  // Vazio?
  if (funis.length === 0) {
    wrap.appendChild(el('div', { class: 'funis-vazio' }, [
      el('div', { class: 'funis-vazio-icone' }, '🎯'),
      el('div', { class: 'funis-vazio-titulo' }, 'Nenhum funil ainda'),
      el('div', { class: 'funis-vazio-desc' }, 'Crie seu primeiro funil. Pode ser uma campanha, um lançamento, ou uma estratégia de venda. Você arrasta produtos pro canvas e conecta a sequência.'),
      el('button', {
        class: 'btn btn-primary',
        style: 'margin-top:1rem',
        onclick: abrirModalNovoFunil,
      }, 'Criar primeiro funil'),
    ]));
    page.appendChild(wrap);
    return;
  }

  // Grid de cards
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
   MODAL — criar novo funil
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
      el('input', { name: 'nome', type: 'text', required: 'true', autofocus: 'true', placeholder: 'Ex: Campanha Lançamento Elo Q2' }),
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
  modal.querySelector('input[name=nome]')?.focus();
}

/* =====================================================================
   EDITOR — canvas vazio (Sessão 1)
   Sessão 2: drag-and-drop, conexões bezier, persistência.
   ===================================================================== */
async function renderEditor(page, funil) {
  page.innerHTML = '';

  const editor = el('div', { class: 'funil-editor' });

  // Toolbar
  editor.appendChild(el('div', { class: 'funil-editor-toolbar' }, [
    el('button', {
      class: 'funil-voltar',
      onclick: () => { funilAtual = null; renderFunis(); },
    }, '← Funis'),
    el('div', { class: 'funil-editor-titulo' }, [
      el('span', { class: 'funil-editor-nome' }, funil.nome),
      el('span', { class: `badge badge-${funil.status}` }, funil.status === 'ativo' ? 'Ativo' : funil.status === 'arquivado' ? 'Arquivado' : 'Rascunho'),
    ]),
    el('div', { class: 'funil-editor-acoes' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => alert('Edição de propriedades — próxima sessão.') }, 'Editar'),
      el('button', { class: 'btn btn-danger', onclick: async () => {
        if (!confirm(`Deletar "${funil.nome}"? Etapas e conexões serão removidas. Não tem volta.`)) return;
        try {
          await deletarFunil(funil.id);
          funilAtual = null;
          renderFunis();
        } catch (err) {
          alert('Erro ao deletar: ' + err.message);
        }
      } }, 'Deletar'),
    ]),
  ]));

  // Canvas + sidebar (esqueleto)
  const corpo = el('div', { class: 'funil-editor-corpo' }, [
    // Sidebar de produtos disponíveis
    el('aside', { class: 'funil-sidebar' }, [
      el('div', { class: 'funil-sidebar-titulo' }, 'Produtos'),
      el('div', { class: 'funil-sidebar-lede' }, 'Próxima sessão: arraste daqui pro canvas pra adicionar etapa ao funil.'),
      el('div', { class: 'funil-sidebar-placeholder' }, 'Lista de produtos vai aparecer aqui na próxima sessão.'),
    ]),
    // Canvas
    el('div', { class: 'funil-canvas' }, [
      el('div', { class: 'funil-canvas-vazio' }, [
        el('div', { class: 'funil-canvas-vazio-icone' }, '✨'),
        el('div', { class: 'funil-canvas-vazio-titulo' }, 'Canvas pronto pra construção'),
        el('div', { class: 'funil-canvas-vazio-desc' }, 'Esta é a Sessão 1 do pilar Funis: estrutura básica, banco de dados, navegação. Na próxima sessão liberamos o drag-and-drop de produtos, as conexões com linhas bezier vivas, e a persistência em tempo real.'),
        el('div', { class: 'funil-canvas-vazio-status' }, '🚧 Construção visual em desenvolvimento'),
      ]),
    ]),
  ]);
  editor.appendChild(corpo);

  page.appendChild(editor);
}
