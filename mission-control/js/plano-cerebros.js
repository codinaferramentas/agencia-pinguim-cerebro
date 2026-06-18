/* Plano de Cérebros — V3 Cards por categoria (2026-06-16)

   Mudanca arquitetural: a unidade visual NAO eh fonte individual.
   Eh CATEGORIA de fonte + seu plano de automacao.

   - Aba 🧠 Cérebros: grid de 10 cerebros (oculta "dias sem atualizar")
   - Click no cerebro abre tela full com lista vertical de cards-categoria
   - Cada card = 1 categoria com count, origem, freshness, schedule, status
   - Botao primario unico avanca status pelo ciclo de vida
   - Modal "Editar plano" pra configurar origem/schedule/ferramenta/responsavel
   - Aba 🔌 Integracoes: igual v2 (sera revisada depois)
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

function freshnessTexto(iso) {
  if (!iso) return { texto: 'nunca', cor: '#EF4444' };
  const d = new Date(iso);
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  const dias = Math.floor(h / 24);
  if (h < 1) return { texto: 'agora há pouco', cor: '#22C55E' };
  if (h < 24) return { texto: `há ${h}h`, cor: '#22C55E' };
  if (dias < 7) return { texto: `há ${dias}d`, cor: '#22C55E' };
  if (dias < 30) return { texto: `há ${dias}d`, cor: '#F59E0B' };
  if (dias < 60) return { texto: `há ${Math.floor(dias/7)} sem`, cor: '#F59E0B' };
  return { texto: `há ${Math.floor(dias/30)} meses`, cor: '#EF4444' };
}

const STATUS_META = {
  sem_coleta:    { label: 'sem coleta',     cor: '#64748B', emoji: '⚫', proximoLabel: '+ Priorizar pra reunião' },
  planejada:     { label: 'planejada',      cor: '#3B82F6', emoji: '🔵', proximoLabel: '▶ Marcar em construção' },
  em_construcao: { label: 'em construção',  cor: '#F59E0B', emoji: '🟡', proximoLabel: '▶ Marcar como rodando' },
  rodando:       { label: 'rodando',        cor: '#22C55E', emoji: '🟢', proximoLabel: '⏸ Pausar' },
  pausada:       { label: 'pausada',        cor: '#94A3B8', emoji: '⏸', proximoLabel: '▶ Retomar' },
  falhou:        { label: 'falhou',         cor: '#EF4444', emoji: '❌', proximoLabel: '▶ Retomar' },
  nao_aplicavel: { label: 'não se aplica',  cor: '#A1A1AA', emoji: '🚫', proximoLabel: '↩ Reativar' },
};

// V3 (2026-06-17) — estado global do toggle "mostrar não aplicáveis" por sessão
let _mostrarNaoAplicaveis = false;

const TRIGGER_META = {
  manual:        { label: 'manual',              emoji: '🖐', descricao: 'Você clica "Rodar agora" pra disparar.' },
  cron:          { label: 'agendado',            emoji: '⏰', descricao: 'Scheduler local (server-cli) dispara no horário configurado.' },
  evento_avisar: { label: 'avisar quando achar', emoji: '🔔', descricao: 'Detector híbrido percebe arquivo novo e mostra badge — você clica pra processar.' },
  evento_auto:   { label: 'automático evento',   emoji: '🤖', descricao: 'Detector híbrido percebe arquivo novo e processa direto.' },
};

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
let _snapshot = null;
let _detalheCache = new Map();
let _abaAtiva = 'cerebros';
let _cerebroAberto = null;
let _filtroStatus = 'todos'; // 'todos' | 'sem_coleta' | 'planejada' | 'em_construcao' | 'rodando' | 'pausada'

// ============================================================
// Render principal
// ============================================================
export async function renderPlanoCerebros() {
  const container = document.getElementById('page-plano-cerebros');
  if (!container) return;
  // V3 fix (2026-06-18): zera estado de navegacao toda vez que entra na aba.
  // Antes ficava preso no ultimo cerebro aberto quando o usuario navegava p/ outra aba e voltava.
  _cerebroAberto = null;
  _filtroStatus = 'todos';
  _mostrarNaoAplicaveis = false;
  container.innerHTML = '';
  injetarEstilos();

  container.append(renderHeader());

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

  const conteudo = el('div', { id: 'pc-conteudo' });
  container.append(conteudo);
  renderAbaAtiva(conteudo);

  const modal = el('div', { id: 'pc-modal', class: 'pc-modal-bg pc-hidden' });
  container.append(modal);
  modal.addEventListener('click', (e) => { if (e.target.id === 'pc-modal') fecharModal(); });

  // V3 (2026-06-18) modal secundario (sobreposto) — usado pelo browser de pasta Drive
  // sem fechar o modal de Editar Plano que tá embaixo
  const modal2 = el('div', { id: 'pc-modal-2', class: 'pc-modal-bg pc-hidden', style: 'z-index:1050' });
  container.append(modal2);
  modal2.addEventListener('click', (e) => { if (e.target.id === 'pc-modal-2') fecharModal2(); });
}

function fecharModal2() {
  const m = document.getElementById('pc-modal-2');
  if (m) { m.classList.add('pc-hidden'); m.innerHTML = ''; }
}

function renderHeader() {
  const header = el('div', { class: 'pc-header' });
  header.append(el('h1', { class: 'pc-title' }, '🎛 Automação de Cérebros'));
  header.append(el('p', { class: 'pc-sub' }, 'Visão transversal das automações + drill-down por cérebro. Tudo num lugar.'));
  const tabs = el('div', { class: 'pc-tabs' });
  tabs.append(
    el('button', { class: 'pc-tab' + (_abaAtiva === 'cerebros' ? ' pc-tab-ativa' : ''), onclick: () => trocarAba('cerebros') }, '🧠 Cérebros'),
    el('button', { class: 'pc-tab' + (_abaAtiva === 'integracoes' ? ' pc-tab-ativa' : ''), onclick: () => trocarAba('integracoes') }, '🔌 Integrações'),
  );
  header.append(tabs);
  return header;
}

function trocarAba(nova) {
  if (_abaAtiva === nova) return;
  _abaAtiva = nova;
  _cerebroAberto = null;
  document.querySelectorAll('.pc-tab').forEach(t => t.classList.remove('pc-tab-ativa'));
  document.querySelectorAll('.pc-tab').forEach(t => {
    if (t.textContent.trim().includes(nova === 'cerebros' ? 'Cérebros' : 'Integrações')) t.classList.add('pc-tab-ativa');
  });
  const conteudo = document.getElementById('pc-conteudo');
  conteudo.innerHTML = '';
  renderAbaAtiva(conteudo);
}

function renderAbaAtiva(conteudo) {
  if (_abaAtiva === 'cerebros') {
    if (_cerebroAberto) renderTelaCerebro(conteudo, _cerebroAberto);
    else {
      // V5 (2026-06-18 noite) — Matriz Produto x Frequencia (estilo Databricks).
      // Ordem visual:
      //   1) KPIs (topo - resumo rapido, com tooltip)
      //   2) Alertas (se houver)
      //   3) Cards dos 10 cerebros
      //   4) Matriz Produto x Frequencia (FOCO PRINCIPAL — substitui tabs cronologico)
      //   5) Filtro por produto (embaixo, conforme Andre pediu)
      const kpisSlot = el('div', { id: 'pa-kpis-slot' });
      const gridSlot = el('div', { id: 'pa-grid-slot' });
      const matrizSlot = el('div', { id: 'pa-matriz-slot', style: 'margin-top:1.5rem' });
      const filtroSlot = el('div', { id: 'pa-filtro-slot', style: 'margin-top:1rem' });
      conteudo.append(kpisSlot, gridSlot, matrizSlot, filtroSlot);
      gridSlot.append(renderGridCerebros(_snapshot.cerebros));
      filtroSlot.append(renderFiltroProduto());
      carregarPainelAutomacao();
    }
  } else {
    conteudo.append(renderAbaIntegracoes(_snapshot.integracoes_catalogo));
  }
}

// ============================================================
// V3 (2026-06-18) — Painel transversal de automacao (fundido aqui)
// Le 4 RPCs do schema-023 em paralelo + renderiza KPIs + alertas + tabs.
// Substitui a antiga aba 'painel-automacao' que estava em arquivo separado.
// ============================================================
let _painelCache = null;
let _filtroProduto = 'todos';   // chip embaixo da matriz

async function carregarPainelAutomacao() {
  const kpisSlot = document.getElementById('pa-kpis-slot');
  const matrizSlot = document.getElementById('pa-matriz-slot');
  if (!kpisSlot || !matrizSlot) return;
  kpisSlot.innerHTML = '<div style="padding:1rem;color:#94A3B8;font-size:.875rem">Carregando KPIs...</div>';
  matrizSlot.innerHTML = '<div style="padding:1rem;color:#94A3B8;font-size:.875rem">Carregando matriz...</div>';
  try {
    const sb = getSupabase();
    const [kpis, alertas, matriz] = await Promise.all([
      sb.rpc('painel_automacao_kpis').then(r => r.data?.[0] || {}),
      sb.rpc('painel_automacao_alertas', { p_dias: 7 }).then(r => r.data || []),
      sb.rpc('painel_automacao_matriz').then(r => r.data || []),
    ]);
    _painelCache = { kpis, alertas, matriz };
    renderPainelKpisESlots();
  } catch (e) {
    kpisSlot.innerHTML = `<div style="padding:1rem;color:#EF4444;font-size:.875rem">Erro carregando painel: ${e.message}</div>`;
  }
}

function renderPainelKpisESlots() {
  const kpisSlot = document.getElementById('pa-kpis-slot');
  const matrizSlot = document.getElementById('pa-matriz-slot');
  if (!kpisSlot || !matrizSlot || !_painelCache) return;
  const { kpis, alertas, matriz } = _painelCache;
  kpisSlot.innerHTML = '';
  kpisSlot.append(renderPainelKpis(kpis));
  if (alertas.length > 0) kpisSlot.append(renderPainelAlertas(alertas));
  matrizSlot.innerHTML = '';
  matrizSlot.append(renderMatrizFrequencia(filtrarMatriz(matriz)));
}

function filtrarMatriz(linhas) {
  if (_filtroProduto === 'todos') return linhas;
  return linhas.filter(l => l.produto_nome === _filtroProduto);
}

function renderFiltroProduto() {
  const wrap = el('div', { style: 'display:flex;flex-wrap:wrap;gap:.4rem;padding:.5rem 0 1rem;align-items:center' });
  wrap.append(el('span', { style: 'font-size:.75rem;color:#94A3B8;margin-right:.4rem' }, 'Filtrar:'));
  const produtos = ['todos', ...(_snapshot.cerebros || []).map(c => c.produto_nome)];
  for (const p of produtos) {
    const ativo = _filtroProduto === p;
    const chip = el('button', {
      style: `padding:.3rem .7rem;border-radius:999px;font-size:.75rem;cursor:pointer;border:1px solid ${ativo ? '#3B82F6' : '#1E293B'};background:${ativo ? '#3B82F6' : '#0F172A'};color:${ativo ? '#fff' : '#94A3B8'};font-weight:${ativo ? 600 : 400}`,
      onclick: () => { _filtroProduto = p; reRenderFiltrado(); },
    }, p === 'todos' ? 'Todos' : p);
    wrap.append(chip);
  }
  return wrap;
}

function reRenderFiltrado() {
  // Re-renderiza filtro (pra atualizar chip ativo) + grid + matriz
  const filtroSlot = document.getElementById('pa-filtro-slot');
  const gridSlot = document.getElementById('pa-grid-slot');
  if (filtroSlot) { filtroSlot.innerHTML = ''; filtroSlot.append(renderFiltroProduto()); }
  if (gridSlot) {
    gridSlot.innerHTML = '';
    const cers = _filtroProduto === 'todos'
      ? _snapshot.cerebros
      : _snapshot.cerebros.filter(c => c.produto_nome === _filtroProduto);
    gridSlot.append(renderGridCerebros(cers));
  }
  renderPainelKpisESlots();
}

// ============================================================
// V5 (2026-06-18 noite) — MATRIZ Produto x Frequencia
// Estilo Databricks Matrix View. Substitui tabs cronologico/calendario.
// ============================================================
//
// Colunas derivadas do cron_expr:
//   - Diario (0 H * * *)
//   - Seg (0 H * * 1)
//   - Ter (0 H * * 2) ...
//   - Tempo-real (trigger_tipo=webhook OU evento_auto)
//   - Manual (trigger_tipo=manual)
//
// Celulas: emoji da categoria + asterisco se motor_unico=true.
// Hover: tooltip com categoria + horario + ultima execucao + status.
// Click na linha (produto): abre drill-down do cerebro.

const FREQ_COLS = [
  { key: 'diario',    label: 'Diário',     icon: '🌅' },
  { key: 'seg',       label: 'Seg',        icon: '📍' },
  { key: 'ter',       label: 'Ter',        icon: '📍' },
  { key: 'qua',       label: 'Qua',        icon: '📍' },
  { key: 'qui',       label: 'Qui',        icon: '📍' },
  { key: 'sex',       label: 'Sex',        icon: '📍' },
  { key: 'sab',       label: 'Sáb',        icon: '📍' },
  { key: 'dom',       label: 'Dom',        icon: '📍' },
  { key: 'tempo_real',label: 'Tempo real', icon: '⚡' },
  { key: 'manual',    label: 'Manual',     icon: '✋' },
];

function _freqDeLinha(l) {
  // Retorna a chave de coluna onde essa linha cai
  if (l.trigger_tipo === 'manual') return 'manual';
  if (l.trigger_tipo === 'webhook' || l.trigger_tipo === 'evento_auto' || l.trigger_tipo === 'evento_avisar') return 'tempo_real';
  if (!l.schedule_cron) return null;
  const parts = l.schedule_cron.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const dow = parts[4];
  if (dow === '*') return 'diario';
  // Pode ter multiplos (ex: '1,3' = seg+qua). Pega o primeiro como representativo.
  const map = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 7: 'dom' };
  const first = parseInt(dow.split(',')[0].split('-')[0], 10);
  if (isNaN(first)) return null;
  return map[first % 7];
}

function _horaBrt(cron) {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const minUtc = parts[0], hourUtc = parts[1];
  if (!/^\d+$/.test(minUtc) || !/^\d+$/.test(hourUtc)) return null;
  const h = (parseInt(hourUtc,10) - 3 + 24) % 24;
  return `${String(h).padStart(2,'0')}:${minUtc.padStart(2,'0')} BRT`;
}

function renderMatrizFrequencia(linhas) {
  const wrap = el('div');
  wrap.append(el('h2', { class: 'pc-section-title' }, '📊 Matriz Produto × Frequência'));
  wrap.append(el('p', { class: 'pc-sub' }, 'Linha = produto, coluna = quando roda. Bata o olho e veja o quê roda diário/semanal/tempo-real. Hover na célula pra detalhe. Clique na linha pra abrir o cérebro.'));

  if (linhas.length === 0) {
    wrap.append(el('div', { style: 'padding:2rem;color:#64748B;text-align:center' }, 'Nada rodando ainda.'));
    return wrap;
  }

  // Agrupa por (produto, frequencia) -> [categorias]
  const porProduto = new Map();
  for (const l of linhas) {
    if (!porProduto.has(l.produto_nome)) {
      porProduto.set(l.produto_nome, { cerebro_id: l.cerebro_id, produto_emoji: l.produto_emoji, celulas: {} });
    }
    const freq = _freqDeLinha(l);
    if (!freq) continue;
    const entry = porProduto.get(l.produto_nome);
    if (!entry.celulas[freq]) entry.celulas[freq] = [];
    entry.celulas[freq].push(l);
  }

  // Detecta colunas com pelo menos 1 item (esconde colunas vazias pra nao poluir)
  const colsUsadas = new Set();
  for (const [, entry] of porProduto) {
    for (const k of Object.keys(entry.celulas)) colsUsadas.add(k);
  }
  const cols = FREQ_COLS.filter(c => colsUsadas.has(c.key));

  // Container da tabela com scroll horizontal
  const tableWrap = el('div', { style: 'overflow-x:auto;border:1px solid #1E293B;border-radius:6px;background:#0F172A' });
  const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:.8125rem' });

  // Header
  const thead = el('thead');
  const trHead = el('tr', { style: 'background:#1E293B' });
  trHead.append(el('th', { style: 'padding:.7rem .85rem;text-align:left;color:#E2E8F0;font-weight:600;position:sticky;left:0;background:#1E293B;z-index:2;min-width:170px' }, 'Cérebro'));
  for (const c of cols) {
    trHead.append(el('th', { style: 'padding:.7rem .5rem;text-align:center;color:#94A3B8;font-weight:600;min-width:78px' }, [
      el('div', { style: 'font-size:1rem' }, c.icon),
      el('div', { style: 'font-size:.7rem;margin-top:.1rem' }, c.label),
    ]));
  }
  thead.append(trHead);
  table.append(thead);

  // Body
  const tbody = el('tbody');
  const produtosOrdenados = [...porProduto.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [nome, entry] of produtosOrdenados) {
    const tr = el('tr', {
      style: 'border-top:1px solid #1E293B;cursor:pointer;transition:background .15s',
      onmouseover: function() { this.style.background = 'rgba(59,130,246,0.06)'; },
      onmouseout: function() { this.style.background = ''; },
      onclick: () => abrirCerebro(entry.cerebro_id),
    });
    tr.append(el('td', { style: 'padding:.7rem .85rem;color:#E2E8F0;font-weight:600;position:sticky;left:0;background:#0F172A;z-index:1' }, [
      el('span', { style: 'margin-right:.4rem' }, entry.produto_emoji || '🧠'),
      nome,
    ]));
    for (const c of cols) {
      const cats = entry.celulas[c.key] || [];
      const td = el('td', { style: 'padding:.5rem;text-align:center;vertical-align:middle' });
      if (cats.length === 0) {
        td.append(el('span', { style: 'color:#334155;font-size:.65rem' }, '—'));
      } else {
        const cellInner = el('div', { style: 'display:flex;justify-content:center;gap:.2rem;flex-wrap:wrap' });
        for (const cat of cats) {
          const corBorda = cat.ultimo_status_run === 'falha' ? '#EF4444'
                         : cat.ultimo_status_run === 'ok' ? '#22C55E' : '#475569';
          const tip = [
            `${cat.categoria_emoji} ${cat.categoria_nome}`,
            cat.motor_unico ? '⚙ Motor central (1 cron distribui pros 10)' : null,
            cat.schedule_descricao ? `🕐 ${cat.schedule_descricao}` : null,
            _horaBrt(cat.schedule_cron) ? `Horário: ${_horaBrt(cat.schedule_cron)}` : null,
            cat.ultima_execucao ? `Última: ${new Date(cat.ultima_execucao).toLocaleString('pt-BR')} (${cat.ultimo_status_run || '—'})` : 'Nunca rodou',
          ].filter(Boolean).join('\n');
          const emojiBox = el('span', {
            style: `display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;background:#1E293B;border:2px solid ${corBorda};font-size:1.05rem;position:relative`,
            title: tip,
          }, cat.categoria_emoji || '📦');
          if (cat.motor_unico) {
            emojiBox.append(el('span', {
              style: 'position:absolute;top:-4px;right:-4px;background:#A78BFA;color:#fff;width:14px;height:14px;border-radius:50%;font-size:.6rem;display:flex;align-items:center;justify-content:center;font-weight:700;line-height:1',
              title: 'Motor central — 1 cron único distribui pros 10 cérebros',
            }, '*'));
          }
          cellInner.append(emojiBox);
        }
        td.append(cellInner);
      }
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  tableWrap.append(table);
  wrap.append(tableWrap);

  // Legenda
  const legenda = el('div', { style: 'display:flex;gap:1.2rem;flex-wrap:wrap;padding:.6rem 0;font-size:.7rem;color:#94A3B8;margin-top:.5rem' });
  legenda.append(el('span', {}, '🟢 borda verde = última execução OK'));
  legenda.append(el('span', {}, '🔴 borda vermelha = falhou'));
  legenda.append(el('span', {}, '⚪ borda cinza = ainda não rodou'));
  legenda.append(el('span', {}, [
    el('span', { style: 'background:#A78BFA;color:#fff;width:14px;height:14px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;margin-right:.3rem' }, '*'),
    'motor central (1 cron único distribui pros 10)',
  ]));
  wrap.append(legenda);

  return wrap;
}

function renderPainelKpis(k) {
  const cards = [
    {
      num: k.total_executou_24h || 0, label: 'rodaram nas últimas 24h', cor: '#22C55E', emoji: '✓',
      tip: 'Crons que executaram pelo menos 1 vez nas últimas 24h (independente de sucesso ou falha).',
    },
    {
      num: k.total_rodando || 0, label: 'automatizadas (rodando)', cor: '#3B82F6', emoji: '🟢',
      sub: `de ${k.total_categorias_aplicaveis || 0} categorias`,
      tip: 'Categorias de cérebros com status "rodando" — ou seja, têm cron ativo, webhook, ou processamento por evento.',
    },
    {
      num: k.total_manuais || 0, label: 'manuais (você controla)', cor: '#F59E0B', emoji: '✋',
      tip: 'Categorias que você precisa rodar à mão (ex: subir aula no Drive). Não tem cron.',
    },
    {
      num: k.total_falhou_24h || 0, label: 'falharam nas últimas 24h', cor: (k.total_falhou_24h || 0) > 0 ? '#EF4444' : '#94A3B8', emoji: '✗',
      tip: 'Crons que rodaram nas últimas 24h e retornaram erro. Olhe o card da categoria no cérebro pra ver o motivo.',
    },
    {
      num: k.total_defasadas_7d || 0, label: 'defasadas (sem update >7d)', cor: (k.total_defasadas_7d || 0) > 0 ? '#F59E0B' : '#94A3B8', emoji: '⚠',
      tip: 'Categorias marcadas "rodando" mas que NUNCA rodaram, ou cuja última execução foi há mais de 7 dias. Geralmente: configurou mas o cron ainda não disparou pela primeira vez.',
    },
  ];
  const wrap = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.6rem;padding:1rem 0' });
  for (const c of cards) {
    wrap.append(el('div', {
      style: `background:#0F172A;border:1px solid #1E293B;border-left:3px solid ${c.cor};border-radius:6px;padding:.8rem;cursor:help`,
      title: c.tip,
    }, [
      el('div', { style: `font-size:1.5rem;font-weight:700;color:${c.cor};line-height:1` }, `${c.emoji} ${c.num}`),
      el('div', { style: 'font-size:.75rem;color:#94A3B8;margin-top:.35rem' }, c.label),
      c.sub ? el('div', { style: 'font-size:.65rem;color:#64748B;margin-top:.1rem' }, c.sub) : null,
    ]));
  }
  return wrap;
}

function renderPainelAlertas(alertas) {
  const titulos = {
    cron_falhou: { label: '❌ Falhou no último run', cor: '#EF4444' },
    rodando_defasada: { label: '⚠ Rodando mas defasada >7d', cor: '#F59E0B' },
    manual_sem_update: { label: '✋ Manual sem update', cor: '#A78BFA' },
  };
  const porTipo = new Map();
  for (const a of alertas) {
    if (!porTipo.has(a.tipo_alerta)) porTipo.set(a.tipo_alerta, []);
    porTipo.get(a.tipo_alerta).push(a);
  }
  const box = el('div', { style: 'background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:.85rem;margin-bottom:1rem' });
  box.append(el('div', { style: 'font-weight:600;margin-bottom:.5rem;color:#EF4444;font-size:.875rem' }, '🔔 Atenção'));
  for (const [tipo, lista] of porTipo) {
    const meta = titulos[tipo] || { label: tipo, cor: '#64748B' };
    box.append(el('div', { style: `font-size:.8125rem;color:${meta.cor};font-weight:600;margin:.4rem 0 .2rem` },
      `${meta.label} (${lista.length})`));
    for (const a of lista.slice(0, 5)) {
      box.append(el('div', { style: 'font-size:.75rem;padding:.15rem .4rem;color:#94A3B8' },
        `• ${a.produto_nome} — ${a.categoria_emoji || ''} ${a.categoria_nome || a.categoria_slug} — ${a.dias_desde_ultima || '?'} dias`));
    }
    if (lista.length > 5) box.append(el('div', { style: 'font-size:.7rem;color:#64748B;padding-left:.4rem' }, `+ ${lista.length - 5} outros…`));
  }
  return box;
}

// ============================================================
// ABA 1 — Grid de cerebros
// ============================================================
function renderResumoGlobal(r) {
  return el('div', { class: 'pc-resumo' }, [
    el('div', { class: 'pc-card-num' }, [
      el('div', { class: 'pc-num-label' }, '🟢 Rodando'),
      el('div', { class: 'pc-num-val', style: 'color:#22C55E' }, String(r.categorias_rodando)),
      el('div', { class: 'pc-num-sub' }, 'categorias automatizadas'),
    ]),
    el('div', { class: 'pc-card-num' }, [
      el('div', { class: 'pc-num-label' }, '🟡 Em construção'),
      el('div', { class: 'pc-num-val', style: 'color:#F59E0B' }, String(r.categorias_em_construcao)),
      el('div', { class: 'pc-num-sub' }, 'trabalho em andamento'),
    ]),
    el('div', { class: 'pc-card-num' }, [
      el('div', { class: 'pc-num-label' }, '🔵 Planejadas'),
      el('div', { class: 'pc-num-val', style: 'color:#3B82F6' }, String(r.categorias_planejadas)),
      el('div', { class: 'pc-num-sub' }, 'decididas na reunião'),
    ]),
    el('div', { class: 'pc-card-num' }, [
      el('div', { class: 'pc-num-label' }, '⚫ Sem coleta'),
      el('div', { class: 'pc-num-val', style: 'color:#94A3B8' }, String(r.categorias_sem_coleta)),
      el('div', { class: 'pc-num-sub' }, 'pendentes de discussão'),
    ]),
  ]);
}

function renderGridCerebros(cerebros) {
  const total = (cerebros || []).length;
  const titulo = _filtroProduto === 'todos'
    ? `🧠 ${total} Cérebros`
    : `🧠 ${cerebros[0]?.produto_nome || _filtroProduto}`;
  const box = el('div', { class: 'pc-grid-section' }, [
    el('h2', { class: 'pc-section-title' }, titulo),
    el('p', { class: 'pc-sub' }, 'Clique pra abrir o plano de automação por categoria.'),
  ]);
  const grid = el('div', { class: 'pc-grid' });
  for (const c of (cerebros || [])) grid.append(cardCerebro(c));
  box.append(grid);
  return box;
}

function cardCerebro(c) {
  const pc = c.plano_counts || {};
  return el('div', {
    class: 'pc-card',
    onclick: () => abrirCerebro(c.cerebro_id),
  }, [
    el('div', { class: 'pc-card-head' }, [
      el('div', { class: 'pc-emoji' }, c.produto_emoji || '🧠'),
      el('div', { class: 'pc-card-titulo' }, c.produto_nome || c.produto_slug),
    ]),
    el('div', { class: 'pc-card-counts' }, [
      mini('🟢', pc.rodando || 0, '#22C55E', 'Rodando: categorias com automação ativa (cron, webhook ou evento) já configurada e funcionando.'),
      mini('🟡', pc.em_construcao || 0, '#F59E0B', 'Em construção: categorias decididas na reunião e em implementação.'),
      mini('🔵', pc.planejada || 0, '#3B82F6', 'Planejada: categorias acordadas na reunião, ainda não começaram a ser implementadas.'),
      mini('⚫', pc.sem_coleta || 0, '#94A3B8', 'Sem coleta: categorias pendentes de discussão ou que dependem de pré-requisito externo (ex: comercial fazer call).'),
    ]),
    el('div', { class: 'pc-card-cta' }, 'Abrir plano →'),
  ]);
}
function mini(emoji, num, cor, title) {
  return el('span', { class: 'pc-mini-pill', title }, [
    el('span', { style: `color:${cor}` }, emoji),
    el('strong', null, String(num)),
  ]);
}

// ============================================================
// TELA DO CEREBRO — cards-categoria
// ============================================================
async function abrirCerebro(cerebro_id) {
  _cerebroAberto = cerebro_id;
  _filtroStatus = 'todos';
  const conteudo = document.getElementById('pc-conteudo');
  conteudo.innerHTML = '';
  await renderTelaCerebro(conteudo, cerebro_id);
}

async function renderTelaCerebro(conteudo, cerebro_id) {
  const headerWrap = el('div', { class: 'pc-cer-header' });
  conteudo.append(headerWrap);

  const loader = el('div', { class: 'pc-loading' }, 'Carregando plano...');
  conteudo.append(loader);

  let detalhe;
  try {
    if (_detalheCache.has(cerebro_id)) detalhe = _detalheCache.get(cerebro_id);
    else {
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
  const pc = c.plano_counts || {};

  // Header (fixo — nao re-renderiza)
  headerWrap.append(
    el('button', { class: 'pc-btn-voltar', onclick: voltarParaGrid }, '← Voltar pros 10 cérebros'),
    el('div', { class: 'pc-cer-titulo' }, [
      el('span', { class: 'pc-emoji', style: 'font-size:2.5rem' }, c.produto_emoji || '🧠'),
      el('div', { style: 'flex:1' }, [
        el('h2', { style: 'margin:0;color:white' }, c.produto_nome),
        el('div', { class: 'pc-mini', style: 'color:#94A3B8' },
          `${detalhe.plano.length} categorias · ${c.total_fontes || 0} fontes vetorizadas · Persona v${c.persona_versao || '—'}`),
      ]),
      el('button', {
        class: 'pc-btn-nova-cat',
        onclick: () => abrirModalNovaCategoria(cerebro_id),
        title: 'Adicionar categoria nova (vale pra todos os cérebros)',
      }, '+ Nova categoria'),
    ]),
    // KPI strip + filtros (re-renderizam parcialmente quando status muda)
    el('div', { id: 'pc-cer-stats-wrap' }),
    el('div', { id: 'pc-cer-filtros-wrap' }),
  );

  // Lista de cards-categoria
  const listaWrap = el('div', { class: 'pc-cat-lista', id: 'pc-cat-lista' });
  conteudo.append(listaWrap);

  // Render parcial das 3 areas que mudam
  atualizarParcialDoCerebro(detalhe, cerebro_id);
}

/* Atualiza so KPIs + chips de filtro + lista de cards.
   NAO mexe no header (titulo, botao voltar) — evita flash. */
