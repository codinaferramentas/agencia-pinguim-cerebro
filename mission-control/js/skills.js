/* Tela Skills — catalogo + gestao completa
   Padrao Anthropic Agent Skills (formato SKILL.md). */

import { fetchSkillsCatalogo, getSupabaseClient } from './sb-client.js?v=20260427h';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'data') Object.entries(attrs[k]).forEach(([dk, dv]) => n.dataset[dk] = dv);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
};

const LABEL_CATEGORIA = {
  universal: 'Universais',
  por_area: 'Por Área',
  especifica: 'Específicas',
};
const DESC_CATEGORIA = {
  universal: 'Skills que qualquer agente pode usar — independente do produto, área ou função.',
  por_area: 'Skills compartilhadas entre agentes da mesma especialidade (comercial, marketing, CS, etc).',
  especifica: 'Skills exclusivas de um único agente. Customizações que não vale generalizar.',
};
const STATUS_LABEL = {
  planejada: 'Planejada',
  em_construcao: 'Em construção',
  ativa: 'Ativa',
  pausada: 'Pausada',
};
const STATUS_DOT = {
  planejada: '⚪',
  em_construcao: '🟡',
  ativa: '🟢',
  pausada: '⏸',
};
const AREAS_SUGERIDAS = [
  'rag', 'integracoes', 'conteudo', 'comercial', 'marketing', 'cs', 'dados', 'operacional', 'curadoria', 'ingestao', 'copy', 'suporte'
];

let skillsCache = [];
let filtroCategoria = null;

export async function renderSkills() {
  const page = document.getElementById('page-skills');
  if (!page) return;
  page.innerHTML = '';
  page.append(el('div', { class: 'page-loading', style: 'padding:2rem;color:var(--fg-dim)' }, 'Carregando skills…'));

  try {
    skillsCache = await fetchSkillsCatalogo();
  } catch (e) {
    page.innerHTML = `<div style="padding:2rem;color:var(--danger)">Erro: ${e.message}</div>`;
    return;
  }

  page.innerHTML = '';
  page.append(montarHeader(), montarConteudo());
}

function montarHeader() {
  const totalAtivas = skillsCache.filter(s => s.status === 'ativa').length;
  const totalEmConstrucao = skillsCache.filter(s => s.status === 'em_construcao').length;
  const totalPlanejadas = skillsCache.filter(s => s.status === 'planejada').length;
  const filtroAtivo = filtroCategoria ? LABEL_CATEGORIA[filtroCategoria] : null;

  return el('div', { class: 'page-header' }, [
    el('div', {}, [
      el('div', { style: 'display:flex;align-items:center;gap:.625rem' }, [
        el('h1', { class: 'page-title' }, filtroAtivo ? `Skills · ${filtroAtivo}` : 'Skills'),
        filtroAtivo ? el('button', {
          class: 'btn-limpar-filtro',
          type: 'button',
          style: 'background:transparent;border:1px solid var(--border-subtle);color:var(--fg-muted);padding:.25rem .625rem;border-radius:6px;font-size:.75rem;cursor:pointer',
          onclick: () => limparFiltroCategoria(),
        }, '× Limpar filtro') : null,
      ]),
      el('div', { class: 'page-subtitle' },
        `Receitas em Markdown que os agentes executam. Padrão Anthropic Agent Skills. ${skillsCache.length} no catálogo · ${totalAtivas} ativa(s) · ${totalEmConstrucao} em construção · ${totalPlanejadas} planejada(s).`),
    ]),
    el('button', {
      class: 'btn btn-primary',
      type: 'button',
      onclick: () => abrirModalNovaSkill(),
    }, '+ Nova Skill'),
  ]);
}

function montarConteudo() {
  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:1.5rem' });
  const ordemCategorias = ['universal', 'por_area', 'especifica'];

  ordemCategorias.forEach(cat => {
    if (filtroCategoria && filtroCategoria !== cat) return;
    const skillsCat = skillsCache.filter(s => s.categoria === cat);

    wrap.appendChild(el('div', { style: 'border-bottom:1px solid var(--border-subtle);padding-bottom:.625rem' }, [
      el('h2', { style: 'font-family:var(--font-heading);font-size:1.0625rem;color:var(--fg-title);margin:0;letter-spacing:-.01em' },
        `${LABEL_CATEGORIA[cat]} · ${skillsCat.length}`),
      el('div', { style: 'color:var(--fg-muted);font-size:.8125rem;margin-top:.25rem' }, DESC_CATEGORIA[cat]),
    ]));

    if (skillsCat.length === 0) {
      wrap.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;font-size:.875rem;padding:.5rem 0' },
        cat === 'especifica' ? 'Nenhuma skill específica ainda — específicas surgem quando agentes começam a operar.' : 'Vazio'));
      return;
    }

    const grid = el('div', { class: 'skills-grid' });
    skillsCat
      .slice()
      .sort((a, b) => (a.area || '').localeCompare(b.area || '') || (a.nome || '').localeCompare(b.nome || ''))
      .forEach(s => grid.appendChild(renderSkillCard(s)));
    wrap.appendChild(grid);
  });

  return wrap;
}

