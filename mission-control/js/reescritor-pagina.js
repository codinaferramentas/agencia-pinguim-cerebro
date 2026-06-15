/* Mission Control — Reescritor de Página Universal
   Página completa: gera, visualiza, edita por bloco (com clones), publica, versiona.
*/

import { getSupabase } from './sb-client.js?v=20260605a';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

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

const CLONES_DISPONIVEIS = [
  { slug: 'halbert', nome: 'Gary Halbert', uso: 'Hero, CTA, urgência' },
  { slug: 'hormozi', nome: 'Alex Hormozi', uso: 'Oferta, stack, garantia' },
  { slug: 'schwartz', nome: 'Eugene Schwartz', uso: 'Problema, dor, consciência' },
  { slug: 'bencivenga', nome: 'Gary Bencivenga', uso: 'FAQ, objeções, persuasão' },
  { slug: 'kennedy', nome: 'Dan Kennedy', uso: 'Oferta irrecusável, fechamento' },
  { slug: 'georgi', nome: 'Stefan Georgi', uso: 'Mecanismo único, VSL' },
  { slug: 'brunson', nome: 'Russell Brunson', uso: 'Hook + Story + Offer' },
];

const TIPOS_BLOCO_LABEL = {
  hero: 'Hero / Above-the-fold',
  prova_social_topo: 'Prova social (topo)',
  problema_dor: 'Problema / Dor',
  agitação: 'Agitação',
  agitacao: 'Agitação',
  solucao_mecanismo: 'Solução / Mecanismo único',
  modulos_conteudo: 'Módulos / Conteúdo',
  bonus_stack: 'Bônus (stack)',
  prova_social_meio: 'Prova social (meio)',
  oferta_preco: 'Oferta / Preço',
  garantia: 'Garantia',
  instrutor_credibilidade: 'Instrutor / Credibilidade',
  faq_objecoes: 'FAQ / Objeções',
  cta_final: 'CTA Final',
};

// ============================================================
// API helpers
// ============================================================

async function chamarEdge(funcao, body) {
  const session = await getSupabase()?.auth?.getSession();
  const token = session?.data?.session?.access_token || window.__ENV__.SUPABASE_ANON_KEY;
  const r = await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/${funcao}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let j; try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }
  if (!r.ok) throw new Error(j.erro || j.error || `${funcao} ${r.status}`);
  return j;
}

async function carregarPaginas() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('paginas_reescritas')
    .select('id, produto_slug, produto_nome, versao, parent_id, url_publicada, anatomia_aplicada, criado_em, metricas, gaps')
    .order('criado_em', { ascending: false })
    .limit(40);
  if (error) { console.warn(error); return []; }
  return data || [];
}

async function carregarPagina(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from('paginas_reescritas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function carregarCerebros() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from('produtos').select('slug, nome').order('nome').limit(50);
  return data || [];
}

async function carregarRodadasLofi() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from('workflow_rodadas')
    .select('id, criado_em, sintese_consultor')
    .order('criado_em', { ascending: false })
    .limit(10);
  return data || [];
}

// ============================================================
// Estado local
// ============================================================

const state = {
  paginas: [],
  paginaAtiva: null,
  cerebros: [],
  rodadasLofi: [],
};

// ============================================================
// Render principal
// ============================================================

export async function renderReescritorPagina() {
  const root = document.getElementById('page-reescritor');
  if (!root) return;
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'reescritor-container' }, [
    el('header', { class: 'reescritor-header' }, [
      el('div', {}, [
        el('h1', { class: 'reescritor-titulo' }, '📐 Reescritor de Página'),
        el('p', { class: 'reescritor-sub' }, 'Lê cérebro do produto + persona + funil + diagnóstico → cospe página nova completa e publica URL pública.'),
      ]),
      el('button', { class: 'btn-primary btn-grande', onclick: abrirModalGerar }, '+ Gerar nova página'),
    ]),
    el('div', { id: 'reescritor-lista', class: 'reescritor-grid' }, [
      el('div', { class: 'reescritor-loading' }, 'Carregando páginas geradas…'),
    ]),
    el('div', { id: 'reescritor-detalhe' }),
  ]));

  injetarEstilos();

  // Carrega em paralelo
  const [paginas, cerebros, rodadas] = await Promise.all([
    carregarPaginas(),
    carregarCerebros(),
    carregarRodadasLofi(),
  ]);
  state.paginas = paginas;
  state.cerebros = cerebros;
  state.rodadasLofi = rodadas;
  renderListaPaginas();
}

