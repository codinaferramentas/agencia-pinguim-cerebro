/* Tela Cérebros — catálogo + detalhe com Grafo/Lista/Timeline */

import { fetchCerebrosCatalogo, fetchCerebroPecas, getSupabase } from './sb-client.js?v=20260421p';
import { renderGrafo, coresTipo, labelTipo } from './grafo.js?v=20260421p';
import { iniciarSquadParalelo } from './squad-modal.js?v=20260425e';
import { iconeNode } from './icone.js?v=20260425g';
import { processarUrl } from './integracoes.js?v=20260425n';

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

export async function renderCerebros() {
  const page = document.getElementById('page-cerebros');
  page.innerHTML = '';
  page.append(el('div', { html: '<div style="padding:3rem;color:var(--fg-muted);text-align:center">Carregando cérebros…</div>' }));

  try {
    cerebrosCache = await fetchCerebrosCatalogo();
  } catch (e) {
    page.innerHTML = `<div style="padding:2rem;color:var(--status-alerta)">Erro: ${e.message}</div>`;
    return;
  }

  // "Cérebro é o pai de tudo" — só aparece cérebro com fonte
  // Cérebros cadastrados mas sem fonte ficam acessíveis via modal "+ Novo Cérebro"
  const cerebrosVisiveis = cerebrosCache.filter(c =>
    c.slug !== 'pinguim' && (c.total_fontes || 0) > 0
  );

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
      }, '+ Novo Cérebro'),
    ]),
    cerebrosVisiveis.length === 0
      ? el('div', { class: 'stub-screen' }, [
          el('div', { class: 'stub-badge' }, 'vazio'),
          el('h2', {}, 'Nenhum Cérebro alimentado ainda'),
          el('p', {}, 'Cérebros aparecem aqui assim que recebem a primeira fonte. Clique em "+ Novo Cérebro" pra criar ou continuar alimentando um existente.'),
          el('button', {
            class: 'btn btn-primary',
            style: 'margin-top:1rem',
            onclick: () => abrirModalNovoProduto(),
          }, '+ Novo Cérebro'),
        ])
      : el('div', { class: 'cerebros-grid' }, [
          ...cerebrosVisiveis.map(renderCerebroCard),
          el('button', {
            class: 'btn-add-produto',
            onclick: () => abrirModalNovoProduto()
          }, '+ Novo Cérebro'),
        ]),
  );
}

function renderCerebroCard(c) {
  const isPinguim = c.slug === 'pinguim';
  const atualizacao = formatarAtualizacao(c.ultima_alimentacao);
  const tiposPresentes = construirTiposDinamicos(c);
  // Usa total_fontes da view (número real do banco), não soma dos tipos conhecidos
  const totalFontes = c.total_fontes || 0;

  return el('div', {
    class: 'cerebro-card' + (isPinguim ? ' featured' : ''),
    onclick: () => abrirCerebroDetalhe(c.slug)
  }, [
    el('div', { class: 'cerebro-card-top' }, [
      iconeNode({ icone_url: c.icone_url, emoji: c.emoji, nome: c.nome }, { size: 'lg', className: 'cerebro-emoji' }),
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
  // "Outros" = total_fontes (número real no banco) menos os tipos já listados
  const outros = Math.max(0, (c.total_fontes || 0) - contados);
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

async function abrirModalNovoProduto() {
  const sb = getSupabase();
  if (!sb) { await alertarDark({ titulo: 'Sem conexão', mensagem: 'Supabase não conectado.', tipo: 'erro' }); return; }

  // Busca produtos cadastrados que ainda não têm fonte
  const [{ data: prods }, { data: cats }] = await Promise.all([
    sb.from('produtos').select('id, slug, nome, emoji, descricao').order('nome'),
    sb.from('vw_cerebros_catalogo').select('slug, total_fontes'),
  ]);
  const semFonte = new Set((cats || []).filter(c => (c.total_fontes || 0) === 0).map(c => c.slug));
  const pendentes = (prods || []).filter(p => semFonte.has(p.slug));

  const back = el('div', {
    class: 'modal-backdrop',
    onclick: (e) => { if (e.target === back) fechar(); }
  });
  const card = el('div', { class: 'modal-card', style: 'max-width:600px' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  card.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, 'Novo Cérebro'),
      el('div', { class: 'modal-sub' }, 'Como você quer criar este Cérebro?'),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      // Caminho A — produto novo (em destaque agora — é o caso principal)
      el('div', { class: 'novo-cerebro-secao' }, [
        el('div', { class: 'novo-cerebro-label' }, '➕ Cadastrar produto novo'),
        el('div', { class: 'novo-cerebro-help' }, 'Cria um Cérebro novo. Pode alimentar agora ou depois — fica disponível na lista.'),
        el('form', {
          class: 'novo-cerebro-form',
          onsubmit: async (ev) => {
            ev.preventDefault();
            const nome = ev.target.nome.value.trim();
            const emoji = ev.target.emoji.value.trim() || '📦';
            const descricao = ev.target.descricao.value.trim() || null;
            if (!nome) return;
            const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

            // Cria produto
            const { data: prod, error: eProd } = await sb.from('produtos').insert({
              slug, nome, emoji, descricao, status: 'em_construcao',
            }).select('id').single();
            if (eProd) {
              await alertarDark({ titulo: 'Falha ao cadastrar', mensagem: eProd.message, tipo: 'erro' });
              return;
            }

            // Cria cérebro ligado ao produto
            const { error: eCer } = await sb.from('cerebros').insert({ produto_id: prod.id });
            if (eCer) {
              await alertarDark({ titulo: 'Falha ao criar Cérebro', mensagem: eCer.message, tipo: 'erro' });
              return;
            }

            fechar();
            cerebrosCache = await fetchCerebrosCatalogo();
            // Sinaliza pro app refrescar subnav e qualquer dependente
            window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'cerebro_criado', slug } }));
            abrirCerebroDetalhe(slug);
          },
        }, [
          el('input', { name: 'nome', placeholder: 'Nome do produto (ex: Protocolo Venda Viral)', required: 'true', class: 'form-input' }),
          el('div', { style: 'display:flex;gap:.5rem' }, [
            el('input', { name: 'emoji', placeholder: '📦', maxlength: 4, style: 'width:80px', class: 'form-input' }),
            el('input', { name: 'descricao', placeholder: 'Descrição curta (opcional)', class: 'form-input', style: 'flex:1' }),
          ]),
          el('button', { type: 'submit', class: 'btn btn-primary' }, 'Cadastrar + Alimentar'),
        ]),
      ]),

      // Atalho opcional — abrir Cérebros já existentes que ainda estão sem fontes
      pendentes.length > 0
        ? el('div', {
            class: 'novo-cerebro-secao',
            style: 'border-top:1px solid var(--border-subtle);padding-top:1.25rem;margin-top:1.25rem',
          }, [
            el('div', {
              style: 'font-size:.75rem;color:var(--fg-muted);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:0.08em;font-family:var(--font-mono)',
            }, 'Atalho · Cérebros existentes sem fontes'),
            el('div', { style: 'font-size:.8125rem;color:var(--fg-muted);margin-bottom:.625rem' },
              'Já cadastrados — clique pra abrir e começar a alimentar quando quiser:'),
            el('div', { class: 'novo-cerebro-lista' }, pendentes.map(p => el('button', {
              class: 'novo-cerebro-item',
              onclick: async () => { fechar(); await cerebrosCache; cerebrosCache = await fetchCerebrosCatalogo(); abrirCerebroDetalhe(p.slug); },
            }, [
              el('span', { class: 'novo-cerebro-emoji' }, p.emoji || '📦'),
              el('div', { style: 'flex:1;text-align:left' }, [
                el('div', { style: 'font-weight:600' }, p.nome),
                el('div', { style: 'font-size:.75rem;color:var(--fg-muted)' }, p.descricao || '—'),
              ]),
              el('span', { style: 'font-size:.75rem;color:var(--fg-muted)' }, 'Abrir →'),
            ]))),
          ])
        : null,
    ]),
  );

  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

/* ----- Tela detalhada de 1 cérebro ----- */
let pecasCache = [];
let cerebroAtual = null;
let viewModoAtual = 'kanban';

