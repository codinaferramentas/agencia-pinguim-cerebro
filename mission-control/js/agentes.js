/**
 * Pilar Agentes — Pinguim OS
 *
 * Tela operacional dos Agentes Pinguim. 4 abas:
 *   - Catálogo: cards estáticos do que existe (atual)
 *   - Conversar com Chief: chat ao vivo + Card Plano da Missão
 *   - Project Board: drafts/active/ready/done (placeholder até Workers rodarem)
 *   - Execuções: histórico de chamadas com custo, cache, latência
 *
 * Decisão arquitetural: tela única com tabs ao invés de páginas separadas
 * porque tudo orbita em torno do mesmo agente/conversa.
 */

import { getSupabase } from './sb-client.js?v=20260430k';

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

// =====================================================
// Estado da página (persistido entre re-renders na sessão)
// =====================================================
let aba = 'catalogo';

// Conversa ativa (caso_id) e histórico em memória
let casoAtivo = null;
let mensagensVisuais = []; // [{ papel, conteudo, plano_card?, uso? }]
// Hidrata do banco apenas 1x por sessão. Quando usuário clica "+ Novo caso",
// marca como hidratado pra não ressuscitar caso antigo no próximo render.
let conversaJaHidratada = false;

// Tenant e cliente padrão (Pinguim usa o próprio painel)
// Quando virar multi-tenant real, vem do contexto do usuário logado.
const TENANT_PADRAO = '00000000-0000-0000-0000-000000000001';
const CLIENTE_PADRAO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// Formatadores
const _nfUSD = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const _nfBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cotacaoUSDBRL = 5.65; // Fallback. FinOps tem versão viva via RPC.
const fmtUSD = (v) => 'US$ ' + _nfUSD.format(Number(v || 0));
const fmtBRL = (v) => 'R$ ' + _nfBRL.format(Number(v || 0) * cotacaoUSDBRL);

// =====================================================
// Entry point
// =====================================================
export async function renderAgentes() {
  const page = document.getElementById('page-agentes');
  page.innerHTML = '';

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Agentes'),
        el('div', { class: 'page-subtitle' },
          'Catálogo, conversa com Pinguim, Project Board e execuções. EPP ativo desde v1.'),
      ]),
    ]),
    el('div', { class: 'seguranca-tabs' }, [
      tab('catalogo', 'Catálogo'),
      tab('conversar', '💬 Conversar com Pinguim'),
      tab('board', '🗂 Project Board'),
      tab('execucoes', '📊 Execuções'),
    ]),
    el('div', { id: 'agentes-conteudo' }),
  );

  await renderAba(aba);
}

function tab(id, label) {
  return el('button', {
    class: 'seguranca-tab' + (aba === id ? ' active' : ''),
    type: 'button',
    onclick: async () => { aba = id; await renderAgentes(); },
  }, label);
}

async function renderAba(qual) {
  const container = document.getElementById('agentes-conteudo');
  container.innerHTML = '';
  container.appendChild(el('div', { class: 'seguranca-loading' }, 'Carregando...'));
  try {
    if (qual === 'catalogo') await renderCatalogo(container);
    else if (qual === 'conversar') await renderConversar(container);
    else if (qual === 'board') await renderBoard(container);
    else if (qual === 'execucoes') await renderExecucoes(container);
  } catch (e) {
    container.innerHTML = '';
    container.append(el('div', { class: 'seguranca-erro' }, `Erro: ${e.message}`));
  }
}

// =====================================================
// CATÁLOGO — lista todos os agentes do banco
// =====================================================
async function renderCatalogo(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) {
    container.append(el('div', { class: 'seguranca-empty' }, 'Supabase offline — catálogo indisponível.'));
    return;
  }

  const { data, error } = await sb
    .from('agentes')
    .select('id, slug, nome, avatar, status, modelo, missao, proposito, capabilities')
    .order('slug');

  if (error) {
    container.append(el('div', { class: 'seguranca-erro' }, error.message));
    return;
  }

  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' },
      'Nenhum agente cadastrado ainda. Próximo: criar Verifier (2º agente da squad agencia-pinguim).'));
    return;
  }

  // Stats no topo
  const stats = el('div', { class: 'agentes-stats' }, [
    statCard(data.length, 'Total'),
    statCard(data.filter(a => a.status === 'em_producao').length, 'Em produção'),
    statCard(data.filter(a => a.status === 'em_teste').length, 'Em teste'),
    statCard(data.filter(a => a.status === 'em_criacao').length, 'Em criação'),
  ]);

  const grid = el('div', { class: 'agentes-grid' },
    data.map(a => agenteCard(a))
  );

  container.append(stats, grid);
}

