/* Tela Cérebros — catálogo + detalhe com Grafo/Lista/Timeline */

import { fetchCerebrosCatalogo, fetchCerebroPecas, getSupabase } from './sb-client.js?v=20260421j';
import { renderGrafo, coresTipo, labelTipo } from './grafo.js?v=20260421j';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
};

let cerebrosCache = [];
let cerebrosListenerReady = false;

export async function renderCerebros() {
  if (!cerebrosListenerReady) {
    cerebrosListenerReady = true;
    window.addEventListener('cerebro:select', (ev) => {
      const slug = ev.detail?.slug;
      if (slug) abrirCerebroDetalhe(slug);
    });
  }

  const page = document.getElementById('page-cerebros');
  page.innerHTML = '';
  page.append(el('div', { html: '<div style="padding:3rem;color:var(--fg-muted);text-align:center">Carregando cérebros…</div>' }));

  try {
    cerebrosCache = await fetchCerebrosCatalogo();
  } catch (e) {
    page.innerHTML = `<div style="padding:2rem;color:var(--status-alerta)">Erro: ${e.message}</div>`;
    return;
  }

  page.innerHTML = '';
  page.append(
    el('div', { class: 'cerebros-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Cérebros'),
        el('div', { class: 'page-subtitle' }, 'Um Cérebro por produto — contexto + skills + rotinas. Agentes consultam antes de agir.'),
      ]),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => abrirModalNovoProduto()
      }, '+ Novo Produto'),
    ]),
    el('div', { class: 'cerebros-grid' }, [
      ...cerebrosCache.map(renderCerebroCard),
      el('button', {
        class: 'btn-add-produto',
        onclick: () => abrirModalNovoProduto()
      }, '+ Cadastrar novo produto'),
    ]),
  );
}

function renderCerebroCard(c) {
  const isPinguim = c.slug === 'pinguim';
  const atualizacao = formatarAtualizacao(c.ultima_alimentacao);
  const tiposPresentes = construirTiposDinamicos(c);
  const totalFontes = tiposPresentes.reduce((sum, t) => sum + t.val, 0);

  return el('div', {
    class: 'cerebro-card' + (isPinguim ? ' featured' : ''),
    onclick: () => abrirCerebroDetalhe(c.slug)
  }, [
    el('div', { class: 'cerebro-card-top' }, [
      el('div', { class: 'cerebro-emoji' }, c.emoji || '📦'),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { class: 'cerebro-nome' }, c.nome),
        el('div', { class: 'cerebro-desc' }, c.descricao || '—'),
      ]),
    ]),
    tiposPresentes.length > 0
      ? el('div', { class: 'cerebro-tipos-lista' },
          tiposPresentes.map(t => el('div', { class: 'cerebro-tipo-row', title: t.label }, [
            el('span', { class: 'cerebro-tipo-icon' }, t.icon),
            el('span', { class: 'cerebro-tipo-label' }, t.label),
            el('span', { class: 'cerebro-tipo-count' }, String(t.val)),
          ]))
        )
      : el('div', { class: 'cerebro-tipos-empty' }, 'Ainda sem fontes — clique em Alimentar'),
    el('div', { class: 'cerebro-card-footer' }, [
      el('div', { class: 'cerebro-total-fontes' }, `${totalFontes} fonte${totalFontes === 1 ? '' : 's'}`),
      el('span', { class: 'cerebro-atualizacao' + (atualizacao.recente ? ' recente' : '') }, atualizacao.texto),
    ]),
  ]);
}

/* Constrói lista dinâmica — só aparecem tipos que têm >0 itens, ordenados por volume */
function construirTiposDinamicos(c) {
  const todos = [
    { key: 'aulas',       icon: '📚', label: 'Aulas',       val: c.total_aulas || 0 },
    { key: 'paginas',     icon: '📄', label: 'Páginas',     val: c.total_paginas || 0 },
    { key: 'objecoes',    icon: '❓', label: 'Objeções',    val: c.total_objecoes || 0 },
    { key: 'depoimentos', icon: '⭐', label: 'Depoimentos', val: c.total_depoimentos || 0 },
    { key: 'sacadas',     icon: '💡', label: 'Sacadas',     val: c.total_sacadas || 0 },
  ];
  const contados = todos.reduce((s, t) => s + t.val, 0);
  const outros = Math.max(0, (c.total_pecas || 0) - contados);
  if (outros > 0) todos.push({ key: 'outros', icon: '📦', label: 'Outros', val: outros });

  return todos.filter(t => t.val > 0).sort((a, b) => b.val - a.val);
}

function formatarAtualizacao(iso) {
  if (!iso) return { texto: 'Sem atualização', recente: false };
  const d = new Date(iso);
  const horas = Math.floor((Date.now() - d.getTime()) / 3600000);
  const dias = Math.floor(horas / 24);
  if (horas < 1) return { texto: 'Agora há pouco', recente: true };
  if (horas < 24) return { texto: `há ${horas}h`, recente: horas < 6 };
  if (dias === 1) return { texto: 'Ontem', recente: false };
  if (dias < 7) return { texto: `há ${dias}d`, recente: false };
  if (dias < 30) return { texto: `há ${Math.floor(dias / 7)} sem`, recente: false };
  return { texto: `há ${Math.floor(dias / 30)} meses`, recente: false };
}

function abrirModalNovoProduto() {
  // V0: prompt simples. Em V1 vira modal real com form.
  const nome = prompt('Nome do produto (ex: "Novo Desafio"):');
  if (!nome) return;
  const emoji = prompt('Emoji (1 só):', '📦') || '📦';
  alert(`Produto "${nome}" ${emoji} seria criado.\n\nEm V1 isto gera registro no Supabase + pasta cerebros/<slug>/ + MAPA.md inicial.`);
}

/* ----- Tela detalhada de 1 cérebro ----- */
let pecasCache = [];
let cerebroAtual = null;
let viewModoAtual = 'kanban';

async function abrirCerebroDetalhe(slug) {
  cerebroAtual = cerebrosCache.find(c => c.slug === slug);
  if (!cerebroAtual) return;

  const page = document.getElementById('page-cerebros');
  page.innerHTML = '';
  page.append(el('div', { html: `<div style="padding:3rem;color:var(--fg-muted);text-align:center">Carregando fontes do Cérebro ${cerebroAtual.nome}…</div>` }));

  let fontesServidor = [];
  try {
    fontesServidor = await fetchCerebroPecas(slug);
  } catch (err) {
    console.error('Erro ao carregar fontes do Supabase:', err);
    fontesServidor = [];
  }
  const fontesLocais = lerFontesLocaisPorCerebro(slug);
  pecasCache = [...fontesLocais, ...fontesServidor];

  page.innerHTML = '';
  const acoes = el('div', { class: 'cerebro-detail-actions' }, [
    el('button', { class: 'btn btn-primary', onclick: () => abrirModalAlimentar() }, '+ Alimentar'),
    pecasCache.length > 0
      ? el('button', {
          class: 'btn',
          onclick: () => abrirHistoricoLotes(),
          title: 'Ver e gerenciar cargas anteriores',
        }, '📜 Histórico')
      : null,
    pecasCache.length > 0
      ? el('button', {
          class: 'btn btn-ghost',
          style: 'color:var(--danger)',
          onclick: () => zerarCerebro(),
          title: 'Apaga TODAS as fontes deste Cérebro',
        }, '🗑 Zerar')
      : null,
    el('button', { class: 'btn btn-ghost', onclick: () => renderCerebros() }, '← Voltar'),
  ]);

  const header = el('div', { class: 'cerebro-detail-header' }, [
    el('div', { class: 'cerebro-emoji' }, cerebroAtual.emoji || '📦'),
    el('div', { style: 'flex:1' }, [
      el('div', { class: 'cerebro-nome' }, `Cérebro ${cerebroAtual.nome}`),
      el('div', { class: 'cerebro-desc' }, cerebroAtual.descricao || '—'),
      el('div', { style: 'display:flex;gap:.75rem;margin-top:.5rem;font-size:.75rem;color:var(--fg-muted)' }, [
        el('span', {}, `${pecasCache.length} fontes`),
        el('span', {}, formatarAtualizacao(cerebroAtual.ultima_alimentacao).texto),
      ]),
    ]),
    acoes,
  ]);

  const toggle = el('div', { class: 'view-toggle' }, [
    el('button', { class: viewModoAtual === 'kanban' ? 'active' : '', onclick: () => { viewModoAtual = 'kanban'; renderView(); } }, '▦ Kanban'),
    el('button', { class: viewModoAtual === 'lista' ? 'active' : '', onclick: () => { viewModoAtual = 'lista'; renderView(); } }, '☰ Lista'),
    el('button', { class: viewModoAtual === 'timeline' ? 'active' : '', onclick: () => { viewModoAtual = 'timeline'; renderView(); } }, '⌚ Timeline'),
  ]);

  const viewArea = el('div', { id: 'cerebro-view-area' });

  page.append(el('div', { class: 'cerebro-detail' }, [header, toggle, viewArea]));

  renderView();
}