export async function abrirCerebroDetalhe(slug) {
  cerebroAtual = cerebrosCache.find(c => c.slug === slug);
  if (!cerebroAtual) return;

  // Mantém subnav sincronizado (destaca o cérebro ativo na sidebar)
  window.__marcarSubnavAtivo?.(slug);

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
  pecasCache = fontesServidor;

  // Conta arquivos em quarentena (UX: botão so aparece se há)
  let qtdQuarentena = 0;
  try {
    const sb = getSupabase();
    if (sb) {
      const { data: prod } = await sb.from('produtos').select('id').eq('slug', slug).single();
      if (prod) {
        const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
        if (cer) {
          const { count } = await sb.from('ingest_arquivos')
            .select('id', { count: 'exact', head: true })
            .eq('cerebro_id', cer.id)
            .eq('status', 'quarentena');
          qtdQuarentena = count || 0;
        }
      }
    }
  } catch (e) { console.warn('Erro contando quarentena:', e); }

  page.innerHTML = '';
  const acoes = el('div', { class: 'cerebro-detail-actions' }, [
    el('button', { class: 'btn btn-primary', onclick: () => abrirModalAlimentar() }, '+ Alimentar'),
    qtdQuarentena > 0
      ? el('button', {
          class: 'btn',
          style: 'color:var(--warning,#f59e0b);border-color:rgba(245,158,11,0.4)',
          onclick: () => abrirQuarentena(),
          title: 'Arquivos que não foram indexados — gerencie aqui',
        }, `⚠ Quarentena (${qtdQuarentena})`)
      : null,
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
    iconeNode({ icone_url: cerebroAtual.icone_url, emoji: cerebroAtual.emoji, nome: cerebroAtual.nome }, { size: 'xl', className: 'cerebro-emoji' }),
    el('div', { style: 'flex:1' }, [
      el('div', { style: 'display:flex;align-items:center;gap:.5rem' }, [
        el('div', { class: 'cerebro-nome' }, `Cérebro ${cerebroAtual.nome}`),
        el('button', {
          class: 'btn-icon-edit',
          title: 'Editar nome, emoji e descrição',
          onclick: () => abrirEditarCerebro(),
        }, '✎'),
      ]),
      el('div', { class: 'cerebro-desc' }, cerebroAtual.descricao || '—'),
      el('div', { style: 'display:flex;gap:.75rem;margin-top:.5rem;font-size:.75rem;color:var(--fg-muted)' }, [
        el('span', { class: 'cerebro-detalhe-header-count' }, `${pecasCache.length} font${pecasCache.length === 1 ? 'e' : 'es'}`),
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

  const buscaSemantica = pecasCache.length > 0 ? blocoBuscaSemantica() : null;

  const viewArea = el('div', { id: 'cerebro-view-area' });

  page.append(el('div', { class: 'cerebro-detail' }, [
    header,
    buscaSemantica,
    toggle,
    viewArea,
  ].filter(Boolean)));

  renderView();
}

/* ================================================================
   BUSCA SEMÂNTICA — campo de busca + modal de resultados
   ================================================================ */
function blocoBuscaSemantica() {
  const wrap = el('div', { class: 'busca-semantica-wrap' });
  const input = el('input', {
    type: 'search',
    class: 'busca-semantica-input',
    placeholder: 'Buscar no Cérebro… ex: "qual a maior dor do aluno?", "objeções de preço", "depoimentos sobre transformação"',
  });
  const btn = el('button', { class: 'btn btn-primary busca-semantica-btn' }, '🔍 Buscar');

  async function executar() {
    const q = input.value.trim();
    if (q.length < 3) return;
    btn.disabled = true; btn.textContent = 'Buscando…';
    try {
      const sb = getSupabase();
      const { data: prod } = await sb.from('produtos').select('id').eq('slug', cerebroAtual.slug).single();
      const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();

      const { data: { session } } = await sb.auth.getSession();
      const fnUrl = `${window.__ENV__.SUPABASE_URL}/functions/v1/buscar-cerebro`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': window.__ENV__.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cerebro_id: cer.id, query: q, top_k: 12, min_similarity: 0.25 }),
      });
      const r = await resp.json();
      if (r.error) throw new Error(r.error);
      mostrarResultadosBusca(q, r);
    } catch (e) {
      await alertarDark({ titulo: 'Falha na busca', mensagem: e.message, tipo: 'erro' });
    } finally {
      btn.disabled = false; btn.textContent = '🔍 Buscar';
    }
  }

  btn.addEventListener('click', executar);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') executar(); });

  wrap.append(input, btn);
  return wrap;
}

function mostrarResultadosBusca(query, resp) {
  const back = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === back) fechar(); } });
  const card = el('div', { class: 'modal-card', style: 'max-width:820px;max-height:90vh;display:flex;flex-direction:column' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const total = resp.total || 0;
  const custoBrl = (Number(resp.custo_usd || 0) * 5.5).toFixed(4);

  card.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, '🔍 Resultados da busca'),
      el('div', { class: 'modal-sub' }, [
        el('span', {}, `Buscando "`),
        el('strong', { style: 'color:var(--fg)' }, query),
        el('span', {}, `" no Cérebro ${cerebroAtual?.nome} · ${total} chunk${total === 1 ? '' : 's'} relevante${total === 1 ? '' : 's'} · custo R$ ${custoBrl}`),
      ]),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    el('div', { class: 'modal-body', style: 'overflow-y:auto;flex:1' }, [
      total === 0
        ? el('div', { style: 'padding:2rem;text-align:center;color:var(--fg-muted)' }, [
            el('div', { style: 'font-size:2rem;margin-bottom:.5rem' }, '🤷'),
            el('div', {}, 'Nenhum chunk com similaridade suficiente. Tenta reformular a pergunta — ou alimenta mais o Cérebro.'),
          ])
        : el('div', { class: 'busca-resultados' }, resp.resultados.map((r, idx) => {
            const sim = (r.similarity * 100).toFixed(0);
            const corBarra = r.similarity > 0.5 ? '#10b981' : r.similarity > 0.35 ? '#f59e0b' : '#71717a';
            return el('div', { class: 'busca-resultado' }, [
              el('div', { class: 'busca-resultado-head' }, [
                el('span', { class: 'busca-resultado-num' }, `#${idx + 1}`),
                el('span', { class: 'busca-resultado-titulo' }, r.titulo),
                el('span', {
                  class: 'busca-resultado-tipo',
                  style: `color:${coresTipo()[r.tipo] || '#71717A'}`,
                }, labelTipo(r.tipo)),
                el('div', { class: 'busca-resultado-sim' }, [
                  el('div', { class: 'busca-sim-bar', style: `width:${sim}%;background:${corBarra}` }),
                  el('span', { class: 'busca-sim-label' }, `${sim}%`),
                ]),
              ]),
              el('div', { class: 'busca-resultado-conteudo' }, r.conteudo),
              el('button', {
                class: 'btn btn-ghost',
                style: 'font-size:.75rem;margin-top:.5rem',
                onclick: () => {
                  const fonte = pecasCache.find(p => p.id === r.fonte_id);
                  if (fonte) { fechar(); abrirDrawer(fonte); }
                },
              }, '→ Ver fonte completa'),
            ]);
          })),
      el('div', { style: 'margin-top:1rem;padding:.75rem 1rem;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.25);border-radius:6px;font-size:.8125rem;color:var(--fg-muted);line-height:1.5' }, [
        el('strong', { style: 'color:var(--fg)' }, 'Como funciona: '),
        'Sua pergunta é convertida em vetor numérico (significado, não palavra) e comparada com os chunks do Cérebro via cosine similarity. Os mais próximos no espaço semântico aparecem primeiro. Custa frações de centavo por busca — base do RAG que alimenta os agentes.',
      ]),
    ]),
    el('div', { class: 'modal-footer' }, [
      el('button', { class: 'btn btn-primary', onclick: fechar }, 'Fechar'),
    ]),
  );

  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
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
  // Usa .select() pra saber quantas linhas foram afetadas — se grant estiver faltando,
  // Supabase retorna sucesso mas 0 linhas. Checagem explícita pega esse caso.
  const steps = [
    () => sb.from('cerebro_fontes_chunks').delete().eq('cerebro_id', cer.id).select('id'),
    () => sb.from('cerebro_fontes').delete().eq('cerebro_id', cer.id).select('id'),
    () => sb.from('ingest_arquivos').delete().eq('cerebro_id', cer.id).select('id'),
    () => sb.from('ingest_lotes').delete().eq('cerebro_id', cer.id).select('id'),
  ];
  for (const run of steps) {
    const { error } = await run();
    if (error) {
      await alertarDark({ titulo: 'Falha ao zerar', mensagem: error.message, tipo: 'erro' });
      return;
    }
  }

  // Valida que ficou mesmo vazio (detecta falha de grant silenciosa)
  const { count: sobraFontes } = await sb.from('cerebro_fontes').select('id', { count: 'exact', head: true }).eq('cerebro_id', cer.id);
  if ((sobraFontes || 0) > 0) {
    await alertarDark({
      titulo: 'Zerar não completou',
      mensagem: `Ainda restam ${sobraFontes} fontes no Cérebro. Provável falta de permissão DELETE no banco. Rode fix-grants-delete.sql no SQL Editor.`,
      tipo: 'erro',
    });
    return;
  }

  await sb.from('cerebros').update({ ultima_alimentacao: null }).eq('id', cer.id);

  await alertarDark({ titulo: 'Cérebro zerado', mensagem: `${cerebroAtual.nome} voltou ao estado inicial. Pronto pra nova carga.`, tipo: 'info' });

  // Recarrega catálogo + tela + subnav
  cerebrosCache = await fetchCerebrosCatalogo();
  window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'cerebro_zerado', slug: cerebroAtual.slug } }));
  abrirCerebroDetalhe(cerebroAtual.slug);
}

