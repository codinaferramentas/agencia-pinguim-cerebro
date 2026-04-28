/* Pinguim OS — Mapa do Sistema
   Tela de pitch comercial. Mostra a arquitetura em 4 camadas
   com contadores REAIS puxados do banco em tempo real.
   Cliente abre, entende em 5 segundos como uma agencia de IA
   opera de ponta a ponta — e fica obcecado.
*/

import { fetchCerebrosCatalogo, fetchSkillsCatalogo, getSupabase } from './sb-client.js?v=20260428b';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'data') Object.entries(attrs[k]).forEach(([dk, dv]) => n.setAttribute(`data-${dk}`, dv));
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

async function carregarMetricas() {
  const sb = getSupabase();
  const cerebros = await fetchCerebrosCatalogo().catch(() => []);
  const skills = await fetchSkillsCatalogo().catch(() => []);

  // Familias de Cerebro
  const semPinguim = cerebros.filter(c => c.slug !== 'pinguim');
  const familias = {
    interno: semPinguim.filter(c => (c.categoria || 'interno') === 'interno').length,
    externo: semPinguim.filter(c => c.categoria === 'externo').length,
    metodologia: semPinguim.filter(c => c.categoria === 'metodologia').length,
    clone: semPinguim.filter(c => c.categoria === 'clone').length,
  };

  // Skills por status
  const skillsAtivas = skills.filter(s => s.status === 'ativa').length;
  const skillsConstrucao = skills.filter(s => s.status === 'em_construcao').length;

  // Contadores diretos do banco (head:true so traz count). Cada um tolera ausencia da tabela.
  const contar = async (tabela, filtro) => {
    try {
      let q = sb.from(tabela).select('id', { count: 'exact', head: true });
      if (filtro) q = q.eq(filtro.col, filtro.val);
      const { count } = await q;
      return count || 0;
    } catch { return 0; }
  };
  let totalFontes = 0, totalChunks = 0, totalAgentes = 0, totalProvas = 0, totalIntegracoes = 0;
  if (sb) {
    [totalFontes, totalChunks, totalAgentes, totalProvas, totalIntegracoes] = await Promise.all([
      contar('cerebro_fontes', { col: 'ingest_status', val: 'ok' }),
      contar('cerebro_fontes_chunks'),
      contar('agentes'),
      contar('provas_sociais'),
      contar('integracoes'),
    ]);
  }

  return {
    cerebrosTotal: semPinguim.length,
    familias,
    skillsAtivas,
    skillsConstrucao,
    totalFontes,
    totalChunks,
    totalAgentes,
    totalProvas,
    totalIntegracoes,
  };
}

function metricBadge(valor, label) {
  return el('div', { class: 'mapa-metric' }, [
    el('div', { class: 'mapa-metric-valor' }, String(valor)),
    el('div', { class: 'mapa-metric-label' }, label),
  ]);
}

function bloco({ icone, nome, descricao, metrics = [], pagina = null, status = 'ativo' }) {
  const props = {
    class: `mapa-bloco status-${status}`,
    data: { status },
  };
  if (pagina) {
    props.role = 'button';
    props.tabindex = '0';
    props.onclick = () => window.dispatchEvent(new CustomEvent('mapa:navegar', { detail: { slug: pagina } }));
  }
  return el('div', props, [
    el('div', { class: 'mapa-bloco-head' }, [
      el('span', { class: 'mapa-bloco-icone' }, icone),
      el('div', { class: 'mapa-bloco-nome' }, nome),
    ]),
    el('div', { class: 'mapa-bloco-desc' }, descricao),
    metrics.length
      ? el('div', { class: 'mapa-bloco-metrics' }, metrics.map(m => metricBadge(m.valor, m.label)))
      : null,
  ]);
}

function camada(num, titulo, subtitulo, blocos) {
  return el('section', { class: 'mapa-camada' }, [
    el('div', { class: 'mapa-camada-head' }, [
      el('div', { class: 'mapa-camada-num' }, String(num)),
      el('div', {}, [
        el('div', { class: 'mapa-camada-titulo' }, titulo),
        el('div', { class: 'mapa-camada-sub' }, subtitulo),
      ]),
    ]),
    el('div', { class: 'mapa-camada-blocos' }, blocos),
  ]);
}

function seta() {
  return el('div', { class: 'mapa-seta' }, [
    el('div', { class: 'mapa-seta-linha' }),
    el('div', { class: 'mapa-seta-ponta' }, '▼'),
  ]);
}