function renderListaPaginas() {
  const root = document.getElementById('reescritor-lista');
  if (!root) return;
  root.innerHTML = '';

  if (state.paginas.length === 0) {
    root.appendChild(el('div', { class: 'reescritor-empty' }, [
      el('div', { class: 'empty-emoji' }, '🪄'),
      el('h3', {}, 'Nenhuma página gerada ainda'),
      el('p', {}, 'Clica em "Gerar nova página" pra começar.'),
    ]));
    return;
  }

  for (const p of state.paginas) {
    const card = el('div', { class: 'reescritor-card', onclick: () => abrirDetalhe(p.id) }, [
      el('div', { class: 'card-topo' }, [
        el('div', { class: 'card-produto' }, p.produto_nome || p.produto_slug),
        el('div', { class: 'card-versao' }, `v${p.versao}`),
      ]),
      el('div', { class: 'card-anatomia' }, p.anatomia_aplicada || 'low-ticket'),
      p.url_publicada
        ? el('a', { href: p.url_publicada, target: '_blank', class: 'card-url', onclick: (e) => e.stopPropagation() }, ['🔗 ', p.url_publicada.replace('https://', '')])
        : el('div', { class: 'card-url-pendente' }, 'sem URL pública (renderize/publique)'),
      el('div', { class: 'card-meta' }, [
        el('span', {}, new Date(p.criado_em).toLocaleString('pt-BR')),
        p.parent_id ? el('span', { class: 'tag-edicao' }, '✏️ edição') : null,
      ]),
      p.gaps && p.gaps.length > 0
        ? el('div', { class: 'card-gaps' }, `⚠️ Gaps: ${p.gaps.length}`)
        : null,
    ]);
    root.appendChild(card);
  }
}

// ============================================================
// Modal: gerar nova página
// ============================================================

function abrirModalGerar() {
  const modal = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === modal) modal.remove(); } }, [
    el('div', { class: 'modal-painel' }, [
      el('div', { class: 'modal-header' }, [
        el('h2', {}, '📐 Gerar nova página'),
        el('button', { class: 'btn-fechar', onclick: () => modal.remove() }, '×'),
      ]),
      el('div', { class: 'modal-body' }, [
        // Cérebro
        el('label', { class: 'form-label' }, 'Cérebro / Produto'),
        renderSelectCerebro(),

        // URL página atual
        el('label', { class: 'form-label' }, 'URL da página atual (opcional)'),
        el('input', { id: 'in-url-pagina', class: 'form-input', type: 'url', placeholder: 'https://lp-lofi.pages.dev/' }),
        el('div', { class: 'form-hint' }, 'Se vier, o motor lê a página e compara estado_atual vs estado_proposto.'),

        // Diagnóstico (rodada workflow Lo-fi)
        el('label', { class: 'form-label' }, 'Diagnóstico do Workflow (opcional)'),
        renderSelectDiagnostico(),
        el('div', { class: 'form-hint' }, 'Se selecionar uma rodada, o motor usa a síntese do consultor pra calibrar a copy.'),

        // Anatomia
        el('label', { class: 'form-label' }, 'Anatomia'),
        renderSelectAnatomia(),

        el('div', { class: 'form-acoes' }, [
          el('button', { class: 'btn-secundario', onclick: () => modal.remove() }, 'Cancelar'),
          el('button', { class: 'btn-primary', onclick: () => dispararGeracao(modal) }, '🚀 Gerar + Publicar'),
        ]),

        el('div', { id: 'modal-status', class: 'modal-status' }),
      ]),
    ]),
  ]);
  document.body.appendChild(modal);
}

function renderSelectCerebro() {
  const sel = el('select', { id: 'in-cerebro', class: 'form-select' });
  // Garante Lo-fi no topo
  sel.appendChild(el('option', { value: 'desafio-de-conte-do-lo-fi' }, '🎬 Desafio Lo-fi (recomendado)'));
  for (const c of state.cerebros) {
    if (c.slug === 'desafio-de-conte-do-lo-fi') continue;
    sel.appendChild(el('option', { value: c.slug }, c.nome));
  }
  return sel;
}

function renderSelectDiagnostico() {
  const sel = el('select', { id: 'in-diagnostico', class: 'form-select' });
  sel.appendChild(el('option', { value: '' }, '— sem diagnóstico —'));
  for (const r of state.rodadasLofi) {
    const dt = new Date(r.criado_em).toLocaleString('pt-BR');
    sel.appendChild(el('option', { value: r.id }, `Rodada ${dt}`));
  }
  return sel;
}

