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
const fmtUSD = (v) => 'US$ ' + Number(v || 0).toFixed(4);
const fmtBRL = (v) => 'R$ ' + (Number(v || 0) * 5.1).toFixed(3);

export async function renderFinOps() {
  const page = document.getElementById('page-finops');
  page.innerHTML = '';

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
      tab('banco', 'Banco'),
      tab('alertas', 'Alertas'),
      tab('historico', 'Histórico 30d'),
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

  const { data, error } = await sb.rpc('custo_mes_corrente');
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }
  const m = data[0];
  const total = Number(m.total_usd);
  const projecao = Number(m.projecao_fim_mes_usd);
  const porProvedor = m.por_provedor || {};
  const porOperacao = m.por_operacao || {};

  // Card principal — total do mes + projecao
  const cardPrincipal = el('div', { class: 'finops-card-principal' }, [
    el('div', { class: 'finops-eyebrow' }, `Mês corrente · dia ${m.dias_corridos} de ${m.dias_no_mes}`),
    el('div', { class: 'finops-total-num' }, fmtUSD(total)),
    el('div', { class: 'finops-total-brl' }, fmtBRL(total) + ' (~R$)'),
    el('div', { class: 'finops-projecao' }, [
      el('span', {}, '📈 Projeção fim de mês: '),
      el('strong', {}, fmtUSD(projecao)),
      el('span', {}, ` (${fmtBRL(projecao)})`),
    ]),
  ]);

  // Cards por provedor
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

  // Tabela por operação
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
  const { data, error } = await sb.rpc('tokens_ia_mes');
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }
  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' },
      'Sem registros de OpenAI/Anthropic neste mês ainda.'));
    return;
  }
  const total = data.reduce((s, r) => s + Number(r.total_usd), 0);

  container.append(
    el('div', { class: 'finops-card-principal' }, [
      el('div', { class: 'finops-eyebrow' }, 'Tokens IA · mês corrente'),
      el('div', { class: 'finops-total-num' }, fmtUSD(total)),
      el('div', { class: 'finops-total-brl' }, fmtBRL(total) + ' (~R$)'),
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
// BANCO
// ============================================================
async function renderBanco(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  // Reusa a função raio-x-banco já existente
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
// ALERTAS
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
// HISTORICO 30 DIAS
// ============================================================
async function renderHistorico(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  const { data, error } = await sb.rpc('custos_30_dias');
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  const max = Math.max(...(data || []).map(d => Number(d.total_usd)), 0.001);
  const total30 = (data || []).reduce((s, d) => s + Number(d.total_usd), 0);

  container.append(
    el('div', { class: 'finops-card-principal' }, [
      el('div', { class: 'finops-eyebrow' }, 'Últimos 30 dias · soma'),
      el('div', { class: 'finops-total-num' }, fmtUSD(total30)),
      el('div', { class: 'finops-total-brl' }, fmtBRL(total30)),
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
      el('tbody', {}, [...(data || [])].reverse().slice(0, 15).map(d => el('tr', {}, [
        el('td', {}, d.dia),
        el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmtUSD(d.total_usd)),
        el('td', { style: 'text-align:right;color:var(--fg-muted);font-size:.75rem' },
          Object.keys(d.por_provedor || {}).join(', ') || '—'),
      ]))),
    ]),
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
