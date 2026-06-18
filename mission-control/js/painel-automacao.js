/* Painel de Automação — V1 (2026-06-18)
 *
 * Visão TRANSVERSAL aos 10 cérebros: responde rápido a
 *   "como tá tudo?", "o que rodou hoje?", "o que vai rodar?",
 *   "o que tá parado?", "preciso responder reunião em 30s".
 *
 * Lê 5 RPCs SECURITY DEFINER do schema-023:
 *   - painel_automacao_kpis()
 *   - painel_automacao_execucoes_recentes(horas)
 *   - painel_automacao_proximos_crons()
 *   - painel_automacao_alertas(dias)
 *   - painel_automacao_por_cerebro()
 */

import { getSupabase } from './sb-client.js?v=20260617b';

// ============================================================
// Helpers DOM
// ============================================================
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    if (c instanceof Node) n.appendChild(c);
    else n.appendChild(document.createTextNode(String(c)));
  });
  return n;
};

function fmtRelativo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  const dias = Math.floor(h / 24);
  if (h < 1) {
    const min = Math.max(1, Math.floor((Date.now() - d.getTime()) / 60000));
    return `há ${min}min`;
  }
  if (h < 24) return `há ${h}h`;
  if (dias < 30) return `há ${dias}d`;
  return `há ${Math.floor(dias/30)} meses`;
}

function fmtHoraBR(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit',
  });
}

// Converte expressão cron (formato UTC) pra descrição humana BRT
function cronParaHumano(cronExpr, descricao) {
  if (descricao) return descricao;
  if (!cronExpr) return '—';
  // Simplificado: só mostra a expressão crua se não houver descrição
  return cronExpr;
}

// ============================================================
// Estado
// ============================================================
let _cache = null;
let _viewMode = 'lista';     // 'lista' | 'calendario'
let _filtroCerebro = 'todos';
let _filtroTipo = 'todos';

// ============================================================
// Entry point
// ============================================================
export async function renderPainelAutomacao() {
  const page = document.getElementById('page-painel-automacao');
  if (!page) return;

  page.innerHTML = `
    <div style="padding:1.5rem;color:var(--fg-muted)">
      <div style="font-size:1rem;margin-bottom:.5rem">🎛 Painel de Automação</div>
      <div>Carregando estado dos 10 cérebros…</div>
    </div>`;

  const sb = getSupabase();
  try {
    // Carrega tudo em paralelo
    const [kpis, recentes, proximos, alertas, porCerebro] = await Promise.all([
      sb.rpc('painel_automacao_kpis').then(r => r.data?.[0] || {}),
      sb.rpc('painel_automacao_execucoes_recentes', { p_horas: 24 }).then(r => r.data || []),
      sb.rpc('painel_automacao_proximos_crons').then(r => r.data || []),
      sb.rpc('painel_automacao_alertas', { p_dias: 7 }).then(r => r.data || []),
      sb.rpc('painel_automacao_por_cerebro').then(r => r.data || []),
    ]);

    _cache = { kpis, recentes, proximos, alertas, porCerebro };
    renderConteudo(page);
  } catch (e) {
    page.innerHTML = `<div style="padding:2rem;color:var(--status-alerta)">Erro carregando: ${e.message}</div>`;
  }
}

function renderConteudo(page) {
  const { kpis, recentes, proximos, alertas, porCerebro } = _cache;
  page.innerHTML = '';
  page.append(renderHeader());
  page.append(renderKpis(kpis));
  if (alertas.length > 0) page.append(renderAlertas(alertas));
  page.append(renderMiniGrid(porCerebro));
  page.append(renderTabs());
  page.append(renderTabContent(recentes, proximos));
}