/* --- Editar nome/icone/emoji/descricao do produto associado --- */
async function abrirEditarCerebro() {
  if (!cerebroAtual) return;
  const sb = getSupabase();
  if (!sb) { await alertarDark({ titulo: 'Sem conexão', mensagem: 'Supabase não conectado.', tipo: 'erro' }); return; }

  // Estado do uploader (icone)
  let iconeUrlAtual = cerebroAtual.icone_url || null;
  let arquivoNovo = null;       // File selecionado pelo usuario, ainda nao subido
  let removerSinalizado = false; // Usuario clicou em "Remover" — vai gravar null no save

  const back = el('div', {
    class: 'modal-backdrop',
    onclick: (e) => { if (e.target === back) fechar(); }
  });
  const card = el('div', { class: 'modal-card', style: 'max-width:520px' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  // ----- Preview do icone (atualiza ao escolher/remover) -----
  const previewBox = el('div', { class: 'icone-uploader-preview' }, []);
  function refreshPreview() {
    previewBox.innerHTML = '';
    if (arquivoNovo) {
      const img = el('img', { src: URL.createObjectURL(arquivoNovo), alt: '' });
      previewBox.appendChild(img);
      return;
    }
    if (!removerSinalizado && iconeUrlAtual) {
      const img = el('img', { src: iconeUrlAtual, alt: '' });
      previewBox.appendChild(img);
      return;
    }
    // Sem icone: mostra emoji ou inicial
    const emoji = (document.querySelector('input[name="emoji"]')?.value || cerebroAtual.emoji || '').trim();
    const span = el('span', { style: 'font-size:28px;line-height:1' }, emoji || (cerebroAtual.nome || '?')[0].toUpperCase());
    previewBox.appendChild(span);
  }

  // ----- Botoes do uploader -----
  const inputFile = el('input', { type: 'file', accept: 'image/png,image/svg+xml,image/jpeg,image/webp' });
  inputFile.addEventListener('change', (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      alertarDark({ titulo: 'Arquivo grande', mensagem: 'Máximo 2MB. Reduza o ícone antes de subir.', tipo: 'erro' });
      ev.target.value = '';
      return;
    }
    arquivoNovo = f;
    removerSinalizado = false;
    refreshPreview();
    btnRemover.style.display = '';
  });

  const btnEscolher = el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => inputFile.click() }, '📷 Escolher ícone');
  const btnRemover = el('button', {
    type: 'button',
    class: 'btn btn-ghost',
    style: 'color:var(--danger)' + ((iconeUrlAtual || arquivoNovo) ? '' : ';display:none'),
    onclick: () => {
      arquivoNovo = null;
      removerSinalizado = !!iconeUrlAtual; // Só sinaliza remover se tinha icone salvo no banco
      iconeUrlAtual = removerSinalizado ? iconeUrlAtual : null;
      inputFile.value = '';
      refreshPreview();
      btnRemover.style.display = 'none';
    }
  }, 'Remover');

  const uploaderBox = el('div', { class: 'icone-uploader' }, [
    previewBox,
    el('div', { class: 'icone-uploader-actions' }, [
      el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' }, [btnEscolher, btnRemover]),
      el('div', { class: 'icone-uploader-hint' }, 'PNG, SVG, JPG ou WEBP · até 2MB · de preferência quadrado'),
    ]),
    inputFile,
  ]);

  card.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, 'Editar Cérebro'),
      el('div', { class: 'modal-sub' }, 'Atualiza o nome, ícone, emoji ou descrição. O slug (identificador interno) não muda.'),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('form', {
        class: 'novo-cerebro-form',
        onsubmit: async (ev) => {
          ev.preventDefault();
          const nome = ev.target.nome.value.trim();
          const emoji = ev.target.emoji.value.trim() || cerebroAtual.emoji || '📦';
          const descricao = ev.target.descricao.value.trim() || null;
          if (!nome) return;
          const btn = ev.submitter;
          btn.disabled = true; btn.textContent = 'Salvando...';

          // Busca produto ID
          const { data: prod, error: eP } = await sb.from('produtos').select('id').eq('slug', cerebroAtual.slug).single();
          if (eP || !prod) {
            btn.disabled = false; btn.textContent = 'Salvar';
            await alertarDark({ titulo: 'Falha', mensagem: 'Produto não encontrado.', tipo: 'erro' });
            return;
          }

          // 1) Upload do icone se ha arquivo novo
          let icone_url = cerebroAtual.icone_url || null;
          if (arquivoNovo) {
            btn.textContent = 'Subindo ícone...';
            const ext = (arquivoNovo.name.split('.').pop() || 'png').toLowerCase();
            const path = `${cerebroAtual.slug}-${Date.now()}.${ext}`;
            const { error: errUp } = await sb.storage.from('pinguim-icones').upload(path, arquivoNovo, {
              cacheControl: '3600',
              upsert: false,
              contentType: arquivoNovo.type,
            });
            if (errUp) {
              btn.disabled = false; btn.textContent = 'Salvar';
              await alertarDark({ titulo: 'Falha no upload', mensagem: errUp.message, tipo: 'erro' });
              return;
            }
            const { data: pub } = sb.storage.from('pinguim-icones').getPublicUrl(path);
            icone_url = pub?.publicUrl || null;
          } else if (removerSinalizado) {
            icone_url = null;
            // (Nao apaga o arquivo no storage por simplicidade — fica orfao mas nao quebra)
          }

          // 2) Update no produtos
          btn.textContent = 'Salvando...';
          const { error } = await sb.from('produtos').update({ nome, emoji, descricao, icone_url }).eq('id', prod.id);
          if (error) {
            btn.disabled = false; btn.textContent = 'Salvar';
            await alertarDark({ titulo: 'Falha ao salvar', mensagem: error.message, tipo: 'erro' });
            return;
          }
          fechar();
          // Atualiza cache local + dispara refresh global
          cerebrosCache = await fetchCerebrosCatalogo();
          window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'cerebro_editado', slug: cerebroAtual.slug } }));
          abrirCerebroDetalhe(cerebroAtual.slug);
        },
      }, [
        el('label', { class: 'novo-cerebro-label' }, 'Nome do produto'),
        el('input', { name: 'nome', class: 'form-input', required: 'true', value: cerebroAtual.nome || '' }),

        el('label', { class: 'novo-cerebro-label', style: 'margin-top:.875rem' }, 'Ícone'),
        uploaderBox,

        el('div', { style: 'display:flex;gap:.5rem;margin-top:.75rem' }, [
          el('div', { style: 'flex:0 0 90px' }, [
            el('label', { class: 'novo-cerebro-label' }, 'Emoji (fallback)'),
            el('input', {
              name: 'emoji', class: 'form-input', maxlength: 4, value: cerebroAtual.emoji || '📦',
              oninput: () => refreshPreview(),
            }),
          ]),
          el('div', { style: 'flex:1' }, [
            el('label', { class: 'novo-cerebro-label' }, 'Descrição'),
            el('input', { name: 'descricao', class: 'form-input', value: cerebroAtual.descricao || '' }),
          ]),
        ]),
        el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem' }, [
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: fechar }, 'Cancelar'),
          el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'),
        ]),
      ]),
    ]),
  );
  back.append(card);
  refreshPreview();
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

/* --- Modal Quarentena: lista, exclui, ou pede pra reprocessar --- */
async function abrirQuarentena() {
  const sb = getSupabase();
  if (!sb || !cerebroAtual) return;

  const { data: prod } = await sb.from('produtos').select('id').eq('slug', cerebroAtual.slug).single();
  if (!prod) return;
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
  if (!cer) return;

  const { data: arquivos } = await sb.from('ingest_arquivos')
    .select('id, nome_original, tamanho_bytes, motivo_erro, status, criado_em')
    .eq('cerebro_id', cer.id)
    .eq('status', 'quarentena')
    .order('criado_em', { ascending: false });

  const back = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === back) fechar(); } });
  const card = el('div', { class: 'modal-card', style: 'max-width:720px' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  function formatarBytes(b) {
    if (b == null) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function excluir(id, nome) {
    const ok = await confirmarDark({
      titulo: 'Excluir da quarentena',
      mensagem: `Remover "${nome}"? O sistema esquece o hash desse arquivo (você poderá tentar subir de novo se quiser).`,
      confirmar: 'Excluir',
      perigoso: true,
    });
    if (!ok) return;
    const { error } = await sb.from('ingest_arquivos').delete().eq('id', id);
    if (error) {
      await alertarDark({ titulo: 'Falha', mensagem: error.message, tipo: 'erro' });
      return;
    }
    fechar();
    abrirCerebroDetalhe(cerebroAtual.slug);
  }

  card.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, '⚠ Quarentena'),
      el('div', { class: 'modal-sub' }, `${(arquivos || []).length} arquivo${(arquivos || []).length === 1 ? '' : 's'} não indexado${(arquivos || []).length === 1 ? '' : 's'} no Cérebro ${cerebroAtual.nome}`),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      (arquivos || []).length === 0
        ? el('div', { style: 'padding:2rem;text-align:center;color:var(--fg-muted)' }, 'Nada na quarentena.')
        : el('div', { class: 'arquivos-lista' }, arquivos.map(a => el('div', {
            style: 'padding:.75rem;border:1px solid var(--border);border-radius:6px;margin-bottom:.5rem;background:var(--bg-elevated)',
          }, [
            el('div', { style: 'display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem' }, [
              el('span', { style: 'font-size:1rem' }, '📄'),
              el('span', { style: 'flex:1;font-weight:600;color:var(--fg)' }, a.nome_original || '(sem nome)'),
              el('span', { style: 'font-size:.75rem;color:var(--fg-muted)' }, formatarBytes(a.tamanho_bytes)),
            ]),
            el('div', { style: 'font-size:.8125rem;color:var(--fg-muted);margin-bottom:.5rem;line-height:1.5' }, [
              el('strong', { style: 'color:var(--warning,#f59e0b)' }, 'Motivo: '),
              a.motivo_erro || 'sem motivo registrado',
            ]),
            el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end' }, [
              el('button', {
                class: 'btn btn-ghost',
                style: 'font-size:.8125rem;color:var(--danger)',
                onclick: () => excluir(a.id, a.nome_original),
              }, '🗑 Excluir'),
            ]),
          ]))),
      el('div', { style: 'margin-top:1rem;padding:.75rem 1rem;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.25);border-radius:6px;font-size:.8125rem;color:var(--fg-muted);line-height:1.5' }, [
        el('strong', { style: 'color:var(--fg)' }, 'O que fazer? '),
        'Arquivos aqui não foram indexados (texto em imagem, formato não suportado, ou erro de extração). Excluir libera o sistema pra você tentar subir o conteúdo de outra forma — por exemplo, salvando como .txt/.md, exportando o áudio em outro formato, ou colando o texto manualmente como tipo "Página de venda" ou "Aula".',
      ]),
    ]),
    el('div', { class: 'modal-footer' }, [
      el('button', { class: 'btn btn-primary', onclick: fechar }, 'Fechar'),
    ]),
  );

  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
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
  const { data: fontes, error: eFontes } = await sb.from('cerebro_fontes')
    .select('id')
    .eq('ingest_lote_id', lote.id);
  if (eFontes) {
    await alertarDark({ titulo: 'Falha ao buscar fontes do lote', mensagem: eFontes.message, tipo: 'erro' });
    return;
  }

  const fonteIds = (fontes || []).map(f => f.id);
  if (fonteIds.length > 0) {
    const { error: e1 } = await sb.from('cerebro_fontes_chunks').delete().in('fonte_id', fonteIds).select('id');
    if (e1) { await alertarDark({ titulo: 'Falha ao apagar chunks', mensagem: e1.message, tipo: 'erro' }); return; }
    const { data: fontesApagadas, error: e2 } = await sb.from('cerebro_fontes').delete().in('id', fonteIds).select('id');
    if (e2) { await alertarDark({ titulo: 'Falha ao apagar fontes', mensagem: e2.message, tipo: 'erro' }); return; }
    if ((fontesApagadas?.length || 0) < fonteIds.length) {
      await alertarDark({
        titulo: 'Reversão incompleta',
        mensagem: `Apenas ${fontesApagadas?.length || 0} de ${fonteIds.length} fontes foram apagadas. Provável falta de permissão DELETE no banco. Rode fix-grants-delete.sql no SQL Editor.`,
        tipo: 'erro',
      });
      return;
    }
  }

  // Apaga também o log do lote
  const { error: e3 } = await sb.from('ingest_arquivos').delete().eq('lote_id', lote.id).select('id');
  if (e3) { await alertarDark({ titulo: 'Falha ao limpar ingest_arquivos', mensagem: e3.message, tipo: 'erro' }); return; }
  const { data: loteApagado, error: e4 } = await sb.from('ingest_lotes').delete().eq('id', lote.id).select('id');
  if (e4) { await alertarDark({ titulo: 'Falha ao apagar lote', mensagem: e4.message, tipo: 'erro' }); return; }
  if (!loteApagado || loteApagado.length === 0) {
    await alertarDark({
      titulo: 'Lote não foi apagado',
      mensagem: 'DELETE retornou 0 linhas. Provável falta de permissão no banco.',
      tipo: 'erro',
    });
    return;
  }

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
  const { error: e1 } = await sb.from('cerebro_fontes_chunks').delete().eq('fonte_id', fonteId);
  if (e1) {
    await alertarDark({ titulo: 'Falha ao excluir chunks', mensagem: e1.message, tipo: 'erro' });
    return;
  }
  const { data: apagada, error: e2 } = await sb.from('cerebro_fontes').delete().eq('id', fonteId).select('id');
  if (e2) {
    await alertarDark({ titulo: 'Falha ao excluir fonte', mensagem: e2.message, tipo: 'erro' });
    return;
  }
  if (!apagada || apagada.length === 0) {
    await alertarDark({
      titulo: 'Exclusão não aplicou',
      mensagem: 'O DELETE retornou 0 linhas afetadas. Provável falta de permissão no banco (grant DELETE pro anon). Avise o admin.',
      tipo: 'erro',
    });
    return;
  }

  // UX: remove só o card da fonte do DOM + atualiza contadores, sem recarregar a tela toda
  await atualizarDepoisDeExcluirFonte(fonteId);
}

