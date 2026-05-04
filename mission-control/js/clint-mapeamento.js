/**
 * Clint Mapeamento — De-para Clint -> Cerebros do Pinguim
 *
 * Tela escondida (sem item no sidebar). Acesso direto via /#clint-mapeamento.
 * Usado pra fazer o de-para entre nome_do_produto no Clint e Cerebro interno.
 *
 * Decisao por produto: pendente | mapeado | ignorar.
 * Apos mapeamento, Fase B (clint-fetch-conversas) so coleta produtos com
 * decisao=mapeado.
 */

import { getSupabase } from './sb-client.js?v=20260429d';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  });
  return n;
};

const _nf = new Intl.NumberFormat('pt-BR');
const fmt = (n) => _nf.format(Number(n || 0));

let cerebrosOptions = [];

export async function renderClintMapeamento() {
  const page = document.getElementById('page-clint-mapeamento');
  page.innerHTML = '';

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, '🔌 Clint — Mapeamento de Produtos'),
        el('div', { class: 'page-subtitle' },
          'De-para entre nomes de produto no Clint e Cérebros internos do Pinguim. Marque cada produto como Mapeado (vincula a um Cérebro) ou Ignorar (não coleta). Só produtos mapeados entram na coleta de mensagens (Fase B).'),
      ]),
      el('div', { style: 'display:flex;gap:.5rem' }, [
        el('button', {
          class: 'btn btn-ghost',
          onclick: () => renderClintMapeamento(),
        }, '↻ Atualizar'),
        el('button', {
          class: 'btn btn-ghost',
          onclick: () => dispararScanClint(),
          title: 'Roda o varredor pra atualizar quantidades (modo amostra: 1000 contatos)',
        }, '🔎 Re-escanear (amostra)'),
      ]),
    ]),
    el('div', { id: 'cm-stats', class: 'cp-stats' }),
    el('div', { id: 'cm-filtros', class: 'cp-filtros' }),
    el('div', { id: 'cm-conteudo' }),
  );

  await Promise.all([
    carregarCerebros(),
    renderStats(),
    renderTabela(),
  ]);

  renderFiltros();
}

let estado = {
  busca: '',
  filtroDecisao: null,  // null | 'pendente' | 'mapeado' | 'ignorar'
};

async function carregarCerebros() {
  const sb = getSupabase();
  // Lista todos cerebros internos (produtos) pra dropdown de mapeamento
  const { data, error } = await sb
    .from('cerebros')
    .select('id, produto_id, produtos!inner(nome, categoria, slug)')
    .eq('produtos.categoria', 'interno')
    .order('produtos(nome)');
  if (error) {
    console.error('Erro carregando cerebros:', error);
    cerebrosOptions = [];
    return;
  }
  cerebrosOptions = (data || []).map(c => ({
    id: c.id,
    nome: c.produtos?.nome || 'Sem nome',
  }));
}

async function renderStats() {
  const sb = getSupabase();
  const cont = document.getElementById('cm-stats');
  if (!cont) return;

  const { data, error } = await sb
    .from('clint_produto_mapeamento')
    .select('decisao, qtd_contatos, qtd_contatos_12m');
  if (error) {
    cont.replaceChildren(el('div', { class: 'seguranca-erro' }, error.message));
    return;
  }

  const stats = {
    total_produtos: (data || []).length,
    pendentes: (data || []).filter(d => d.decisao === 'pendente').length,
    mapeados: (data || []).filter(d => d.decisao === 'mapeado').length,
    ignorados: (data || []).filter(d => d.decisao === 'ignorar').length,
    total_contatos: (data || []).reduce((s, d) => s + (d.qtd_contatos || 0), 0),
    total_12m: (data || []).reduce((s, d) => s + (d.qtd_contatos_12m || 0), 0),
    contatos_mapeados_12m: (data || []).filter(d => d.decisao === 'mapeado').reduce((s, d) => s + (d.qtd_contatos_12m || 0), 0),
  };

  cont.replaceChildren(
    statCard('📦', 'Produtos únicos', fmt(stats.total_produtos)),
    statCard('⏳', 'Pendentes', fmt(stats.pendentes)),
    statCard('✅', 'Mapeados', fmt(stats.mapeados)),
    statCard('🚫', 'Ignorados', fmt(stats.ignorados)),
    statCard('👥', 'Contatos (12m)', fmt(stats.total_12m)),
    statCard('🎯', 'Mapeados 12m', fmt(stats.contatos_mapeados_12m), 'Estimativa de contatos que vão pra Fase B'),
  );
}

function statCard(icon, label, valor, hint) {
  return el('div', { class: 'cp-stat-card', title: hint || '' }, [
    el('div', { class: 'cp-stat-icon' }, icon),
    el('div', { class: 'cp-stat-info' }, [
      el('div', { class: 'cp-stat-label' }, label),
      el('div', { class: 'cp-stat-valor' }, String(valor)),
    ]),
  ]);
}

function renderFiltros() {
  const cont = document.getElementById('cm-filtros');
  if (!cont) return;

  const chip = (decisao, label) => el('button', {
    class: 'cerebros-chip' + (estado.filtroDecisao === decisao ? ' active' : ''),
    onclick: () => {
      estado.filtroDecisao = (estado.filtroDecisao === decisao) ? null : decisao;
      renderFiltros();
      renderTabela();
    },
  }, label);

  cont.replaceChildren(
    el('div', { class: 'cerebros-chips' }, [
      chip(null, 'Todos'),
      chip('pendente', '⏳ Pendentes'),
      chip('mapeado', '✅ Mapeados'),
      chip('ignorar', '🚫 Ignorados'),
    ]),
    el('div', { class: 'cerebros-busca' }, [
      el('span', { class: 'cerebros-busca-icon' }, '🔎'),
      el('input', {
        type: 'text',
        class: 'cerebros-busca-input',
        placeholder: 'Buscar por nome do produto…',
        value: estado.busca,
        oninput: debounce((e) => {
          estado.busca = e.target.value;
          renderTabela();
        }, 300),
      }),
    ]),
  );
}