// ============================================================
// Componentes
// ============================================================
function renderHeader() {
  return el('div', { style: 'padding:1.5rem 1.5rem .5rem' }, [
    el('h1', { style: 'margin:0;font-size:1.5rem;display:flex;align-items:center;gap:.5rem' }, '🎛 Painel de Automação'),
    el('p', { style: 'margin:.25rem 0 0;color:var(--fg-muted);font-size:.875rem' },
      'Visão transversal aos 10 cérebros — responde "como tá tudo agora?" sem precisar abrir um cérebro por vez.'),
    el('div', { style: 'margin-top:.75rem;display:flex;gap:.5rem' }, [
      el('button', {
        class: 'btn',
        style: 'font-size:.8125rem;padding:.4rem .75rem',
        onclick: () => renderPainelAutomacao(),
      }, '↻ Atualizar'),
    ]),
  ]);
}

function renderKpis(k) {
  const cards = [
    { num: k.total_executou_24h || 0, label: 'rodaram nas últimas 24h', cor: '#22C55E', emoji: '✓' },
    { num: k.total_rodando || 0, label: 'automatizadas (rodando)', cor: '#3B82F6', emoji: '🟢', sub: `de ${k.total_categorias_aplicaveis || 0} categorias` },
    { num: k.total_manuais || 0, label: 'manuais (você controla)', cor: '#F59E0B', emoji: '✋' },
    { num: k.total_falhou_24h || 0, label: 'falharam nas últimas 24h', cor: k.total_falhou_24h > 0 ? '#EF4444' : '#94A3B8', emoji: '✗' },
    { num: k.total_defasadas_7d || 0, label: 'defasadas (sem update >7d)', cor: k.total_defasadas_7d > 0 ? '#F59E0B' : '#94A3B8', emoji: '⚠' },
  ];
  const wrap = el('div', {
    style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem;padding:0 1.5rem 1rem',
  });
  for (const c of cards) {
    wrap.append(el('div', {
      style: `background:var(--bg-card,#0F172A);border:1px solid var(--border-subtle,#1E293B);border-left:4px solid ${c.cor};border-radius:8px;padding:1rem`,
    }, [
      el('div', { style: `font-size:1.875rem;font-weight:700;color:${c.cor};line-height:1` }, `${c.emoji} ${c.num}`),
      el('div', { style: 'font-size:.8125rem;color:var(--fg-muted);margin-top:.4rem' }, c.label),
      c.sub ? el('div', { style: 'font-size:.6875rem;color:var(--fg-subtle,#64748B);margin-top:.15rem' }, c.sub) : null,
    ]));
  }
  return wrap;
}

function renderAlertas(alertas) {
  const wrap = el('div', { style: 'padding:0 1.5rem 1rem' });
  const titulos = {
    cron_falhou: { label: '❌ Falhou no último run', cor: '#EF4444' },
    rodando_defasada: { label: '⚠ Rodando mas defasada >7d', cor: '#F59E0B' },
    manual_sem_update: { label: '✋ Manual sem update', cor: '#A78BFA' },
  };
  const porTipo = new Map();
  for (const a of alertas) {
    if (!porTipo.has(a.tipo_alerta)) porTipo.set(a.tipo_alerta, []);
    porTipo.get(a.tipo_alerta).push(a);
  }
  // Só mostra se houver coisa séria (cron_falhou ou defasadas)
  const totalSerio = (porTipo.get('cron_falhou')?.length || 0) + (porTipo.get('rodando_defasada')?.length || 0);
  if (totalSerio === 0 && (porTipo.get('manual_sem_update')?.length || 0) === 0) return wrap;

  const box = el('div', {
    style: 'background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:1rem',
  });
  box.append(el('div', { style: 'font-weight:600;margin-bottom:.5rem;color:#EF4444' }, '🔔 Atenção'));

  for (const [tipo, lista] of porTipo) {
    const meta = titulos[tipo] || { label: tipo, cor: '#64748B' };
    box.append(el('div', { style: `font-size:.8125rem;color:${meta.cor};font-weight:600;margin:.5rem 0 .25rem` },
      `${meta.label} (${lista.length})`));
    for (const a of lista.slice(0, 5)) {
      box.append(el('div', {
        style: 'font-size:.8125rem;padding:.25rem .5rem;color:var(--fg-muted)',
      }, `• ${a.produto_nome} — ${a.categoria_emoji} ${a.categoria_nome} — ${a.dias_desde_ultima} dias`));
    }
    if (lista.length > 5) {
      box.append(el('div', { style: 'font-size:.75rem;color:var(--fg-subtle);padding-left:.5rem' },
        `+ ${lista.length - 5} outros…`));
    }
  }
  wrap.append(box);
  return wrap;
}