function renderSelectAnatomia() {
  const sel = el('select', { id: 'in-anatomia', class: 'form-select' });
  sel.appendChild(el('option', { value: 'low-ticket' }, 'Low-ticket (R$ 19-297, decisão rápida)'));
  sel.appendChild(el('option', { value: 'high-ticket' }, 'High-ticket (R$ 2k+, agendamento/aplicação)'));
  sel.appendChild(el('option', { value: 'vendas-longa' }, 'Vendas longa (ticket médio, página completa)'));
  return sel;
}

async function dispararGeracao(modal) {
  const cerebro_slug = $('#in-cerebro', modal).value;
  const url_pagina = $('#in-url-pagina', modal).value.trim() || undefined;
  const diagnostico_rodada_id = $('#in-diagnostico', modal).value || undefined;
  const anatomia = $('#in-anatomia', modal).value;

  const status = $('#modal-status', modal);
  status.innerHTML = '';
  status.appendChild(el('div', { class: 'status-rodando' }, [
    el('div', { class: 'spinner' }),
    el('div', {}, 'Lendo cérebro + persona + funil + diagnóstico…'),
    el('div', { class: 'status-sub' }, 'Pode levar 60-120s (LLM grande + clone + deploy Vercel).'),
  ]));

  try {
    const resp = await chamarEdge('tool-pagina-rodar-tudo', {
      cerebro_slug,
      url_pagina,
      diagnostico_rodada_id,
      anatomia,
    });

    if (!resp.ok) throw new Error(resp.erro || 'geração falhou');

    status.innerHTML = '';
    status.appendChild(el('div', { class: 'status-sucesso' }, [
      el('div', { class: 'status-emoji' }, '✅'),
      el('h3', {}, 'Página gerada e publicada!'),
      resp.url_publicada
        ? el('a', { href: resp.url_publicada, target: '_blank', class: 'btn-url-final' }, ['🔗 Abrir página: ', resp.url_publicada.replace('https://', '')])
        : el('div', {}, 'HTML gerado mas deploy falhou: ' + (resp.deploy_erro || '')),
      el('div', { class: 'status-meta' }, [
        `${Math.round(resp.resumo.total_ms / 1000)}s · `,
        `$${(resp.resumo.custo_usd || 0).toFixed(3)} · `,
        `${(resp.gaps || []).length} gaps`,
      ]),
      el('button', {
        class: 'btn-primary',
        onclick: () => {
          modal.remove();
          renderReescritorPagina().then(() => abrirDetalhe(resp.pagina_id));
        },
      }, '➜ Abrir detalhe da página'),
    ]));
  } catch (e) {
    status.innerHTML = '';
    status.appendChild(el('div', { class: 'status-erro' }, [
      el('h3', {}, '❌ Erro: ' + e.message),
      el('button', { class: 'btn-secundario', onclick: () => modal.remove() }, 'Fechar'),
    ]));
  }
}

// ============================================================
// Detalhe da página: lista de blocos, edição por bloco, comparação
// ============================================================

async function abrirDetalhe(paginaId) {
  const root = document.getElementById('reescritor-detalhe');
  if (!root) return;
  root.innerHTML = '<div class="reescritor-loading">Carregando detalhe…</div>';

  let pagina;
  try {
    pagina = await carregarPagina(paginaId);
  } catch (e) {
    root.innerHTML = `<div class="status-erro">Erro: ${e.message}</div>`;
    return;
  }
  if (!pagina) {
    root.innerHTML = '<div class="status-erro">Página não encontrada</div>';
    return;
  }
  state.paginaAtiva = pagina;

  const json = pagina.json_estruturado || {};
  const secoes = (json.secoes || []).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'detalhe-container' }, [
    el('div', { class: 'detalhe-header' }, [
      el('div', {}, [
        el('h2', {}, `${pagina.produto_nome} — v${pagina.versao}`),
        el('div', { class: 'detalhe-meta' }, [
          el('span', { class: 'badge-anatomia' }, pagina.anatomia_aplicada),
          pagina.parent_id ? el('span', { class: 'tag-edicao' }, '✏️ edição') : null,
          el('span', { class: 'detalhe-data' }, new Date(pagina.criado_em).toLocaleString('pt-BR')),
        ]),
      ]),
      el('div', { class: 'detalhe-acoes' }, [
        pagina.url_publicada
          ? el('a', { href: pagina.url_publicada, target: '_blank', class: 'btn-primary' }, '🔗 Abrir página publicada')
          : el('button', { class: 'btn-primary', onclick: () => rerenderizarEPublicar(pagina.id) }, '🚀 Publicar agora'),
        el('button', { class: 'btn-secundario', onclick: () => { state.paginaAtiva = null; document.getElementById('reescritor-detalhe').innerHTML = ''; } }, 'Fechar'),
      ]),
    ]),

    pagina.gaps && pagina.gaps.length > 0
      ? el('div', { class: 'gaps-alert' }, [
          el('strong', {}, '⚠️ Gaps detectados na geração: '),
          pagina.gaps.join(' · '),
        ])
      : null,

    el('div', { class: 'detalhe-fontes' }, [
      el('strong', {}, 'Fontes usadas: '),
      ...Object.entries(pagina.fontes_usadas || {}).map(([k, v]) =>
        el('span', { class: v ? 'fonte-ok' : 'fonte-gap' }, `${v ? '✓' : '✗'} ${k}`),
      ),
    ]),

    el('div', { class: 'blocos-lista' }, secoes.map(s => renderBlocoCard(s, pagina))),
  ]));
}

