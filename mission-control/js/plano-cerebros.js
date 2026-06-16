/* Plano de Cérebros — V3 Kanban (2026-06-15)

   Pagina com 2 abas no topo:
   - 🧠 Cérebros — grid de 10 cérebros, ao clicar abre Kanban 3 colunas (Fontes Atuais / A Incluir / Automatizar)
   - 🔌 Integrações — inventario honesto do catalogo, cards mostram só verificavel + botao editar descricao da equipe

   Layout Kanban respeita:
   - Drag de "Atuais" -> "Automatizar" duplica (cria entry em cerebro_fontes_planejadas com status em_construcao) e abre modal de doc
   - Drag de "A Incluir" -> "Automatizar" move (muda status mapeada -> em_construcao) e abre modal de doc
   - Drag de "A Incluir" -> "Atuais" remove (so o usuario remove manual no card)
   - Botao "+" em "A Incluir": modal cadastra fonte planejada (status='mapeada')
   - Botao "+" em "Automatizar": modal cadastra direto com status='em_construcao'
   - Sem sugestoes automaticas — equipe preenche tudo na reuniao
*/

import { getSupabase } from './sb-client.js?v=20260421p';

const ENV = window.__ENV__ || {};
const SB_URL = ENV.SUPABASE_URL || '';
const ANON   = ENV.SUPABASE_ANON_KEY || '';

// ============================================================
// Helpers DOM
// ============================================================
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    if (c instanceof Node) n.appendChild(c);
    else n.appendChild(document.createTextNode(String(c)));
  });
  return n;
};

function fmtData(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return s; }
}
function corStatusCarga(s) { return { verde: '#22C55E', amarelo: '#F59E0B', vermelho: '#EF4444' }[s] || '#64748B'; }
function emojiStatusCarga(s) { return { verde: '🟢', amarelo: '🟡', vermelho: '🔴' }[s] || '⚫'; }

async function callEdge(nome, opts = {}) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Sem sessão. Faça login no Mission Control.');
  const url = `${SB_URL}/functions/v1/${nome}${opts.query || ''}`;
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': ANON,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return await r.json();
}

// ============================================================
// Estado
// ============================================================
let _snapshot = null;            // resposta da Edge snapshot (lista geral)
let _detalheCache = new Map();   // cerebro_id -> resposta detalhe
let _abaAtiva = 'cerebros';      // 'cerebros' | 'integracoes'
let _cerebroAberto = null;       // cerebro_id quando dentro do Kanban (null = grid)

// ============================================================
// Render principal
// ============================================================
export async function renderPlanoCerebros() {
  const container = document.getElementById('page-plano-cerebros');
  if (!container) return;
  container.innerHTML = '';
  injetarEstilos();

  // Header com abas
  container.append(renderHeader());

  // Carrega snapshot (1x — vale pra ambas abas)
  const loadingBox = el('div', { class: 'pc-loading' }, 'Carregando...');
  container.append(loadingBox);
  try {
    _snapshot = await callEdge('tool-plano-cerebros-snapshot');
    if (!_snapshot.ok) throw new Error(_snapshot.erro || 'snapshot falhou');
  } catch (e) {
    loadingBox.textContent = 'Erro ao carregar: ' + e.message;
    return;
  }
  loadingBox.remove();

  // Conteudo da aba ativa
  const conteudo = el('div', { id: 'pc-conteudo' });
  container.append(conteudo);
  renderAbaAtiva(conteudo);

  // Modal container (vazio, abre via clique)
  const modal = el('div', { id: 'pc-modal', class: 'pc-modal-bg pc-hidden' });
  container.append(modal);
  modal.addEventListener('click', (e) => { if (e.target.id === 'pc-modal') fecharModal(); });
}

function renderHeader() {
  const header = el('div', { class: 'pc-header' });
  header.append(el('h1', { class: 'pc-title' }, '📡 Plano de Cérebros'));
  header.append(el('p', { class: 'pc-sub' }, 'Inventário e automação das fontes que alimentam os cérebros produto.'));
  const tabs = el('div', { class: 'pc-tabs' });
  const btnCerebros = el('button', {
    class: 'pc-tab' + (_abaAtiva === 'cerebros' ? ' pc-tab-ativa' : ''),
    onclick: () => trocarAba('cerebros'),
  }, '🧠 Cérebros');
  const btnInteg = el('button', {
    class: 'pc-tab' + (_abaAtiva === 'integracoes' ? ' pc-tab-ativa' : ''),
    onclick: () => trocarAba('integracoes'),
  }, '🔌 Integrações');
  tabs.append(btnCerebros, btnInteg);
  header.append(tabs);
  return header;
}

function trocarAba(novaAba) {
  if (_abaAtiva === novaAba) return;
  _abaAtiva = novaAba;
  _cerebroAberto = null;
  // Atualiza visual do tab
  document.querySelectorAll('.pc-tab').forEach(t => t.classList.remove('pc-tab-ativa'));
  document.querySelectorAll('.pc-tab').forEach(t => {
    if (t.textContent.trim().includes(novaAba === 'cerebros' ? 'Cérebros' : 'Integrações')) t.classList.add('pc-tab-ativa');
  });
  const conteudo = document.getElementById('pc-conteudo');
  conteudo.innerHTML = '';
  renderAbaAtiva(conteudo);
}

function renderAbaAtiva(conteudo) {
  if (_abaAtiva === 'cerebros') {
    if (_cerebroAberto) {
      renderKanbanCerebro(conteudo, _cerebroAberto);
    } else {
      conteudo.append(renderResumo(_snapshot.resumo));
      conteudo.append(renderGridCerebros(_snapshot.cerebros));
    }
  } else {
    conteudo.append(renderAbaIntegracoes(_snapshot.integracoes_catalogo));
  }
}