/**
 * Pós-exclusão de fonte única: remove o card do DOM e atualiza
 * contadores de header/Kanban, sem reconstruir a tela inteira.
 */
async function atualizarDepoisDeExcluirFonte(fonteId) {
  // Remove do cache local
  const idx = pecasCache.findIndex(p => p.id === fonteId);
  if (idx >= 0) pecasCache.splice(idx, 1);

  // Remove o card do DOM (qualquer view: kanban/lista/timeline)
  document.querySelectorAll(`[data-fonte-id="${fonteId}"]`).forEach(el => el.remove());

  // Atualiza contador "X fontes" no header do cérebro
  const headerCount = document.querySelector('.cerebro-detalhe-header-count');
  if (headerCount) headerCount.textContent = `${pecasCache.length} font${pecasCache.length === 1 ? 'e' : 'es'}`;

  // Atualiza contador nas colunas do Kanban (se visível)
  document.querySelectorAll('.fontes-col').forEach(col => {
    const tipo = col.dataset.tipo;
    if (!tipo) return;
    const count = pecasCache.filter(p => p.tipo === tipo).length;
    const badge = col.querySelector('.fontes-col-count');
    if (badge) badge.textContent = String(count);
    if (count === 0) col.remove();
  });

  // Atualiza cache do catálogo em background (pro sidebar refletir)
  fetchCerebrosCatalogo().then(cat => { cerebrosCache = cat; }).catch(() => {});
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
  body.innerHTML = '';

  // Acoes no topo do drawer
  const acoes = el('div', { class: 'drawer-actions', style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--border-subtle)' }, [
    el('button', {
      class: 'btn btn-primary',
      style: 'font-size:.8125rem',
      onclick: () => editarFonte(peca),
    }, '✎ Editar'),
    el('button', {
      class: 'btn',
      style: 'font-size:.8125rem',
      onclick: () => reclassificarFonte(peca),
    }, '🏷 Reclassificar'),
    el('button', {
      class: 'btn btn-ghost',
      style: 'font-size:.8125rem;color:var(--danger);margin-left:auto',
      onclick: async () => {
        await excluirFonte(peca.id);
        // Fecha drawer se a fonte foi removida
        if (!pecasCache.find(p => p.id === peca.id)) {
          d.classList.remove('open');
        }
      },
    }, '🗑 Excluir'),
  ]);
  body.appendChild(acoes);

  // Meta + conteudo
  const meta = el('div', { class: 'drawer-meta' });
  meta.innerHTML = `
    <b>Tipo</b><span style="color:${coresTipo()[peca.tipo]||'#71717A'};font-weight:600">${labelTipo(peca.tipo)}</span>
    <b>Origem</b><span>${peca.origem || '—'}</span>
    <b>Autor</b><span>${peca.autor || '—'}</span>
    <b>Data</b><span>${new Date(peca.criado_em).toLocaleString('pt-BR')}</span>
    <b>Peso</b><span>${peca.peso || '—'}</span>
    <b>Tags</b><span>${(peca.tags || []).map(t => `<span class="task-tag" style="margin-right:.25rem">${t}</span>`).join('') || '—'}</span>
    ${peca.url || peca.fonte_url ? `<b>URL</b><span><a href="${peca.url || peca.fonte_url}" target="_blank">${peca.url || peca.fonte_url}</a></span>` : ''}
  `;
  body.appendChild(meta);

  const pre = document.createElement('div');
  pre.innerHTML = peca.conteudo_md
    ? `<pre style="white-space:pre-wrap;word-wrap:break-word">${escapeHtml(peca.conteudo_md.slice(0, 4000))}${peca.conteudo_md.length > 4000 ? '\n\n…(conteúdo truncado, edite pra ver completo)' : ''}</pre>`
    : '<em style="color:var(--fg-muted)">Sem conteúdo — fonte sem texto extraível.</em>';
  body.appendChild(pre);

  d.classList.add('open');
}