function renderMiniGrid(porCerebro) {
  const wrap = el('div', { style: 'padding:0 1.5rem 1.25rem' });
  wrap.append(el('h3', { style: 'font-size:.9375rem;margin:0 0 .5rem;color:var(--fg)' },
    'Resumo por cérebro'));

  const grid = el('div', {
    style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.5rem',
  });

  for (const c of porCerebro) {
    const temAlgo = c.rodando > 0 || c.manuais > 0;
    const borda = c.defasadas > 0 ? '#EF4444' : (c.rodando > 0 ? '#22C55E' : '#94A3B8');
    const card = el('div', {
      style: `background:var(--bg-card,#0F172A);border:1px solid var(--border-subtle,#1E293B);border-top:3px solid ${borda};border-radius:6px;padding:.75rem;cursor:pointer;transition:transform .15s`,
      onmouseenter: (e) => e.currentTarget.style.transform = 'translateY(-2px)',
      onmouseleave: (e) => e.currentTarget.style.transform = '',
      onclick: () => {
        // Navega pra Plano de Cérebros e abre esse cérebro
        document.querySelector('.nav-item[data-page="plano-cerebros"]')?.click();
      },
    });
    card.append(el('div', { style: 'font-weight:600;font-size:.875rem;margin-bottom:.5rem' }, c.produto_nome));
    card.append(el('div', { style: 'display:flex;gap:.5rem;font-size:.75rem;flex-wrap:wrap' }, [
      el('span', { style: 'color:#22C55E' }, `🟢 ${c.rodando}`),
      el('span', { style: 'color:#F59E0B' }, `✋ ${c.manuais}`),
      el('span', { style: 'color:#94A3B8' }, `⚫ ${c.sem_coleta}`),
      c.defasadas > 0 ? el('span', { style: 'color:#EF4444;font-weight:600' }, `⚠ ${c.defasadas}d`) : null,
    ]));
    card.append(el('div', { style: 'font-size:.75rem;color:var(--fg-subtle,#64748B);margin-top:.4rem' },
      `${c.total_fontes || 0} fontes · última ${fmtRelativo(c.ultima_atividade)}`));
    grid.append(card);
  }
  wrap.append(grid);
  return wrap;
}

function renderTabs() {
  const tabs = el('div', { style: 'padding:0 1.5rem;display:flex;gap:.25rem;border-bottom:1px solid var(--border-subtle,#1E293B);margin-bottom:1rem' });
  const tabBtn = (id, label) => el('button', {
    style: `padding:.5rem .9rem;background:transparent;border:none;border-bottom:2px solid ${_viewMode === id ? 'var(--brand,#3B82F6)' : 'transparent'};color:${_viewMode === id ? 'var(--fg)' : 'var(--fg-muted)'};cursor:pointer;font-size:.875rem;font-weight:${_viewMode === id ? 600 : 400}`,
    onclick: () => {
      _viewMode = id;
      renderConteudo(document.getElementById('page-painel-automacao'));
    },
  }, label);
  tabs.append(
    tabBtn('lista', '📋 Hoje + Próximos'),
    tabBtn('calendario', '📅 Calendário semanal'),
  );
  return tabs;
}

function renderTabContent(recentes, proximos) {
  if (_viewMode === 'calendario') return renderCalendario(proximos);
  return renderListaCronograma(recentes, proximos);
}

