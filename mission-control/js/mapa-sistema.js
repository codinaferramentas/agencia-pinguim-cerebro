/* Pinguim OS — Mapa do Sistema (V2)
   Tela de pitch comercial. Hero magnético + 4 camadas + camadas transversais + EPP.
   Toggle Interno/Comercial muda densidade de jargão.
   Modo apresentação (tecla P ou botão) entra em fullscreen com fonte grande, sem sidebar.
   Faixa de prova social viva embutida — 253 depoimentos reais rolando do banco.
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

const STATUS_LABEL = { ativo: 'Ativo', em_construcao: 'Em construção', planejado: 'Planejado' };

// ----- Estado da tela -----
const ESTADO = {
  modo: localStorage.getItem('mapa.modo') || 'comercial', // 'comercial' | 'interno'
  apresentacao: false,
};

// ----- Carrega métricas (mantido) -----
async function carregarMetricas() {
  const sb = getSupabase();
  const cerebros = await fetchCerebrosCatalogo().catch(() => []);
  const skills = await fetchSkillsCatalogo().catch(() => []);

  const semPinguim = cerebros.filter(c => c.slug !== 'pinguim');
  const familias = {
    interno: semPinguim.filter(c => (c.categoria || 'interno') === 'interno').length,
    externo: semPinguim.filter(c => c.categoria === 'externo').length,
    metodologia: semPinguim.filter(c => c.categoria === 'metodologia').length,
    clone: semPinguim.filter(c => c.categoria === 'clone').length,
  };

  const skillsAtivas = skills.filter(s => s.status === 'ativa').length;
  const skillsConstrucao = skills.filter(s => s.status === 'em_construcao').length;

  const contar = async (tabela, filtro) => {
    try {
      let q = sb.from(tabela).select('id', { count: 'exact', head: true });
      if (filtro) q = q.eq(filtro.col, filtro.val);
      const { count } = await q;
      return count || 0;
    } catch { return 0; }
  };
  let totalFontes = 0, totalChunks = 0, totalAgentes = 0, totalProvas = 0, totalIntegracoes = 0, totalFunis = 0, ultimaIngestao = null;
  if (sb) {
    [totalFontes, totalChunks, totalAgentes, totalProvas, totalIntegracoes, totalFunis] = await Promise.all([
      contar('cerebro_fontes', { col: 'ingest_status', val: 'ok' }),
      contar('cerebro_fontes_chunks'),
      contar('agentes'),
      contar('provas_sociais'),
      contar('integracoes'),
      contar('funis'),
    ]);
    try {
      const { data } = await sb.from('cerebro_fontes').select('criado_em').order('criado_em', { ascending: false }).limit(1);
      ultimaIngestao = data?.[0]?.criado_em || null;
    } catch {}
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
    totalFunis,
    ultimaIngestao,
  };
}

async function carregarProvasSociais() {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data } = await sb
      .from('provas_sociais')
      .select('aluno, conteudo, tipo_prova, valor_estimado, postado_em')
      .order('postado_em', { ascending: false, nullsFirst: false })
      .limit(20);
    return data || [];
  } catch { return []; }
}

// ----- Helpers visuais -----
function formatarTempoRelativo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'há instantes';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function animarContador(node, valorFinal, durMs = 900) {
  const inicio = performance.now();
  const easing = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const t = Math.min(1, (now - inicio) / durMs);
    const v = Math.round(valorFinal * easing(t));
    node.textContent = v.toLocaleString('pt-BR');
    if (t < 1) requestAnimationFrame(frame);
    else node.textContent = valorFinal.toLocaleString('pt-BR');
  }
  requestAnimationFrame(frame);
}

function metricBadge(valor, label) {
  return el('div', { class: 'mapa-metric' }, [
    el('div', { class: 'mapa-metric-valor' }, String(valor)),
    el('div', { class: 'mapa-metric-label' }, label),
  ]);
}

function bloco({ icone, nome, descricao, descricaoComercial, metrics = [], pagina = null, status = 'ativo', dica = null, anchor = false }) {
  const props = {
    class: `mapa-bloco status-${status}${anchor ? ' is-anchor' : ''}`,
    data: { status },
  };
  if (pagina && status === 'ativo') {
    props.role = 'button';
    props.tabindex = '0';
    props.onclick = () => window.dispatchEvent(new CustomEvent('mapa:navegar', { detail: { slug: pagina } }));
  }
  const desc = (ESTADO.modo === 'comercial' && descricaoComercial) ? descricaoComercial : descricao;
  return el('div', props, [
    el('div', { class: 'mapa-bloco-head' }, [
      el('span', { class: 'mapa-bloco-icone' }, icone),
      el('div', { class: 'mapa-bloco-nome' }, nome),
      el('span', { class: `mapa-bloco-selo status-${status}` }, STATUS_LABEL[status] || status),
    ]),
    el('div', { class: 'mapa-bloco-desc' }, desc),
    dica && ESTADO.modo === 'interno' ? el('div', { class: 'mapa-bloco-dica', title: dica }, `ⓘ ${dica}`) : null,
    metrics.length
      ? el('div', { class: 'mapa-bloco-metrics' }, metrics.map(m => metricBadge(m.valor, m.label)))
      : null,
  ]);
}

function camada(num, titulo, subtitulo, blocos, opts = {}) {
  return el('section', { class: `mapa-camada${opts.destaque ? ' is-destaque' : ''}` }, [
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

// ----- Toolbar (toggle + apresentação) -----
function toolbar() {
  const tab = (modo, label) => el('button', {
    class: `mapa-modo-tab${ESTADO.modo === modo ? ' is-on' : ''}`,
    type: 'button',
    onclick: () => {
      if (ESTADO.modo === modo) return;
      ESTADO.modo = modo;
      localStorage.setItem('mapa.modo', modo);
      renderMapaSistema();
    },
  }, label);

  const btnApresentar = el('button', {
    class: 'mapa-toolbar-btn',
    type: 'button',
    title: 'Apresentação (P)',
    onclick: entrarApresentacao,
  }, [
    el('span', { class: 'mapa-toolbar-btn-icone' }, '▶'),
    el('span', {}, 'Apresentação'),
  ]);

  return el('div', { class: 'mapa-toolbar' }, [
    el('div', { class: 'mapa-modo-switch' }, [
      tab('comercial', 'Modo Comercial'),
      tab('interno', 'Modo Interno'),
    ]),
    btnApresentar,
  ]);
}

// ----- Hero magnético -----
function hero(m) {
  const claim = ESTADO.modo === 'comercial'
    ? 'A agência que aprende sozinha.'
    : 'O sistema operacional de uma agência de IA.';
  const lede = ESTADO.modo === 'comercial'
    ? 'Cada conversa, cada aula, cada depoimento entra no Cérebro. Cada entrega aprovada volta como referência. O sistema fica mais inteligente toda semana — sem retreino, sem custo extra, sem trabalho do time.'
    : 'Não é um SaaS. Não é um Notion. É a infraestrutura que faz uma agência de IA operar como organismo vivo — onde cada entrega volta como aprendizado, e cada agente fica mais inteligente a cada uso.';

  const pulseChunks = el('div', { class: 'mapa-hero-pulse' }, [
    el('div', { class: 'mapa-hero-pulse-valor', id: 'mapa-pulse-chunks' }, '0'),
    el('div', { class: 'mapa-hero-pulse-label' }, 'trechos de conhecimento indexados'),
    el('div', { class: 'mapa-hero-pulse-pulse' }),
  ]);

  const ticker = el('div', { class: 'mapa-hero-ticker' }, [
    el('span', { class: 'mapa-hero-ticker-dot' }),
    el('span', {}, m.ultimaIngestao
      ? `Última ingestão ${formatarTempoRelativo(m.ultimaIngestao)} · ${m.totalFontes} fontes ativas`
      : `${m.totalFontes} fontes ativas no Cérebro`),
  ]);

  const stat = (valor, label, hint) => el('div', { class: 'mapa-hero-stat', title: hint || '' }, [
    el('div', { class: 'mapa-hero-stat-valor' }, String(valor)),
    el('div', { class: 'mapa-hero-stat-label' }, label),
  ]);

  return el('header', { class: 'mapa-hero is-v2' }, [
    el('div', { class: 'mapa-hero-eyebrow' }, ESTADO.modo === 'comercial' ? 'O Pinguim OS' : 'Framework Pinguim · Mapa do Sistema'),
    el('h1', { class: 'mapa-hero-titulo' }, claim),
    el('p', { class: 'mapa-hero-lede' }, lede),
    pulseChunks,
    ticker,
    el('div', { class: 'mapa-hero-stats' }, [
      stat(m.cerebrosTotal, 'Cérebros vivos'),
      stat(m.totalProvas, 'Provas sociais'),
      stat(m.totalAgentes || 'em pé', 'Squad operando'),
      stat(`${m.skillsAtivas + m.skillsConstrucao}`, 'Skills no catálogo'),
    ]),
  ]);
}

// ----- Faixa de prova social viva -----
function faixaProvasSociais(provas) {
  if (!provas.length) return null;

  const cardProva = (p) => {
    const trecho = (p.conteudo || '').replace(/\s+/g, ' ').trim();
    const cortado = trecho.length > 220 ? trecho.slice(0, 217) + '…' : trecho;
    const eh = (tipo) => p.tipo_prova === tipo;
    const tag = eh('faturamento') ? '💰 Faturamento'
      : eh('depoimento_audio') ? '🎙 Áudio'
      : eh('depoimento_video') ? '🎥 Vídeo'
      : '💬 Depoimento';
    return el('article', { class: 'mapa-prova-card' }, [
      el('div', { class: 'mapa-prova-card-tag' }, tag),
      el('blockquote', { class: 'mapa-prova-card-texto' }, `“${cortado}”`),
      el('div', { class: 'mapa-prova-card-rodape' }, [
        el('span', { class: 'mapa-prova-card-aluno' }, p.aluno || 'Aluno Pinguim'),
        p.valor_estimado ? el('span', { class: 'mapa-prova-card-valor' }, p.valor_estimado) : null,
      ]),
    ]);
  };

  const carrossel = el('div', { class: 'mapa-prova-track' });
  // duplica pra loop infinito
  [...provas, ...provas].forEach(p => carrossel.appendChild(cardProva(p)));

  return el('section', { class: 'mapa-prova-camada' }, [
    el('div', { class: 'mapa-prova-head' }, [
      el('div', { class: 'mapa-prova-eyebrow' }, '🌱 Cérebros vivos'),
      el('div', { class: 'mapa-prova-titulo' }, 'O que está dentro do Cérebro hoje'),
      el('div', { class: 'mapa-prova-sub' },
        ESTADO.modo === 'comercial'
          ? 'Trechos reais ingeridos do Discord, WhatsApp, formulários. É essa matéria-prima que os agentes consultam pra escrever copy, SDR responder lead, suporte tirar dúvida.'
          : `${provas.length === 20 ? '253' : provas.length}+ provas sociais indexadas. Carregadas via prova-social→cerebro_fontes→chunks. Consultadas em tempo real por busca semântica.`),
    ]),
    el('div', { class: 'mapa-prova-viewport' }, [carrossel]),
  ]);
}

// ----- Modo apresentação -----
function entrarApresentacao() {
  ESTADO.apresentacao = true;
  document.body.classList.add('mapa-apresentacao');
  // tenta fullscreen
  const root = document.documentElement;
  if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  // ESC sai
  const onKey = (ev) => {
    if (ev.key === 'Escape') sairApresentacao(onKey);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) sairApresentacao(onKey);
  }, { once: true });

  // botão sair flutuante
  const sair = el('button', {
    class: 'mapa-apresentacao-sair',
    type: 'button',
    onclick: () => sairApresentacao(onKey),
  }, 'Sair (Esc)');
  sair.id = 'mapa-apresentacao-sair-btn';
  document.body.appendChild(sair);
}

function sairApresentacao(onKey) {
  ESTADO.apresentacao = false;
  document.body.classList.remove('mapa-apresentacao');
  if (onKey) document.removeEventListener('keydown', onKey);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  document.getElementById('mapa-apresentacao-sair-btn')?.remove();
}

// ----- Atalho de teclado (P) -----
let _atalhoInstalado = false;
function instalarAtalho() {
  if (_atalhoInstalado) return;
  _atalhoInstalado = true;
  document.addEventListener('keydown', (ev) => {
    const onMapa = !document.getElementById('page-mapa')?.hasAttribute('hidden');
    if (!onMapa) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || ev.target.isContentEditable) return;
    if ((ev.key === 'p' || ev.key === 'P') && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      if (ESTADO.apresentacao) sairApresentacao();
      else entrarApresentacao();
    }
  });
}

// ----- Render principal -----
export async function renderMapaSistema() {
  const page = document.getElementById('page-mapa');
  if (!page) return;
  instalarAtalho();
  page.innerHTML = '<div class="mapa-loading">Carregando o mapa do sistema…</div>';

  const [m, provas] = await Promise.all([
    carregarMetricas(),
    carregarProvasSociais(),
  ]);

  page.innerHTML = '';
  const wrap = el('div', { class: `mapa-sistema modo-${ESTADO.modo}` });

  // Toolbar
  wrap.appendChild(toolbar());

  // Hero
  wrap.appendChild(hero(m));

  // Anima contador grande do hero
  setTimeout(() => {
    const node = document.getElementById('mapa-pulse-chunks');
    if (node) animarContador(node, m.totalChunks);
  }, 80);

  // CAMADA 1 — CAPTAÇÃO
  wrap.appendChild(camada(1, 'Captação', 'Conteúdo entra de qualquer canal — uma única fila de ingestão', [
    bloco({
      icone: '💬', nome: 'Discord',
      descricao: 'Canal #depoimentos varrido automaticamente. Vision lê prints, Whisper transcreve áudios.',
      descricaoComercial: 'Tudo que aluno posta no Discord vira fonte. Print, áudio, texto — sistema lê tudo.',
      status: 'ativo',
    }),
    bloco({
      icone: '⬆️', nome: 'Upload',
      descricao: 'Arquivo, URL ou texto direto. Sistema processa, vetoriza e arquiva no Cérebro.',
      descricaoComercial: 'Você arrasta um arquivo, cola um link ou um texto. Sistema processa e indexa sozinho.',
      pagina: 'cerebros', status: 'ativo',
    }),
    bloco({
      icone: '🔌', nome: 'Integrações',
      descricao: 'YouTube, Instagram, TikTok via APIs externas. Capta conteúdo público pra alimentar Cérebros.',
      descricaoComercial: 'Conecta YouTube, Instagram, TikTok. Conteúdo público vira matéria-prima do Cérebro.',
      metrics: [{ valor: m.totalIntegracoes, label: 'plugadas' }],
      pagina: 'integracoes',
      status: m.totalIntegracoes > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '📱', nome: 'WhatsApp',
      descricao: 'Grupos de alunos viram fonte. Z-API / Evolution API.',
      descricaoComercial: 'Grupos de alunos no WhatsApp também alimentam o Cérebro.',
      status: 'planejado',
    }),
    bloco({
      icone: '✈️', nome: 'Telegram',
      descricao: 'Canais e grupos monitorados.',
      descricaoComercial: 'Canais do Telegram entram na mesma fila.',
      status: 'planejado',
    }),
    bloco({
      icone: '📋', nome: 'Pesquisas',
      descricao: 'Forms de aluno novo. Google Forms / Typeform.',
      descricaoComercial: 'Cada formulário de aluno novo vira insight no Cérebro.',
      status: 'planejado',
    }),
  ]));

  wrap.appendChild(seta());

  // CAMADA 2 — CÉREBROS (destaque visual: é o coração)
  wrap.appendChild(camada(2, 'Cérebros', 'Memória viva da agência — 4 famílias, mesma engine de busca semântica', [
    bloco({
      icone: '📦', nome: 'Internos',
      descricao: 'Produtos da própria empresa. Cada produto tem 1 Cérebro com aulas, depoimentos, objeções, sacadas.',
      descricaoComercial: 'Cada produto seu vira um Cérebro: aulas, depoimentos, objeções, sacadas. Tudo num lugar só.',
      metrics: [{ valor: m.familias.interno, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.interno > 0 ? 'ativo' : 'planejado',
      anchor: true,
    }),
    bloco({
      icone: '📚', nome: 'Metodologias',
      descricao: 'Biblioteca universal: SPIN, Sandler, Challenger, Voss, MEDDIC, Hormozi. Reutilizável por qualquer agente.',
      descricaoComercial: 'Biblioteca de metodologias comerciais (SPIN, Hormozi, Sandler, Voss). Qualquer agente puxa.',
      metrics: [{ valor: m.familias.metodologia, label: 'curadas' }],
      pagina: 'cerebros',
      status: m.familias.metodologia > 0 ? 'ativo' : 'planejado',
      anchor: true,
    }),
    bloco({
      icone: '🔍', nome: 'Externos',
      descricao: 'Cérebros de concorrentes. Inteligência de mercado pra responder gaps e benchmarks.',
      descricaoComercial: 'Cérebros de concorrentes — pra agente entender mercado e benchmark.',
      metrics: [{ valor: m.familias.externo, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.externo > 0 ? 'ativo' : 'planejado',
    }),
    bloco({
      icone: '👤', nome: 'Clones',
      descricao: 'Pessoas. Sócios, conselheiros, gurus. Agente combina Cérebro de produto + Clone de pessoa.',
      descricaoComercial: 'Clones de pessoas (sócios, conselheiros, gurus). Agente combina Cérebro + Clone — fala com voz.',
      metrics: [{ valor: m.familias.clone, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.clone > 0 ? 'ativo' : 'planejado',
    }),
  ], { destaque: true }));

  // FAIXA DE PROVA SOCIAL VIVA — encarna "Cérebros vivos"
  if (provas.length) wrap.appendChild(faixaProvasSociais(provas));

  wrap.appendChild(seta());

  // CAMADA 3 — INTELIGÊNCIA
  wrap.appendChild(camada(3, 'Inteligência', 'O que o sistema faz com a memória — todos consultam Cérebros via RAG', [
    bloco({
      icone: '🧬', nome: 'Personas',
      descricao: 'Dossiê de 11 blocos sobre quem compra. Gerado pelo Cérebro, editável, versionado a cada mudança.',
      descricaoComercial: 'Persona de quem compra, em 11 blocos. Gerada pelo Cérebro, editável, versionada.',
      pagina: 'personas',
      status: 'ativo',
    }),
    bloco({
      icone: '🔁', nome: 'RAG · Busca semântica',
      descricao: 'Busca pelo significado, não pela palavra. Pergunta "objeção de preço" e o sistema acha depoimentos que falam de "tá caro", "não cabe no bolso", etc.',
      descricaoComercial: 'Busca por significado, não por palavra. Pede "objeção de preço" e acha "tá caro", "não cabe no bolso".',
      metrics: [{ valor: m.totalChunks.toLocaleString('pt-BR'), label: 'trechos' }],
      status: 'ativo',
    }),
    bloco({
      icone: '🛠', nome: 'Skills',
      descricao: 'Receitas em Markdown que os agentes leem e executam. Padrão Anthropic. Capacidade reutilizável.',
      descricaoComercial: 'Capacidades reutilizáveis. "Procurar no Cérebro", "Validar prova social", etc.',
      metrics: [
        { valor: m.skillsAtivas, label: 'ativas' },
        { valor: m.skillsConstrucao, label: 'construindo' },
      ],
      pagina: 'skills',
      status: (m.skillsAtivas + m.skillsConstrucao) > 0 ? (m.skillsAtivas > 0 ? 'ativo' : 'em_construcao') : 'planejado',
    }),
    bloco({
      icone: '🎯', nome: 'Funis',
      descricao: 'Construtor visual de funis de venda. Cada funil é dado consultável por agente em tempo real, com chave de habilitação por agente. Diferencial vs Geru/MailChimp.',
      descricaoComercial: 'Construtor visual de funil. Mas aqui funil é dado: agente consulta em tempo real e responde com base no funil.',
      metrics: [{ valor: m.totalFunis, label: 'criados' }],
      pagina: 'funis',
      status: m.totalFunis > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '🤖', nome: 'Squad de Agentes',
      descricao: 'Agentes especialistas por departamento. Atuam em paralelo, gerando assets de marketing e vendas.',
      descricaoComercial: 'Squad de agentes por departamento. Atuam em paralelo, geram copy, página, briefing, suporte.',
      metrics: m.totalAgentes > 0 ? [{ valor: m.totalAgentes, label: 'agentes' }] : [],
      pagina: m.totalAgentes > 0 ? 'agentes' : null,
      status: m.totalAgentes > 0 ? 'ativo' : 'planejado',
    }),
  ]));

  // Anatomia do Funil — só em modo interno
  if (ESTADO.modo === 'interno') {
    wrap.appendChild(el('div', { class: 'mapa-funil-camadas' }, [
      el('div', { class: 'mapa-funil-camadas-head' }, [
        el('div', { class: 'mapa-funil-camadas-eyebrow' }, '🎯 Anatomia do Funil Pinguim'),
        el('div', { class: 'mapa-funil-camadas-titulo' }, 'Por que funil aqui não é desenho — é inteligência executável'),
      ]),
      el('div', { class: 'mapa-funil-camadas-grid' }, [
        el('div', { class: 'mapa-funil-camada status-ativo' }, [
          el('div', { class: 'mapa-funil-camada-num' }, '1'),
          el('div', {}, [
            el('div', { class: 'mapa-funil-camada-titulo' }, 'Visual'),
            el('div', { class: 'mapa-funil-camada-desc' }, 'Construtor drag-to-connect. Você arrasta produtos pro canvas, conecta com setas vivas, define papéis (entrada, order bump, upsell, downsell), adiciona condicionais.'),
            el('div', { class: 'mapa-funil-camada-status' }, '✓ Em produção'),
          ]),
        ]),
        el('div', { class: 'mapa-funil-camada status-ativo' }, [
          el('div', { class: 'mapa-funil-camada-num' }, '2'),
          el('div', {}, [
            el('div', { class: 'mapa-funil-camada-titulo' }, 'Estratégica'),
            el('div', { class: 'mapa-funil-camada-desc' }, 'Cada funil tem chave de habilitação por agente. SDR vê os funis dele, Co-piloto vê os dele. Mesmo banco, visão curada por uso. Diferencial vendável.'),
            el('div', { class: 'mapa-funil-camada-status' }, '✓ Em produção'),
          ]),
        ]),
        el('div', { class: 'mapa-funil-camada status-em_construcao' }, [
          el('div', { class: 'mapa-funil-camada-num' }, '3'),
          el('div', {}, [
            el('div', { class: 'mapa-funil-camada-titulo' }, 'Operacional'),
            el('div', { class: 'mapa-funil-camada-desc' }, 'Agente SDR consulta funil em tempo real, decide produto-alvo. Briefing pra vendedora sai pronto: "lead vindo de Desafio LoFi → Elo, com Análise de Perfil como order bump".'),
            el('div', { class: 'mapa-funil-camada-status' }, '⧗ Em construção'),
          ]),
        ]),
      ]),
    ]));
  }

  wrap.appendChild(seta());

  // CAMADA 4 — ENTREGA
  wrap.appendChild(camada(4, 'Entrega', 'O que vai pro cliente final — e que volta como aprendizado pelo loop EPP', [
    bloco({ icone: '✍️', nome: 'Copy', descricao: 'Páginas de vendas, anúncios, e-mails, scripts. Tom da marca, baseado em depoimento real.', descricaoComercial: 'Página de vendas, anúncio, e-mail, script. No tom da marca, citando depoimento real.', status: 'planejado' }),
    bloco({ icone: '📄', nome: 'Páginas', descricao: 'Landing pages e páginas de captura geradas a partir da Persona + Cérebro do produto.', descricaoComercial: 'Landing page e captura, geradas a partir da Persona + Cérebro do produto.', status: 'planejado' }),
    bloco({ icone: '📊', nome: 'Campanhas', descricao: 'Estrutura de lançamento, criativos, sequência de e-mails. Pronto pra subir no tráfego.', descricaoComercial: 'Estrutura completa de lançamento — pronto pra subir no tráfego.', status: 'planejado' }),
    bloco({ icone: '🎯', nome: 'Comercial', descricao: 'SDR, briefing pré-call, co-piloto do closer, analista pós-call. Aguarda aprovação do plano comercial.', descricaoComercial: 'SDR qualifica, co-piloto ajuda o closer, analista pós-call.', status: 'planejado' }),
    bloco({ icone: '💬', nome: 'Atendimento', descricao: 'Suporte por produto. Aluno pergunta no Discord/WA, agente responde com base no Cérebro.', descricaoComercial: 'Aluno pergunta no Discord ou WA, agente responde com base no Cérebro do produto.', status: 'planejado' }),
    bloco({ icone: '📈', nome: 'Relatórios', descricao: 'Dashboards e relatórios de saúde do Cérebro, gaps de conteúdo, performance comercial.', descricaoComercial: 'Painel mostra saúde do Cérebro, gaps, performance — você vê e decide.', status: 'planejado' }),
  ]));

  // CAMADAS TRANSVERSAIS — só em modo interno
  if (ESTADO.modo === 'interno') {
    wrap.appendChild(el('section', { class: 'mapa-seguranca-camada' }, [
      el('div', { class: 'mapa-seguranca-head' }, [
        el('div', { class: 'mapa-seguranca-eyebrow' }, '🛡 Camada Transversal · Segurança Contínua'),
        el('div', { class: 'mapa-seguranca-titulo' }, 'Squad Cyber operando 24/7, em paralelo a tudo'),
        el('div', { class: 'mapa-seguranca-sub' },
          'Defesa em profundidade + Zero Trust + IDS + Threat Intel. Não é correção pontual — é camada permanente, escalável e visível.'),
      ]),
      el('div', { class: 'mapa-seguranca-conselheiros' }, [
        bloco({ icone: '🛡', nome: 'Peter Kim', descricao: 'Red Team — simula ataque diário. F12, IDOR, query injection. Tudo que vaza vira incidente.', status: 'em_construcao' }),
        bloco({ icone: '🛡', nome: 'Georgia Weidman', descricao: 'Pentest semanal — OWASP Top 10 contra o sistema. Princípio do menor privilégio.', status: 'em_construcao' }),
        bloco({ icone: '🛡', nome: 'Jim Manico', descricao: 'Code Auditor — secure coding em todo push. Validação de input, autenticação, sessão.', status: 'em_construcao' }),
        bloco({ icone: '🛡', nome: 'Marcus Carey', descricao: 'Threat Intel — lê logs Vercel/Supabase a cada 6h. Coleta → análise → disseminação → feedback.', status: 'em_construcao' }),
        bloco({ icone: '🛡', nome: 'Omar Santos', descricao: 'Zero Trust — toda Edge valida JWT. Toda tool tem allowlist. Nada confiável por padrão.', status: 'ativo' }),
        bloco({ icone: '🛡', nome: 'Chris Sanders', descricao: 'IDS — compara tráfego com baseline. Alerta em desvio. Anomalia vira incidente.', status: 'em_construcao' }),
      ]),
      el('div', { class: 'mapa-seguranca-cards' }, [
        bloco({ icone: '🔒', nome: 'RLS auditado', descricao: 'Toda tabela do schema pinguim com RLS ativo + policy. Trigger valida em CREATE TABLE.', status: 'ativo' }),
        bloco({ icone: '🔑', nome: 'Cofre canônico', descricao: 'Chaves em pinguim.cofre_chaves. Edge functions leem via RPC. Painel mostra mascarado.', status: 'ativo' }),
        bloco({ icone: '📊', nome: 'Raio-X do banco', descricao: 'Contagens reais (sem limite PostgREST), tamanho por tabela, projeção de quando estoura.', status: 'ativo' }),
        bloco({ icone: '⚖', nome: 'Políticas escritas', descricao: 'Princípio Dalio: feedback vira política, política não evapora. Tabela politicas_seguranca.', status: 'ativo' }),
      ]),
    ]));

    wrap.appendChild(el('section', { class: 'mapa-finops-camada' }, [
      el('div', { class: 'mapa-finops-head' }, [
        el('div', { class: 'mapa-finops-eyebrow' }, '💰 Camada Transversal · FinOps'),
        el('div', { class: 'mapa-finops-titulo' }, 'Squad FinOps controlando custo em tempo real'),
        el('div', { class: 'mapa-finops-sub' },
          'Cliente abre painel e vê quanto está gastando. Sem surpresa de fatura. Cron diário agrega, projeção de fim de mês, alertas configuráveis.'),
      ]),
      el('div', { class: 'mapa-seguranca-conselheiros' }, [
        bloco({ icone: '💰', nome: 'JR Storment', descricao: 'FinOps Foundation co-founder — framework, governança, agregado mensal.', status: 'ativo' }),
        bloco({ icone: '💰', nome: 'Corey Quinn', descricao: 'Last Week in AWS — caça desperdício. Alerta sobre o que você paga e não usa.', status: 'em_construcao' }),
        bloco({ icone: '💰', nome: 'Eli Mansoor', descricao: 'Cloud cost optimization — quando trocar plano, consolidar, otimizar.', status: 'em_construcao' }),
        bloco({ icone: '💰', nome: 'Mike Fuller', descricao: 'Atlassian FinOps — custo-por-workload (custo por agente, por cliente, por operação).', status: 'em_construcao' }),
      ]),
      el('div', { class: 'mapa-seguranca-cards' }, [
        bloco({ icone: '📊', nome: 'Custos diários', descricao: 'Tabela custos_diarios agregada por dia/provedor/operação. Cron 5h UTC.', status: 'ativo' }),
        bloco({ icone: '📈', nome: 'Projeção de mês', descricao: 'RPC custo_mes_corrente() projeta fim de mês com base nos dias corridos.', status: 'ativo' }),
        bloco({ icone: '🚨', nome: 'Alertas', descricao: '3 alertas pré-cadastrados (OpenAI > $50, total > $100, banco > 80%). Configurável.', status: 'ativo' }),
        bloco({ icone: '📉', nome: 'Histórico 30d', descricao: 'Gráfico de barras + tabela cronológica. RPC custos_30_dias().', status: 'ativo' }),
      ]),
    ]));
  }

  // Loop EPP — fecha o ciclo
  wrap.appendChild(el('div', { class: 'mapa-realimenta' }, [
    el('div', { class: 'mapa-realimenta-curva' }, [
      el('span', { class: 'mapa-realimenta-icone' }, '↺'),
      el('span', { class: 'mapa-realimenta-label' }, 'Toda entrega aprovada realimenta o Cérebro'),
    ]),
  ]));

  // EPP — manifesto + 3 leis
  wrap.appendChild(el('section', { class: 'mapa-epp' }, [
    el('div', { class: 'mapa-epp-manifesto' }, [
      el('div', { class: 'mapa-epp-eyebrow' }, 'Protocolo EPP — Evolução Permanente Pinguim'),
      el('h2', { class: 'mapa-epp-titulo' }, 'Agente Pinguim ≠ Chatbot'),
      el('p', { class: 'mapa-epp-claim' }, 'Um chatbot responde. Um Agente Pinguim evolui.'),
      el('p', { class: 'mapa-epp-lede' }, 'Toda execução é registrada. Toda entrega aprovada vira referência. Todo feedback humano vira contexto da próxima rodada. O agente que você usa hoje é melhor que o agente de ontem — sem retreino, sem custo extra de IA, sem trabalho do time. Esse é o protocolo aplicado em todo agente que sai do Pinguim OS.'),
    ]),
    el('div', { class: 'mapa-epp-leis-titulo' }, 'As 3 leis do EPP'),
    el('div', { class: 'mapa-epp-mecanismos' }, [
      el('div', { class: 'mapa-epp-mec status-ativo' }, [
        el('div', { class: 'mapa-epp-mec-num' }, '1'),
        el('div', { class: 'mapa-epp-mec-corpo' }, [
          el('div', { class: 'mapa-epp-mec-eyebrow' }, '✓ Em produção'),
          el('div', { class: 'mapa-epp-mec-titulo' }, 'Captação alimenta o Cérebro'),
          el('div', { class: 'mapa-epp-mec-desc' }, 'Toda fonte que entra (Discord, Upload, Integração) é processada e indexada na hora. Vira parte da memória disponível pra qualquer agente buscar — sem ensinar de novo.'),
        ]),
      ]),
      el('div', { class: 'mapa-epp-mec status-em_construcao' }, [
        el('div', { class: 'mapa-epp-mec-num' }, '2'),
        el('div', { class: 'mapa-epp-mec-corpo' }, [
          el('div', { class: 'mapa-epp-mec-eyebrow' }, '⧗ Em construção'),
          el('div', { class: 'mapa-epp-mec-titulo' }, 'Output aprovado vira referência'),
          el('div', { class: 'mapa-epp-mec-desc' }, 'Persona, copy ou página aprovada é salva como nova fonte do Cérebro. Próxima geração consulta "o que já funcionou aqui" e usa de exemplo. O melhor trabalho de hoje vira ponto de partida do trabalho de amanhã.'),
        ]),
      ]),
      el('div', { class: 'mapa-epp-mec status-planejado' }, [
        el('div', { class: 'mapa-epp-mec-num' }, '3'),
        el('div', { class: 'mapa-epp-mec-corpo' }, [
          el('div', { class: 'mapa-epp-mec-eyebrow' }, '◯ Planejado'),
          el('div', { class: 'mapa-epp-mec-titulo' }, 'Feedback humano vira contexto'),
          el('div', { class: 'mapa-epp-mec-desc' }, 'Cada execução é logada. Você dá 👍/👎 ou comentário. Antes da próxima geração, o agente lê os feedbacks anteriores e ajusta — sem fine-tuning, sem treinar modelo. É contexto acumulado, não modelo retreinado.'),
        ]),
      ]),
    ]),
    el('div', { class: 'mapa-epp-rodape' }, 'EPP é premissa dura. Nenhum agente do Pinguim OS sai daqui sem responder a essas 3 leis.'),
  ]));

  // Legenda
  wrap.appendChild(el('footer', { class: 'mapa-legenda' }, [
    el('div', { class: 'mapa-legenda-item' }, [
      el('span', { class: 'mapa-legenda-dot status-ativo' }),
      el('span', {}, 'Ativo'),
    ]),
    el('div', { class: 'mapa-legenda-item' }, [
      el('span', { class: 'mapa-legenda-dot status-em_construcao' }),
      el('span', {}, 'Em construção'),
    ]),
    el('div', { class: 'mapa-legenda-item' }, [
      el('span', { class: 'mapa-legenda-dot status-planejado' }),
      el('span', {}, 'Planejado'),
    ]),
    el('div', { class: 'mapa-legenda-rodape' }, 'Métricas atualizadas em tempo real do banco do Pinguim OS · Tecla P para apresentação'),
  ]));

  page.appendChild(wrap);
}
