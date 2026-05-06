/**
 * Pilar FinOps — Pinguim OS
 *
 * Squad: JR Storment, Corey Quinn, Eli Mansoor, Mike Fuller.
 * Princípio: cliente do Pinguim OS abre painel e VÊ quanto está gastando.
 * Sem surpresa de fim de mês, sem teatro.
 */
import { getSupabase } from './sb-client.js?v=20260429d';

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

let aba = 'visao';

// Formatadores pt-BR. Casas decimais escolhidas pra acomodar valores
// muito pequenos (centavos de OpenAI) sem perder precisao.
const _nfUSD = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const _nfBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cotacao USD->BRL viva: carregada de pinguim.cotacao_atual no primeiro render.
// Atualiza diariamente via Edge Function atualizar-cotacao (cron 06h UTC).
let cotacaoCache = { valor: 5.10, fonte: 'fallback-estatico', capturado_em: null };

async function carregarCotacao() {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc('cotacao_atual', { p_par: 'USD-BRL' });
    if (error || !data || !data[0]) return;
    cotacaoCache = {
      valor: Number(data[0].valor),
      fonte: data[0].fonte,
      capturado_em: data[0].capturado_em,
    };
  } catch (_) { /* mantem fallback */ }
}

const fmtUSD = (v) => 'US$ ' + _nfUSD.format(Number(v || 0));
const fmtBRL = (v) => 'R$ ' + _nfBRL.format(Number(v || 0) * cotacaoCache.valor);

function rotuloCotacao() {
  if (cotacaoCache.fonte === 'fallback-estatico') return 'Cotacao estimada (5,10)';
  const v = _nfBRL.format(cotacaoCache.valor);
  if (cotacaoCache.capturado_em) {
    const d = new Date(cotacaoCache.capturado_em);
    return `Cotacao: ${v} (${cotacaoCache.fonte}, ${d.toLocaleDateString('pt-BR')})`;
  }
  return `Cotacao: ${v} (${cotacaoCache.fonte})`;
}

// ============================================================
// PERIODO — estado por aba, persistido em localStorage
// ============================================================
const STORAGE_PREFIX = 'pinguim:finops:periodo:';
const PRESETS = [
  { key: '7d',     label: 'Últimos 7d' },
  { key: '30d',    label: 'Últimos 30d' },
  { key: 'mes',    label: 'Mês corrente' },
  { key: 'ant',    label: 'Mês passado' },
  { key: 'custom', label: 'Custom…' },
];

function periodoPadrao() { return { preset: '30d' }; }

function carregarPeriodo(aba) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + aba);
    if (!raw) return periodoPadrao();
    const p = JSON.parse(raw);
    if (!p.preset) return periodoPadrao();
    return p;
  } catch (_) { return periodoPadrao(); }
}

function salvarPeriodo(aba, periodo) {
  try { localStorage.setItem(STORAGE_PREFIX + aba, JSON.stringify(periodo)); } catch (_) {}
}

// Resolve preset/datas customizadas em [inicio, fim] como string YYYY-MM-DD
function resolverDatas(periodo) {
  const hoje = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);

  if (periodo.preset === 'custom' && periodo.inicio && periodo.fim) {
    return { inicio: periodo.inicio, fim: periodo.fim };
  }

  if (periodo.preset === '7d') {
    const ini = new Date(hoje); ini.setDate(ini.getDate() - 6);
    return { inicio: fmt(ini), fim: fmt(hoje) };
  }
  if (periodo.preset === 'mes') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { inicio: fmt(ini), fim: fmt(hoje) };
  }
  if (periodo.preset === 'ant') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { inicio: fmt(ini), fim: fmt(fim) };
  }
  // 30d (default)
  const ini = new Date(hoje); ini.setDate(ini.getDate() - 29);
  return { inicio: fmt(ini), fim: fmt(hoje) };
}

function rotuloPeriodo(periodo) {
  const def = PRESETS.find(p => p.key === periodo.preset);
  if (periodo.preset === 'custom' && periodo.inicio && periodo.fim) {
    return `${formatarDataBR(periodo.inicio)} → ${formatarDataBR(periodo.fim)}`;
  }
  return def ? def.label : 'Últimos 30d';
}