function renderSkillCard(s) {
  return el('div', {
    class: 'skill-card',
    'data-skill': s.slug,
    onclick: () => abrirSkillDetalhe(s.slug),
    style: 'cursor:pointer',
  }, [
    el('div', { class: 'skill-card-top' }, [
      el('h4', {}, s.nome),
      el('span', { style: tagStyle(s.status) }, `${STATUS_DOT[s.status] || ''} ${STATUS_LABEL[s.status] || s.status}`),
    ]),
    el('div', { class: 'skill-desc' }, s.descricao || '—'),
    el('div', { class: 'skill-card-foot', style: 'display:flex;align-items:center;gap:.5rem;font-size:.6875rem;color:var(--fg-dim);margin-top:.625rem;font-family:var(--font-mono)' }, [
      s.area ? el('span', {}, s.area.toUpperCase()) : null,
      s.area && s.total_agentes ? el('span', {}, '·') : null,
      s.total_agentes > 0 ? el('span', {}, `${s.total_agentes} agente(s)`) : null,
      s.versao ? el('span', { style: 'margin-left:auto' }, s.versao) : null,
    ]),
  ]);
}

function tagStyle(status) {
  const base = 'font-size:.625rem;padding:.125rem .5rem;border-radius:4px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;';
  if (status === 'ativa') return base + 'background:rgba(34,197,94,.12);color:#22c55e';
  if (status === 'em_construcao') return base + 'background:rgba(245,165,36,.12);color:#f5a524';
  if (status === 'pausada') return base + 'background:rgba(234,179,8,.12);color:#eab308';
  return base + 'background:var(--surface-3);color:var(--fg-dim)';
}

function aplicarFiltroCategoria(cat) { filtroCategoria = cat; renderSkills(); }
function limparFiltroCategoria() { filtroCategoria = null; renderSkills(); }
window.__aplicarFiltroSkillCategoria = aplicarFiltroCategoria;
window.__limparFiltroSkillCategoria = limparFiltroCategoria;

// =====================================================================
// DETALHE COM ABAS — Edição, Histórico, Aprendizados, Agentes
// =====================================================================

let abaAtual = 'editor';

export async function abrirSkillDetalhe(slug) {
  if (skillsCache.length === 0) {
    try { skillsCache = await fetchSkillsCatalogo(); } catch {}
  }
  return _abrirSkillDetalheInterno(slug);
}

async function _abrirSkillDetalheInterno(slug) {
  const s = skillsCache.find(x => x.slug === slug);
  if (!s) return;
  abaAtual = 'editor';

  const page = document.getElementById('page-skills');
  page.innerHTML = '';

  const sb = getSupabaseClient();
  // Busca conteudo completo (com conteudo_md)
  let skillCompleta = s;
  if (sb) {
    const { data } = await sb.from('skills').select('*').eq('slug', slug).maybeSingle();
    if (data) skillCompleta = { ...s, ...data };
  }

  page.append(montarDetalheHeader(skillCompleta), montarDetalheCorpo(skillCompleta));
}

function montarDetalheHeader(s) {
  const acoes = el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem' }, [
    s.status === 'em_construcao'
      ? el('button', {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => mudarStatus(s, 'ativa'),
          title: 'Marca como ativa. (Execução real depende de Edge Function — fase 2.2.)',
        }, '✓ Ativar')
      : null,
    s.status === 'ativa'
      ? el('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onclick: () => mudarStatus(s, 'pausada'),
        }, '⏸ Pausar')
      : null,
    s.status === 'pausada'
      ? el('button', {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => mudarStatus(s, 'ativa'),
        }, '▶ Reativar')
      : null,
    s.status === 'planejada'
      ? el('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onclick: () => mudarStatus(s, 'em_construcao'),
        }, '🚧 Iniciar construção')
      : null,
  ]);

  return el('div', { class: 'page-header' }, [
    el('div', {}, [
      el('div', { style: 'display:flex;align-items:center;gap:.625rem;flex-wrap:wrap' }, [
        el('button', {
          type: 'button',
          style: 'background:transparent;border:0;color:var(--fg-muted);font-size:.875rem;cursor:pointer;padding:0',
          onclick: () => renderSkills(),
        }, '‹ Skills'),
        el('span', { style: 'color:var(--fg-dim)' }, '/'),
        el('h1', { class: 'page-title', style: 'margin:0' }, s.nome),
        el('span', { style: tagStyle(s.status) }, `${STATUS_DOT[s.status] || ''} ${STATUS_LABEL[s.status] || s.status}`),
      ]),
      el('div', { class: 'page-subtitle' },
        `Categoria: ${LABEL_CATEGORIA[s.categoria]} · Área: ${s.area || '—'} · Versão: ${s.versao || 'v1.0'}`),
      acoes,
    ]),
  ]);
}