// ============================================================
// ABA 1 — Cérebros
// ============================================================
function renderResumo(r) {
  return el('div', { class: 'pc-resumo' }, [
    el('div', { class: 'pc-card-num' }, [
      el('div', { class: 'pc-num-label' }, 'Cérebros Produto'),
      el('div', { class: 'pc-num-val' }, String(r.total_cerebros)),
      el('div', { class: 'pc-num-sub' }, [
        el('span', { style: 'color:#22C55E' }, `🟢 ${r.verde}`), ' · ',
        el('span', { style: 'color:#F59E0B' }, `🟡 ${r.amarelo}`), ' · ',
        el('span', { style: 'color:#EF4444' }, `🔴 ${r.vermelho}`),
      ]),
    ]),
    el('div', { class: 'pc-card-num' }, [
      el('div', { class: 'pc-num-label' }, 'Fontes mapeadas pra automação'),
      el('div', { class: 'pc-num-val' }, String(r.fontes_planejadas_total)),
      el('div', { class: 'pc-num-sub' }, `${r.fontes_planejadas_rodando} rodando · ${r.fontes_planejadas_pendentes} pendentes`),
    ]),
    el('div', { class: 'pc-card-num' }, [
      el('div', { class: 'pc-num-label' }, 'Estado geral'),
      el('div', { class: 'pc-num-val', style: 'font-size:1.4rem' },
        r.fontes_planejadas_rodando === 0 ? '100% manual' : `${Math.round(r.fontes_planejadas_rodando / Math.max(r.fontes_planejadas_total, 1) * 100)}% automatizado`),
      el('div', { class: 'pc-num-sub' }, 'Clique em um cérebro pra abrir o Kanban'),
    ]),
  ]);
}

function renderGridCerebros(cerebros) {
  const box = el('div', { class: 'pc-grid-section' }, [
    el('h2', { class: 'pc-section-title' }, '10 Cérebros Produto'),
  ]);
  const grid = el('div', { class: 'pc-grid' });
  for (const c of (cerebros || [])) grid.append(cardCerebro(c));
  box.append(grid);
  return box;
}

function cardCerebro(c) {
  const atuais = Number(c.total_fontes || 0);
  const aIncluir = Number(c.fontes_planejadas_mapeadas || 0);
  const automatizar = Number(c.fontes_planejadas_rodando || 0);
  return el('div', {
    class: 'pc-card',
    'data-cerebro-id': c.cerebro_id || '',
    onclick: () => abrirCerebro(c.cerebro_id),
  }, [
    el('div', { class: 'pc-card-head' }, [
      el('div', { class: 'pc-emoji' }, c.produto_emoji || '🧠'),
      el('div', { class: 'pc-card-titulo' }, c.produto_nome || c.produto_slug),
    ]),
    el('div', { class: 'pc-card-status', style: `color:${corStatusCarga(c.status_carga)}` },
      `${emojiStatusCarga(c.status_carga)} ${c.dias_sem_atualizar || 0} dias sem atualizar`),
    el('div', { class: 'pc-card-kanban-mini' }, [
      el('span', { class: 'pc-mini-pill', title: 'Fontes atuais' }, [
        el('span', { class: 'pc-mini-icon' }, '📚'),
        el('span', null, String(atuais)),
      ]),
      el('span', { class: 'pc-mini-pill', title: 'A incluir' }, [
        el('span', { class: 'pc-mini-icon' }, '➕'),
        el('span', null, String(aIncluir)),
      ]),
      el('span', { class: 'pc-mini-pill', title: 'Automatizar' }, [
        el('span', { class: 'pc-mini-icon' }, '⚙️'),
        el('span', null, String(automatizar)),
      ]),
    ]),
    el('div', { class: 'pc-card-row' }, [
      el('span', null, c.persona_versao ? '✅ ' : '⚠️ '),
      el('span', null, c.persona_versao ? `Persona v${c.persona_versao}` : 'Sem persona'),
    ]),
    el('div', { class: 'pc-card-cta' }, 'Abrir Kanban →'),
  ]);
}

// ============================================================
// KANBAN 3 colunas
// ============================================================
async function abrirCerebro(cerebro_id) {
  _cerebroAberto = cerebro_id;
  const conteudo = document.getElementById('pc-conteudo');
  conteudo.innerHTML = '';
  await renderKanbanCerebro(conteudo, cerebro_id);
}

