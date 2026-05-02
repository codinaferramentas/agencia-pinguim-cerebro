/**
 * Customer Profile — Pinguim OS
 *
 * 5a familia conceitual de Cerebro: pra quem vendemos.
 * Brainstorm 2026-05-02 com Andre. Memoria viva de cada lead/cliente,
 * alimentada por Clint via webhook + onboarding + eventos comportamentais.
 *
 * UI: lista paginada (50 por vez), busca por email/nome, chips de status,
 * detalhe lateral com timeline de compras + eventos.
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

const PAGE_SIZE = 50;
let estado = {
  busca: '',
  status: null,        // null | 'lead' | 'cliente' | 'ex-cliente'
  carregados: [],      // acumula ao scrollar
  total: 0,
  loading: false,
  emailDetalhe: null,  // se setado, mostra detalhe lateral
};

const _nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (v) => _nfBRL.format(Number(v || 0));

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'agora há pouco';
  if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `há ${Math.floor(diff / 3600000)}h`;
  if (diff < 86400000 * 7) return `há ${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export async function renderCustomerProfile() {
  const page = document.getElementById('page-customer-profile');
  page.innerHTML = '';

  // Reset ao entrar
  estado.carregados = [];
  estado.total = 0;
  estado.emailDetalhe = null;

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, '🪪 Customer Profile'),
        el('div', { class: 'page-subtitle' },
          'Memória viva de cada lead/cliente. Alimentada por Clint, onboarding e eventos comportamentais. Conhecimento que o agente comercial usa pra atender com contexto.'),
      ]),
    ]),
    el('div', { id: 'cp-stats', class: 'cp-stats' }),
    el('div', { id: 'cp-filtros', class: 'cp-filtros' }),
    el('div', { id: 'cp-conteudo', class: 'cp-conteudo' }),
    el('div', { id: 'cp-detalhe', class: 'cp-detalhe' }),
  );

  await Promise.all([carregarStats(), carregarLista(true)]);
  renderFiltros();
}

async function carregarStats() {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('stats_customer_profiles');
  if (error) return;
  const s = data || {};
  const cont = document.getElementById('cp-stats');
  if (!cont) return;
  cont.replaceChildren(
    statCard('👥', 'Total', s.total || 0, null),
    statCard('🌱', 'Leads', s.leads || 0, 'lead'),
    statCard('💼', 'Clientes', s.clientes || 0, 'cliente'),
    statCard('💤', 'Ex-clientes', s.ex_clientes || 0, 'ex-cliente'),
    statCard('💰', 'LTV total', fmtBRL(s.ltv_total_brl || 0), null, true),
  );
}

function statCard(icon, label, valor, statusFiltro, isMoeda = false) {
  return el('div', {
    class: 'cp-stat-card' + (statusFiltro && estado.status === statusFiltro ? ' active' : ''),
    onclick: statusFiltro !== undefined ? () => {
      estado.status = (estado.status === statusFiltro) ? null : statusFiltro;
      estado.carregados = [];
      carregarLista(true);
      renderFiltros();
      // re-render stats pra atualizar destaque
      document.querySelectorAll('.cp-stat-card').forEach(c => c.classList.remove('active'));
      if (estado.status) {
        // Encontra o card desse status e marca
        const cards = document.querySelectorAll('.cp-stat-card');
        cards.forEach(c => {
          if (c.dataset.status === estado.status) c.classList.add('active');
        });
      }
    } : null,
    data: { status: statusFiltro || '' },
  }, [
    el('div', { class: 'cp-stat-icon' }, icon),
    el('div', { class: 'cp-stat-info' }, [
      el('div', { class: 'cp-stat-label' }, label),
      el('div', { class: 'cp-stat-valor' + (isMoeda ? ' moeda' : '') }, String(valor)),
    ]),
  ]);
}

function renderFiltros() {
  const cont = document.getElementById('cp-filtros');
  if (!cont) return;

  cont.replaceChildren(
    el('div', { class: 'cp-busca-wrap' }, [
      el('span', { class: 'cp-busca-icon' }, '🔎'),
      el('input', {
        type: 'text',
        class: 'cp-busca-input',
        placeholder: 'Buscar por e-mail ou nome…',
        value: estado.busca,
        oninput: debounce((e) => {
          estado.busca = e.target.value;
          estado.carregados = [];
          carregarLista(true);
        }, 300),
      }),
      estado.busca
        ? el('button', {
            class: 'cp-busca-limpar',
            title: 'Limpar busca',
            onclick: () => {
              estado.busca = '';
              estado.carregados = [];
              carregarLista(true);
              renderFiltros();
            },
          }, '×')
        : null,
    ]),
    estado.status
      ? el('div', { class: 'cp-status-ativo' }, [
          el('span', {}, `Filtrando: ${labelStatus(estado.status)}`),
          el('button', {
            class: 'cp-status-limpar',
            onclick: () => {
              estado.status = null;
              estado.carregados = [];
              carregarLista(true);
              renderFiltros();
              document.querySelectorAll('.cp-stat-card').forEach(c => c.classList.remove('active'));
            },
          }, '× limpar'),
        ])
      : null,
  );
}

function labelStatus(s) {
  return { lead: 'Leads', cliente: 'Clientes', 'ex-cliente': 'Ex-clientes' }[s] || s;
}

let buscaTimer = null;
function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => fn(...args), ms);
  };
}

async function carregarLista(reset = false) {
  if (estado.loading) return;
  estado.loading = true;
  const cont = document.getElementById('cp-conteudo');
  if (!cont) { estado.loading = false; return; }

  if (reset) {
    cont.innerHTML = '<div class="cp-loading">Carregando…</div>';
  }

  const sb = getSupabase();
  const offset = reset ? 0 : estado.carregados.length;

  const [{ data, error }, { data: total }] = await Promise.all([
    sb.rpc('listar_customer_profiles', {
      p_busca: estado.busca,
      p_status: estado.status,
      p_offset: offset,
      p_limit: PAGE_SIZE,
    }),
    sb.rpc('contar_customer_profiles', {
      p_busca: estado.busca,
      p_status: estado.status,
    }),
  ]);

  if (error) {
    cont.innerHTML = `<div class="seguranca-erro">Erro: ${error.message}</div>`;
    estado.loading = false;
    return;
  }

  estado.total = Number(total || 0);
  estado.carregados = reset ? (data || []) : [...estado.carregados, ...(data || [])];
  renderLista();
  estado.loading = false;
}

function renderLista() {
  const cont = document.getElementById('cp-conteudo');
  if (!cont) return;

  if (estado.carregados.length === 0) {
    cont.replaceChildren(el('div', { class: 'seguranca-empty' },
      estado.busca || estado.status
        ? `Nenhum customer profile com esses filtros.`
        : 'Nenhum customer profile cadastrado ainda. Vai aparecer aqui assim que a integração com Clint começar a pingar.'),
    );
    return;
  }

  const tabela = el('table', { class: 'cp-tabela' });
  tabela.append(
    el('thead', {}, [el('tr', {}, [
      el('th', {}, 'Cliente'),
      el('th', {}, 'Status'),
      el('th', { style: 'text-align:right' }, 'LTV'),
      el('th', { style: 'text-align:right' }, 'Compras'),
      el('th', { style: 'text-align:right' }, 'Eventos'),
      el('th', {}, 'Última atividade'),
    ])]),
    el('tbody', {}, estado.carregados.map(c => el('tr', {
      class: 'cp-row',
      onclick: () => abrirDetalhe(c.email),
    }, [
      el('td', {}, [
        el('div', { class: 'cp-nome' }, c.nome || '—'),
        el('div', { class: 'cp-email' }, c.email),
      ]),
      el('td', {}, el('span', { class: `cp-pill cp-pill-${c.status}` }, labelStatus(c.status))),
      el('td', { style: 'text-align:right;font-family:var(--font-mono)' }, fmtBRL(c.ltv_total_brl)),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, String(c.qtd_compras || 0)),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, String(c.qtd_eventos || 0)),
      el('td', { style: 'color:var(--fg-muted);font-size:.8125rem' }, formatarData(c.ultima_atividade_em)),
    ]))),
  );

  const elementos = [tabela];

  // Footer com contador + botao "carregar mais"
  const restantes = estado.total - estado.carregados.length;
  if (restantes > 0) {
    elementos.push(el('div', { class: 'cp-paginacao' }, [
      el('span', {}, `${estado.carregados.length} de ${estado.total}`),
      el('button', {
        class: 'btn btn-ghost',
        onclick: () => carregarLista(false),
      }, `Carregar mais ${Math.min(PAGE_SIZE, restantes)}`),
    ]));
  } else {
    elementos.push(el('div', { class: 'cp-paginacao' },
      el('span', {}, `${estado.carregados.length} customer profile${estado.carregados.length === 1 ? '' : 's'}`),
    ));
  }

  cont.replaceChildren(...elementos);
}

async function abrirDetalhe(email) {
  estado.emailDetalhe = email;
  const sb = getSupabase();
  const cont = document.getElementById('cp-detalhe');
  if (!cont) return;

  cont.innerHTML = '';
  cont.classList.add('open');
  cont.append(el('div', { class: 'cp-detalhe-loading' }, 'Carregando perfil…'));

  const { data, error } = await sb.rpc('get_customer_profile', { p_email: email });
  if (error || !data) {
    cont.innerHTML = `<div class="seguranca-erro">Erro: ${error?.message || 'Não encontrado'}</div>`;
    return;
  }

  const { profile, compras, eventos } = data;

  const fechar = el('button', {
    class: 'cp-detalhe-fechar',
    onclick: () => {
      cont.classList.remove('open');
      estado.emailDetalhe = null;
    },
  }, '×');

  cont.replaceChildren(
    fechar,
    el('div', { class: 'cp-detalhe-head' }, [
      el('h2', {}, profile.nome || profile.email),
      el('div', { class: 'cp-detalhe-email' }, profile.email),
      el('div', { class: 'cp-detalhe-meta' }, [
        el('span', { class: `cp-pill cp-pill-${profile.status}` }, labelStatus(profile.status)),
        el('span', { class: 'cp-detalhe-ltv' }, fmtBRL(profile.ltv_total_brl)),
        profile.health_score != null
          ? el('span', { class: 'cp-detalhe-health' }, `❤ ${profile.health_score}`)
          : null,
      ]),
    ]),
    el('div', { class: 'cp-detalhe-bloco' }, [
      el('h3', {}, `🛒 Compras (${compras.length})`),
      compras.length === 0
        ? el('div', { class: 'cp-detalhe-vazio' }, 'Nenhuma compra ainda.')
        : el('table', { class: 'cp-detalhe-tabela' }, [
            el('tbody', {}, compras.map(c => el('tr', {}, [
              el('td', {}, c.produto_nome),
              el('td', { style: 'font-family:var(--font-mono)' }, fmtBRL(c.valor_brl)),
              el('td', {}, el('span', { class: `cp-pill cp-pill-compra-${c.status}` }, c.status)),
              el('td', { style: 'color:var(--fg-muted);font-size:.75rem' }, formatarData(c.comprado_em)),
            ]))),
          ]),
    ]),
    el('div', { class: 'cp-detalhe-bloco' }, [
      el('h3', {}, `📋 Timeline de eventos (${eventos.length})`),
      eventos.length === 0
        ? el('div', { class: 'cp-detalhe-vazio' }, 'Nenhum evento registrado ainda.')
        : el('div', { class: 'cp-timeline' }, eventos.map(e => el('div', { class: 'cp-evento' }, [
            el('div', { class: 'cp-evento-head' }, [
              el('span', { class: 'cp-evento-tipo' }, e.tipo),
              el('span', { class: 'cp-evento-origem' }, e.origem),
              el('span', { class: 'cp-evento-data' }, formatarData(e.ocorrido_em)),
            ]),
            e.titulo ? el('div', { class: 'cp-evento-titulo' }, e.titulo) : null,
          ]))),
    ]),
  );
}