function montarDetalheCorpo(s) {
  const layout = el('div', { style: 'display:grid;grid-template-columns:1fr 280px;gap:1.5rem;align-items:start' });

  // Tabs
  const tabs = el('div', { style: 'display:flex;gap:.25rem;border-bottom:1px solid var(--border);margin-bottom:1rem' });
  const ABAS = [
    { id: 'editor', label: 'Editor' },
    { id: 'playground', label: 'Playground', disponivel: !!PLAYGROUNDS[s.slug] },
    { id: 'aprendizados', label: 'Aprendizados' },
    { id: 'historico', label: 'Histórico' },
    { id: 'agentes', label: 'Agentes' },
  ];
  ABAS.forEach(aba => {
    if (aba.disponivel === false) return;
    tabs.appendChild(el('button', {
      type: 'button',
      style: `background:transparent;border:0;border-bottom:2px solid ${abaAtual === aba.id ? 'var(--fg-title)' : 'transparent'};color:${abaAtual === aba.id ? 'var(--fg-title)' : 'var(--fg-muted)'};padding:.625rem 1rem;font-size:.8125rem;cursor:pointer;font-family:var(--font-heading);font-weight:${abaAtual === aba.id ? '600' : '400'}`,
      onclick: () => { abaAtual = aba.id; trocarAba(s); },
    }, aba.label));
  });

  const main = el('div', {});
  main.appendChild(tabs);
  const corpo = el('div', { id: 'skill-aba-corpo' });
  main.appendChild(corpo);
  layout.appendChild(main);

  // Sidebar lateral
  layout.appendChild(montarSidebarLateral(s));

  // Renderiza aba inicial
  renderizarAba(s, corpo);

  return layout;
}

async function trocarAba(s) {
  const corpo = document.getElementById('skill-aba-corpo');
  if (!corpo) return;
  corpo.innerHTML = '';
  // Re-render tabs (atualiza estilo do ativo)
  const layout = corpo.parentElement.parentElement;
  const detalhe = montarDetalheCorpo(s);
  layout.replaceWith(detalhe);
}

async function renderizarAba(s, corpo) {
  if (abaAtual === 'editor') return renderAbaEditor(s, corpo);
  if (abaAtual === 'playground') return renderAbaPlayground(s, corpo);
  if (abaAtual === 'aprendizados') return renderAbaAprendizados(s, corpo);
  if (abaAtual === 'historico') return renderAbaHistorico(s, corpo);
  if (abaAtual === 'agentes') return renderAbaAgentes(s, corpo);
}

// Mapa de skills com playground real (chamam Edge Function existente)
const PLAYGROUNDS = {
  'buscar-cerebro': {
    descricao: 'Testa busca semântica em um Cérebro do Pinguim. Faz a mesma chamada que um agente real faria.',
    render: renderPlaygroundBuscarCerebro,
  },
};

// ----- Aba: Editor -----
async function renderAbaEditor(s, corpo) {
  // 3 secoes: campos basicos editaveis + SKILL.md + botao salvar
  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:1.25rem' });

  // Campo: nome
  wrap.appendChild(campoTexto({
    label: 'Nome',
    valor: s.nome || '',
    onSave: (v) => atualizarCampo(s, 'nome', v),
  }));

  // Campo: descricao
  wrap.appendChild(campoTexto({
    label: 'Descrição (1 linha — usada no cartão e no system prompt do agente)',
    valor: s.descricao || '',
    onSave: (v) => atualizarCampo(s, 'descricao', v),
    multiline: true,
    rows: 3,
  }));

  // Campo: quando usar
  wrap.appendChild(campoTexto({
    label: 'Quando usar (gatilho — agente lê isso pra decidir se ativa a skill)',
    valor: s.quando_usar || '',
    onSave: (v) => atualizarCampo(s, 'quando_usar', v),
    multiline: true,
    rows: 3,
  }));

  // Campo: categoria + area + versao (linha de selects)
  const linhaCfg = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem' });

  linhaCfg.appendChild(campoSelect({
    label: 'Categoria',
    valor: s.categoria,
    opcoes: [
      { v: 'universal', l: 'Universal' },
      { v: 'por_area', l: 'Por Área' },
      { v: 'especifica', l: 'Específica' },
    ],
    onSave: (v) => atualizarCampo(s, 'categoria', v),
  }));

  linhaCfg.appendChild(campoSelectComLivre({
    label: 'Área',
    valor: s.area || '',
    opcoes: AREAS_SUGERIDAS,
    onSave: (v) => atualizarCampo(s, 'area', v),
  }));

  linhaCfg.appendChild(campoTexto({
    label: 'Versão',
    valor: s.versao || 'v1.0',
    onSave: (v) => atualizarCampo(s, 'versao', v),
  }));

  wrap.appendChild(linhaCfg);

  // Editor SKILL.md
  wrap.appendChild(el('div', {}, [
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:.375rem' }, [
      el('label', { style: 'font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono)' }, 'SKILL.md (procedimento completo)'),
      el('span', { style: 'font-size:.625rem;color:var(--fg-dim);font-family:var(--font-mono)' }, 'Markdown · frontmatter YAML opcional'),
    ]),
    el('textarea', {
      id: 'skill-conteudo-md',
      style: 'width:100%;min-height:480px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:1rem;font-family:var(--font-mono);font-size:.8125rem;color:var(--fg);line-height:1.55;resize:vertical',
      spellcheck: 'false',
    }, s.conteudo_md || ''),
    el('div', { style: 'display:flex;gap:.5rem;align-items:center;margin-top:.625rem' }, [
      el('input', {
        id: 'skill-versao-resumo',
        type: 'text',
        placeholder: 'Resumo da mudança (opcional)',
        style: 'flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.5rem .75rem;color:var(--fg);font-size:.8125rem',
      }),
      el('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => salvarConteudoMd(s),
      }, '💾 Salvar SKILL.md'),
    ]),
    el('div', {
      id: 'skill-save-status',
      style: 'margin-top:.5rem;font-size:.75rem;color:var(--fg-dim);min-height:1rem',
    }),
  ]));

  corpo.appendChild(wrap);
}

