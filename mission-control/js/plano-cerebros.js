/* Plano de Cérebros — V2.16 Onda 3 (2026-06-15)

   Página de plano de atualização dos cérebros produto da Pinguim.
   Mostra status de carga (verde/amarelo/vermelho), fontes cadastradas,
   fontes planejadas e sugestões de fontes baseadas em integrações.

   Lê da Edge `tool-plano-cerebros-snapshot` (resumo + lista + detalhe).
   Escreve via Edge `tool-cerebro-fonte-planejada` (CRUD fontes planejadas).
*/

const ENV = window.__ENV__ || {};
const SB_URL = ENV.SUPABASE_URL || '';
const ANON   = ENV.SUPABASE_ANON_KEY || '';

// ============================================================
// Helpers
// ============================================================
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
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

function fmtData(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return s; }
}

function corStatus(s) {
  return { verde: '#22C55E', amarelo: '#F59E0B', vermelho: '#EF4444' }[s] || '#64748B';
}
function emojiStatus(s) {
  return { verde: '🟢', amarelo: '🟡', vermelho: '🔴' }[s] || '⚫';
}

async function callEdge(nome, opts = {}) {
  const url = `${SB_URL}/functions/v1/${nome}${opts.query || ''}`;
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Authorization': `Bearer ${ANON}`,
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
let _snapshot = null;        // resposta da Edge snapshot (lista geral)
let _detalheCache = new Map(); // cerebro_id -> resposta detalhe

// ============================================================
// Render principal
// ============================================================
export async function renderPlanoCerebros() {
  const container = document.getElementById('page-plano-cerebros');
  if (!container) return;
  container.innerHTML = '';

  // Header
  container.append(el('div', { class: 'pc-header' }, [
    el('h1', { class: 'pc-title' }, '📡 Plano de Cérebros'),
    el('p', { class: 'pc-sub' }, 'Inventário + automação das fontes que alimentam os cérebros produto da Pinguim.'),
  ]));

  // Carrega snapshot
  const loadingBox = el('div', { class: 'pc-loading' }, 'Carregando snapshot dos cérebros...');
  container.append(loadingBox);
  try {
    _snapshot = await callEdge('tool-plano-cerebros-snapshot');
    if (!_snapshot.ok) throw new Error(_snapshot.erro || 'snapshot falhou');
  } catch (e) {
    loadingBox.textContent = 'Erro ao carregar: ' + e.message;
    return;
  }
  loadingBox.remove();

  // Bloco 1 — Resumo
  container.append(renderResumo(_snapshot.resumo));

  // Bloco 2 — Grid de cérebros
  container.append(renderGridCerebros(_snapshot.cerebros));

  // Bloco 4 (catálogo) — vai pro fim (referência geral)
  container.append(renderCatalogoIntegracoes(_snapshot.integracoes_catalogo));

  // Modal de detalhe (vazio, abre via clique)
  const modal = el('div', { id: 'pc-modal', class: 'pc-modal-bg pc-hidden' }, []);
  container.append(modal);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'pc-modal') fecharModal();
  });

  injetarEstilos();
}

// ============================================================
// Bloco 1 — Resumo
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
        r.fontes_planejadas_rodando === 0 ? '100% manual' : `${Math.round(r.fontes_planejadas_rodando / Math.max(r.fontes_planejadas_total,1) * 100)}% automatizado`),
      el('div', { class: 'pc-num-sub' }, 'Clique em um cérebro pra ver detalhes'),
    ]),
  ]);
}

// ============================================================
// Bloco 2 — Grid de cérebros
// ============================================================
function renderGridCerebros(cerebros) {
  const box = el('div', { class: 'pc-grid-section' }, [
    el('h2', { class: 'pc-section-title' }, '10 Cérebros Produto'),
  ]);
  const grid = el('div', { class: 'pc-grid' });
  for (const c of (cerebros || [])) {
    grid.append(cardCerebro(c));
  }
  box.append(grid);
  return box;
}