function renderBlocoCard(secao, pagina) {
  const proposto = secao.estado_proposto || {};
  const atual = secao.estado_atual || {};
  const headline = proposto.headline || proposto.copy || proposto.titulo_curto || JSON.stringify(proposto).slice(0, 100);

  return el('div', { class: 'bloco-card' }, [
    el('div', { class: 'bloco-header' }, [
      el('div', { class: 'bloco-ordem' }, String(secao.ordem || '?')),
      el('div', { class: 'bloco-tipo' }, [
        el('div', { class: 'bloco-tipo-label' }, TIPOS_BLOCO_LABEL[secao.tipo] || secao.tipo),
        el('div', { class: 'bloco-clone' }, [
          el('strong', {}, '🎤 '),
          secao.clone_responsavel || 'halbert',
        ]),
      ]),
      el('div', { class: 'bloco-acoes' }, [
        el('button', { class: 'btn-mini', onclick: () => abrirModalEditarBloco(pagina, secao) }, '✏️ Editar'),
        el('button', { class: 'btn-mini', onclick: () => abrirModalUploadFoto(pagina, secao) }, '🖼 Foto'),
      ]),
    ]),
    el('div', { class: 'bloco-preview' }, [
      atual.headline ? el('div', { class: 'preview-coluna preview-atual' }, [
        el('div', { class: 'preview-label' }, 'ATUAL'),
        el('div', { class: 'preview-headline' }, atual.headline || atual.copy || '—'),
      ]) : null,
      el('div', { class: 'preview-coluna preview-proposto' }, [
        el('div', { class: 'preview-label' }, 'PROPOSTO'),
        el('div', { class: 'preview-headline' }, headline),
      ]),
    ]),
    secao.racional ? el('details', { class: 'bloco-racional' }, [
      el('summary', {}, '💡 Por que essa mudança'),
      el('div', {}, secao.racional),
    ]) : null,
    secao.historico_edicao && secao.historico_edicao.length > 0 ? el('div', { class: 'bloco-historico' }, [
      el('strong', {}, `📝 ${secao.historico_edicao.length} edição(ões):`),
      ...secao.historico_edicao.map(h => el('div', { class: 'historico-item' }, [
        `${new Date(h.em).toLocaleString('pt-BR')} · clone ${h.clone}: "${h.instrucao_luiz}"`,
      ])),
    ]) : null,
  ]);
}

// ============================================================
// Modal: editar bloco
// ============================================================

