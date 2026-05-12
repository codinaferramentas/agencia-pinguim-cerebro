/* Oficina de Relatórios — V2.15 (Andre 2026-05-12)
   Painel pra Codina ver tickets pendentes da Oficina + catalogo de
   relatorios prontos. Le direto de pinguim.oficina_relatorios + .oficina_catalogo
   via Supabase (RLS authenticated). Atualizacoes (marcar entregue etc) tambem
   via Supabase direto — mesmo padrao de cerebros/skills/finops.
*/

import { getSupabase } from './sb-client.js?v=20260421p';

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

const STATUS_LABEL = {
  coletando_requisitos: 'Coletando requisitos',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado_pra_construir: 'Aprovado pra construir',
  em_construcao: 'Em construção',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const STATUS_COR = {
  coletando_requisitos: '#E85C00',
  aguardando_aprovacao: '#F59E0B',
  aprovado_pra_construir: '#A855F7',
  em_construcao: '#3B82F6',
  entregue: '#22C55E',
  cancelado: '#64748B',
};

const PRIO_COR = { urgente: '#EF4444', alta: '#F59E0B', normal: '#64748B', baixa: '#94A3B8' };

function fmtData(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return s; }
}

function fmtDataCurta(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
  catch { return s; }
}

export async function renderOficina() {
  const page = document.getElementById('page-oficina');
  if (!page) return;
  page.innerHTML = '';

  const sb = getSupabase();
  if (!sb) {
    page.innerHTML = '<div style="padding:3rem;color:var(--fg-muted)">Sem conexão com o banco.</div>';
    return;
  }

  const wrap = el('div', { class: 'oficina-wrap', style: 'max-width:1280px;margin:0 auto;padding:2rem 2rem 4rem;' });
  wrap.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, '🛠 Oficina de Relatórios'),
    el('p', { class: 'page-subtitle' },
      'Quando o agente detecta um pedido de relatório complexo, ele abre um ticket aqui em vez de tentar executar em runtime. Você constrói a Skill, vincula ao ticket e marca entregue. Próxima vez que pedirem, sai em segundos.'
    ),
  ]));
  page.appendChild(wrap);

  // Loading inicial
  const containerListas = el('div', { id: 'oficina-listas' });
  containerListas.appendChild(el('div', { style: 'padding:2rem;color:var(--fg-muted);text-align:center' }, 'Carregando tickets e catálogo…'));
  wrap.appendChild(containerListas);

  // Carrega em paralelo
  const [tickets, catalogo] = await Promise.all([
    sb.from('oficina_relatorios')
      .select('id, cliente_id, pedido_original, canal_origem, briefing_estruturado, anexos, status, skill_slug_alvo, prioridade, criado_em, atualizado_em, aprovado_em, entregue_em, notas_codina')
      .order('criado_em', { ascending: false })
      .limit(100),
    sb.from('oficina_catalogo')
      .select('slug, nome, descricao, como_invocar, exemplos_pedido, status')
      .order('slug'),
  ]);

  if (tickets.error) {
    containerListas.innerHTML = `<div style="padding:2rem;color:var(--danger)">Erro lendo tickets: ${tickets.error.message}</div>`;
    return;
  }
  if (catalogo.error) {
    containerListas.innerHTML = `<div style="padding:2rem;color:var(--danger)">Erro lendo catálogo: ${catalogo.error.message}</div>`;
    return;
  }

  const dataTickets = tickets.data || [];
  const dataCatalogo = catalogo.data || [];

  // Stats no topo
  const pendentes = dataTickets.filter(t => ['coletando_requisitos', 'aguardando_aprovacao', 'aprovado_pra_construir', 'em_construcao'].includes(t.status));
  const entregues = dataTickets.filter(t => t.status === 'entregue');
  const cancelados = dataTickets.filter(t => t.status === 'cancelado');

  containerListas.innerHTML = '';
  containerListas.appendChild(renderStatsBar({ pendentes: pendentes.length, entregues: entregues.length, catalogo: dataCatalogo.length }));
  containerListas.appendChild(renderSectionTickets('Pendentes', pendentes, sb, dataCatalogo, () => renderOficina()));
  containerListas.appendChild(renderSectionTickets('Entregues recentes', entregues.slice(0, 10), sb, dataCatalogo, () => renderOficina(), { compacto: true }));
  containerListas.appendChild(renderSectionCatalogo(dataCatalogo));
  if (cancelados.length) {
    containerListas.appendChild(renderSectionTickets('Cancelados (histórico)', cancelados.slice(0, 5), sb, dataCatalogo, () => renderOficina(), { compacto: true }));
  }
}