async function renderKanbanCerebro(conteudo, cerebro_id) {
  // Header do cerebro com botao voltar
  const headerWrap = el('div', { class: 'pc-kanban-header' });
  conteudo.append(headerWrap);

  // Loader
  const loader = el('div', { class: 'pc-loading' }, 'Carregando Kanban...');
  conteudo.append(loader);

  // Carrega detalhe
  let detalhe;
  try {
    if (_detalheCache.has(cerebro_id)) {
      detalhe = _detalheCache.get(cerebro_id);
    } else {
      detalhe = await callEdge('tool-plano-cerebros-snapshot', { query: `?cerebro_id=${cerebro_id}` });
      if (!detalhe.ok) throw new Error(detalhe.erro);
      _detalheCache.set(cerebro_id, detalhe);
    }
  } catch (e) {
    loader.textContent = 'Erro: ' + e.message;
    return;
  }
  loader.remove();

  const c = detalhe.cerebro;

  // Header
  headerWrap.append(
    el('button', { class: 'pc-btn-voltar', onclick: () => voltarParaGrid() }, '← Voltar pros 10 cérebros'),
    el('div', { class: 'pc-kanban-titulo' }, [
      el('span', { class: 'pc-emoji', style: 'font-size:2.5rem' }, c.produto_emoji || '🧠'),
      el('div', null, [
        el('h2', { style: 'margin:0;color:white' }, c.produto_nome),
        el('div', { class: 'pc-mini', style: 'color:#94A3B8' }, `${c.total_fontes || 0} fontes atuais · ${c.total_chunks || 0} chunks · Persona v${c.persona_versao || '—'}`),
      ]),
    ]),
  );

  // Kanban
  const kanban = el('div', { class: 'pc-kanban' });
  conteudo.append(kanban);

  kanban.append(colunaKanban({
    id: 'atuais',
    titulo: '📚 Fontes Atuais',
    sub: 'Já alimentam o cérebro (chunks vetorizados)',
    cor: '#3B82F6',
    fontes: detalhe.kanban?.atuais || [],
    tipo: 'atual',
    cerebro_id,
    integracoes: detalhe.integracoes_catalogo,
  }));
  kanban.append(colunaKanban({
    id: 'a_incluir',
    titulo: '➕ A Incluir',
    sub: 'Equipe decidiu incluir — ainda não tem',
    cor: '#F59E0B',
    fontes: detalhe.kanban?.a_incluir || [],
    tipo: 'a_incluir',
    cerebro_id,
    integracoes: detalhe.integracoes_catalogo,
    permiteAdd: true,
  }));
  kanban.append(colunaKanban({
    id: 'automatizar',
    titulo: '⚙️ Automatizar',
    sub: 'Em construção, rodando ou pausado',
    cor: '#22C55E',
    fontes: detalhe.kanban?.automatizar || [],
    tipo: 'automatizar',
    cerebro_id,
    integracoes: detalhe.integracoes_catalogo,
    permiteAdd: true,
  }));
}

function voltarParaGrid() {
  _cerebroAberto = null;
  const conteudo = document.getElementById('pc-conteudo');
  conteudo.innerHTML = '';
  renderAbaAtiva(conteudo);
}

function colunaKanban({ id, titulo, sub, cor, fontes, tipo, cerebro_id, integracoes, permiteAdd = false }) {
  const col = el('div', {
    class: 'pc-col',
    'data-coluna': id,
    'data-cerebro': cerebro_id,
  });
  col.style.borderTopColor = cor;

  // Header
  const head = el('div', { class: 'pc-col-head' });
  head.append(
    el('div', null, [
      el('div', { class: 'pc-col-titulo', style: `color:${cor}` }, titulo),
      el('div', { class: 'pc-col-sub' }, sub),
    ]),
    el('div', { class: 'pc-col-count' }, String(fontes.length)),
  );
  if (permiteAdd) {
    head.append(el('button', {
      class: 'pc-btn-add-col',
      title: 'Adicionar fonte nesta coluna',
      onclick: (e) => { e.stopPropagation(); abrirModalNovaFonte(cerebro_id, tipo, integracoes); },
    }, '+'));
  }
  col.append(head);

  // Lista
  const lista = el('div', { class: 'pc-col-lista' });
  if (fontes.length === 0) {
    lista.append(el('div', { class: 'pc-col-empty' }, tipo === 'atual'
      ? 'Nenhuma fonte cadastrada ainda neste cérebro.'
      : tipo === 'a_incluir'
        ? 'Nenhuma fonte planejada. Use + pra cadastrar o que a equipe decidir.'
        : 'Nenhuma automação. Arraste de "A Incluir" ou clique + pra criar direto.'));
  } else {
    for (const f of fontes) lista.append(cardFonte(f, tipo, cerebro_id, integracoes));
  }
  col.append(lista);

  // Drag-and-drop targets: 'a_incluir' e 'automatizar' aceitam drop
  if (tipo !== 'atual') {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('pc-col-dragover'); });
    col.addEventListener('dragleave', () => col.classList.remove('pc-col-dragover'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('pc-col-dragover');
      const payload = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
      await processarDrop(payload, tipo, cerebro_id, integracoes);
    });
  }

  return col;
}

