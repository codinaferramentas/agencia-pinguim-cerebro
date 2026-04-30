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
  let totalFontes = 0, totalChunks = 0, totalAgentes = 0, totalProvas = 0, totalIntegracoes = 0, totalFunis = 0;
  if (sb) {
    [totalFontes, totalChunks, totalAgentes, totalProvas, totalIntegracoes, totalFunis] = await Promise.all([
      contar('cerebro_fontes', { col: 'ingest_status', val: 'ok' }),
      contar('cerebro_fontes_chunks'),
      contar('agentes'),
      contar('provas_sociais'),
      contar('integracoes'),
      contar('funis'),
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
    totalFunis,
  };
}

function metricBadge(valor, label) {
  return el('div', { class: 'mapa-metric' }, [
    el('div', { class: 'mapa-metric-valor' }, String(valor)),
    el('div', { class: 'mapa-metric-label' }, label),
  ]);
}

const STATUS_LABEL = { ativo: 'Ativo', em_construcao: 'Em construção', planejado: 'Planejado' };

function bloco({ icone, nome, descricao, metrics = [], pagina = null, status = 'ativo', dica = null }) {
  const props = {
    class: `mapa-bloco status-${status}`,
    data: { status },
  };
  if (pagina && status === 'ativo') {
    props.role = 'button';
    props.tabindex = '0';
    props.onclick = () => window.dispatchEvent(new CustomEvent('mapa:navegar', { detail: { slug: pagina } }));
  }
  return el('div', props, [
    el('div', { class: 'mapa-bloco-head' }, [
      el('span', { class: 'mapa-bloco-icone' }, icone),
      el('div', { class: 'mapa-bloco-nome' }, nome),
      el('span', { class: `mapa-bloco-selo status-${status}` }, STATUS_LABEL[status] || status),
    ]),
    el('div', { class: 'mapa-bloco-desc' }, descricao),
    dica ? el('div', { class: 'mapa-bloco-dica', title: dica }, `ⓘ ${dica}`) : null,
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
    el('div', { class: 'mapa-hero-eyebrow' }, 'O Framework Pinguim'),
    el('h1', { class: 'mapa-hero-titulo' }, 'Mapa do Sistema'),
    el('p', { class: 'mapa-hero-lede' }, 'Não é um SaaS. Não é um Notion. É a infraestrutura que faz uma agência de IA operar como um organismo vivo — onde cada entrega volta como aprendizado, e cada agente fica mais inteligente a cada uso.'),
    el('div', { class: 'mapa-hero-stats' }, [
      el('div', { class: 'mapa-hero-stat' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, String(m.cerebrosTotal)),
        el('div', { class: 'mapa-hero-stat-label' }, 'Cérebros vivos'),
      ]),
      el('div', { class: 'mapa-hero-stat' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, String(m.totalFontes)),
        el('div', { class: 'mapa-hero-stat-label' }, 'Fontes ingeridas'),
      ]),
      el('div', { class: 'mapa-hero-stat', title: 'Cada fonte é quebrada em pedaços (parágrafos, blocos) e indexada por significado. Quando um agente precisa de algo, busca o trecho certo — não o documento inteiro. Reduz custo de IA.' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, m.totalChunks.toLocaleString('pt-BR')),
        el('div', { class: 'mapa-hero-stat-label' }, 'Trechos de conhecimento'),
      ]),
      el('div', { class: 'mapa-hero-stat' }, [
        el('div', { class: 'mapa-hero-stat-valor' }, String(m.totalProvas)),
        el('div', { class: 'mapa-hero-stat-label' }, 'Provas sociais'),
      ]),
    ]),
  ]));

  // CAMADA 1 — CAPTACAO
  wrap.appendChild(camada(1, 'Captação', 'Conteúdo entra de qualquer canal — uma única fila de ingestão', [
    bloco({ icone: '💬', nome: 'Discord', descricao: 'Canal #depoimentos varrido automaticamente. Vision lê prints, Whisper transcreve áudios.', status: 'ativo' }),
    bloco({ icone: '⬆️', nome: 'Upload', descricao: 'Arquivo, URL ou texto direto. Sistema processa, vetoriza e arquiva no Cérebro.', pagina: 'cerebros', status: 'ativo' }),
    bloco({ icone: '🔌', nome: 'Integrações', descricao: 'YouTube, Instagram, TikTok via APIs externas. Capta conteúdo público pra alimentar Cérebros.', metrics: [{ valor: m.totalIntegracoes, label: 'plugadas' }], pagina: 'integracoes', status: m.totalIntegracoes > 0 ? 'ativo' : 'em_construcao' }),
    bloco({ icone: '📱', nome: 'WhatsApp', descricao: 'Grupos de alunos viram fonte. Z-API / Evolution API.', status: 'planejado' }),
    bloco({ icone: '✈️', nome: 'Telegram', descricao: 'Canais e grupos monitorados.', status: 'planejado' }),
    bloco({ icone: '📋', nome: 'Pesquisas', descricao: 'Forms de aluno novo. Google Forms / Typeform.', status: 'planejado' }),
  ]));

  wrap.appendChild(seta());

  // CAMADA 2 — CEREBROS
  wrap.appendChild(camada(2, 'Cérebros', 'Memória viva da agência — 4 famílias, mesma engine de busca semântica', [
    bloco({
      icone: '📦', nome: 'Internos',
      descricao: 'Produtos da própria empresa. Cada produto tem 1 Cérebro com aulas, depoimentos, objeções, sacadas.',
      metrics: [{ valor: m.familias.interno, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.interno > 0 ? 'ativo' : 'planejado',
    }),
    bloco({
      icone: '📚', nome: 'Metodologias',
      descricao: 'Biblioteca universal: SPIN, Sandler, Challenger, Voss, MEDDIC, Hormozi. Reutilizável por qualquer agente.',
      metrics: [{ valor: m.familias.metodologia, label: 'curadas' }],
      pagina: 'cerebros',
      status: m.familias.metodologia > 0 ? 'ativo' : 'planejado',
    }),
    bloco({
      icone: '🔍', nome: 'Externos',
      descricao: 'Cérebros de concorrentes. Inteligência de mercado pra responder gaps e benchmarks.',
      metrics: [{ valor: m.familias.externo, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.externo > 0 ? 'ativo' : 'planejado',
    }),
    bloco({
      icone: '👤', nome: 'Clones',
      descricao: 'Pessoas. Sócios, conselheiros, gurus. Agente combina Cérebro de produto + Clone de pessoa.',
      metrics: [{ valor: m.familias.clone, label: 'ativos' }],
      pagina: 'cerebros',
      status: m.familias.clone > 0 ? 'ativo' : 'planejado',
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
      icone: '🔁', nome: 'RAG · Busca semântica',
      descricao: 'Busca pelo significado, não pela palavra. Pergunta "objeção de preço" e o sistema acha depoimentos que falam de "tá caro", "não cabe no bolso", etc.',
      metrics: [{ valor: m.totalChunks.toLocaleString('pt-BR'), label: 'trechos' }],
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
      status: (m.skillsAtivas + m.skillsConstrucao) > 0 ? (m.skillsAtivas > 0 ? 'ativo' : 'em_construcao') : 'planejado',
    }),
    bloco({
      icone: '🎯', nome: 'Funis',
      descricao: 'Construtor visual de funis de venda. Cada funil é dado consultável por agente em tempo real, com chave de habilitação por agente. Diferencial vs Geru/MailChimp.',
      metrics: [{ valor: m.totalFunis, label: 'criados' }],
      pagina: 'funis',
      status: m.totalFunis > 0 ? 'ativo' : 'em_construcao',
    }),
    bloco({
      icone: '🤖', nome: 'Squad de Agentes',
      descricao: 'Agentes especialistas por departamento. Atuam em paralelo, gerando assets de marketing e vendas.',
      metrics: m.totalAgentes > 0 ? [{ valor: m.totalAgentes, label: 'agentes' }] : [],
      pagina: m.totalAgentes > 0 ? 'agentes' : null,
      status: m.totalAgentes > 0 ? 'ativo' : 'planejado',
    }),
  ]));

  // Mini-secao: 3 camadas do funil
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

  wrap.appendChild(seta());

  // CAMADA 4 — ENTREGA
  wrap.appendChild(camada(4, 'Entrega', 'O que vai pro cliente final — e que volta como aprendizado pelo loop EPP', [
    bloco({ icone: '✍️', nome: 'Copy', descricao: 'Páginas de vendas, anúncios, e-mails, scripts. Tom da marca, baseado em depoimento real.', status: 'planejado' }),
    bloco({ icone: '📄', nome: 'Páginas', descricao: 'Landing pages e páginas de captura geradas a partir da Persona + Cérebro do produto.', status: 'planejado' }),
    bloco({ icone: '📊', nome: 'Campanhas', descricao: 'Estrutura de lançamento, criativos, sequência de e-mails. Pronto pra subir no tráfego.', status: 'planejado' }),
    bloco({ icone: '🎯', nome: 'Comercial', descricao: 'SDR, briefing pré-call, co-piloto do closer, analista pós-call. Aguarda aprovação do plano comercial.', status: 'planejado' }),
    bloco({ icone: '💬', nome: 'Atendimento', descricao: 'Suporte por produto. Aluno pergunta no Discord/WA, agente responde com base no Cérebro.', status: 'planejado' }),
    bloco({ icone: '📈', nome: 'Relatórios', descricao: 'Dashboards e relatórios de saúde do Cérebro, gaps de conteúdo, performance comercial.', status: 'planejado' }),
  ]));

  // CAMADA TRANSVERSAL — SEGURANCA
  wrap.appendChild(el('section', { class: 'mapa-seguranca-camada' }, [
    el('div', { class: 'mapa-seguranca-head' }, [
      el('div', { class: 'mapa-seguranca-eyebrow' }, '🛡 Camada Transversal · Segurança Contínua'),
      el('div', { class: 'mapa-seguranca-titulo' }, 'Squad Cyber operando 24/7, em paralelo a tudo'),
      el('div', { class: 'mapa-seguranca-sub' },
        'Defesa em profundidade + Zero Trust + IDS + Threat Intel. Não é correção pontual — é camada permanente, escalável e visível.'),
    ]),
    el('div', { class: 'mapa-seguranca-conselheiros' }, [
      bloco({ icone: '🛡', nome: 'Peter Kim', descricao: 'Red Team — simula ataque diário. F12, IDOR, query injection. Tudo que vaza vira incidente.', status: 'em-construcao' }),
      bloco({ icone: '🛡', nome: 'Georgia Weidman', descricao: 'Pentest semanal — OWASP Top 10 contra o sistema. Princípio do menor privilégio.', status: 'em-construcao' }),
      bloco({ icone: '🛡', nome: 'Jim Manico', descricao: 'Code Auditor — secure coding em todo push. Validação de input, autenticação, sessão.', status: 'em-construcao' }),
      bloco({ icone: '🛡', nome: 'Marcus Carey', descricao: 'Threat Intel — lê logs Vercel/Supabase a cada 6h. Coleta → análise → disseminação → feedback.', status: 'em-construcao' }),
      bloco({ icone: '🛡', nome: 'Omar Santos', descricao: 'Zero Trust — toda Edge valida JWT. Toda tool tem allowlist. Nada confiável por padrão.', status: 'ativo' }),
      bloco({ icone: '🛡', nome: 'Chris Sanders', descricao: 'IDS — compara tráfego com baseline. Alerta em desvio. Anomalia vira incidente.', status: 'em-construcao' }),
    ]),
    el('div', { class: 'mapa-seguranca-cards' }, [
      bloco({ icone: '🔒', nome: 'RLS auditado', descricao: 'Toda tabela do schema pinguim com RLS ativo + policy. Trigger valida em CREATE TABLE.', status: 'ativo' }),
      bloco({ icone: '🔑', nome: 'Cofre Vercel', descricao: 'Painel mostra nomes mascarados das chaves (último 4 chars). Valor nunca exposto.', status: 'ativo' }),
      bloco({ icone: '📊', nome: 'Raio-X do banco', descricao: 'Contagens reais (sem limite PostgREST), tamanho por tabela, projeção de quando estoura.', status: 'ativo' }),
      bloco({ icone: '⚖', nome: 'Políticas escritas', descricao: 'Princípio Dalio: feedback vira política, política não evapora. Tabela politicas_seguranca.', status: 'ativo' }),
    ]),
  ]));

  // Realimenta — fecha o ciclo
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

  // Legenda de status
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
    el('div', { class: 'mapa-legenda-rodape' }, 'Métricas atualizadas em tempo real do banco do Pinguim OS.'),
  ]));

  page.appendChild(wrap);
}