/* ================================================================
   AÇÕES: zerar cérebro, excluir fonte, reclassificar
   ================================================================ */

async function zerarCerebro() {
  if (!cerebroAtual) return;
  const sb = getSupabase();
  if (!sb) { await alertarDark({ titulo: 'Sem conexão', mensagem: 'Supabase não conectado.', tipo: 'erro' }); return; }

  // Confirmação dupla
  const confirma1 = await confirmarDark({
    titulo: `Zerar Cérebro ${cerebroAtual.nome}?`,
    mensagem: `Esta ação vai apagar TODAS as ${pecasCache.length} fontes, chunks e histórico de uploads deste Cérebro.\n\nAção irreversível. Certeza?`,
    confirmar: 'Sim, zerar',
  });
  if (!confirma1) return;

  const confirma2 = await confirmarDark({
    titulo: 'Última confirmação',
    mensagem: `Vou apagar ${pecasCache.length} fontes + todos os vetores do Cérebro ${cerebroAtual.nome}.\n\nIsso NÃO pode ser desfeito.`,
    confirmar: 'Confirmar exclusão',
    perigoso: true,
  });
  if (!confirma2) return;

  // Busca cerebro_id
  const { data: prod } = await sb.from('produtos').select('id').eq('slug', cerebroAtual.slug).single();
  if (!prod) return;
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
  if (!cer) return;

  // DELETE em cascata (order importa por conta de FK)
  await sb.from('cerebro_fontes_chunks').delete().eq('cerebro_id', cer.id);
  await sb.from('cerebro_fontes').delete().eq('cerebro_id', cer.id);
  await sb.from('ingest_arquivos').delete().eq('cerebro_id', cer.id);
  await sb.from('ingest_lotes').delete().eq('cerebro_id', cer.id);
  await sb.from('cerebros').update({ ultima_alimentacao: null }).eq('id', cer.id);

  await alertarDark({ titulo: 'Cérebro zerado', mensagem: `${cerebroAtual.nome} voltou ao estado inicial. Pronto pra nova carga.`, tipo: 'info' });

  // Recarrega catálogo + tela
  cerebrosCache = await fetchCerebrosCatalogo();
  abrirCerebroDetalhe(cerebroAtual.slug);
}