function cardFonte(f, tipoColuna, cerebro_id, integracoes) {
  const integ = (integracoes || []).find(i => i.slug === f.integracao_slug);
  const card = el('div', {
    class: 'pc-fcard pc-fcard-' + tipoColuna,
    draggable: 'true',
  });

  // Drag start
  card.addEventListener('dragstart', (e) => {
    card.classList.add('pc-fcard-dragging');
    e.dataTransfer.setData('application/json', JSON.stringify({
      tipo_origem: tipoColuna,
      fonte_id: f.id,
      titulo: f.titulo || f.tipo || '(sem titulo)',
      integracao_slug: f.integracao_slug || null,
      cerebro_id,
    }));
    e.dataTransfer.effectAllowed = tipoColuna === 'atual' ? 'copy' : 'move';
  });
  card.addEventListener('dragend', () => card.classList.remove('pc-fcard-dragging'));

  // Conteudo do card varia por tipo
  if (tipoColuna === 'atual') {
    card.append(
      el('div', { class: 'pc-fcard-head' }, [
        el('span', { class: 'pc-tag-tipo' }, f.tipo || 'fonte'),
        f.ingest_status ? el('span', { class: 'pc-tag-status' }, f.ingest_status) : null,
      ]),
      el('div', { class: 'pc-fcard-titulo' }, f.titulo || '(sem título)'),
      el('div', { class: 'pc-fcard-meta' }, `${f.origem || '—'} · ${fmtData(f.criado_em)}`),
      el('div', { class: 'pc-fcard-hint' }, '↕ arraste pra Automatizar (duplica)'),
    );
  } else if (tipoColuna === 'a_incluir') {
    card.append(
      el('div', { class: 'pc-fcard-head' }, [
        integ ? el('span', { class: 'pc-tag-integ' }, `${integ.emoji || ''} ${integ.nome}`) : el('span', { class: 'pc-tag-integ pc-tag-livre' }, '🆓 Livre'),
      ]),
      el('div', { class: 'pc-fcard-titulo' }, f.titulo),
      f.descricao ? el('div', { class: 'pc-fcard-desc' }, f.descricao) : null,
      el('div', { class: 'pc-fcard-acoes' }, [
        el('button', { class: 'pc-btn-mini', onclick: (e) => { e.stopPropagation(); abrirModalEditarFonte(f, cerebro_id, integracoes); } }, '✏️ Editar'),
        el('button', { class: 'pc-btn-mini pc-btn-danger', onclick: (e) => { e.stopPropagation(); removerFonte(f.id, cerebro_id); } }, '🗑'),
      ]),
      el('div', { class: 'pc-fcard-hint' }, '↕ arraste pra Automatizar'),
    );
  } else {
    // automatizar
    const doc = f.documentacao_automacao || {};
    const corStatus = {
      em_construcao: '#F59E0B',
      rodando: '#22C55E',
      pausada: '#94A3B8',
    }[f.status] || '#94A3B8';
    card.append(
      el('div', { class: 'pc-fcard-head' }, [
        el('span', { class: 'pc-tag-status-auto', style: `background:${corStatus}` }, f.status),
        integ ? el('span', { class: 'pc-tag-integ' }, `${integ.emoji || ''} ${integ.nome}`) : null,
      ]),
      el('div', { class: 'pc-fcard-titulo' }, f.titulo),
      f.descricao ? el('div', { class: 'pc-fcard-desc' }, f.descricao) : null,
      doc.ferramenta ? el('div', { class: 'pc-fcard-doc' }, `🛠 ${doc.ferramenta}`) : null,
      doc.horario || doc.cron_descricao ? el('div', { class: 'pc-fcard-doc' }, `⏰ ${doc.horario || doc.cron_descricao}`) : null,
      doc.ultima_execucao ? el('div', { class: 'pc-fcard-doc' }, `▶️ ${doc.ultima_execucao}`) : null,
      el('div', { class: 'pc-fcard-acoes' }, [
        el('button', { class: 'pc-btn-mini', onclick: (e) => { e.stopPropagation(); abrirModalEditarFonte(f, cerebro_id, integracoes); } }, '📝 Doc'),
        f.status !== 'rodando' ? el('button', { class: 'pc-btn-mini pc-btn-ok', onclick: (e) => { e.stopPropagation(); mudarStatusFonte(f.id, 'rodando', cerebro_id); } }, '✅ Rodando') : null,
        f.status !== 'pausada' ? el('button', { class: 'pc-btn-mini', onclick: (e) => { e.stopPropagation(); mudarStatusFonte(f.id, 'pausada', cerebro_id); } }, '⏸ Pausar') : null,
        el('button', { class: 'pc-btn-mini pc-btn-danger', onclick: (e) => { e.stopPropagation(); removerFonte(f.id, cerebro_id); } }, '🗑'),
      ]),
    );
  }

  return card;
}

async function processarDrop(payload, tipoDestino, cerebro_id, integracoes) {
  const { tipo_origem, fonte_id, titulo } = payload;
  if (tipo_origem === tipoDestino) return; // soltou na mesma coluna, ignora

  // Atual -> A Incluir ou Automatizar = duplicar
  if (tipo_origem === 'atual') {
    const statusInicial = tipoDestino === 'automatizar' ? 'em_construcao' : 'mapeada';
    if (tipoDestino === 'automatizar') {
      // Abre modal pra preencher doc da automacao + duplicar
      abrirModalDuplicarParaAutomatizar(cerebro_id, fonte_id, titulo, integracoes);
    } else {
      // A Incluir = duplicar com status mapeada, sem modal
      await duplicarFonteAtual(cerebro_id, fonte_id, statusInicial, null, null);
    }
    return;
  }

  // A Incluir -> Automatizar = mover (muda status + abre modal de doc)
  if (tipo_origem === 'a_incluir' && tipoDestino === 'automatizar') {
    abrirModalMoverParaAutomatizar(cerebro_id, fonte_id, titulo);
    return;
  }

  // Automatizar -> A Incluir = voltar pra mapeada (despromove)
  if (tipo_origem === 'automatizar' && tipoDestino === 'a_incluir') {
    if (!confirm(`Voltar "${titulo}" pra "A Incluir" (perde a documentação da automação)?`)) return;
    await mudarStatusFonte(fonte_id, 'mapeada', cerebro_id);
    return;
  }
}

// ============================================================
// MODAIS
// ============================================================
function abrirModal(inner) {
  const modal = document.getElementById('pc-modal');
  modal.innerHTML = '';
  modal.classList.remove('pc-hidden');
  modal.append(inner);
}
function fecharModal() {
  const modal = document.getElementById('pc-modal');
  if (modal) { modal.classList.add('pc-hidden'); modal.innerHTML = ''; }
}

function modalBox(titulo, conteudoFn, larguraMax = '560px') {
  const inner = el('div', { class: 'pc-modal-inner', style: `max-width:${larguraMax}` });
  inner.append(el('div', { class: 'pc-modal-head' }, [
    el('h2', null, titulo),
    el('button', { class: 'pc-close', onclick: fecharModal }, '×'),
  ]));
  const body = el('div', { class: 'pc-modal-body' });
  inner.append(body);
  conteudoFn(body, inner);
  return inner;
}

