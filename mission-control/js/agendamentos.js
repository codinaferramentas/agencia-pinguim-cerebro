/* Agendamentos — V2.15.1 (Andre 2026-05-13)
   Painel COMPLETO de agendamentos com:
   - Cards por agendamento
   - Ações: Disparar agora · Pausar/Reativar · Editar horário · Excluir
   - Multi-destinatário (tabela pinguim.relatorios_destinatarios)
   - Criar agendamento novo via UI (catálogo de relatórios prontos)

   Chama a API do server-cli local via PUBLIC_BASE_URL (ngrok) porque ações
   destrutivas dependem do worker e do pg_cron rodando lá.
*/

import { getSupabase } from './sb-client.js?v=20260421p';

const PUBLIC_BASE_URL = 'https://almost-pawing-urban.ngrok-free.dev';

// ============================================================
// Helpers
// ============================================================
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

function fmtData(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return s; }
}

function statusCor(s) {
  if (!s) return '#64748B';
  if (s.startsWith('ok_parcial')) return '#F59E0B';
  if (s.startsWith('ok_sem')) return '#F59E0B';
  if (s.startsWith('ok')) return '#22C55E';
  if (s.startsWith('falhou')) return '#EF4444';
  if (s.startsWith('pulado')) return '#F59E0B';
  return '#94A3B8';
}

// ============================================================
// API client (chama ngrok do server-cli local)
// Andre 2026-05-13: usado SÓ pra ações destrutivas. Listagem lê Supabase direto.
// Quando V3 (servidor Pedro) entrar, basta trocar PUBLIC_BASE_URL.
// ============================================================
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      // Ngrok mostra interstitial page sem esse header. Pra requisição programática:
      'ngrok-skip-browser-warning': '1',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  let r;
  try {
    r = await fetch(PUBLIC_BASE_URL + path, opts);
  } catch (e) {
    // fetch failed = server-cli não respondeu (PC desligado, ngrok caiu, sem internet)
    const err = new Error('Server-cli local não respondeu. PC ligado? Ngrok rodando?');
    err.kind = 'offline';
    throw err;
  }
  let j;
  try { j = await r.json(); }
  catch (_) {
    const err = new Error(`Server-cli devolveu resposta inválida (HTTP ${r.status})`);
    err.kind = 'invalid_response';
    err.http = r.status;
    throw err;
  }
  if (!j.ok) {
    const err = new Error(j.error || 'erro');
    err.kind = classificarErroServerCli(j.error || '');
    err.raw = j;
    throw err;
  }
  return j;
}

// V2.15.2 Painel agendamentos — Andre 2026-05-13: distinguir tipos de erro
// pra UI mostrar mensagem útil em vez de "fetch failed" genérico.
function classificarErroServerCli(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('evolution') || m.includes('whatsapp') && m.includes('fetch')) return 'evolution_offline';
  if (m.includes('número') || m.includes('numero') || m.includes('invalid_phone') || m.includes('inválido')) return 'numero_invalido';
  if (m.includes('duplicat') || m.includes('já existe') || m.includes('unique')) return 'duplicata';
  if (m.includes('not found') || m.includes('não encontrado')) return 'nao_encontrado';
  return 'outro';
}

// V2.15.2 — converte error.kind em texto humano pra mostrar no toast
function explicarErro(e) {
  if (!e) return 'erro desconhecido';
  switch (e.kind) {
    case 'offline':           return '✗ Server-cli local offline. PC ligado? Ngrok rodando?';
    case 'evolution_offline': return '✗ Evolution API (WhatsApp) não respondeu. Tenta de novo em 1min.';
    case 'numero_invalido':   return '✗ Número de WhatsApp inválido (formato esperado: 55 11 99999 9999).';
    case 'duplicata':         return '✗ Já existe destinatário com esses dados neste agendamento.';
    case 'nao_encontrado':    return '✗ Agendamento ou destinatário não encontrado (talvez excluído por outra aba).';
    case 'invalid_response':  return `✗ Server-cli devolveu HTTP ${e.http} inválido. Olha o log do server-cli.`;
    default:                  return `✗ ${e.message || 'erro'}`;
  }
}

// Conversão BRT ↔ UTC pra cron expression (BRT = UTC-3)
function brtParaUtc(cronBrt) {
  // espera "M H * * D" - converte H pra UTC (+3)
  const parts = cronBrt.trim().split(/\s+/);
  if (parts.length !== 5) return cronBrt;
  const m = parts[0];
  const h = parts[1];
  if (h.includes(',')) {
    const horas = h.split(',').map(x => (parseInt(x, 10) + 3) % 24).join(',');
    parts[1] = horas;
  } else if (/^\d+$/.test(h)) {
    parts[1] = String((parseInt(h, 10) + 3) % 24);
  }
  return parts.join(' ');
}

function utcParaBrt(cronUtc) {
  const parts = cronUtc.trim().split(/\s+/);
  if (parts.length !== 5) return cronUtc;
  const h = parts[1];
  if (h.includes(',')) {
    const horas = h.split(',').map(x => (parseInt(x, 10) - 3 + 24) % 24).join(',');
    parts[1] = horas;
  } else if (/^\d+$/.test(h)) {
    parts[1] = String((parseInt(h, 10) - 3 + 24) % 24);
  }
  return parts.join(' ');
}

function descricaoCron(cronUtc) {
  // Converte UTC pra BRT pra mostrar humano
  const parts = cronUtc.trim().split(/\s+/);
  if (parts.length !== 5) return cronUtc;
  const m = parts[0];
  const h = parts[1];
  const dow = parts[4];
  // Hora BRT
  const hBrt = (parseInt(h, 10) - 3 + 24) % 24;
  const mStr = m === '0' ? '' : `:${m.padStart(2, '0')}`;
  const horaStr = `${String(hBrt).padStart(2, '0')}h${mStr}`;
  if (dow === '*') return `todo dia ${horaStr} BRT`;
  const nomes = { '1': 'seg', '2': 'ter', '3': 'qua', '4': 'qui', '5': 'sex', '6': 'sáb', '0': 'dom' };
  const dias = dow.split(',').map(d => nomes[d] || d).join('/');
  return `${dias} ${horaStr} BRT`;
}