export async function renderMapaSistema() {
  const page = document.getElementById('page-mapa');
  if (!page) return;
  page.innerHTML = '<div class="mapa-loading">Carregando o mapa do sistema…</div>';

  const m = await carregarMetricas();

  page.innerHTML = '';
  const wrap = el('div', { class: 'mapa-sistema' });

  // Hero
  wrap.appendChild(el('header', { class: 'mapa-hero' }, [
    el('div', { class: 'mapa-hero-eyebrow' }, 'Pinguim OS'),
    el('h1', { class: 'mapa-hero-titulo' }, 'Mapa do Sistema'),
    el('p', { class: 'mapa-hero-lede' }, 'Como uma agência de IA opera de ponta a ponta — captação, memória, inteligência e entrega — em uma única infraestrutura.'),
    el('div', { class: 'mapa-hero-stats' }, [
      el('div', { class: 'mapa-hero-stat' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, String(m.cerebrosTotal)),
        el('div', { class: 'mapa-hero-stat-label' }, 'Cérebros vivos'),
      ]),
      el('div', { class: 'mapa-hero-stat' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, String(m.totalFontes)),
        el('div', { class: 'mapa-hero-stat-label' }, 'Fontes ingeridas'),
      ]),
      el('div', { class: 'mapa-hero-stat' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, m.totalChunks.toLocaleString('pt-BR')),
        el('div', { class: 'mapa-hero-stat-label' }, 'Chunks vetorizados'),
      ]),
      el('div', { class: 'mapa-hero-stat' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, String(m.totalProvas)),
        el('div', { class: 'mapa-hero-stat-label' }, 'Provas sociais'),
      ]),
    ]),
  ]));

  // CAMADA 1 — CAPTACAO
  wrap.appendChild(camada(1, 'Captação', 'Conteúdo entra de qualquer canal — uma única fila de ingestão', [
    bloco({ icone: '💬', nome: 'Discord', descricao: 'Canal #depoimentos varrido automaticamente. Vision processa prints, Whisper transcreve áudios.', status: 'ativo' }),
    bloco({ icone: '📱', nome: 'WhatsApp', descricao: 'Grupos de alunos viram fonte. Z-API / Evolution.', status: 'em_construcao' }),
    bloco({ icone: '✈️', nome: 'Telegram', descricao: 'Canais e grupos monitorados.', status: 'em_construcao' }),
    bloco({ icone: '⬆️', nome: 'Upload manual', descricao: 'Arquivo, URL, transcrição. Avulso ou em pacote.', pagina: 'cerebros', status: 'ativo' }),
    bloco({ icone: '🔌', nome: 'Integrações', descricao: 'YouTube, Instagram, TikTok via RapidAPI/Apify.', metrics: [{ valor: m.totalIntegracoes, label: 'plugadas' }], pagina: 'integracoes', status: 'ativo' }),
    bloco({ icone: '📋', nome: 'Pesquisas', descricao: 'Forms de aluno novo. Google Forms / Typeform.', status: 'em_construcao' }),
  ]));

  wrap.appendChild(seta());

  // CAMADA 2 — CEREBROS
  wrap.appendChild(camada(2, 'Cérebros', 'Memória viva da agência — 4 famílias, mesma engine de busca semântica', [
    bloco({
      icone: '📦', nome: 'Internos',
      descricao: 'Produtos da própria empresa. Cada produto tem 1 Cérebro com aulas, depoimentos, objeções, sacadas.',
      metrics: [{ valor: m.familias.interno, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.interno > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '🔍', nome: 'Externos',
      descricao: 'Cérebros de concorrentes. Inteligência de mercado pra responder gaps e benchmarks.',
      metrics: [{ valor: m.familias.externo, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.externo > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '📚', nome: 'Metodologias',
      descricao: 'Biblioteca universal: SPIN, Sandler, Challenger, Voss, MEDDIC, Hormozi. Reutilizável por qualquer agente.',
      metrics: [{ valor: m.familias.metodologia, label: 'curadas' }],
      pagina: 'cerebros',
      status: m.familias.metodologia > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '👤', nome: 'Clones',
      descricao: 'Pessoas. Sócios, conselheiros, gurus. Agente combina Cérebro de produto + Clone de pessoa.',
      metrics: [{ valor: m.familias.clone, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.clone > 0 ? 'ativo' : 'em_construcao',
    }),
  ]));

  wrap.appendChild(seta());

  // CAMADA 3 — INTELIGENCIA
  wrap.appendChild(camada(3, 'Inteligência', 'O que o sistema faz com a memória — todos consultam Cérebros via RAG', [
    bloco({
      icone: '🧬', nome: 'Personas',
      descricao: 'Dossiê de 11 blocos sobre quem compra. Gerado pelo Cérebro, editável, versionado a cada mudança.',
      pagina: 'personas',
      status: 'ativo',
    }),
    bloco({
      icone: '🛠', nome: 'Skills',
      descricao: 'Receitas em Markdown que os agentes leem e executam. Padrão Anthropic. Capacidade reutilizável.',
      metrics: [
        { valor: m.skillsAtivas, label: 'ativas' },
        { valor: m.skillsConstrucao, label: 'construindo' },
      ],
      pagina: 'skills',
      status: m.skillsAtivas > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '🤖', nome: 'Squad de Agentes',
      descricao: 'Agentes especialistas por departamento. Atuam em paralelo, gerando assets de marketing e vendas.',
      metrics: [{ valor: m.totalAgentes, label: 'agentes' }],
      pagina: 'agentes',
      status: m.totalAgentes > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '🔁', nome: 'RAG (Retrieval)',
      descricao: 'Busca semântica em todos os Cérebros. Reduz custo de IA porque só envia o trecho certo, não o livro inteiro.',
      metrics: [{ valor: m.totalChunks.toLocaleString('pt-BR'), label: 'chunks' }],
      status: 'ativo',
    }),
  ]));

  wrap.appendChild(seta());

  // CAMADA 4 — ENTREGA
  wrap.appendChild(camada(4, 'Entrega', 'O que vai pro cliente final — e volta pro Cérebro como nova fonte', [
    bloco({ icone: '✍️', nome: 'Copy', descricao: 'Páginas de vendas, anúncios, e-mails, scripts. Tom da marca, baseado em depoimento real.', status: 'em_construcao' }),
    bloco({ icone: '📄', nome: 'Páginas', descricao: 'Landing pages e páginas de captura geradas a partir da Persona + Cérebro do produto.', status: 'em_construcao' }),
    bloco({ icone: '📊', nome: 'Campanhas', descricao: 'Estrutura de lançamento, criativos, sequência de e-mails. Pronto pra subir no tráfego.', status: 'em_construcao' }),
    bloco({ icone: '🎯', nome: 'Comercial', descricao: 'SDR, briefing pré-call, co-piloto do closer, analista pós-call. Aprovação Luís → roadmap 5 agentes.', status: 'em_construcao' }),
    bloco({ icone: '💬', nome: 'Atendimento', descricao: 'Suporte por produto. Aluno pergunta no Discord/WA, agente responde com base no Cérebro.', status: 'em_construcao' }),
    bloco({ icone: '📈', nome: 'Relatórios', descricao: 'Dashboards e relatórios de saúde do Cérebro, gaps de conteúdo, performance comercial.', status: 'em_construcao' }),
  ]));

  // Loop de aprendizado
  wrap.appendChild(el('div', { class: 'mapa-loop' }, [
    el('div', { class: 'mapa-loop-icone' }, '↻'),
    el('div', {}, [
      el('div', { class: 'mapa-loop-titulo' }, 'O sistema aprende sozinho'),
      el('div', { class: 'mapa-loop-desc' }, 'Tudo que é entregue (copy, página, atendimento) volta pro Cérebro como nova fonte. Quanto mais o sistema roda, mais inteligente fica — sem precisar treinar nada.'),
    ]),
  ]));

  // Legenda de status
  wrap.appendChild(el('footer', { class: 'mapa-legenda' }, [
    el('div', { class: 'mapa-legenda-item' }, [
      el('span', { class: 'mapa-legenda-dot status-ativo' }),
      el('span', {}, 'Em produção'),
    ]),
    el('div', { class: 'mapa-legenda-item' }, [
      el('span', { class: 'mapa-legenda-dot status-em_construcao' }),
      el('span', {}, 'Em construção'),
    ]),
    el('div', { class: 'mapa-legenda-rodape' }, 'Métricas atualizadas em tempo real do banco do Pinguim OS.'),
  ]));

  page.appendChild(wrap);
}