async function editarFonte(peca) {
  const sb = getSupabase();
  if (!sb) { await alertarDark({ titulo: 'Sem conexão', mensagem: 'Supabase não conectado.', tipo: 'erro' }); return; }

  const back = el('div', {
    class: 'modal-backdrop',
    style: 'z-index:10000',
    onclick: (e) => { if (e.target === back) fechar(); }
  });
  const card = el('div', { class: 'modal-card', style: 'max-width:720px;max-height:90vh;display:flex;flex-direction:column' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const TIPOS = [
    'aula','pagina_venda','depoimento','objecao','sacada','pesquisa',
    'chat_export','pitch','faq','externo','csv','outro',
  ];

  const inputTitulo = el('input', { name: 'titulo', class: 'form-input', value: peca.titulo || '', required: 'true' });
  const selectTipo = el('select', { name: 'tipo', class: 'form-input' });
  TIPOS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = labelTipo(t);
    if (t === peca.tipo) opt.selected = true;
    selectTipo.appendChild(opt);
  });
  const inputAutor = el('input', { name: 'autor', class: 'form-input', value: peca.autor || '', placeholder: 'Quem disse / criou (opcional)' });
  const inputTags = el('input', { name: 'tags', class: 'form-input', value: (peca.tags || []).join(', '), placeholder: 'palavra-chave, outra-tag (separadas por vírgula)' });
  const inputUrl = el('input', { name: 'url', class: 'form-input', value: peca.url || peca.fonte_url || '', placeholder: 'https://… (opcional)' });
  const textareaConteudo = el('textarea', {
    name: 'conteudo',
    class: 'form-input',
    style: 'min-height:280px;max-height:50vh;font-family:var(--font-mono),monospace;font-size:.8125rem;line-height:1.55;resize:vertical',
  });
  textareaConteudo.value = peca.conteudo_md || '';

  const aviso = el('div', {
    style: 'padding:.75rem 1rem;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:6px;font-size:.8125rem;color:var(--fg-muted);line-height:1.5;margin-bottom:1rem',
  }, [
    el('strong', { style: 'color:var(--fg)' }, 'Editar conteúdo regenera os vetores. '),
    'Se você mudar o texto, o sistema vai apagar os chunks antigos e revetorizar (custa frações de centavo). Mudanças só de título/autor/tags não tocam nos vetores.',
  ]);

  const erroEl = el('div', { style: 'display:none;color:var(--danger);font-size:.875rem;margin-top:.5rem' });

  card.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, 'Editar fonte'),
      el('div', { class: 'modal-sub' }, `Cérebro ${cerebroAtual?.nome || ''} — alterar título, tipo, conteúdo, etc.`),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    el('div', { class: 'modal-body', style: 'overflow-y:auto;flex:1' }, [
      aviso,
      el('form', {
        id: 'form-editar-fonte',
        onsubmit: async (ev) => {
          ev.preventDefault();
          const titulo = inputTitulo.value.trim();
          const tipo = selectTipo.value;
          const autor = inputAutor.value.trim() || null;
          const url = inputUrl.value.trim() || null;
          const tagsArr = inputTags.value.split(',').map(t => t.trim()).filter(Boolean);
          const conteudo = textareaConteudo.value;

          if (!titulo) { erroEl.style.display = ''; erroEl.textContent = 'Título obrigatório.'; return; }

          const conteudoMudou = conteudo !== (peca.conteudo_md || '');

          const btn = ev.submitter;
          btn.disabled = true;
          btn.textContent = conteudoMudou ? 'Salvando + revetorizando…' : 'Salvando…';
          erroEl.style.display = 'none';

          try {
            // 1. Update na tabela
            const { error: errUp } = await sb.from('cerebro_fontes').update({
              titulo, tipo, autor, url, tags: tagsArr.length ? tagsArr : null,
              conteudo_md: conteudo, tamanho_bytes: conteudo.length,
              metadata: {
                ...(peca.metadata || {}),
                editado_manualmente: new Date().toISOString(),
              },
            }).eq('id', peca.id);
            if (errUp) throw new Error(errUp.message);

            // 2. Se conteudo mudou, revetoriza (apaga chunks + chama Edge Function pra rechunkar)
            if (conteudoMudou) {
              // Apaga chunks antigos
              await sb.from('cerebro_fontes_chunks').delete().eq('fonte_id', peca.id);

              // Chama Edge Function pra rechunkar + revetorizar
              btn.textContent = 'Revetorizando…';
              const { data: { session } } = await sb.auth.getSession();
              const fnUrl = `${window.__ENV__.SUPABASE_URL}/functions/v1/revetorizar-fonte`;
              const resp = await fetch(fnUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'apikey': window.__ENV__.SUPABASE_ANON_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fonte_id: peca.id }),
              });
              if (!resp.ok) {
                const errBody = await resp.json().catch(() => ({}));
                throw new Error(`Revetorização falhou: ${errBody.error || resp.status}`);
              }
            }

            // Atualiza cache local
            const idx = pecasCache.findIndex(p => p.id === peca.id);
            if (idx >= 0) {
              pecasCache[idx] = {
                ...pecasCache[idx],
                titulo, tipo, autor, url, tags: tagsArr,
                conteudo_md: conteudo,
              };
            }

            fechar();
            // Re-renderiza view e drawer
            const cur = pecasCache.find(p => p.id === peca.id);
            if (cur) abrirDrawer(cur);
            if (typeof renderView === 'function') renderView();
          } catch (e) {
            erroEl.style.display = '';
            erroEl.textContent = e.message;
            btn.disabled = false;
            btn.textContent = 'Salvar';
          }
        },
      }, [
        el('label', { class: 'novo-cerebro-label' }, 'Título'),
        inputTitulo,

        el('div', { style: 'display:flex;gap:.75rem;margin-top:.75rem' }, [
          el('div', { style: 'flex:1' }, [
            el('label', { class: 'novo-cerebro-label' }, 'Tipo'),
            selectTipo,
          ]),
          el('div', { style: 'flex:1' }, [
            el('label', { class: 'novo-cerebro-label' }, 'Autor'),
            inputAutor,
          ]),
        ]),

        el('label', { class: 'novo-cerebro-label', style: 'margin-top:.75rem' }, 'Tags (separadas por vírgula)'),
        inputTags,

        el('label', { class: 'novo-cerebro-label', style: 'margin-top:.75rem' }, 'URL (opcional)'),
        inputUrl,

        el('label', { class: 'novo-cerebro-label', style: 'margin-top:.75rem' }, 'Conteúdo'),
        textareaConteudo,
        erroEl,

        el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem' }, [
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: fechar }, 'Cancelar'),
          el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'),
        ]),
      ]),
    ]),
  );

  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
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

    const col = el('div', { class: 'fontes-col', 'data-tipo': tipo }, [
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

  const card = el('div', { class: 'fonte-card', 'data-fonte-id': fonte.id, onclick: () => abrirDrawer(fonte) }, [
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

// Flag de sessao do modal: true se houve qualquer indexacao bem-sucedida.
// Se true ao fechar, o Cerebro detalhe e recarregado pra refletir as fontes novas.
let modalAlimentouAlgo = false;

function abrirModalAlimentar() {
  modalAlimentouAlgo = false; // reset a cada abertura
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

  // Se algo foi indexado durante esta sessao do modal, recarrega o detalhe
  // do Cerebro pra mostrar fontes novas no Kanban/Lista/Timeline.
  if (modalAlimentouAlgo && cerebroAtual?.slug) {
    abrirCerebroDetalhe(cerebroAtual.slug);
  }
  modalAlimentouAlgo = false;
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
          onclick: () => trocarStep(renderStepAvulso()),
        }, [
          el('div', { class: 'modo-icon' }, '📤'),
          el('div', { class: 'modo-title' }, 'Avulso'),
          el('div', { class: 'modo-desc' }, 'Upload de 1 arquivo. Aceita texto, PDF, imagem (print, foto), áudio (incluindo áudio de WhatsApp). O sistema lê via IA quando precisa.'),
        ]),
        el('button', {
          class: 'modo-card',
          onclick: () => trocarStep(renderStepAutomatico()),
        }, [
          el('div', { class: 'modo-icon' }, '⏱'),
          el('div', { class: 'modo-title' }, 'Automático'),
          el('div', { class: 'modo-desc' }, 'Integrações com Discord, WhatsApp, Telegram. Em breve.'),
        ]),
      ]),
    ]),
  );
  return step;
}

/* --- PASSO 2C: Pacote (zip) via Edge Function --- */
const MAX_UPLOAD_MB = 50;