function abrirModalEditarBloco(pagina, secao) {
  const modal = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === modal) modal.remove(); } }, [
    el('div', { class: 'modal-painel modal-grande' }, [
      el('div', { class: 'modal-header' }, [
        el('h2', {}, `✏️ Editar: ${TIPOS_BLOCO_LABEL[secao.tipo] || secao.tipo}`),
        el('button', { class: 'btn-fechar', onclick: () => modal.remove() }, '×'),
      ]),
      el('div', { class: 'modal-body' }, [
        el('label', { class: 'form-label' }, 'Estado atual deste bloco'),
        el('pre', { class: 'json-preview' }, JSON.stringify(secao.estado_proposto || {}, null, 2)),

        el('label', { class: 'form-label' }, 'Instrução pro clone (escreva em linguagem natural)'),
        el('textarea', {
          id: 'in-instrucao',
          class: 'form-textarea',
          rows: '4',
          placeholder: 'Ex: "Muda a headline pra ficar mais agressiva, citando o número específico de alunos que faturaram mais de R$10k. Tira a parte sobre garantia que já tem em outro bloco."',
        }),

        el('label', { class: 'form-label' }, 'Quem reescreve (clone)'),
        renderSelectClone(secao.clone_responsavel),

        el('div', { class: 'form-acoes' }, [
          el('button', { class: 'btn-secundario', onclick: () => modal.remove() }, 'Cancelar'),
          el('button', { class: 'btn-primary', onclick: () => dispararEdicao(modal, pagina, secao) }, '🎤 Regenerar bloco'),
        ]),

        el('div', { id: 'modal-edit-status', class: 'modal-status' }),
      ]),
    ]),
  ]);
  document.body.appendChild(modal);
}

function renderSelectClone(slugAtual) {
  const sel = el('select', { id: 'in-clone', class: 'form-select' });
  for (const c of CLONES_DISPONIVEIS) {
    const opt = el('option', { value: c.slug }, `${c.nome} — ${c.uso}`);
    if (c.slug === slugAtual) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

async function dispararEdicao(modal, pagina, secao) {
  const instrucao_luiz = $('#in-instrucao', modal).value.trim();
  const clone_slug = $('#in-clone', modal).value;

  if (!instrucao_luiz) {
    alert('Escreve o que quer mudar — sem instrução o clone não sabe pra onde ir.');
    return;
  }

  const status = $('#modal-edit-status', modal);
  status.innerHTML = '';
  const cloneNome = (CLONES_DISPONIVEIS.find(c => c.slug === clone_slug) || {}).nome || clone_slug;
  status.appendChild(el('div', { class: 'status-rodando' }, [
    el('div', { class: 'spinner' }),
    el('div', {}, `${cloneNome} reescrevendo o bloco com cérebro + persona + seu feedback…`),
  ]));

  try {
    const resp = await chamarEdge('tool-editar-bloco-pagina', {
      pagina_id: pagina.id,
      ordem_bloco: secao.ordem,
      instrucao_luiz,
      clone_slug,
    });

    if (!resp.ok) throw new Error(resp.erro || 'edição falhou');

    // Renderiza + publica nova versão
    status.innerHTML = '';
    status.appendChild(el('div', { class: 'status-rodando' }, [
      el('div', { class: 'spinner' }),
      el('div', {}, 'Bloco reescrito! Renderizando HTML e publicando v' + resp.versao + '…'),
    ]));

    const _render = await chamarEdge('tool-renderizar-pagina-html', { pagina_id: resp.nova_pagina_id });
    let urlPub = null;
    try {
      const deploy = await chamarEdge('tool-deploy-vercel', { pagina_id: resp.nova_pagina_id });
      urlPub = deploy.url_publicada;
    } catch (e) {
      console.warn('deploy falhou:', e);
    }

    status.innerHTML = '';
    status.appendChild(el('div', { class: 'status-sucesso' }, [
      el('div', { class: 'status-emoji' }, '✅'),
      el('h3', {}, `v${resp.versao} pronta!`),
      el('div', { class: 'diff-bloco' }, [
        el('div', { class: 'diff-coluna' }, [
          el('div', { class: 'diff-label' }, 'ANTES'),
          el('pre', {}, JSON.stringify(resp.bloco_editado.antes, null, 2)),
        ]),
        el('div', { class: 'diff-coluna' }, [
          el('div', { class: 'diff-label' }, 'DEPOIS'),
          el('pre', {}, JSON.stringify(resp.bloco_editado.depois, null, 2)),
        ]),
      ]),
      el('div', { class: 'racional-novo' }, [
        el('strong', {}, '💡 Racional: '),
        resp.bloco_editado.racional || '(sem racional)',
      ]),
      urlPub
        ? el('a', { href: urlPub, target: '_blank', class: 'btn-url-final' }, ['🔗 Abrir v', String(resp.versao), ': ', urlPub.replace('https://', '')])
        : el('div', { class: 'aviso' }, 'Deploy falhou — clique em "Publicar agora" no detalhe pra tentar de novo.'),
      el('button', {
        class: 'btn-primary',
        onclick: () => {
          modal.remove();
          renderReescritorPagina().then(() => abrirDetalhe(resp.nova_pagina_id));
        },
      }, '➜ Ver nova versão'),
    ]));
  } catch (e) {
    status.innerHTML = '';
    status.appendChild(el('div', { class: 'status-erro' }, [
      el('h3', {}, '❌ ' + e.message),
    ]));
  }
}

// ============================================================
// Modal: upload de foto pra bloco
// ============================================================

function abrirModalUploadFoto(pagina, secao) {
  const tiposBlocoComFoto = {
    hero: ['hero'],
    instrutor_credibilidade: ['instrutor'],
    prova_social_topo: ['depoimento1', 'depoimento2'],
    prova_social_meio: ['depoimento1'],
  };
  const camposPermitidos = tiposBlocoComFoto[secao.tipo] || ['principal'];

  const modal = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === modal) modal.remove(); } }, [
    el('div', { class: 'modal-painel' }, [
      el('div', { class: 'modal-header' }, [
        el('h2', {}, `🖼 Foto: ${TIPOS_BLOCO_LABEL[secao.tipo] || secao.tipo}`),
        el('button', { class: 'btn-fechar', onclick: () => modal.remove() }, '×'),
      ]),
      el('div', { class: 'modal-body' }, [
        el('label', { class: 'form-label' }, 'Slot da foto'),
        (() => {
          const sel = el('select', { id: 'in-campo-foto', class: 'form-select' });
          for (const c of camposPermitidos) {
            sel.appendChild(el('option', { value: c }, c));
          }
          return sel;
        })(),

        el('label', { class: 'form-label' }, 'Subir arquivo'),
        el('input', { id: 'in-arquivo', class: 'form-input', type: 'file', accept: 'image/*' }),

        el('label', { class: 'form-label' }, 'OU URL de imagem externa'),
        el('input', { id: 'in-url-img', class: 'form-input', type: 'url', placeholder: 'https://...' }),

        el('div', { class: 'form-acoes' }, [
          el('button', { class: 'btn-secundario', onclick: () => modal.remove() }, 'Cancelar'),
          el('button', { class: 'btn-primary', onclick: () => dispararUploadFoto(modal, pagina, secao) }, '⬆ Subir foto'),
        ]),

        el('div', { id: 'modal-upload-status', class: 'modal-status' }),
      ]),
    ]),
  ]);
  document.body.appendChild(modal);
}