function statCard(valor, label) {
  return el('div', { class: 'agentes-stat' }, [
    el('div', { class: 'agentes-stat-num' }, String(valor)),
    el('div', { class: 'agentes-stat-label' }, label),
  ]);
}

function agenteCard(a) {
  const capList = Array.isArray(a.capabilities) ? a.capabilities : [];
  return el('div', { class: 'agente-card' }, [
    el('div', { class: 'agente-card-head' }, [
      el('div', { class: 'agente-avatar' }, a.avatar || a.nome?.[0] || '?'),
      el('div', { class: 'agente-card-title' }, [
        el('div', { class: 'agente-card-nome' }, a.nome),
        el('div', { class: 'agente-card-slug' }, a.slug),
      ]),
      el('div', { class: `agente-badge agente-badge-${a.status || 'desconhecido'}` },
        statusLabel(a.status)),
    ]),
    el('div', { class: 'agente-card-missao' }, a.missao || a.proposito || 'Sem missão definida'),
    el('div', { class: 'agente-card-meta' }, [
      el('span', { class: 'agente-card-modelo' }, a.modelo || '—'),
      capList.length > 0
        ? el('span', { class: 'agente-card-caps' }, `${capList.length} capabilities`)
        : null,
    ].filter(Boolean)),
    capList.length > 0
      ? el('div', { class: 'agente-card-caps-list' },
          capList.slice(0, 6).map(c => el('span', { class: 'agente-cap-chip' }, c)))
      : null,
  ].filter(Boolean));
}

function statusLabel(s) {
  return ({
    em_producao: 'Produção',
    em_teste: 'Teste',
    em_criacao: 'Criação',
    pausado: 'Pausado',
  })[s] || s || '?';
}