// Sanitiza nome pra virar storage key válida.
// Supabase Storage rejeita: colchetes [], espaços, acentos, outros símbolos.
function sanitizarNomeArquivo(nome) {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

// Upload com progresso real via XHR (supabase-js não expõe onprogress no upload).
// Usado por Pacote e Avulso — ambos mandam um .zip pro Storage.
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

      // Squad paralelo (so anima se toggle on; no-op caso contrario)
      const squad = iniciarSquadParalelo('alimentarPacote', {
        titulo: 'Alimentando Cerebro com pacote',
        subtitulo: `Cerebro ${cerebroNome}`,
        cerebroNome,
        totalArquivos: null, // descoberto na fase preparar
      });

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

        const storagePath = `lote/${lote.id}/${sanitizarNomeArquivo(arquivoSelecionado.name)}`;

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
        uploadStatus.innerHTML = `<strong>✓ Upload concluído</strong> · Preparando pacote…`;

        // 4. Layout de progresso do processamento (ondas)
        areaProgresso.innerHTML = '';
        const status = el('div', { class: 'progresso-status' }, '⏳ Preparando pacote no servidor…');
        const progressoWrap = el('div', { class: 'progresso-bar-wrap' });
        const progressoBar = el('div', { class: 'progresso-bar' });
        progressoWrap.append(progressoBar);
        const tabela = el('div', { class: 'progresso-tabela' });
        areaProgresso.append(status, progressoWrap, tabela);

        btnProcessar.style.display = 'none';

        const envCfg = window.__ENV__ || {};

        // Polling secundário: atualiza a tabela de arquivos a cada 3s
        pollInterval = setInterval(async () => {
          try {
            const { data: arqs } = await sb.from('ingest_arquivos')
              .select('nome_original, tipo_sugerido, status')
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
                const statusLabel = a.status === 'ok' ? '✓' : a.status === 'quarentena' ? '⚠'
                  : a.status === 'erro' ? '✗' : a.status === 'processando' ? '⏳' : '…';
                tabela.append(el('div', { class: 'progresso-tabela-row' }, [
                  el('div', { class: 'progresso-nome' }, a.nome_original || '—'),
                  el('div', {}, a.tipo_sugerido || '—'),
                  el('div', {}, statusLabel + ' ' + (a.status || '')),
                ]));
              });
            }
          } catch (e) { console.error('erro polling tabela', e); }
        }, 3000);

        // Helper: chama Edge Function, valida resposta
        async function chamarFunction(body, tentativa = 1) {
          try {
            const resp = await fetch(`${envCfg.SUPABASE_URL}/functions/v1/ingest-pacote`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${envCfg.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
            return data;
          } catch (e) {
            if (tentativa >= 3) throw e;
            const espera = tentativa * 3000; // 3s, 6s
            await new Promise(r => setTimeout(r, espera));
            return chamarFunction(body, tentativa + 1);
          }
        }

        // FASE 1: preparar
        progressoBar.style.width = '5%';
        status.innerHTML = `<strong>⏳ Preparando pacote</strong> · extraindo e indexando arquivos`;

        const prep = await chamarFunction({
          modo: 'preparar',
          lote_id: lote.id,
          storage_path: storagePath,
          cerebro_id: cer.id,
        });

        const totalArquivos = prep.total_pendentes || 0;
        if (totalArquivos === 0) {
          clearInterval(pollInterval); pollInterval = null;
          squad.sinalizarConclusao({ fontes: 0 });
          progressoBar.style.width = '100%';
          const msg = prep.duplicados_historico > 0
            ? `Todos os ${prep.duplicados_historico} arquivos já existiam no Cérebro (dedup por sha256). Nada a processar.`
            : 'Nenhum arquivo processável encontrado no zip.';
          status.innerHTML = `<strong>⚠ Pacote vazio</strong> · ${msg}`;
          areaProgresso.append(el('div', { class: 'progresso-footer' }, [
            el('button', { class: 'btn btn-primary', onclick: () => { fecharModal(); abrirCerebroDetalhe(cerebroSlug); } }, 'Fechar'),
          ]));
          return;
        }

        // FASE 2: ondas
        let processadosTotal = 0;
        let concluido = false;
        const ondaInfo = { fontes: 0, chunks: 0, quarentena: 0 };

        while (!concluido) {
          const pct = Math.min(98, 5 + Math.round((processadosTotal / totalArquivos) * 93));
          progressoBar.style.width = pct + '%';
          status.innerHTML = `<strong>🔢 Processando em ondas</strong> · ${pct}% · ${processadosTotal}/${totalArquivos} arquivos · ${ondaInfo.fontes} fontes · ${ondaInfo.chunks} chunks`;

          const onda = await chamarFunction({
            modo: 'processar-onda',
            lote_id: lote.id,
            storage_path: storagePath,
            cerebro_id: cer.id,
            origem: 'lote',
          });

          processadosTotal += (onda.processados || 0) + 0;
          ondaInfo.fontes = onda.fontes_criadas || ondaInfo.fontes;
          ondaInfo.chunks = onda.chunks_criados || ondaInfo.chunks;
          ondaInfo.quarentena = onda.em_quarentena || ondaInfo.quarentena;

          if (onda.concluido) { concluido = true; break; }
          if ((onda.processados || 0) === 0 && (onda.restantes || 0) > 0) {
            // nada progrediu numa onda — algo trancou. Aborta pra não rodar infinito.
            throw new Error('Onda não processou nenhum arquivo. Verifique logs da Edge Function.');
          }
        }

        // FASE 3: finalização
        clearInterval(pollInterval); pollInterval = null;
        progressoBar.style.width = '100%';
        status.innerHTML = `<strong>✅ Concluído</strong> · ${ondaInfo.fontes} fontes · ${ondaInfo.chunks} chunks · ${ondaInfo.quarentena} em quarentena`;

        // Marca que algo foi alimentado nesta sessao do modal
        if ((ondaInfo.fontes || 0) > 0) modalAlimentouAlgo = true;

        // Sinaliza animacao squad pra acelerar/fechar
        squad.sinalizarConclusao({ fontes: ondaInfo.fontes, chunks: ondaInfo.chunks });
        // Refresca cache + subnav (total de fontes mudou)
        cerebrosCache = await fetchCerebrosCatalogo();
        window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'cerebro_alimentado', slug: cerebroSlug } }));

        // Lê relatório final
        const { data: loteFinal } = await sb.from('ingest_lotes')
          .select('log_md, erro_detalhes, status')
          .eq('id', lote.id).single();

        const relatorioEl = loteFinal?.log_md
          ? el('pre', { class: 'progresso-relatorio' }, loteFinal.log_md)
          : null;
        if (relatorioEl) areaProgresso.append(relatorioEl);

        const footerEl = el('div', { class: 'progresso-footer' }, [
          el('button', { class: 'btn btn-primary', onclick: () => { fecharModal(); abrirCerebroDetalhe(cerebroSlug); } }, 'Fechar e ver fontes'),
        ]);
        areaProgresso.append(footerEl);

        // Auto-scroll pro relatório (sem precisar rolar a mão)
        requestAnimationFrame(() => {
          const alvo = relatorioEl || footerEl;
          alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

      } catch (e) {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        squad.sinalizarErro(e);
        processandoAgora = false;
        await alertarDark({ titulo: 'Falha no processamento', mensagem: e.message, tipo: 'erro' });
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
        el('label', {}, 'Arquivo .zip (limite upload: ' + MAX_UPLOAD_MB + 'MB — processamento ocorre em ondas automáticas)'),
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

// Bloco "Cole uma URL" — reaproveitado pelo Avulso. Dispara processamento via Edge Function ingest-url.
function blocoUrl(cerebroAtualRef, onIndexado) {
  const wrap = el('div', { class: 'avulso-url-bloco' });
  const inputUrl = el('input', {
    type: 'url',
    class: 'form-input',
    placeholder: 'https://youtube.com/watch?v=… · https://instagram.com/p/… · https://tiktok.com/...',
    style: 'width:100%',
  });
  const btnTranscrever = el('button', { class: 'btn btn-primary', type: 'button', style: 'margin-top:.5rem' }, '⬇ Trazer pro Cérebro');
  const status = el('div', { class: 'avulso-url-status', style: 'display:none;margin-top:.75rem' });

  btnTranscrever.addEventListener('click', async () => {
    const url = inputUrl.value.trim();
    if (!url) { status.style.display = ''; status.innerHTML = '<span style="color:var(--warning,#f59e0b)">Cole uma URL.</span>'; return; }

    btnTranscrever.disabled = true;
    btnTranscrever.innerHTML = '<span class="btn-spinner"></span> Processando…';
    status.style.display = '';
    status.innerHTML = '<span style="color:var(--fg-muted)">Buscando conteúdo da URL…</span>';

    // Squad animado em paralelo (so anima se toggle on; no-op caso contrario)
    const squad = iniciarSquadParalelo('alimentarAvulso', {
      titulo: 'Trazendo conteúdo da URL',
      subtitulo: `Cérebro ${cerebroAtualRef.nome}`,
      cerebroNome: cerebroAtualRef.nome,
    });

    try {
      const sb = getSupabase();
      const { data: prod } = await sb.from('produtos').select('id').eq('slug', cerebroAtualRef.slug).single();
      const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
      if (!cer) throw new Error('Cérebro não encontrado.');

      const r = await processarUrl(url, cer.id);
      if (r.error) throw new Error(r.error);

      const custoBrl = (Number(r.custo_usd || 0) * 5.5).toFixed(2);
      const metodoLabel = r.metodo === 'youtube-legendas' ? 'Legendas oficiais (grátis)'
        : r.metodo?.startsWith('apify-') ? 'Apify'
        : r.metodo;

      // Mensagem de sucesso GRANDE e clara — usuario nao precisa mais clicar em nada
      status.innerHTML = '';
      status.appendChild(el('div', {
        style: 'padding:1rem 1.125rem;background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.04));border:1px solid rgba(16,185,129,0.4);border-radius:8px',
      }, [
        el('div', {
          style: 'color:#10b981;font-weight:700;font-size:1rem;margin-bottom:.5rem;display:flex;align-items:center;gap:.5rem',
        }, [
          el('span', {}, '✓'),
          el('span', {}, 'Pronto! Conteúdo já está no Cérebro'),
        ]),
        el('div', { style: 'font-size:.8125rem;color:var(--fg-muted);line-height:1.55;margin-bottom:.875rem' }, [
          el('strong', { style: 'color:var(--fg)' }, r.titulo || 'sem título'),
          el('br'),
          `Classificado como ${r.tipo} · ${r.chunks} chunk${r.chunks === 1 ? '' : 's'} · ${metodoLabel} · R$ ${custoBrl}`,
        ]),
        el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' }, [
          el('button', {
            class: 'btn btn-primary',
            type: 'button',
            style: 'font-size:.8125rem',
            onclick: () => {
              if (typeof onIndexado === 'function') onIndexado();
            },
          }, '→ Ver no Cérebro'),
          el('button', {
            class: 'btn btn-ghost',
            type: 'button',
            style: 'font-size:.8125rem',
            onclick: () => {
              status.style.display = 'none';
              status.innerHTML = '';
              inputUrl.value = '';
              inputUrl.focus();
              btnTranscrever.disabled = false;
              btnTranscrever.innerHTML = '⬇ Trazer pro Cérebro';
            },
          }, '+ Trazer outra URL'),
        ]),
      ]));

      inputUrl.value = '';
      btnTranscrever.disabled = true; // desabilitado ate usuario clicar "+ Trazer outra URL"
      btnTranscrever.innerHTML = '✓ Indexado';

      // Marca que algo foi alimentado nesta sessao do modal
      modalAlimentouAlgo = true;

      // Sinaliza pro Squad concluir animacao
      squad.sinalizarConclusao({ ok: true, fontes: 1, chunks: r.chunks });

      // Refresca cache global e notifica subnav
      cerebrosCache = await fetchCerebrosCatalogo();
      window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'cerebro_alimentado', slug: cerebroAtualRef.slug } }));
    } catch (e) {
      squad.sinalizarErro(e);
      status.innerHTML = `
        <div style="padding:.75rem;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:var(--danger);font-size:.875rem;line-height:1.5">
          ${e.message || String(e)}
        </div>
      `;
      btnTranscrever.disabled = false;
      btnTranscrever.innerHTML = '⬇ Tentar de novo';
    }
  });

  wrap.append(
    el('label', {}, '🔗 URL (YouTube, Instagram, TikTok, site, biblioteca de anúncios do Meta)'),
    inputUrl,
    btnTranscrever,
    status,
  );
  return wrap;
}

/* --- PASSO 2A: Avulso (1 arquivo, mesmo motor do Pacote) ---
 * Estratégia: cria zip de 1 arquivo no browser (via JSZip CDN) e passa
 * pelo mesmo fluxo preparar → processar-onda. Garante que a classificação
 * e vetorização são idênticas ao Pacote — uma implementação só.
 */