function cardCerebro(c) {
  const card = el('div', { class: 'pc-card', 'data-cerebro-id': c.cerebro_id || '' }, [
    el('div', { class: 'pc-card-head' }, [
      el('div', { class: 'pc-emoji' }, c.produto_emoji || '🧠'),
      el('div', { class: 'pc-card-titulo' }, c.produto_nome || c.produto_slug),
    ]),
    el('div', { class: 'pc-card-status', style: `color:${corStatus(c.status_carga)}` }, [
      `${emojiStatus(c.status_carga)} ${c.dias_sem_atualizar || 0} dias sem atualizar`,
    ]),
    el('div', { class: 'pc-card-row' }, [
      el('span', null, '📚 '),
      el('strong', null, String(c.total_fontes || 0)),
      el('span', null, ' fontes'),
    ]),
    el('div', { class: 'pc-card-row' }, [
      el('span', null, c.persona_versao ? '✅ ' : '⚠️ '),
      el('span', null, c.persona_versao ? `Persona v${c.persona_versao}` : 'Sem persona'),
    ]),
    el('div', { class: 'pc-card-row' }, [
      el('span', null, '🛠 '),
      el('strong', null, String(c.fontes_planejadas_mapeadas || 0)),
      el('span', null, ' planejadas · '),
      el('strong', { style: 'color:#22C55E' }, String(c.fontes_planejadas_rodando || 0)),
      el('span', null, ' rodando'),
    ]),
    el('button', { class: 'pc-btn-detalhe', onclick: () => abrirDetalhe(c) }, 'Ver detalhe →'),
  ]);
  return card;
}

// ============================================================
// Bloco 3 — Ficha de detalhe (modal)
// ============================================================
async function abrirDetalhe(cerebro) {
  const modal = document.getElementById('pc-modal');
  modal.innerHTML = '';
  modal.classList.remove('pc-hidden');

  const inner = el('div', { class: 'pc-modal-inner' });
  modal.append(inner);

  inner.append(el('div', { class: 'pc-modal-head' }, [
    el('h2', null, [`${cerebro.produto_emoji || '🧠'} ${cerebro.produto_nome}`]),
    el('button', { class: 'pc-close', onclick: fecharModal }, '×'),
  ]));

  const loader = el('div', { class: 'pc-loading' }, 'Carregando detalhes…');
  inner.append(loader);

  let detalhe;
  try {
    if (_detalheCache.has(cerebro.cerebro_id)) {
      detalhe = _detalheCache.get(cerebro.cerebro_id);
    } else {
      detalhe = await callEdge('tool-plano-cerebros-snapshot', { query: `?cerebro_id=${cerebro.cerebro_id}` });
      if (!detalhe.ok) throw new Error(detalhe.erro);
      _detalheCache.set(cerebro.cerebro_id, detalhe);
    }
  } catch (e) {
    loader.textContent = 'Erro: ' + e.message;
    return;
  }
  loader.remove();

  // Stats topo
  inner.append(el('div', { class: 'pc-modal-stats' }, [
    el('div', null, [el('strong', null, `${detalhe.cerebro.dias_sem_atualizar || 0}`), ' dias sem update']),
    el('div', null, [el('strong', null, `${detalhe.cerebro.total_fontes || 0}`), ' fontes cadastradas']),
    el('div', null, [el('strong', null, `${detalhe.cerebro.total_chunks || 0}`), ' chunks vetorizados']),
    el('div', null, [el('strong', null, detalhe.cerebro.persona_versao ? `v${detalhe.cerebro.persona_versao}` : '—'), ' Persona']),
  ]));

  // Fontes cadastradas
  inner.append(blocoFontesCadastradas(detalhe.fontes_cadastradas));

  // Fontes planejadas
  inner.append(blocoFontesPlanejadas(detalhe.fontes_planejadas, cerebro.cerebro_id));

  // Sugestões
  inner.append(blocoSugestoes(detalhe.sugestoes, cerebro.cerebro_id));

  // Adicionar fonte manual
  inner.append(blocoAdicionarManual(detalhe.integracoes_catalogo, cerebro.cerebro_id));
}

function blocoFontesCadastradas(fontes) {
  const box = el('div', { class: 'pc-bloco' }, [
    el('h3', null, `📚 Fontes cadastradas (${(fontes || []).length})`),
    el('p', { class: 'pc-bloco-sub' }, 'Material já ingerido no cérebro (chunks vetorizados). Atualização hoje é 100% manual.'),
  ]);
  if (!fontes || fontes.length === 0) {
    box.append(el('div', { class: 'pc-empty' }, 'Nenhuma fonte cadastrada.'));
    return box;
  }
  const lista = el('div', { class: 'pc-list' });
  for (const f of fontes.slice(0, 20)) {
    lista.append(el('div', { class: 'pc-list-item' }, [
      el('div', { class: 'pc-li-titulo' }, [
        el('span', { class: 'pc-tag' }, f.tipo || 'fonte'),
        ' ',
        el('span', null, f.titulo || '(sem título)'),
      ]),
      el('div', { class: 'pc-li-sub' }, `${f.origem || '—'} · ${fmtData(f.criado_em)}`),
    ]));
  }
  if (fontes.length > 20) {
    lista.append(el('div', { class: 'pc-empty' }, `... e mais ${fontes.length - 20} fontes`));
  }
  box.append(lista);
  return box;
}

