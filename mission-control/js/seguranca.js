/**
 * Pilar Segurança — Pinguim OS
 *
 * Painel + sub-paginas:
 *  - Visao geral: cards de status (RLS, Cofre, Raio-X, OWASP, Incidentes, Politicas)
 *  - Cofre: variaveis de ambiente da Vercel (mascaradas)
 *  - Raio-X: tabelas, linhas exatas, % do plano Supabase
 *  - Incidentes: tentativas de invasao detectadas
 *  - Politicas: regras escritas (Dalio) — feedback vira politica
 *  - Auditoria: relatorios historicos
 *
 * Conselheiros consultados (squad cybersecurity, Pinguim OS):
 *  Peter Kim · Georgia Weidman · Jim Manico · Marcus Carey ·
 *  Omar Santos · Chris Sanders.
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

export async function renderSeguranca() {
  const page = document.getElementById('page-seguranca');
  page.innerHTML = '';

  const header = el('div', { class: 'page-header' }, [
    el('div', {}, [
      el('h1', { class: 'page-title' }, '🛡 Segurança'),
      el('div', { class: 'page-subtitle' },
        'Squad Cyber: Peter Kim, Georgia Weidman, Jim Manico, Marcus Carey, Omar Santos, Chris Sanders. Defesa em profundidade + Zero Trust + IDS + Threat Intel. Tudo automático, tudo visível.'),
    ]),
  ]);

  const tabs = el('div', { class: 'seguranca-tabs' }, [
    abaBtn('visao', 'Visão geral'),
    abaBtn('cofre', 'Cofre de chaves'),
    abaBtn('raio-x', 'Raio-X do banco'),
    abaBtn('incidentes', 'Incidentes'),
    abaBtn('politicas', 'Políticas'),
    abaBtn('auditoria', 'Histórico'),
  ]);

  const conteudo = el('div', { id: 'seguranca-conteudo' });

  page.append(header, tabs, conteudo);

  await renderAba(aba, conteudo);
}

function abaBtn(id, label) {
  return el('button', {
    class: 'seguranca-tab' + (aba === id ? ' active' : ''),
    type: 'button',
    onclick: async () => {
      aba = id;
      await renderSeguranca();
    },
  }, label);
}

async function renderAba(qual, container) {
  container.innerHTML = '';
  const loading = el('div', { class: 'seguranca-loading' }, 'Carregando...');
  container.appendChild(loading);
  try {
    if (qual === 'visao')      await renderVisaoGeral(container);
    else if (qual === 'cofre') await renderCofre(container);
    else if (qual === 'raio-x') await renderRaioX(container);
    else if (qual === 'incidentes') await renderIncidentes(container);
    else if (qual === 'politicas') await renderPoliticas(container);
    else if (qual === 'auditoria') await renderAuditoria(container);
  } catch (e) {
    container.innerHTML = `<div class="seguranca-erro">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// VISAO GERAL — cards
// ============================================================
async function renderVisaoGeral(container) {
  const sb = getSupabase();
  if (!sb) { container.innerHTML = '<div class="seguranca-erro">Sem conexão.</div>'; return; }

  // Buca os relatorios MAIS RECENTES por tipo
  const { data: rels } = await sb.from('seguranca_relatorios')
    .select('*').order('criado_em', { ascending: false }).limit(50);

  const ultimoPorTipo = {};
  (rels || []).forEach(r => { if (!ultimoPorTipo[r.tipo]) ultimoPorTipo[r.tipo] = r; });

  // Incidentes em aberto
  const { data: inc } = await sb.from('seguranca_incidentes')
    .select('severidade').eq('resolvido', false);
  const totalIncidentes = (inc || []).length;
  const incCriticos = (inc || []).filter(i => i.severidade === 'critico').length;

  // Politicas ativas
  const { count: politicasAtivas } = await sb.from('politicas_seguranca')
    .select('id', { count: 'exact', head: true }).eq('ativo', true);

  container.innerHTML = '';

  const grade = el('div', { class: 'seguranca-grade' });

  grade.append(
    cardStatus({
      icon: '🔒',
      titulo: 'Row Level Security (RLS)',
      relatorio: ultimoPorTipo.rls,
      conselheiro: 'Georgia Weidman',
      acao: { label: 'Auditar agora', onclick: () => rodarAuditoria('rls') },
    }),
    cardStatus({
      icon: '📜',
      titulo: 'Policies de acesso',
      relatorio: ultimoPorTipo.policies,
      conselheiro: 'Jim Manico',
    }),
    cardStatus({
      icon: '🛡',
      titulo: 'Funções SECURITY DEFINER',
      relatorio: ultimoPorTipo.security_definer,
      conselheiro: 'Omar Santos',
    }),
    cardStatus({
      icon: '🚨',
      titulo: 'Incidentes em aberto',
      status: incCriticos > 0 ? 'critical' : (totalIncidentes > 0 ? 'warning' : 'ok'),
      resumo: totalIncidentes === 0
        ? 'Nenhum incidente em aberto.'
        : `${totalIncidentes} incidente(s), ${incCriticos} crítico(s).`,
      conselheiro: 'Chris Sanders · Marcus Carey',
      acao: totalIncidentes > 0 ? { label: 'Ver incidentes', onclick: () => { aba = 'incidentes'; renderSeguranca(); } } : null,
    }),
    cardStatus({
      icon: '📊',
      titulo: 'Raio-X do banco',
      relatorio: ultimoPorTipo.raio_x_banco,
      conselheiro: 'Sanders',
      acao: { label: 'Atualizar', onclick: () => rodarRaioX() },
    }),
    cardStatus({
      icon: '🔑',
      titulo: 'Cofre de chaves (Vercel)',
      status: 'ok',
      resumo: 'Configuração via Vercel API. Painel mostra nomes mascarados.',
      conselheiro: 'Peter Kim',
      acao: { label: 'Abrir cofre', onclick: () => { aba = 'cofre'; renderSeguranca(); } },
    }),
    cardStatus({
      icon: '⚖',
      titulo: 'Políticas escritas',
      status: politicasAtivas > 0 ? 'ok' : 'warning',
      resumo: politicasAtivas === 0
        ? 'Nenhuma política escrita ainda. Princípio Dalio: feedback vira política, política não evapora.'
        : `${politicasAtivas} política(s) ativa(s).`,
      conselheiro: 'Ray Dalio',
      acao: { label: 'Ver políticas', onclick: () => { aba = 'politicas'; renderSeguranca(); } },
    }),
    cardStatus({
      icon: '🔍',
      titulo: 'Red Team (Hacker Playbook)',
      status: 'planejado',
      resumo: 'Agente cron simulando ataque diariamente — entra na Fase 2.',
      conselheiro: 'Peter Kim',
    }),
  );

  // Ações globais
  const acoes = el('div', { class: 'seguranca-acoes-global' }, [
    el('button', { class: 'btn btn-primary', onclick: () => rodarAuditoriaCompleta() }, '▶ Rodar auditoria completa'),
    el('button', { class: 'btn', onclick: () => rodarRaioX() }, '📊 Atualizar raio-X'),
  ]);

  container.append(acoes, grade);
}

function cardStatus({ icon, titulo, relatorio, status, resumo, conselheiro, acao }) {
  const st = status || (relatorio?.status) || 'unknown';
  const txt = resumo || (relatorio?.resumo) || (relatorio ? '' : 'Sem auditoria ainda — rode pra ver o estado.');
  const dataHora = relatorio?.criado_em
    ? new Date(relatorio.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;
  return el('div', { class: `seg-card seg-card-${st}` }, [
    el('div', { class: 'seg-card-head' }, [
      el('div', { class: 'seg-card-icon' }, icon),
      el('div', { class: 'seg-card-titulo' }, titulo),
      el('div', { class: `seg-badge seg-badge-${st}` }, labelStatus(st)),
    ]),
    el('div', { class: 'seg-card-resumo' }, txt),
    el('div', { class: 'seg-card-meta' }, [
      el('span', { class: 'seg-card-conselheiro' }, conselheiro ? `🎙 ${conselheiro}` : ''),
      dataHora ? el('span', { class: 'seg-card-data' }, dataHora) : null,
    ]),
    acao ? el('button', { class: 'btn btn-ghost seg-card-acao', onclick: acao.onclick }, acao.label) : null,
  ]);
}

function labelStatus(s) {
  return ({ ok: 'OK', warning: 'Atenção', critical: 'Crítico', unknown: 'Sem dado', planejado: 'Planejado' }[s] || s);
}

// ============================================================
// COFRE — chaves da Vercel mascaradas
// ============================================================
async function renderCofre(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) { container.innerHTML = '<div class="seguranca-erro">Sem conexão.</div>'; return; }

  const { data: { session } } = await sb.auth.getSession();
  const fnUrl = `${window.__ENV__.SUPABASE_URL}/functions/v1/vercel-env-vars`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const dados = await resp.json();

  if (!dados.configurado) {
    container.append(
      el('div', { class: 'seguranca-empty' }, [
        el('div', { style: 'font-size:2rem;margin-bottom:.5rem' }, '🔑'),
        el('div', { style: 'font-weight:600;margin-bottom:.25rem' }, 'Cofre não configurado'),
        el('div', { style: 'color:var(--fg-muted);max-width:50ch;margin:0 auto;font-size:.875rem' }, dados.mensagem || ''),
        el('div', { style: 'background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:.5rem;padding:1rem;margin-top:1rem;text-align:left;max-width:60ch;font-family:var(--font-mono);font-size:.75rem;line-height:1.6' }, [
          el('div', { style: 'color:var(--fg);margin-bottom:.5rem' }, 'Como configurar:'),
          el('div', {}, '1) Crie Personal Access Token na Vercel (escopo Read).'),
          el('div', {}, '2) Pegue o Project ID em Settings > General.'),
          el('div', {}, '3) Supabase Dashboard > Edge Functions > vercel-env-vars > Secrets:'),
          el('div', { style: 'margin-left:1.5rem;color:var(--fg-muted)' }, 'VERCEL_TOKEN, VERCEL_PROJECT_ID (opcional VERCEL_TEAM_ID)'),
          el('div', { style: 'margin-top:.5rem' }, '4) Volta nesta tela e refresca.'),
        ]),
      ])
    );
    return;
  }

  if (!dados.ok) {
    container.append(el('div', { class: 'seguranca-erro' }, dados.erro || 'Erro consultando Vercel.'));
    return;
  }

  const total = dados.total || 0;
  const porProvedor = dados.por_provedor || {};
  const variaveis = dados.variaveis || [];

  const headerInfo = el('div', { class: 'cofre-header' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:600;font-size:.9375rem' }, `${total} variáveis ativas`),
      el('div', { style: 'font-size:.8125rem;color:var(--fg-muted)' },
        Object.entries(porProvedor).map(([p, n]) => `${p}: ${n}`).join(' · ')),
    ]),
  ]);

  const tabela = el('table', { class: 'cofre-tabela' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Nome'),
        el('th', {}, 'Provedor'),
        el('th', {}, 'Escopo'),
        el('th', {}, 'Target'),
        el('th', {}, 'Valor'),
        el('th', {}, 'Atualizado'),
      ]),
    ]),
    el('tbody', {}, variaveis.map(v => el('tr', {}, [
      el('td', { class: 'cofre-nome' }, v.nome),
      el('td', {}, [el('span', { class: `cofre-provedor cofre-provedor-${v.provedor.toLowerCase()}` }, v.provedor)]),
      el('td', {}, [el('span', { class: `cofre-escopo cofre-escopo-${v.escopo}` }, v.escopo)]),
      el('td', {}, v.target),
      el('td', { class: 'cofre-mascara' }, v.valor_mascara),
      el('td', { class: 'cofre-data' }, v.atualizado_em ? new Date(v.atualizado_em).toLocaleDateString('pt-BR') : '—'),
    ]))),
  ]);

  container.append(headerInfo, tabela);
}

// ============================================================
// RAIO-X — tabelas, linhas, plano
// ============================================================
async function renderRaioX(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) { container.innerHTML = '<div class="seguranca-erro">Sem conexão.</div>'; return; }

  const { data: { session } } = await sb.auth.getSession();
  const fnUrl = `${window.__ENV__.SUPABASE_URL}/functions/v1/raio-x-banco`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!resp.ok) {
    container.append(el('div', { class: 'seguranca-erro' }, `Erro ${resp.status} ao consultar raio-X.`));
    return;
  }
  const dados = await resp.json();

  const tamanhoMB = dados.tamanho_total_bytes / 1024 / 1024;
  const limiteMB = dados.plano_limite_bytes / 1024 / 1024;
  const pct = dados.pct_plano || 0;
  const status = pct >= 90 ? 'critical' : (pct >= 70 ? 'warning' : 'ok');

  const head = el('div', { class: 'raiox-head' }, [
    el('div', { class: 'raiox-pct-wrap' }, [
      el('div', { class: 'raiox-pct-label' }, `${tamanhoMB.toFixed(2)} MB / ${limiteMB.toFixed(0)} MB`),
      el('div', { class: 'raiox-bar-bg' }, [
        el('div', { class: `raiox-bar-fg raiox-bar-${status}`, style: `width:${Math.min(100, pct)}%` }),
      ]),
      el('div', { class: 'raiox-pct-num' }, `${pct.toFixed(2)}% do plano`),
    ]),
    dados.projecao?.dias_para_estourar != null
      ? el('div', { class: 'raiox-projecao' },
          `Projeção: estoura em ~${dados.projecao.dias_para_estourar} dias (${(dados.projecao.taxa_crescimento_dia_bytes / 1024).toFixed(1)} KB/dia)`)
      : el('div', { class: 'raiox-projecao raiox-projecao-vazia' }, 'Projeção: histórico ainda curto.'),
  ]);

  const tabela = el('table', { class: 'raiox-tabela' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Tabela'),
        el('th', { style: 'text-align:right' }, 'Linhas (estimadas)'),
        el('th', { style: 'text-align:right' }, 'Linhas (exatas)'),
        el('th', { style: 'text-align:right' }, 'Tamanho total'),
        el('th', { style: 'text-align:right' }, 'Dados'),
        el('th', { style: 'text-align:right' }, 'Índices'),
      ]),
    ]),
    el('tbody', {}, (dados.tabelas || []).map(t => el('tr', {}, [
      el('td', {}, t.tabela),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, fmtNum(t.total_linhas_estimado)),
      el('td', { style: 'text-align:right' }, t.total_linhas_exato != null ? fmtNum(t.total_linhas_exato) : '—'),
      el('td', { style: 'text-align:right' }, fmtBytes(t.tamanho_total_bytes)),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, fmtBytes(t.tamanho_dados_bytes)),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, fmtBytes(t.tamanho_indices_bytes)),
    ]))),
  ]);

  container.append(head, tabela);
}

function fmtNum(n) {
  if (n == null || n < 0) return '—';
  return new Intl.NumberFormat('pt-BR').format(n);
}
function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// ============================================================
// INCIDENTES
// ============================================================
async function renderIncidentes(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb.from('seguranca_incidentes')
    .select('*').order('criado_em', { ascending: false }).limit(100);
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' }, [
      el('div', { style: 'font-size:2rem;margin-bottom:.5rem' }, '✅'),
      el('div', { style: 'font-weight:600' }, 'Nenhum incidente registrado'),
      el('div', { style: 'color:var(--fg-muted);font-size:.875rem;margin-top:.25rem' },
        'Quando o trigger detectar tabela sem RLS, ou IDS detectar anomalia, aparece aqui.'),
    ]));
    return;
  }

  const tabela = el('table', { class: 'incidentes-tabela' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Quando'),
        el('th', {}, 'Tipo'),
        el('th', {}, 'Severidade'),
        el('th', {}, 'Recurso'),
        el('th', {}, 'Ação'),
        el('th', {}, 'Status'),
      ]),
    ]),
    el('tbody', {}, data.map(i => el('tr', { class: i.resolvido ? 'incidente-resolvido' : '' }, [
      el('td', {}, new Date(i.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
      el('td', {}, i.tipo),
      el('td', {}, [el('span', { class: `incidente-sev incidente-sev-${i.severidade}` }, i.severidade)]),
      el('td', { style: 'font-family:var(--font-mono);font-size:.75rem' }, i.recurso || '—'),
      el('td', {}, i.acao_tomada || '—'),
      el('td', {}, i.resolvido ? 'Resolvido' : 'Aberto'),
    ]))),
  ]);

  container.append(tabela);
}

// ============================================================
// POLITICAS
// ============================================================
async function renderPoliticas(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) return;

  const { data } = await sb.from('politicas_seguranca').select('*').order('criado_em', { ascending: false });

  const novaBtn = el('button', { class: 'btn btn-primary', style: 'margin-bottom:1rem', onclick: () => abrirNovaPolitica(container) },
    '+ Nova política');
  container.append(novaBtn);

  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' }, [
      el('div', { style: 'font-size:2rem;margin-bottom:.5rem' }, '⚖'),
      el('div', { style: 'font-weight:600' }, 'Nenhuma política escrita'),
      el('div', { style: 'color:var(--fg-muted);font-size:.875rem;margin-top:.5rem;max-width:60ch;margin-inline:auto' },
        'Princípio Ray Dalio: cada decisão de segurança vira política escrita. Da próxima vez, consulta a política em vez de redecidir.'),
    ]));
    return;
  }

  const lista = el('div', { class: 'politicas-lista' });
  data.forEach(p => {
    lista.append(el('div', { class: `politica-card politica-${p.ativo ? 'ativa' : 'inativa'}` }, [
      el('div', { class: 'politica-head' }, [
        el('div', { class: 'politica-titulo' }, p.titulo),
        el('span', { class: `politica-badge politica-badge-${p.escopo}` }, p.escopo),
        el('span', { class: 'politica-origem' }, p.origem || 'manual'),
      ]),
      el('div', { class: 'politica-desc' }, p.descricao || ''),
      el('pre', { class: 'politica-regra' }, p.regra_md),
    ]));
  });
  container.append(lista);
}

async function abrirNovaPolitica(refContainer) {
  const sb = getSupabase();
  const back = el('div', { class: 'modal-backdrop', onclick: e => { if (e.target === back) fechar(); } });
  const card = el('div', { class: 'modal-card', style: 'max-width:640px' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const inputTitulo = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Ex.: RLS obrigatório em toda tabela', required: 'required' });
  const inputDesc = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Descrição curta' });
  const selectEscopo = el('select', { class: 'novo-cerebro-input' }, [
    el('option', { value: 'global' }, 'Global'),
    el('option', { value: 'agente' }, 'Agente específico'),
    el('option', { value: 'tool' }, 'Tool específica'),
    el('option', { value: 'tabela' }, 'Tabela específica'),
  ]);
  const inputAlvo = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Slug do alvo (vazio se global)' });
  const textareaRegra = el('textarea', { rows: '8', class: 'novo-cerebro-input', placeholder: 'A regra em markdown. Liste princípio, motivo e como aplicar.', required: 'required' });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const titulo = inputTitulo.value.trim();
      const slug = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { error } = await sb.from('politicas_seguranca').insert({
        slug, titulo, descricao: inputDesc.value.trim(),
        regra_md: textareaRegra.value.trim(),
        escopo: selectEscopo.value,
        alvo: inputAlvo.value.trim() || null,
        origem: 'manual',
      });
      if (error) { alert(error.message); return; }
      fechar();
      await renderPoliticas(refContainer);
    },
  }, [
    el('label', { class: 'novo-cerebro-label' }, 'Título'),
    inputTitulo,
    el('label', { class: 'novo-cerebro-label', style: 'margin-top:.75rem' }, 'Descrição'),
    inputDesc,
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:.75rem' }, [
      el('div', {}, [el('label', { class: 'novo-cerebro-label' }, 'Escopo'), selectEscopo]),
      el('div', {}, [el('label', { class: 'novo-cerebro-label' }, 'Alvo (opcional)'), inputAlvo]),
    ]),
    el('label', { class: 'novo-cerebro-label', style: 'margin-top:.75rem' }, 'Regra (markdown)'),
    textareaRegra,
    el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: fechar }, 'Cancelar'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar política'),
    ]),
  ]);
  card.append(
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem' }, [
      el('div', { style: 'font-family:var(--font-heading);font-weight:600;font-size:1rem' }, 'Nova política de segurança'),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    form,
  );
  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

// ============================================================
// AUDITORIA — historico
// ============================================================
async function renderAuditoria(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  const { data, error } = await sb.from('seguranca_relatorios')
    .select('*').order('criado_em', { ascending: false }).limit(50);
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }
  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' },
      'Nenhum relatório ainda. Roda uma auditoria pra começar a popular o histórico.'));
    return;
  }
  const tabela = el('table', { class: 'auditoria-tabela' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', {}, 'Quando'), el('th', {}, 'Tipo'), el('th', {}, 'Status'), el('th', {}, 'Resumo'), el('th', { style: 'text-align:right' }, 'Falhas/Total'),
    ])]),
    el('tbody', {}, data.map(r => el('tr', {}, [
      el('td', {}, new Date(r.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
      el('td', {}, r.tipo),
      el('td', {}, [el('span', { class: `seg-badge seg-badge-${r.status}` }, labelStatus(r.status))]),
      el('td', { style: 'max-width:60ch' }, r.resumo),
      el('td', { style: 'text-align:right' }, `${r.total_falhas || 0} / ${r.total_checks || 0}`),
    ]))),
  ]);
  container.append(tabela);
}

// ============================================================
// Acoes
// ============================================================
async function rodarAuditoriaCompleta() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/auditar-seguranca`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  await renderSeguranca();
}

async function rodarAuditoria(tipo) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/auditar-seguranca`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tipos: [tipo] }),
  });
  await renderSeguranca();
}

async function rodarRaioX() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/raio-x-banco`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  await renderSeguranca();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
