/* Tela Home — overview do Pinguim OS */

import { fetchCerebrosCatalogo, getSupabase } from './sb-client.js?v=20260421p';

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

export async function renderHome() {
  const page = document.getElementById('page-home');
  page.innerHTML = '';

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Pinguim OS'),
        el('div', { class: 'page-subtitle' }, 'Visão geral do sistema. O que existe, o que está rolando, quanto está custando.'),
      ]),
    ])
  );

  const grid = el('div', { class: 'home-grid' });
  page.append(grid);
  grid.appendChild(el('div', { style: 'grid-column:1/-1;padding:2rem;text-align:center;color:var(--fg-muted)' }, 'Carregando…'));

  const sb = getSupabase();
  if (!sb) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:2rem;color:var(--fg-muted)">Sem conexão com o banco.</div>';
    return;
  }

  // Em paralelo: catalogo, custo total, fontes recentes, integracoes
  const [cerebros, custoTotal, fontesRecentes, integracoes] = await Promise.all([
    fetchCerebrosCatalogo().catch(() => []),
    fetchCustoTotal(sb),
    fetchFontesRecentes(sb),
    fetchIntegracoesStatus(sb),
  ]);

  const cerebrosProdutos = cerebros.filter(c => c.slug !== 'pinguim');
  const totalFontes = cerebrosProdutos.reduce((s, c) => s + (c.total_fontes || 0), 0);
  const cerebrosAtivos = cerebrosProdutos.filter(c => (c.total_fontes || 0) > 0).length;
  const cerebrosConstrucao = cerebrosProdutos.length - cerebrosAtivos;
  const custoBrl = (custoTotal * 5.5).toFixed(2);

  grid.innerHTML = '';

  // Linha de cards principais
  grid.append(
    homeCard({
      titulo: '🧠 Cérebros',
      valor: cerebrosAtivos,
      sub: `${cerebrosProdutos.length} totais · ${cerebrosConstrucao} sem fontes`,
      onclick: () => navegarPara('cerebros'),
    }),
    homeCard({
      titulo: '📚 Fontes indexadas',
      valor: totalFontes,
      sub: 'Total acumulado · todos os Cérebros',
      onclick: () => navegarPara('cerebros'),
    }),
    homeCard({
      titulo: '💸 Custo IA acumulado',
      valor: `R$ ${custoBrl}`,
      sub: `US$ ${custoTotal.toFixed(4)} · ingest, vision, whisper, embeddings`,
      destaque: 'custo',
    }),
    homeCard({
      titulo: '🔌 Integrações',
      valor: `${integracoes.ativas}/${integracoes.total}`,
      sub: integracoes.ativas === integracoes.total
        ? 'Todas conectadas'
        : `${integracoes.total - integracoes.ativas} pendente${integracoes.total - integracoes.ativas === 1 ? '' : 's'} de chave`,
      onclick: () => navegarPara('integracoes'),
    }),
  );

  // Top Cérebros (mais alimentados)
  const topCerebros = [...cerebrosProdutos]
    .sort((a, b) => (b.total_fontes || 0) - (a.total_fontes || 0))
    .slice(0, 3);

  if (topCerebros.length > 0) {
    const cardTop = el('div', { class: 'home-painel', style: 'grid-column:span 2' }, [
      el('h3', {}, '🏆 Cérebros mais alimentados'),
      el('div', { class: 'home-top-lista' },
        topCerebros.map((c, idx) => el('div', {
          class: 'home-top-item',
          style: 'cursor:pointer',
          onclick: () => navegarParaCerebro(c.slug),
        }, [
          el('div', { class: 'home-top-pos' }, `#${idx + 1}`),
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { class: 'home-top-nome' }, c.nome),
            el('div', { class: 'home-top-meta' },
              `${c.total_fontes} fontes · última carga ${formatarTempoRelativo(c.ultima_alimentacao)}`),
          ]),
          el('div', { class: 'home-top-bar-wrap' }, [
            el('div', {
              class: 'home-top-bar',
              style: `width:${Math.min(100, (c.total_fontes / Math.max(1, topCerebros[0].total_fontes)) * 100)}%`,
            }),
          ]),
        ]))
      ),
    ]);
    grid.append(cardTop);
  }

  // Atividade recente
  if (fontesRecentes.length > 0) {
    const cardAtiv = el('div', { class: 'home-painel', style: 'grid-column:span 2' }, [
      el('h3', {}, '📥 Atividade recente'),
      el('div', { class: 'home-ativ-lista' },
        fontesRecentes.map(f => el('div', { class: 'home-ativ-item' }, [
          el('div', { class: 'home-ativ-tipo' }, iconePorTipo(f.tipo)),
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { class: 'home-ativ-titulo' }, f.titulo),
            el('div', { class: 'home-ativ-meta' },
              `${labelTipo(f.tipo)} · ${f.cerebro_nome || '?'} · ${formatarTempoRelativo(f.criado_em)}`),
          ]),
        ]))
      ),
    ]);
    grid.append(cardAtiv);
  }

  // Próximos passos sugeridos
  const sugestoes = [];
  if (cerebrosConstrucao > 0) {
    sugestoes.push({
      icone: '⚡',
      texto: `${cerebrosConstrucao} Cérebro${cerebrosConstrucao === 1 ? '' : 's'} sem fontes — alimente pra desbloquear personas e busca semântica`,
      acao: () => navegarPara('cerebros'),
    });
  }
  if (integracoes.ativas < integracoes.total) {
    sugestoes.push({
      icone: '🔌',
      texto: 'Configure RapidAPI e Apify pra capturar conteúdo de YouTube sem legenda + Instagram/TikTok',
      acao: () => navegarPara('integracoes'),
    });
  }
  sugestoes.push({
    icone: '📖',
    texto: 'Leia a Documentação pra entender cada módulo e mostrar pros sócios',
    acao: () => navegarPara('docs'),
  });

  if (sugestoes.length > 0) {
    const cardSug = el('div', { class: 'home-painel', style: 'grid-column:1/-1' }, [
      el('h3', {}, '🎯 Próximos passos'),
      el('div', { class: 'home-sug-lista' },
        sugestoes.map(s => el('div', {
          class: 'home-sug-item',
          style: 'cursor:pointer',
          onclick: s.acao,
        }, [
          el('span', { class: 'home-sug-icone' }, s.icone),
          el('span', { style: 'flex:1' }, s.texto),
          el('span', { class: 'home-sug-seta' }, '›'),
        ]))
      ),
    ]);
    grid.append(cardSug);
  }
}

