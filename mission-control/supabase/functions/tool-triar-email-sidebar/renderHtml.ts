// Render HTML standalone da triagem de email.
// Design IBM Plex + paleta Pinguim laranja+dark (mesmo padrão do Raio-X).

const esc = (s: any): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fmtData = (iso?: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const agora = new Date();
    const diff = (agora.getTime() - d.getTime()) / 1000;
    if (diff < 3600) return `${Math.round(diff / 60)}min`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
};

const fmtDataLonga = (iso?: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

const CSS = `
:root {
  --fg: #EDEDED; --fg-2: #B4B4B4; --fg-3: #7E7E7E; --fg-4: #4E4E4E;
  --bg: #0A0A0A; --bg-alt: #060606;
  --paper: #121212; --paper-2: #161616;
  --line: #1F1F1F; --line-2: #2A2A2A;
  --pc: #E85C00; --pc-400: #FB923C;
  --pc-soft: rgba(232,92,0,0.08); --pc-soft-2: rgba(232,92,0,0.18);
  --good: #4ADE80; --bad: #EF4444;
  --sans: 'IBM Plex Sans', -apple-system, system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: var(--pc); text-decoration: none; }
strong { color: var(--fg); font-weight: 600; }
em { font-style: italic; color: var(--fg-2); }

.app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
@media (max-width: 1000px) { .app { grid-template-columns: 1fr; } .sidebar { display: none; } }

.sidebar { position: sticky; top: 0; height: 100vh; padding: 2rem 1.5rem; border-right: 1px solid var(--line); background: var(--bg-alt); overflow-y: auto; }
.sidebar-brand { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); margin-bottom: 2rem; }
.sidebar-brand span { color: var(--pc); }
.toc { list-style: none; padding: 0; margin: 0; }
.toc li { padding: 0.5rem 0; border-bottom: 1px solid var(--line); }
.toc a { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--fg-2); padding: 0.25rem 0; }
.toc a:hover { color: var(--fg); }
.toc a.active { color: var(--pc); font-weight: 500; }
.toc .num { font-family: var(--mono); font-size: 10px; color: var(--fg-4); margin-right: 0.5rem; letter-spacing: 0.1em; }
.toc .count { font-family: var(--mono); font-size: 11px; color: var(--fg-3); }
.toc a.active .count { color: var(--pc); }

.main { min-width: 0; }
section { padding: 4rem 2rem; border-bottom: 1px solid var(--line); }
section:first-child { padding: 0; border-bottom: 1px solid var(--line); }
.wrap { max-width: 920px; margin: 0 auto; }
.kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--pc); font-weight: 500; margin-bottom: 1.5rem; }
h1 { font-family: var(--sans); font-size: clamp(2rem, 4vw, 2.75rem); font-weight: 600; letter-spacing: -0.025em; line-height: 1.05; margin: 0; }
h2 { font-family: var(--sans); font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 1.5rem; }
h3 { font-family: var(--sans); font-size: 1.125rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 0.75rem; color: var(--fg); }
h5 { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); margin: 0 0 0.5rem; font-weight: 500; }
.section-intro { font-size: 1rem; line-height: 1.6; color: var(--fg-2); max-width: 64ch; margin: 0 0 2rem; }

.cover { padding: 3rem 2rem; background: var(--bg); position: relative; border-bottom: 1px solid var(--line); }
.cover::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--pc); }
.cover-top { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1.5rem; border-bottom: 1px solid var(--line); margin-bottom: 2rem; }
.cover-brand { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-2); }
.cover-brand span { color: var(--pc); }
.cover-status { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); }
.cover-status::before { content: '●'; color: var(--good); margin-right: 0.5rem; }
.cover-mid { padding: 1rem 0 2rem; max-width: 1100px; margin: 0 auto; width: 100%; }
.cover-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--pc); margin-bottom: 1rem; }
.cover-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--line); }
.cover-stat-num { font-family: var(--sans); font-size: 2rem; font-weight: 600; letter-spacing: -0.02em; color: var(--pc); line-height: 1; }
.cover-stat-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); margin-top: 0.5rem; }
@media (max-width: 720px) { .cover-stats { grid-template-columns: repeat(2, 1fr); gap: 1rem; } }

/* Top 3 prioridades */
.top3-card { background: linear-gradient(135deg, rgba(239,68,68,0.06) 0%, var(--paper) 60%); border: 1px solid var(--line); border-left: 3px solid var(--bad); border-radius: 12px; padding: 1.5rem 1.75rem; margin-bottom: 1rem; }
.top3-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
.top3-prio { font-family: var(--sans); font-size: 2.5rem; font-weight: 600; letter-spacing: -0.03em; color: var(--bad); line-height: 1; }
.top3-meta { display: flex; gap: 0.75rem; font-family: var(--mono); font-size: 10px; letter-spacing: 0.05em; color: var(--fg-3); flex-wrap: wrap; }
.top3-de { font-size: 14px; color: var(--fg); font-weight: 500; }
.top3-assunto { font-size: 13px; color: var(--fg-2); margin: 0.25rem 0 0.75rem; }
.top3-acao { background: var(--paper-2); border-left: 3px solid var(--pc); padding: 0.75rem 1rem; border-radius: 0 8px 8px 0; margin: 0.75rem 0; }
.top3-acao-curta { font-weight: 600; color: var(--fg); margin-bottom: 0.5rem; font-size: 14px; }
.top3-acao-completa { font-size: 13px; color: var(--fg-2); line-height: 1.6; }
.top3-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; }
.btn-link { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.75rem; border-radius: 6px; background: var(--paper-2); border: 1px solid var(--line); color: var(--fg-2); font-family: var(--mono); font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; }
.btn-link:hover { color: var(--pc); border-color: var(--pc); }
.btn-link.primary { background: var(--pc); color: white; border-color: var(--pc); }
.btn-link.primary:hover { background: var(--pc-400); color: white; }

/* Baldes */
.balde { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 1.5rem 1.75rem; margin-bottom: 1rem; position: relative; overflow: hidden; }
.balde::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--pc); opacity: 0.35; }
.balde-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
.balde-titulo { display: flex; align-items: center; gap: 0.75rem; }
.balde-emoji { font-size: 1.5rem; }
.balde-nome { font-family: var(--sans); font-size: 1.0625rem; font-weight: 600; }
.balde-count { background: var(--pc-soft); color: var(--pc); padding: 0.25rem 0.625rem; border-radius: 4px; font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: 0.05em; }
.balde-desc { font-size: 12px; color: var(--fg-3); margin-top: 0.25rem; }
.balde-arrow { font-family: var(--mono); font-size: 14px; color: var(--fg-3); }
.balde[open] .balde-arrow { transform: rotate(90deg); }

.email-item { display: grid; grid-template-columns: 1fr auto; gap: 1rem; padding: 0.875rem 0; border-bottom: 1px solid var(--line); align-items: center; }
.email-item:last-child { border-bottom: 0; }
.email-content { min-width: 0; }
.email-header { display: flex; gap: 0.75rem; align-items: baseline; margin-bottom: 0.25rem; flex-wrap: wrap; }
.email-de { font-size: 13px; font-weight: 600; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-de.unread::before { content: '●'; color: var(--pc); margin-right: 0.4rem; font-size: 11px; }
.email-star { color: var(--pc-400); }
.email-data { font-family: var(--mono); font-size: 10px; color: var(--fg-3); letter-spacing: 0.05em; }
.email-assunto { font-size: 13px; color: var(--fg-2); margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-snippet { font-size: 12px; color: var(--fg-3); line-height: 1.5; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.email-motivo { font-family: var(--mono); font-size: 10px; color: var(--pc); letter-spacing: 0.05em; margin-top: 0.25rem; text-transform: uppercase; }
.email-actions { display: flex; gap: 0.35rem; align-items: center; }
.email-btn { background: var(--paper-2); border: 1px solid var(--line); padding: 0.4rem 0.6rem; border-radius: 6px; cursor: pointer; color: var(--fg-3); font-size: 13px; transition: all 0.15s; }
.email-btn:hover { color: var(--pc); border-color: var(--pc); background: var(--pc-soft); }
.email-btn.lixo:hover { color: var(--bad); border-color: var(--bad); }
.email-btn[disabled] { opacity: 0.4; cursor: not-allowed; }
.balde[open] .balde-content { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--line); }

.empty-state { text-align: center; padding: 3rem 1rem; color: var(--fg-3); }
.empty-state h2 { color: var(--fg-2); }

footer { padding: 2rem; text-align: center; background: var(--bg); border-top: 1px solid var(--line); }
footer .brand { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-3); }
footer .brand span { color: var(--pc); }
footer .meta { margin-top: 0.5rem; font-size: 12px; color: var(--fg-3); }

@media print {
  @page { size: A4; margin: 18mm 14mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: var(--bg) !important; color: var(--fg) !important; font-size: 10.5pt; }
  .sidebar { display: none !important; }
  .app { display: block !important; grid-template-columns: 1fr !important; }
  section { padding: 1.5rem 0 !important; page-break-before: always; }
  section:first-child { page-break-before: avoid; }
  details { display: block !important; }
  details > summary ~ * { display: block !important; }
  .top3-card, .balde { page-break-inside: avoid; }
}
`;

interface RenderInput {
  meta: {
    cliente_id: string;
    email_conta: string;
    gerado_em: string;
    duracao_s: number;
    total_emails: number;
  };
  baldes: Array<{
    slug: string;
    emoji: string;
    nome: string;
    desc: string;
    emails: Array<any>;
  }>;
  top3: Array<{
    id: string;
    acao_curta: string;
    acao_completa: string;
    prioridade: number;
    tempo_estimado_min: number;
  }>;
}

function renderEmailItem(e: any): string {
  return `
<div class="email-item" data-email-id="${esc(e.id)}">
  <div class="email-content">
    <div class="email-header">
      <span class="email-de ${e.is_unread ? 'unread' : ''}">${esc(e.de_nome || e.de_email)}${e.is_starred ? ' <span class="email-star">★</span>' : ''}</span>
      <span class="email-data">${esc(fmtData(e.data_iso))}</span>
    </div>
    <div class="email-assunto">${esc(e.assunto || '(sem assunto)')}</div>
    <div class="email-snippet">${esc(e.snippet)}</div>
    ${e.motivo_curto ? `<div class="email-motivo">${esc(e.motivo_curto)}</div>` : ''}
  </div>
  <div class="email-actions">
    <a class="email-btn" href="${esc(e.link_gmail)}" target="_blank" title="Abrir no Gmail">↗</a>
  </div>
</div>`;
}

export function renderHtmlTriagem(input: RenderInput): string {
  const { meta, baldes, top3 } = input;

  const totalRespHoje = baldes.find((b) => b.slug === 'responder_hoje')?.emails.length || 0;
  const totalPagar = baldes.find((b) => b.slug === 'pagar')?.emails.length || 0;
  const totalDecidir = baldes.find((b) => b.slug === 'decidir')?.emails.length || 0;

  // Map id → email pra top3
  const emailPorId = new Map<string, any>();
  for (const b of baldes) for (const e of b.emails) emailPorId.set(e.id, e);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Triagem · ${esc(meta.email_conta)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>

<div class="app">
  <aside class="sidebar">
    <div class="sidebar-brand">Triagem<span>·</span>Pinguim</div>
    <ul class="toc">
      <li><a href="#capa" class="active"><span class="num">00</span>Visão geral</a></li>
      ${top3.length ? `<li><a href="#top3"><span class="num">01</span>Top ${top3.length} agora <span class="count">${top3.length}</span></a></li>` : ''}
      ${baldes.map((b, i) => b.emails.length > 0 ? `<li><a href="#balde-${b.slug}"><span class="num">${String(i + 2).padStart(2, '0')}</span>${b.emoji} ${esc(b.nome)} <span class="count">${b.emails.length}</span></a></li>` : '').join('')}
    </ul>
  </aside>

  <main class="main">

    <section id="capa" class="cover">
      <div class="cover-top">
        <div class="cover-brand">Pinguim<span>·</span>OS</div>
        <div class="cover-status">Triagem · Gmail</div>
      </div>
      <div class="cover-mid">
        <div class="cover-eyebrow">Triagem executiva — últimas 24h</div>
        <h1>${esc(meta.email_conta)}</h1>
        <div class="cover-stats">
          <div><div class="cover-stat-num">${meta.total_emails}</div><div class="cover-stat-label">Emails 24h</div></div>
          <div><div class="cover-stat-num" style="color:var(--bad)">${totalRespHoje}</div><div class="cover-stat-label">Responder hoje</div></div>
          <div><div class="cover-stat-num">${totalDecidir}</div><div class="cover-stat-label">Decidir</div></div>
          <div><div class="cover-stat-num">${totalPagar}</div><div class="cover-stat-label">Pagar</div></div>
        </div>
      </div>
    </section>

    ${meta.total_emails === 0 ? `
    <section>
      <div class="wrap empty-state">
        <h2>📭 Caixa zero nas últimas 24h</h2>
        <p>Você está em dia. Nenhum email novo pra triar.</p>
      </div>
    </section>
    ` : ''}

    ${top3.length ? `
    <section id="top3">
      <div class="wrap">
        <div class="kicker">01 · Top ${top3.length} agora</div>
        <h2>O que resolver primeiro</h2>
        <p class="section-intro">Os ${top3.length} emails mais urgentes do balde "Responder hoje", com ação sugerida pra cada um. Tempo total estimado: <strong>${top3.reduce((s, t) => s + t.tempo_estimado_min, 0)} min</strong>.</p>
        ${top3.map((t) => {
          const e = emailPorId.get(t.id);
          if (!e) return '';
          return `
          <div class="top3-card">
            <div class="top3-header">
              <div style="display:flex;align-items:center;gap:1rem">
                <div class="top3-prio">${t.prioridade}</div>
                <div>
                  <div class="top3-de">${esc(e.de_nome || e.de_email)}</div>
                  <div class="top3-meta">
                    <span>${esc(fmtDataLonga(e.data_iso))}</span>
                    <span>·</span>
                    <span>${t.tempo_estimado_min} MIN</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="top3-assunto"><strong>${esc(e.assunto || '(sem assunto)')}</strong></div>
            <div class="top3-acao">
              <div class="top3-acao-curta">→ ${esc(t.acao_curta)}</div>
              <div class="top3-acao-completa">${esc(t.acao_completa)}</div>
            </div>
            <div class="top3-actions">
              <a class="btn-link primary" href="${esc(e.link_gmail)}" target="_blank">Abrir no Gmail ↗</a>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>` : ''}

    ${baldes.map((b, i) => b.emails.length === 0 ? '' : `
    <section id="balde-${b.slug}">
      <div class="wrap">
        <div class="kicker">${String(i + (top3.length ? 2 : 1)).padStart(2, '0')} · ${b.emoji} ${esc(b.nome)}</div>
        <h2>${esc(b.nome)} <span style="font-size:0.6em;color:var(--fg-3);font-weight:400">${b.emails.length} email${b.emails.length === 1 ? '' : 's'}</span></h2>
        <p class="section-intro">${esc(b.desc)}</p>
        <details class="balde" ${b.slug === 'responder_hoje' || b.slug === 'decidir' || b.slug === 'pagar' ? 'open' : ''}>
          <summary class="balde-header">
            <div class="balde-titulo">
              <span class="balde-emoji">${b.emoji}</span>
              <div>
                <div class="balde-nome">${esc(b.nome)}</div>
                <div class="balde-desc">${esc(b.desc)}</div>
              </div>
            </div>
            <span class="balde-count">${b.emails.length}</span>
          </summary>
          <div class="balde-content">
            ${b.emails.map(renderEmailItem).join('')}
          </div>
        </details>
      </div>
    </section>`).join('')}

    <footer>
      <div class="brand">Pinguim<span> · </span>Triagem<span> · </span>v1.0</div>
      <div class="meta">Gerado em ${esc(fmtDataLonga(meta.gerado_em))} · ${meta.duracao_s}s · ${meta.total_emails} emails analisados · GPT-4o</div>
    </footer>

  </main>
</div>

<script>
const sections = document.querySelectorAll('section[id]');
const tocLinks = document.querySelectorAll('.toc a');
function setActive() {
  const scrollY = window.scrollY + 100;
  let current = sections[0]?.id || '';
  sections.forEach((s) => { if (s.offsetTop <= scrollY) current = s.id; });
  tocLinks.forEach((a) => { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });
}
window.addEventListener('scroll', setActive, { passive: true });
setActive();
</script>

</body>
</html>`;
}