function atualizarParcialDoCerebro(detalhe, cerebro_id) {
  const pc = recomputarPlanoCounts(detalhe.plano);

  // KPI strip
  const statsWrap = document.getElementById('pc-cer-stats-wrap');
  if (statsWrap) {
    statsWrap.className = 'pc-cer-stats';
    statsWrap.innerHTML = '';
    statsWrap.append(
      stat('🟢', pc.rodando, 'rodando', '#22C55E'),
      stat('🟡', pc.em_construcao, 'em construção', '#F59E0B'),
      stat('🔵', pc.planejada, 'planejadas', '#3B82F6'),
      stat('⚫', pc.sem_coleta, 'sem coleta', '#94A3B8'),
    );
  }

  // Filtros
  const filtrosWrap = document.getElementById('pc-cer-filtros-wrap');
  if (filtrosWrap) {
    filtrosWrap.className = 'pc-filtros';
    filtrosWrap.innerHTML = '';
    // "Todas" agora conta só as aplicáveis (nao_aplicavel sai do default)
    filtrosWrap.append(
      filtroChip('todos', 'Todas', pc.total_aplicaveis),
      filtroChip('sem_coleta', '⚫ Sem coleta', pc.sem_coleta),
      filtroChip('planejada', '🔵 Planejadas', pc.planejada),
      filtroChip('em_construcao', '🟡 Em construção', pc.em_construcao),
      filtroChip('rodando', '🟢 Rodando', pc.rodando),
    );
    // Toggle "Mostrar não aplicáveis" — só aparece se houver alguma marcada
    if (pc.nao_aplicavel > 0) {
      const ativo = _mostrarNaoAplicaveis;
      // Visual destacado pra deixar OBVIO que dá pra reativar
      const corBg = ativo ? '#A1A1AA' : '#FEF3C7';
      const corBorda = ativo ? '#A1A1AA' : '#F59E0B';
      const corTexto = ativo ? '#fff' : '#92400E';
      filtrosWrap.append(el('button', {
        class: 'pc-filtro pc-filtro-toggle-naoap' + (ativo ? ' pc-filtro-ativo' : ''),
        style: `background:${corBg};border:1px solid ${corBorda};color:${corTexto};font-weight:600`,
        title: ativo
          ? 'Clica pra esconder essas categorias de novo'
          : `Clica pra ver as ${pc.nao_aplicavel} categoria${pc.nao_aplicavel === 1 ? '' : 's'} marcada${pc.nao_aplicavel === 1 ? '' : 's'} como "não se aplica" e reativar quando quiser`,
        onclick: () => {
          _mostrarNaoAplicaveis = !_mostrarNaoAplicaveis;
          // Filtro exclusivo: ao ativar, mostra SO as nao_aplicaveis.
          // Ao desativar, volta pra "Todas" (so as aplicaveis).
          _filtroStatus = _mostrarNaoAplicaveis ? 'nao_aplicavel' : 'todos';
          const det = _detalheCache.get(_cerebroAberto);
          if (det) atualizarParcialDoCerebro(det, _cerebroAberto);
        },
      }, ativo
          ? `👁 Mostrando SO as ${pc.nao_aplicavel} não-aplicáveis · clica pra voltar`
          : `🚫 ${pc.nao_aplicavel} marcada${pc.nao_aplicavel === 1 ? '' : 's'} como "não se aplica" · 👁 ver e reativar`));
    }
  }

  // Lista
  const listaWrap = document.getElementById('pc-cat-lista');
  if (listaWrap) renderListaCategorias(listaWrap, detalhe.plano, detalhe.integracoes_catalogo, cerebro_id);
}