function campoTexto({ label, valor, onSave, multiline = false, rows = 1 }) {
  const id = 'campo-' + Math.random().toString(36).slice(2, 8);
  const input = multiline
    ? el('textarea', {
        id,
        rows: String(rows),
        style: 'width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.5rem .75rem;color:var(--fg);font-size:.875rem;font-family:var(--font-body);resize:vertical',
      }, valor)
    : el('input', {
        id,
        type: 'text',
        value: valor,
        style: 'width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.5rem .75rem;color:var(--fg);font-size:.875rem',
      });
  let dirty = false;
  input.addEventListener('input', () => { dirty = true; });
  input.addEventListener('blur', () => {
    if (!dirty) return;
    dirty = false;
    onSave(input.value);
  });
  return el('div', {}, [
    el('label', {
      for: id,
      style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.375rem',
    }, label),
    input,
  ]);
}

function campoSelect({ label, valor, opcoes, onSave }) {
  const id = 'campo-' + Math.random().toString(36).slice(2, 8);
  const select = el('select', {
    id,
    style: 'width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.5rem .75rem;color:var(--fg);font-size:.875rem',
    onchange: () => onSave(select.value),
  }, opcoes.map(o => {
    const opt = el('option', { value: o.v }, o.l);
    if (o.v === valor) opt.setAttribute('selected', '');
    return opt;
  }));
  return el('div', {}, [
    el('label', {
      for: id,
      style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.375rem',
    }, label),
    select,
  ]);
}

function campoSelectComLivre({ label, valor, opcoes, onSave }) {
  // Input texto + datalist (deixa escolher das opcoes ou digitar livre)
  const id = 'campo-' + Math.random().toString(36).slice(2, 8);
  const dlId = id + '-list';
  const input = el('input', {
    id,
    type: 'text',
    list: dlId,
    value: valor,
    style: 'width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.5rem .75rem;color:var(--fg);font-size:.875rem',
  });
  const dl = el('datalist', { id: dlId }, opcoes.map(o => el('option', { value: o })));
  let dirty = false;
  input.addEventListener('input', () => { dirty = true; });
  input.addEventListener('blur', () => {
    if (!dirty) return;
    dirty = false;
    onSave(input.value);
  });
  return el('div', {}, [
    el('label', {
      for: id,
      style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.375rem',
    }, label),
    input,
    dl,
  ]);
}

async function atualizarCampo(s, campo, valor) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const novo = valor === '' ? null : valor;
  const { error } = await sb.from('skills').update({ [campo]: novo }).eq('id', s.id);
  if (error) { alert('Erro ao salvar: ' + error.message); return; }
  s[campo] = novo;
  // Atualiza cache + dispara refresh do sidebar (categoria pode ter mudado)
  const idx = skillsCache.findIndex(x => x.id === s.id);
  if (idx >= 0) skillsCache[idx] = { ...skillsCache[idx], [campo]: novo };
  window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'skill' } }));
}

async function salvarConteudoMd(s) {
  const ta = document.getElementById('skill-conteudo-md');
  const resumoIn = document.getElementById('skill-versao-resumo');
  const status = document.getElementById('skill-save-status');
  if (!ta) return;
  const novoMd = ta.value;
  const resumo = resumoIn?.value?.trim() || null;

  const sb = getSupabaseClient();
  if (!sb) { status.textContent = 'Modo offline'; return; }

  status.style.color = 'var(--fg-dim)';
  status.textContent = 'Salvando…';

  try {
    // 1) Snapshot da versao atual ANTES de sobrescrever (se havia conteudo)
    if (s.conteudo_md && s.conteudo_md !== novoMd) {
      await sb.from('skill_versoes').insert({
        skill_id: s.id,
        versao: s.versao || 'v1.0',
        conteudo_md: s.conteudo_md,
        resumo_mudanca: resumo,
      });
    }
    // 2) Atualiza skill com novo conteudo
    const { error } = await sb.from('skills').update({ conteudo_md: novoMd }).eq('id', s.id);
    if (error) throw error;

    s.conteudo_md = novoMd;
    if (resumoIn) resumoIn.value = '';
    status.style.color = '#22c55e';
    status.textContent = '✓ Salvo · versão anterior arquivada no histórico';
  } catch (e) {
    status.style.color = 'var(--danger)';
    status.textContent = 'Erro: ' + e.message;
  }
}

async function mudarStatus(s, novoStatus) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb.from('skills').update({ status: novoStatus }).eq('id', s.id);
  if (error) { alert('Erro: ' + error.message); return; }
  s.status = novoStatus;
  const idx = skillsCache.findIndex(x => x.id === s.id);
  if (idx >= 0) skillsCache[idx].status = novoStatus;
  window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'skill' } }));
  abrirSkillDetalhe(s.slug);
}

