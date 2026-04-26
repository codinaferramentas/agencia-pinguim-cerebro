/* Documentacao do Pinguim OS — visivel no painel.
   Tom: PRD de negocio, nao tecnico. Sempre fecha com "Por que isso importa".
   Cada doc e um modulo separado em ./docs/<slug>.js exportando { titulo, lede, meta, secoes }.
*/

import { fetchCerebrosCatalogo } from './sb-client.js?v=20260421p';

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

// Catalogo das docs disponiveis. Ordem aqui = ordem na sidebar e no indice.
export const DOCS_CATALOGO = [
  {
    slug: 'arquitetura',
    titulo: 'Visão geral · Arquitetura',
    descricao: 'O que é o Pinguim OS, por que existe, e como tudo se conecta. Comece por aqui.',
    meta: '4 min · conceito',
    secao: 'Fundamentos',
  },
  {
    slug: 'cerebros',
    titulo: 'Cérebros',
    descricao: 'A memória viva da agência. Cada produto tem um Cérebro alimentado com aulas, depoimentos, objeções, sacadas. Tudo que vira persona, copy, campanha nasce daqui.',
    meta: '5 min · módulo principal',
    secao: 'Módulos',
  },
  {
    slug: 'personas',
    titulo: 'Personas',
    descricao: 'O dossiê de 11 blocos sobre quem compra de você. Gerado automaticamente pelo Cérebro, editável, versionado a cada mudança.',
    meta: '4 min · módulo principal',
    secao: 'Módulos',
  },
  {
    slug: 'rag',
    titulo: 'RAG e consumo de tokens',
    descricao: 'Como o sistema reduz custo de IA usando recuperação contextual. As três portas de entrada e as cinco regras de ouro pra manter o consumo sob controle.',
    meta: '7 min · técnico-comercial',
    secao: 'Engenharia',
  },
  {
    slug: 'squad',
    titulo: 'Squad de agentes',
    descricao: 'Os 9 agentes IA da Pinguim, organizados por departamento. Como atuam em paralelo, quando entram em ação, o que cada um sabe fazer.',
    meta: '5 min · módulo principal',
    secao: 'Módulos',
  },
  {
    slug: 'integracoes',
    titulo: 'Integrações',
    descricao: 'Serviços externos plugáveis (RapidAPI, Apify) pra captar conteúdo de YouTube, Instagram, TikTok. Configure uma vez, sistema usa quando precisar.',
    meta: '3 min · captação',
    secao: 'Engenharia',
  },
  {
    slug: 'comercial',
    titulo: 'Plano Comercial',
    descricao: 'Time de apoio ao comercial Pinguim — fundação 4 famílias de Cérebro, 5 metodologias prontas, roadmap dos 5 agentes (SDR, Co-piloto, Analista, Coach, Cliente Oculto). Proposta a ser aprovada antes de codar.',
    meta: '8 min · proposta',
    secao: 'Propostas',
  },
];

export function buscarDoc(slug) {
  return DOCS_CATALOGO.find(d => d.slug === slug);
}

/* =====================================================================
   INDICE DE DOCS — abre quando clica em "Documentacao" no nav
   ===================================================================== */
export async function renderDocs() {
  const page = document.getElementById('page-docs');
  if (!page) return;
  page.innerHTML = '';

  // Agrupa por secao
  const porSecao = {};
  DOCS_CATALOGO.forEach(d => {
    if (!porSecao[d.secao]) porSecao[d.secao] = [];
    porSecao[d.secao].push(d);
  });

  const wrap = el('div', { class: 'docs-index' });
  wrap.appendChild(el('div', { class: 'docs-breadcrumb' }, [
    el('span', {}, 'Pinguim OS'),
    el('span', { class: 'sep' }, '/'),
    el('span', {}, 'Documentação'),
  ]));
  wrap.appendChild(el('h1', { class: 'docs-title' }, 'Documentação'));
  wrap.appendChild(el('p', { class: 'docs-lede' },
    'Como o Pinguim OS funciona, módulo por módulo. Linguagem de negócio — sem jargão técnico de banco ou código. Use isto pra entender o sistema, treinar o time, ou apresentar pra clientes.'
  ));

  Object.keys(porSecao).forEach(secao => {
    wrap.appendChild(el('div', { class: 'docs-section-label' }, secao));
    porSecao[secao].forEach(doc => {
      const card = el('a', {
        class: 'docs-card',
        href: '#',
        onclick: (e) => {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('docs:select', { detail: { slug: doc.slug } }));
        },
      }, [
        el('div', { class: 'docs-card-row1' }, [
          el('h3', {}, doc.titulo),
          el('div', { class: 'docs-card-meta' }, doc.meta),
        ]),
        el('p', {}, doc.descricao),
      ]);
      wrap.appendChild(card);
    });
  });

  page.appendChild(wrap);
}