function renderStatsBar({ pendentes, entregues, catalogo }) {
  return el('div', { class: 'oficina-stats', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem;' }, [
    statCard('🛠', 'Pendentes', pendentes, '#E85C00'),
    statCard('✅', 'Entregues', entregues, '#22C55E'),
    statCard('📚', 'Relatórios prontos', catalogo, '#3B82F6'),
  ]);
}

function statCard(emoji, label, valor, cor) {
  return el('div', { class: 'card', style: `border:1px solid var(--border);background:var(--bg2);border-radius:12px;padding:1.25rem;border-left:3px solid ${cor};` }, [
    el('div', { style: 'font-size:.7rem;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:.4rem;' }, `${emoji} ${label}`),
    el('div', { style: 'font-size:2rem;font-weight:700;color:var(--fg)' }, String(valor)),
  ]);
}

function renderSectionTickets(titulo, tickets, sb, catalogo, refresh, { compacto = false } = {}) {
  const sec = el('section', { class: 'oficina-section', style: 'margin-bottom:2rem;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.5rem;' }, [
    el('h2', { style: 'font-size:.95rem;text-transform:uppercase;letter-spacing:.06em;color:var(--fg);font-weight:600;margin-bottom:1.25rem;' }, [
      titulo,
      el('span', { style: 'margin-left:.5rem;padding:.15rem .5rem;background:var(--bg);border-radius:6px;color:var(--fg-muted);font-size:.75rem;font-weight:500;' }, String(tickets.length)),
    ]),
  ]);
  if (tickets.length === 0) {
    sec.appendChild(el('div', { style: 'padding:1.5rem;color:var(--fg-muted);text-align:center;font-style:italic;' }, 'Nenhum ticket aqui.'));
    return sec;
  }
  const grid = el('div', { style: 'display:flex;flex-direction:column;gap:.75rem;' });
  tickets.forEach(t => grid.appendChild(cardTicket(t, sb, catalogo, refresh, { compacto })));
  sec.appendChild(grid);
  return sec;
}