// ----- Aba: Aprendizados (loop EPP) -----
async function renderAbaAprendizados(s, corpo) {
  const sb = getSupabaseClient();
  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:1rem' });

  // Form pra adicionar
  wrap.appendChild(el('div', { style: 'background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:1rem' }, [
    el('div', { style: 'font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.5rem' }, 'Novo aprendizado'),
    el('textarea', {
      id: 'apr-texto',
      rows: '3',
      placeholder: 'Ex: Em conversa com o Luiz, agente respondeu sem citar fonte. Lição: forçar citação na resposta final mesmo se score for alto.',
      style: 'width:100%;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:.625rem;color:var(--fg);font-size:.8125rem;font-family:var(--font-body);resize:vertical;margin-bottom:.5rem',
    }),
    el('input', {
      id: 'apr-contexto',
      type: 'text',
      placeholder: 'Contexto (opcional): ex "execução com Cérebro Elo em 2026-04-28"',
      style: 'width:100%;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:.5rem .625rem;color:var(--fg);font-size:.75rem;margin-bottom:.5rem',
    }),
    el('button', {
      class: 'btn btn-primary',
      type: 'button',
      onclick: () => adicionarAprendizado(s),
    }, '+ Registrar aprendizado'),
  ]));

  // Lista
  const lista = el('div', { id: 'apr-lista' });
  wrap.appendChild(lista);
  corpo.appendChild(wrap);

  if (!sb) return;
  const { data, error } = await sb.from('skill_aprendizados').select('*').eq('skill_id', s.id).order('criado_em', { ascending: false });
  if (error) {
    lista.appendChild(el('div', { style: 'color:var(--danger);font-size:.875rem' }, 'Erro: ' + error.message));
    return;
  }
  if (!data || data.length === 0) {
    lista.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;font-size:.875rem;padding:1rem;text-align:center' },
      'Nenhum aprendizado ainda. Aprendizados são corrigidos pelo humano e fazem a skill evoluir.'));
    return;
  }
  data.forEach(apr => {
    lista.appendChild(el('div', {
      style: 'background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:8px;padding:.875rem;margin-bottom:.5rem',
    }, [
      el('div', { style: 'color:var(--fg);font-size:.8125rem;line-height:1.55' }, apr.texto),
      apr.contexto ? el('div', { style: 'color:var(--fg-muted);font-size:.6875rem;margin-top:.5rem;font-style:italic' }, apr.contexto) : null,
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:.5rem;font-size:.625rem;color:var(--fg-dim);font-family:var(--font-mono)' }, [
        el('span', {}, new Date(apr.criado_em).toLocaleString('pt-BR')),
        el('span', {}, apr.aplicado ? '✓ aplicado' : 'pendente'),
      ]),
    ]));
  });
}

async function adicionarAprendizado(s) {
  const txtEl = document.getElementById('apr-texto');
  const ctxEl = document.getElementById('apr-contexto');
  const texto = txtEl?.value?.trim();
  const contexto = ctxEl?.value?.trim() || null;
  if (!texto) { alert('Texto vazio'); return; }
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb.from('skill_aprendizados').insert({
    skill_id: s.id, texto, contexto,
  });
  if (error) { alert('Erro: ' + error.message); return; }
  txtEl.value = ''; ctxEl.value = '';
  // Re-render aba
  const corpo = document.getElementById('skill-aba-corpo');
  if (corpo) { corpo.innerHTML = ''; renderAbaAprendizados(s, corpo); }
}

// ----- Aba: Historico -----
async function renderAbaHistorico(s, corpo) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const wrap = el('div', {});
  corpo.appendChild(wrap);

  const { data, error } = await sb.from('skill_versoes').select('*').eq('skill_id', s.id).order('criado_em', { ascending: false });
  if (error) { wrap.appendChild(el('div', { style: 'color:var(--danger)' }, 'Erro: ' + error.message)); return; }
  if (!data || data.length === 0) {
    wrap.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;padding:1rem;text-align:center' },
      'Nenhuma versão arquivada ainda. Cada vez que você salvar uma mudança no SKILL.md, a versão anterior fica guardada aqui.'));
    return;
  }
  data.forEach(v => {
    const card = el('div', {
      style: 'background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:8px;padding:.875rem;margin-bottom:.5rem',
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem' }, [
        el('div', {}, [
          el('strong', { style: 'font-family:var(--font-mono);color:var(--fg)' }, v.versao),
          v.resumo_mudanca
            ? el('span', { style: 'color:var(--fg-muted);margin-left:.5rem;font-size:.8125rem' }, '— ' + v.resumo_mudanca)
            : null,
        ]),
        el('div', { style: 'font-size:.625rem;color:var(--fg-dim);font-family:var(--font-mono)' },
          new Date(v.criado_em).toLocaleString('pt-BR')),
      ]),
      el('details', { style: 'margin-top:.5rem' }, [
        el('summary', { style: 'cursor:pointer;color:var(--fg-muted);font-size:.75rem' }, 'Ver conteúdo'),
        el('pre', {
          style: 'background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:6px;padding:.75rem;font-size:.6875rem;color:var(--fg-muted);max-height:300px;overflow:auto;margin-top:.5rem;white-space:pre-wrap',
        }, v.conteudo_md),
      ]),
      el('div', { style: 'display:flex;gap:.5rem;margin-top:.5rem' }, [
        el('button', {
          class: 'btn btn-ghost',
          type: 'button',
          style: 'font-size:.75rem',
          onclick: () => restaurarVersao(s, v),
        }, '↺ Restaurar esta versão'),
      ]),
    ]);
    wrap.appendChild(card);
  });
}

