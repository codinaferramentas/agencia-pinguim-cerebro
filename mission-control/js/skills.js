/* Tela Skills — catalogo de skills (universais / por area / especificas)
   Padrao Anthropic Agent Skills (formato SKILL.md). */

import { fetchSkillsCatalogo } from './sb-client.js?v=20260427g';

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

let skillsCache = [];
let filtroCategoria = null;

export async function renderSkills() {
  const page = document.getElementById('page-skills');
  if (!page) return;
  page.innerHTML = '';

  // Loading
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
      title: 'Em breve',
      onclick: () => alert('Criação de Skill via painel — em breve. Por ora, criar SKILL.md em cerebro/skills/<slug>/ e cadastrar via SQL.'),
    }, '+ Nova Skill'),
  ]);
}

function montarConteudo() {
  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:1.5rem' });
  const ordemCategorias = ['universal', 'por_area', 'especifica'];

  ordemCategorias.forEach(cat => {
    if (filtroCategoria && filtroCategoria !== cat) return;

    const skillsCat = skillsCache.filter(s => s.categoria === cat);

    // Section header
    const header = el('div', { style: 'border-bottom:1px solid var(--border-subtle);padding-bottom:.625rem' }, [
      el('h2', { style: 'font-family:var(--font-heading);font-size:1.0625rem;color:var(--fg-title);margin:0;letter-spacing:-.01em' },
        `${LABEL_CATEGORIA[cat]} · ${skillsCat.length}`),
      el('div', { style: 'color:var(--fg-muted);font-size:.8125rem;margin-top:.25rem' },
        DESC_CATEGORIA[cat]),
    ]);

    wrap.appendChild(header);

    if (skillsCat.length === 0) {
      wrap.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;font-size:.875rem;padding:.5rem 0' },
        cat === 'especifica' ? 'Nenhuma skill específica ainda — específicas surgem quando agentes começam a operar.' : 'Vazio'));
      return;
    }

    // Agrupa por area dentro da categoria
    const porArea = {};
    skillsCat.forEach(s => {
      const a = s.area || '(sem área)';
      if (!porArea[a]) porArea[a] = [];
      porArea[a].push(s);
    });

    const grid = el('div', { class: 'skills-grid' });
    Object.keys(porArea).sort().forEach(area => {
      porArea[area].forEach(s => grid.appendChild(renderSkillCard(s)));
    });
    wrap.appendChild(grid);
  });

  return wrap;
}

function renderSkillCard(s) {
  const card = el('div', {
    class: 'skill-card',
    'data-skill': s.slug,
    onclick: () => abrirSkillDetalhe(s.slug),
    style: 'cursor:pointer',
  }, [
    el('div', { class: 'skill-card-top' }, [
      el('h4', {}, s.nome),
      el('span', {
        class: 'skill-status-tag',
        style: tagStyle(s.status),
      }, `${STATUS_DOT[s.status] || ''} ${STATUS_LABEL[s.status] || s.status}`),
    ]),
    el('div', { class: 'skill-desc' }, s.descricao || '—'),
    el('div', { class: 'skill-card-foot', style: 'display:flex;align-items:center;gap:.5rem;font-size:.6875rem;color:var(--fg-dim);margin-top:.625rem;font-family:var(--font-mono)' }, [
      s.area ? el('span', {}, s.area.toUpperCase()) : null,
      s.area && s.total_agentes ? el('span', {}, '·') : null,
      s.total_agentes > 0 ? el('span', {}, `${s.total_agentes} agente(s)`) : null,
      s.versao ? el('span', { style: 'margin-left:auto' }, s.versao) : null,
    ]),
  ]);
  return card;
}

function tagStyle(status) {
  const base = 'font-size:.625rem;padding:.125rem .5rem;border-radius:4px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.05em;';
  if (status === 'ativa') return base + 'background:rgba(34,197,94,.12);color:#22c55e';
  if (status === 'em_construcao') return base + 'background:rgba(245,165,36,.12);color:#f5a524';
  if (status === 'pausada') return base + 'background:rgba(234,179,8,.12);color:#eab308';
  return base + 'background:var(--surface-3);color:var(--fg-dim)';
}

// ----- Filtro por categoria (acionado pelo sidebar) -----
function aplicarFiltroCategoria(cat) {
  filtroCategoria = cat;
  renderSkills();
}
function limparFiltroCategoria() {
  filtroCategoria = null;
  renderSkills();
}
window.__aplicarFiltroSkillCategoria = aplicarFiltroCategoria;
window.__limparFiltroSkillCategoria = limparFiltroCategoria;