// ============================================================
// V2.15.2 — Parser mínimo de cron pra antecipar próximas execuções.
// Suporta padrão simples M H * * D (com D = '*' ou dia(s) da semana).
// Retorna array de Date em fuso LOCAL convertendo a hora UTC do cron.
// ============================================================
function parseCron(cronUtc) {
  const parts = String(cronUtc || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const mins = parsearCampo(parts[0], 0, 59);
  const horas = parsearCampo(parts[1], 0, 23);
  // dia do mês e mês: ignoramos (só M H * * D no nosso painel)
  const dows = parts[4] === '*' ? [0,1,2,3,4,5,6] : parsearCampo(parts[4], 0, 6);
  if (!mins || !horas || !dows) return null;
  return { mins, horas, dows };
}

function parsearCampo(token, min, max) {
  if (token === '*') {
    const out = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
  }
  if (token.includes(',')) {
    return token.split(',').map(t => parseInt(t, 10)).filter(n => n >= min && n <= max);
  }
  if (/^\d+$/.test(token)) {
    const n = parseInt(token, 10);
    return (n >= min && n <= max) ? [n] : null;
  }
  return null;
}

// Próximas N execuções dado um cron UTC. Devolve [{ at: Date(local-equiv-UTC), agendamento }]
function proximasExecucoes(cronUtc, n = 10, dentroDeNDias = 7) {
  const c = parseCron(cronUtc);
  if (!c) return [];
  const agora = new Date();
  const fim = new Date(agora.getTime() + dentroDeNDias * 86400000);
  const resultados = [];
  // Itera dia a dia (UTC)
  for (let d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())); d <= fim && resultados.length < n; d = new Date(d.getTime() + 86400000)) {
    if (!c.dows.includes(d.getUTCDay())) continue;
    for (const h of c.horas) {
      for (const m of c.mins) {
        const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m));
        if (dt > agora && dt <= fim) resultados.push(dt);
        if (resultados.length >= n) break;
      }
      if (resultados.length >= n) break;
    }
  }
  return resultados.sort((a, b) => a - b).slice(0, n);
}

// ============================================================
// Estado global da página (recarrega lista após cada ação)
// ============================================================
let _state = {
  agendamentos: [],
  catalogo: [],
  socioCid: null,
};

async function carregarTudo() {
  // Andre 2026-05-13: leitura via Supabase direto (mesmo padrão Oficina).
  // Independe do server-cli local estar ligado. Em V3 segue funcionando igual.
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não inicializado');

  // 1) Agendamentos (com destinatários agregados pela view)
  const rAg = await sb.from('relatorios_config_com_destinatarios')
    .select('*')
    .order('ativo', { ascending: false })
    .order('slug');
  if (rAg.error) throw new Error(`agendamentos: ${rAg.error.message}`);
  _state.agendamentos = rAg.data || [];

  // 2) Catálogo (só itens ativos)
  const rCat = await sb.from('oficina_catalogo')
    .select('slug, nome, descricao, status')
    .eq('status', 'ativo')
    .order('slug');
  if (rCat.error) throw new Error(`catálogo: ${rCat.error.message}`);
  _state.catalogo = rCat.data || [];

  if (_state.agendamentos[0]) _state.socioCid = _state.agendamentos[0].cliente_id;
}

// ============================================================
// Render principal
// ============================================================
export async function renderAgendamentos() {
  const page = document.getElementById('page-agendamentos');
  if (!page) return;
  page.innerHTML = '';

  const wrap = el('div', { style: 'max-width:1280px;margin:0 auto;padding:2rem 2rem 4rem;' });
  wrap.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, '⏰ Agendamentos'),
    el('p', { class: 'page-subtitle' },
      'Relatórios automáticos rodando via cron. Worker no server-cli executa quando o cron dispara, salva entregável versionado e manda WhatsApp pros destinatários ativos.'
    ),
  ]));
  page.appendChild(wrap);

  const status = el('div', { style: 'padding:2rem;color:var(--fg-muted);text-align:center' }, 'Carregando…');
  wrap.appendChild(status);

  try {
    await carregarTudo();
  } catch (e) {
    status.innerHTML = `<div style="padding:2rem;color:var(--danger)">Erro carregando: ${e.message}<br><br>O server-cli local está rodando em ${PUBLIC_BASE_URL}?</div>`;
    return;
  }
  status.remove();

  const ativos = _state.agendamentos.filter(a => a.ativo);
  const pausados = _state.agendamentos.filter(a => !a.ativo);

  // Top bar com stats + botão criar
  const topBar = el('div', { style: 'display:flex;gap:1rem;margin-bottom:2rem;align-items:stretch;flex-wrap:wrap;' });
  topBar.appendChild(statCard('⏰', 'Ativos', ativos.length, '#E85C00'));
  topBar.appendChild(statCard('⏸', 'Pausados', pausados.length, '#94A3B8'));
  topBar.appendChild(statCard('📅', 'Total', _state.agendamentos.length, '#3B82F6'));
  topBar.appendChild(el('div', { style: 'flex:1;display:flex;justify-content:flex-end;align-items:center;' }, [
    el('button', {
      style: 'background:var(--accent);color:white;border:none;padding:.7rem 1.25rem;border-radius:8px;font-weight:600;cursor:pointer;font-size:.9rem;',
      onclick: () => abrirModalCriar()
    }, '+ Novo agendamento')
  ]));
  wrap.appendChild(topBar);

  // V2.15.2 — Grade cronológica: "próximos crons" do horizonte 7d
  if (ativos.length > 0) wrap.appendChild(renderGradeCronologica(ativos));

  // V2.15.2 — Toolbar busca/filtros + container que re-renderiza cards
  const cardsContainer = el('div', { id: 'agendamentos-cards' });
  wrap.appendChild(renderToolbarBusca(cardsContainer));
  wrap.appendChild(cardsContainer);
  rerenderCards(cardsContainer);

  if (_state.agendamentos.length === 0) {
    cardsContainer.appendChild(el('div', {
      style: 'padding:3rem;text-align:center;color:var(--fg-muted);background:var(--bg2);border:1px dashed var(--border);border-radius:12px;'
    }, [
      el('div', { style: 'font-size:2rem;margin-bottom:1rem;' }, '⏰'),
      el('div', {}, 'Nenhum agendamento cadastrado.'),
      el('div', { style: 'margin-top:.5rem;font-size:.85rem;' }, 'Clica em "+ Novo agendamento" pra criar o primeiro.'),
    ]));
  }
}