function recomputarPlanoCounts(plano) {
  const c = { sem_coleta: 0, planejada: 0, em_construcao: 0, rodando: 0, pausada: 0, falhou: 0, nao_aplicavel: 0, total_aplicaveis: 0 };
  for (const p of (plano || [])) {
    c[p.status_automacao] = (c[p.status_automacao] || 0) + 1;
    if (p.status_automacao !== 'nao_aplicavel') c.total_aplicaveis++;
  }
  return c;
}

function stat(emoji, num, label, cor) {
  return el('div', { class: 'pc-stat' }, [
    el('div', { class: 'pc-stat-num', style: `color:${cor}` }, String(num)),
    el('div', { class: 'pc-stat-label' }, `${emoji} ${label}`),
  ]);
}

function filtroChip(slug, label, qtd) {
  const ativa = _filtroStatus === slug;
  return el('button', {
    class: 'pc-filtro' + (ativa ? ' pc-filtro-ativo' : '') + (qtd === 0 ? ' pc-filtro-zero' : ''),
    onclick: () => {
      _filtroStatus = slug;
      const det = _detalheCache.get(_cerebroAberto);
      if (det) atualizarParcialDoCerebro(det, _cerebroAberto);
    },
  }, `${label} · ${qtd}`);
}

function renderListaCategorias(wrap, plano, integracoes, cerebro_id) {
  wrap.innerHTML = '';
  // V3 (2026-06-17) — nao_aplicavel só aparece se toggle "mostrar não aplicáveis" estiver ON
  // ou se o usuário tiver explicitamente filtrado nesse status.
  const lista = (plano || []).filter(p => {
    if (p.status_automacao === 'nao_aplicavel' && !_mostrarNaoAplicaveis) return false;
    return _filtroStatus === 'todos' || p.status_automacao === _filtroStatus;
  });

  if (lista.length === 0) {
    wrap.append(el('div', { class: 'pc-empty' }, 'Nenhuma categoria nesse filtro.'));
    return;
  }

  // Ordena: sem_coleta primeiro, nao_aplicavel por último, resto pela ordem do catalogo
  const ordemStatus = { sem_coleta: 0, planejada: 1, em_construcao: 2, falhou: 3, pausada: 4, rodando: 5, nao_aplicavel: 9 };
  const sorted = [...lista].sort((a, b) => {
    const sa = ordemStatus[a.status_automacao] ?? 9;
    const sb = ordemStatus[b.status_automacao] ?? 9;
    if (sa !== sb) return sa - sb;
    return (a.categoria_ordem || 0) - (b.categoria_ordem || 0);
  });

  for (const p of sorted) wrap.append(cardCategoria(p, integracoes, cerebro_id));
}