function abrirModalNovaFonte(cerebro_id, tipoColuna, integracoes) {
  // tipoColuna = 'a_incluir' ou 'automatizar'
  const titulo = tipoColuna === 'automatizar' ? '+ Nova automação' : '+ Nova fonte planejada';
  abrirModal(modalBox(titulo, (body) => {
    body.append(
      campo('Título', 'titulo', 'Ex: Grupo WhatsApp Alunos Elo', true),
      campoSelect('Integração / Origem', 'integracao_slug', integracoes),
      campo('Descrição (o que essa fonte traz)', 'descricao', 'Ex: dúvidas frequentes dos alunos toda semana', false, true),
    );
    if (tipoColuna === 'automatizar') {
      body.append(
        el('h3', { class: 'pc-form-sec' }, '⚙️ Documentação da automação'),
        campo('Ferramenta', 'doc_ferramenta', 'Ex: Edge tool-ler-whatsapp + cron diário'),
        campo('Horário / frequência', 'doc_horario', 'Ex: todo dia 3h BRT'),
        campo('Notas', 'doc_notas', 'Detalhes da rotina, riscos, contato responsável', false, true),
      );
    }
    body.append(el('div', { class: 'pc-form-acoes' }, [
      el('button', { class: 'pc-btn-cancel', onclick: fecharModal }, 'Cancelar'),
      el('button', { class: 'pc-btn-primary', onclick: () => salvarNovaFonte(cerebro_id, tipoColuna) }, 'Cadastrar'),
    ]));
  }));
}

function abrirModalDuplicarParaAutomatizar(cerebro_id, fonte_atual_id, titulo, integracoes) {
  abrirModal(modalBox('⚙️ Automatizar "' + titulo + '"', (body) => {
    body.append(
      el('p', { class: 'pc-form-info' }, 'Vai criar uma cópia dessa fonte na coluna Automatizar (a original em Fontes Atuais continua intacta). Preencha como vai rodar.'),
      campoSelect('Integração / Ferramenta', 'integracao_slug', integracoes),
      campo('Como vai automatizar', 'descricao', 'Ex: rodar Apify mensal e ingestar via tool-ingest-cerebro', false, true),
      el('h3', { class: 'pc-form-sec' }, '⚙️ Documentação'),
      campo('Ferramenta', 'doc_ferramenta', 'Ex: Edge tool-baixar-reel + Apify'),
      campo('Horário / frequência', 'doc_horario', 'Ex: 1ª segunda do mês 4h BRT'),
      campo('Notas', 'doc_notas', 'Riscos, dependências, contato responsável', false, true),
    );
    body.append(el('div', { class: 'pc-form-acoes' }, [
      el('button', { class: 'pc-btn-cancel', onclick: fecharModal }, 'Cancelar'),
      el('button', { class: 'pc-btn-primary', onclick: () => salvarDuplicacao(cerebro_id, fonte_atual_id) }, 'Criar automação'),
    ]));
  }));
}

function abrirModalMoverParaAutomatizar(cerebro_id, fonte_id, titulo) {
  abrirModal(modalBox('⚙️ Mover "' + titulo + '" pra Automatizar', (body) => {
    body.append(
      el('p', { class: 'pc-form-info' }, 'A fonte sai de "A Incluir" e entra em "Automatizar". Preencha como vai rodar.'),
      el('h3', { class: 'pc-form-sec' }, '⚙️ Documentação'),
      campo('Ferramenta', 'doc_ferramenta', 'Ex: Edge tool-ler-discord + cron'),
      campo('Horário / frequência', 'doc_horario', 'Ex: todo dia 5h BRT'),
      campo('Notas', 'doc_notas', 'Riscos, contato responsável', false, true),
    );
    body.append(el('div', { class: 'pc-form-acoes' }, [
      el('button', { class: 'pc-btn-cancel', onclick: fecharModal }, 'Cancelar'),
      el('button', { class: 'pc-btn-primary', onclick: () => salvarMoverParaAutomatizar(cerebro_id, fonte_id) }, 'Mover'),
    ]));
  }));
}

function abrirModalEditarFonte(fonte, cerebro_id, integracoes) {
  const doc = fonte.documentacao_automacao || {};
  abrirModal(modalBox('✏️ Editar "' + (fonte.titulo || '(sem título)') + '"', (body) => {
    body.append(
      campo('Título', 'titulo', '', true, false, fonte.titulo),
      campoSelect('Integração', 'integracao_slug', integracoes, fonte.integracao_slug),
      campo('Descrição', 'descricao', '', false, true, fonte.descricao),
    );
    if (['em_construcao', 'rodando', 'pausada'].includes(fonte.status)) {
      body.append(
        el('h3', { class: 'pc-form-sec' }, '⚙️ Documentação da automação'),
        campo('Ferramenta', 'doc_ferramenta', '', false, false, doc.ferramenta),
        campo('Horário / frequência', 'doc_horario', '', false, false, doc.horario),
        campo('Última execução', 'doc_ultima_execucao', 'Ex: 2026-06-14 03:02 OK', false, false, doc.ultima_execucao),
        campo('Notas', 'doc_notas', '', false, true, doc.notas),
      );
    }
    body.append(el('div', { class: 'pc-form-acoes' }, [
      el('button', { class: 'pc-btn-cancel', onclick: fecharModal }, 'Cancelar'),
      el('button', { class: 'pc-btn-primary', onclick: () => salvarEdicaoFonte(fonte.id, cerebro_id) }, 'Salvar'),
    ]));
  }));
}

function campo(label, id, placeholder = '', obrigatorio = false, textarea = false, valor = '') {
  const wrap = el('div', { class: 'pc-form-campo' });
  wrap.append(el('label', null, label + (obrigatorio ? ' *' : '')));
  if (textarea) {
    wrap.append(el('textarea', { id: 'pc-fld-' + id, class: 'pc-input', placeholder, rows: 3 }, valor || ''));
  } else {
    const i = el('input', { id: 'pc-fld-' + id, type: 'text', class: 'pc-input', placeholder });
    if (valor) i.value = valor;
    wrap.append(i);
  }
  return wrap;
}