function formatarDataBR(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

// Renderiza barra de chips + datepicker custom
function renderSeletorPeriodo(abaAtual, container, onChange) {
  const periodo = carregarPeriodo(abaAtual);
  const wrap = el('div', { class: 'finops-periodo' });

  const chipsRow = el('div', { class: 'finops-periodo-chips' });
  PRESETS.forEach(p => {
    chipsRow.append(el('button', {
      class: 'finops-chip' + (periodo.preset === p.key ? ' active' : ''),
      type: 'button',
      onclick: () => {
        if (p.key === 'custom') {
          // Mantem custom ativo, mas precisa de datas — abre inputs
          const novo = { preset: 'custom', inicio: periodo.inicio || resolverDatas(periodoPadrao()).inicio, fim: periodo.fim || resolverDatas(periodoPadrao()).fim };
          salvarPeriodo(abaAtual, novo);
        } else {
          salvarPeriodo(abaAtual, { preset: p.key });
        }
        onChange();
      },
    }, p.label));
  });
  wrap.append(chipsRow);

  // Datepicker custom (so aparece quando preset === 'custom')
  if (periodo.preset === 'custom') {
    const datas = resolverDatas(periodo);
    const inpInicio = el('input', {
      type: 'date',
      class: 'finops-data-input',
      value: datas.inicio,
      onchange: (e) => {
        const novo = { ...periodo, inicio: e.target.value };
        salvarPeriodo(abaAtual, novo);
        onChange();
      },
    });
    const inpFim = el('input', {
      type: 'date',
      class: 'finops-data-input',
      value: datas.fim,
      onchange: (e) => {
        const novo = { ...periodo, fim: e.target.value };
        salvarPeriodo(abaAtual, novo);
        onChange();
      },
    });
    wrap.append(el('div', { class: 'finops-periodo-custom' }, [
      el('span', { class: 'finops-periodo-label' }, 'De'),
      inpInicio,
      el('span', { class: 'finops-periodo-label' }, 'até'),
      inpFim,
    ]));
  }

  container.append(wrap);
  return periodo;
}

// ============================================================
// ENTRY POINT
// ============================================================
export async function renderFinOps() {
  const page = document.getElementById('page-finops');
  page.innerHTML = '';

  // Carrega cotacao viva uma vez por sessao de render. Erro silencioso —
  // se falhar, mantem o fallback 5,10 que ja esta no cache.
  await carregarCotacao();

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, '💰 FinOps'),
        el('div', { class: 'page-subtitle' },
          'Squad: JR Storment, Corey Quinn, Eli Mansoor, Mike Fuller. Quanto cada provedor consome, projeção de fim de mês, alertas. Sem surpresa.'),
      ]),
      el('button', { class: 'btn', onclick: () => atualizarAgora() }, '↻ Atualizar agora'),
    ]),
    el('div', { class: 'seguranca-tabs' }, [
      tab('visao', 'Visão geral'),
      tab('tokens', 'Tokens IA'),
      tab('por-agente', 'Por agente'),
      tab('banco', 'Banco'),
      tab('alertas', 'Alertas'),
      tab('historico', 'Histórico'),
    ]),
    el('div', { id: 'finops-conteudo' }),
  );

  await renderAba(aba, document.getElementById('finops-conteudo'));
}

function tab(id, label) {
  return el('button', {
    class: 'seguranca-tab' + (aba === id ? ' active' : ''),
    type: 'button',
    onclick: async () => { aba = id; await renderFinOps(); },
  }, label);
}

async function renderAba(qual, container) {
  container.innerHTML = '';
  const loading = el('div', { class: 'seguranca-loading' }, 'Carregando...');
  container.appendChild(loading);
  try {
    if (qual === 'visao') await renderVisao(container);
    else if (qual === 'tokens') await renderTokens(container);
    else if (qual === 'por-agente') await renderPorAgente(container);
    else if (qual === 'banco') await renderBanco(container);
    else if (qual === 'alertas') await renderAlertas(container);
    else if (qual === 'historico') await renderHistorico(container);
  } catch (e) {
    container.innerHTML = `<div class="seguranca-erro">Erro: ${e.message}</div>`;
  }
}