// ---------- Helpers de fetch ----------
async function fetchCustoTotal(sb) {
  try {
    const [{ data: lotes }, { data: integ }] = await Promise.all([
      sb.from('ingest_lotes').select('custo_usd'),
      sb.from('vw_integracoes').select('custo_acumulado_usd'),
    ]);
    const custoLotes = (lotes || []).reduce((s, l) => s + Number(l.custo_usd || 0), 0);
    const custoInteg = (integ || []).reduce((s, i) => s + Number(i.custo_acumulado_usd || 0), 0);
    return custoLotes + custoInteg;
  } catch { return 0; }
}

async function fetchFontesRecentes(sb) {
  try {
    const { data, error } = await sb.from('cerebro_fontes')
      .select('id, titulo, tipo, criado_em, cerebro_id')
      .order('criado_em', { ascending: false })
      .limit(5);
    if (error || !data) return [];
    // Resolve nome do cerebro
    const cerebroIds = [...new Set(data.map(f => f.cerebro_id))];
    const { data: cerebros } = await sb.from('cerebros').select('id, produto_id').in('id', cerebroIds);
    const produtoIds = (cerebros || []).map(c => c.produto_id);
    const { data: produtos } = produtoIds.length ? await sb.from('produtos').select('id, nome').in('id', produtoIds) : { data: [] };
    const nomeMap = {};
    (cerebros || []).forEach(c => {
      const p = (produtos || []).find(x => x.id === c.produto_id);
      nomeMap[c.id] = p?.nome || '?';
    });
    return data.map(f => ({ ...f, cerebro_nome: nomeMap[f.cerebro_id] }));
  } catch { return []; }
}

async function fetchIntegracoesStatus(sb) {
  try {
    const { data } = await sb.from('vw_integracoes').select('status');
    const total = (data || []).length;
    const ativas = (data || []).filter(i => i.status === 'ativa').length;
    return { total, ativas };
  } catch { return { total: 0, ativas: 0 }; }
}

// ---------- Helpers visuais ----------
function homeCard({ titulo, valor, sub, onclick, destaque }) {
  return el('div', {
    class: 'home-card' + (destaque === 'custo' ? ' home-card-custo' : ''),
    onclick: onclick || (() => {}),
    style: onclick ? 'cursor:pointer' : '',
  }, [
    el('h3', {}, titulo),
    el('div', { class: 'big' }, String(valor)),
    el('div', { class: 'lbl' }, sub),
  ]);
}

function navegarPara(pageSlug) {
  document.querySelector(`.nav-item[data-page="${pageSlug}"]`)?.click();
}

function navegarParaCerebro(slug) {
  // Abre cerebros + dispara select
  navegarPara('cerebros');
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('cerebro:select', { detail: { slug } }));
  }, 200);
}

function labelTipo(t) {
  const map = {
    aula: '📚 Aula', pagina_venda: '📄 Página', depoimento: '⭐ Depoimento',
    objecao: '❓ Objeção', sacada: '💡 Sacada', pesquisa: '📋 Pesquisa',
    chat_export: '💬 Chat', pitch: '🎯 Pitch', faq: '📖 FAQ',
    externo: '🔗 Externo', csv: '📊 CSV', outro: '📦 Outro',
  };
  return map[t] || t;
}

function iconePorTipo(t) {
  const map = {
    aula: '📚', pagina_venda: '📄', depoimento: '⭐', objecao: '❓',
    sacada: '💡', pesquisa: '📋', chat_export: '💬', pitch: '🎯',
    faq: '📖', externo: '🔗', csv: '📊', outro: '📦',
  };
  return map[t] || '📦';
}

function formatarTempoRelativo(timestamp) {
  if (!timestamp) return 'sem registro';
  const diff = Date.now() - new Date(timestamp).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const m = Math.floor(d / 30);
  return `há ${m}m`;
}