async function abrirHistoricoLotes() {
  const sb = getSupabase();
  if (!sb || !cerebroAtual) return;

  // Busca cerebro_id
  const { data: prod } = await sb.from('produtos').select('id').eq('slug', cerebroAtual.slug).single();
  if (!prod) return;
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
  if (!cer) return;

  const { data: lotes } = await sb.from('ingest_lotes')
    .select('id, nome_arquivo, tamanho_bytes, disparado_por, status, arquivos_totais, fontes_criadas, chunks_criados, em_quarentena, custo_usd, duracao_ms, criado_em, finalizado_em')
    .eq('cerebro_id', cer.id)
    .order('criado_em', { ascending: false });

  const back = el('div', {
    class: 'modal-backdrop',
    style: 'z-index:10000',
    onclick: (e) => { if (e.target === back) fechar(); }
  });
  const card = el('div', { class: 'modal-card', style: 'max-width:820px;max-height:85vh;overflow-y:auto' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const statusLabel = {
    recebido: '⏳ Recebido', extraindo: '📂 Extraindo', classificando: '🧠 Classificando',
    vetorizando: '🔢 Vetorizando', concluido: '✓ Concluído', falhou: '✗ Falhou',
  };

  const corpo = (lotes && lotes.length > 0)
    ? el('div', { class: 'lotes-lista' }, lotes.map(lote => {
        const dt = new Date(lote.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        const mb = lote.tamanho_bytes ? (lote.tamanho_bytes / 1024 / 1024).toFixed(1) + ' MB' : '';
        return el('div', { class: 'lote-row' }, [
          el('div', { class: 'lote-row-main' }, [
            el('div', { class: 'lote-nome' }, lote.nome_arquivo || '(sem nome)'),
            el('div', { class: 'lote-meta' }, [
              el('span', {}, statusLabel[lote.status] || lote.status),
              el('span', {}, `${lote.fontes_criadas || 0} fontes`),
              el('span', {}, `${lote.chunks_criados || 0} chunks`),
              lote.em_quarentena > 0 ? el('span', { style: 'color:var(--warning)' }, `${lote.em_quarentena} em quarentena`) : null,
              mb ? el('span', {}, mb) : null,
              el('span', { style: 'color:var(--fg-dim)' }, dt),
              el('span', { style: 'color:var(--fg-dim)' }, `por ${lote.disparado_por || '—'}`),
            ]),
          ]),
          el('button', {
            class: 'btn btn-ghost',
            style: 'color:var(--danger)',
            onclick: async () => {
              fechar();
              await reverterLote(lote);
            },
            title: 'Apaga TODAS as fontes que vieram neste upload',
          }, '🗑 Reverter'),
        ]);
      }))
    : el('div', { style: 'padding:2rem;text-align:center;color:var(--fg-muted)' }, 'Sem cargas registradas ainda.');

  card.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, `Histórico de cargas — ${cerebroAtual.nome}`),
      el('div', { class: 'modal-sub' }, `Cada upload em pacote vira um lote. Você pode reverter lote inteiro.`),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [ corpo ]),
  );

  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

async function reverterLote(lote) {
  const sb = getSupabase();
  if (!sb) return;

  const confirma = await confirmarDark({
    titulo: `Reverter lote "${lote.nome_arquivo}"?`,
    mensagem: `Vou apagar TODAS as ${lote.fontes_criadas || 0} fontes e ${lote.chunks_criados || 0} chunks que vieram neste upload.\n\nOutros lotes do Cérebro permanecem intactos.\n\nAção irreversível.`,
    confirmar: 'Reverter lote',
    perigoso: true,
  });
  if (!confirma) return;

  // Pega todas as fontes desse lote
  const { data: fontes } = await sb.from('cerebro_fontes')
    .select('id')
    .eq('ingest_lote_id', lote.id);

  const fonteIds = (fontes || []).map(f => f.id);
  if (fonteIds.length > 0) {
    await sb.from('cerebro_fontes_chunks').delete().in('fonte_id', fonteIds);
    await sb.from('cerebro_fontes').delete().in('id', fonteIds);
  }

  // Apaga também o log do lote
  await sb.from('ingest_arquivos').delete().eq('lote_id', lote.id);
  await sb.from('ingest_lotes').delete().eq('id', lote.id);

  await alertarDark({
    titulo: 'Lote revertido',
    mensagem: `${fonteIds.length} fontes apagadas. Outros lotes continuam intactos.`,
    tipo: 'info',
  });

  // Recarrega
  cerebrosCache = await fetchCerebrosCatalogo();
  abrirCerebroDetalhe(cerebroAtual.slug);
}

async function excluirFonte(fonteId) {
  const sb = getSupabase();
  if (!sb) return;
  const confirma = await confirmarDark({
    titulo: 'Excluir esta fonte?',
    mensagem: 'A fonte e todos os chunks vetorizados dela serão apagados. Ação irreversível.',
    confirmar: 'Excluir',
    perigoso: true,
  });
  if (!confirma) return;

  // Chunks vêm com on delete cascade, mas vou explicitar
  await sb.from('cerebro_fontes_chunks').delete().eq('fonte_id', fonteId);
  await sb.from('cerebro_fontes').delete().eq('id', fonteId);

  abrirCerebroDetalhe(cerebroAtual.slug);
}

async function reclassificarFonte(fonte) {
  const sb = getSupabase();
  if (!sb) return;

  const TIPOS = [
    { k: 'aula', l: '📚 Aula' },
    { k: 'pagina_venda', l: '📄 Página de venda' },
    { k: 'objecao', l: '❓ Objeção' },
    { k: 'depoimento', l: '⭐ Depoimento' },
    { k: 'sacada', l: '💡 Sacada' },
    { k: 'pitch', l: '🎯 Pitch' },
    { k: 'faq', l: '📖 FAQ' },
    { k: 'externo', l: '🔗 Externo' },
    { k: 'csv', l: '📊 CSV / planilha' },
    { k: 'pesquisa', l: '📋 Pesquisa' },
    { k: 'chat_export', l: '💬 Chat export' },
    { k: 'outro', l: '📦 Outro' },
  ];

  const novoTipo = await escolherDark({
    titulo: 'Reclassificar fonte',
    mensagem: `"${fonte.titulo}"\n\nClassificação atual: ${fonte.tipo}`,
    opcoes: TIPOS,
  });
  if (!novoTipo || novoTipo === fonte.tipo) return;

  await sb.from('cerebro_fontes').update({
    tipo: novoTipo,
    metadata: { ...(fonte.metadata || {}), reclassificado_manualmente: new Date().toISOString(), tipo_anterior: fonte.tipo },
  }).eq('id', fonte.id);

  abrirCerebroDetalhe(cerebroAtual.slug);
}

function confirmarDark({ titulo, mensagem, confirmar = 'Confirmar', perigoso = false }) {
  return new Promise((resolve) => {
    const back = el('div', {
      class: 'modal-backdrop modal-confirm',
      style: 'z-index:10001',
      onclick: (e) => { if (e.target === back) fechar(false); }
    });
    const card = el('div', { class: 'modal-card', style: 'max-width:460px' });
    function fechar(v) { back.classList.remove('open'); setTimeout(() => back.remove(), 180); resolve(v); }
    card.append(
      el('div', { class: 'modal-head' }, [ el('h2', {}, titulo) ]),
      el('div', { class: 'modal-body' }, [
        el('p', { style: 'font-size:0.875rem;color:var(--fg-muted);line-height:1.6;white-space:pre-wrap' }, mensagem),
      ]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn btn-ghost', onclick: () => fechar(false) }, 'Cancelar'),
        el('button', {
          class: 'btn btn-primary',
          style: perigoso ? 'background:var(--danger);border-color:var(--danger)' : '',
          onclick: () => fechar(true),
        }, confirmar),
      ]),
    );
    back.append(card);
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}

function escolherDark({ titulo, mensagem, opcoes }) {
  return new Promise((resolve) => {
    const back = el('div', {
      class: 'modal-backdrop modal-confirm',
      style: 'z-index:10001',
      onclick: (e) => { if (e.target === back) fechar(null); }
    });
    const card = el('div', { class: 'modal-card', style: 'max-width:480px' });
    function fechar(v) { back.classList.remove('open'); setTimeout(() => back.remove(), 180); resolve(v); }

    const chips = el('div', { class: 'chips', style: 'display:flex;flex-wrap:wrap;gap:0.375rem' });
    opcoes.forEach(op => {
      const b = el('button', {
        class: 'chip',
        onclick: () => fechar(op.k),
      }, op.l);
      chips.append(b);
    });

    card.append(
      el('div', { class: 'modal-head' }, [ el('h2', {}, titulo) ]),
      el('div', { class: 'modal-body' }, [
        el('p', { style: 'font-size:0.8125rem;color:var(--fg-muted);line-height:1.5;white-space:pre-wrap;margin-bottom:1rem' }, mensagem),
        chips,
      ]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn btn-ghost', onclick: () => fechar(null) }, 'Cancelar'),
      ]),
    );
    back.append(card);
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}

function renderView() {
  const area = document.getElementById('cerebro-view-area');
  if (!area) return;
  area.innerHTML = '';
  document.querySelectorAll('.view-toggle button').forEach((b, i) => {
    b.classList.toggle('active', ['kanban','lista','timeline'][i] === viewModoAtual);
  });

  if (viewModoAtual === 'kanban') {
    const fontes = pecasCache;
    renderKanbanFontes(area, fontes);
  } else if (viewModoAtual === 'lista') {
    const tabela = el('table', { class: 'pecas-tabela' });
    tabela.innerHTML = `<thead><tr>
      <th>Título</th><th>Tipo</th><th>Origem</th><th>Autor</th><th>Data</th><th>Peso</th>
    </tr></thead>`;
    const tbody = el('tbody');
    pecasCache.forEach(p => {
      const tr = el('tr', { onclick: () => abrirDrawer(p) }, [
        el('td', {}, p.titulo),
        el('td', { html: `<span style="color:${coresTipo()[p.tipo]||'#71717A'};font-weight:600">${labelTipo(p.tipo)}</span>` }),
        el('td', {}, p.origem || '—'),
        el('td', {}, p.autor || '—'),
        el('td', {}, new Date(p.criado_em).toLocaleDateString('pt-BR')),
        el('td', {}, String(p.peso || '—')),
      ]);
      tbody.append(tr);
    });
    tabela.append(tbody);
    area.append(tabela);
  } else {
    // timeline
    const tl = el('div', { class: 'timeline' });
    [...pecasCache]
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
      .forEach(p => {
        tl.append(el('div', { class: 'timeline-item', onclick: () => abrirDrawer(p), style: 'cursor:pointer' }, [
          el('h4', {}, p.titulo),
          el('div', { class: 'meta' }, `${labelTipo(p.tipo)} · ${p.autor || 'sem autor'} · ${new Date(p.criado_em).toLocaleString('pt-BR')}`),
        ]));
      });
    area.append(tl);
  }
}

function abrirDrawer(peca) {
  const d = document.getElementById('drawer');
  const title = document.getElementById('drawer-title');
  const body = document.getElementById('drawer-body');
  title.textContent = peca.titulo;
  body.innerHTML = `
    <div class="drawer-meta">
      <b>Tipo</b><span style="color:${coresTipo()[peca.tipo]||'#71717A'};font-weight:600">${labelTipo(peca.tipo)}</span>
      <b>Origem</b><span>${peca.origem || '—'}</span>
      <b>Autor</b><span>${peca.autor || '—'}</span>
      <b>Data</b><span>${new Date(peca.criado_em).toLocaleString('pt-BR')}</span>
      <b>Peso</b><span>${peca.peso || '—'}</span>
      <b>Tags</b><span>${(peca.tags || []).map(t => `<span class="task-tag" style="margin-right:.25rem">${t}</span>`).join('') || '—'}</span>
      ${peca.fonte_url ? `<b>URL</b><span><a href="${peca.fonte_url}" target="_blank">${peca.fonte_url}</a></span>` : ''}
    </div>
    ${peca.conteudo_md ? `<pre>${escapeHtml(peca.conteudo_md.slice(0, 2000))}${peca.conteudo_md.length > 2000 ? '\n\n…(conteúdo truncado, abra no repositório)' : ''}</pre>` : '<em style="color:var(--fg-muted)">Sem conteúdo — fonte sem texto extraível (ex: URL externa).</em>'}
  `;
  d.classList.add('open');
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function initDrawer() {
  const btn = document.getElementById('drawer-close');
  btn?.addEventListener('click', () => document.getElementById('drawer').classList.remove('open'));
}

/* ================================================================
   Kanban de FONTES — colunas por tipo, cards verticais
   Substitui o grafo. Mostra claramente de onde vem cada conteúdo.
   ================================================================ */

const TIPO_ORDEM = [
  'aula', 'pagina_venda', 'objecao',
  'depoimento', 'sacada', 'pitch', 'faq',
  'externo', 'csv', 'outro'
];

const TIPO_META = {
  aula:         { label: 'Aulas',        icon: '📚', desc: 'Transcrições de vídeo-aulas' },
  pagina_venda: { label: 'Páginas',      icon: '📄', desc: 'Copy de página de vendas' },
  objecao:      { label: 'Objeções',     icon: '❓', desc: 'Objeções reais do público' },
  depoimento:   { label: 'Depoimentos',  icon: '⭐', desc: 'Prints + texto de alunos' },
  sacada:       { label: 'Sacadas',      icon: '💡', desc: 'Insights do expert' },
  pitch:        { label: 'Pitch',        icon: '🎯', desc: 'Argumentos de venda' },
  faq:          { label: 'FAQ',          icon: '📖', desc: 'Perguntas frequentes' },
  externo:      { label: 'Externos',     icon: '🔗', desc: 'URLs + materiais de fora' },
  csv:          { label: 'CSV',          icon: '📊', desc: 'Planilhas importadas' },
  outro:        { label: 'Outros',       icon: '📦', desc: 'Sem categoria' },
};

const ORIGEM_META = {
  discord:   { label: 'Discord',   color: '#5865F2' },
  whatsapp:  { label: 'WhatsApp',  color: '#25D366' },
  telegram:  { label: 'Telegram',  color: '#26A5E4' },
  upload:    { label: 'Upload',    color: '#A1A1A1' },
  expert:    { label: 'Expert',    color: '#F5A524' },
  scrap:     { label: 'Scrap',     color: '#EC4899' },
  externo:   { label: 'Externo',   color: '#94A3B8' },
  csv:       { label: 'CSV',       color: '#06B6D4' },
};

function renderKanbanFontes(area, fontes) {
  // Agrupar por tipo
  const grupos = {};
  fontes.forEach(f => {
    if (!grupos[f.tipo]) grupos[f.tipo] = [];
    grupos[f.tipo].push(f);
  });

  // Só colunas que têm fontes, na ordem canonica
  const tiposVisiveis = TIPO_ORDEM.filter(t => grupos[t]?.length > 0);
  // Acrescenta tipos fora da ordem (defensivo)
  Object.keys(grupos).forEach(t => { if (!tiposVisiveis.includes(t)) tiposVisiveis.push(t); });

  const kanban = el('div', { class: 'fontes-kanban' });

  tiposVisiveis.forEach(tipo => {
    const meta = TIPO_META[tipo] || { label: tipo, icon: '📦', desc: '' };
    const cor = `var(--peca-${tipo.replace('_','-')}, var(--peca-outro))`;
    const corBg = `var(--peca-${tipo.replace('_','-')}-bg, var(--peca-outro-bg))`;
    const count = grupos[tipo].length;

    const col = el('div', { class: 'fontes-col' }, [
      el('div', { class: 'fontes-col-header', style: `--col-color: ${cor}; --col-bg: ${corBg}` }, [
        el('div', { class: 'fontes-col-icon' }, meta.icon),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { class: 'fontes-col-title' }, meta.label),
          el('div', { class: 'fontes-col-desc' }, meta.desc),
        ]),
        el('div', { class: 'fontes-col-count' }, String(count)),
      ]),
      el('div', { class: 'fontes-col-body' },
        grupos[tipo].map(f => renderFonteCard(f, tipo))
      ),
    ]);

    kanban.appendChild(col);
  });

  if (tiposVisiveis.length === 0) {
    area.append(el('div', { class: 'stub-screen' }, [
      el('div', { class: 'stub-badge' }, 'vazio'),
      el('h2', {}, 'Este Cérebro ainda não tem fontes'),
      el('p', {}, 'Clique em "+ Alimentar" pra adicionar aulas, páginas, objeções, depoimentos, sacadas, externos. Cada fonte vira uma coluna aqui.'),
    ]));
    return;
  }

  const wrap = el('div', { class: 'fontes-kanban-wrap' }, [kanban]);
  area.append(wrap);

  // detecta overflow pra mostrar indicador de scroll
  requestAnimationFrame(() => {
    const check = () => {
      const hasOverflow = kanban.scrollWidth > kanban.clientWidth + 4
                          && kanban.scrollLeft + kanban.clientWidth < kanban.scrollWidth - 4;
      wrap.classList.toggle('has-overflow', hasOverflow);
    };
    check();
    kanban.addEventListener('scroll', check);
    window.addEventListener('resize', check);
  });
}

function renderFonteCard(fonte, tipo) {
  const origem = fonte.origem || 'upload';
  const origemCfg = ORIGEM_META[origem] || ORIGEM_META.upload;
  const data = fonte.criado_em ? new Date(fonte.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';

  // Menu ⋮
  const btnMenu = el('button', {
    class: 'fonte-card-menu-btn',
    onclick: (ev) => {
      ev.stopPropagation();
      abrirMenuFonte(fonte, btnMenu);
    },
    title: 'Ações',
  }, '⋮');

  const card = el('div', { class: 'fonte-card', onclick: () => abrirDrawer(fonte) }, [
    el('div', { class: 'fonte-card-head' }, [
      el('div', { class: 'fonte-card-title' }, fonte.titulo),
      btnMenu,
    ]),
    el('div', { class: 'fonte-card-meta' }, [
      el('span', {
        class: 'fonte-origem-badge',
        style: `--or-color: ${origemCfg.color}`
      }, origemCfg.label),
      el('span', { class: 'fonte-card-date' }, data),
    ]),
    fonte.autor ? el('div', { class: 'fonte-card-autor' }, `por ${fonte.autor}`) : null,
  ]);

  return card;
}

function abrirMenuFonte(fonte, anchor) {
  // Fecha qualquer menu aberto
  document.querySelectorAll('.fonte-card-menu').forEach(m => m.remove());

  const rect = anchor.getBoundingClientRect();
  const menu = el('div', { class: 'fonte-card-menu' }, [
    el('button', {
      onclick: (e) => { e.stopPropagation(); menu.remove(); abrirDrawer(fonte); },
    }, '👁  Ver conteúdo'),
    el('button', {
      onclick: (e) => { e.stopPropagation(); menu.remove(); reclassificarFonte(fonte); },
    }, '🏷  Reclassificar tipo'),
    el('button', {
      class: 'danger',
      onclick: (e) => { e.stopPropagation(); menu.remove(); excluirFonte(fonte.id); },
    }, '🗑  Excluir fonte'),
  ]);

  // Posiciona na direção certa
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = Math.max(8, rect.right - 180) + 'px';
  menu.style.zIndex = '100';

  document.body.append(menu);

  // Fecha ao clicar fora
  setTimeout(() => {
    const closer = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closer);
      }
    };
    document.addEventListener('click', closer);
  }, 0);
}