// ============================================================
// V2.15.2 — Estado dos filtros (memória de sessão da página)
// ============================================================
const _filtros = {
  q: '',                    // texto de busca
  status: 'todos',          // todos | ativo | pausado
  canal: 'todos',           // todos | whatsapp | discord | email
  destinatario: 'todos',    // todos | <nome ou valor exato>
};

// Aplica filtros + reordena por proximidade de execução
function filtrarAgendamentos() {
  const q = _filtros.q.trim().toLowerCase();
  return _state.agendamentos.filter(a => {
    if (_filtros.status === 'ativo' && !a.ativo) return false;
    if (_filtros.status === 'pausado' && a.ativo) return false;

    const destinatarios = Array.isArray(a.destinatarios) ? a.destinatarios.filter(d => d.ativo !== false) : [];
    if (_filtros.canal !== 'todos' && !destinatarios.some(d => d.canal === _filtros.canal)) return false;
    if (_filtros.destinatario !== 'todos' && !destinatarios.some(d => (d.nome || d.valor) === _filtros.destinatario)) return false;

    if (!q) return true;
    const haystack = [
      a.nome || '', a.slug || '', a.cron_descricao || '', a.cron_expr || '',
      ...destinatarios.map(d => `${d.nome || ''} ${d.valor || ''} ${d.canal || ''}`),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

function rerenderCards(container) {
  container.innerHTML = '';
  const filtrados = filtrarAgendamentos();
  const ativos = filtrados.filter(a => a.ativo);
  const pausados = filtrados.filter(a => !a.ativo);
  if (ativos.length) container.appendChild(renderSecao('Ativos', ativos));
  if (pausados.length) container.appendChild(renderSecao('Pausados', pausados));
  if (filtrados.length === 0 && _state.agendamentos.length > 0) {
    container.appendChild(el('div', {
      style: 'padding:2rem;text-align:center;color:var(--fg-muted);background:var(--bg2);border:1px dashed var(--border);border-radius:12px;margin-top:1rem;'
    }, [
      el('div', { style: 'font-size:1.5rem;margin-bottom:.5rem;' }, '🔍'),
      el('div', {}, 'Nenhum agendamento bate com o filtro atual.'),
      el('button', {
        style: 'margin-top:1rem;background:transparent;border:1px solid var(--fg-muted);color:var(--fg-muted);padding:.3rem .8rem;border-radius:6px;cursor:pointer;font-size:.8rem;',
        onclick: () => {
          _filtros.q = ''; _filtros.status = 'todos'; _filtros.canal = 'todos'; _filtros.destinatario = 'todos';
          renderAgendamentos();
        }
      }, 'limpar filtros'),
    ]));
  }
}

// ============================================================
// V2.15.2 — Estado do modo de visualização da grade
// ============================================================
let _gradeView = 'lista'; // 'lista' | 'semana'

function renderGradeCronologica(ativos) {
  const wrap = el('div');
  // Header com toggle Lista/Semana
  const header = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;' }, [
    el('h2', { style: 'font-size:.85rem;color:var(--fg);text-transform:uppercase;letter-spacing:.08em;margin:0;' },
      `📅 Próximos disparos`),
    el('div', { style: 'display:flex;gap:.3rem;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:.2rem;' }, [
      toggleBtn('lista', '📋 Lista'),
      toggleBtn('semana', '🗓 Semana'),
    ]),
  ]);
  wrap.appendChild(header);

  if (_gradeView === 'semana') {
    wrap.appendChild(renderCalendarioSemana(ativos));
  } else {
    wrap.appendChild(renderGradeLista(ativos));
  }
  return wrap;
}

function toggleBtn(view, label) {
  const ativo = _gradeView === view;
  return el('button', {
    style: `background:${ativo ? 'var(--accent)' : 'transparent'};color:${ativo ? 'white' : 'var(--fg-muted)'};border:none;padding:.35rem .75rem;border-radius:6px;font-size:.75rem;font-weight:600;cursor:pointer;`,
    onclick: () => {
      _gradeView = view;
      renderAgendamentos();
    },
  }, label);
}

// ============================================================
// V2.15.2 — Grade cronológica LISTA HOJE/AMANHÃ/+N dias (modo original)
// ============================================================
function renderGradeLista(ativos) {
  const HORIZONTE_DIAS = 7;
  const LIMITE_POR_AGENDAMENTO = 8;

  // Coleta próximas execuções de cada agendamento
  const eventos = [];
  ativos.forEach(a => {
    if (!a.cron_expr) return;
    const proximas = proximasExecucoes(a.cron_expr, LIMITE_POR_AGENDAMENTO, HORIZONTE_DIAS);
    proximas.forEach(dt => eventos.push({ dt, agendamento: a }));
  });
  eventos.sort((a, b) => a.dt - b.dt);

  // Agrupa por dia BRT (toLocaleDateString respeita o fuso da máquina; em produção Vercel usa UTC, mas o browser do sócio é BRT)
  const porDia = new Map();
  eventos.forEach(ev => {
    const chave = ev.dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    if (!porDia.has(chave)) porDia.set(chave, []);
    porDia.get(chave).push(ev);
  });

  const sec = el('section', { style: 'background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.25rem 1.5rem 1.5rem;margin-bottom:1.5rem;' });
  sec.appendChild(el('div', { style: 'font-size:.7rem;color:var(--fg-muted);margin-bottom:1rem;' },
    `${HORIZONTE_DIAS}d · ${eventos.length} disparos · ${porDia.size} dia${porDia.size === 1 ? '' : 's'}`));

  if (eventos.length === 0) {
    sec.appendChild(el('div', { style: 'color:var(--fg-muted);font-size:.85rem;padding:.5rem 0;' },
      'Nenhum cron ativo no horizonte de 7 dias. (Cron expression talvez seja de domingo, e domingo já passou esta semana.)'));
    return sec;
  }

  const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem;' });

  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const amanha = new Date(Date.now() + 86400000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  porDia.forEach((evs, dia) => {
    const rotulo = dia === hoje ? `HOJE · ${dia}`
      : dia === amanha ? `AMANHÃ · ${dia}`
      : dia;
    const cor = dia === hoje ? '#E85C00' : dia === amanha ? '#F59E0B' : '#94A3B8';

    const card = el('div', { style: `background:var(--bg);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:8px;padding:.85rem 1rem;` });
    card.appendChild(el('div', { style: `font-size:.65rem;color:${cor};font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.6rem;` }, rotulo));

    evs.forEach(ev => {
      const hora = ev.dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      const destinatarios = Array.isArray(ev.agendamento.destinatarios) ? ev.agendamento.destinatarios.filter(d => d.ativo !== false) : [];
      const destStr = destinatarios.length === 0 ? 'sem destinatários'
        : destinatarios.length === 1 ? (destinatarios[0].nome || destinatarios[0].valor)
        : `${destinatarios.length} destinatários`;

      card.appendChild(el('div', { style: 'display:flex;gap:.6rem;align-items:baseline;padding:.3rem 0;border-top:1px solid var(--border);' }, [
        el('code', { style: 'font-size:.75rem;color:var(--fg);font-weight:600;min-width:42px;font-family:ui-monospace,monospace;' }, hora),
        el('div', { style: 'flex:1;min-width:0;' }, [
          el('div', { style: 'font-size:.8rem;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, ev.agendamento.nome || ev.agendamento.slug),
          el('div', { style: 'font-size:.65rem;color:var(--fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, destStr),
        ]),
      ]));
    });

    grid.appendChild(card);
  });
  sec.appendChild(grid);
  return sec;
}

// ============================================================
// V2.15.2 — Calendário semanal (grid 7 dias × hora)
// Mostra os próximos 7 dias começando HOJE. Cada coluna = 1 dia.
// Cada linha = 1 hora (BRT). Blocos coloridos = disparos.
// Mais visual pra ver conflitos (ex: 3 relatórios às 8h).
// ============================================================
function renderCalendarioSemana(ativos) {
  const HORIZONTE_DIAS = 7;
  const HORA_INICIO = 5;   // 5h BRT
  const HORA_FIM = 23;     // até 23h BRT

  // Coleta eventos
  const eventos = [];
  ativos.forEach(a => {
    if (!a.cron_expr) return;
    proximasExecucoes(a.cron_expr, 30, HORIZONTE_DIAS).forEach(dt => eventos.push({ dt, agendamento: a }));
  });

  const sec = el('section', { style: 'background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem;overflow-x:auto;' });
  sec.appendChild(el('div', { style: 'font-size:.7rem;color:var(--fg-muted);margin-bottom:1rem;' },
    `${HORIZONTE_DIAS}d · ${eventos.length} disparos · ${HORA_INICIO}h–${HORA_FIM}h BRT`));

  // Monta lista dos 7 dias (hoje + 6 seguintes)
  const dias = [];
  const hoje = new Date();
  for (let i = 0; i < HORIZONTE_DIAS; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    dias.push(d);
  }

  const dowLabel = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

  // Grid: 1 coluna de hora + 7 colunas de dia
  const grid = el('div', { style: `display:grid;grid-template-columns:50px repeat(${HORIZONTE_DIAS},minmax(100px,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:8px;overflow:hidden;min-width:830px;` });

  // Header: célula vazia + 7 dias
  grid.appendChild(el('div', { style: 'background:var(--bg2);padding:.5rem .25rem;' }, ''));
  dias.forEach((d, i) => {
    const isHoje = i === 0;
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    grid.appendChild(el('div', {
      style: `background:var(--bg2);padding:.5rem;text-align:center;${isHoje ? 'border-bottom:2px solid #E85C00;' : ''}`,
    }, [
      el('div', { style: `font-size:.65rem;color:${isHoje ? '#E85C00' : 'var(--fg-muted)'};font-weight:700;letter-spacing:.05em;` }, dowLabel[d.getDay()]),
      el('div', { style: `font-size:.8rem;color:${isHoje ? '#E85C00' : 'var(--fg)'};font-weight:${isHoje ? '700' : '500'};` }, `${dia}/${mes}`),
    ]));
  });

  // Linhas de hora
  for (let h = HORA_INICIO; h <= HORA_FIM; h++) {
    // Célula hora
    grid.appendChild(el('div', {
      style: 'background:var(--bg2);padding:.5rem .25rem;text-align:right;color:var(--fg-muted);font-size:.65rem;font-family:ui-monospace,monospace;',
    }, `${String(h).padStart(2, '0')}h`));

    // Células dos 7 dias nesse horário
    dias.forEach((d, idxDia) => {
      const isHoje = idxDia === 0;
      const cell = el('div', { style: `background:var(--bg);min-height:38px;padding:2px;position:relative;${isHoje ? 'box-shadow:inset 2px 0 0 rgba(232,92,0,.15);' : ''}` });
      // Filtra eventos dessa célula (mesmo dia BRT + mesma hora BRT)
      const eventosCell = eventos.filter(ev => {
        const dtBrt = new Date(ev.dt.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        return dtBrt.getDate() === d.getDate()
          && dtBrt.getMonth() === d.getMonth()
          && dtBrt.getFullYear() === d.getFullYear()
          && dtBrt.getHours() === h;
      });
      eventosCell.forEach(ev => {
        const dtBrt = new Date(ev.dt.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const min = dtBrt.getMinutes();
        const cor = '#E85C00';
        cell.appendChild(el('div', {
          style: `background:${cor};color:white;font-size:.62rem;padding:2px 4px;border-radius:3px;margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;font-weight:500;`,
          title: `${ev.agendamento.nome || ev.agendamento.slug} · ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`,
        }, `:${String(min).padStart(2,'0')} ${ev.agendamento.nome || ev.agendamento.slug}`));
      });
      grid.appendChild(cell);
    });
  }

  sec.appendChild(grid);
  return sec;
}

// ============================================================
// V2.15.2 — Toolbar busca/filtros (input + 3 selects)
// ============================================================
function renderToolbarBusca(cardsContainer) {
  // Coleta destinatários únicos pra alimentar o select
  const destinatariosUnicos = new Set();
  _state.agendamentos.forEach(a => {
    (a.destinatarios || []).forEach(d => {
      if (d.ativo === false) return;
      const label = d.nome || d.valor;
      if (label) destinatariosUnicos.add(label);
    });
  });
  const destinatariosOrdenados = [...destinatariosUnicos].sort();

  const onChange = () => rerenderCards(cardsContainer);

  const toolbar = el('div', { style: 'display:flex;gap:.6rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem;' });

  // Input busca
  const input = el('input', {
    type: 'text',
    placeholder: '🔍 buscar por nome, slug, destinatário…',
    value: _filtros.q,
    style: 'flex:1;min-width:200px;background:var(--bg);border:1px solid var(--border);color:var(--fg);padding:.45rem .7rem;border-radius:6px;font-size:.85rem;',
  });
  input.addEventListener('input', (e) => { _filtros.q = e.target.value; onChange(); });
  toolbar.appendChild(input);

  // Select status
  toolbar.appendChild(selectFiltro('status', [
    { v: 'todos', l: 'Status: todos' },
    { v: 'ativo', l: 'Status: ativos' },
    { v: 'pausado', l: 'Status: pausados' },
  ], onChange));

  // Select canal
  toolbar.appendChild(selectFiltro('canal', [
    { v: 'todos', l: 'Canal: todos' },
    { v: 'whatsapp', l: 'Canal: WhatsApp' },
    { v: 'discord', l: 'Canal: Discord' },
    { v: 'email', l: 'Canal: Email' },
  ], onChange));

  // Select destinatário (só aparece se tiver 2+ destinatários únicos)
  if (destinatariosOrdenados.length >= 2) {
    toolbar.appendChild(selectFiltro('destinatario',
      [{ v: 'todos', l: 'Destinatário: todos' }, ...destinatariosOrdenados.map(d => ({ v: d, l: d }))],
      onChange));
  }

  return toolbar;
}

function selectFiltro(chave, opcoes, onChange) {
  const sel = el('select', {
    style: 'background:var(--bg);border:1px solid var(--border);color:var(--fg);padding:.45rem .6rem;border-radius:6px;font-size:.8rem;cursor:pointer;',
  });
  opcoes.forEach(o => {
    const opt = el('option', { value: o.v }, o.l);
    if (_filtros[chave] === o.v) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', (e) => { _filtros[chave] = e.target.value; onChange(); });
  return sel;
}

// ============================================================
// Componentes visuais
// ============================================================
function statCard(emoji, label, valor, cor) {
  return el('div', { style: `background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:10px;padding:1rem 1.25rem;min-width:140px;` }, [
    el('div', { style: 'font-size:1.4rem;line-height:1;margin-bottom:.4rem;' }, emoji),
    el('div', { style: 'font-size:1.6rem;font-weight:700;color:var(--fg);line-height:1.1;' }, String(valor)),
    el('div', { style: 'font-size:.75rem;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:.2rem;' }, label),
  ]);
}

function renderSecao(titulo, lista) {
  const sec = el('section', { style: 'background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;' });
  sec.appendChild(el('h2', { style: 'font-size:.85rem;color:var(--fg);text-transform:uppercase;letter-spacing:.08em;margin-bottom:1.25rem;' }, [
    `${titulo} `,
    el('span', { style: 'display:inline-block;background:var(--bg);color:var(--fg-muted);padding:.15rem .5rem;border-radius:6px;font-size:.7rem;margin-left:.5rem;' }, String(lista.length))
  ]));

  const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:1rem;' });
  lista.forEach(a => grid.appendChild(cardAgendamento(a)));
  sec.appendChild(grid);
  return sec;
}

function cardAgendamento(a) {
  const card = el('div', {
    style: `background:var(--bg);border:1px solid var(--border);border-left:3px solid ${a.ativo ? '#22C55E' : '#94A3B8'};border-radius:10px;padding:1.25rem;display:flex;flex-direction:column;gap:.75rem;`
  });

  // Header
  card.appendChild(el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;' }, [
    el('div', { style: 'flex:1;min-width:0;' }, [
      el('div', { style: 'font-weight:700;font-size:1rem;color:var(--fg);margin-bottom:.2rem;' }, a.nome),
      el('code', { style: 'font-size:.7rem;color:var(--fg-muted);' }, a.slug),
    ]),
    el('span', {
      style: `font-size:.65rem;text-transform:uppercase;letter-spacing:.05em;padding:.2rem .5rem;border-radius:6px;background:${a.ativo ? 'rgba(34,197,94,.15)' : 'rgba(148,163,184,.15)'};color:${a.ativo ? '#22C55E' : '#94A3B8'};white-space:nowrap;`
    }, a.ativo ? 'ATIVO' : 'PAUSADO'),
  ]));

  // Detalhes
  const det = el('div', { style: 'font-size:.85rem;color:var(--fg-muted);line-height:1.6;' });
  det.appendChild(el('div', {}, [el('span', { style: 'color:var(--fg);font-weight:500;' }, '⏰ '), a.cron_descricao || descricaoCron(a.cron_expr)]));
  const destinatarios = Array.isArray(a.destinatarios) ? a.destinatarios : [];
  const destAtivos = destinatarios.filter(d => d.ativo !== false);
  det.appendChild(el('div', {}, [
    el('span', { style: 'color:var(--fg);font-weight:500;' }, '📱 '),
    destAtivos.length === 0 ? 'sem destinatários' : `${destAtivos.length} destinatário${destAtivos.length > 1 ? 's' : ''} (${destAtivos.map(d => d.nome || d.valor).join(', ')})`,
  ]));
  det.appendChild(el('div', {}, [
    el('span', { style: 'color:var(--fg);font-weight:500;' }, '🟢 '),
    `Última: ${fmtData(a.ultima_execucao)} · `,
    el('span', { style: `color:${statusCor(a.ultimo_status)};` }, a.ultimo_status || 'nunca rodou'),
  ]));
  if (a.ultimo_entregavel_id) {
    det.appendChild(el('div', {}, [
      el('span', { style: 'color:var(--fg);font-weight:500;' }, '🔗 '),
      el('a', { href: `${PUBLIC_BASE_URL}/entregavel/${a.ultimo_entregavel_id}`, target: '_blank', style: 'color:var(--accent);text-decoration:none;' }, 'abrir último entregável'),
    ]));
  }
  card.appendChild(det);

  // Ações
  const acoes = el('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.25rem;' });
  acoes.appendChild(btn('▶ Disparar', '#E85C00', () => acaoDisparar(a)));
  if (a.ativo) {
    acoes.appendChild(btn('⏸ Pausar', '#94A3B8', () => acaoPausar(a)));
  } else {
    acoes.appendChild(btn('▶ Reativar', '#22C55E', () => acaoReativar(a)));
  }
  acoes.appendChild(btn('✏ Editar', '#3B82F6', () => abrirModalEditar(a)));
  acoes.appendChild(btn('📱 Destinatários', '#8B5CF6', () => abrirModalDestinatarios(a)));
  acoes.appendChild(btn('🗑 Excluir', '#EF4444', () => acaoExcluir(a)));
  card.appendChild(acoes);

  return card;
}

function btn(texto, cor, onClick) {
  return el('button', {
    style: `background:transparent;border:1px solid ${cor};color:${cor};padding:.4rem .7rem;border-radius:6px;font-size:.75rem;font-weight:500;cursor:pointer;transition:all .15s;`,
    onmouseover: e => { e.target.style.background = cor; e.target.style.color = 'white'; },
    onmouseout: e => { e.target.style.background = 'transparent'; e.target.style.color = cor; },
    onclick: onClick,
  }, texto);
}

// ============================================================
// Ações (chamam API e recarregam lista)
// ============================================================
async function acaoDisparar(a) {
  if (!confirm(`Disparar "${a.nome}" agora? Gera entregável imediatamente e manda WhatsApp.`)) return;
  try {
    const r = await api('POST', '/api/agendamentos/disparar', { id: a.id });
    toast(`✓ Disparado · job ${r.job_id?.slice(0, 8)}... (worker pega em até 15s)`);
    setTimeout(() => renderAgendamentos(), 1500);
  } catch (e) { toast(explicarErro(e), true); }
}

async function acaoPausar(a) {
  if (!confirm(`Pausar "${a.nome}"? O cron para de disparar até reativar.`)) return;
  try {
    await api('POST', '/api/agendamentos/pausar', { id: a.id });
    toast('⏸ Pausado');
    renderAgendamentos();
  } catch (e) { toast(explicarErro(e), true); }
}

async function acaoReativar(a) {
  try {
    await api('POST', '/api/agendamentos/reativar', { id: a.id });
    toast('▶ Reativado');
    renderAgendamentos();
  } catch (e) { toast(explicarErro(e), true); }
}

async function acaoExcluir(a) {
  if (!confirm(`EXCLUIR DEFINITIVO "${a.nome}"?\n\nIsso remove o agendamento, o cron no pg_cron, e os destinatários. Os entregáveis já gerados NÃO são apagados — só param de aparecer aqui.\n\nIrreversível. Confirma?`)) return;
  try {
    await api('POST', '/api/agendamentos/excluir', { id: a.id });
    toast('🗑 Excluído');
    renderAgendamentos();
  } catch (e) { toast(explicarErro(e), true); }
}

// ============================================================
// Modal: Editar horário
// ============================================================
function abrirModalEditar(a) {
  const horaBrt = utcParaBrt(a.cron_expr);
  const partes = horaBrt.trim().split(/\s+/);
  const m = partes[0] || '0';
  const h = partes[1] || '8';
  const dow = partes[4] || '*';

  modalOverlay([
    el('h2', { style: 'margin:0 0 1rem;color:var(--fg);' }, 'Editar horário'),
    el('p', { style: 'color:var(--fg-muted);font-size:.85rem;margin-bottom:1.5rem;' }, `Agendamento: ${a.nome}`),

    campoSelect('Frequência', 'freq', [
      { v: 'diario', t: 'Todo dia' },
      { v: 'semanal', t: 'Dias específicos da semana' },
    ], 'diario'),

    campoInput('Hora (BRT)', 'hora', `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'time'),

    el('div', { id: 'campo-dias', style: 'display:none;margin-bottom:1rem;' }, [
      el('label', { style: 'display:block;font-size:.8rem;color:var(--fg-muted);margin-bottom:.4rem;' }, 'Dias da semana'),
      el('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap;' },
        ['1', '2', '3', '4', '5', '6', '0'].map(d => {
          const nomes = { '0': 'D', '1': 'S', '2': 'T', '3': 'Q', '4': 'Q', '5': 'S', '6': 'S' };
          return el('label', { style: 'cursor:pointer;display:flex;align-items:center;gap:.3rem;padding:.4rem .6rem;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:.85rem;' }, [
            el('input', { type: 'checkbox', name: 'dia', value: d }),
            nomes[d]
          ]);
        })
      ),
    ]),

    modalAcoes(
      async () => {
        const overlay = document.getElementById('modal-overlay');
        const hora = overlay.querySelector('[name=hora]').value;
        const [hh, mm] = hora.split(':');
        const freq = overlay.querySelector('[name=freq]').value;
        let dowSel = '*';
        if (freq === 'semanal') {
          const dias = [...overlay.querySelectorAll('input[name=dia]:checked')].map(c => c.value);
          if (dias.length === 0) return toast('Selecione pelo menos 1 dia', true);
          dowSel = dias.join(',');
        }
        const cronBrt = `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * ${dowSel}`;
        const cronUtc = brtParaUtc(cronBrt);
        try {
          await api('POST', '/api/agendamentos/atualizar', {
            id: a.id,
            campos: { cron_expr: cronUtc, cron_descricao: descricaoCron(cronUtc) },
          });
          toast('✓ Horário atualizado');
          fecharModal();
          renderAgendamentos();
        } catch (e) { toast(explicarErro(e), true); }
      }
    ),
  ]);

  // Listener pra mostrar/esconder dias da semana
  setTimeout(() => {
    const sel = document.querySelector('[name=freq]');
    const campoDias = document.getElementById('campo-dias');
    sel.addEventListener('change', () => {
      campoDias.style.display = sel.value === 'semanal' ? 'block' : 'none';
    });
    if (dow !== '*' && dow !== '') {
      sel.value = 'semanal';
      campoDias.style.display = 'block';
      dow.split(',').forEach(d => {
        const chk = document.querySelector(`input[name=dia][value="${d}"]`);
        if (chk) chk.checked = true;
      });
    }
  }, 0);
}

// ============================================================
// Modal: Destinatários (lista + add + toggle + remove)
// ============================================================
async function abrirModalDestinatarios(a) {
  // Lê destinatários direto do Supabase (sem depender do server-cli ligado)
  const sb = getSupabase();
  const rSb = await sb.from('relatorios_destinatarios')
    .select('id, canal, valor, nome, ativo, criado_em')
    .eq('relatorio_id', a.id)
    .order('criado_em');
  if (rSb.error) { toast(`✗ ${rSb.error.message}`, true); return; }
  const destinatarios = rSb.data || [];

  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.5rem;max-height:300px;overflow-y:auto;' });
  if (destinatarios.length === 0) {
    lista.appendChild(el('div', { style: 'padding:1rem;text-align:center;color:var(--fg-muted);font-size:.85rem;background:var(--bg);border:1px dashed var(--border);border-radius:8px;' }, 'Nenhum destinatário cadastrado'));
  } else {
    destinatarios.forEach(d => {
      const item = el('div', {
        style: `display:flex;align-items:center;gap:.75rem;padding:.6rem .9rem;background:var(--bg);border:1px solid var(--border);border-left:3px solid ${d.ativo ? '#22C55E' : '#94A3B8'};border-radius:8px;`
      }, [
        el('div', { style: 'flex:1;min-width:0;' }, [
          el('div', { style: 'font-weight:500;color:var(--fg);font-size:.9rem;' }, d.nome || d.valor),
          el('div', { style: 'color:var(--fg-muted);font-size:.75rem;' }, `${d.canal} · ${d.valor}`),
        ]),
        btn(d.ativo ? '⏸' : '▶', d.ativo ? '#94A3B8' : '#22C55E', async () => {
          await api('POST', `/api/destinatarios/${d.id}/toggle`);
          fecharModal();
          abrirModalDestinatarios(a);
        }),
        btn('🗑', '#EF4444', async () => {
          if (!confirm(`Remover destinatário ${d.nome || d.valor}?`)) return;
          await fetch(PUBLIC_BASE_URL + `/api/destinatarios/${d.id}`, { method: 'DELETE' });
          fecharModal();
          abrirModalDestinatarios(a);
        }),
      ]);
      lista.appendChild(item);
    });
  }

  modalOverlay([
    el('h2', { style: 'margin:0 0 .5rem;color:var(--fg);' }, '📱 Destinatários'),
    el('p', { style: 'color:var(--fg-muted);font-size:.85rem;margin-bottom:1.5rem;' }, `Agendamento: ${a.nome}`),

    lista,

    el('div', { style: 'background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:1rem;' }, [
      el('div', { style: 'font-size:.85rem;color:var(--fg);font-weight:600;margin-bottom:.75rem;' }, 'Adicionar novo'),
      el('div', { style: 'display:grid;grid-template-columns:120px 1fr;gap:.5rem;margin-bottom:.5rem;' }, [
        el('select', { id: 'novo-canal', style: campoStyle() }, [
          el('option', { value: 'whatsapp' }, 'WhatsApp'),
          // email/discord/telegram entram quando worker suportar (frente futura)
        ]),
        el('input', { id: 'novo-valor', type: 'text', placeholder: '5511999999999 (com DDI)', style: campoStyle() }),
      ]),
      el('input', { id: 'novo-nome', type: 'text', placeholder: 'Nome (opcional, ex: André)', style: campoStyle() + 'width:100%;margin-bottom:.5rem;' }),
      el('button', {
        style: 'background:var(--accent);color:white;border:none;padding:.5rem 1rem;border-radius:6px;cursor:pointer;font-size:.85rem;font-weight:500;width:100%;',
        onclick: async () => {
          const canal = document.getElementById('novo-canal').value;
          const valor = document.getElementById('novo-valor').value.trim();
          const nome = document.getElementById('novo-nome').value.trim() || null;
          if (!valor) return toast('Preenche o número', true);
          try {
            await api('POST', `/api/agendamentos/${a.id}/destinatarios`, { canal, valor, nome });
            fecharModal();
            abrirModalDestinatarios(a);
            renderAgendamentos();
          } catch (e) { toast(explicarErro(e), true); }
        },
      }, '+ Adicionar destinatário'),
    ]),

    el('div', { style: 'display:flex;justify-content:flex-end;margin-top:1.5rem;' }, [
      el('button', {
        style: 'background:transparent;border:1px solid var(--border);color:var(--fg);padding:.5rem 1rem;border-radius:6px;cursor:pointer;',
        onclick: () => fecharModal(),
      }, 'Fechar')
    ]),
  ]);
}

// ============================================================
// Modal: Criar agendamento novo
// ============================================================
function abrirModalCriar() {
  if (_state.catalogo.length === 0) {
    toast('Nenhum relatório no catálogo. Construa Skills primeiro.', true);
    return;
  }

  modalOverlay([
    el('h2', { style: 'margin:0 0 .5rem;color:var(--fg);' }, '+ Novo agendamento'),
    el('p', { style: 'color:var(--fg-muted);font-size:.85rem;margin-bottom:1.5rem;' },
      `Catálogo: ${_state.catalogo.length} relatório${_state.catalogo.length > 1 ? 's' : ''} disponíve${_state.catalogo.length > 1 ? 'is' : 'l'}`),

    el('label', { style: 'display:block;font-size:.8rem;color:var(--fg-muted);margin-bottom:.4rem;margin-top:1rem;' }, 'Relatório'),
    el('select', { id: 'novo-slug', style: campoStyle() + 'width:100%;margin-bottom:1rem;' },
      _state.catalogo.map(c => el('option', { value: c.slug }, `${c.nome} (${c.slug})`))
    ),

    campoInput('Nome amigável', 'novo-nome-rel', '', 'text', 'Ex: Executivo da manhã'),

    el('label', { style: 'display:block;font-size:.8rem;color:var(--fg-muted);margin-bottom:.4rem;margin-top:1rem;' }, 'Frequência'),
    el('select', { id: 'criar-freq', style: campoStyle() + 'width:100%;margin-bottom:1rem;' }, [
      el('option', { value: 'diario' }, 'Todo dia'),
      el('option', { value: 'semanal' }, 'Dias específicos da semana'),
    ]),

    campoInput('Hora (BRT)', 'criar-hora', '08:00', 'time'),

    el('div', { id: 'criar-campo-dias', style: 'display:none;margin-bottom:1rem;' }, [
      el('label', { style: 'display:block;font-size:.8rem;color:var(--fg-muted);margin-bottom:.4rem;' }, 'Dias da semana'),
      el('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap;' },
        ['1', '2', '3', '4', '5', '6', '0'].map(d => {
          const nomes = { '0': 'Dom', '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb' };
          return el('label', { style: 'cursor:pointer;display:flex;align-items:center;gap:.3rem;padding:.4rem .6rem;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:.85rem;' }, [
            el('input', { type: 'checkbox', name: 'criar-dia', value: d }),
            nomes[d]
          ]);
        })
      ),
    ]),

    el('label', { style: 'display:block;font-size:.8rem;color:var(--fg-muted);margin-bottom:.4rem;margin-top:1rem;' }, 'Destinatário inicial (WhatsApp)'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:1.5rem;' }, [
      el('input', { id: 'criar-numero', type: 'text', placeholder: 'Número com DDI (5511...)', style: campoStyle() }),
      el('input', { id: 'criar-nome-dest', type: 'text', placeholder: 'Nome (opcional)', style: campoStyle() }),
    ]),

    modalAcoes(async () => {
      const slug = document.getElementById('novo-slug').value;
      const catItem = _state.catalogo.find(c => c.slug === slug);
      const nome = document.getElementById('novo-nome-rel').value.trim() || catItem.nome;
      const hora = document.getElementById('criar-hora').value;
      const [hh, mm] = hora.split(':');
      const freq = document.getElementById('criar-freq').value;
      let dow = '*';
      if (freq === 'semanal') {
        const dias = [...document.querySelectorAll('input[name=criar-dia]:checked')].map(c => c.value);
        if (dias.length === 0) return toast('Selecione pelo menos 1 dia', true);
        dow = dias.join(',');
      }
      const cronBrt = `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * ${dow}`;
      const cronUtc = brtParaUtc(cronBrt);
      const cronDesc = descricaoCron(cronUtc);

      const numero = document.getElementById('criar-numero').value.trim();
      // Nome do destinatário fica vazio se não preenchido — UI mostra o número
      // no lugar. Andre 2026-05-13: não chumbar "Sócio" porque pode ser pra
      // pessoa externa (cliente, parceiro, funcionário).
      const nomeDest = document.getElementById('criar-nome-dest').value.trim() || null;
      const destinatarios = numero ? [{ canal: 'whatsapp', valor: numero, nome: nomeDest }] : [];

      // Slug único: usa slug do catálogo + sufixo se já existe
      const slugsExistentes = _state.agendamentos.map(a => a.slug);
      let slugFinal = slug;
      if (slugsExistentes.includes(slugFinal)) {
        const ts = Date.now().toString(36);
        slugFinal = `${slug}-${ts}`;
      }

      try {
        await api('POST', '/api/agendamentos/criar', {
          cliente_id: _state.socioCid,
          slug: slugFinal,
          nome,
          descricao: catItem.descricao,
          modulos: [], // worker resolve internamente baseado no slug
          sintetizador: 'compor-executivo-diario',
          cron_expr: cronUtc,
          cron_descricao: cronDesc,
          destinatarios,
          ativo_inicial: true,
        });
        toast('✓ Agendamento criado');
        fecharModal();
        renderAgendamentos();
      } catch (e) { toast(explicarErro(e), true); }
    }),
  ]);

  setTimeout(() => {
    const sel = document.getElementById('criar-freq');
    const campoDias = document.getElementById('criar-campo-dias');
    sel.addEventListener('change', () => {
      campoDias.style.display = sel.value === 'semanal' ? 'block' : 'none';
    });
  }, 0);
}

// ============================================================
// Helpers de modal
// ============================================================
function campoStyle() {
  return 'background:var(--bg);border:1px solid var(--border);color:var(--fg);padding:.5rem .75rem;border-radius:6px;font-size:.85rem;font-family:inherit;';
}

function campoInput(label, id, valor, type = 'text', placeholder = '') {
  return el('div', { style: 'margin-bottom:1rem;' }, [
    el('label', { style: 'display:block;font-size:.8rem;color:var(--fg-muted);margin-bottom:.4rem;' }, label),
    el('input', { id, name: id, type, value: valor, placeholder, style: campoStyle() + 'width:100%;' }),
  ]);
}

function campoSelect(label, id, opcoes, valorPadrao) {
  return el('div', { style: 'margin-bottom:1rem;' }, [
    el('label', { style: 'display:block;font-size:.8rem;color:var(--fg-muted);margin-bottom:.4rem;' }, label),
    el('select', { id, name: id, style: campoStyle() + 'width:100%;' },
      opcoes.map(o => {
        const opt = el('option', { value: o.v }, o.t);
        if (o.v === valorPadrao) opt.setAttribute('selected', 'selected');
        return opt;
      })
    ),
  ]);
}

function modalAcoes(onSalvar) {
  return el('div', { style: 'display:flex;justify-content:flex-end;gap:.5rem;margin-top:1.5rem;' }, [
    el('button', {
      style: 'background:transparent;border:1px solid var(--border);color:var(--fg);padding:.5rem 1rem;border-radius:6px;cursor:pointer;',
      onclick: () => fecharModal(),
    }, 'Cancelar'),
    el('button', {
      style: 'background:var(--accent);color:white;border:none;padding:.5rem 1.25rem;border-radius:6px;cursor:pointer;font-weight:600;',
      onclick: onSalvar,
    }, 'Salvar'),
  ]);
}

function modalOverlay(conteudo) {
  fecharModal();
  const overlay = el('div', {
    id: 'modal-overlay',
    style: 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;',
    onclick: e => { if (e.target.id === 'modal-overlay') fecharModal(); },
  }, [
    el('div', { style: 'background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.75rem;max-width:540px;width:100%;max-height:90vh;overflow-y:auto;' }, conteudo),
  ]);
  document.body.appendChild(overlay);
}

function fecharModal() {
  const m = document.getElementById('modal-overlay');
  if (m) m.remove();
}

// ============================================================
// Toast notification
// ============================================================
function toast(msg, isError = false) {
  const t = el('div', {
    style: `position:fixed;bottom:2rem;right:2rem;padding:.85rem 1.25rem;background:${isError ? '#EF4444' : '#22C55E'};color:white;border-radius:8px;z-index:99999;font-size:.9rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.3);`
  }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