// ----- Detalhe -----
export async function abrirSkillDetalhe(slug) {
  // Garante que skillsCache esta carregado (caso usuario abra detalhe direto)
  if (skillsCache.length === 0) {
    try { skillsCache = await fetchSkillsCatalogo(); } catch {}
  }
  return _abrirSkillDetalheInterno(slug);
}
async function _abrirSkillDetalheInterno(slug) {
  const s = skillsCache.find(x => x.slug === slug);
  if (!s) return;

  const page = document.getElementById('page-skills');
  page.innerHTML = '';

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('div', { style: 'display:flex;align-items:center;gap:.625rem;flex-wrap:wrap' }, [
          el('button', {
            type: 'button',
            style: 'background:transparent;border:0;color:var(--fg-muted);font-size:.875rem;cursor:pointer;padding:0',
            onclick: () => renderSkills(),
          }, '‹ Skills'),
          el('span', { style: 'color:var(--fg-dim)' }, '/'),
          el('h1', { class: 'page-title', style: 'margin:0' }, s.nome),
          el('span', {
            style: tagStyle(s.status),
          }, `${STATUS_DOT[s.status] || ''} ${STATUS_LABEL[s.status] || s.status}`),
        ]),
        el('div', { class: 'page-subtitle' },
          `Categoria: ${LABEL_CATEGORIA[s.categoria]} · Área: ${s.area || '—'} · Versão: ${s.versao || 'v1.0'}`),
      ]),
    ]),
    el('div', { style: 'display:grid;grid-template-columns:1fr 320px;gap:1.5rem;align-items:start' }, [
      el('div', {}, [
        // Quando usar
        el('section', { style: 'margin-bottom:1.5rem' }, [
          el('h3', { style: 'font-family:var(--font-heading);font-size:.875rem;color:var(--fg-title);margin:0 0 .5rem;text-transform:uppercase;letter-spacing:.04em' }, 'Quando usar'),
          el('div', { style: 'color:var(--fg);font-size:.875rem;line-height:1.55' },
            s.quando_usar || 'Não preenchido.'),
        ]),
        // Descricao
        el('section', { style: 'margin-bottom:1.5rem' }, [
          el('h3', { style: 'font-family:var(--font-heading);font-size:.875rem;color:var(--fg-title);margin:0 0 .5rem;text-transform:uppercase;letter-spacing:.04em' }, 'Descrição'),
          el('div', { style: 'color:var(--fg-muted);font-size:.875rem;line-height:1.55' },
            s.descricao || '—'),
        ]),
        // Conteudo MD (se houver)
        s.status === 'em_construcao' || s.status === 'ativa'
          ? el('section', {}, [
              el('h3', { style: 'font-family:var(--font-heading);font-size:.875rem;color:var(--fg-title);margin:0 0 .5rem;text-transform:uppercase;letter-spacing:.04em' }, 'SKILL.md'),
              el('div', { id: `skill-md-${s.slug}`, style: 'color:var(--fg-muted);font-size:.8125rem;line-height:1.55;background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:8px;padding:1rem;font-family:var(--font-mono);white-space:pre-wrap;overflow-x:auto' }, 'Carregando…'),
            ])
          : el('section', { style: 'background:var(--surface-2);border:1px dashed var(--border);border-radius:10px;padding:1.5rem;text-align:center;color:var(--fg-muted)' }, [
              el('div', { style: 'font-size:1.25rem;margin-bottom:.5rem' }, '🚧'),
              el('div', {}, 'Skill planejada'),
              el('div', { style: 'font-size:.75rem;color:var(--fg-dim);margin-top:.5rem' },
                'O SKILL.md será criado quando essa habilidade for implementada.'),
            ]),
      ]),
      // Sidebar lateral com info
      el('aside', { style: 'background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:1rem' }, [
        el('div', { style: 'font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.5rem' }, 'Adoção'),
        el('div', { style: 'font-size:1.5rem;font-weight:600;color:var(--fg-title)' },
          `${s.total_agentes || 0}`),
        el('div', { style: 'font-size:.75rem;color:var(--fg-muted);margin-bottom:1rem' },
          'agente(s) usando'),
        el('div', { style: 'font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, 'Execuções'),
        el('div', { style: 'font-size:.875rem;color:var(--fg);font-family:var(--font-mono);margin-bottom:1rem' },
          String(s.total_execucoes || 0)),
        el('div', { style: 'font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem' }, 'Padrão'),
        el('div', { style: 'font-size:.75rem;color:var(--fg-muted);line-height:1.5' },
          'Anthropic Agent Skills (Dez/2025)'),
      ]),
    ]),
  );

  // Carrega conteudo MD se houver
  if (s.status === 'em_construcao' || s.status === 'ativa') {
    try {
      const { fetchSkills } = await import('./sb-client.js');
      const all = await fetchSkills();
      const cheia = all.find(x => x.slug === s.slug);
      const target = document.getElementById(`skill-md-${s.slug}`);
      if (target) {
        target.textContent = cheia?.conteudo_md || '(SKILL.md ainda não foi salvo)';
      }
    } catch (err) {
      console.error('skill md', err);
    }
  }
}