// ============================================================
// VISAO GERAL
// ============================================================
async function renderVisao(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) return;

  const periodo = renderSeletorPeriodo('visao', container, () => renderAba('visao', container));
  const { inicio, fim } = resolverDatas(periodo);

  const { data, error } = await sb.rpc('custo_periodo', { p_inicio: inicio, p_fim: fim });
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }
  const m = data[0];
  const total = Number(m.total_usd);
  const media = Number(m.media_dia_usd);
  const projecao30 = Number(m.projecao_30_dias_usd);
  const porProvedor = m.por_provedor || {};
  const porOperacao = m.por_operacao || {};

  const cardPrincipal = el('div', { class: 'finops-card-principal' }, [
    el('div', { class: 'finops-eyebrow' },
      `${rotuloPeriodo(periodo)} · ${m.dias_periodo} dia${m.dias_periodo === 1 ? '' : 's'}`),
    el('div', { class: 'finops-total-num' }, fmtUSD(total)),
    el('div', { class: 'finops-total-brl', title: rotuloCotacao() }, fmtBRL(total)),
    el('div', { class: 'finops-projecao' }, [
      el('span', {}, `📊 Média ${fmtUSD(media)}/dia · `),
      el('span', {}, `Projeção 30d: `),
      el('strong', {}, fmtUSD(projecao30)),
    ]),
  ]);

  if (total === 0) {
    container.append(cardPrincipal,
      el('div', { class: 'seguranca-empty', style: 'margin-top:1rem' },
        'Nenhum custo registrado neste período. Tente um intervalo maior ou verifique se o cron de FinOps já rodou hoje.'),
    );
    return;
  }

  const cardsProvedor = el('div', { class: 'finops-grid' },
    Object.entries(porProvedor).sort((a, b) => Number(b[1]) - Number(a[1])).map(([prov, val]) => {
      const v = Number(val);
      const pct = total > 0 ? (v / total) * 100 : 0;
      return el('div', { class: 'finops-card' }, [
        el('div', { class: 'finops-card-titulo' }, [
          el('span', {}, prov),
          el('span', { class: 'finops-card-pct' }, `${pct.toFixed(0)}%`),
        ]),
        el('div', { class: 'finops-card-valor' }, fmtUSD(v)),
        el('div', { class: 'finops-card-brl' }, fmtBRL(v)),
        el('div', { class: 'finops-card-bar-bg' }, [
          el('div', { class: 'finops-card-bar-fg', style: `width:${pct}%` }),
        ]),
      ]);
    })
  );

  const tabelaOp = el('div', { class: 'finops-secao' }, [
    el('div', { class: 'finops-secao-titulo' }, '🎯 Por operação'),
    el('table', { class: 'finops-tabela' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, 'Operação'),
        el('th', { style: 'text-align:right' }, 'Custo'),
        el('th', { style: 'text-align:right' }, 'BRL'),
      ])]),
      el('tbody', {}, Object.entries(porOperacao).sort((a, b) => Number(b[1]) - Number(a[1])).map(([op, v]) => el('tr', {}, [
        el('td', {}, op),
        el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmtUSD(v)),
        el('td', { style: 'text-align:right;color:var(--fg-muted);font-size:.8125rem' }, fmtBRL(v)),
      ]))),
    ]),
  ]);

  container.append(cardPrincipal, cardsProvedor, tabelaOp);
}

// ============================================================
// TOKENS IA
// ============================================================
async function renderTokens(container) {
  container.innerHTML = '';
  const sb = getSupabase();

  const periodo = renderSeletorPeriodo('tokens', container, () => renderAba('tokens', container));
  const { inicio, fim } = resolverDatas(periodo);

  const { data, error } = await sb.rpc('tokens_ia_periodo', { p_inicio: inicio, p_fim: fim });
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' },
      `Sem registros de OpenAI/Anthropic em ${rotuloPeriodo(periodo)}.`));
    return;
  }
  const total = data.reduce((s, r) => s + Number(r.total_usd), 0);

  container.append(
    el('div', { class: 'finops-card-principal' }, [
      el('div', { class: 'finops-eyebrow' }, `Tokens IA · ${rotuloPeriodo(periodo)}`),
      el('div', { class: 'finops-total-num' }, fmtUSD(total)),
      el('div', { class: 'finops-total-brl', title: rotuloCotacao() }, fmtBRL(total)),
      el('div', { class: 'finops-projecao' }, '🎙 JR Storment: "Custo direto do consumo de IA — quem paga é o consumidor."'),
    ]),
    el('table', { class: 'finops-tabela' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, 'Operação (consumidor)'),
        el('th', { style: 'text-align:right' }, 'Eventos'),
        el('th', { style: 'text-align:right' }, 'Custo'),
        el('th', { style: 'text-align:right' }, '%'),
      ])]),
      el('tbody', {}, data.map(r => el('tr', {}, [
        el('td', {}, [el('strong', {}, r.operacao)]),
        el('td', { style: 'text-align:right;color:var(--fg-muted)' }, r.qtd_eventos.toLocaleString('pt-BR')),
        el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmtUSD(r.total_usd)),
        el('td', { style: 'text-align:right' }, [el('span', { class: 'finops-pct-badge' }, r.pct_total + '%')]),
      ]))),
    ]),
    el('div', { class: 'finops-nota' },
      '⚠ Custos por operação são estimados (heurística por consumidor). Total agregado é exato a partir de ingest_lotes.custo_usd.'),
  );
}