function cardTicket(t, sb, catalogo, refresh, { compacto = false } = {}) {
  const corStatus = STATUS_COR[t.status] || '#64748B';
  const corPrio = PRIO_COR[t.prioridade] || '#64748B';
  const briefingKeys = Object.keys(t.briefing_estruturado || {});
  const numAnexos = (t.anexos || []).length;
  const pedidoCurto = (t.pedido_original || '').length > 200 ? (t.pedido_original || '').slice(0, 200) + '…' : (t.pedido_original || '');

  const card = el('div', {
    style: `background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:1rem 1.25rem;border-left:3px solid ${corStatus};`,
    'data-ticket-id': t.id,
  });

  // Linha 1: status + prioridade + id
  const linhaTopo = el('div', { style: 'display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap;' }, [
    el('span', { style: `background:${corStatus};color:white;font-size:.65rem;font-weight:700;padding:.2rem .55rem;border-radius:4px;text-transform:uppercase;letter-spacing:.04em;` }, STATUS_LABEL[t.status] || t.status),
    el('span', { style: `background:${corPrio}22;color:${corPrio};font-size:.65rem;font-weight:600;padding:.2rem .5rem;border-radius:4px;text-transform:uppercase;` }, t.prioridade || 'normal'),
    el('span', { style: 'flex:1' }, ''),
    el('code', { style: 'font-size:.7rem;color:var(--fg-muted);' }, t.id.slice(0, 8)),
  ]);
  card.appendChild(linhaTopo);

  // Pedido original
  card.appendChild(el('div', { style: 'color:var(--fg);font-weight:500;line-height:1.45;margin-bottom:.5rem;' }, pedidoCurto));

  // Meta
  const meta = el('div', { style: 'display:flex;gap:1rem;flex-wrap:wrap;font-size:.75rem;color:var(--fg-muted);margin-bottom:.5rem;' });
  meta.appendChild(el('span', {}, `📨 ${t.canal_origem || '—'}`));
  meta.appendChild(el('span', {}, `🕐 ${fmtData(t.criado_em)}`));
  if (briefingKeys.length > 0) {
    meta.appendChild(el('span', {}, `📋 briefing: ${briefingKeys.length} campo${briefingKeys.length > 1 ? 's' : ''}`));
  }
  if (numAnexos > 0) {
    meta.appendChild(el('span', {}, `📎 ${numAnexos} anexo${numAnexos > 1 ? 's' : ''}`));
  }
  if (t.skill_slug_alvo) {
    meta.appendChild(el('span', {}, `🔗 ${t.skill_slug_alvo}`));
  }
  card.appendChild(meta);

  if (compacto) return card;

  // Briefing estruturado (jsonb expandido)
  if (briefingKeys.length > 0) {
    const briefingBox = el('details', { style: 'margin-top:.5rem;background:var(--bg2);border-radius:6px;padding:.5rem .75rem;' });
    briefingBox.appendChild(el('summary', { style: 'cursor:pointer;font-size:.75rem;color:var(--fg-muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;' }, `Briefing (${briefingKeys.length} campos)`));
    const ul = el('ul', { style: 'margin:.5rem 0 0;padding-left:1.25rem;font-size:.82rem;color:var(--fg);' });
    briefingKeys.forEach(k => {
      const v = t.briefing_estruturado[k];
      const vStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      ul.appendChild(el('li', { style: 'margin:.2rem 0;' }, [el('strong', {}, `${k}: `), vStr]));
    });
    briefingBox.appendChild(ul);
    card.appendChild(briefingBox);
  }

  // Anexos
  if (numAnexos > 0) {
    const anexosBox = el('details', { style: 'margin-top:.5rem;background:var(--bg2);border-radius:6px;padding:.5rem .75rem;' });
    anexosBox.appendChild(el('summary', { style: 'cursor:pointer;font-size:.75rem;color:var(--fg-muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;' }, `Anexos (${numAnexos})`));
    const ul = el('ul', { style: 'margin:.5rem 0 0;padding-left:1.25rem;font-size:.82rem;color:var(--fg);' });
    (t.anexos || []).forEach(a => {
      const previa = String(a.conteudo || '').slice(0, 150);
      ul.appendChild(el('li', { style: 'margin:.3rem 0;' }, [
        el('strong', {}, `[${a.tipo}] `),
        a.descricao ? `${a.descricao} — ` : '',
        el('code', { style: 'font-size:.7rem;color:var(--fg-muted);' }, previa),
      ]));
    });
    anexosBox.appendChild(ul);
    card.appendChild(anexosBox);
  }

  // Notas Codina
  if (t.notas_codina) {
    card.appendChild(el('div', { style: 'margin-top:.5rem;padding:.5rem .75rem;background:var(--bg2);border-radius:6px;font-size:.8rem;color:var(--fg-muted);font-style:italic;' }, `📝 ${t.notas_codina}`));
  }

  // Ações
  const acoes = el('div', { style: 'display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap;' });
  if (t.status !== 'entregue' && t.status !== 'cancelado') {
    acoes.appendChild(el('button', {
      class: 'btn btn-primary',
      style: 'padding:.4rem .85rem;font-size:.78rem;',
      onclick: () => abrirModalEntregar(t, sb, catalogo, refresh),
    }, '✅ Marcar entregue'));

    if (t.status === 'coletando_requisitos' || t.status === 'aguardando_aprovacao') {
      acoes.appendChild(el('button', {
        class: 'btn',
        style: 'padding:.4rem .85rem;font-size:.78rem;background:#A855F7;color:white;border:none;',
        onclick: () => mudarStatus(t.id, 'aprovado_pra_construir', sb, refresh),
      }, '🟣 Aprovar p/ construir'));
    }
    if (t.status === 'aprovado_pra_construir') {
      acoes.appendChild(el('button', {
        class: 'btn',
        style: 'padding:.4rem .85rem;font-size:.78rem;background:#3B82F6;color:white;border:none;',
        onclick: () => mudarStatus(t.id, 'em_construcao', sb, refresh),
      }, '🔵 Em construção'));
    }
    acoes.appendChild(el('button', {
      class: 'btn btn-ghost',
      style: 'padding:.4rem .85rem;font-size:.78rem;color:var(--danger);',
      onclick: () => cancelarTicket(t.id, sb, refresh),
    }, 'Cancelar'));
  } else if (t.status === 'entregue') {
    acoes.appendChild(el('span', { style: `color:${STATUS_COR.entregue};font-size:.78rem;font-weight:600;` }, `✓ Entregue em ${fmtData(t.entregue_em)}`));
  }
  card.appendChild(acoes);

  return card;
}

