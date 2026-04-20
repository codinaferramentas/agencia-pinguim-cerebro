/* Stubs — telas em breve (V1/V2) */

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
};

const STUBS = {
  conteudo: {
    fase: 'V1',
    titulo: 'Conteúdo',
    desc: 'Pipeline Kanban (A Fazer / Feito / Aprovado / Publicado) com categorias: Carrosséis, Reels, Frases, YouTube. Gerado a partir dos Cérebros dos produtos.'
  },
  funis: {
    fase: 'V1',
    titulo: 'Funis',
    desc: 'Cards dos produtos cadastrados + páginas de vendas, order bumps e VSLs geradas automaticamente pelos agentes.'
  },
  trafego: {
    fase: 'V2',
    titulo: 'Tráfego',
    desc: 'Distribuição e otimização de campanhas. Ranking de criativos, ROAS por conjunto, automações de pausa/escala.'
  },
  vendas: {
    fase: 'V2',
    titulo: 'Vendas / CRM',
    desc: 'Integração com plataforma de checkout (Hotmart). Faturamento diário, aplicações high ticket, pipeline.'
  },
  suporte: {
    fase: 'V1',
    titulo: 'Suporte',
    desc: 'Grupos WhatsApp/Discord/Telegram. FAQ por produto (alimentada pelos Cérebros). Bots respondendo em 2-3s.'
  },
  biblioteca: {
    fase: 'V1',
    titulo: 'Biblioteca',
    desc: 'PDFs, HTMLs, imagens geradas pelos agentes. Repositório de outputs consultável.'
  },
  seguranca: {
    fase: 'V1',
    titulo: 'Segurança',
    desc: 'Scans periódicos, mitigação de prompt injection, rate limits por agente, kill switch, separação de schemas no Supabase.'
  },
  debug: {
    fase: 'V1',
    titulo: 'Debug',
    desc: 'Destravar agente travado sem precisar abrir terminal. Visualização de logs do OpenClaw + ações de recovery.'
  },
};

export function renderStub(pageSlug) {
  const page = document.getElementById('page-' + pageSlug);
  if (!page) return;
  const meta = STUBS[pageSlug];
  if (!meta) {
    page.innerHTML = `<div class="stub-screen"><h2>Página não implementada</h2></div>`;
    return;
  }
  page.innerHTML = '';
  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, meta.titulo),
        el('div', { class: 'page-subtitle' }, 'Esta tela entra no ' + meta.fase + '.'),
      ]),
    ]),
    el('div', { class: 'stub-screen' }, [
      el('div', { class: 'stub-badge' }, meta.fase),
      el('h2', {}, meta.titulo + ' — em breve'),
      el('p', {}, meta.desc),
    ])
  );
}