function campoSelect(label, id, integracoes, valorAtual = '') {
  const wrap = el('div', { class: 'pc-form-campo' });
  wrap.append(el('label', null, label));
  const sel = el('select', { id: 'pc-fld-' + id, class: 'pc-input' });
  sel.append(el('option', { value: '' }, '— escolher (opcional) —'));
  for (const i of (integracoes || [])) {
    const opt = el('option', { value: i.slug }, `${i.emoji || ''} ${i.nome}`);
    if (i.slug === valorAtual) opt.selected = true;
    sel.append(opt);
  }
  wrap.append(sel);
  return wrap;
}

function lerCampo(id) {
  const e = document.getElementById('pc-fld-' + id);
  return e ? e.value.trim() : '';
}

function lerDoc() {
  const ferramenta = lerCampo('doc_ferramenta');
  const horario = lerCampo('doc_horario');
  const ultima_execucao = lerCampo('doc_ultima_execucao');
  const notas = lerCampo('doc_notas');
  const doc = {};
  if (ferramenta) doc.ferramenta = ferramenta;
  if (horario) doc.horario = horario;
  if (ultima_execucao) doc.ultima_execucao = ultima_execucao;
  if (notas) doc.notas = notas;
  return Object.keys(doc).length > 0 ? doc : null;
}