/* Gera fontes fake pra estressar o layout de Kanban (10+ tipos, origens variadas) */
function gerarFontesMockadas(cerebro) {
  const nome = cerebro?.nome || 'Elo';
  const hoje = Date.now();
  const d = (daysAgo) => new Date(hoje - daysAgo * 86400000).toISOString();

  return [
    // Aulas (6)
    { id: 'm1', tipo: 'aula', titulo: `Aula 1 — Fundamentos do ${nome}`, origem: 'upload', autor: 'Luiz Fernando', criado_em: d(40) },
    { id: 'm2', tipo: 'aula', titulo: 'Aula 2 — Diagnóstico do aluno', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(38) },
    { id: 'm3', tipo: 'aula', titulo: 'Aula 3 — Protocolo 1: Raio-X', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(35) },
    { id: 'm4', tipo: 'aula', titulo: 'Aula 4 — Protocolo 2: Posicionamento', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(32) },
    { id: 'm5', tipo: 'aula', titulo: 'Aula 5 — Protocolo 3: Oferta irresistível', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(28) },
    { id: 'm6', tipo: 'aula', titulo: 'Aula 6 — Protocolo 4: Venda Viral', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(25) },

    // Páginas (3)
    { id: 'p1', tipo: 'pagina_venda', titulo: 'Página de vendas v1 (Abr/26)', origem: 'externo', autor: 'André', criado_em: d(20) },
    { id: 'p2', tipo: 'pagina_venda', titulo: 'Checkout order bump — Bônus Viral', origem: 'externo', autor: 'André', criado_em: d(18) },
    { id: 'p3', tipo: 'pagina_venda', titulo: 'VSL de abertura do Desafio', origem: 'externo', autor: 'Luiz Fernando', criado_em: d(15) },

    // Depoimentos Discord (5)
    { id: 'd1', tipo: 'depoimento', titulo: 'Aluna fechou R$8k no 3º dia', origem: 'discord', autor: '@maria.freitas', criado_em: d(3) },
    { id: 'd2', tipo: 'depoimento', titulo: 'Feedback sobre aula 4', origem: 'discord', autor: '@rodrigosa', criado_em: d(5) },
    { id: 'd3', tipo: 'depoimento', titulo: 'Resultado primeira semana', origem: 'whatsapp', autor: '+55 11 98…', criado_em: d(6) },
    { id: 'd4', tipo: 'depoimento', titulo: 'Virada de chave após Raio-X', origem: 'discord', autor: '@paula.hc', criado_em: d(8) },
    { id: 'd5', tipo: 'depoimento', titulo: 'Aluno triplicou faturamento', origem: 'telegram', autor: '@jc_marketing', criado_em: d(10) },

    // Objeções (4)
    { id: 'o1', tipo: 'objecao', titulo: '"Não tenho tempo pra implementar"', origem: 'scrap', autor: 'Grupo WhatsApp', criado_em: d(12) },
    { id: 'o2', tipo: 'objecao', titulo: '"Já tentei e não deu certo"', origem: 'scrap', autor: 'Grupo WhatsApp', criado_em: d(14) },
    { id: 'o3', tipo: 'objecao', titulo: '"Muito caro pra mim agora"', origem: 'discord', autor: '@lucas99', criado_em: d(16) },
    { id: 'o4', tipo: 'objecao', titulo: '"Preciso falar com meu sócio"', origem: 'whatsapp', autor: '+55 21 99…', criado_em: d(17) },

    // Sacadas (5)
    { id: 's1', tipo: 'sacada', titulo: 'Gatilho da urgência sazonal', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(2) },
    { id: 's2', tipo: 'sacada', titulo: 'Ancoragem R$47k → R$4.997', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(7) },
    { id: 's3', tipo: 'sacada', titulo: 'História do aluno da aula 2', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(11) },
    { id: 's4', tipo: 'sacada', titulo: 'Protocolo secreto: call de 90min', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(13) },
    { id: 's5', tipo: 'sacada', titulo: 'Script do último e-mail (88% open)', origem: 'expert', autor: 'Luiz Fernando', criado_em: d(19) },

    // Pitch (2)
    { id: 'pi1', tipo: 'pitch', titulo: 'Abertura live — primeiros 7 min', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(22) },
    { id: 'pi2', tipo: 'pitch', titulo: 'Fechamento com prova social', origem: 'upload', autor: 'Luiz Fernando', criado_em: d(21) },

    // FAQ (3)
    { id: 'f1', tipo: 'faq', titulo: 'Como funciona o acesso vitalício?', origem: 'upload', autor: 'Suporte', criado_em: d(24) },
    { id: 'f2', tipo: 'faq', titulo: 'Tem garantia de 7 dias?', origem: 'upload', autor: 'Suporte', criado_em: d(23) },
    { id: 'f3', tipo: 'faq', titulo: 'Funciona pra iniciantes?', origem: 'upload', autor: 'Suporte', criado_em: d(26) },

    // Externos (3)
    { id: 'e1', tipo: 'externo', titulo: 'Podcast Empreendendo — ep.142', origem: 'externo', autor: 'Rodrigo Perez', criado_em: d(45) },
    { id: 'e2', tipo: 'externo', titulo: 'Artigo concorrente — metodologia', origem: 'externo', autor: 'Agência X', criado_em: d(50) },
    { id: 'e3', tipo: 'externo', titulo: 'Benchmarks Dolphin', origem: 'externo', autor: 'Pedro Soli', criado_em: d(55) },

    // CSV (2)
    { id: 'c1', tipo: 'csv', titulo: 'Planilha de vendas T1/26', origem: 'csv', autor: 'FinOps', criado_em: d(33) },
    { id: 'c2', tipo: 'csv', titulo: 'Base de alunos ativos', origem: 'csv', autor: 'André', criado_em: d(34) },
  ];
}