function renderListaCronograma(recentes, proximos) {
  const wrap = el('div', { style: 'padding:0 1.5rem 2rem;display:grid;grid-template-columns:1fr 1fr;gap:1rem' });

  // RODOU HOJE
  const rodouCol = el('div');
  rodouCol.append(el('h3', { style: 'font-size:.9375rem;margin:0 0 .5rem' },
    `✓ Rodou nas últimas 24h (${recentes.length})`));
  if (recentes.length === 0) {
    rodouCol.append(el('div', { style: 'padding:1rem;color:var(--fg-muted);font-size:.875rem' }, 'Nada nas últimas 24h.'));
  } else {
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:.4rem' });
    for (const r of recentes) {
      const cor = r.ultimo_status_run === 'falha' ? '#EF4444' : (r.ultimo_status_run === 'ok' ? '#22C55E' : '#94A3B8');
      list.append(el('div', {
        style: `background:var(--bg-card,#0F172A);border:1px solid var(--border-subtle,#1E293B);border-left:3px solid ${cor};border-radius:6px;padding:.6rem .75rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;font-size:.8125rem`,
      }, [
        el('div', { style: 'min-width:0;flex:1' }, [
          el('div', { style: 'font-weight:600' }, `${r.categoria_emoji || '📦'} ${r.categoria_nome || r.categoria_slug}`),
          el('div', { style: 'color:var(--fg-muted);font-size:.75rem;margin-top:.15rem' },
            `${r.produto_nome} · trigger ${r.trigger_tipo}`),
        ]),
        el('div', { style: 'text-align:right;font-size:.75rem' }, [
          el('div', { style: `color:${cor};font-weight:600` }, r.ultimo_status_run || '—'),
          el('div', { style: 'color:var(--fg-muted)' }, fmtRelativo(r.ultima_execucao)),
        ]),
      ]));
    }
    rodouCol.append(list);
  }

  // VAI RODAR
  const vaiCol = el('div');
  vaiCol.append(el('h3', { style: 'font-size:.9375rem;margin:0 0 .5rem' },
    `⏰ Agendamentos ativos (${proximos.length})`));
  if (proximos.length === 0) {
    vaiCol.append(el('div', { style: 'padding:1rem;color:var(--fg-muted);font-size:.875rem' }, 'Nenhum cron ativo.'));
  } else {
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:.4rem' });
    for (const p of proximos) {
      const corOrigem = p.origem === 'relatorio' ? '#A78BFA' : '#3B82F6';
      list.append(el('div', {
        style: `background:var(--bg-card,#0F172A);border:1px solid var(--border-subtle,#1E293B);border-left:3px solid ${corOrigem};border-radius:6px;padding:.6rem .75rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;font-size:.8125rem`,
      }, [
        el('div', { style: 'min-width:0;flex:1' }, [
          el('div', { style: 'font-weight:600' }, p.nome),
          el('div', { style: 'color:var(--fg-muted);font-size:.75rem;margin-top:.15rem' },
            `${p.origem === 'relatorio' ? '📊 Relatório' : `🧠 ${p.produto_nome || '—'}`} · ${cronParaHumano(p.cron_expr, p.cron_descricao)}`),
        ]),
        el('div', { style: 'text-align:right;font-size:.75rem;color:var(--fg-muted)' },
          p.ultima_execucao ? `última ${fmtRelativo(p.ultima_execucao)}` : 'sem rodar'),
      ]));
    }
    vaiCol.append(list);
  }

  wrap.append(rodouCol, vaiCol);

  // Em mobile, vira 1 coluna
  if (window.matchMedia('(max-width: 768px)').matches) {
    wrap.style.gridTemplateColumns = '1fr';
  }
  return wrap;
}