// ============================================================
// AÇÕES
// ============================================================
async function salvarNovaFonte(cerebro_id, tipoColuna) {
  const titulo = lerCampo('titulo');
  if (!titulo) { alert('Título é obrigatório'); return; }
  const integracao_slug = lerCampo('integracao_slug') || null;
  const descricao = lerCampo('descricao') || null;
  const doc = tipoColuna === 'automatizar' ? lerDoc() : null;
  const status = tipoColuna === 'automatizar' ? 'em_construcao' : 'mapeada';
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: {
        acao: 'criar',
        cerebro_id,
        titulo,
        integracao_slug,
        descricao,
        status,
        documentacao_automacao: doc,
        tipo_fonte: 'mapeada',
      },
    });
    if (!r.ok) throw new Error(r.erro);
    fecharModal();
    await recarregarCerebro(cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function duplicarFonteAtual(cerebro_id, fonte_atual_id, status_inicial, integracao_slug, doc) {
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: {
        acao: 'duplicar_de_atual',
        cerebro_id,
        fonte_atual_id,
        status_inicial,
        integracao_slug,
        documentacao_automacao: doc,
      },
    });
    if (!r.ok) throw new Error(r.erro);
    await recarregarCerebro(cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function salvarDuplicacao(cerebro_id, fonte_atual_id) {
  const integracao_slug = lerCampo('integracao_slug') || null;
  const descricao = lerCampo('descricao') || null;
  const doc = lerDoc();
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: {
        acao: 'duplicar_de_atual',
        cerebro_id,
        fonte_atual_id,
        status_inicial: 'em_construcao',
        integracao_slug,
        descricao,
        documentacao_automacao: doc,
      },
    });
    if (!r.ok) throw new Error(r.erro);
    fecharModal();
    await recarregarCerebro(cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function salvarMoverParaAutomatizar(cerebro_id, fonte_id) {
  const doc = lerDoc();
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: {
        acao: 'editar',
        id: fonte_id,
        status: 'em_construcao',
        documentacao_automacao: doc,
      },
    });
    if (!r.ok) throw new Error(r.erro);
    fecharModal();
    await recarregarCerebro(cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function salvarEdicaoFonte(fonte_id, cerebro_id) {
  const titulo = lerCampo('titulo');
  if (!titulo) { alert('Título é obrigatório'); return; }
  const integracao_slug = lerCampo('integracao_slug') || null;
  const descricao = lerCampo('descricao') || null;
  const doc = lerDoc();
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: {
        acao: 'editar',
        id: fonte_id,
        titulo,
        descricao,
        integracao_slug,
        documentacao_automacao: doc,
      },
    });
    if (!r.ok) throw new Error(r.erro);
    fecharModal();
    await recarregarCerebro(cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function mudarStatusFonte(id, status, cerebro_id) {
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: { acao: 'atualizar_status', id, status },
    });
    if (!r.ok) throw new Error(r.erro);
    await recarregarCerebro(cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function removerFonte(id, cerebro_id) {
  if (!confirm('Remover essa fonte?')) return;
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: { acao: 'remover', id },
    });
    if (!r.ok) throw new Error(r.erro);
    await recarregarCerebro(cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function recarregarCerebro(cerebro_id) {
  _detalheCache.delete(cerebro_id);
  // Tambem atualiza snapshot pra contagens do grid ficarem certas
  try {
    _snapshot = await callEdge('tool-plano-cerebros-snapshot');
  } catch {}
  const conteudo = document.getElementById('pc-conteudo');
  conteudo.innerHTML = '';
  await renderKanbanCerebro(conteudo, cerebro_id);
}

// ============================================================
// ABA 2 — Integrações
// ============================================================
function renderAbaIntegracoes(integracoes) {
  const wrap = el('div', { class: 'pc-int-wrap' });
  wrap.append(el('h2', { class: 'pc-section-title' }, `🔌 Mapa de Integrações (${(integracoes || []).length})`));
  wrap.append(el('p', { class: 'pc-int-sub' },
    'Inventário das integrações disponíveis no sistema. Status mostra apenas o verificável (cofre tem chaves? sim/não). A descrição da equipe começa vazia — preencha na reunião pra registrar o que cada integração realmente entrega no contexto da Pinguim.'));

  // Agrupa por categoria
  const porCategoria = {};
  for (const i of (integracoes || [])) {
    const cat = i.categoria || 'outros';
    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(i);
  }
  const ordemCat = ['vendas', 'analytics', 'mensageria', 'redes-sociais', 'crm', 'docs', 'pesquisa', 'outros'];
  for (const cat of ordemCat) {
    if (!porCategoria[cat]) continue;
    wrap.append(el('h3', { class: 'pc-int-cat' }, cat));
    const grid = el('div', { class: 'pc-int-grid' });
    for (const i of porCategoria[cat]) grid.append(cardIntegracao(i));
    wrap.append(grid);
    delete porCategoria[cat];
  }
  // Resto (categorias não previstas)
  for (const cat in porCategoria) {
    wrap.append(el('h3', { class: 'pc-int-cat' }, cat));
    const grid = el('div', { class: 'pc-int-grid' });
    for (const i of porCategoria[cat]) grid.append(cardIntegracao(i));
    wrap.append(grid);
  }
  return wrap;
}

function cardIntegracao(i) {
  const chaves = (i.cofre_chaves || []);
  return el('div', { class: 'pc-int-card' }, [
    el('div', { class: 'pc-int-card-head' }, [
      el('span', { class: 'pc-emoji', style: 'font-size:1.7rem' }, i.emoji || '🔌'),
      el('div', null, [
        el('div', { class: 'pc-int-nome' }, i.nome),
        el('div', { class: 'pc-int-slug' }, i.slug),
      ]),
      el('div', { class: 'pc-int-status' }, [
        i.cofre_ok
          ? el('span', { class: 'pc-int-ok', title: 'Cofre tem todas as chaves: ' + chaves.join(', ') }, '✅ pronta')
          : el('span', { class: 'pc-int-ko', title: chaves.length === 0 ? 'Não precisa de chave' : 'Faltam chaves: ' + chaves.join(', ') }, '⚠ a configurar'),
      ]),
    ]),
    el('div', { class: 'pc-int-tecnica' }, i.descricao || ''),
    el('div', { class: 'pc-int-equipe-label' }, '📝 Descrição da equipe (preencher na reunião):'),
    el('div', { class: 'pc-int-equipe' }, [
      el('textarea', {
        id: 'pc-int-desc-' + i.slug,
        class: 'pc-input',
        rows: 2,
        placeholder: 'Pra que serve no nosso contexto? (preencha na reunião)',
      }, i.descricao_equipe || ''),
      el('button', {
        class: 'pc-btn-mini pc-btn-ok',
        onclick: () => salvarDescricaoEquipe(i.slug),
      }, '💾 Salvar'),
    ]),
    chaves.length > 0 ? el('div', { class: 'pc-int-chaves' }, `🔑 ${chaves.join(', ')}`) : null,
  ]);
}

async function salvarDescricaoEquipe(slug) {
  const txt = document.getElementById('pc-int-desc-' + slug).value.trim();
  try {
    const r = await callEdge('tool-integracao-editar', {
      method: 'POST',
      body: { slug, descricao_equipe: txt },
    });
    if (!r.ok) throw new Error(r.erro);
    // feedback visual
    const btn = document.querySelector(`#pc-int-desc-${slug} ~ button`);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ salvo';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
    // Atualiza snapshot em memoria
    const integ = (_snapshot.integracoes_catalogo || []).find(x => x.slug === slug);
    if (integ) integ.descricao_equipe = txt;
  } catch (e) { alert('Erro: ' + e.message); }
}

// ============================================================
// Estilos
// ============================================================
function injetarEstilos() {
  if (document.getElementById('pc-style')) return;
  const css = `
    #page-plano-cerebros { padding: 24px; max-width: 1500px; margin: 0 auto; color: #E2E8F0; font-family: system-ui, sans-serif; }
    .pc-header { margin-bottom: 24px; }
    .pc-title { font-size: 2rem; margin: 0 0 8px 0; }
    .pc-sub { color: #94A3B8; margin: 0 0 16px 0; }
    .pc-loading { padding: 24px; color: #94A3B8; }

    .pc-tabs { display: flex; gap: 8px; border-bottom: 1px solid #334155; }
    .pc-tab { background: transparent; color: #94A3B8; border: none; padding: 12px 20px; font-size: 0.95rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
    .pc-tab:hover { color: #E2E8F0; }
    .pc-tab-ativa { color: #3B82F6; border-bottom-color: #3B82F6; }

    .pc-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 24px 0 32px; }
    .pc-card-num { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .pc-num-label { color: #94A3B8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .pc-num-val { font-size: 2.2rem; font-weight: 700; color: white; }
    .pc-num-sub { color: #94A3B8; font-size: 0.9rem; margin-top: 4px; }

    .pc-grid-section { margin-bottom: 32px; }
    .pc-section-title { font-size: 1.3rem; margin: 24px 0 16px 0; color: white; }

    .pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .pc-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 16px; transition: transform 0.15s, border-color 0.15s; cursor: pointer; }
    .pc-card:hover { transform: translateY(-2px); border-color: #475569; }
    .pc-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .pc-emoji { font-size: 1.5rem; }
    .pc-card-titulo { font-weight: 600; color: white; }
    .pc-card-status { font-size: 0.85rem; font-weight: 600; margin-bottom: 12px; }
    .pc-card-kanban-mini { display: flex; gap: 8px; margin-bottom: 10px; }
    .pc-mini-pill { display: flex; align-items: center; gap: 4px; background: #0F172A; border-radius: 6px; padding: 4px 8px; font-size: 0.85rem; color: #CBD5E1; }
    .pc-mini-icon { font-size: 0.95rem; }
    .pc-card-row { font-size: 0.85rem; color: #94A3B8; margin-bottom: 4px; }
    .pc-card-row strong { color: #CBD5E1; }
    .pc-card-cta { margin-top: 12px; color: #3B82F6; font-size: 0.85rem; font-weight: 600; }

    /* Kanban */
    .pc-kanban-header { margin: 16px 0 24px; }
    .pc-btn-voltar { background: transparent; color: #94A3B8; border: 1px solid #334155; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; margin-bottom: 16px; }
    .pc-btn-voltar:hover { color: white; border-color: #475569; }
    .pc-kanban-titulo { display: flex; align-items: center; gap: 14px; }

    .pc-kanban { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; min-height: 600px; }
    @media (max-width: 1100px) { .pc-kanban { grid-template-columns: 1fr; } }
    .pc-col { background: #0F172A; border: 1px solid #334155; border-radius: 12px; border-top: 4px solid #334155; padding: 16px; display: flex; flex-direction: column; transition: background 0.15s; }
    .pc-col-dragover { background: #1E293B; border-color: #3B82F6; }
    .pc-col-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px; }
    .pc-col-titulo { font-size: 1.05rem; font-weight: 700; }
    .pc-col-sub { font-size: 0.75rem; color: #64748B; margin-top: 2px; }
    .pc-col-count { background: #1E293B; color: #CBD5E1; padding: 2px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; }
    .pc-btn-add-col { background: #1E293B; color: #CBD5E1; border: 1px dashed #475569; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 1.1rem; line-height: 1; }
    .pc-btn-add-col:hover { background: #334155; color: white; }
    .pc-col-lista { display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .pc-col-empty { color: #475569; font-size: 0.85rem; text-align: center; padding: 24px 8px; font-style: italic; border: 1px dashed #334155; border-radius: 8px; }

    .pc-fcard { background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; cursor: grab; transition: all 0.15s; }
    .pc-fcard:hover { border-color: #475569; }
    .pc-fcard:active { cursor: grabbing; }
    .pc-fcard-dragging { opacity: 0.5; }
    .pc-fcard-head { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .pc-fcard-titulo { color: white; font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
    .pc-fcard-meta { color: #64748B; font-size: 0.75rem; margin-bottom: 4px; }
    .pc-fcard-desc { color: #94A3B8; font-size: 0.8rem; margin-bottom: 4px; }
    .pc-fcard-doc { color: #CBD5E1; font-size: 0.75rem; background: #0F172A; padding: 3px 6px; border-radius: 4px; margin-bottom: 3px; }
    .pc-fcard-hint { color: #475569; font-size: 0.7rem; font-style: italic; margin-top: 6px; }
    .pc-fcard-acoes { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
    .pc-btn-mini { background: #0F172A; color: #CBD5E1; border: 1px solid #334155; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; }
    .pc-btn-mini:hover { background: #334155; color: white; }
    .pc-btn-mini.pc-btn-ok { color: #22C55E; border-color: #16A34A; }
    .pc-btn-mini.pc-btn-danger { color: #EF4444; border-color: #991B1B; }

    .pc-tag-tipo { background: #334155; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
    .pc-tag-status { background: #0F172A; color: #94A3B8; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; }
    .pc-tag-integ { background: #0F172A; color: #CBD5E1; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; border: 1px solid #334155; }
    .pc-tag-livre { color: #64748B; font-style: italic; }
    .pc-tag-status-auto { color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }

    /* Modal */
    .pc-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: flex-start; justify-content: center; z-index: 9999; overflow-y: auto; padding: 40px 16px; }
    .pc-hidden { display: none !important; }
    .pc-modal-inner { background: #0F172A; border: 1px solid #334155; border-radius: 16px; padding: 20px; width: 100%; }
    .pc-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #334155; }
    .pc-modal-head h2 { margin: 0; color: white; font-size: 1.15rem; }
    .pc-close { background: transparent; color: #94A3B8; border: none; font-size: 1.8rem; cursor: pointer; line-height: 1; padding: 0; }
    .pc-modal-body { display: flex; flex-direction: column; gap: 12px; }
    .pc-form-info { color: #94A3B8; font-size: 0.85rem; background: #1E293B; padding: 10px; border-radius: 6px; margin: 0; }
    .pc-form-sec { color: white; font-size: 0.95rem; margin: 12px 0 6px; padding-top: 12px; border-top: 1px solid #334155; }
    .pc-form-campo { display: flex; flex-direction: column; gap: 4px; }
    .pc-form-campo label { color: #CBD5E1; font-size: 0.85rem; }
    .pc-input { background: #1E293B; border: 1px solid #334155; color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; font-family: inherit; }
    .pc-input:focus { outline: none; border-color: #3B82F6; }
    textarea.pc-input { resize: vertical; min-height: 60px; }
    .pc-form-acoes { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155; }
    .pc-btn-cancel { background: transparent; color: #94A3B8; border: 1px solid #334155; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    .pc-btn-cancel:hover { color: white; }
    .pc-btn-primary { background: #2563EB; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    .pc-btn-primary:hover { background: #1D4ED8; }

    /* Aba Integrações */
    .pc-int-wrap { padding-top: 16px; }
    .pc-int-sub { color: #94A3B8; font-size: 0.9rem; max-width: 800px; margin: 0 0 24px; }
    .pc-int-cat { color: #94A3B8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 8px; }
    .pc-int-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
    .pc-int-card { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 14px; }
    .pc-int-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .pc-int-card-head > div:nth-child(2) { flex: 1; }
    .pc-int-nome { color: white; font-weight: 600; font-size: 0.95rem; }
    .pc-int-slug { color: #64748B; font-size: 0.75rem; font-family: monospace; }
    .pc-int-status { font-size: 0.75rem; }
    .pc-int-ok { color: #22C55E; }
    .pc-int-ko { color: #F59E0B; }
    .pc-int-tecnica { color: #94A3B8; font-size: 0.8rem; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #334155; }
    .pc-int-equipe-label { color: #CBD5E1; font-size: 0.75rem; margin-bottom: 4px; }
    .pc-int-equipe { display: flex; flex-direction: column; gap: 6px; }
    .pc-int-equipe textarea { font-size: 0.85rem; }
    .pc-int-equipe button { align-self: flex-end; }
    .pc-int-chaves { color: #64748B; font-size: 0.7rem; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #334155; font-family: monospace; }
  `;
  document.head.append(el('style', { id: 'pc-style', html: css }));
}