/* ================================================================
   MODAL "+ Alimentar" — upload manual + configuração de cron
   Persiste no localStorage por enquanto (mission-control-fontes).
   Quando Supabase estiver conectado, esse blob vira bulk insert.
   ================================================================ */

const LS_KEY_FONTES = 'mc.fontes.v1';

function abrirModalAlimentar() {
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => {
    if (e.target === backdrop) fecharModal();
  }});
  const modal = el('div', { class: 'modal-card modal-alimentar' });
  modal.append(renderStepModo());
  backdrop.append(modal);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

function fecharModal() {
  const b = document.querySelector('.modal-backdrop');
  if (!b) return;
  b.classList.remove('open');
  setTimeout(() => b.remove(), 180);
}

/* --- PASSO 1: escolher modo (manual vs automático) --- */
function renderStepModo() {
  const step = el('div', { class: 'modal-step' });
  step.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, 'Alimentar Cérebro ' + (cerebroAtual?.nome || '')),
      el('div', { class: 'modal-sub' }, 'Como você quer adicionar fontes agora?'),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'modo-grid modo-grid-3' }, [
        el('button', {
          class: 'modo-card',
          onclick: () => trocarStep(renderStepPacote()),
        }, [
          el('div', { class: 'modo-icon' }, '📦'),
          el('div', { class: 'modo-title' }, 'Pacote'),
          el('div', { class: 'modo-desc' }, 'Sobe um .zip com tudo misturado. O motor extrai, classifica por tipo e vetoriza. Aceita filtro por palavra.'),
        ]),
        el('button', {
          class: 'modo-card',
          onclick: () => trocarStep(renderStepManual()),
        }, [
          el('div', { class: 'modo-icon' }, '📤'),
          el('div', { class: 'modo-title' }, 'Manual'),
          el('div', { class: 'modo-desc' }, 'Upload de 1 arquivo (.md, .txt, .pdf, .csv), colar texto ou link. Você escolhe o tipo.'),
        ]),
        el('button', {
          class: 'modo-card',
          onclick: () => trocarStep(renderStepAutomatico()),
        }, [
          el('div', { class: 'modo-icon' }, '⏱'),
          el('div', { class: 'modo-title' }, 'Automático'),
          el('div', { class: 'modo-desc' }, 'Configurar cron que busca e classifica fontes recorrentes (Discord, WhatsApp, Telegram, RSS).'),
        ]),
      ]),
    ]),
  );
  return step;
}

/* --- PASSO 2C: Pacote (zip) via Edge Function --- */
const MAX_UPLOAD_MB = 50;

/**
 * Modal dark de alerta (substitui alert() feio do browser).
 * Retorna Promise<void>.
 */