function renderCalendario(proximos) {
  const wrap = el('div', { style: 'padding:0 1.5rem 2rem' });

  // Constrói dias da semana (segunda a domingo)
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=dom
  const offsetSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje); segunda.setDate(hoje.getDate() + offsetSegunda); segunda.setHours(0,0,0,0);

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(segunda); d.setDate(segunda.getDate() + i);
    dias.push({
      data: d,
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      ehHoje: d.toDateString() === hoje.toDateString(),
    });
  }

  // Pra cada cron, calcula em quais dias da semana ele rodará (com base no cron_expr)
  const porDia = dias.map(() => []);
  for (const p of proximos) {
    const diasCron = _diasDaSemanaDeCron(p.cron_expr);
    for (let i = 0; i < 7; i++) {
      const diaJs = dias[i].data.getDay(); // 0=dom
      if (diasCron.has(diaJs)) {
        const horaBrt = _horaBrtDeCron(p.cron_expr);
        porDia[i].push({ ...p, horaBrt });
      }
    }
  }

  const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:.4rem' });
  for (let i = 0; i < 7; i++) {
    const dia = dias[i];
    const col = el('div', {
      style: `background:var(--bg-card,#0F172A);border:1px solid var(--border-subtle,#1E293B);${dia.ehHoje ? 'border-top:3px solid #3B82F6;' : ''}border-radius:6px;padding:.5rem;min-height:200px`,
    });
    col.append(el('div', { style: `font-size:.75rem;font-weight:600;margin-bottom:.5rem;${dia.ehHoje ? 'color:#3B82F6' : 'color:var(--fg-muted)'}` },
      `${dia.label}${dia.ehHoje ? ' • hoje' : ''}`));

    const itens = porDia[i].sort((a, b) => (a.horaBrt || '').localeCompare(b.horaBrt || ''));
    if (itens.length === 0) {
      col.append(el('div', { style: 'font-size:.75rem;color:var(--fg-subtle,#64748B);font-style:italic' }, '—'));
    } else {
      for (const item of itens) {
        const corOrigem = item.origem === 'relatorio' ? '#A78BFA' : '#3B82F6';
        col.append(el('div', {
          style: `background:rgba(255,255,255,0.03);border-left:2px solid ${corOrigem};padding:.4rem .5rem;border-radius:4px;font-size:.6875rem;margin-bottom:.25rem`,
          title: `${item.nome} — ${item.cron_descricao || item.cron_expr}`,
        }, [
          el('div', { style: 'font-weight:600;color:var(--fg)' }, item.horaBrt || '—'),
          el('div', { style: 'color:var(--fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, item.nome),
        ]));
      }
    }
    grid.append(col);
  }
  wrap.append(grid);
  wrap.append(el('div', { style: 'margin-top:.75rem;font-size:.75rem;color:var(--fg-subtle,#64748B)' },
    'ℹ Calendário considera dias da semana do cron. Horário convertido UTC → BRT (-3h).'));
  return wrap;
}

// ============================================================
// Parser cron simplificado: extrai dia-da-semana e hora BRT
// ============================================================
function _diasDaSemanaDeCron(cronExpr) {
  if (!cronExpr) return new Set();
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return new Set();
  const dow = parts[4]; // dia-da-semana
  if (dow === '*') return new Set([0,1,2,3,4,5,6]);
  const dias = new Set();
  for (const tok of dow.split(',')) {
    if (tok.includes('-')) {
      const [a, b] = tok.split('-').map(Number);
      for (let i = a; i <= b; i++) dias.add(i % 7);
    } else if (!isNaN(parseInt(tok, 10))) {
      dias.add(parseInt(tok, 10) % 7);
    }
  }
  return dias;
}

function _horaBrtDeCron(cronExpr) {
  if (!cronExpr) return null;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const minUtc = parts[0];
  const hourUtc = parts[1];
  // Só funciona pra * único ou número (não suporta */N, lista, range)
  if (!/^\d+$/.test(minUtc) || !/^\d+$/.test(hourUtc)) return cronExpr.slice(0, 12);
  let h = (parseInt(hourUtc, 10) - 3 + 24) % 24;
  return `${String(h).padStart(2,'0')}:${minUtc.padStart(2,'0')}`;
}