function renderStepAvulso() {
  const step = el('div', { class: 'modal-step' });
  let arquivoSelecionado = null;

  const infoArquivo = el('div', { class: 'arquivos-lista', style: 'margin-top:.5rem' });
  const avisoLimite = el('div', { style: 'display:none;margin-top:.5rem' });
  const areaProgresso = el('div', { style: 'display:none;margin-top:1rem' });

  function renderArquivo() {
    infoArquivo.innerHTML = '';
    avisoLimite.style.display = 'none';
    avisoLimite.innerHTML = '';
    if (!arquivoSelecionado) return;
    const mb = arquivoSelecionado.size / 1024 / 1024;
    infoArquivo.append(el('div', { class: 'arquivo-row' }, [
      el('span', { class: 'arquivo-icon' }, iconePorExtensao(arquivoSelecionado.name)),
      el('span', { class: 'arquivo-nome' }, arquivoSelecionado.name),
      el('span', { class: 'arquivo-size' }, `${mb.toFixed(1)} MB`),
      el('button', { class: 'arquivo-remove', onclick: () => { arquivoSelecionado = null; inputArquivo.value = ''; renderArquivo(); atualizarBotao(); } }, '×'),
    ]));
    if (mb > MAX_UPLOAD_MB) {
      avisoLimite.style.display = '';
      avisoLimite.innerHTML = `<div class="cron-infobox"><strong>Arquivo muito grande</strong><p>Limite é ${MAX_UPLOAD_MB}MB.</p></div>`;
      return;
    }
    // Aviso de custo (apenas se passar de R$0,05 — silencioso abaixo disso)
    const estimativa = estimarCustoIA(arquivoSelecionado);
    if (estimativa.custo_brl > 0.05) {
      avisoLimite.style.display = '';
      avisoLimite.innerHTML = `<div class="cron-infobox" style="border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.06)">
        <strong style="color:var(--warning,#f59e0b)">Aviso de custo · ${estimativa.metodo}</strong>
        <p>Este arquivo será processado por IA (custo estimado <strong>R$ ${estimativa.custo_brl.toFixed(2)}</strong>). Pra arquivos menores ou texto puro o custo é zero.</p>
      </div>`;
    }
  }

  function iconePorExtensao(nome) {
    const ext = (nome.toLowerCase().split('.').pop() || '');
    if (['png','jpg','jpeg','webp','gif'].includes(ext)) return '🖼';
    if (['mp3','ogg','opus','m4a','wav','webm','aac'].includes(ext)) return '🎙';
    if (ext === 'pdf') return '📕';
    return '📄';
  }

  // Estima custo de IA pre-upload. Cota R$/USD ~5,5. Custos OpenAI:
  //   - Vision (gpt-4o-mini): ~$0.001-0.005 por imagem
  //   - Whisper: $0.006/minuto (~ MB/min em mp3 128kbps)
  //   - Texto/PDF nativo: zero
  function estimarCustoIA(file) {
    const ext = (file.name.toLowerCase().split('.').pop() || '');
    const mb = file.size / 1024 / 1024;
    const USD_BRL = 5.5;
    if (['png','jpg','jpeg','webp','gif'].includes(ext)) {
      const custoUsd = 0.003; // imagem unica
      return { metodo: 'OCR via IA Vision', custo_brl: custoUsd * USD_BRL };
    }
    if (['mp3','ogg','opus','m4a','wav','webm','aac'].includes(ext)) {
      const minutos = Math.max(0.1, mb / 1.0); // heuristica conservadora
      const custoUsd = minutos * 0.006;
      return { metodo: 'Transcrição via Whisper', custo_brl: custoUsd * USD_BRL };
    }
    if (ext === 'pdf') {
      // PDF pode cair em Vision se for escaneado — assume melhor caso (texto nativo)
      // mas pra PDFs grandes (>5MB) provavelmente eh imagem
      if (mb > 3) {
        const custoUsd = 0.01 * Math.min(20, mb); // estimativa conservadora pra paginas
        return { metodo: 'PDF possivelmente OCR', custo_brl: custoUsd * USD_BRL };
      }
    }
    return { metodo: 'texto', custo_brl: 0 };
  }

  function atualizarBotao() {
    const temArquivo = !!arquivoSelecionado;
    const ok = temArquivo && (arquivoSelecionado.size / 1024 / 1024) <= MAX_UPLOAD_MB;
    btnProcessar.disabled = !ok;
    btnProcessar.style.opacity = ok ? '1' : '0.5';
    btnProcessar.style.cursor = ok ? 'pointer' : 'not-allowed';
    // Sem arquivo, some o botao "Alimentar" do rodape — URL tem botao proprio.
    btnProcessar.style.display = temArquivo ? '' : 'none';
  }

  const inputArquivo = el('input', {
    type: 'file',
    accept: '.md,.txt,.pdf,.csv,.html,.json,.png,.jpg,.jpeg,.webp,.gif,.mp3,.ogg,.opus,.m4a,.wav,.webm,.aac',
    style: 'display:none',
    onchange: (e) => {
      arquivoSelecionado = e.target.files[0] || null;
      renderArquivo();
      atualizarBotao();
    }
  });

  const btnEscolher = el('button', {
    class: 'btn',
    style: 'width:100%;padding:1rem;border-style:dashed',
    onclick: () => inputArquivo.click()
  }, '📎 Escolher arquivo');

  let processandoAgora = false;
  let pollInterval = null;

  const btnProcessar = el('button', {
    class: 'btn btn-primary',
    disabled: true,
    // Comeca escondido: so aparece quando o usuario seleciona arquivo
    style: 'opacity:0.5;display:none',
    onclick: async () => {
      if (processandoAgora || !arquivoSelecionado) return;

      const sb = getSupabase();
      if (!sb) { await alertarDark({ titulo: 'Sem conexão', mensagem: 'Supabase não conectado.', tipo: 'erro' }); return; }

      processandoAgora = true;
      btnProcessar.disabled = true;
      btnProcessar.style.pointerEvents = 'none';
      btnProcessar.innerHTML = '<span class="btn-spinner"></span> Preparando…';

      areaProgresso.style.display = '';
      areaProgresso.innerHTML = '';
      const uploadStatus = el('div', { class: 'progresso-status' }, '⬆ Preparando upload…');
      const uploadBarWrap = el('div', { class: 'upload-bar-wrap' });
      const uploadBar = el('div', { class: 'upload-bar' });
      uploadBarWrap.append(uploadBar);
      areaProgresso.append(uploadStatus, uploadBarWrap);

      // Squad paralelo (so anima se toggle on; no-op caso contrario)
      const squad = iniciarSquadParalelo('alimentarAvulso', {
        titulo: 'Alimentando Cerebro com 1 arquivo',
        subtitulo: `Cerebro ${cerebroAtual?.nome || ''}`,
        cerebroNome: cerebroAtual?.nome,
        arquivoNome: arquivoSelecionado?.name,
      });

      try {
        // Garante JSZip carregado
        if (typeof window.JSZip === 'undefined') {
          throw new Error('JSZip não carregado. Recarregue a página.');
        }

        // Busca cérebro
        const { data: prod } = await sb.from('produtos').select('id').eq('slug', cerebroAtual.slug).single();
        if (!prod) throw new Error('Produto não encontrado');
        const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
        if (!cer) throw new Error('Cérebro não encontrado');

        // Checa se já existe fonte com mesmo nome no cérebro (UX: perguntar antes)
        const tituloBase = arquivoSelecionado.name.replace(/\.[^.]+$/, '');
        const { data: existentes } = await sb.from('cerebro_fontes')
          .select('id, titulo')
          .eq('cerebro_id', cer.id)
          .eq('arquivo_nome', arquivoSelecionado.name)
          .limit(1);
        if (existentes && existentes.length > 0) {
          const confirmar = await confirmarDark({
            titulo: 'Arquivo já existe no Cérebro',
            mensagem: `Já existe uma fonte chamada "${tituloBase}" neste Cérebro. Se o conteúdo for idêntico, o sistema vai ignorar (dedup por sha256). Se for diferente, será adicionado normalmente.\n\nQuer continuar mesmo assim?`,
            confirmar: 'Sim, subir',
            perigoso: false,
          });
          if (!confirmar) {
            processandoAgora = false;
            btnProcessar.disabled = false;
            btnProcessar.style.pointerEvents = '';
            btnProcessar.innerHTML = 'Alimentar';
            atualizarBotao();
            areaProgresso.style.display = 'none';
            return;
          }
        }

        // Cria lote
        const { data: lote, error: eLote } = await sb.from('ingest_lotes').insert({
          cerebro_id: cer.id,
          tipo: 'upload_manual',
          status: 'recebido',
          nome_arquivo: arquivoSelecionado.name,
          tamanho_bytes: arquivoSelecionado.size,
          disparado_por: 'painel',
          disparado_via: 'avulso',
        }).select('id').single();
        if (eLote) throw new Error('Erro ao criar lote: ' + eLote.message);

        // Cria zip com o 1 arquivo (mesmo motor do Pacote)
        uploadStatus.innerHTML = '<strong>📦 Empacotando…</strong>';
        const zip = new window.JSZip();
        const arrBuf = await arquivoSelecionado.arrayBuffer();
        zip.file(arquivoSelecionado.name, arrBuf);
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const zipFile = new File([zipBlob], `${arquivoSelecionado.name}.zip`, { type: 'application/zip' });

        const storagePath = `lote/${lote.id}/${sanitizarNomeArquivo(zipFile.name)}`;

        uploadStatus.innerHTML = `<strong>⬆ Enviando…</strong> 0 / ${(zipFile.size / 1024 / 1024).toFixed(1)} MB`;
        await uploadZipComProgresso({
          file: zipFile,
          storagePath,
          supabaseUrl: window.__ENV__.SUPABASE_URL,
          anonKey: window.__ENV__.SUPABASE_ANON_KEY,
          onProgress: (pct, loaded, total) => {
            uploadBar.style.width = pct + '%';
            uploadStatus.innerHTML = `<strong>⬆ Enviando…</strong> ${pct}%`;
          },
        });
        uploadBar.style.width = '100%';

        // Progresso do processamento
        areaProgresso.innerHTML = '';
        const status = el('div', { class: 'progresso-status' }, '⏳ Preparando pacote…');
        const progressoWrap = el('div', { class: 'progresso-bar-wrap' });
        const progressoBar = el('div', { class: 'progresso-bar' });
        progressoWrap.append(progressoBar);
        areaProgresso.append(status, progressoWrap);
        btnProcessar.style.display = 'none';

        const envCfg = window.__ENV__ || {};

        async function chamarFunction(body, tentativa = 1) {
          try {
            const resp = await fetch(`${envCfg.SUPABASE_URL}/functions/v1/ingest-pacote`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${envCfg.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
            return data;
          } catch (e) {
            if (tentativa >= 3) throw e;
            await new Promise(r => setTimeout(r, tentativa * 3000));
            return chamarFunction(body, tentativa + 1);
          }
        }

        // preparar
        progressoBar.style.width = '10%';
        status.innerHTML = '<strong>⏳ Preparando</strong> · extraindo e indexando';
        const prep = await chamarFunction({
          modo: 'preparar',
          lote_id: lote.id,
          storage_path: storagePath,
          cerebro_id: cer.id,
        });

        if ((prep.total_pendentes || 0) === 0) {
          // Descobre o motivo real consultando o status do arquivo recém-uploadado
          const { data: arqInfo } = await sb.from('ingest_arquivos')
            .select('status, motivo_erro, nome_original')
            .eq('lote_id', lote.id).limit(1).single();

          progressoBar.style.width = '100%';
          progressoBar.style.background = 'var(--warning, #f59e0b)';
          squad.sinalizarConclusao({ ok: false, vazio: true });

          const ehDuplicado = (prep.duplicados_historico || 0) > 0;
          const ehQuarentena = arqInfo?.status === 'quarentena';

          if (ehDuplicado) {
            status.innerHTML = '<strong style="color:var(--warning,#f59e0b)">⚠ Arquivo já estava no Cérebro</strong>';
            areaProgresso.append(el('div', {
              style: 'margin-top:1rem;padding:1rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:.875rem;line-height:1.5;color:var(--fg-muted)'
            }, 'O sistema detectou (via hash do conteúdo) que este arquivo já foi adicionado anteriormente. Nada foi alterado.'));
          } else if (ehQuarentena) {
            status.innerHTML = '<strong style="color:var(--warning,#f59e0b)">⚠ Em quarentena</strong>';
            areaProgresso.append(el('div', {
              style: 'margin-top:1rem;padding:1rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:.875rem;line-height:1.5'
            }, [
              el('div', { style: 'color:var(--warning,#f59e0b);font-weight:600;margin-bottom:.5rem' }, 'Arquivo não foi adicionado ao Cérebro'),
              el('div', { style: 'color:var(--fg-muted);margin-bottom:.5rem' }, [
                'Motivo: ',
                el('strong', { style: 'color:var(--fg)' }, arqInfo?.motivo_erro || 'sem texto extraível'),
              ]),
              el('div', { style: 'color:var(--fg-muted);font-size:.8125rem' },
                'Arquivos com texto em camada de imagem (PDFs escaneados, páginas com layout gráfico, screenshots) não geram conteúdo indexável. Soluções: (1) cole o texto manualmente como tipo "Página de venda" ou "Aula", ou (2) salve como .txt/.md/.docx com texto selecionável.'
              ),
            ]));
          } else {
            status.innerHTML = '<strong style="color:var(--warning,#f59e0b)">⚠ Nada a processar</strong>';
            areaProgresso.append(el('div', {
              style: 'margin-top:1rem;padding:1rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:.875rem;line-height:1.5;color:var(--fg-muted)'
            }, 'O arquivo não gerou conteúdo indexável. Verifique se ele tem texto selecionável e tente novamente, ou cole o conteúdo manualmente.'));
          }

          areaProgresso.append(el('div', { class: 'progresso-footer' }, [
            el('button', { class: 'btn btn-primary', onclick: () => { fecharModal(); abrirCerebroDetalhe(cerebroAtual.slug); } }, 'Fechar'),
          ]));
          return;
        }

        // uma onda resolve (só 1 arquivo)
        let concluido = false;
        while (!concluido) {
          progressoBar.style.width = '60%';
          status.innerHTML = '<strong>🔢 Classificando + vetorizando…</strong>';
          const onda = await chamarFunction({
            modo: 'processar-onda',
            lote_id: lote.id,
            storage_path: storagePath,
            cerebro_id: cer.id,
            origem: 'upload_manual',
          });
          if (onda.concluido) { concluido = true; break; }
          if ((onda.processados || 0) === 0 && (onda.restantes || 0) > 0) {
            throw new Error('Onda não processou. Veja logs da Edge Function.');
          }
        }

        progressoBar.style.width = '100%';

        // Verifica se o arquivo foi pra quarentena (PDF escaneado, binario sem texto, etc)
        const { data: loteFinal } = await sb.from('ingest_lotes')
          .select('log_md, fontes_criadas, chunks_criados, em_quarentena')
          .eq('id', lote.id).single();
        const { data: arqInfo } = await sb.from('ingest_arquivos')
          .select('status, motivo_erro, nome_original')
          .eq('lote_id', lote.id).limit(1).single();

        const foiQuarentena = arqInfo?.status === 'quarentena' || (loteFinal?.em_quarentena || 0) > 0;

        if (foiQuarentena) {
          progressoBar.style.background = 'var(--warning, #f59e0b)';
          status.innerHTML = `<strong style="color:var(--warning,#f59e0b)">⚠ Em quarentena</strong>`;
          squad.sinalizarConclusao({ ok: false, mensagem: 'Arquivo em quarentena' });
          areaProgresso.append(el('div', {
            style: 'margin-top:1rem;padding:1rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:.875rem;line-height:1.5'
          }, [
            el('div', { style: 'color:var(--warning,#f59e0b);font-weight:600;margin-bottom:.5rem' }, 'Arquivo não foi adicionado ao Cérebro'),
            el('div', { style: 'color:var(--fg-muted);margin-bottom:.5rem' }, [
              'Motivo: ',
              el('strong', { style: 'color:var(--fg)' }, arqInfo?.motivo_erro || 'sem texto extraível'),
            ]),
            el('div', { style: 'color:var(--fg-muted);font-size:.8125rem' },
              'Arquivos com texto em camada de imagem (PDFs escaneados, páginas com layout gráfico, screenshots) não geram conteúdo indexável. Soluções: (1) cole o texto manualmente como tipo "Página de venda" ou "Aula", ou (2) salve como .txt/.md/.docx com texto selecionável.'
            ),
          ]));
        } else {
          status.innerHTML = '<strong>✅ Concluído</strong>';
          squad.sinalizarConclusao({ ok: true });
          // Marca que algo foi alimentado nesta sessao do modal
          modalAlimentouAlgo = true;
        }

        // Refresca cache + subnav (total de fontes mudou — só se não foi quarentena, mas refresca pra garantir)
        cerebrosCache = await fetchCerebrosCatalogo();
        window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'cerebro_alimentado', slug: cerebroAtual?.slug } }));

        if (loteFinal?.log_md) {
          const relatorioEl = el('pre', { class: 'progresso-relatorio' }, loteFinal.log_md);
          areaProgresso.append(relatorioEl);
          requestAnimationFrame(() => relatorioEl.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
        areaProgresso.append(el('div', { class: 'progresso-footer' }, [
          el('button', { class: 'btn btn-primary', onclick: () => { fecharModal(); abrirCerebroDetalhe(cerebroAtual.slug); } }, foiQuarentena ? 'Fechar' : 'Fechar e ver fontes'),
        ]));

      } catch (e) {
        squad.sinalizarErro(e);
        processandoAgora = false;
        await alertarDark({ titulo: 'Falha', mensagem: e.message, tipo: 'erro' });
        btnProcessar.disabled = false;
        btnProcessar.style.pointerEvents = '';
        btnProcessar.style.display = '';
        btnProcessar.textContent = 'Alimentar';
        atualizarBotao();
        areaProgresso.style.display = 'none';
      }
    }
  }, 'Alimentar');

  step.append(
    el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-back', onclick: () => trocarStep(renderStepModo()) }, '‹'),
      el('h2', {}, 'Alimentação avulsa'),
      el('div', { class: 'modal-sub' }, `Cérebro ${cerebroAtual?.nome || ''} — 1 arquivo por vez`),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'cron-infobox' }, [
        el('strong', {}, `📄 Avulso do ${cerebroAtual?.nome || ''}`),
        el('p', {}, 'Sobe 1 arquivo OU cola uma URL (YouTube, Instagram, TikTok). O sistema lê o conteúdo e classifica automaticamente.'),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, `📎 Arquivo (limite: ${MAX_UPLOAD_MB}MB) — texto, PDF, imagem, áudio`),
        btnEscolher,
        inputArquivo,
        infoArquivo,
        avisoLimite,
      ]),
      el('div', { class: 'avulso-ou' }, [
        el('span', {}, 'OU'),
      ]),
      blocoUrl(cerebroAtual, () => {
        fecharModal();
        abrirCerebroDetalhe(cerebroAtual.slug);
      }),
      areaProgresso,
    ]),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', onclick: fecharModal }, 'Fechar'),
      btnProcessar,
    ]),
  );

  return step;
}

/* --- PASSO 2B: Automático (placeholder "em breve") --- */
function renderStepAutomatico() {
  const step = el('div', { class: 'modal-step' });

  step.append(
    el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-back', onclick: () => trocarStep(renderStepModo()) }, '‹'),
      el('h2', {}, 'Alimentação automática'),
      el('div', { class: 'modal-sub' }, 'Em breve'),
      el('button', { class: 'modal-close', onclick: fecharModal }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      el('div', { class: 'stub-screen', style: 'margin:1rem 0' }, [
        el('div', { class: 'stub-badge' }, 'em breve'),
        el('h2', {}, 'Integrações automáticas'),
        el('p', {}, 'Estamos construindo a ponte com Discord, WhatsApp e Telegram. Quando ficar pronto, agentes vão captar depoimentos, objeções e sacadas automaticamente — sem você precisar subir nada manualmente.'),
        el('p', { style: 'margin-top:.75rem;font-size:.8125rem;color:var(--fg-muted)' }, 'Por enquanto, use Pacote (zip) ou Avulso (1 arquivo).'),
      ]),
    ]),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-primary', onclick: () => trocarStep(renderStepModo()) }, '← Voltar às opções'),
    ]),
  );

  return step;
}