function renderSectionCatalogo(catalogo) {
  const sec = el('section', { class: 'oficina-section', style: 'margin-bottom:2rem;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.5rem;' }, [
    el('h2', { style: 'font-size:.95rem;text-transform:uppercase;letter-spacing:.06em;color:var(--fg);font-weight:600;margin-bottom:1.25rem;' }, [
      'Catálogo de relatórios prontos',
      el('span', { style: 'margin-left:.5rem;padding:.15rem .5rem;background:var(--bg);border-radius:6px;color:var(--fg-muted);font-size:.75rem;font-weight:500;' }, String(catalogo.length)),
    ]),
    el('p', { style: 'font-size:.82rem;color:var(--fg-muted);margin-bottom:1.25rem;' },
      'Skills já implementadas. Quando o agente recebe um pedido que casa com um destes slugs, executa direto sem abrir ticket.'
    ),
  ]);
  if (catalogo.length === 0) {
    sec.appendChild(el('div', { style: 'padding:1.5rem;color:var(--fg-muted);text-align:center;font-style:italic;' }, 'Catálogo vazio.'));
    return sec;
  }
  const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.85rem;' });
  catalogo.forEach(c => grid.appendChild(cardCatalogo(c)));
  sec.appendChild(grid);
  return sec;
}

function cardCatalogo(c) {
  const ativo = c.status === 'ativo';
  const cor = ativo ? '#22C55E' : c.status === 'em_construcao' ? '#F59E0B' : '#64748B';
  const card = el('div', { style: `background:var(--bg);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:10px;padding:.85rem 1rem;` });
  card.appendChild(el('div', { style: 'display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;' }, [
    el('code', { style: 'font-size:.72rem;color:var(--fg-muted);' }, c.slug),
    el('span', { style: 'flex:1' }, ''),
    el('span', { style: `background:${cor}22;color:${cor};font-size:.65rem;font-weight:700;padding:.15rem .5rem;border-radius:4px;text-transform:uppercase;` }, c.status),
  ]));
  card.appendChild(el('div', { style: 'color:var(--fg);font-weight:600;font-size:.9rem;margin-bottom:.3rem;' }, c.nome));
  card.appendChild(el('p', { style: 'color:var(--fg-muted);font-size:.78rem;line-height:1.4;margin-bottom:.4rem;' }, c.descricao));
  if (c.exemplos_pedido && c.exemplos_pedido.length > 0) {
    const exBox = el('div', { style: 'font-size:.7rem;color:var(--fg-muted);font-style:italic;' });
    exBox.appendChild(el('strong', { style: 'font-style:normal;color:var(--fg-muted);' }, 'Ex: '));
    exBox.appendChild(document.createTextNode('"' + c.exemplos_pedido.slice(0, 2).join('" / "') + '"'));
    card.appendChild(exBox);
  }
  return card;
}

// ============================================================
// AÇÕES — escrita via supabase direto (RLS authenticated_all)
// ============================================================

async function mudarStatus(ticketId, novoStatus, sb, refresh) {
  const updates = { status: novoStatus, atualizado_em: new Date().toISOString() };
  if (novoStatus === 'aprovado_pra_construir') updates.aprovado_em = new Date().toISOString();
  const { error } = await sb.from('oficina_relatorios').update(updates).eq('id', ticketId);
  if (error) { alert('Erro: ' + error.message); return; }
  await refresh();
}

async function cancelarTicket(ticketId, sb, refresh) {
  const motivo = prompt('Motivo do cancelamento (opcional):');
  if (motivo === null) return; // cancelou o prompt
  const updates = {
    status: 'cancelado',
    notas_codina: motivo || null,
    entregue_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await sb.from('oficina_relatorios').update(updates).eq('id', ticketId);
  if (error) { alert('Erro: ' + error.message); return; }
  await refresh();
}

function abrirModalEntregar(ticket, sb, catalogo, refresh) {
  // Modal simples — pergunta slug da Skill e notas
  const slugSugerido = ticket.skill_slug_alvo || '';
  const opcoes = catalogo.map(c => c.slug).join(', ');
  const slug = prompt(`Slug da Skill que ficou pronta\n\nDicas: ${opcoes}\n\n(sem espaços, kebab-case)`, slugSugerido);
  if (!slug) return;
  const notas = prompt('Notas pra registrar (opcional):') || null;

  (async () => {
    const updates = {
      status: 'entregue',
      skill_slug_alvo: slug.trim(),
      notas_codina: notas,
      entregue_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };
    const { error } = await sb.from('oficina_relatorios').update(updates).eq('id', ticket.id);
    if (error) { alert('Erro: ' + error.message); return; }
    await refresh();
  })();
}