function cardCategoria(p, integracoes, cerebro_id) {
  const meta = STATUS_META[p.status_automacao] || STATUS_META.sem_coleta;
  const triggerMeta = TRIGGER_META[p.trigger_tipo] || TRIGGER_META.manual;
  const fresh = freshnessTexto(p.ultima_fonte_em);
  const pendencias = Number(p.pendencias_count || 0);

  // V3 (2026-06-17) — card minimal pra status nao_aplicavel
  if (p.status_automacao === 'nao_aplicavel') {
    const cardNa = el('div', {
      class: 'pc-cat-card pc-cat-card-naoaplicavel',
      style: `border-left-color:${meta.cor};opacity:.65`,
    });
    cardNa.append(el('div', { class: 'pc-cat-l1', style: 'opacity:.85' }, [
      el('span', { class: 'pc-cat-emoji' }, p.categoria_emoji || '📦'),
      el('div', { class: 'pc-cat-info' }, [
        el('div', { class: 'pc-cat-nome' }, p.categoria_nome),
        el('div', { class: 'pc-cat-desc', style: 'font-style:italic' }, 'Marcada como "não se aplica" a esse produto'),
      ]),
      el('div', { class: 'pc-cat-pills' }, [
        el('span', { class: 'pc-status-pill', style: `background:${meta.cor}` }, `${meta.emoji} ${meta.label}`),
      ]),
    ]));
    cardNa.append(el('div', { class: 'pc-cat-acoes' }, [
      el('button', {
        class: 'pc-btn-secondary',
        onclick: (e) => marcarAplicavel(p, cerebro_id, e.currentTarget),
        title: 'Reativa essa categoria — volta pra "sem coleta" e pode ser configurada normalmente',
      }, '↩ Aplicar a esse produto'),
    ]));
    return cardNa;
  }

  const card = el('div', {
    class: 'pc-cat-card' + (pendencias > 0 ? ' pc-cat-card-pendencias' : ''),
    style: `border-left-color:${meta.cor}`,
  });

  // Linha 1: emoji + count + nome + status pill
  card.append(el('div', { class: 'pc-cat-l1' }, [
    el('span', { class: 'pc-cat-emoji' }, p.categoria_emoji || '📦'),
    el('div', { class: 'pc-cat-count-wrap' }, [
      el('div', { class: 'pc-cat-count' }, p.qtd_atual > 0 ? String(p.qtd_atual) : '—'),
      el('div', { class: 'pc-cat-count-label' }, p.qtd_atual === 1 ? 'item' : 'itens'),
    ]),
    el('div', { class: 'pc-cat-info' }, [
      el('div', { class: 'pc-cat-nome' }, p.categoria_nome),
      el('div', { class: 'pc-cat-desc' }, p.categoria_descricao || ''),
    ]),
    el('div', { class: 'pc-cat-pills' }, [
      el('span', { class: 'pc-trigger-pill', title: triggerMeta.descricao }, `${triggerMeta.emoji} ${triggerMeta.label}`),
      el('span', { class: 'pc-status-pill', style: `background:${meta.cor}` }, `${meta.emoji} ${meta.label}`),
    ]),
  ]));

  // Badge de pendências (se tiver)
  if (pendencias > 0) {
    card.append(el('div', { class: 'pc-cat-badge-pendencia' }, [
      el('span', { class: 'pc-pend-icon' }, '🔔'),
      el('strong', null, `${pendencias} arquivo${pendencias > 1 ? 's' : ''} aguardando processamento`),
      el('button', {
        class: 'pc-btn-mini-acao',
        onclick: (e) => disparararJob(p, cerebro_id, e.currentTarget),
      }, '▶ Processar agora'),
    ]));
  }

  // Linha 2: origem · freshness · schedule
  const meta2 = [];
  meta2.push(['🔌 Origem', p.origem_configurada || '—']);
  meta2.push(['📅 Atualização', fresh.texto, fresh.cor]);
  meta2.push(['⏰ Schedule', p.schedule_descricao || '—']);
  if (p.ferramenta) meta2.push(['🛠 Ferramenta', p.ferramenta]);
  if (p.responsavel) meta2.push(['👤 Responsável', p.responsavel]);
  if (p.ultima_execucao) {
    const dataExec = freshnessTexto(p.ultima_execucao);
    const statusRunCor = p.ultimo_status_run === 'falha' ? '#EF4444' : (p.ultimo_status_run === 'ok' ? '#22C55E' : '#94A3B8');
    meta2.push(['▶️ Última execução', `${dataExec.texto} · ${p.ultimo_status_run || '—'}`, statusRunCor]);
  }

  card.append(el('div', { class: 'pc-cat-l2' }, meta2.map(([k, v, cor]) =>
    el('span', { class: 'pc-cat-attr' }, [
      el('span', { class: 'pc-cat-attr-k' }, k),
      el('span', { class: 'pc-cat-attr-v', style: cor ? `color:${cor};font-weight:600` : '' }, v),
    ])
  )));

  // Notas (se tiver)
  if (p.notas) {
    card.append(el('div', { class: 'pc-cat-notas' }, '📝 ' + p.notas));
  }

  // Linha 3: ações
  // Regra de UX (2026-06-16): se categoria roda automatica (evento_auto, evento_avisar, webhook)
  // E status = 'rodando', NAO mostrar "Rodar agora" — confunde. Sistema cuida sozinho.
  // Mostrar "Rodar agora" SO quando:
  //   - trigger manual (sempre util)
  //   - trigger cron mas usuario quer forçar antes do horario
  //   - status em_construcao/falhou/pausada (precisa intervencao)
  //   - status sem_coleta com origem configurada (pra ativar pela 1a vez)
  const automatico = ['evento_auto', 'evento_avisar', 'webhook'].includes(p.trigger_tipo);
  const statusRodando = p.status_automacao === 'rodando';
  const temOrigem = (p.origem_pasta_drive_id && p.origem_pasta_drive_id.length > 0)
    || (p.origem_configurada && p.origem_configurada.length > 0);
  const precisaIntervir = ['em_construcao', 'falhou', 'pausada'].includes(p.status_automacao);

  const acoes = [];

  if (automatico && statusRodando) {
    // Estado limpo: roda sozinho. Mostra texto explicativo + opcao secundaria de forçar.
    const txtExplicacao = p.trigger_tipo === 'webhook'
      ? '✓ Recebendo dados em tempo real'
      : '✓ Detector roda a cada 10min sozinho';
    acoes.push(el('span', { class: 'pc-status-auto' }, txtExplicacao));
    if (temOrigem && p.trigger_tipo !== 'webhook') {
      acoes.push(el('button', {
        class: 'pc-btn-secondary',
        onclick: (e) => disparararJob(p, cerebro_id, e.currentTarget),
        title: 'Antecipar — força rodar agora em vez de esperar o detector',
      }, '⏩ Antecipar'));
    }
  } else if (temOrigem && (precisaIntervir || p.trigger_tipo === 'manual' || p.trigger_tipo === 'cron')) {
    acoes.push(el('button', {
      class: 'pc-btn-primary',
      onclick: (e) => disparararJob(p, cerebro_id, e.currentTarget),
      title: 'Roda o pipeline agora — lê pasta Drive, transcreve novos, salva no cérebro',
    }, '▶ Rodar agora'));
  } else {
    acoes.push(el('button', {
      class: 'pc-btn-primary',
      onclick: (e) => avancarStatus(p.plano_id, cerebro_id, e.currentTarget),
      title: 'Avançar pra próximo estágio do ciclo',
    }, meta.proximoLabel));
  }

  // Botao extra: aulas ao vivo aceitam URL de YouTube manualmente (1 video por vez)
  if (p.categoria_slug === 'transcricoes_aula_ao_vivo') {
    acoes.push(el('button', {
      class: 'pc-btn-secondary',
      onclick: () => abrirModalAulaYoutube(p, cerebro_id),
      title: 'Cola uma URL do YouTube — Apify pega o transcript + metadata, salva como fonte e vetoriza',
    }, '▶ Adicionar aula via YouTube'));
  }

  // Botao extra: pesquisas tem webhook YA Forms — Andre cola URL no YA Forms
  // e respostas chegam em tempo real, vetorizadas automaticamente
  const aceitaPesquisa = (p.categoria_tipos_fonte || []).includes('resposta_pesquisa')
    || p.categoria_slug === 'pesquisas';
  if (aceitaPesquisa) {
    acoes.push(el('button', {
      class: 'pc-btn-secondary',
      onclick: () => abrirModalWebhookPesquisa(p, cerebro_id),
      title: 'Mostra a URL do webhook YA Forms (cola lá pra respostas entrarem em tempo real)',
    }, '📋 URL webhook YA Forms'));
  }

  acoes.push(el('button', {
    class: 'pc-btn-secondary',
    onclick: () => abrirModalEditar(p, integracoes, cerebro_id),
    title: 'Editar tudo — origem, pasta Drive, trigger, status, schedule',
  }, '📝 Editar plano'));

  card.append(el('div', { class: 'pc-cat-acoes' }, acoes));

  return card;
}

async function disparararJob(p, cerebro_id, btnEl) {
  if (!p.origem_pasta_drive_id) {
    alert('Categoria sem origem_pasta_drive_id configurada. Edita o plano e adiciona a pasta primeiro.');
    return;
  }
  const labelOriginal = btnEl ? btnEl.textContent : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = '⏳ enfileirando...';
    btnEl.style.opacity = '0.6';
  }
  try {
    const r = await callEdge('tool-disparar-job-categoria', {
      method: 'POST',
      body: { cerebro_id, categoria_slug: p.categoria_slug },
    });
    if (!r.ok) throw new Error(r.erro);
    if (btnEl) {
      btnEl.textContent = '✓ enfileirado — worker processa em até 15s';
      btnEl.style.background = '#22C55E';
    }
    // Recarrega snapshot em ~20s pra mostrar nova ultima_execucao
    setTimeout(() => recarregarCerebroSilencioso(cerebro_id), 25_000);
  } catch (e) {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = labelOriginal;
      btnEl.style.opacity = '';
    }
    alert('Erro ao disparar job: ' + e.message);
  }
}

async function recarregarCerebroSilencioso(cerebro_id) {
  _detalheCache.delete(cerebro_id);
  try { _snapshot = await callEdge('tool-plano-cerebros-snapshot'); } catch {}
  try {
    const detalhe = await callEdge('tool-plano-cerebros-snapshot', { query: `?cerebro_id=${cerebro_id}` });
    if (detalhe.ok) {
      _detalheCache.set(cerebro_id, detalhe);
      if (_cerebroAberto === cerebro_id) atualizarParcialDoCerebro(detalhe, cerebro_id);
    }
  } catch {}
}

function voltarParaGrid() {
  _cerebroAberto = null;
  _filtroStatus = 'todos';
  const conteudo = document.getElementById('pc-conteudo');
  conteudo.innerHTML = '';
  renderAbaAtiva(conteudo);
}