function blocoFontesPlanejadas(fontes, cerebro_id) {
  const box = el('div', { class: 'pc-bloco' }, [
    el('h3', null, `🛠 Fontes planejadas pra automação (${(fontes || []).length})`),
    el('p', { class: 'pc-bloco-sub' }, 'Fontes que você mapeou na reunião. Quando ficar pronta a automação, marcar como "rodando".'),
  ]);
  if (!fontes || fontes.length === 0) {
    box.append(el('div', { class: 'pc-empty' }, 'Nenhuma fonte planejada ainda. Veja sugestões abaixo.'));
    return box;
  }
  const lista = el('div', { class: 'pc-list' });
  for (const f of fontes) {
    const corS = ({ mapeada: '#94A3B8', em_construcao: '#F59E0B', rodando: '#22C55E', pausada: '#64748B' })[f.status] || '#94A3B8';
    lista.append(el('div', { class: 'pc-list-item pc-planejada' }, [
      el('div', { class: 'pc-li-titulo' }, [
        el('span', { class: 'pc-tag', style: `background:${corS};color:white` }, f.status),
        ' ',
        el('strong', null, f.titulo),
        ' ',
        f.integracao_slug ? el('span', { class: 'pc-mini' }, ` (${f.integracao_slug})`) : '',
      ]),
      f.descricao ? el('div', { class: 'pc-li-sub' }, f.descricao) : null,
      f.cron_descricao ? el('div', { class: 'pc-li-sub' }, `⏰ ${f.cron_descricao}`) : null,
      el('div', { class: 'pc-li-acoes' }, [
        f.status !== 'rodando' ? el('button', { class: 'pc-btn-sm', onclick: () => mudarStatus(f.id, 'rodando', cerebro_id) }, '✅ Marcar rodando') : null,
        f.status !== 'em_construcao' ? el('button', { class: 'pc-btn-sm', onclick: () => mudarStatus(f.id, 'em_construcao', cerebro_id) }, '🔧 Em construção') : null,
        f.status !== 'pausada' ? el('button', { class: 'pc-btn-sm', onclick: () => mudarStatus(f.id, 'pausada', cerebro_id) }, '⏸ Pausar') : null,
        el('button', { class: 'pc-btn-sm pc-btn-danger', onclick: () => removerFonte(f.id, cerebro_id) }, '🗑 Remover'),
      ]),
    ]));
  }
  box.append(lista);
  return box;
}

function blocoSugestoes(sugestoes, cerebro_id) {
  const box = el('div', { class: 'pc-bloco' }, [
    el('h3', null, `💡 Sugestões de fontes (${(sugestoes || []).length})`),
    el('p', { class: 'pc-bloco-sub' }, 'Integrações que existem mas você não está usando pra este cérebro. Clique pra adicionar.'),
  ]);
  if (!sugestoes || sugestoes.length === 0) {
    box.append(el('div', { class: 'pc-empty' }, 'Você já tem fontes planejadas pra todas as integrações disponíveis.'));
    return box;
  }
  const grid = el('div', { class: 'pc-sug-grid' });
  for (const s of sugestoes) {
    grid.append(el('div', { class: 'pc-sug-card' }, [
      el('div', { class: 'pc-sug-head' }, [
        el('span', { class: 'pc-emoji' }, s.emoji || '🔌'),
        el('strong', null, s.nome),
      ]),
      el('div', { class: 'pc-sug-cat' }, s.categoria),
      el('div', { class: 'pc-sug-desc' }, s.descricao || ''),
      s.exemplo_uso ? el('div', { class: 'pc-sug-exemplo' }, `Ex: ${s.exemplo_uso}`) : null,
      el('button', {
        class: 'pc-btn-add',
        onclick: () => adicionarSugestao(s, cerebro_id),
      }, '+ Adicionar como fonte planejada'),
    ]));
  }
  box.append(grid);
  return box;
}