// =====================================================
// Carrega último caso aberto + suas mensagens do banco.
// Roda 1x quando a aba Conversar é aberta E ainda não há caso em memória.
// =====================================================
async function hidratarConversaDoBanco() {
  // Hidrata só 1x por sessão. Se já rodou, não mexe (mesmo se memória estiver vazia).
  // Isso evita ressuscitar caso antigo quando usuário clica "+ Novo caso".
  if (conversaJaHidratada) return;
  conversaJaHidratada = true;

  // Se já tem caso na memória da sessão, não sobrescreve.
  if (casoAtivo && mensagensVisuais.length > 0) return;

  const sb = getSupabase();
  if (!sb) return;

  // Pega o caso_id mais recente do tenant/cliente atual.
  const { data: ultimas } = await sb
    .from('conversas')
    .select('caso_id, criado_em')
    .eq('tenant_id', TENANT_PADRAO)
    .eq('cliente_id', CLIENTE_PADRAO)
    .not('caso_id', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(1);

  const caso = ultimas?.[0]?.caso_id;
  if (!caso) return;

  // Carrega últimas 20 mensagens do caso, ordem cronológica
  const { data: msgs } = await sb
    .from('conversas')
    .select('papel, conteudo, artefatos, criado_em')
    .eq('tenant_id', TENANT_PADRAO)
    .eq('cliente_id', CLIENTE_PADRAO)
    .eq('caso_id', caso)
    .order('criado_em', { ascending: true })
    .limit(20);

  if (!msgs || msgs.length === 0) return;

  casoAtivo = caso;
  mensagensVisuais = msgs.map(m => ({
    papel: m.papel,
    conteudo: m.conteudo,
    plano_card: m.artefatos?.card_plano_missao || (m.artefatos?.tipo === 'card_plano_missao' ? m.artefatos.card : null),
    scripts: m.artefatos?.scripts || [],
    squads_consultadas: m.artefatos?.squads_consultadas || [],
    produtos_detectados: m.artefatos?.produtos_detectados || [],
  }));
}

// =====================================================
// CONVERSAR COM CHIEF
// =====================================================
async function renderConversar(container) {
  container.innerHTML = '';

  // Hidrata do banco se for 1ª abertura da sessão (caso e mensagens vazios).
  await hidratarConversaDoBanco();

  const layout = el('div', { class: 'agentes-conversa' }, [
    el('div', { class: 'conversa-cabec' }, [
      el('div', { class: 'agente-avatar agente-avatar-grande' }, '🐧'),
      el('div', { class: 'conversa-cabec-info' }, [
        el('div', { class: 'conversa-cabec-nome' }, 'Pinguim — Atendente'),
        el('div', { class: 'conversa-cabec-sub' },
          mensagensVisuais.length === 0
            ? 'Conta o que você precisa. Eu consulto Cérebros, trago Clones, entrego.'
            : `${mensagensVisuais.length} mensagem${mensagensVisuais.length === 1 ? '' : 's'} nesta conversa`),
      ]),
      el('button', {
        class: 'btn',
        type: 'button',
        title: 'Limpa a tela e começa nova conversa (histórico continua salvo no banco)',
        onclick: () => {
          casoAtivo = null;
          mensagensVisuais = [];
          conversaJaHidratada = true;
          renderAba('conversar');
        },
      }, 'Nova conversa'),
    ]),
    el('div', { id: 'conversa-mensagens', class: 'conversa-mensagens' },
      mensagensVisuais.length === 0
        ? [el('div', { class: 'conversa-vazia' }, [
            el('div', { class: 'conversa-vazia-icon' }, '🐧'),
            el('div', {}, 'Diz aí.'),
            el('div', { class: 'conversa-vazia-hint' },
              'Eu reconheço Cérebro de produto, trago Clones como conselheiros, e só monto plano quando tem entregável real.'),
          ])]
        : mensagensVisuais.map((m, i) => mensagemBubble(m, i))
    ),
    el('form', {
      class: 'conversa-input',
      onsubmit: async (e) => {
        e.preventDefault();
        const ta = document.getElementById('conversa-textarea');
        const txt = (ta.value || '').trim();
        if (!txt) return;
        ta.value = '';
        await enviarMensagem(txt);
      },
    }, [
      el('textarea', {
        id: 'conversa-textarea',
        class: 'conversa-textarea',
        placeholder: 'Conta o que você precisa. Eu cuido do resto.',
        rows: '3',
        onkeydown: (e) => {
          // Enter envia. Shift+Enter quebra linha.
          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.target.form.requestSubmit();
          }
        },
      }),
      el('div', { class: 'conversa-input-rodape' }, [
        el('div', { class: 'conversa-hint' }, 'Enter envia · Shift+Enter quebra linha'),
        el('button', { class: 'btn btn-primary', type: 'submit' }, 'Enviar →'),
      ]),
    ]),
  ]);

  container.append(layout);

  // Scroll pro fim sempre que renderizar
  setTimeout(() => {
    const lista = document.getElementById('conversa-mensagens');
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, 50);
}

function mensagemBubble(m, idx) {
  const isHumano = m.papel === 'humano';
  return el('div', { class: `conversa-bolha conversa-bolha-${isHumano ? 'humano' : 'chief'}` }, [
    !isHumano ? el('div', { class: 'conversa-bolha-avatar' }, '🐧') : null,
    el('div', { class: 'conversa-bolha-corpo' }, [
      m.conteudo
        ? el('div', { class: 'conversa-bolha-texto' }, m.conteudo)
        : null,
      Array.isArray(m.produtos_detectados) && m.produtos_detectados.length > 0
        ? renderProdutosDetectados(m.produtos_detectados)
        : null,
      Array.isArray(m.squads_consultadas) && m.squads_consultadas.length > 0
        ? renderSquadsConsultadas(m.squads_consultadas)
        : null,
      Array.isArray(m.scripts) && m.scripts.length > 0
        ? renderScripts(m.scripts)
        : null,
      m.plano_card
        ? renderCardPlanoMissao(m.plano_card, m.uso)
        : null,
      m.uso && !m.plano_card
        ? el('div', { class: 'conversa-bolha-uso' }, formatarUso(m.uso))
        : null,
      // Feedback EPP — só pra mensagens do Chief que não foram saudação canned
      !isHumano && m.uso && m.uso.modelo !== 'rota:script' && !m.feedback_dado
        ? renderFeedbackBotoes(idx)
        : !isHumano && m.feedback_dado
          ? el('div', { class: 'conversa-feedback-dado' }, `Feedback registrado: ${m.feedback_dado}`)
          : null,
    ].filter(Boolean)),
  ].filter(Boolean));
}

function renderFeedbackBotoes(idx) {
  return el('div', { class: 'conversa-feedback' }, [
    el('button', {
      class: 'conversa-feedback-btn conversa-feedback-aprovou',
      type: 'button',
      title: 'Ficou bom',
      onclick: () => enviarFeedback(idx, 'aprovou'),
    }, '👍'),
    el('button', {
      class: 'conversa-feedback-btn conversa-feedback-rejeitou',
      type: 'button',
      title: 'Não foi isso — refazer',
      onclick: () => enviarFeedback(idx, 'rejeitou'),
    }, '👎'),
    el('button', {
      class: 'conversa-feedback-btn conversa-feedback-refinou',
      type: 'button',
      title: 'Refinar (ajuste algo específico)',
      onclick: () => enviarFeedback(idx, 'refinou'),
    }, '✏️'),
  ]);
}

async function enviarFeedback(idx, tipo) {
  const msgChief = mensagensVisuais[idx];
  if (!msgChief) return;
  // Procura a última mensagem do humano antes desta
  let msgHumano = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (mensagensVisuais[i].papel === 'humano') {
      msgHumano = mensagensVisuais[i];
      break;
    }
  }
  if (!msgHumano) {
    alert('Não achei o pedido original.');
    return;
  }

  let comentario = '';
  if (tipo === 'rejeitou' || tipo === 'refinou') {
    const placeholder = tipo === 'rejeitou'
      ? 'O que estava errado? (ex.: "delegou squad errada", "inventou preço", "ficou genérico")'
      : 'Que ajuste você quer? (ex.: "tom mais provocativo", "mais curto", "outro mestre")';
    comentario = prompt(placeholder) || '';
    if (!comentario.trim()) return;
  }

  // Marca otimisticamente
  msgChief.feedback_dado = tipo + (comentario ? ` — "${comentario.slice(0, 60)}"` : '');
  await renderAba('conversar');

  try {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sessão expirada');

    const url = `${window.__ENV__.SUPABASE_URL}/functions/v1/feedback-pinguim`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': window.__ENV__.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: TENANT_PADRAO,
        cliente_id: CLIENTE_PADRAO,
        caso_id: casoAtivo,
        mensagem_humana: msgHumano.conteudo,
        mensagem_agente: msgChief.conteudo,
        tipo,
        comentario,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detalhe || data.error || `HTTP ${resp.status}`);

    // Se rejeitou/refinou, adiciona nova resposta refeita
    if (data.proxima_resposta) {
      mensagensVisuais.push({
        papel: 'chief',
        conteudo: data.proxima_resposta,
        uso: data.uso,
        refeito_por_feedback: tipo,
        verifier_problemas: data.verifier_problemas || [],
        reflection_rounds: data.reflection_rounds || 0,
      });
    }
  } catch (e) {
    msgChief.feedback_dado = null;
    alert(`Erro ao enviar feedback: ${e.message}`);
  } finally {
    await renderAba('conversar');
  }
}