async function restaurarVersao(s, versao) {
  if (!confirm(`Restaurar a versão de ${new Date(versao.criado_em).toLocaleString('pt-BR')}?\n\nA versão atual será arquivada antes.`)) return;
  const sb = getSupabaseClient();
  if (!sb) return;
  // Arquiva atual
  if (s.conteudo_md) {
    await sb.from('skill_versoes').insert({
      skill_id: s.id,
      versao: s.versao || 'v1.0',
      conteudo_md: s.conteudo_md,
      resumo_mudanca: 'Antes de restaurar versão de ' + new Date(versao.criado_em).toLocaleDateString('pt-BR'),
    });
  }
  // Aplica versao restaurada
  const { error } = await sb.from('skills').update({ conteudo_md: versao.conteudo_md }).eq('id', s.id);
  if (error) { alert('Erro: ' + error.message); return; }
  s.conteudo_md = versao.conteudo_md;
  abrirSkillDetalhe(s.slug);
}

// ----- Aba: Agentes -----
async function renderAbaAgentes(s, corpo) {
  const sb = getSupabaseClient();
  const wrap = el('div', {});
  corpo.appendChild(wrap);
  if (!sb) return;
  const { data, error } = await sb.from('agente_skills').select('agente_id, ativo, criado_em').eq('skill_id', s.id);
  if (error) { wrap.appendChild(el('div', { style: 'color:var(--danger)' }, 'Erro: ' + error.message)); return; }
  if (!data || data.length === 0) {
    wrap.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;padding:1rem;text-align:center' },
      'Nenhum agente usa essa skill ainda. Quando agentes forem criados e plugarem essa skill, aparecem aqui.'));
    return;
  }
  // (futuro: join com pinguim.agentes pra mostrar nome)
  data.forEach(rel => {
    wrap.appendChild(el('div', {
      style: 'background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:8px;padding:.625rem .875rem;margin-bottom:.375rem;font-size:.8125rem',
    }, [
      el('span', { style: 'font-family:var(--font-mono);color:var(--fg-muted)' }, rel.agente_id),
      rel.ativo ? el('span', { style: 'margin-left:.5rem;color:#22c55e' }, '✓ ativo') : el('span', { style: 'margin-left:.5rem;color:var(--fg-dim)' }, 'inativo'),
    ]));
  });
}

// ----- Sidebar lateral (info da skill) -----
function montarSidebarLateral(s) {
  return el('aside', {
    style: 'background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:1rem;display:flex;flex-direction:column;gap:1rem;position:sticky;top:1rem',
  }, [
    blocoInfo('Adoção', `${s.total_agentes || 0}`, 'agente(s) usando'),
    blocoInfo('Execuções', String(s.total_execucoes || 0), s.ultima_execucao ? `Última: ${new Date(s.ultima_execucao).toLocaleDateString('pt-BR')}` : 'Sem execuções ainda'),
    blocoInfo('Criada em', s.criado_em ? new Date(s.criado_em).toLocaleDateString('pt-BR') : '—', null),
    blocoInfo('Padrão', 'Anthropic Agent Skills', 'Spec aberto · Dez/2025'),
  ]);
}
function blocoInfo(label, valor, sub) {
  return el('div', {}, [
    el('div', { style: 'font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, label),
    el('div', { style: 'font-size:.9375rem;color:var(--fg-title);font-weight:600' }, valor),
    sub ? el('div', { style: 'font-size:.6875rem;color:var(--fg-muted);margin-top:.125rem' }, sub) : null,
  ]);
}

// =====================================================================
// MODAL: Nova Skill
// =====================================================================
function abrirModalNovaSkill() {
  const overlay = el('div', {
    style: 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:1rem',
    onclick: (e) => { if (e.target === overlay) document.body.removeChild(overlay); },
  });
  const modal = el('div', {
    style: 'background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:560px;width:100%;max-height:90vh;overflow-y:auto',
  }, [
    el('h2', { style: 'font-family:var(--font-heading);font-size:1.125rem;color:var(--fg-title);margin:0 0 1rem' }, 'Nova Skill'),
    campoTextoSimples('nm', 'Nome', 'Ex: Buscar conhecimento em Cérebro'),
    campoTextoSimples('sl', 'Slug (kebab-case, único)', 'ex: buscar-cerebro', 'pattern=[a-z0-9-]+'),
    campoTextoSimples('ds', 'Descrição (1 frase, vai aparecer no card e no system prompt)', '', 'multiline rows=2'),
    campoTextoSimples('qu', 'Quando usar (gatilho)', '', 'multiline rows=2'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:.625rem;margin-bottom:.75rem' }, [
      campoSelectSimples('cat', 'Categoria', [
        { v: 'universal', l: 'Universal' },
        { v: 'por_area', l: 'Por Área' },
        { v: 'especifica', l: 'Específica' },
      ]),
      campoTextoSimples('ar', 'Área (livre)', 'rag · integracoes · comercial…'),
    ]),
    el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem' }, [
      el('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onclick: () => document.body.removeChild(overlay),
      }, 'Cancelar'),
      el('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => criarSkill(overlay),
      }, '+ Criar'),
    ]),
    el('div', { id: 'novo-skill-erro', style: 'color:var(--danger);font-size:.75rem;margin-top:.5rem' }),
  ]);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.getElementById('campo-nm')?.focus();
}