// ============================================================
// MODAL — editar plano
// ============================================================
function abrirModalEditar(plano, integracoes, cerebro_id) {
  const modal = document.getElementById('pc-modal');
  modal.innerHTML = '';
  modal.classList.remove('pc-hidden');

  const inner = el('div', { class: 'pc-modal-inner', style: 'max-width:600px' });
  modal.append(inner);

  inner.append(
    el('div', { class: 'pc-modal-head' }, [
      el('h2', null, `⚙️ ${plano.categoria_emoji} ${plano.categoria_nome}`),
      el('button', { class: 'pc-close', onclick: fecharModal }, '×'),
    ]),
    el('p', { class: 'pc-modal-sub' }, plano.categoria_descricao || ''),
  );

  const body = el('div', { class: 'pc-modal-body' });
  inner.append(body);

  body.append(
    el('div', { class: 'pc-form-row' }, [
      el('div', { class: 'pc-form-campo' }, [
        el('label', null, 'Status atual'),
        seletorStatus(plano.status_automacao),
      ]),
      el('div', { class: 'pc-form-campo' }, [
        el('label', null, 'Trigger (como dispara)'),
        seletorTrigger(plano.trigger_tipo || 'manual'),
      ]),
    ]),
    el('div', { class: 'pc-form-campo' }, [
      el('label', null, 'Responsável'),
      el('input', { id: 'pc-fld-responsavel', type: 'text', class: 'pc-input', value: plano.responsavel || '', placeholder: 'Quem cuida disso' }),
    ]),
    el('div', { class: 'pc-form-campo' }, [
      el('label', null, 'Origem (de onde vem)'),
      el('input', { id: 'pc-fld-origem', type: 'text', class: 'pc-input', value: plano.origem_configurada || '', placeholder: 'Ex: Hotmart Members API, Google Drive pasta X, YA Forms' }),
    ]),
    el('div', { class: 'pc-form-campo' }, [
      el('label', null, 'Pasta Drive monitorada (ID — pra trigger evento_*)'),
      el('div', { style: 'display:flex;gap:.5rem;align-items:stretch' }, [
        el('input', { id: 'pc-fld-pasta-drive', type: 'text', class: 'pc-input', style: 'flex:1', value: plano.origem_pasta_drive_id || '', placeholder: 'Cole o ID OU clica em Escolher pasta' }),
        el('button', {
          type: 'button',
          class: 'pc-btn-secondary',
          style: 'white-space:nowrap',
          onclick: () => abrirBrowserPastaDrive(),
          title: 'Navega pelo Drive e escolhe a pasta visualmente',
        }, '📂 Escolher pasta'),
      ]),
      el('small', { id: 'pc-fld-pasta-drive-nome', style: 'color:#64748B;display:block;margin-top:.25rem' }, plano.origem_pasta_drive_id ? '(pasta atual — clica em Escolher pra trocar)' : 'Detector híbrido monitora a cada 10min se trigger for evento_*'),
    ]),
    el('div', { class: 'pc-form-row' }, [
      el('div', { class: 'pc-form-campo' }, [
        el('label', null, 'Schedule (descrição)'),
        el('input', { id: 'pc-fld-schedule-desc', type: 'text', class: 'pc-input', value: plano.schedule_descricao || '', placeholder: 'Ex: todo dia 04h BRT' }),
      ]),
      el('div', { class: 'pc-form-campo' }, [
        el('label', null, 'Cron expression (opcional)'),
        el('input', { id: 'pc-fld-schedule-cron', type: 'text', class: 'pc-input', value: plano.schedule_cron || '', placeholder: '0 4 * * *' }),
      ]),
    ]),
    el('div', { class: 'pc-form-campo' }, [
      el('label', null, 'Ferramenta de automação'),
      el('input', { id: 'pc-fld-ferramenta', type: 'text', class: 'pc-input', value: plano.ferramenta || '', placeholder: 'Ex: Edge tool-ingerir-aulas + cron pg' }),
    ]),
    el('div', { class: 'pc-form-campo' }, [
      el('label', null, 'Notas (decisões da reunião)'),
      el('textarea', { id: 'pc-fld-notas', class: 'pc-input', rows: 3, placeholder: 'Ex: decidimos atacar esta primeiro porque...' }, plano.notas || ''),
    ]),
  );

  inner.append(el('div', { class: 'pc-form-acoes', style: 'display:flex;gap:.5rem;align-items:center' }, [
    // Botão "Não se aplica" — disponível em QUALQUER categoria, vira atalho universal.
    // Não aparece quando já é nao_aplicavel (nesse caso, fechar e usar "↩ Aplicar" do card).
    plano.status_automacao !== 'nao_aplicavel'
      ? el('button', {
          class: 'pc-btn-secondary',
          style: 'margin-right:auto;color:#A1A1AA',
          onclick: () => marcarNaoAplicavel(plano.plano_id, cerebro_id),
          title: 'Esconde essa categoria deste cérebro — útil quando o produto não tem essa fonte (ex: produto sem WhatsApp, sem Discord, etc). Reversível.',
        }, '🚫 Não se aplica a esse produto')
      : null,
    el('button', { class: 'pc-btn-cancel', onclick: fecharModal }, 'Cancelar'),
    el('button', { class: 'pc-btn-primary', onclick: () => salvarPlano(plano.plano_id, cerebro_id) }, 'Salvar'),
  ]));
}