function blocoAdicionarManual(integracoes, cerebro_id) {
  return el('div', { class: 'pc-bloco' }, [
    el('h3', null, '+ Adicionar fonte manualmente'),
    el('p', { class: 'pc-bloco-sub' }, 'Se não tem nas sugestões, cadastra aqui — útil pra integrações novas (ex: Tally).'),
    el('div', { class: 'pc-form' }, [
      el('input', { type: 'text', id: 'pc-novo-titulo', placeholder: 'Título (ex: Pesquisa pós-aula Tally)', class: 'pc-input' }),
      el('select', { id: 'pc-novo-integracao', class: 'pc-input' }, [
        el('option', { value: '' }, '— Integração (opcional) —'),
        ...(integracoes || []).map(i => el('option', { value: i.slug }, `${i.emoji || ''} ${i.nome}`)),
      ]),
      el('input', { type: 'text', id: 'pc-novo-desc', placeholder: 'Descrição (opcional)', class: 'pc-input' }),
      el('input', { type: 'text', id: 'pc-novo-cron', placeholder: 'Frequência sugerida (ex: todo dia 3h)', class: 'pc-input' }),
      el('button', { class: 'pc-btn-add', onclick: () => adicionarManual(cerebro_id) }, '+ Cadastrar'),
    ]),
  ]);
}

// ============================================================
// Bloco 4 — Catálogo de integrações (rodapé referência)
// ============================================================
function renderCatalogoIntegracoes(integ) {
  const box = el('div', { class: 'pc-bloco pc-catalogo' }, [
    el('h2', { class: 'pc-section-title' }, `🔌 Cardápio de integrações (${(integ || []).length})`),
    el('p', { class: 'pc-bloco-sub' }, 'Estas são as integrações disponíveis no sistema. Cada cérebro pode plugar uma ou mais como fonte de atualização.'),
  ]);
  const grid = el('div', { class: 'pc-cat-grid' });
  for (const i of (integ || [])) {
    grid.append(el('div', { class: `pc-cat-card ${i.ativa ? '' : 'pc-cat-inativa'}` }, [
      el('div', { class: 'pc-cat-head' }, [
        el('span', { class: 'pc-emoji' }, i.emoji || '🔌'),
        el('strong', null, i.nome),
        el('span', { class: 'pc-mini' }, i.ativa ? '✅' : '🚧'),
      ]),
      el('div', { class: 'pc-sug-cat' }, i.categoria),
      el('div', { class: 'pc-sug-desc' }, i.descricao || ''),
    ]));
  }
  box.append(grid);
  return box;
}

// ============================================================
// Ações CRUD
// ============================================================
async function adicionarSugestao(s, cerebro_id) {
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: {
        acao: 'criar',
        cerebro_id,
        titulo: s.nome,
        integracao_slug: s.integracao_slug,
        descricao: s.exemplo_uso || s.descricao,
        tipo_fonte: 'mapeada',
      },
    });
    if (!r.ok) throw new Error(r.erro);
    _detalheCache.delete(cerebro_id);
    const cerebro = _snapshot.cerebros.find(c => c.cerebro_id === cerebro_id);
    if (cerebro) await abrirDetalhe(cerebro);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function adicionarManual(cerebro_id) {
  const titulo = document.getElementById('pc-novo-titulo').value.trim();
  const integracao_slug = document.getElementById('pc-novo-integracao').value;
  const descricao = document.getElementById('pc-novo-desc').value.trim();
  const cron_descricao = document.getElementById('pc-novo-cron').value.trim();
  if (!titulo) { alert('Título obrigatório'); return; }
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: { acao: 'criar', cerebro_id, titulo, integracao_slug: integracao_slug || null, descricao, cron_descricao },
    });
    if (!r.ok) throw new Error(r.erro);
    _detalheCache.delete(cerebro_id);
    const cerebro = _snapshot.cerebros.find(c => c.cerebro_id === cerebro_id);
    if (cerebro) await abrirDetalhe(cerebro);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function mudarStatus(id, status, cerebro_id) {
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: { acao: 'atualizar_status', id, status },
    });
    if (!r.ok) throw new Error(r.erro);
    _detalheCache.delete(cerebro_id);
    const cerebro = _snapshot.cerebros.find(c => c.cerebro_id === cerebro_id);
    if (cerebro) await abrirDetalhe(cerebro);
  } catch (e) { alert('Erro: ' + e.message); }
}

async function removerFonte(id, cerebro_id) {
  if (!confirm('Remover essa fonte planejada?')) return;
  try {
    const r = await callEdge('tool-cerebro-fonte-planejada', {
      method: 'POST',
      body: { acao: 'remover', id },
    });
    if (!r.ok) throw new Error(r.erro);
    _detalheCache.delete(cerebro_id);
    const cerebro = _snapshot.cerebros.find(c => c.cerebro_id === cerebro_id);
    if (cerebro) await abrirDetalhe(cerebro);
  } catch (e) { alert('Erro: ' + e.message); }
}

function fecharModal() {
  const modal = document.getElementById('pc-modal');
  if (modal) modal.classList.add('pc-hidden');
}