async function dispararUploadFoto(modal, pagina, secao) {
  const campo_foto = $('#in-campo-foto', modal).value;
  const arquivo = $('#in-arquivo', modal).files[0];
  const url = $('#in-url-img', modal).value.trim();
  const status = $('#modal-upload-status', modal);
  status.innerHTML = '<div class="status-rodando"><div class="spinner"></div>Enviando foto…</div>';

  try {
    let body = { pagina_id: pagina.id, ordem_bloco: secao.ordem, campo_foto };
    if (arquivo) {
      body.foto_base64 = await arquivoParaBase64(arquivo);
    } else if (url) {
      body.foto_url = url;
    } else {
      throw new Error('Selecione arquivo OU URL.');
    }
    const resp = await chamarEdge('tool-upload-foto-pagina', body);
    if (!resp.ok) throw new Error(resp.erro || 'upload falhou');

    status.innerHTML = '';
    status.appendChild(el('div', { class: 'status-sucesso' }, [
      el('div', { class: 'status-emoji' }, '✅'),
      el('div', {}, 'Foto salva! Clica em "Publicar agora" pra regerar HTML+deploy.'),
      el('img', { src: resp.url_publica, class: 'foto-preview-upload' }),
      el('button', { class: 'btn-primary', onclick: () => { modal.remove(); rerenderizarEPublicar(pagina.id); } }, '🚀 Re-renderizar + Publicar'),
    ]));
  } catch (e) {
    status.innerHTML = '';
    status.appendChild(el('div', { class: 'status-erro' }, `❌ ${e.message}`));
  }
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ============================================================
// Re-renderizar + publicar
// ============================================================

async function rerenderizarEPublicar(paginaId) {
  const detalhe = document.getElementById('reescritor-detalhe');
  detalhe.insertAdjacentHTML('afterbegin', '<div id="rerender-status" class="status-rodando" style="margin:1rem 0"><div class="spinner"></div>Renderizando + publicando…</div>');
  try {
    await chamarEdge('tool-renderizar-pagina-html', { pagina_id: paginaId });
    const deploy = await chamarEdge('tool-deploy-vercel', { pagina_id: paginaId });
    document.getElementById('rerender-status')?.remove();
    if (deploy.url_publicada) {
      alert(`Publicado! ${deploy.url_publicada}`);
      window.open(deploy.url_publicada, '_blank');
    }
    await abrirDetalhe(paginaId);
  } catch (e) {
    document.getElementById('rerender-status')?.remove();
    alert(`Erro: ${e.message}`);
  }
}

// ============================================================
// Estilos
// ============================================================

function injetarEstilos() {
  if (document.getElementById('reescritor-styles')) return;
  const css = `
  .reescritor-container { padding: 2rem; max-width: 1400px; margin: 0 auto; color: #e5e7eb; }
  .reescritor-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; margin-bottom: 2rem; }
  .reescritor-titulo { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.5rem; }
  .reescritor-sub { color: #9ca3af; max-width: 600px; line-height: 1.5; }
  .btn-primary { background: #fb923c; color: #0a0a0a; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .btn-primary:hover { background: #fdba74; transform: translateY(-1px); }
  .btn-grande { font-size: 1rem; padding: 1rem 2rem; }
  .btn-secundario { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; }
  .btn-secundario:hover { background: #374151; }
  .btn-mini { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.85rem; cursor: pointer; }
  .btn-mini:hover { background: #374151; border-color: #fb923c; }
  .btn-fechar { background: none; border: none; color: #9ca3af; font-size: 2rem; cursor: pointer; line-height: 1; }
  .btn-fechar:hover { color: #fff; }

  .reescritor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .reescritor-card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 1.25rem; cursor: pointer; transition: all 0.2s; }
  .reescritor-card:hover { border-color: #fb923c; transform: translateY(-2px); }
  .card-topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .card-produto { font-weight: 600; color: #fff; }
  .card-versao { background: #fb923c20; color: #fb923c; padding: 0.2rem 0.6rem; border-radius: 99px; font-size: 0.85rem; font-weight: 600; }
  .card-anatomia { font-size: 0.85rem; color: #9ca3af; margin-bottom: 0.75rem; }
  .card-url { display: block; color: #fb923c; font-size: 0.85rem; text-decoration: none; margin-bottom: 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-url:hover { text-decoration: underline; }
  .card-url-pendente { font-size: 0.8rem; color: #6b7280; font-style: italic; margin-bottom: 0.5rem; }
  .card-meta { display: flex; gap: 0.5rem; font-size: 0.8rem; color: #6b7280; }
  .card-gaps { margin-top: 0.5rem; color: #f59e0b; font-size: 0.8rem; }
  .tag-edicao { background: #fb923c20; color: #fb923c; padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }

  .reescritor-empty { text-align: center; padding: 4rem 2rem; color: #6b7280; }
  .empty-emoji { font-size: 4rem; margin-bottom: 1rem; }
  .reescritor-loading { text-align: center; padding: 2rem; color: #6b7280; }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 2rem; }
  .modal-painel { background: #111827; border: 1px solid #1f2937; border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
  .modal-grande { max-width: 900px; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; border-bottom: 1px solid #1f2937; }
  .modal-header h2 { margin: 0; color: #fff; }
  .modal-body { padding: 1.5rem; }
  .form-label { display: block; color: #d1d5db; font-weight: 500; margin: 1rem 0 0.5rem; }
  .form-label:first-child { margin-top: 0; }
  .form-input, .form-select, .form-textarea { width: 100%; background: #0a0a0a; border: 1px solid #374151; color: #fff; padding: 0.75rem; border-radius: 8px; font-size: 0.95rem; font-family: inherit; }
  .form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: #fb923c; }
  .form-textarea { resize: vertical; min-height: 100px; }
  .form-hint { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }
  .form-acoes { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }

  .modal-status { margin-top: 1.5rem; }
  .status-rodando { display: flex; align-items: center; gap: 1rem; background: #1f2937; padding: 1rem; border-radius: 8px; color: #d1d5db; }
  .status-rodando .spinner { width: 24px; height: 24px; border: 3px solid #374151; border-top-color: #fb923c; border-radius: 50%; animation: spin 1s linear infinite; flex-shrink: 0; }
  .status-sub { font-size: 0.8rem; color: #9ca3af; }
  .status-sucesso { background: #064e3b; border: 1px solid #10b981; padding: 1.5rem; border-radius: 12px; color: #d1fae5; }
  .status-sucesso h3 { margin: 0.5rem 0; color: #fff; }
  .status-erro { background: #7f1d1d; border: 1px solid #ef4444; padding: 1.5rem; border-radius: 12px; color: #fecaca; }
  .status-emoji { font-size: 2.5rem; }
  .status-meta { font-size: 0.85rem; color: #9ca3af; margin: 0.5rem 0; }
  .btn-url-final { display: inline-block; background: #fb923c; color: #0a0a0a; padding: 0.75rem 1.25rem; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 0.75rem 0; }
  .btn-url-final:hover { background: #fdba74; }

  @keyframes spin { to { transform: rotate(360deg); } }

  .detalhe-container { background: #0a0a0a; border: 1px solid #1f2937; border-radius: 12px; padding: 1.5rem; margin-top: 1rem; }
  .detalhe-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .detalhe-header h2 { margin: 0 0 0.5rem; color: #fff; }
  .detalhe-meta { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .badge-anatomia { background: #1f2937; color: #fb923c; padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.8rem; font-weight: 500; }
  .detalhe-data { font-size: 0.85rem; color: #6b7280; }
  .detalhe-acoes { display: flex; gap: 0.75rem; }

  .gaps-alert { background: #78350f30; border: 1px solid #f59e0b; color: #fde68a; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; }
  .detalhe-fontes { font-size: 0.85rem; color: #9ca3af; margin-bottom: 1.5rem; padding: 0.75rem 1rem; background: #111827; border-radius: 8px; }
  .fonte-ok { color: #34d399; margin-right: 0.5rem; }
  .fonte-gap { color: #6b7280; margin-right: 0.5rem; }

  .blocos-lista { display: flex; flex-direction: column; gap: 1rem; }
  .bloco-card { background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 1.25rem; }
  .bloco-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .bloco-ordem { width: 36px; height: 36px; background: #fb923c20; color: #fb923c; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
  .bloco-tipo { flex: 1; }
  .bloco-tipo-label { font-weight: 600; color: #fff; }
  .bloco-clone { font-size: 0.8rem; color: #9ca3af; margin-top: 0.15rem; }
  .bloco-acoes { display: flex; gap: 0.5rem; }
  .bloco-preview { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 0.75rem; }
  .preview-coluna { background: #0a0a0a; border: 1px solid #1f2937; border-radius: 8px; padding: 0.75rem; }
  .preview-atual { border-color: #374151; }
  .preview-proposto { border-color: #fb923c40; }
  .preview-label { font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
  .preview-proposto .preview-label { color: #fb923c; }
  .preview-headline { color: #d1d5db; font-size: 0.95rem; line-height: 1.4; }
  .bloco-racional { margin-top: 0.5rem; }
  .bloco-racional summary { color: #9ca3af; cursor: pointer; padding: 0.5rem; background: #0a0a0a; border-radius: 6px; font-size: 0.85rem; }
  .bloco-racional summary:hover { color: #fb923c; }
  .bloco-racional div { padding: 0.75rem; background: #0a0a0a; border-radius: 6px; margin-top: 0.25rem; color: #d1d5db; font-size: 0.9rem; line-height: 1.5; }
  .bloco-historico { margin-top: 0.75rem; padding: 0.75rem; background: #0a0a0a; border-radius: 6px; }
  .historico-item { font-size: 0.8rem; color: #9ca3af; padding: 0.25rem 0; border-bottom: 1px solid #1f2937; }

  .json-preview { background: #0a0a0a; padding: 1rem; border-radius: 8px; font-size: 0.8rem; color: #d1d5db; overflow-x: auto; border: 1px solid #1f2937; max-height: 300px; overflow-y: auto; }
  .diff-bloco { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
  .diff-coluna { background: #0a0a0a; border: 1px solid #1f2937; padding: 0.75rem; border-radius: 6px; }
  .diff-label { font-size: 0.75rem; color: #fb923c; font-weight: 600; margin-bottom: 0.5rem; }
  .diff-coluna pre { color: #d1d5db; font-size: 0.75rem; overflow-x: auto; }
  .racional-novo { background: #0a0a0a; padding: 0.75rem 1rem; border-radius: 6px; color: #d1d5db; font-size: 0.9rem; margin: 0.75rem 0; }
  .foto-preview-upload { max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 0.75rem; border: 1px solid #1f2937; }
  .aviso { color: #f59e0b; font-size: 0.85rem; margin: 0.5rem 0; }
  `;
  const style = document.createElement('style');
  style.id = 'reescritor-styles';
  style.textContent = css;
  document.head.appendChild(style);
}