function renderProdutosDetectados(produtos) {
  return el('div', { class: 'conversa-produtos-detectados' }, [
    el('span', { class: 'conversa-produtos-label' }, 'Cérebros consultados:'),
    ...produtos.map(p => el('span', { class: 'conversa-produto-chip' },
      `${p.cerebro_slug} · ${(p.confianca * 100).toFixed(0)}%`)),
  ]);
}

function renderSquadsConsultadas(squads) {
  return el('div', { class: 'conversa-produtos-detectados' }, [
    el('span', { class: 'conversa-produtos-label' }, 'Squad → Mestres invocados:'),
    ...squads.flatMap(s => [
      el('span', { class: 'conversa-produto-chip', style: 'background: var(--surface-3, #2a2a2a); border: 1px solid var(--accent);' },
        `${s.squad}`),
      ...(s.mestres || []).map(m => el('span', { class: 'conversa-produto-chip' }, m)),
    ]),
  ]);
}

function renderScripts(scripts) {
  return el('div', { class: 'conversa-scripts' },
    scripts.map(s => el('div', { class: 'conversa-script-card' }, [
      el('div', { class: 'conversa-script-head' }, [
        el('span', { class: 'conversa-script-tag' }, s.linguagem),
        el('span', { class: 'conversa-script-obj' }, s.objetivo),
      ]),
      el('pre', { class: 'conversa-script-code' }, s.codigo),
      s.como_executar
        ? el('div', { class: 'conversa-script-howto' }, `▶ ${s.como_executar}`)
        : null,
      el('div', { class: 'conversa-script-aviso' },
        '⚠ Script gerado pelo Pinguim. Revise antes de executar.'),
    ].filter(Boolean)))
  );
}