// ============================================================
// Estilos (inject once)
// ============================================================
function injetarEstilos() {
  if (document.getElementById('pc-style')) return;
  const css = `
    #page-plano-cerebros { padding: 24px; max-width: 1400px; margin: 0 auto; color: #E2E8F0; font-family: system-ui, sans-serif; }
    .pc-header { margin-bottom: 24px; }
    .pc-title { font-size: 2rem; margin: 0 0 8px 0; }
    .pc-sub { color: #94A3B8; margin: 0; }
    .pc-loading { padding: 24px; color: #94A3B8; }

    .pc-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .pc-card-num { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .pc-num-label { color: #94A3B8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .pc-num-val { font-size: 2.2rem; font-weight: 700; color: white; }
    .pc-num-sub { color: #94A3B8; font-size: 0.9rem; margin-top: 4px; }

    .pc-grid-section, .pc-bloco { margin-bottom: 32px; }
    .pc-section-title { font-size: 1.3rem; margin: 0 0 16px 0; color: white; }

    .pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .pc-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 16px; transition: transform 0.15s, border-color 0.15s; }
    .pc-card:hover { transform: translateY(-2px); border-color: #475569; }
    .pc-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .pc-emoji { font-size: 1.5rem; }
    .pc-card-titulo { font-weight: 600; color: white; }
    .pc-card-status { font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; }
    .pc-card-row { font-size: 0.85rem; color: #94A3B8; margin-bottom: 4px; }
    .pc-card-row strong { color: #CBD5E1; }
    .pc-btn-detalhe { margin-top: 12px; background: #2563EB; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; width: 100%; font-weight: 600; }
    .pc-btn-detalhe:hover { background: #1D4ED8; }

    .pc-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: flex-start; justify-content: center; z-index: 9999; overflow-y: auto; padding: 40px 16px; }
    .pc-hidden { display: none !important; }
    .pc-modal-inner { background: #0F172A; border: 1px solid #334155; border-radius: 16px; padding: 24px; max-width: 900px; width: 100%; }
    .pc-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #334155; }
    .pc-modal-head h2 { margin: 0; color: white; }
    .pc-close { background: transparent; color: #94A3B8; border: none; font-size: 2rem; cursor: pointer; line-height: 1; }
    .pc-modal-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; padding: 12px; background: #1E293B; border-radius: 8px; }
    .pc-modal-stats div { color: #94A3B8; font-size: 0.9rem; }
    .pc-modal-stats strong { color: white; font-size: 1.2rem; margin-right: 4px; }

    .pc-bloco h3 { font-size: 1.1rem; color: white; margin: 0 0 8px 0; }
    .pc-bloco-sub { font-size: 0.85rem; color: #94A3B8; margin: 0 0 12px 0; }
    .pc-list { display: flex; flex-direction: column; gap: 8px; }
    .pc-list-item { background: #1E293B; padding: 12px; border-radius: 8px; border-left: 3px solid #475569; }
    .pc-planejada { border-left-color: #2563EB; }
    .pc-li-titulo { color: white; margin-bottom: 4px; }
    .pc-li-sub { font-size: 0.85rem; color: #94A3B8; margin-bottom: 4px; }
    .pc-li-acoes { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .pc-btn-sm { background: #334155; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
    .pc-btn-sm:hover { background: #475569; }
    .pc-btn-danger { background: #7F1D1D; }
    .pc-btn-danger:hover { background: #991B1B; }
    .pc-tag { background: #334155; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .pc-mini { color: #64748B; font-size: 0.85rem; }
    .pc-empty { color: #64748B; padding: 16px; text-align: center; font-style: italic; }

    .pc-sug-grid, .pc-cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .pc-sug-card, .pc-cat-card { background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 12px; }
    .pc-cat-inativa { opacity: 0.6; }
    .pc-sug-head, .pc-cat-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: white; }
    .pc-sug-cat { font-size: 0.75rem; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .pc-sug-desc { font-size: 0.85rem; color: #CBD5E1; margin-bottom: 6px; }
    .pc-sug-exemplo { font-size: 0.8rem; color: #64748B; font-style: italic; margin-bottom: 8px; }
    .pc-btn-add { background: #16A34A; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.85rem; width: 100%; }
    .pc-btn-add:hover { background: #15803D; }

    .pc-form { display: grid; gap: 8px; max-width: 600px; }
    .pc-input { background: #0F172A; border: 1px solid #334155; color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
    .pc-input:focus { outline: none; border-color: #2563EB; }
  `;
  document.head.append(el('style', { id: 'pc-style', html: css }));
}