/* =====================================================================
   DOC INDIVIDUAL — abre quando clica num card ou item do subnav
   ===================================================================== */
export async function renderDocDetalhe(slug) {
  const page = document.getElementById('page-docs');
  if (!page) return;
  const doc = buscarDoc(slug);
  if (!doc) {
    page.innerHTML = '<div style="padding:3rem;color:var(--fg-muted)">Documento não encontrado.</div>';
    return;
  }

  page.innerHTML = '<div style="padding:3rem;color:var(--fg-muted);text-align:center">Carregando…</div>';

  // Importa modulo da doc dinamicamente (lazy)
  const mod = await import(`./docs/${slug}.js?v=20260426e`);
  const conteudo = await mod.gerar();

  const wrap = el('div', { class: 'docs-detail' });

  // Header com botao voltar
  wrap.appendChild(el('div', { class: 'docs-breadcrumb' }, [
    el('a', {
      href: '#',
      onclick: (e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('docs:back')); },
    }, '← Documentação'),
    el('span', { class: 'sep' }, '/'),
    el('span', {}, conteudo.titulo),
  ]));
  wrap.appendChild(el('h1', { class: 'docs-title' }, conteudo.titulo));
  if (conteudo.lede) {
    wrap.appendChild(el('p', { class: 'docs-lede' }, conteudo.lede));
  }

  // Layout em 2 colunas: TOC sticky + conteudo principal
  const layout = el('div', { class: 'docs-layout' });

  // TOC
  const toc = el('aside', { class: 'docs-toc' }, [
    el('div', { class: 'docs-toc-label' }, 'Nesta página'),
  ]);
  conteudo.secoes.forEach(s => {
    toc.appendChild(el('a', {
      href: `#${s.id}`,
      class: 'docs-toc-link',
      onclick: (e) => {
        e.preventDefault();
        document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, s.titulo));
  });
  layout.appendChild(toc);

  // Conteudo
  const main = el('div', { class: 'docs-main' });
  conteudo.secoes.forEach(s => {
    const sec = el('section', { id: s.id, class: 'docs-section' });
    sec.appendChild(el('h2', {}, s.titulo));
    if (s.html) sec.appendChild(el('div', { html: s.html }));
    main.appendChild(sec);
  });

  // Pitch comercial — sempre presente
  if (conteudo.pitch) {
    const pitch = el('section', { class: 'docs-pitch' }, [
      el('div', { class: 'docs-pitch-label' }, 'Por que isso importa pra Pinguim'),
      el('div', { html: conteudo.pitch }),
    ]);
    main.appendChild(pitch);
  }

  // Footer
  main.appendChild(el('footer', { class: 'docs-footer' }, [
    el('div', {}, `Pinguim OS · ${new Date().getFullYear()}`),
    el('a', {
      href: '#',
      onclick: (e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('docs:back')); },
    }, 'Voltar à documentação →'),
  ]));

  layout.appendChild(main);
  wrap.appendChild(layout);

  page.innerHTML = '';
  page.appendChild(wrap);
  // Scroll pro topo ao abrir doc nova
  window.scrollTo({ top: 0 });
}

// Helper pra docs que precisam dos dados vivos (ex: lista de cerebros existentes)
export async function fetchCerebrosVivos() {
  try {
    const cerebros = await fetchCerebrosCatalogo();
    return cerebros.filter(c => c.slug !== 'pinguim');
  } catch {
    return [];
  }
}