function formatarUso(uso) {
  if (!uso) return '';
  const partes = [];
  if (uso.modelo === 'rota:script') {
    // Resposta canned (saudação/agradecimento). Custo zero.
    partes.push('script · sem LLM · US$ 0,00');
    if (uso.latencia_total_ms) partes.push(`${(uso.latencia_total_ms / 1000).toFixed(1)}s`);
    return partes.join(' · ');
  }
  if (uso.modelo) partes.push(uso.modelo.replace('openai:', ''));
  if (uso.custo_usd != null) partes.push(`${fmtUSD(uso.custo_usd)} (${fmtBRL(uso.custo_usd)})`);
  if (uso.cache_hit_pct > 0) partes.push(`cache ${uso.cache_hit_pct}%`);
  if (uso.tool_rounds) partes.push(`${uso.tool_rounds} round${uso.tool_rounds === 1 ? '' : 's'}`);
  if (uso.latencia_total_ms) partes.push(`${(uso.latencia_total_ms / 1000).toFixed(1)}s`);
  return partes.join(' · ');
}

// =====================================================
// CARD PLANO DA MISSÃO — render visual do plano que Chief monta
// =====================================================
function renderCardPlanoMissao(card, uso) {
  if (!card) return null;
  return el('div', { class: 'card-plano' }, [
    el('div', { class: 'card-plano-head' }, [
      el('div', { class: 'card-plano-titulo' }, '🗺 Plano da Missão'),
      uso ? el('div', { class: 'card-plano-uso' }, formatarUso(uso)) : null,
    ].filter(Boolean)),

    el('div', { class: 'card-plano-secao' }, [
      el('div', { class: 'card-plano-label' }, 'Diagnóstico'),
      el('div', { class: 'card-plano-diag' }, card.diagnostico || ''),
    ]),

    Array.isArray(card.squad) && card.squad.length > 0 ? el('div', { class: 'card-plano-secao' }, [
      el('div', { class: 'card-plano-label' }, `Squad (${card.squad.length})`),
      el('div', { class: 'card-plano-squad' },
        card.squad.map(s => el('div', { class: 'card-plano-membro' }, [
          el('div', { class: 'card-plano-membro-papel' }, s.papel || s.agente_slug),
          el('div', { class: 'card-plano-membro-slug' }, s.agente_slug),
          el('div', { class: 'card-plano-membro-just' }, s.justificativa || ''),
        ]))),
    ]) : null,

    Array.isArray(card.proximos_passos) && card.proximos_passos.length > 0 ? el('div', { class: 'card-plano-secao' }, [
      el('div', { class: 'card-plano-label' }, 'Próximos passos'),
      el('ol', { class: 'card-plano-passos' },
        card.proximos_passos.map(p => el('li', {}, [
          el('span', { class: 'card-plano-passo-acao' }, p.acao || ''),
          Array.isArray(p.depende_de) && p.depende_de.length > 0
            ? el('span', { class: 'card-plano-passo-dep' }, ` (depende: ${p.depende_de.join(', ')})`)
            : null,
        ].filter(Boolean)))),
    ]) : null,

    el('div', { class: 'card-plano-rodape' }, [
      el('div', { class: 'card-plano-estim' }, [
        el('div', {}, [
          el('div', { class: 'card-plano-label' }, 'Tempo estimado'),
          el('div', { class: 'card-plano-num' },
            card.estimativa_minutos == null
              ? 'sem histórico'
              : formatarTempo(card.estimativa_minutos)),
        ]),
        el('div', {}, [
          el('div', { class: 'card-plano-label' }, 'Custo estimado'),
          el('div', { class: 'card-plano-num' },
            card.estimativa_custo_usd == null
              ? 'sem histórico'
              : fmtUSD(card.estimativa_custo_usd)),
        ]),
      ]),
      el('div', { class: 'card-plano-pergunta' }, card.pergunta_aprovacao || 'Posso seguir?'),
      el('div', { class: 'card-plano-acoes' }, [
        el('button', { class: 'btn btn-primary', disabled: 'true', title: 'Disparo da squad vem no Bloco 5' }, '✓ Aprovar e executar'),
        el('button', { class: 'btn', disabled: 'true' }, 'Ajustar plano'),
      ]),
    ]),
  ].filter(Boolean));
}