function seletorStatus(atual) {
  const sel = el('select', { id: 'pc-fld-status', class: 'pc-input' });
  for (const k of ['sem_coleta', 'planejada', 'em_construcao', 'rodando', 'pausada', 'falhou']) {
    const meta = STATUS_META[k];
    const opt = el('option', { value: k }, `${meta.emoji} ${meta.label}`);
    if (k === atual) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}

function seletorTrigger(atual) {
  const sel = el('select', { id: 'pc-fld-trigger', class: 'pc-input' });
  for (const k of ['manual', 'cron', 'evento_avisar', 'evento_auto']) {
    const meta = TRIGGER_META[k];
    const opt = el('option', { value: k }, `${meta.emoji} ${meta.label} — ${meta.descricao}`);
    if (k === atual) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}

function fecharModal() {
  const modal = document.getElementById('pc-modal');
  if (modal) { modal.classList.add('pc-hidden'); modal.innerHTML = ''; }
}

// ============================================================
// MODAL — Adicionar aula via YouTube (1 URL por vez)
// Chama server-cli local via ngrok. Apify pega transcript +
// metadata, salva como cerebro_fonte e vetoriza.
// ============================================================
const SERVER_CLI_BASE = 'https://almost-pawing-urban.ngrok-free.dev';

function abrirModalAulaYoutube(plano, cerebro_id) {
  const modal = document.getElementById('pc-modal');
  modal.innerHTML = '';
  modal.classList.remove('pc-hidden');

  const inner = el('div', { class: 'pc-modal-inner', style: 'max-width:560px' });
  modal.append(inner);

  inner.append(
    el('div', { class: 'pc-modal-head' }, [
      el('h2', null, '▶ Adicionar aula via YouTube'),
      el('button', { class: 'pc-close', onclick: fecharModal }, '×'),
    ]),
    el('p', { class: 'pc-modal-sub' }, 'Cola a URL de UM vídeo do YouTube. Apify pega o transcript em ~10s, salva no cérebro como transcrição de aula e vetoriza pro RAG.'),
  );

  const body = el('div', { class: 'pc-modal-body' });
  inner.append(body);

  const inputUrl = el('input', {
    id: 'pc-fld-yt-url',
    type: 'url',
    placeholder: 'https://www.youtube.com/watch?v=...',
    style: 'width:100%;padding:10px 12px;border:1px solid #CBD5E1;border-radius:6px;font-size:14px',
  });

  body.append(
    el('label', { style: 'display:block;font-weight:600;margin-bottom:6px' }, 'URL do vídeo'),
    inputUrl,
    el('div', {
      style: 'margin-top:10px;font-size:12px;color:#64748B;line-height:1.5',
    }, 'Aceita youtube.com/watch?v=..., youtu.be/... e youtube.com/shorts/.... 1 URL = 1 vídeo (sem playlist em lote).'),
  );

  const statusBox = el('div', { id: 'pc-yt-status', style: 'margin-top:14px;font-size:13px' });
  body.append(statusBox);

  inner.append(el('div', { class: 'pc-modal-foot' }, [
    el('button', { class: 'pc-btn-secondary', onclick: fecharModal }, 'Cancelar'),
    el('button', {
      id: 'pc-btn-yt-processar',
      class: 'pc-btn-primary',
      onclick: () => processarAulaYoutube(plano, cerebro_id),
    }, '▶ Processar'),
  ]));

  setTimeout(() => inputUrl.focus(), 50);
}

async function processarAulaYoutube(plano, cerebro_id) {
  const url = document.getElementById('pc-fld-yt-url')?.value?.trim();
  const btn = document.getElementById('pc-btn-yt-processar');
  const statusBox = document.getElementById('pc-yt-status');
  if (!url) {
    statusBox.innerHTML = '<span style="color:#EF4444">Cola uma URL primeiro.</span>';
    return;
  }
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    statusBox.innerHTML = '<span style="color:#EF4444">URL não parece YouTube. Confere e tenta de novo.</span>';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Apify pegando transcript...';
  btn.style.opacity = '0.6';
  statusBox.innerHTML = '<span style="color:#64748B">📡 Chamando Apify → baixando transcript + metadata...</span>';

  try {
    const t0 = Date.now();
    const r = await fetch(SERVER_CLI_BASE + '/api/cerebro/processar-aula-youtube', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify({
        cerebro_id,
        categoria_slug: plano.categoria_slug,
        url,
      }),
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    const j = await r.json().catch(() => ({}));

    if (!r.ok || !j.ok) {
      const msg = j.error || j.erro || `HTTP ${r.status}`;
      statusBox.innerHTML = `<span style="color:#EF4444">❌ Falhou: ${escapeHtml(msg)}</span>`;
      btn.disabled = false;
      btn.textContent = '▶ Processar';
      btn.style.opacity = '';
      return;
    }

    if (j.ja_existia) {
      statusBox.innerHTML = `<span style="color:#F59E0B">⚠ Vídeo já está no cérebro (fonte ${j.fonte_id?.slice(0, 8)}...). Nada a fazer.</span>`;
      btn.textContent = '✓ Já existia';
      btn.style.background = '#F59E0B';
      setTimeout(() => { fecharModal(); recarregarCerebroSilencioso(cerebro_id); }, 1800);
      return;
    }

    const min = Math.floor((j.duracao_segundos || 0) / 60);
    const linhas = [
      `<div style="color:#22C55E;font-weight:600;margin-bottom:6px">✓ Aula processada em ${dur}s</div>`,
      `<div><strong>Título:</strong> ${escapeHtml(j.titulo || '—')}</div>`,
      j.canal ? `<div><strong>Canal:</strong> ${escapeHtml(j.canal)}</div>` : '',
      `<div><strong>Duração:</strong> ${min ? min + 'min' : '—'}</div>`,
      `<div><strong>Transcript:</strong> ${(j.transcript_chars || 0).toLocaleString('pt-BR')} chars</div>`,
      `<div><strong>Vetorizado:</strong> ${j.vetorizado ? '✓ sim — ' + j.chunks + ' chunks' : '⚠ pendente'}</div>`,
    ].filter(Boolean).join('');
    statusBox.innerHTML = linhas;
    btn.textContent = '✓ Pronto';
    btn.style.background = '#22C55E';
    setTimeout(() => { fecharModal(); recarregarCerebroSilencioso(cerebro_id); }, 2500);
  } catch (e) {
    statusBox.innerHTML = `<span style="color:#EF4444">❌ Server-cli local não respondeu. PC ligado? Ngrok rodando?<br><small>${escapeHtml(e.message || String(e))}</small></span>`;
    btn.disabled = false;
    btn.textContent = '▶ Processar';
    btn.style.opacity = '';
  }
}

// ============================================================
// MODAL — URL do webhook YA Forms pra pesquisas
// Mostra URL pronta, botao copiar, e ativa automacao no banco
// quando o usuario confirma que colou no YA Forms.
// ============================================================
function abrirModalWebhookPesquisa(plano, cerebro_id) {
  const det = _detalheCache.get(cerebro_id);
  const produtoSlug = det?.cerebro?.produto_slug;
  if (!produtoSlug) {
    alert('Nao consegui descobrir o slug do produto. Recarrega a pagina.');
    return;
  }

  const url = `${SB_URL}/functions/v1/webhook-cerebro?produto=${encodeURIComponent(produtoSlug)}&categoria=${encodeURIComponent(plano.categoria_slug)}`;
  const jaAtivo = plano.status_automacao === 'rodando' && plano.trigger_tipo === 'webhook';

  const modal = document.getElementById('pc-modal');
  modal.innerHTML = '';
  modal.classList.remove('pc-hidden');

  const inner = el('div', { class: 'pc-modal-inner', style: 'max-width:600px' });
  modal.append(inner);

  inner.append(
    el('div', { class: 'pc-modal-head' }, [
      el('h2', null, '📋 URL do webhook YA Forms'),
      el('button', { class: 'pc-close', onclick: fecharModal }, '×'),
    ]),
    el('p', { class: 'pc-modal-sub' },
      `Cola essa URL no campo "webhook" do formulario YA Forms do ${det.cerebro.produto_nome}. Cada resposta nova vai virar uma fonte vetorizada no cerebro em tempo real.`),
  );

  const body = el('div', { class: 'pc-modal-body' });
  inner.append(body);

  body.append(
    el('label', { style: 'display:block;font-weight:600;margin-bottom:6px;font-size:.875rem' }, 'URL do webhook'),
    el('div', { style: 'display:flex;gap:.5rem;align-items:stretch' }, [
      el('input', {
        id: 'pc-fld-webhook-url',
        type: 'text',
        readonly: 'readonly',
        value: url,
        style: 'flex:1;padding:10px 12px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;font-family:monospace;background:#F8FAFC;color:#1E293B',
      }),
      el('button', {
        id: 'pc-btn-copiar-webhook',
        class: 'pc-btn-primary',
        style: 'white-space:nowrap',
        onclick: async (e) => {
          try {
            await navigator.clipboard.writeText(url);
            e.currentTarget.textContent = '✓ Copiado';
            e.currentTarget.style.background = '#22C55E';
            setTimeout(() => {
              e.currentTarget.textContent = '📋 Copiar';
              e.currentTarget.style.background = '';
            }, 1800);
          } catch {
            // fallback: seleciona o input
            document.getElementById('pc-fld-webhook-url').select();
            alert('Pressiona Ctrl+C pra copiar');
          }
        },
      }, '📋 Copiar'),
    ]),
    el('div', { style: 'margin-top:1rem;padding:.75rem;background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;font-size:.8125rem;color:#92400E;line-height:1.5' }, [
      el('strong', null, '⚠ Importante: '),
      'Cada produto tem perguntas diferentes. O webhook eh generico — ele aceita qualquer estrutura. ',
      'A IA vai extrair os campos (nome, idade, dor, nicho, etc.) automaticamente quando a resposta chegar.',
    ]),
    jaAtivo
      ? el('div', { style: 'margin-top:1rem;padding:.75rem;background:rgba(34,197,94,0.1);border:1px solid #22C55E;border-radius:6px;font-size:.8125rem;color:#15803D' },
          '✓ Esta categoria ja esta ativa como webhook. Pode colar a URL no YA Forms — respostas vao entrar em tempo real.')
      : el('div', { style: 'margin-top:1rem;padding:.75rem;background:rgba(59,130,246,0.08);border:1px solid #3B82F6;border-radius:6px;font-size:.8125rem;color:#1E40AF;line-height:1.5' }, [
          el('strong', null, '🚀 Quer ativar agora? '),
          'Clica no botao abaixo. A categoria vai pra status "rodando" + trigger "webhook". Quando o YA Forms enviar a primeira resposta, voce ja recebe vetorizado.',
        ]),
  );

  const acoes = [];
  if (!jaAtivo) {
    acoes.push(el('button', {
      class: 'pc-btn-primary',
      onclick: () => ativarWebhookPesquisa(plano.plano_id, cerebro_id),
      style: 'background:#22C55E;border-color:#22C55E',
    }, '🚀 Ativar webhook (status=rodando)'));
  }
  acoes.push(el('button', { class: 'pc-btn-secondary', onclick: fecharModal }, 'Fechar'));
  inner.append(el('div', { class: 'pc-modal-foot' }, acoes));
}

async function ativarWebhookPesquisa(plano_id, cerebro_id) {
  const det = _detalheCache.get(cerebro_id);
  if (!det) return;
  const p = det.plano.find(x => x.plano_id === plano_id);
  if (!p) return;

  const statusAntes = p.status_automacao;
  const triggerAntes = p.trigger_tipo;
  const schedAntes = p.schedule_descricao;

  // Otimistic
  p.status_automacao = 'rodando';
  p.trigger_tipo = 'webhook';
  p.schedule_descricao = 'tempo real (webhook YA Forms)';
  fecharModal();
  atualizarParcialDoCerebro(det, cerebro_id);

  try {
    const r = await callEdge('tool-cerebro-plano-categoria', {
      method: 'POST',
      body: {
        acao: 'editar',
        plano_id,
        status_automacao: 'rodando',
        trigger_tipo: 'webhook',
        schedule_descricao: 'tempo real (webhook YA Forms)',
      },
    });
    if (!r.ok) throw new Error(r.erro);
    callEdge('tool-plano-cerebros-snapshot').then(s => { if (s.ok) _snapshot = s; });
  } catch (e) {
    p.status_automacao = statusAntes;
    p.trigger_tipo = triggerAntes;
    p.schedule_descricao = schedAntes;
    atualizarParcialDoCerebro(det, cerebro_id);
    alert('Erro ao ativar webhook: ' + e.message);
  }
}

// ============================================================
// MODAL 2 — Browser hierarquico de pastas Drive
// Chama server-cli /api/drive/listar-pastas via ngrok.
// Estado interno: stack de breadcrumb (arrays de {id, nome}).
// Click em pasta = entra (push). Botao Voltar = pop.
// "Usar esta pasta" = preenche pc-fld-pasta-drive e fecha.
// ============================================================
let _driveBrowserStack = []; // [{id, nome}] do MyDrive ate o atual

function abrirBrowserPastaDrive() {
  _driveBrowserStack = []; // sempre comeca na raiz
  const modal = document.getElementById('pc-modal-2');
  modal.innerHTML = '';
  modal.classList.remove('pc-hidden');

  const inner = el('div', { class: 'pc-modal-inner', style: 'max-width:640px;max-height:80vh;display:flex;flex-direction:column' });
  modal.append(inner);

  inner.append(
    el('div', { class: 'pc-modal-head' }, [
      el('h2', null, '📂 Escolher pasta do Drive'),
      el('button', { class: 'pc-close', onclick: fecharModal2 }, '×'),
    ]),
    el('p', { class: 'pc-modal-sub' },
      'Navega pelas pastas do seu Drive. Clica em uma pasta pra entrar. Quando achar a pasta certa, clica em "Usar esta pasta".'),
  );

  // Breadcrumb (preenchido dinamicamente)
  inner.append(el('div', { id: 'pc-drive-breadcrumb', style: 'padding:.5rem 1rem;border-bottom:1px solid #E2E8F0;font-size:.875rem;color:#475569;background:#F8FAFC' }));

  // Lista (rolavel)
  inner.append(el('div', { id: 'pc-drive-list', style: 'flex:1;overflow-y:auto;padding:.5rem' }));

  // Footer
  inner.append(el('div', { class: 'pc-modal-foot', style: 'border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;gap:.5rem' }, [
    el('span', { id: 'pc-drive-status', style: 'font-size:.8125rem;color:#64748B' }, ''),
    el('div', { style: 'display:flex;gap:.5rem' }, [
      el('button', { class: 'pc-btn-secondary', onclick: fecharModal2 }, 'Cancelar'),
      el('button', { id: 'pc-btn-usar-pasta', class: 'pc-btn-primary', onclick: () => usarPastaAtual(), disabled: 'disabled', style: 'opacity:.5' }, 'Usar esta pasta'),
    ]),
  ]));

  carregarPastas(null);
}

const SERVER_CLI_URL = 'https://almost-pawing-urban.ngrok-free.dev';

async function carregarPastas(parent_id) {
  const list = document.getElementById('pc-drive-list');
  const status = document.getElementById('pc-drive-status');
  const btnUsar = document.getElementById('pc-btn-usar-pasta');
  if (!list) return;

  list.innerHTML = '<div style="padding:2rem;text-align:center;color:#64748B">⏳ Carregando pastas…</div>';
  status.textContent = '';
  btnUsar.disabled = true;
  btnUsar.style.opacity = '.5';

  try {
    const r = await fetch(SERVER_CLI_URL + '/api/drive/listar-pastas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({ parent_id }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'erro desconhecido');

    list.innerHTML = '';
    renderBreadcrumb();

    if (j.pastas.length === 0) {
      list.append(el('div', { style: 'padding:2rem;text-align:center;color:#64748B;font-style:italic' }, '(pasta vazia — sem subpastas)'));
    } else {
      for (const p of j.pastas) {
        const row = el('div', {
          class: 'pc-drive-row',
          style: 'padding:.6rem .75rem;border-bottom:1px solid #F1F5F9;cursor:pointer;display:flex;align-items:center;gap:.6rem;font-size:.875rem;transition:background .12s',
          onmouseenter: (e) => e.currentTarget.style.background = '#EFF6FF',
          onmouseleave: (e) => e.currentTarget.style.background = '',
          onclick: () => {
            _driveBrowserStack.push({ id: p.id, nome: p.nome });
            carregarPastas(p.id);
          },
        }, [
          el('span', { style: 'font-size:1.125rem' }, '📁'),
          el('span', { style: 'flex:1;color:#0F172A;font-weight:500' }, p.nome),
          el('span', { style: 'color:#94A3B8;font-size:.75rem' }, '›'),
        ]);
        list.append(row);
      }
    }

    // Habilita "Usar esta pasta" se estamos DENTRO de uma pasta (nao na raiz)
    if (_driveBrowserStack.length > 0) {
      btnUsar.disabled = false;
      btnUsar.style.opacity = '1';
      const atual = _driveBrowserStack[_driveBrowserStack.length - 1];
      status.textContent = `Pasta atual: ${atual.nome}`;
    } else {
      status.textContent = 'Navegue ate a pasta desejada e clica em "Usar esta pasta".';
    }
  } catch (e) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:#EF4444">❌ ${escapeHtml(e.message)}<br><small>Server-cli local respondendo? Drive autorizado?</small></div>`;
  }
}

function renderBreadcrumb() {
  const bc = document.getElementById('pc-drive-breadcrumb');
  if (!bc) return;
  bc.innerHTML = '';

  // Raiz sempre
  const raiz = el('button', {
    style: 'background:none;border:none;color:#3B82F6;cursor:pointer;font-size:.875rem;text-decoration:underline;padding:0',
    onclick: () => { _driveBrowserStack = []; carregarPastas(null); },
  }, '🏠 MyDrive');
  bc.append(raiz);

  for (let i = 0; i < _driveBrowserStack.length; i++) {
    bc.append(el('span', { style: 'margin:0 .4rem;color:#94A3B8' }, '›'));
    const ehUltimo = i === _driveBrowserStack.length - 1;
    if (ehUltimo) {
      bc.append(el('span', { style: 'font-weight:600;color:#0F172A' }, _driveBrowserStack[i].nome));
    } else {
      const idx = i;
      bc.append(el('button', {
        style: 'background:none;border:none;color:#3B82F6;cursor:pointer;font-size:.875rem;text-decoration:underline;padding:0',
        onclick: () => {
          _driveBrowserStack = _driveBrowserStack.slice(0, idx + 1);
          carregarPastas(_driveBrowserStack[idx].id);
        },
      }, _driveBrowserStack[i].nome));
    }
  }
}

function usarPastaAtual() {
  if (_driveBrowserStack.length === 0) return;
  const atual = _driveBrowserStack[_driveBrowserStack.length - 1];
  // Caminho completo pra mostrar no small
  const caminho = _driveBrowserStack.map(s => s.nome).join(' / ');

  const inp = document.getElementById('pc-fld-pasta-drive');
  if (inp) inp.value = atual.id;
  const nome = document.getElementById('pc-fld-pasta-drive-nome');
  if (nome) nome.textContent = `✓ Pasta escolhida: ${caminho}`;
  fecharModal2();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function salvarPlano(plano_id, cerebro_id) {
  const val = (id) => document.getElementById(id)?.value.trim() || null;
  const novosCampos = {
    status_automacao:      val('pc-fld-status'),
    trigger_tipo:          val('pc-fld-trigger'),
    origem_configurada:    val('pc-fld-origem'),
    origem_pasta_drive_id: val('pc-fld-pasta-drive'),
    schedule_descricao:    val('pc-fld-schedule-desc'),
    schedule_cron:         val('pc-fld-schedule-cron'),
    ferramenta:            val('pc-fld-ferramenta'),
    responsavel:           val('pc-fld-responsavel'),
    notas:                 val('pc-fld-notas'),
  };

  // Otimistic local
  const det = _detalheCache.get(cerebro_id);
  const p = det ? det.plano.find(x => x.plano_id === plano_id) : null;
  const snapshotAntes = p ? { ...p } : null;
  if (p) Object.assign(p, novosCampos);

  fecharModal();
  if (det) atualizarParcialDoCerebro(det, cerebro_id);

  try {
    const r = await callEdge('tool-cerebro-plano-categoria', {
      method: 'POST',
      body: { acao: 'editar', plano_id, ...novosCampos },
    });
    if (!r.ok) throw new Error(r.erro);
    callEdge('tool-plano-cerebros-snapshot').then(s => { if (s.ok) _snapshot = s; });
  } catch (e) {
    if (snapshotAntes && p) {
      Object.assign(p, snapshotAntes);
      if (det) atualizarParcialDoCerebro(det, cerebro_id);
    }
    alert('Erro ao salvar: ' + e.message);
  }
}

/* Mapa de proximo status no client — espelha a RPC cerebro_plano_categoria_avancar
   no Postgres. Mantem em sync com schema-010. */
const PROXIMO_STATUS = {
  sem_coleta:    'planejada',
  planejada:     'em_construcao',
  em_construcao: 'rodando',
  rodando:       'pausada',
  pausada:       'rodando',
  falhou:        'rodando',
};

async function avancarStatus(plano_id, cerebro_id, btnEl) {
  const det = _detalheCache.get(cerebro_id);
  if (!det) return;
  const p = det.plano.find(x => x.plano_id === plano_id);
  if (!p) return;

  const statusAntes = p.status_automacao;
  const statusDepois = PROXIMO_STATUS[statusAntes] || statusAntes;

  // OTIMISTIC: atualiza local antes de chamar edge
  p.status_automacao = statusDepois;
  atualizarParcialDoCerebro(det, cerebro_id);

  try {
    const r = await callEdge('tool-cerebro-plano-categoria', {
      method: 'POST',
      body: { acao: 'avancar', plano_id },
    });
    if (!r.ok) throw new Error(r.erro);
    // Atualiza snapshot global (KPIs do grid) em background, sem flash
    callEdge('tool-plano-cerebros-snapshot').then(s => { if (s.ok) _snapshot = s; });
  } catch (e) {
    // Reverte
    p.status_automacao = statusAntes;
    atualizarParcialDoCerebro(det, cerebro_id);
    alert('Erro ao avançar status: ' + e.message);
  }
}

// ============================================================
// V3 (2026-06-17) — Marcar categoria como "não se aplica" / reativar
// ============================================================
// Usa tool-cerebro-plano-categoria acao=editar com status_automacao = 'nao_aplicavel' ou 'sem_coleta'.
// Otimistic update + confirmação no caso destrutivo de marcar.
// ============================================================
async function marcarNaoAplicavel(plano_id, cerebro_id) {
  const det = _detalheCache.get(cerebro_id);
  if (!det) return;
  const p = det.plano.find(x => x.plano_id === plano_id);
  if (!p) return;

  // Modal de confirmação no padrão do sistema (substitui confirm() nativo feio)
  const ok = await confirmarPcModal({
    titulo: '🚫 Marcar como "não se aplica"',
    mensagem: `Vai esconder a categoria <strong>${escapeHtml(p.categoria_nome)}</strong> desse cérebro.<br><br>É útil quando o produto não tem essa fonte (ex: produto sem WhatsApp, sem aulas gravadas).<br><br><strong>Pra reativar depois:</strong> clica no chip <strong>"🚫 Não se aplica · N (👁 mostrar)"</strong> que vai aparecer no topo dos filtros — daí os cards reaparecem com botão "↩ Aplicar a esse produto".`,
    confirmar_label: 'Sim, marcar como não se aplica',
    confirmar_cor: '#A1A1AA',
    cancelar_label: 'Cancelar',
  });
  if (!ok) return;

  const statusAntes = p.status_automacao;
  p.status_automacao = 'nao_aplicavel';
  fecharModal();
  atualizarParcialDoCerebro(det, cerebro_id);

  try {
    const r = await callEdge('tool-cerebro-plano-categoria', {
      method: 'POST',
      body: { acao: 'editar', plano_id, status_automacao: 'nao_aplicavel' },
    });
    if (!r.ok) throw new Error(r.erro);
    callEdge('tool-plano-cerebros-snapshot').then(s => { if (s.ok) _snapshot = s; });
  } catch (e) {
    p.status_automacao = statusAntes;
    atualizarParcialDoCerebro(det, cerebro_id);
    alert('Erro ao marcar como não se aplica: ' + e.message);
  }
}

// ============================================================
// V3 (2026-06-17) — Modal de confirmação no padrão pc-modal
// Substitui confirm() nativo. Retorna Promise<boolean>.
// ============================================================
function confirmarPcModal({ titulo, mensagem, confirmar_label = 'Confirmar', confirmar_cor = '#22C55E', cancelar_label = 'Cancelar' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('pc-modal');
    modal.innerHTML = '';
    modal.classList.remove('pc-hidden');

    const inner = el('div', { class: 'pc-modal-inner', style: 'max-width:480px' });
    modal.append(inner);

    const fechar = (valor) => {
      modal.classList.add('pc-hidden');
      modal.innerHTML = '';
      resolve(valor);
    };

    inner.append(
      el('div', { class: 'pc-modal-head' }, [
        el('h2', null, titulo),
        el('button', { class: 'pc-close', onclick: () => fechar(false) }, '×'),
      ]),
    );

    const body = el('div', { class: 'pc-modal-body', style: 'padding:1.25rem 1.5rem' });
    body.innerHTML = `<div style="line-height:1.6;color:var(--fg,#1E293B)">${mensagem}</div>`;
    inner.append(body);

    inner.append(el('div', { class: 'pc-modal-foot', style: 'display:flex;gap:.5rem;justify-content:flex-end;padding:1rem 1.5rem;border-top:1px solid var(--border-subtle,#E2E8F0)' }, [
      el('button', { class: 'pc-btn-secondary', onclick: () => fechar(false) }, cancelar_label),
      el('button', {
        class: 'pc-btn-primary',
        style: `background:${confirmar_cor};border-color:${confirmar_cor}`,
        onclick: () => fechar(true),
      }, confirmar_label),
    ]));
  });
}

async function marcarAplicavel(p, cerebro_id, btnEl) {
  const det = _detalheCache.get(cerebro_id);
  if (!det) return;
  const plano = det.plano.find(x => x.plano_id === p.plano_id);
  if (!plano) return;

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ reativando...'; }
  const statusAntes = plano.status_automacao;
  plano.status_automacao = 'sem_coleta';
  atualizarParcialDoCerebro(det, cerebro_id);

  try {
    const r = await callEdge('tool-cerebro-plano-categoria', {
      method: 'POST',
      body: { acao: 'editar', plano_id: p.plano_id, status_automacao: 'sem_coleta' },
    });
    if (!r.ok) throw new Error(r.erro);
    callEdge('tool-plano-cerebros-snapshot').then(s => { if (s.ok) _snapshot = s; });
  } catch (e) {
    plano.status_automacao = statusAntes;
    atualizarParcialDoCerebro(det, cerebro_id);
    alert('Erro ao reativar: ' + e.message);
  }
}

// ============================================================
// Modal: Nova categoria (cria global, auto-popula em todos cerebros)
// ============================================================
function abrirModalNovaCategoria(cerebro_id) {
  const modal = document.getElementById('pc-modal');
  modal.innerHTML = '';
  modal.classList.remove('pc-hidden');

  const inner = el('div', { class: 'pc-modal-inner', style: 'max-width:520px' });
  modal.append(inner);

  inner.append(
    el('div', { class: 'pc-modal-head' }, [
      el('h2', null, '+ Nova categoria de fonte'),
      el('button', { class: 'pc-close', onclick: fecharModal }, '×'),
    ]),
    el('p', { class: 'pc-modal-sub' },
      'Categoria nova aparece em TODOS os 10 cérebros (status sem_coleta). Use pra adicionar uma fonte que não pensamos no catálogo inicial (ex: "Comentários Instagram", "Notion docs").'),
  );

  const body = el('div', { class: 'pc-modal-body' });
  inner.append(body);

  body.append(
    el('div', { class: 'pc-form-row' }, [
      el('div', { class: 'pc-form-campo' }, [
        el('label', null, 'Nome *'),
        el('input', { id: 'pc-nc-nome', type: 'text', class: 'pc-input', placeholder: 'Ex: Comentários Instagram' }),
      ]),
      el('div', { class: 'pc-form-campo', style: 'max-width:90px' }, [
        el('label', null, 'Emoji'),
        el('input', { id: 'pc-nc-emoji', type: 'text', class: 'pc-input', placeholder: '📦', maxlength: 4 }),
      ]),
    ]),
    el('div', { class: 'pc-form-campo' }, [
      el('label', null, 'Descrição (o que entra aqui)'),
      el('textarea', { id: 'pc-nc-desc', class: 'pc-input', rows: 2, placeholder: 'Ex: Comentários raspados de posts do Instagram do produto' }),
    ]),
    el('div', { class: 'pc-form-campo' }, [
      el('label', null, 'Tipo de fonte no banco (opcional)'),
      el('input', { id: 'pc-nc-tipos', type: 'text', class: 'pc-input', placeholder: 'Ex: comentario_instagram (separar por vírgula se mais de 1)' }),
      el('small', { style: 'color:#64748B' }, 'Usado pra contar fontes vetorizadas. Se não souber, deixa em branco.'),
    ]),
  );

  inner.append(el('div', { class: 'pc-form-acoes' }, [
    el('button', { class: 'pc-btn-cancel', onclick: fecharModal }, 'Cancelar'),
    el('button', { class: 'pc-btn-primary', onclick: () => criarNovaCategoria(cerebro_id) }, 'Criar categoria'),
  ]));
}

async function criarNovaCategoria(cerebro_id) {
  const nome = document.getElementById('pc-nc-nome')?.value.trim() || '';
  const emoji = document.getElementById('pc-nc-emoji')?.value.trim() || '📦';
  const desc = document.getElementById('pc-nc-desc')?.value.trim() || null;
  const tiposRaw = document.getElementById('pc-nc-tipos')?.value.trim() || '';
  const tipos = tiposRaw ? tiposRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (!nome) { alert('Nome é obrigatório'); return; }

  try {
    const r = await callEdge('tool-cerebro-plano-categoria', {
      method: 'POST',
      body: { acao: 'criar_categoria', nome, emoji, descricao: desc, tipos_fonte: tipos },
    });
    if (!r.ok) throw new Error(r.erro);
    fecharModal();
    // Invalida cache de TODOS os cerebros (categoria nova entrou em todos)
    _detalheCache.clear();
    // Recarrega detalhe atual
    const conteudo = document.getElementById('pc-conteudo');
    conteudo.innerHTML = '';
    // Atualiza snapshot global em paralelo
    try { _snapshot = await callEdge('tool-plano-cerebros-snapshot'); } catch {}
    await renderTelaCerebro(conteudo, cerebro_id);
  } catch (e) { alert('Erro: ' + e.message); }
}

// ============================================================
// ABA 2 — Integrações
// ============================================================
function renderAbaIntegracoes(integracoes) {
  const wrap = el('div', { class: 'pc-int-wrap' });
  wrap.append(el('h2', { class: 'pc-section-title' }, `🔌 Mapa de Integrações (${(integracoes || []).length})`));
  wrap.append(el('p', { class: 'pc-int-sub' },
    'Inventário das integrações disponíveis. Status mostra apenas o verificável no cofre. (Aba será revisada em breve.)'));

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
  const ehGoogle = ['google-drive', 'google-gmail', 'google-calendar'].includes(i.slug);
  const contas = i.contas_conectadas || [];

  const card = el('div', { class: 'pc-int-card' });

  card.append(el('div', { class: 'pc-int-card-head' }, [
    el('span', { class: 'pc-emoji', style: 'font-size:1.7rem' }, i.emoji || '🔌'),
    el('div', null, [
      el('div', { class: 'pc-int-nome' }, i.nome),
      el('div', { class: 'pc-int-slug' }, i.slug),
    ]),
    el('div', { class: 'pc-int-status' },
      i.cofre_ok
        ? el('span', { class: 'pc-int-ok', title: ehGoogle ? `${contas.length} conta(s) conectada(s)` : 'Cofre OK' }, '✅ pronta')
        : el('span', { class: 'pc-int-ko', title: ehGoogle ? 'Nenhuma conta conectada ainda' : (chaves.length === 0 ? 'Sem chave' : 'Faltam: ' + chaves.join(', ')) }, '⚠ a configurar'),
    ),
  ]));

  card.append(el('div', { class: 'pc-int-tecnica' }, i.descricao || ''));

  // Bloco especifico Google: lista contas conectadas + botao Conectar
  if (ehGoogle) {
    card.append(el('div', { class: 'pc-int-contas' }, [
      el('div', { class: 'pc-int-contas-label' }, `📬 Contas conectadas (${contas.length}):`),
      ...contas.map(c => el('div', { class: 'pc-int-conta-row' }, [
        el('span', { class: 'pc-int-conta-label' }, c.label || '(sem nome)'),
        el('span', { class: 'pc-int-conta-email' }, c.email_google || '(sem email)'),
        c.is_padrao ? el('span', { class: 'pc-int-tag-padrao', title: 'Conta padrão' }, '⭐') : null,
        c.incluir_em_relatorio ? el('span', { class: 'pc-int-tag-rel', title: 'Em relatórios' }, '📊') : null,
      ])),
      contas.length === 0
        ? el('div', { class: 'pc-int-empty' }, 'Nenhuma caixa Google conectada ainda.')
        : null,
      el('button', {
        class: 'pc-int-btn-conectar',
        onclick: () => {
          const btn = document.querySelector('.nav-item[data-page="integracoes"]');
          if (btn) btn.click();
        },
      }, '+ Conectar nova caixa Google'),
    ]));
  }

  if (chaves.length > 0) {
    card.append(el('div', { class: 'pc-int-chaves' }, `🔑 ${chaves.join(', ')}`));
  }

  return card;
}

// ============================================================
// Estilos
// ============================================================
function injetarEstilos() {
  if (document.getElementById('pc-style')) return;
  const css = `
    #page-plano-cerebros { padding: 24px; max-width: 1400px; margin: 0 auto; color: #E2E8F0; font-family: system-ui, sans-serif; }
    .pc-header { margin-bottom: 24px; }
    .pc-title { font-size: 2rem; margin: 0 0 8px 0; }
    .pc-sub { color: #94A3B8; margin: 0 0 16px 0; }
    .pc-loading { padding: 24px; color: #94A3B8; }

    .pc-tabs { display: flex; gap: 8px; border-bottom: 1px solid #334155; }
    .pc-tab { background: transparent; color: #94A3B8; border: none; padding: 12px 20px; font-size: 0.95rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
    .pc-tab:hover { color: #E2E8F0; }
    .pc-tab-ativa { color: #3B82F6; border-bottom-color: #3B82F6; }

    /* Resumo global */
    .pc-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 24px 0 32px; }
    .pc-card-num { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
    .pc-num-label { color: #94A3B8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .pc-num-val { font-size: 2rem; font-weight: 700; color: white; }
    .pc-num-sub { color: #64748B; font-size: 0.8rem; margin-top: 2px; }

    /* Grid cerebros */
    .pc-grid-section { margin-bottom: 32px; }
    .pc-section-title { font-size: 1.3rem; margin: 24px 0 12px 0; color: white; }

    .pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .pc-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 16px; transition: all 0.15s; cursor: pointer; }
    .pc-card:hover { transform: translateY(-2px); border-color: #475569; }
    .pc-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .pc-emoji { font-size: 1.5rem; }
    .pc-card-titulo { font-weight: 600; color: white; }
    .pc-card-counts { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .pc-mini-pill { display: flex; align-items: center; gap: 4px; background: #0F172A; border-radius: 6px; padding: 4px 8px; font-size: 0.85rem; }
    .pc-mini-pill strong { color: white; }
    .pc-card-cta { color: #3B82F6; font-size: 0.85rem; font-weight: 600; }

    /* Tela do cerebro */
    .pc-cer-header { margin: 16px 0 24px; }
    .pc-btn-voltar { background: transparent; color: #94A3B8; border: 1px solid #334155; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; margin-bottom: 16px; }
    .pc-btn-voltar:hover { color: white; border-color: #475569; }
    .pc-cer-titulo { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
    .pc-mini { font-size: 0.85rem; }

    .pc-cer-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .pc-stat { background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 12px; text-align: center; }
    .pc-stat-num { font-size: 1.8rem; font-weight: 700; line-height: 1; }
    .pc-stat-label { color: #94A3B8; font-size: 0.8rem; margin-top: 4px; }

    .pc-filtros { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
    .pc-filtro { background: #1E293B; color: #CBD5E1; border: 1px solid #334155; padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
    .pc-filtro:hover { background: #334155; color: white; }
    .pc-filtro-ativo { background: #2563EB; color: white; border-color: #2563EB; }
    .pc-filtro-zero { opacity: 0.5; }

    /* Cards de categoria */
    .pc-cat-lista { display: flex; flex-direction: column; gap: 10px; }
    .pc-cat-card { background: #1E293B; border: 1px solid #334155; border-left: 4px solid #64748B; border-radius: 10px; padding: 14px 16px; transition: border-color 0.15s, border-left-color 0.25s ease, transform 0.18s ease, opacity 0.18s ease; animation: pc-card-in 0.22s ease; }
    .pc-cat-card:hover { border-color: #475569; }
    @keyframes pc-card-in { from { opacity: 0.4; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    .pc-cat-l1 { display: grid; grid-template-columns: auto auto 1fr auto; gap: 14px; align-items: center; margin-bottom: 10px; }
    .pc-cat-emoji { font-size: 2rem; line-height: 1; }
    .pc-cat-count-wrap { text-align: center; min-width: 60px; }
    .pc-cat-count { font-size: 1.7rem; font-weight: 700; color: white; line-height: 1; }
    .pc-cat-count-label { color: #64748B; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
    .pc-cat-info { min-width: 0; }
    .pc-cat-nome { color: white; font-weight: 600; font-size: 1rem; }
    .pc-cat-desc { color: #94A3B8; font-size: 0.8rem; margin-top: 2px; }
    .pc-status-pill { color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
    .pc-trigger-pill { background: #0F172A; color: #94A3B8; padding: 3px 9px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; white-space: nowrap; border: 1px solid #334155; }
    .pc-cat-pills { display: flex; gap: 6px; flex-direction: column; align-items: flex-end; }
    .pc-cat-card-pendencias { box-shadow: 0 0 0 1px #F59E0B66; }
    .pc-cat-badge-pendencia { display: flex; align-items: center; gap: 10px; background: #422006; border: 1px solid #F59E0B; color: #FCD34D; padding: 8px 12px; border-radius: 8px; margin: 8px 0; font-size: 0.85rem; }
    .pc-cat-badge-pendencia strong { color: white; }
    .pc-pend-icon { font-size: 1.1rem; }
    .pc-btn-mini-acao { background: #F59E0B; color: #0F172A; border: none; padding: 4px 10px; border-radius: 5px; cursor: pointer; font-weight: 700; font-size: 0.75rem; margin-left: auto; }
    .pc-btn-mini-acao:hover { background: #EAB308; }

    .pc-cat-l2 { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.8rem; padding-top: 8px; border-top: 1px dashed #334155; }
    .pc-cat-attr { display: flex; gap: 4px; align-items: center; }
    .pc-cat-attr-k { color: #64748B; }
    .pc-cat-attr-v { color: #CBD5E1; }

    .pc-cat-notas { font-size: 0.8rem; color: #CBD5E1; background: #0F172A; padding: 8px 10px; border-radius: 6px; margin-top: 8px; }

    .pc-cat-acoes { display: flex; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #334155; }
    .pc-btn-primary { background: #2563EB; color: white; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
    .pc-btn-primary:hover { background: #1D4ED8; }
    .pc-btn-secondary { background: transparent; color: #CBD5E1; border: 1px solid #334155; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    .pc-btn-secondary:hover { background: #334155; }

    .pc-status-auto { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; color: #22C55E; font-size: 0.85rem; font-weight: 500; background: rgba(34, 197, 94, 0.08); border-radius: 6px; border: 1px solid rgba(34, 197, 94, 0.2); }

    .pc-empty { color: #64748B; padding: 32px; text-align: center; font-style: italic; border: 1px dashed #334155; border-radius: 8px; }

    /* Modal */
    .pc-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: flex-start; justify-content: center; z-index: 9999; overflow-y: auto; padding: 40px 16px; }
    .pc-hidden { display: none !important; }
    .pc-modal-inner { background: #0F172A; border: 1px solid #334155; border-radius: 14px; padding: 20px; width: 100%; }
    .pc-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding-bottom: 12px; border-bottom: 1px solid #334155; }
    .pc-modal-head h2 { margin: 0; color: white; font-size: 1.1rem; }
    .pc-modal-sub { color: #94A3B8; font-size: 0.85rem; margin: 8px 0 16px; }
    .pc-close { background: transparent; color: #94A3B8; border: none; font-size: 1.7rem; cursor: pointer; line-height: 1; }
    .pc-modal-body { display: flex; flex-direction: column; gap: 12px; }
    .pc-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 600px) { .pc-form-row { grid-template-columns: 1fr; } }
    .pc-form-campo { display: flex; flex-direction: column; gap: 4px; }
    .pc-form-campo label { color: #CBD5E1; font-size: 0.8rem; }
    .pc-input { background: #1E293B; border: 1px solid #334155; color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; font-family: inherit; }
    .pc-input:focus { outline: none; border-color: #3B82F6; }
    textarea.pc-input { resize: vertical; min-height: 60px; }
    .pc-form-acoes { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155; }
    .pc-btn-cancel { background: transparent; color: #94A3B8; border: 1px solid #334155; padding: 8px 16px; border-radius: 6px; cursor: pointer; }

    /* Aba Integrações */
    .pc-int-wrap { padding-top: 16px; }
    .pc-int-sub { color: #94A3B8; font-size: 0.9rem; max-width: 800px; margin: 0 0 24px; }
    .pc-int-cat { color: #94A3B8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 8px; }
    .pc-int-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .pc-int-card { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 12px; }
    .pc-int-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .pc-int-card-head > div:nth-child(2) { flex: 1; }
    .pc-int-nome { color: white; font-weight: 600; font-size: 0.9rem; }
    .pc-int-slug { color: #64748B; font-size: 0.7rem; font-family: monospace; }
    .pc-int-status { font-size: 0.75rem; }
    .pc-int-ok { color: #22C55E; }
    .pc-int-ko { color: #F59E0B; }
    .pc-int-tecnica { color: #94A3B8; font-size: 0.8rem; padding-top: 6px; border-top: 1px dashed #334155; }
    .pc-int-chaves { color: #64748B; font-size: 0.7rem; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #334155; font-family: monospace; }

    /* Contas conectadas (Google) */
    .pc-int-contas { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #334155; display: flex; flex-direction: column; gap: 6px; }
    .pc-int-contas-label { color: #CBD5E1; font-size: 0.78rem; font-weight: 600; }
    .pc-int-conta-row { display: flex; align-items: center; gap: 6px; background: #0F172A; padding: 5px 8px; border-radius: 5px; font-size: 0.78rem; }
    .pc-int-conta-label { color: white; font-weight: 600; }
    .pc-int-conta-email { color: #94A3B8; font-family: monospace; font-size: 0.72rem; flex: 1; }
    .pc-int-tag-padrao, .pc-int-tag-rel { font-size: 0.85rem; }
    .pc-int-empty { color: #64748B; font-size: 0.78rem; font-style: italic; padding: 6px; }
    .pc-int-btn-conectar { background: #1D4ED8; color: white; border: none; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-size: 0.78rem; font-weight: 600; margin-top: 4px; text-align: center; text-decoration: none; display: block; }
    .pc-int-btn-conectar:hover { background: #1E40AF; }

    /* Botao + Nova categoria */
    .pc-btn-nova-cat { background: #1E293B; color: #CBD5E1; border: 1px dashed #475569; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.15s; }
    .pc-btn-nova-cat:hover { background: #334155; color: white; border-color: #64748B; }
  `;
  document.head.append(el('style', { id: 'pc-style', html: css }));
}