let debounceTimer = null;
function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), ms);
  };
}

async function renderTabela() {
  const cont = document.getElementById('cm-conteudo');
  if (!cont) return;
  cont.innerHTML = '<div class="cp-loading">Carregando produtos…</div>';

  const sb = getSupabase();
  let q = sb.from('clint_produto_mapeamento')
    .select('*')
    .order('qtd_contatos', { ascending: false });

  if (estado.filtroDecisao) q = q.eq('decisao', estado.filtroDecisao);
  if (estado.busca) q = q.ilike('nome_clint', `%${estado.busca}%`);

  const { data, error } = await q;
  if (error) {
    cont.innerHTML = `<div class="seguranca-erro">${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    cont.replaceChildren(el('div', { class: 'seguranca-empty' },
      'Nenhum produto encontrado. Rode "🔎 Re-escanear (amostra)" pra popular dados do Clint.'));
    return;
  }

  const tabela = el('table', { class: 'cp-tabela' });
  tabela.append(
    el('thead', {}, [el('tr', {}, [
      el('th', {}, 'Produto Clint'),
      el('th', { style: 'text-align:right' }, 'Total'),
      el('th', { style: 'text-align:right' }, '12m'),
      el('th', {}, 'Decisão'),
      el('th', {}, 'Cérebro vinculado'),
      el('th', {}, 'Última atividade'),
    ])]),
    el('tbody', {}, data.map(p => renderLinha(p))),
  );

  const footer = el('div', { class: 'cp-paginacao' },
    el('span', {}, `${data.length} produto${data.length === 1 ? '' : 's'}`),
  );

  cont.replaceChildren(tabela, footer);
}

function renderLinha(p) {
  // Select de decisão
  const selectDecisao = el('select', { class: 'cm-select-decisao' });
  ['pendente', 'mapeado', 'ignorar'].forEach(d => {
    const o = el('option', { value: d }, labelDecisao(d));
    if (p.decisao === d) o.selected = true;
    selectDecisao.append(o);
  });

  // Select de cerebro
  const selectCerebro = el('select', { class: 'cm-select-cerebro' });
  selectCerebro.append(el('option', { value: '' }, '— escolher Cérebro —'));
  cerebrosOptions.forEach(c => {
    const o = el('option', { value: c.id }, c.nome);
    if (p.cerebro_id === c.id) o.selected = true;
    selectCerebro.append(o);
  });

  // Habilita cerebro só se decisao for 'mapeado'
  selectCerebro.disabled = (p.decisao !== 'mapeado');

  selectDecisao.addEventListener('change', async () => {
    const novaDecisao = selectDecisao.value;
    selectCerebro.disabled = (novaDecisao !== 'mapeado');
    // Se virar 'ignorar' ou 'pendente', limpa cerebro_id
    const novoCerebroId = novaDecisao === 'mapeado' ? (selectCerebro.value || null) : null;
    if (novaDecisao !== 'mapeado') selectCerebro.value = '';
    await salvarMapeamento(p.id, novaDecisao, novoCerebroId);
    await renderStats();
  });

  selectCerebro.addEventListener('change', async () => {
    if (selectDecisao.value !== 'mapeado') return;
    await salvarMapeamento(p.id, 'mapeado', selectCerebro.value || null);
  });

  return el('tr', {}, [
    el('td', {}, [
      el('div', { class: 'cp-nome' }, p.nome_clint),
      p.qtd_contatos > 100
        ? el('div', { style: 'font-size:.7rem;color:var(--brand);margin-top:2px' }, '🔥 alto volume')
        : null,
    ]),
    el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmt(p.qtd_contatos)),
    el('td', { style: 'text-align:right;font-family:var(--font-mono);color:var(--fg-muted)' }, fmt(p.qtd_contatos_12m)),
    el('td', {}, selectDecisao),
    el('td', {}, selectCerebro),
    el('td', { style: 'font-size:.75rem;color:var(--fg-muted)' },
      p.ultimo_visto_em ? formatarData(p.ultimo_visto_em) : '—'),
  ]);
}

function labelDecisao(d) {
  return { pendente: '⏳ pendente', mapeado: '✅ mapeado', ignorar: '🚫 ignorar' }[d] || d;
}

function formatarData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

async function salvarMapeamento(id, decisao, cerebroId) {
  const sb = getSupabase();
  const { error } = await sb
    .from('clint_produto_mapeamento')
    .update({
      decisao,
      cerebro_id: cerebroId,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) {
    alert('Erro ao salvar: ' + error.message);
    return false;
  }
  return true;
}

async function dispararScanClint() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { alert('Sem sessão. Faça login.'); return; }

  const cont = document.getElementById('cm-conteudo');
  if (cont) cont.innerHTML = '<div class="cp-loading">Escaneando Clint (modo amostra, ~1 min)…</div>';

  try {
    const r = await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/clint-mapear-produtos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': window.__ENV__.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ modo: 'amostra' }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      alert('Falha: ' + (j.erro || `HTTP ${r.status}`));
    } else {
      alert(`✅ Escaneamento ok!\n\n${j.contatos_lidos} contatos lidos\n${j.produtos_unicos} produtos únicos\n${j.sem_produto} sem campo de produto`);
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  }

  await renderClintMapeamento();
}