function formatarTempo(min) {
  if (!min) return '—';
  const m = Number(min);
  if (m < 60) return `${m} min`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)} h`;
  const d = h / 24;
  return `${d.toFixed(1)} dias`;
}

// =====================================================
// Envia mensagem pro Chief via Edge Function
// =====================================================
async function enviarMensagem(texto) {
  // Adiciona mensagem do humano na UI imediatamente
  mensagensVisuais.push({ papel: 'humano', conteudo: texto });
  await renderAba('conversar');

  // Indicador de "Chief pensando"
  const lista = document.getElementById('conversa-mensagens');
  const pensando = el('div', { class: 'conversa-bolha conversa-bolha-chief conversa-pensando' }, [
    el('div', { class: 'conversa-bolha-avatar' }, '🐧'),
    el('div', { class: 'conversa-bolha-corpo' }, [
      el('div', { class: 'conversa-pensando-pulse' }, 'Pinguim pensando · consultando Cérebro · trazendo Clones...'),
    ]),
  ]);
  if (lista) {
    lista.append(pensando);
    lista.scrollTop = lista.scrollHeight;
  }

  try {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase offline');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sessão expirada — refaça login');

    const url = `${window.__ENV__.SUPABASE_URL}/functions/v1/atendente-pinguim`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': window.__ENV__.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: TENANT_PADRAO,
        cliente_id: CLIENTE_PADRAO,
        solicitante_id: session.user.id,
        caso_id: casoAtivo,
        mensagem: texto,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detalhe || data.error || `HTTP ${resp.status}`);

    // Guarda caso_id pra próximas mensagens
    if (data.caso_id) casoAtivo = data.caso_id;

    mensagensVisuais.push({
      papel: 'chief',
      conteudo: data.resposta,
      plano_card: data.plano_card,
      scripts: data.scripts || [],
      produtos_detectados: data.produtos_detectados || [],
      squads_consultadas: data.squads_consultadas || [],
      uso: data.uso,
    });
  } catch (e) {
    mensagensVisuais.push({
      papel: 'chief',
      conteudo: `⚠ Erro: ${e.message}`,
    });
  } finally {
    await renderAba('conversar');
  }
}

// =====================================================
// PROJECT BOARD (placeholder até Workers rodarem)
// =====================================================
async function renderBoard(container) {
  container.innerHTML = '';

  const colunas = [
    { id: 'drafts', titulo: 'Drafts', sub: 'Planos aguardando aprovação' },
    { id: 'active', titulo: 'Active', sub: 'Workers executando' },
    { id: 'ready', titulo: 'Ready', sub: 'Entregáveis prontos pra revisão' },
    { id: 'done', titulo: 'Done', sub: 'Aprovados' },
  ];

  const board = el('div', { class: 'project-board' },
    colunas.map(c => el('div', { class: 'board-coluna' }, [
      el('div', { class: 'board-coluna-head' }, [
        el('div', { class: 'board-coluna-titulo' }, c.titulo),
        el('div', { class: 'board-coluna-sub' }, c.sub),
        el('div', { class: 'board-coluna-count' }, '0'),
      ]),
      el('div', { class: 'board-coluna-vazia' }, 'Vazio'),
    ]))
  );

  container.append(
    el('div', { class: 'board-aviso' }, [
      el('strong', {}, 'Em construção. '),
      'Workers ainda não executam — Bloco 5 vai disparar a squad depois da aprovação do Card Plano da Missão.',
    ]),
    board,
  );
}

// =====================================================
// EXECUÇÕES — histórico de chamadas com custo, cache, latência
// =====================================================
async function renderExecucoes(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) {
    container.append(el('div', { class: 'seguranca-empty' }, 'Supabase offline.'));
    return;
  }

  // Pega as últimas 50 execuções com nome do agente via join manual
  const { data: execs, error } = await sb
    .from('agente_execucoes')
    .select('id, agente_id, custo_usd, latencia_ms, tokens_entrada, tokens_saida, tokens_cached, created_at, output')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    container.append(el('div', { class: 'seguranca-erro' }, error.message));
    return;
  }

  if (!execs || execs.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' },
      'Nenhuma execução ainda. Mande uma mensagem pro Pinguim na aba Conversar pra gerar a primeira.'));
    return;
  }

  // Map de agente_id → nome
  const ids = [...new Set(execs.map(e => e.agente_id))];
  const { data: agentes } = await sb.from('agentes').select('id, slug, nome, avatar').in('id', ids);
  const mapAg = new Map((agentes || []).map(a => [a.id, a]));

  // Sumario do topo
  const totalUSD = execs.reduce((s, e) => s + Number(e.custo_usd || 0), 0);
  const totalCached = execs.reduce((s, e) => s + Number(e.tokens_cached || 0), 0);
  const totalIn = execs.reduce((s, e) => s + Number(e.tokens_entrada || 0), 0);
  const cacheHitMedio = totalIn > 0 ? (totalCached / totalIn * 100) : 0;

  const stats = el('div', { class: 'agentes-stats' }, [
    statCard(execs.length, 'Execuções (últimas 50)'),
    statCard(fmtUSD(totalUSD), 'Custo total'),
    statCard(fmtBRL(totalUSD), 'Em BRL'),
    statCard(`${cacheHitMedio.toFixed(1)}%`, 'Cache hit médio'),
  ]);

  const tabela = el('table', { class: 'finops-tabela' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Quando'),
        el('th', {}, 'Agente'),
        el('th', {}, 'Tokens in/out'),
        el('th', {}, 'Cache'),
        el('th', {}, 'Latência'),
        el('th', {}, 'Custo'),
      ]),
    ]),
    el('tbody', {},
      execs.map(e => {
        const ag = mapAg.get(e.agente_id);
        const cachePct = e.tokens_entrada > 0 ? (Number(e.tokens_cached || 0) / Number(e.tokens_entrada) * 100) : 0;
        return el('tr', {}, [
          el('td', { class: 'nowrap' }, formatarData(e.created_at)),
          el('td', {}, [
            el('span', { class: 'mini-avatar' }, ag?.avatar || '?'),
            ' ',
            el('strong', {}, ag?.nome || ag?.slug || e.agente_id.slice(0, 8)),
          ]),
          el('td', { class: 'nowrap' }, `${e.tokens_entrada || 0} / ${e.tokens_saida || 0}`),
          el('td', { class: 'nowrap' },
            cachePct > 0 ? `${cachePct.toFixed(0)}%` : '—'),
          el('td', { class: 'nowrap' },
            e.latencia_ms ? `${(e.latencia_ms / 1000).toFixed(1)}s` : '—'),
          el('td', { class: 'nowrap', title: fmtBRL(e.custo_usd) }, fmtUSD(e.custo_usd)),
        ]);
      })
    ),
  ]);

  container.append(stats, tabela);
}

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const hoje = new Date();
  const isHoje = d.toDateString() === hoje.toDateString();
  if (isHoje) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