function alertarDark({ titulo, mensagem, tipo = 'info' }) {
  return new Promise((resolve) => {
    const back = el('div', {
      class: 'modal-backdrop modal-confirm',
      style: 'z-index:10000',
      onclick: (e) => { if (e.target === back) fechar(); }
    });
    const card = el('div', { class: 'modal-card', style: 'max-width:440px' });
    function fechar() {
      back.classList.remove('open');
      setTimeout(() => back.remove(), 180);
      resolve();
    }

    const icone = tipo === 'erro' ? '✗' : tipo === 'aviso' ? '⚠' : 'ℹ';
    const cor = tipo === 'erro' ? 'var(--danger)' : tipo === 'aviso' ? 'var(--warning)' : 'var(--pc)';

    card.append(
      el('div', { class: 'modal-head' }, [
        el('h2', { style: `color:${cor}` }, `${icone}  ${titulo}`),
      ]),
      el('div', { class: 'modal-body' }, [
        el('p', { style: 'font-size:0.875rem;color:var(--fg-muted);line-height:1.6;white-space:pre-wrap' }, mensagem),
      ]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn btn-primary', onclick: fechar }, 'OK'),
      ]),
    );
    back.append(card);
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}

/**
 * Modal dark de confirmação (substitui confirm() feio do browser).
 * Retorna Promise<boolean>.
 */
function confirmarProcessamento({ nomeArquivo, tamanhoMB, cerebroNome }) {
  return new Promise((resolve) => {
    const back = el('div', {
      class: 'modal-backdrop modal-confirm',
      style: 'z-index:9999',
      onclick: (e) => { if (e.target === back) fechar(false); }
    });
    const card = el('div', { class: 'modal-card', style: 'max-width:480px' });

    function fechar(valor) {
      back.classList.remove('open');
      setTimeout(() => back.remove(), 180);
      resolve(valor);
    }

    card.append(
      el('div', { class: 'modal-head' }, [
        el('h2', {}, `Processar pacote no Cérebro ${cerebroNome}?`),
        el('div', { class: 'modal-sub' }, `Confirma que todo o conteúdo do zip é do ${cerebroNome}`),
      ]),
      el('div', { class: 'modal-body' }, [
        el('div', { class: 'cron-infobox', style: 'margin:0' }, [
          el('strong', {}, `📦 ${nomeArquivo}`),
          el('p', { style: 'font-family:var(--font-mono);font-size:0.6875rem;letter-spacing:0.08em;margin-top:2px' }, `${tamanhoMB} MB`),
        ]),
        el('p', { style: 'font-size:0.875rem;color:var(--fg-muted);margin-top:0.875rem;line-height:1.5' },
          `Todos os arquivos dentro deste zip serão classificados e vetorizados como conteúdo do Cérebro ${cerebroNome}.`
        ),
        el('p', { style: 'font-size:0.8125rem;color:var(--fg-dim);margin-top:0.5rem;line-height:1.5' },
          `Se o zip tiver material de outros produtos misturado, eles entrarão no Cérebro errado. Cancele e verifique o conteúdo antes de prosseguir.`
        ),
      ]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn btn-ghost', onclick: () => fechar(false) }, 'Cancelar'),
        el('button', { class: 'btn btn-primary', onclick: () => fechar(true) }, 'Processar pacote'),
      ]),
    );

    back.append(card);
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}

function renderStepPacote() {
  let arquivoSelecionado = null;
  let pollInterval = null;
  const cerebroNome = cerebroAtual?.nome || '';
  const cerebroSlug = cerebroAtual?.slug || '';

  const step = el('div', { class: 'modal-step' });

  const inputArquivo = el('input', {
    type: 'file',
    accept: '.zip',
    style: 'display:none',
    id: 'pacote-file-input',
    onchange: (e) => {
      arquivoSelecionado = e.target.files[0];
      renderArquivo();
      atualizarBotao();
    }
  });

  const btnEscolher = el('button', {
    class: 'btn',
    onclick: () => inputArquivo.click(),
  }, '📎 Escolher arquivo .zip');

  const infoArquivo = el('div', { class: 'arquivos-lista' });
  const avisoLimite = el('div', { style: 'display:none' });

  function renderArquivo() {
    infoArquivo.innerHTML = '';
    avisoLimite.style.display = 'none';
    avisoLimite.innerHTML = '';
    if (!arquivoSelecionado) return;
    const mb = arquivoSelecionado.size / 1024 / 1024;
    infoArquivo.append(el('div', { class: 'arquivo-row' }, [
      el('span', { class: 'arquivo-icon' }, '📦'),
      el('span', { class: 'arquivo-nome' }, arquivoSelecionado.name),
      el('span', { class: 'arquivo-size' }, `${mb.toFixed(1)} MB`),
      el('button', {
        class: 'arquivo-remove',
        onclick: () => { arquivoSelecionado = null; inputArquivo.value = ''; renderArquivo(); atualizarBotao(); }
      }, '×'),
    ]));
    if (mb > MAX_UPLOAD_MB) {
      avisoLimite.style.display = '';
      avisoLimite.innerHTML = `<div class="cron-infobox"><strong>Arquivo muito grande</strong><p>Limite é ${MAX_UPLOAD_MB}MB por upload. Divida este zip em 2 ou 3 pacotes menores e suba um de cada vez.</p></div>`;
    }
  }

  const areaProgresso = el('div', { style: 'display:none' });

  function atualizarBotao() {
    const ok = arquivoSelecionado && (arquivoSelecionado.size / 1024 / 1024) <= MAX_UPLOAD_MB;
    btnProcessar.disabled = !ok;
    btnProcessar.style.opacity = ok ? '1' : '0.5';
    btnProcessar.style.cursor = ok ? 'pointer' : 'not-allowed';
  }

  let processandoAgora = false; // trava anti-double-click

  const btnProcessar = el('button', {
    class: 'btn btn-primary',
    disabled: true,
    style: 'opacity:0.5',
    onclick: async () => {
      if (processandoAgora) return;
      if (!arquivoSelecionado) return;

      const sb = getSupabase();
      if (!sb) { await alertarDark({ titulo: 'Sem conexão', mensagem: 'Supabase não conectado. Recarregue a página e tente de novo.', tipo: 'erro' }); return; }

      // Confirmação via modal dark
      const confirma = await confirmarProcessamento({
        nomeArquivo: arquivoSelecionado.name,
        tamanhoMB: (arquivoSelecionado.size / 1024 / 1024).toFixed(1),
        cerebroNome,
      });
      if (!confirma) return;

      // TRAVA imediata + feedback visual instantâneo
      processandoAgora = true;
      btnProcessar.disabled = true;
      btnProcessar.style.pointerEvents = 'none';
      btnProcessar.innerHTML = '<span class="btn-spinner"></span> Preparando…';

      // Mostra área de progresso JÁ com upload bar
      areaProgresso.style.display = '';
      areaProgresso.innerHTML = '';
      const uploadStatus = el('div', { class: 'progresso-status' }, '⬆ Preparando upload…');
      const uploadBarWrap = el('div', { class: 'upload-bar-wrap' });
      const uploadBar = el('div', { class: 'upload-bar' });
      uploadBarWrap.append(uploadBar);
      areaProgresso.append(uploadStatus, uploadBarWrap);

      try {
        // 1. Busca produto
        const { data: prod, error: eProd } = await sb.from('produtos').select('id').eq('slug', cerebroSlug).single();
        if (eProd || !prod) throw new Error('Produto não encontrado: ' + cerebroSlug);
        const { data: cer, error: eCer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
        if (eCer || !cer) throw new Error('Cérebro não encontrado');

        // 2. Cria lote
        const { data: lote, error: eLote } = await sb.from('ingest_lotes').insert({
          cerebro_id: cer.id,
          tipo: 'pacote_zip',
          status: 'recebido',
          nome_arquivo: arquivoSelecionado.name,
          tamanho_bytes: arquivoSelecionado.size,
          disparado_por: 'painel',
          disparado_via: 'web',
        }).select('id').single();
        if (eLote) throw new Error('Erro ao criar lote: ' + eLote.message);

        const storagePath = `lote/${lote.id}/${arquivoSelecionado.name}`;

        // 3. Upload COM progresso real (via XHR direto pra API de storage)
        uploadStatus.innerHTML = `<strong>⬆ Enviando zip para o servidor…</strong> 0% · 0 / ${(arquivoSelecionado.size / 1024 / 1024).toFixed(1)} MB`;

        await uploadZipComProgresso({
          file: arquivoSelecionado,
          storagePath,
          supabaseUrl: window.__ENV__.SUPABASE_URL,
          anonKey: window.__ENV__.SUPABASE_ANON_KEY,
          onProgress: (pct, loaded, total) => {
            uploadBar.style.width = pct + '%';
            uploadStatus.innerHTML = `<strong>⬆ Enviando zip para o servidor…</strong> ${pct}% · ${(loaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`;
          },
        });

        uploadBar.style.width = '100%';
        uploadStatus.innerHTML = `<strong>✓ Upload concluído</strong> · Acionando o motor de ingestão…`;

        // 4. Dispara Edge Function (fire & forget)
        const envCfg = window.__ENV__ || {};
        fetch(`${envCfg.SUPABASE_URL}/functions/v1/ingest-pacote`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${envCfg.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lote_id: lote.id,
            storage_path: storagePath,
            cerebro_id: cer.id,
            origem: 'lote',
          }),
        }).catch(e => console.error('erro dispatch function:', e));

        // 5. Troca pro layout de progresso do processamento
        areaProgresso.innerHTML = '';
        const status = el('div', { class: 'progresso-status' }, '⏳ Iniciando processamento no servidor…');
        const progressoWrap = el('div', { class: 'progresso-bar-wrap' });
        const progressoBar = el('div', { class: 'progresso-bar' });
        progressoWrap.append(progressoBar);
        const tabela = el('div', { class: 'progresso-tabela' });
        areaProgresso.append(status, progressoWrap, tabela);

        btnProcessar.style.display = 'none';

        const statusMap = {
          recebido: '⏳ Recebido, aguardando worker',
          extraindo: '📂 Abrindo zip e extraindo arquivos',
          classificando: '🧠 Classificando tipo de cada fonte (IA)',
          vetorizando: '🔢 Vetorizando texto pra busca semântica',
          concluido: '✅ Concluído',
          falhou: '❌ Falhou',
        };

        // Estima chunks esperados: ~ 15 por fonte (média conservadora)
        const estimarChunksTotal = (fontes) => Math.max(1, fontes * 15);

        function calcularProgresso(lote) {
          const total = lote.arquivos_totais || 0;
          const fontes = lote.fontes_criadas || 0;
          const chunks = lote.chunks_criados || 0;

          if (lote.status === 'recebido') return 2;
          if (lote.status === 'extraindo') return 5;
          if (lote.status === 'classificando') {
            // 10% inicial + até 50% adicional conforme fontes vão sendo criadas
            if (total === 0) return 10;
            return 10 + Math.round((fontes / total) * 50);
          }
          if (lote.status === 'vetorizando') {
            // 60% + até 38% adicional conforme chunks entram
            const esperados = estimarChunksTotal(fontes);
            if (esperados === 0) return 60;
            const pct = Math.min(1, chunks / esperados);
            return 60 + Math.round(pct * 38);
          }
          if (lote.status === 'concluido') return 100;
          if (lote.status === 'falhou') return 100;
          return 0;
        }

        pollInterval = setInterval(async () => {
          try {
            const { data: loteRow } = await sb.from('ingest_lotes')
              .select('id, status, arquivos_totais, fontes_criadas, chunks_criados, em_quarentena, custo_usd, duracao_ms, log_md, erro_detalhes')
              .eq('id', lote.id).single();

            if (!loteRow) return;

            const pct = calcularProgresso(loteRow);
            progressoBar.style.width = pct + '%';
            if (loteRow.status === 'falhou') progressoBar.classList.add('falhou');

            status.innerHTML = `<strong>${statusMap[loteRow.status] || loteRow.status}</strong> · ${pct}% · ${loteRow.arquivos_totais || 0} arquivos · ${loteRow.fontes_criadas || 0} fontes · ${loteRow.chunks_criados || 0} chunks`;

            const { data: arqs } = await sb.from('ingest_arquivos')
              .select('nome_original, tipo_sugerido, tipo_confianca, status')
              .eq('lote_id', lote.id)
              .order('criado_em', { ascending: false })
              .limit(15);

            tabela.innerHTML = '';
            if (arqs && arqs.length > 0) {
              const header = el('div', { class: 'progresso-tabela-header' }, [
                el('div', {}, 'Arquivo'),
                el('div', {}, 'Tipo'),
                el('div', {}, 'Status'),
              ]);
              tabela.append(header);
              arqs.forEach(a => {
                const statusLabel = a.status === 'ok' ? '✓' : a.status === 'quarentena' ? '⚠' : a.status === 'erro' ? '✗' : '…';
                tabela.append(el('div', { class: 'progresso-tabela-row' }, [
                  el('div', { class: 'progresso-nome' }, a.nome_original || '—'),
                  el('div', {}, a.tipo_sugerido || '—'),
                  el('div', {}, statusLabel + ' ' + (a.status || '')),
                ]));
              });
            }

            if (loteRow.status === 'concluido' || loteRow.status === 'falhou') {
              clearInterval(pollInterval);
              pollInterval = null;
              if (loteRow.log_md) {
                areaProgresso.append(el('pre', { class: 'progresso-relatorio' }, loteRow.log_md));
              }
              if (loteRow.erro_detalhes && loteRow.status === 'falhou') {
                areaProgresso.append(el('pre', { class: 'progresso-relatorio', style: 'color:var(--danger)' }, 'Erro: ' + loteRow.erro_detalhes));
              }
              areaProgresso.append(el('div', { class: 'progresso-footer' }, [
                el('button', {
                  class: 'btn btn-primary',
                  onclick: () => { fecharModal(); abrirCerebroDetalhe(cerebroSlug); }
                }, loteRow.status === 'concluido' ? 'Fechar e ver fontes' : 'Fechar'),
              ]));
            }
          } catch (e) {
            console.error('erro polling', e);
          }
        }, 3000);

      } catch (e) {
        processandoAgora = false;
        await alertarDark({ titulo: 'Falha no envio', mensagem: e.message, tipo: 'erro' });
        btnProcessar.disabled = false;
        btnProcessar.style.pointerEvents = '';
        btnProcessar.style.display = '';
        btnProcessar.textContent = 'Iniciar';
        atualizarBotao();
        areaProgresso.style.display = 'none';
        areaProgresso.innerHTML = '';
      }
    }
  }, 'Iniciar');

  // Upload com progresso real via XHR (supabase-js não expõe progress no upload)
  function uploadZipComProgresso({ file, storagePath, supabaseUrl, anonKey, onProgress }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${supabaseUrl}/storage/v1/object/pinguim-uploads/${storagePath}`;
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${anonKey}`);
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          onProgress(pct, ev.loaded, ev.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload HTTP ${xhr.status}: ${xhr.responseText || ''}`));
      };
      xhr.onerror = () => reject(new Error('Erro de rede no upload'));
      xhr.send(file);
    });
  }

  step.append(
    el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-back', onclick: () => { if (pollInterval) clearInterval(pollInterval); trocarStep(renderStepModo()); } }, '‹'),
      el('h2', {}, 'Alimentação em pacote'),
      el('div', { class: 'modal-sub' }, `Cérebro ${cerebroNome} — tudo no zip entra como conteúdo do ${cerebroNome}`),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'cron-infobox' }, [
        el('strong', {}, `📦 Pacote do ${cerebroNome}`),
        el('p', {}, `Antes de enviar, garanta que o .zip contém SÓ material do ${cerebroNome}. O sistema classifica os tipos automaticamente, mas confia que o produto é ${cerebroNome}. Se misturar material de outros produtos, eles entram no Cérebro errado.`),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Arquivo .zip (limite: ' + MAX_UPLOAD_MB + 'MB)'),
        btnEscolher,
        inputArquivo,
        infoArquivo,
        avisoLimite,
      ]),
      areaProgresso,
    ]),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', onclick: fecharModal }, 'Cancelar'),
      btnProcessar,
    ]),
  );

  return step;
}

function trocarStep(newStep) {
  const card = document.querySelector('.modal-alimentar');
  if (!card) return;
  card.innerHTML = '';
  card.append(newStep);
}

/* --- PASSO 2A: Manual --- */
function renderStepManual() {
  const TIPOS_CHIPS = [
    { k: 'aula', l: 'Aula' },
    { k: 'pagina_venda', l: 'Página' },
    { k: 'objecao', l: 'Objeção' },
    { k: 'depoimento', l: 'Depoimento' },
    { k: 'sacada', l: 'Sacada' },
    { k: 'pitch', l: 'Pitch' },
    { k: 'faq', l: 'FAQ' },
    { k: 'externo', l: 'Externo' },
    { k: 'csv', l: 'CSV' },
  ];

  let tipoSelecionado = 'aula';
  let arquivosSelecionados = [];

  const step = el('div', { class: 'modal-step' });

  const chips = el('div', { class: 'chips' });
  TIPOS_CHIPS.forEach((t, i) => {
    const c = el('button', {
      class: 'chip' + (i === 0 ? ' selected' : ''),
      onclick: () => {
        chips.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        tipoSelecionado = t.k;
        inputOutro.value = '';
      }
    }, t.l);
    chips.append(c);
  });

  const inputOutro = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Outro tipo (ex: entrevista, podcast, benchmark…)',
    oninput: (e) => {
      if (e.target.value.trim()) {
        chips.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
        tipoSelecionado = e.target.value.trim().toLowerCase().replace(/\s+/g, '_');
      }
    }
  });

  const listaArquivos = el('div', { class: 'arquivos-lista' });

  const renderListaArquivos = () => {
    listaArquivos.innerHTML = '';
    arquivosSelecionados.forEach((f, idx) => {
      listaArquivos.append(el('div', { class: 'arquivo-row' }, [
        el('span', { class: 'arquivo-icon' }, '📄'),
        el('span', { class: 'arquivo-nome' }, f.name),
        el('span', { class: 'arquivo-size' }, `${(f.size/1024).toFixed(1)} KB`),
        el('button', { class: 'arquivo-remove', onclick: () => {
          arquivosSelecionados.splice(idx, 1);
          renderListaArquivos();
        }}, '×'),
      ]));
    });
  };

  const inputArquivo = el('input', {
    type: 'file',
    multiple: '',
    accept: '.md,.txt,.pdf,.csv,.docx',
    style: 'display:none',
    id: 'modal-file-input',
    onchange: (e) => {
      arquivosSelecionados = [...arquivosSelecionados, ...Array.from(e.target.files)];
      renderListaArquivos();
    }
  });

  const btnUpload = el('button', {
    class: 'btn',
    onclick: () => inputArquivo.click()
  }, '📎 Selecionar arquivos');

  const textoColar = el('textarea', {
    class: 'textarea',
    placeholder: 'Ou cole texto aqui (transcrição, depoimento, etc)…',
    rows: '4',
  });

  const autorInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Autor (opcional — ex: Luiz Fernando, @user discord)',
  });

  const origemInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Origem (ex: upload, discord, whatsapp, scrap, expert)',
    value: 'upload',
  });

  const urlInput = el('input', {
    class: 'input',
    type: 'url',
    placeholder: 'URL da fonte (opcional)',
  });

  const btnSalvar = el('button', {
    class: 'btn btn-primary',
    onclick: () => {
      const arquivos = arquivosSelecionados;
      const textoPuro = textoColar.value.trim();
      if (arquivos.length === 0 && !textoPuro) {
        alert('Selecione ao menos 1 arquivo ou cole um texto.');
        return;
      }

      const novasFontes = [];

      arquivos.forEach(f => {
        novasFontes.push({
          id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6),
          cerebro_slug: cerebroAtual.slug,
          tipo: tipoSelecionado,
          titulo: f.name.replace(/\.[^.]+$/, ''),
          origem: origemInput.value.trim() || 'upload',
          autor: autorInput.value.trim() || null,
          criado_em: new Date().toISOString(),
          arquivo_nome: f.name,
          arquivo_size: f.size,
          url: urlInput.value.trim() || null,
        });
      });

      if (textoPuro) {
        const titulo = textoPuro.slice(0, 60).replace(/\n/g,' ') + (textoPuro.length > 60 ? '…' : '');
        novasFontes.push({
          id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
          cerebro_slug: cerebroAtual.slug,
          tipo: tipoSelecionado,
          titulo,
          conteudo_md: textoPuro,
          origem: origemInput.value.trim() || 'upload',
          autor: autorInput.value.trim() || null,
          criado_em: new Date().toISOString(),
          url: urlInput.value.trim() || null,
        });
      }

      salvarFontesLocais(novasFontes);
      fecharModal();

      alert(`${novasFontes.length} fonte${novasFontes.length === 1 ? '' : 's'} adicionada${novasFontes.length === 1 ? '' : 's'} ao Cérebro ${cerebroAtual.nome}.\n\nObs: salvo em localStorage (demo). Quando o Supabase estiver conectado, vira persist real no banco.`);

      abrirCerebroDetalhe(cerebroAtual.slug);
    }
  }, 'Alimentar Cérebro');

  step.append(
    el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-back', onclick: () => trocarStep(renderStepModo()) }, '‹'),
      el('h2', {}, 'Alimentação manual'),
      el('div', { class: 'modal-sub' }, `Cérebro ${cerebroAtual?.nome || ''} — adicione uma ou várias fontes`),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'field' }, [
        el('label', {}, 'Tipo da fonte'),
        chips,
        inputOutro,
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Arquivos'),
        btnUpload,
        inputArquivo,
        listaArquivos,
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Ou cole texto'),
        textoColar,
      ]),
      el('div', { class: 'row2' }, [
        el('div', { class: 'field' }, [
          el('label', {}, 'Origem'),
          origemInput,
        ]),
        el('div', { class: 'field' }, [
          el('label', {}, 'Autor'),
          autorInput,
        ]),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'URL (opcional)'),
        urlInput,
      ]),
    ]),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', onclick: fecharModal }, 'Cancelar'),
      btnSalvar,
    ]),
  );

  return step;
}

/* --- PASSO 2B: Automático (configura cron) --- */
function renderStepAutomatico() {
  const step = el('div', { class: 'modal-step' });

  step.append(
    el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-back', onclick: () => trocarStep(renderStepModo()) }, '‹'),
      el('h2', {}, 'Alimentação automática'),
      el('div', { class: 'modal-sub' }, 'Configure um cron que roda no Supabase'),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'cron-infobox' }, [
        el('strong', {}, '💡 Como funciona'),
        el('p', {}, 'Crons rodam direto no Supabase (pg_cron + edge functions) — não dependem do OpenClaw. Cada cron busca conteúdo num canal, classifica o tipo e grava no Cérebro correto automaticamente.'),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Fonte'),
        el('select', { class: 'input', id: 'cron-canal' }, [
          el('option', { value: 'discord' }, 'Discord (canal #depoimentos)'),
          el('option', { value: 'whatsapp' }, 'WhatsApp (grupo via webhook)'),
          el('option', { value: 'telegram' }, 'Telegram (bot + chat_id)'),
          el('option', { value: 'rss' }, 'RSS / feed externo'),
          el('option', { value: 'drive' }, 'Google Drive (pasta monitorada)'),
        ]),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Frequência'),
        el('select', { class: 'input', id: 'cron-freq' }, [
          el('option', { value: '*/15 * * * *' }, 'A cada 15 minutos'),
          el('option', { value: '0 * * * *' }, 'A cada hora'),
          el('option', { value: '0 */6 * * *' }, 'A cada 6 horas'),
          el('option', { value: '0 9 * * *' }, 'Diariamente às 9h'),
          el('option', { value: '0 9 * * 1' }, 'Semanalmente (segunda 9h)'),
        ]),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Tipo padrão (quando curador não conseguir classificar)'),
        el('input', { class: 'input', type: 'text', placeholder: 'ex: depoimento', id: 'cron-tipo', value: 'depoimento' }),
      ]),

      el('div', { class: 'field' }, [
        el('label', {}, 'Observação'),
        el('textarea', { class: 'textarea', rows: '2', placeholder: 'Ex: Scrape do canal #depoimentos do Discord, prioridade tag @validado', id: 'cron-obs' }),
      ]),
    ]),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', onclick: fecharModal }, 'Cancelar'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          const canal = document.getElementById('cron-canal').value;
          const freq = document.getElementById('cron-freq').value;
          const tipo = document.getElementById('cron-tipo').value;
          const obs = document.getElementById('cron-obs').value;

          const cron = {
            id: 'cr' + Date.now(),
            cerebro_slug: cerebroAtual.slug,
            canal, freq, tipo_padrao: tipo, obs,
            criado_em: new Date().toISOString(),
            status: 'pendente_supabase',
          };

          const crons = JSON.parse(localStorage.getItem('mc.crons.v1') || '[]');
          crons.push(cron);
          localStorage.setItem('mc.crons.v1', JSON.stringify(crons));

          fecharModal();
          alert(`Cron configurado para ${cerebroAtual.nome}.\n\nCanal: ${canal}\nFrequência: ${freq}\n\nPendente de ativação no Supabase (pg_cron). Veja a tela Crons no sidebar.`);
        }
      }, 'Criar cron'),
    ]),
  );

  return step;
}

/* --- Persistência local --- */
function salvarFontesLocais(fontes) {
  const atual = JSON.parse(localStorage.getItem(LS_KEY_FONTES) || '[]');
  atual.push(...fontes);
  localStorage.setItem(LS_KEY_FONTES, JSON.stringify(atual));
}

export function lerFontesLocaisPorCerebro(slug) {
  const atual = JSON.parse(localStorage.getItem(LS_KEY_FONTES) || '[]');
  return atual.filter(f => f.cerebro_slug === slug);
}