function campoTextoSimples(id, label, placeholder = '', extras = '') {
  const isMulti = extras.includes('multiline');
  const rows = (extras.match(/rows=(\d+)/) || [])[1] || '1';
  const inner = isMulti
    ? el('textarea', {
        id: 'campo-' + id, rows,
        placeholder,
        style: 'width:100%;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:.5rem .625rem;color:var(--fg);font-size:.8125rem;font-family:var(--font-body);resize:vertical;margin-bottom:.75rem',
      })
    : el('input', {
        id: 'campo-' + id, type: 'text', placeholder,
        style: 'width:100%;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:.5rem .625rem;color:var(--fg);font-size:.8125rem;margin-bottom:.75rem',
      });
  return el('div', {}, [
    el('label', { for: 'campo-' + id, style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, label),
    inner,
  ]);
}
function campoSelectSimples(id, label, opcoes) {
  return el('div', {}, [
    el('label', { for: 'campo-' + id, style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, label),
    el('select', {
      id: 'campo-' + id,
      style: 'width:100%;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:.5rem .625rem;color:var(--fg);font-size:.8125rem;margin-bottom:.75rem',
    }, opcoes.map(o => el('option', { value: o.v }, o.l))),
  ]);
}

// =====================================================================
// PLAYGROUND — testa skill real chamando Edge Function
// =====================================================================
async function renderAbaPlayground(s, corpo) {
  const cfg = PLAYGROUNDS[s.slug];
  if (!cfg) {
    corpo.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;padding:2rem;text-align:center' },
      'Playground ainda não disponível pra essa skill. Cada skill precisa de uma Edge Function própria pra rodar de verdade.'));
    return;
  }
  corpo.appendChild(el('div', { style: 'color:var(--fg-muted);font-size:.8125rem;margin-bottom:1rem;padding:.625rem .875rem;background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:6px' },
    cfg.descricao));
  await cfg.render(s, corpo);
}