// ============================================================
// BANCO — sempre estado atual, sem seletor
// ============================================================
async function renderBanco(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/raio-x-banco`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!r.ok) { container.append(el('div', { class: 'seguranca-erro' }, `Erro ${r.status}`)); return; }
  const dados = await r.json();
  const tamanhoMB = dados.tamanho_total_bytes / 1024 / 1024;
  const limiteMB = dados.plano_limite_bytes / 1024 / 1024;
  const pct = dados.pct_plano || 0;
  const status = pct >= 90 ? 'critical' : (pct >= 70 ? 'warning' : 'ok');

  container.append(
    el('div', { class: 'finops-card-principal' }, [
      el('div', { class: 'finops-eyebrow' }, 'Banco Supabase · plano Pro'),
      el('div', { class: 'finops-total-num' }, 'US$ 25,00 / mês'),
      el('div', { class: 'finops-total-brl' },
        `${tamanhoMB.toFixed(2)} MB de ${limiteMB.toFixed(0)} MB incluídos · ${pct.toFixed(2)}% do plano`),
      el('div', { class: 'raiox-bar-bg' }, [
        el('div', { class: `raiox-bar-fg raiox-bar-${status}`, style: `width:${Math.min(100, pct)}%` }),
      ]),
      dados.projecao?.dias_para_estourar != null
        ? el('div', { class: 'finops-projecao' },
            `📈 Banco estoura em ~${dados.projecao.dias_para_estourar} dias no ritmo atual (a partir daí: US$ 0,125 / GB extra).`)
        : el('div', { class: 'finops-projecao', style: 'opacity:.6' }, 'Histórico curto pra projeção.'),
    ]),
    el('div', { class: 'finops-secao' }, [
      el('div', { class: 'finops-secao-titulo' }, '📦 Top tabelas'),
      el('table', { class: 'finops-tabela' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, 'Tabela'),
          el('th', { style: 'text-align:right' }, 'Linhas'),
          el('th', { style: 'text-align:right' }, 'Tamanho'),
        ])]),
        el('tbody', {}, (dados.tabelas || []).slice(0, 15).map(t => el('tr', {}, [
          el('td', {}, t.tabela),
          el('td', { style: 'text-align:right;font-family:var(--font-mono);color:var(--fg-muted)' },
            t.total_linhas_exato != null ? t.total_linhas_exato.toLocaleString('pt-BR') : '~' + t.total_linhas_estimado),
          el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmtBytes(t.tamanho_total_bytes)),
        ]))),
      ]),
    ]),
  );
}
function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/1024/1024).toFixed(2) + ' MB';
  return (b/1024/1024/1024).toFixed(2) + ' GB';
}

// ============================================================
// ALERTAS — regras configuradas, sem seletor
// ============================================================
async function renderAlertas(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  const { data, error } = await sb.from('custos_alertas').select('*').order('criado_em');
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  container.append(
    el('div', { class: 'finops-nota', style: 'margin-bottom:1rem' },
      '🎙 Corey Quinn: "Alerta sem ação é teatro. Cada alerta aqui dispara revisão do Squad FinOps."'),
    el('div', { class: 'finops-alertas-lista' },
      (data || []).map(a => el('div', { class: `finops-alerta-card finops-alerta-${a.ativo ? 'ativo' : 'inativo'}` }, [
        el('div', { class: 'finops-alerta-head' }, [
          el('div', { class: 'finops-alerta-titulo' }, a.titulo),
          el('div', { class: `finops-alerta-status finops-alerta-status-${a.ativo ? 'ativo' : 'inativo'}` },
            a.ativo ? 'Ativo' : 'Inativo'),
        ]),
        el('div', { class: 'finops-alerta-desc' }, a.descricao),
        el('div', { class: 'finops-alerta-meta' }, [
          el('span', { class: 'finops-alerta-tipo' }, a.tipo),
          a.alvo ? el('span', {}, ` · ${a.alvo}`) : null,
          a.limite_valor != null ? el('span', { style: 'color:var(--fg)' }, ` · limite US$ ${a.limite_valor}`) : null,
          a.limite_pct != null ? el('span', { style: 'color:var(--fg)' }, ` · limite ${a.limite_pct}%`) : null,
        ]),
        a.ultimo_disparo
          ? el('div', { class: 'finops-alerta-ultimo' }, `Último disparo: ${new Date(a.ultimo_disparo).toLocaleString('pt-BR')}`)
          : el('div', { class: 'finops-alerta-ultimo', style: 'opacity:.5' }, 'Nunca disparou'),
      ])),
    ),
  );
}

// ============================================================
// HISTORICO — serie diaria do periodo escolhido
// ============================================================
async function renderHistorico(container) {
  container.innerHTML = '';
  const sb = getSupabase();

  const periodo = renderSeletorPeriodo('historico', container, () => renderAba('historico', container));
  const { inicio, fim } = resolverDatas(periodo);

  const { data, error } = await sb.rpc('custos_serie', { p_inicio: inicio, p_fim: fim });
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  const max = Math.max(...(data || []).map(d => Number(d.total_usd)), 0.001);
  const totalPeriodo = (data || []).reduce((s, d) => s + Number(d.total_usd), 0);

  container.append(
    el('div', { class: 'finops-card-principal' }, [
      el('div', { class: 'finops-eyebrow' }, `${rotuloPeriodo(periodo)} · soma`),
      el('div', { class: 'finops-total-num' }, fmtUSD(totalPeriodo)),
      el('div', { class: 'finops-total-brl' }, fmtBRL(totalPeriodo)),
    ]),
    el('div', { class: 'finops-historico-grafico' },
      (data || []).map(d => {
        const altura = (Number(d.total_usd) / max) * 100;
        const dia = new Date(d.dia + 'T00:00:00').getDate();
        return el('div', { class: 'finops-bar-wrap', title: `${d.dia}: ${fmtUSD(d.total_usd)}` }, [
          el('div', { class: 'finops-bar', style: `height:${Math.max(2, altura)}%` }),
          el('div', { class: 'finops-bar-label' }, String(dia)),
        ]);
      })
    ),
    el('table', { class: 'finops-tabela', style: 'margin-top:1rem' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, 'Dia'),
        el('th', { style: 'text-align:right' }, 'Custo'),
        el('th', { style: 'text-align:right' }, 'Provedores'),
      ])]),
      el('tbody', {}, [...(data || [])].reverse().slice(0, 31).map(d => el('tr', {}, [
        el('td', {}, d.dia),
        el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmtUSD(d.total_usd)),
        el('td', { style: 'text-align:right;color:var(--fg-muted);font-size:.75rem' },
          Object.keys(d.por_provedor || {}).join(', ') || '—'),
      ]))),
    ]),
  );
}

// ============================================================
// POR AGENTE — custo agregado por agente lendo agente_execucoes
// ============================================================
async function renderPorAgente(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) return;

  const periodo = renderSeletorPeriodo('por-agente', container, () => renderAba('por-agente', container));
  const { inicio, fim } = resolverDatas(periodo);

  // Busca direto da tabela. Volume baixo nos primeiros meses.
  // Quando passar de 10k execuções viramos numa view materializada.
  const inicioISO = `${inicio}T00:00:00Z`;
  const fimISO = `${fim}T23:59:59Z`;
  const { data: execs, error } = await sb
    .from('agente_execucoes')
    .select('agente_id, custo_usd, latencia_ms, tokens_entrada, tokens_saida, tokens_cached, created_at')
    .gte('created_at', inicioISO)
    .lte('created_at', fimISO);

  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  if (!execs || execs.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' },
      'Nenhuma execução de agente neste período. Mande mensagem pro Chief em Agentes → Conversar.'));
    return;
  }

  // Agrega por agente_id
  const agg = new Map();
  for (const e of execs) {
    const a = agg.get(e.agente_id) || {
      agente_id: e.agente_id, qtd: 0, custo: 0, lat: 0, tokensIn: 0, tokensOut: 0, tokensCached: 0,
    };
    a.qtd += 1;
    a.custo += Number(e.custo_usd || 0);
    a.lat += Number(e.latencia_ms || 0);
    a.tokensIn += Number(e.tokens_entrada || 0);
    a.tokensOut += Number(e.tokens_saida || 0);
    a.tokensCached += Number(e.tokens_cached || 0);
    agg.set(e.agente_id, a);
  }

  // Resolve nomes
  const ids = [...agg.keys()];
  const { data: agentes } = await sb.from('agentes').select('id, slug, nome, avatar, modelo').in('id', ids);
  const mapAg = new Map((agentes || []).map(a => [a.id, a]));

  const linhas = [...agg.values()].sort((a, b) => b.custo - a.custo);
  const total = linhas.reduce((s, r) => s + r.custo, 0);
  const totalIn = linhas.reduce((s, r) => s + r.tokensIn, 0);
  const totalCached = linhas.reduce((s, r) => s + r.tokensCached, 0);
  const cacheGlobal = totalIn > 0 ? (totalCached / totalIn * 100) : 0;

  container.append(
    el('div', { class: 'finops-card-principal' }, [
      el('div', { class: 'finops-eyebrow' }, `Custo por agente · ${rotuloPeriodo(periodo)}`),
      el('div', { class: 'finops-total-num' }, fmtUSD(total)),
      el('div', { class: 'finops-total-brl', title: rotuloCotacao() }, fmtBRL(total)),
      el('div', { class: 'finops-projecao' },
        `📊 ${linhas.length} agente${linhas.length === 1 ? '' : 's'} · ${execs.length} execuç${execs.length === 1 ? 'ão' : 'ões'} · cache hit médio: ${cacheGlobal.toFixed(1)}%`),
    ]),
    el('table', { class: 'finops-tabela' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, 'Agente'),
        el('th', { style: 'text-align:right' }, 'Execuções'),
        el('th', { style: 'text-align:right' }, 'Tokens in/out'),
        el('th', { style: 'text-align:right' }, 'Cache'),
        el('th', { style: 'text-align:right' }, 'Latência média'),
        el('th', { style: 'text-align:right' }, 'Custo'),
        el('th', { style: 'text-align:right' }, '%'),
      ])]),
      el('tbody', {},
        linhas.map(r => {
          const ag = mapAg.get(r.agente_id);
          const cachePct = r.tokensIn > 0 ? (r.tokensCached / r.tokensIn * 100) : 0;
          const latMedia = r.qtd > 0 ? r.lat / r.qtd / 1000 : 0;
          const pctTotal = total > 0 ? (r.custo / total * 100) : 0;
          return el('tr', {}, [
            el('td', {}, [
              el('span', { class: 'mini-avatar' }, ag?.avatar || '?'),
              ' ',
              el('strong', {}, ag?.nome || ag?.slug || r.agente_id.slice(0, 8)),
              ag?.modelo
                ? el('span', { style: 'color:var(--fg-muted);margin-left:.5rem;font-size:.85em' }, ag.modelo.replace('openai:', ''))
                : null,
            ].filter(Boolean)),
            el('td', { style: 'text-align:right;color:var(--fg-muted)' }, r.qtd.toLocaleString('pt-BR')),
            el('td', { style: 'text-align:right;font-family:var(--font-mono);color:var(--fg-muted)' },
              `${r.tokensIn.toLocaleString('pt-BR')} / ${r.tokensOut.toLocaleString('pt-BR')}`),
            el('td', { style: 'text-align:right' },
              cachePct > 0
                ? el('span', { class: 'finops-pct-badge', style: 'background:rgba(34,197,94,.15);color:#22c55e' },
                    cachePct.toFixed(0) + '%')
                : '—'),
            el('td', { style: 'text-align:right;color:var(--fg-muted)' },
              latMedia > 0 ? `${latMedia.toFixed(1)}s` : '—'),
            el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmtUSD(r.custo)),
            el('td', { style: 'text-align:right' },
              [el('span', { class: 'finops-pct-badge' }, pctTotal.toFixed(1) + '%')]),
          ]);
        })
      ),
    ]),
    el('div', { class: 'finops-nota' },
      'Custo lido direto de pinguim.agente_execucoes (registro por chamada LLM, com desconto de prompt cache aplicado).'),
  );
}

// ============================================================
// Acoes
// ============================================================
async function atualizarAgora() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/auditar-custos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dias_atras: 1 }),
  });
  await renderFinOps();
}