async function renderPlaygroundBuscarCerebro(s, corpo) {
  const sb = getSupabaseClient();
  if (!sb) {
    corpo.appendChild(el('div', { style: 'color:var(--danger)' }, 'Banco offline.'));
    return;
  }

  // Carrega lista de Cerebros pra o select
  const { data: cerebros } = await sb.from('vw_cerebros_catalogo').select('id, slug, nome, total_fontes').gt('total_fontes', 0).order('nome');

  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:1rem' });

  // Form
  wrap.appendChild(el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:.75rem' }, [
    el('div', {}, [
      el('label', { style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, 'Cérebro alvo'),
      el('select', {
        id: 'pg-cerebro',
        style: 'width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.5rem .625rem;color:var(--fg);font-size:.8125rem',
      }, (cerebros || []).map(c => el('option', { value: c.id }, `${c.nome} (${c.total_fontes} fontes)`))),
    ]),
    el('div', {}, [
      el('label', { style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, 'Top K'),
      el('input', {
        id: 'pg-topk', type: 'number', min: '1', max: '20', value: '5',
        style: 'width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.5rem .625rem;color:var(--fg);font-size:.8125rem',
      }),
    ]),
  ]));

  wrap.appendChild(el('div', {}, [
    el('label', { style: 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, 'Pergunta'),
    el('textarea', {
      id: 'pg-pergunta', rows: '3',
      placeholder: 'Ex: "Como é estruturado o programa Elo?" ou "Quais objeções aparecem quando aluno questiona o preço?"',
      style: 'width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:.625rem;color:var(--fg);font-size:.875rem;font-family:var(--font-body);resize:vertical',
    }),
  ]));

  wrap.appendChild(el('button', {
    id: 'pg-run',
    class: 'btn btn-primary',
    type: 'button',
    style: 'align-self:flex-start',
    onclick: () => executarBuscarCerebro(s),
  }, '▶ Executar busca'));

  wrap.appendChild(el('div', { id: 'pg-resultado', style: 'margin-top:.5rem' }));

  corpo.appendChild(wrap);
}

async function executarBuscarCerebro(s) {
  const cerebroEl = document.getElementById('pg-cerebro');
  const perguntaEl = document.getElementById('pg-pergunta');
  const topkEl = document.getElementById('pg-topk');
  const resEl = document.getElementById('pg-resultado');
  const btn = document.getElementById('pg-run');

  const cerebro_id = cerebroEl?.value;
  const query = perguntaEl?.value?.trim();
  const top_k = Number(topkEl?.value || 5);

  if (!cerebro_id || !query) { alert('Escolha Cérebro e digite a pergunta'); return; }

  btn.disabled = true; btn.textContent = '⏳ Executando…';
  resEl.innerHTML = '';

  const sb = getSupabaseClient();
  const t0 = Date.now();
  let resultado, erroMsg = null, sucesso = true;

  try {
    const { data, error } = await sb.functions.invoke('buscar-cerebro', {
      body: { cerebro_id, query, top_k },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    resultado = data;
  } catch (e) {
    sucesso = false;
    erroMsg = e.message || String(e);
  }

  const duracao = Date.now() - t0;
  btn.disabled = false; btn.textContent = '▶ Executar busca';

  // Loga execucao
  try {
    await sb.from('skill_execucoes').insert({
      skill_id: s.id,
      cerebro_id,
      input: { query, top_k },
      output: resultado || null,
      sucesso,
      erro: erroMsg,
      duracao_ms: duracao,
      custo_usd: resultado?.custo_usd || null,
    });
    // Atualiza contador
    await sb.from('skills').update({
      total_execucoes: (s.total_execucoes || 0) + 1,
      ultima_execucao: new Date().toISOString(),
    }).eq('id', s.id);
    s.total_execucoes = (s.total_execucoes || 0) + 1;
    s.ultima_execucao = new Date().toISOString();
  } catch (e) {
    console.warn('log execucao falhou', e);
  }

  // Render resultado
  if (!sucesso) {
    resEl.appendChild(el('div', {
      style: 'background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:1rem;color:#ef4444;font-size:.8125rem',
    }, '❌ Erro: ' + erroMsg));
    return;
  }

  // Header com metricas
  resEl.appendChild(el('div', {
    style: 'display:flex;gap:1rem;flex-wrap:wrap;padding:.75rem 1rem;background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:8px;font-family:var(--font-mono);font-size:.6875rem;color:var(--fg-muted);margin-bottom:.75rem',
  }, [
    el('span', {}, `✓ ${resultado.total} resultado(s)`),
    el('span', {}, `${duracao}ms`),
    resultado.custo_usd ? el('span', {}, `$${resultado.custo_usd.toFixed(8)}`) : null,
  ]));

  // Lista chunks
  if (resultado.total === 0) {
    resEl.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;padding:1rem' },
      'Nenhum chunk com similaridade suficiente. Cérebro pode não ter conteúdo sobre o assunto (gap de conhecimento).'));
    return;
  }

  (resultado.resultados || []).forEach((r, i) => {
    const scoreColor = r.similarity >= 0.7 ? '#22c55e' : r.similarity >= 0.5 ? '#f5a524' : '#666';
    resEl.appendChild(el('div', {
      style: 'background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:8px;padding:.875rem;margin-bottom:.5rem',
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;font-size:.75rem' }, [
        el('div', {}, [
          el('span', { style: 'font-family:var(--font-mono);color:var(--fg-dim)' }, `#${i + 1}`),
          el('span', { style: 'margin-left:.5rem;color:var(--fg-title);font-weight:600' }, r.titulo || '(sem título)'),
          el('span', { style: 'margin-left:.5rem;color:var(--fg-dim);text-transform:uppercase;font-size:.625rem;font-family:var(--font-mono)' }, r.tipo || ''),
        ]),
        el('span', {
          style: `font-family:var(--font-mono);font-size:.75rem;color:${scoreColor};font-weight:600`,
        }, `${(r.similarity * 100).toFixed(1)}%`),
      ]),
      el('div', {
        style: 'color:var(--fg-muted);font-size:.8125rem;line-height:1.55;white-space:pre-wrap',
      }, r.conteudo),
    ]));
  });
}

async function criarSkill(overlay) {
  const erroDiv = document.getElementById('novo-skill-erro');
  erroDiv.textContent = '';
  const nome = document.getElementById('campo-nm').value.trim();
  const slug = document.getElementById('campo-sl').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const descricao = document.getElementById('campo-ds').value.trim();
  const quando_usar = document.getElementById('campo-qu').value.trim();
  const categoria = document.getElementById('campo-cat').value;
  const area = document.getElementById('campo-ar').value.trim() || null;

  if (!nome || !slug) { erroDiv.textContent = 'Nome e slug são obrigatórios.'; return; }

  const sb = getSupabaseClient();
  if (!sb) { erroDiv.textContent = 'Sem conexão com banco.'; return; }

  const { data, error } = await sb.from('skills').insert({
    slug, nome, descricao: descricao || null, quando_usar: quando_usar || null,
    categoria, area, status: 'em_construcao', universal: categoria === 'universal',
    versao: 'v1.0',
  }).select().single();

  if (error) { erroDiv.textContent = 'Erro: ' + error.message; return; }
  document.body.removeChild(overlay);
  // Atualiza cache + abre detalhe
  skillsCache.push(data);
  window.dispatchEvent(new CustomEvent('dados:atualizado', { detail: { tipo: 'skill' } }));
  abrirSkillDetalhe(slug);
}
