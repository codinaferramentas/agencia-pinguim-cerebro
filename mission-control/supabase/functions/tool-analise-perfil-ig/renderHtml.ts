// ============================================================
// Render HTML standalone — Design System Pinguim (IBM Plex)
// Replica fielmente o design da aula Sirius:
// - IBM Plex Sans + IBM Plex Mono
// - Sidebar TOC fixa (240px) + main scroll
// - Cards com 3px accent no topo
// - Print A4 com page-break controlado
// - Imagens em base64 (HTML standalone offline)
// ============================================================

const esc = (s: any): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fmtNum = (n: any): string => {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace('.0', '') + 'k';
  return String(Math.round(v));
};

const fmtDate = (iso?: string): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return iso; }
};

const tierLabel = (tier?: string): { txt: string; color: string } => {
  const map: Record<string, { txt: string; color: string }> = {
    gold: { txt: 'GOLD', color: 'var(--pc)' },
    silver: { txt: 'SILVER', color: 'var(--fg-2)' },
    bronze: { txt: 'BRONZE', color: '#A87C4F' },
  };
  return map[tier || ''] || map.silver;
};

const pilarColor = (nota: number): string => {
  if (nota >= 8) return 'var(--good)';
  if (nota >= 6) return 'var(--pc-400)';
  return 'var(--bad)';
};

const rubricaTo10 = (r: any): string => {
  if (!r) return '—';
  const vals = Object.values(r).filter((v) => typeof v === 'number') as number[];
  if (!vals.length) return '—';
  const sum = vals.reduce((a, b) => a + b, 0);
  return ((sum / (vals.length * 5)) * 10).toFixed(1);
};

const CSS = `
:root {
  --fg: #EDEDED;
  --fg-2: #B4B4B4;
  --fg-3: #7E7E7E;
  --fg-4: #4E4E4E;
  --bg: #0A0A0A;
  --bg-alt: #060606;
  --paper: #121212;
  --paper-2: #161616;
  --line: #1F1F1F;
  --line-2: #2A2A2A;
  --pc: #E85C00;
  --pc-400: #FB923C;
  --pc-soft: rgba(232, 92, 0, 0.08);
  --pc-soft-2: rgba(232, 92, 0, 0.18);
  --good: #4ADE80;
  --bad: #EF4444;
  --sans: 'IBM Plex Sans', -apple-system, system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--pc); text-decoration: none; }
strong { color: var(--fg); font-weight: 600; }
em { font-style: italic; color: var(--fg-2); }
.mono { font-family: var(--mono); }

.app {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}
@media (max-width: 1000px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 2rem 1.5rem;
  border-right: 1px solid var(--line);
  background: var(--bg-alt);
  overflow-y: auto;
}
.sidebar-brand {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-bottom: 2rem;
}
.sidebar-brand span { color: var(--pc); }
.toc { list-style: none; padding: 0; margin: 0; }
.toc li {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--line);
}
.toc a {
  display: block;
  font-size: 13px;
  color: var(--fg-2);
  padding: 0.25rem 0;
  font-weight: 400;
  transition: color 0.15s;
}
.toc a:hover { color: var(--fg); }
.toc a.active { color: var(--pc); font-weight: 500; }
.toc .num {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--fg-4);
  margin-right: 0.5rem;
  letter-spacing: 0.1em;
}

.main { min-width: 0; }
section {
  padding: 5rem 2rem;
  border-bottom: 1px solid var(--line);
}
section:nth-child(even) { background: var(--bg-alt); }
section:first-child { padding: 0; border-bottom: 1px solid var(--line); }
.wrap {
  max-width: 920px;
  margin: 0 auto;
}
.kicker {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pc);
  font-weight: 500;
  margin-bottom: 1.5rem;
}
h1 {
  font-family: var(--sans);
  font-size: clamp(2rem, 4.5vw, 3.25rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.05;
  margin: 0;
}
h2 {
  font-family: var(--sans);
  font-size: clamp(1.75rem, 3.25vw, 2.5rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
  margin: 0 0 1.5rem;
  max-width: 24ch;
}
h3 {
  font-family: var(--sans);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 0.75rem;
  color: var(--fg);
}
h4 {
  font-family: var(--sans);
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: var(--fg);
}
h5 {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin: 0 0 0.5rem;
  font-weight: 500;
}
.section-intro {
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--fg-2);
  max-width: 64ch;
  margin: 0 0 2.5rem;
}

.cover {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: 3rem 2rem;
  background: var(--bg);
  position: relative;
}
.cover::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--pc);
}
.cover-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--line);
}
.cover-brand {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-2);
}
.cover-brand span { color: var(--pc); }
.cover-status {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.cover-status::before { content: '●'; color: var(--pc); margin-right: 0.5rem; }
.cover-mid {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4rem 0;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}
.cover-eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pc);
  margin-bottom: 1.5rem;
}
.cover-profile {
  display: flex;
  gap: 2rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 2.5rem;
}
.cover-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 2px solid var(--pc);
  object-fit: cover;
  flex-shrink: 0;
}
.cover-avatar-placeholder {
  width: 120px; height: 120px;
  border-radius: 50%;
  border: 2px solid var(--pc);
  background: var(--paper);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: var(--fg-3);
}
.cover-info-handle {
  font-family: var(--mono);
  font-size: 14px;
  color: var(--fg-2);
  margin-top: 0.5rem;
}
.cover-verified { color: var(--pc); margin-left: 0.5rem; font-size: 0.85em; }
.cover-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2.5rem;
  padding: 2rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  margin-bottom: 2rem;
}
.cover-stat-num {
  font-family: var(--sans);
  font-size: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--pc);
  line-height: 1;
}
.cover-stat-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-top: 0.5rem;
}
.cover-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}
.cover-meta-item .label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-bottom: 0.5rem;
}
.cover-meta-item .value {
  font-family: var(--sans);
  font-size: 0.9375rem;
  color: var(--fg);
  font-weight: 500;
}
@media (max-width: 720px) {
  .cover-meta-grid { grid-template-columns: 1fr; gap: 1rem; }
  .cover-stats { grid-template-columns: repeat(3, 1fr); gap: 1rem; }
}
.cover-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 2rem;
  border-top: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-3);
}

/* ====== COMPONENTES ====== */
.callout {
  padding: 1.75rem 2rem;
  background: var(--pc-soft);
  border-left: 3px solid var(--pc);
  border-radius: 0 8px 8px 0;
  margin: 2rem 0;
}
.callout .label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pc);
  margin-bottom: 0.5rem;
}
.callout p { margin: 0; color: var(--fg); }

.card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 2rem 1.75rem;
  position: relative;
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--pc);
  opacity: 0.4;
}
.card .kicker { margin-bottom: 0.75rem; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
@media (max-width: 720px) {
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
}

/* Veredito */
.veredito {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 3rem 2rem;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.veredito::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--pc) 0%, var(--pc-400) 100%);
}
.veredito-nota {
  font-family: var(--sans);
  font-size: 5rem;
  font-weight: 600;
  letter-spacing: -0.04em;
  color: var(--pc);
  line-height: 1;
}
.veredito-nota-suffix {
  font-size: 1.75rem;
  color: var(--fg-3);
  font-weight: 400;
}
.veredito-frase {
  font-family: var(--sans);
  font-size: 1.375rem;
  font-style: italic;
  color: var(--fg);
  margin-top: 1.5rem;
  max-width: 56ch;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.45;
}

/* Pilar */
.pilar {
  display: grid;
  grid-template-columns: 200px 80px 1fr;
  gap: 1.5rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--line);
  align-items: center;
}
.pilar:last-child { border-bottom: 0; }
.pilar-nome { font-weight: 600; font-size: 14px; }
.pilar-nota {
  font-family: var(--sans);
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
}
.pilar-bar {
  height: 6px;
  background: var(--paper-2);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}
.pilar-bar-fill { height: 100%; border-radius: 3px; }
.pilar-just { font-size: 13px; color: var(--fg-2); line-height: 1.55; }
@media (max-width: 720px) {
  .pilar { grid-template-columns: 1fr; gap: 0.5rem; }
}

/* Bio */
.bio-side { display: flex; flex-direction: column; gap: 1rem; }
.bio-text {
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  font-size: 14px;
  white-space: pre-wrap;
  font-family: var(--sans);
  min-height: 70px;
  line-height: 1.55;
}
.bio-text-suggested {
  border-left: 3px solid var(--pc);
  background: var(--pc-soft);
}
.bio-score {
  font-family: var(--sans);
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--pc);
  line-height: 1;
}
.bio-score-suffix {
  font-size: 1rem;
  color: var(--fg-3);
  font-weight: 400;
}
.rubrica {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem 1rem;
  margin-top: 0.75rem;
}
.rubrica-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 0.375rem 0;
  border-bottom: 1px dashed var(--line);
}
.rubrica-item strong { color: var(--pc); }

/* Post card */
.post-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 2rem;
  margin-bottom: 1.5rem;
  position: relative;
  overflow: hidden;
}
.post-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--pc);
  opacity: 0.4;
}
.post-card-top::before { opacity: 1; background: linear-gradient(90deg, var(--pc) 0%, var(--pc-400) 100%); }
.post-card-worst::before { background: var(--bad); opacity: 0.8; }
.post-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.post-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pc);
  font-weight: 500;
}
.tier-badge {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  font-weight: 600;
  background: var(--paper-2);
  border: 1px solid var(--line);
}
.post-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 2rem;
}
@media (max-width: 900px) {
  .post-body { grid-template-columns: 1fr; }
}
.post-media img {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--line);
  aspect-ratio: 1;
  object-fit: cover;
}
.post-media-placeholder {
  width: 100%;
  aspect-ratio: 1;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-3);
  font-size: 11px;
  font-family: var(--mono);
}
.post-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin-top: 1rem;
}
.post-metric {
  background: var(--paper-2);
  border-radius: 6px;
  padding: 0.75rem;
  text-align: center;
}
.post-metric-v {
  font-family: var(--sans);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--pc);
}
.post-metric-l {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-top: 0.25rem;
}
.post-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--fg-3);
}
.post-link {
  display: inline-block;
  margin-top: 0.75rem;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--pc);
  letter-spacing: 0.05em;
}
.post-link:hover { text-decoration: underline; }
.post-nota {
  font-family: var(--sans);
  font-size: 3.75rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--pc);
  line-height: 1;
  margin-bottom: 1rem;
}
.post-nota-suffix {
  font-size: 1.5rem;
  color: var(--fg-3);
  font-weight: 400;
}
.post-resumo {
  font-size: 14px;
  line-height: 1.6;
  color: var(--fg);
  margin-bottom: 1rem;
}
.caption-box {
  background: var(--paper-2);
  border-left: 3px solid var(--pc);
  padding: 1rem 1.25rem;
  border-radius: 0 8px 8px 0;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  margin: 1rem 0;
  max-height: 200px;
  overflow-y: auto;
  font-family: var(--sans);
}
.transcript {
  margin: 1rem 0;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.transcript summary {
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--pc);
  user-select: none;
}
.transcript[open] summary { border-bottom: 1px solid var(--line); }
.transcript p {
  padding: 1rem 1.25rem;
  font-size: 13px;
  line-height: 1.65;
  color: var(--fg-2);
  white-space: pre-wrap;
  margin: 0;
}
.fatores {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin: 1.25rem 0;
}
@media (max-width: 900px) { .fatores { grid-template-columns: 1fr; } }
.fatores ul { list-style: none; padding: 0; margin: 0.5rem 0 0; }
.fatores li {
  padding: 0.5rem 0 0.5rem 1.5rem;
  position: relative;
  font-size: 13px;
  line-height: 1.55;
  border-bottom: 1px solid var(--line);
}
.fatores .pos li::before {
  content: '+';
  position: absolute;
  left: 0;
  color: var(--good);
  font-weight: 700;
  font-size: 1.125rem;
}
.fatores .neg li::before {
  content: '×';
  position: absolute;
  left: 0;
  color: var(--bad);
  font-weight: 700;
  font-size: 1.125rem;
}
.analise-block { margin-top: 1.25rem; }
.analise-block h5 { margin-bottom: 0.375rem; }
.analise-block p {
  font-size: 13px;
  color: var(--fg);
  line-height: 1.65;
  margin-bottom: 1rem;
}
.citacoes {
  background: var(--pc-soft);
  border-left: 3px solid var(--pc);
  padding: 1rem 1.25rem;
  border-radius: 0 8px 8px 0;
  font-style: italic;
  font-size: 13px;
  margin: 1rem 0;
}
.citacoes blockquote { margin: 0.375rem 0; color: var(--fg); }
.recomendacoes {
  margin-top: 1.5rem;
  background: var(--paper-2);
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
}
.recomendacoes ol { padding-left: 1.5rem; margin: 0.5rem 0 0; }
.recomendacoes li {
  font-size: 13px;
  margin-bottom: 0.5rem;
  line-height: 1.6;
}
.rank-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 3rem 0 1.5rem;
}
.rd-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pc);
  font-weight: 600;
}
.rd-rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--pc) 0%, transparent 100%);
  opacity: 0.4;
}

/* Oportunidades */
.opp-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1.75rem;
  margin-bottom: 1rem;
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 1.5rem;
  position: relative;
  overflow: hidden;
}
.opp-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--pc);
  opacity: 0.5;
}
.opp-num {
  font-family: var(--sans);
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--pc);
  line-height: 1;
}
.opp-content h4 { font-size: 1.125rem; margin-bottom: 0.5rem; }
.opp-content p {
  font-size: 13px;
  color: var(--fg-2);
  line-height: 1.6;
  margin-bottom: 0.75rem;
}
.opp-meta {
  display: flex;
  gap: 1rem;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--fg-3);
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.opp-meta strong { color: var(--fg); }
.opp-step {
  background: var(--pc-soft);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  font-size: 13px;
  line-height: 1.55;
  border-left: 2px solid var(--pc);
}
.opp-step strong { color: var(--pc); }
@media (max-width: 720px) {
  .opp-card { grid-template-columns: 1fr; gap: 0.75rem; }
  .opp-num { font-size: 2rem; }
}

/* Riscos */
.risco-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-left: 3px solid var(--bad);
  border-radius: 0 12px 12px 0;
  padding: 1.5rem 1.75rem;
  margin-bottom: 1rem;
}
.risco-card h4 { font-size: 1.0625rem; margin-bottom: 0.5rem; }
.risco-card p {
  font-size: 13px;
  color: var(--fg-2);
  line-height: 1.65;
  margin-bottom: 0.5rem;
}
.risco-impacto {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--line);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--bad);
}

/* Passo */
.passo-card {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 1.5rem;
  align-items: center;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1.5rem 1.75rem;
  margin-bottom: 1rem;
  position: relative;
  overflow: hidden;
}
.passo-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--pc);
  opacity: 0.4;
}
.passo-num {
  font-family: var(--sans);
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--pc);
  line-height: 1;
  text-align: center;
}
.passo-texto { font-size: 15px; line-height: 1.55; }

/* Extras */
.extras {
  margin-top: 3rem;
  padding: 1.75rem;
  border: 1px dashed var(--line);
  border-radius: 14px;
}
.extras h3 { font-size: 1.0625rem; margin-bottom: 0.5rem; color: var(--fg-2); }
.extras-desc {
  font-size: 13px;
  color: var(--fg-3);
  line-height: 1.55;
  margin-bottom: 1.25rem;
}
.extras-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.75rem;
}
.extras-item {
  background: var(--paper);
  border-radius: 8px;
  padding: 0.5rem;
  border: 1px solid var(--line);
}
.extras-item img {
  width: 100%;
  border-radius: 6px;
  aspect-ratio: 1;
  object-fit: cover;
}
.extras-item-meta {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--fg-3);
  margin-top: 0.5rem;
  text-align: center;
}

/* Footer */
footer {
  padding: 3rem 2rem;
  text-align: center;
  background: var(--bg);
  border-top: 1px solid var(--line);
}
footer .brand {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-3);
}
footer .brand span { color: var(--pc); }
footer .meta {
  margin-top: 0.75rem;
  font-size: 12px;
  color: var(--fg-3);
}
footer .formula {
  margin-top: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  text-align: left;
  font-size: 13px;
  line-height: 1.7;
  color: var(--fg-2);
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}
footer .formula strong { color: var(--fg); }

/* ===================== PRINT / PDF ===================== */
@media print {
  @page {
    size: A4;
    margin: 18mm 14mm;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    background: var(--bg) !important;
    color: var(--fg) !important;
    font-size: 10.5pt;
  }
  .sidebar { display: none !important; }
  .app { display: block !important; grid-template-columns: 1fr !important; }
  .main { min-width: 0; width: 100%; }
  section {
    padding: 1.5rem 0 !important;
    border-bottom: none !important;
    page-break-before: always;
    break-before: page;
    background: var(--bg) !important;
  }
  section:first-child { page-break-before: avoid; }
  section:nth-child(even) { background: var(--bg) !important; }
  .wrap { max-width: 100% !important; }
  .cover { min-height: auto !important; padding: 0 !important; }
  .cover-top { padding-bottom: 1rem !important; }
  .cover-mid { padding: 1.5rem 0 !important; }
  h1 { font-size: 24pt !important; line-height: 1.1 !important; }
  h2 { font-size: 16pt !important; margin-bottom: 0.75rem !important; }
  h3 { font-size: 12pt !important; }
  .section-intro { font-size: 10.5pt !important; margin-bottom: 1rem !important; }
  .kicker { margin-bottom: 0.5rem !important; }
  .card, .post-card, .opp-card, .risco-card, .passo-card, .extras, .veredito,
  .pilar, .callout {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .grid-2, .grid-3, .grid-4 { gap: 0.75rem !important; }
  details { display: block !important; }
  details > summary ~ * { display: block !important; }
  p, li { orphans: 3; widows: 3; }
  h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
  footer { padding: 1rem 0 !important; }
}
`;

interface RenderInput {
  meta: any;
  profile: any;
  metrics: any;
  posts: any[];
  top_post: any;
  worst_post: any;
  other_posts_analyzed: any[];
  bio_analysis: any;
  cross_insights: any;
  overview: any;
  personal_posts: any[];
}

function renderPostCard(label: string, post: any, isTop: boolean, isWorst: boolean): string {
  const a = post.analysis;
  const tier = a?.classificacao || post.tier;
  const t = tierLabel(tier);
  const cardClass = isTop ? 'post-card-top' : isWorst ? 'post-card-worst' : '';
  const isVideo = post.post_type === 'Reel' || post.post_type === 'Video';

  return `
<div class="post-card ${cardClass}">
  <div class="post-header">
    <span class="post-label">${esc(label)}</span>
    <span class="tier-badge" style="color:${t.color};border-color:${t.color}">${t.txt}</span>
  </div>
  <div class="post-body">
    <div class="post-media">
      ${post.thumb_url
        ? `<img src="${post.thumb_url}" alt="thumbnail"/>`
        : `<div class="post-media-placeholder">sem thumbnail</div>`}
      <div class="post-metrics">
        <div class="post-metric"><div class="post-metric-v">${fmtNum(post.likes)}</div><div class="post-metric-l">Likes</div></div>
        <div class="post-metric"><div class="post-metric-v">${fmtNum(post.comments)}</div><div class="post-metric-l">Coment.</div></div>
        ${isVideo ? `<div class="post-metric"><div class="post-metric-v">${fmtNum(post.views)}</div><div class="post-metric-l">Views</div></div>` : ''}
        <div class="post-metric"><div class="post-metric-v">${(Number(post.engagement_score ?? 0) * 100).toFixed(2)}%</div><div class="post-metric-l">Engaj.</div></div>
      </div>
      <div class="post-meta">
        <span>${esc(post.post_type)}</span>
        ${post.timestamp ? `<span>·</span><span>${esc(new Date(post.timestamp).toLocaleDateString('pt-BR'))}</span>` : ''}
      </div>
      ${post.url ? `<a class="post-link" href="${esc(post.url)}" target="_blank">VER NO INSTAGRAM →</a>` : ''}
    </div>
    <div>
      <div class="post-nota">${(a?.nota_geral ?? 0).toFixed(1)}<span class="post-nota-suffix">/10</span></div>
      <p class="post-resumo">${esc(a?.resumo_desempenho || '')}</p>
      ${post.full_caption ? `<div class="caption-box">${esc(post.full_caption)}</div>` : ''}
      ${post.transcript ? `<details class="transcript"><summary>▶ TRANSCRIÇÃO LITERAL DO ÁUDIO</summary><p>${esc(post.transcript)}</p></details>` : ''}
      <div class="fatores">
        <div class="pos"><h5>O QUE FUNCIONOU</h5><ul>${(a?.fatores_positivos || []).map((f: string) => `<li>${esc(f)}</li>`).join('')}</ul></div>
        <div class="neg"><h5>PONTOS A MELHORAR</h5><ul>${(a?.fatores_negativos || []).map((f: string) => `<li>${esc(f)}</li>`).join('')}</ul></div>
      </div>
      <div class="analise-block">
        <h5>GANCHO</h5><p>${esc(a?.analise_gancho || '')}</p>
        <h5>ÁUDIO</h5><p>${esc(a?.analise_audio || 'N/A')}</p>
        <h5>LEGENDA</h5><p>${esc(a?.analise_legenda || '')}</p>
        <h5>FORMATO</h5><p>${esc(a?.analise_formato || '')}</p>
        <h5>HASHTAGS</h5><p>${esc(a?.analise_hashtags || '')}</p>
        <h5>ESTRATÉGIA</h5><p>${esc(a?.analise_estrategica || '')}</p>
      </div>
      ${(a?.citacoes_de_impacto || []).length ? `<div class="citacoes"><h5>FRASES MARCANTES</h5>${a.citacoes_de_impacto.map((c: string) => `<blockquote>"${esc(c)}"</blockquote>`).join('')}</div>` : ''}
      <div class="recomendacoes">
        <h5>RECOMENDAÇÕES ACIONÁVEIS</h5>
        <ol>${(a?.recomendacoes || []).map((r: string) => `<li>${esc(r)}</li>`).join('')}</ol>
      </div>
    </div>
  </div>
</div>`;
}

export function renderHtml(input: RenderInput): string {
  const { meta, profile, metrics, top_post, worst_post, other_posts_analyzed, bio_analysis, cross_insights, overview, personal_posts } = input;

  const rubricaLabels: Record<string, string> = {
    clareza: 'Clareza',
    autoridade: 'Autoridade',
    forca_cta: 'Força CTA',
    seo_descoberta: 'SEO',
    voz_da_marca: 'Voz',
    especificidade: 'Especificidade',
  };
  const pilarLabels: Record<string, string> = {
    clareza_nicho: 'Clareza de Nicho',
    autoridade_percebida: 'Autoridade Percebida',
    estrategia_conteudo: 'Estratégia de Conteúdo',
    monetizacao: 'Monetização',
    engajamento_relacionamento: 'Engajamento & Relacionamento',
  };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Raio-X · @${esc(profile.handle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>

<div class="app">

  <aside class="sidebar">
    <div class="sidebar-brand">Raio-X<span>·</span>Pinguim</div>
    <ul class="toc">
      <li><a href="#capa" class="active"><span class="num">00</span>Capa</a></li>
      <li><a href="#veredito"><span class="num">01</span>Veredito</a></li>
      <li><a href="#bio"><span class="num">02</span>Bio</a></li>
      <li><a href="#posts"><span class="num">03</span>Posts</a></li>
      <li><a href="#oportunidades"><span class="num">04</span>Oportunidades</a></li>
      <li><a href="#riscos"><span class="num">05</span>Riscos</a></li>
      <li><a href="#proximos"><span class="num">06</span>Próximos passos</a></li>
      ${personal_posts.length ? `<li><a href="#pessoais"><span class="num">07</span>Posts pessoais</a></li>` : ''}
    </ul>
  </aside>

  <main class="main">

    <!-- CAPA -->
    <section id="capa" class="cover">
      <div class="cover-top">
        <div class="cover-brand">Pinguim<span>·</span>OS</div>
        <div class="cover-status">Raio-X · Instagram</div>
      </div>
      <div class="cover-mid">
        <div class="cover-eyebrow">Análise estratégica completa do perfil</div>
        <div class="cover-profile">
          ${profile.avatar_url
            ? `<img class="cover-avatar" src="${profile.avatar_url}" alt="avatar"/>`
            : `<div class="cover-avatar-placeholder">👤</div>`}
          <div>
            <h1>${esc(profile.full_name || profile.handle)}${profile.is_verified ? '<span class="cover-verified">✓</span>' : ''}</h1>
            <div class="cover-info-handle">@${esc(profile.handle)}</div>
          </div>
        </div>
        <div class="cover-stats">
          <div>
            <div class="cover-stat-num">${fmtNum(profile.followers)}</div>
            <div class="cover-stat-label">Seguidores</div>
          </div>
          <div>
            <div class="cover-stat-num">${fmtNum(profile.following)}</div>
            <div class="cover-stat-label">Seguindo</div>
          </div>
          <div>
            <div class="cover-stat-num">${fmtNum(profile.posts_count)}</div>
            <div class="cover-stat-label">Publicações</div>
          </div>
        </div>
        <div class="cover-meta-grid">
          <div class="cover-meta-item">
            <div class="label">Nicho</div>
            <div class="value">${esc(meta.nicho)}</div>
          </div>
          <div class="cover-meta-item">
            <div class="label">Gerado em</div>
            <div class="value">${fmtDate(meta.generated_at)}</div>
          </div>
          <div class="cover-meta-item">
            <div class="label">Posts analisados</div>
            <div class="value">${other_posts_analyzed.length + 2} profissionais</div>
          </div>
        </div>
      </div>
      <div class="cover-bottom">
        <span>Pinguim<span> · </span>Raio-X v1.0</span>
        <span>Diagnóstico estratégico</span>
      </div>
    </section>

    <!-- 01 VEREDITO -->
    <section id="veredito">
      <div class="wrap">
        <div class="kicker">01 · Veredito</div>
        <h2>Diagnóstico estratégico</h2>
        <div class="veredito">
          <div class="veredito-nota">${(overview?.nota_geral ?? 0).toFixed(1)}<span class="veredito-nota-suffix">/10</span></div>
          <div class="veredito-frase">"${esc(overview?.veredito_curto || '')}"</div>
        </div>
        <div class="grid-3" style="margin-top:1.5rem">
          <div class="card">
            <h5>Como aparece hoje</h5>
            <p style="margin-top:0.5rem;font-size:14px;line-height:1.6">${esc(overview?.identidade_atual || '')}</p>
          </div>
          <div class="card">
            <h5>Para onde pode evoluir</h5>
            <p style="margin-top:0.5rem;font-size:14px;line-height:1.6">${esc(overview?.identidade_ideal || '')}</p>
          </div>
          <div class="card">
            <h5>Público inferido</h5>
            <p style="margin-top:0.5rem;font-size:14px;line-height:1.6">${esc(overview?.publico_alvo_inferido || '')}</p>
          </div>
        </div>
        <div style="margin-top:2rem">
          ${Object.entries(overview?.pilares || {}).map(([k, v]: [string, any]) => `
            <div class="pilar">
              <div class="pilar-nome">${esc(pilarLabels[k] || k)}</div>
              <div class="pilar-nota" style="color:${pilarColor(v?.nota)}">${Number(v?.nota ?? 0).toFixed(1)}</div>
              <div>
                <div class="pilar-bar"><div class="pilar-bar-fill" style="width:${Number(v?.nota ?? 0) * 10}%;background:${pilarColor(v?.nota)}"></div></div>
                <div class="pilar-just">${esc(v.justificativa)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <!-- 02 BIO -->
    <section id="bio">
      <div class="wrap">
        <div class="kicker">02 · Bio</div>
        <h2>Análise e otimização da bio</h2>
        <div class="grid-2">
          <div class="bio-side">
            <h5>BIO ATUAL</h5>
            <div class="bio-text">${esc(profile.bio_text || '(vazio)')}</div>
            <div class="bio-score">${rubricaTo10(bio_analysis?.rubrica_bio_atual)}<span class="bio-score-suffix">/10</span></div>
            <div class="rubrica">
              ${Object.entries(bio_analysis?.rubrica_bio_atual || {}).map(([k, v]: [string, any]) => `<div class="rubrica-item"><span>${esc(rubricaLabels[k] || k)}</span><strong>${v}/5</strong></div>`).join('')}
            </div>
          </div>
          <div class="bio-side">
            <h5>BIO SUGERIDA</h5>
            <div class="bio-text bio-text-suggested">${esc(bio_analysis?.bio_sugerida || '')}</div>
            <div class="bio-score">${rubricaTo10(bio_analysis?.rubrica_bio_nova)}<span class="bio-score-suffix">/10</span></div>
            <div class="rubrica">
              ${Object.entries(bio_analysis?.rubrica_bio_nova || {}).map(([k, v]: [string, any]) => `<div class="rubrica-item"><span>${esc(rubricaLabels[k] || k)}</span><strong>${v}/5</strong></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="card" style="margin-top:1.5rem">
          <h5>DIAGNÓSTICO DETALHADO</h5>
          <div class="grid-2" style="margin-top:0.75rem;gap:1rem">
            ${Object.entries(bio_analysis?.analise_diagnostica || {}).map(([k, v]: [string, any]) => `
              <div>
                <strong style="font-family:var(--mono);font-size:10px;color:var(--pc);letter-spacing:0.18em;text-transform:uppercase">${esc(k.replace(/_/g, ' '))}</strong>
                <div style="font-size:13px;color:var(--fg-2);margin-top:0.375rem;line-height:1.6">${esc(v)}</div>
              </div>`).join('')}
          </div>
        </div>
        <div class="grid-2" style="margin-top:1rem">
          <div class="card"><h5>PONTOS FORTES</h5><p style="margin-top:0.5rem;font-size:13px;line-height:1.65">${esc(bio_analysis?.pontos_fortes || '')}</p></div>
          <div class="card"><h5>PONTOS DE MELHORIA</h5><p style="margin-top:0.5rem;font-size:13px;line-height:1.65">${esc(bio_analysis?.pontos_de_melhoria || '')}</p></div>
        </div>
        ${bio_analysis?.sugestao_keyword_nome ? `
        <div class="callout" style="margin-top:1rem">
          <div class="label">Keyword sugerida pro campo Nome</div>
          <p style="margin-top:0.25rem"><strong style="font-size:18px;color:var(--pc)">${esc(bio_analysis.sugestao_keyword_nome)}</strong></p>
        </div>` : ''}
        ${bio_analysis?.justificativa_bio ? `
        <div class="callout">
          <div class="label">Por que essa bio funciona</div>
          <p>${esc(bio_analysis.justificativa_bio)}</p>
        </div>` : ''}
        <h3 style="margin-top:2.5rem">Três variações estratégicas</h3>
        <div class="grid-3" style="margin-top:0.75rem">
          <div class="card"><h5>AUTORIDADE</h5><div class="bio-text" style="margin-top:0.5rem">${esc(bio_analysis?.bio_variacao_autoridade || '')}</div></div>
          <div class="card"><h5>CONEXÃO</h5><div class="bio-text" style="margin-top:0.5rem">${esc(bio_analysis?.bio_variacao_conexao || '')}</div></div>
          <div class="card"><h5>AÇÃO</h5><div class="bio-text" style="margin-top:0.5rem">${esc(bio_analysis?.bio_variacao_acao || '')}</div></div>
        </div>
      </div>
    </section>

    <!-- 03 POSTS -->
    <section id="posts">
      <div class="wrap">
        <div class="kicker">03 · Posts</div>
        <h2>Análise profunda de conteúdo</h2>
        <div class="grid-4">
          <div class="card" style="text-align:center">
            <div style="font-family:var(--sans);font-size:2rem;font-weight:600;color:var(--pc);letter-spacing:-0.02em">${fmtNum(metrics?.avg_likes_pro)}</div>
            <div style="font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--fg-3);margin-top:0.375rem">Likes médios</div>
          </div>
          <div class="card" style="text-align:center">
            <div style="font-family:var(--sans);font-size:2rem;font-weight:600;color:var(--pc);letter-spacing:-0.02em">${fmtNum(metrics?.avg_comments_pro)}</div>
            <div style="font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--fg-3);margin-top:0.375rem">Comentários</div>
          </div>
          <div class="card" style="text-align:center">
            <div style="font-family:var(--sans);font-size:2rem;font-weight:600;color:var(--pc);letter-spacing:-0.02em">${fmtNum(metrics?.avg_views_pro)}</div>
            <div style="font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--fg-3);margin-top:0.375rem">Views médias</div>
          </div>
          <div class="card" style="text-align:center">
            <div style="font-family:var(--sans);font-size:2rem;font-weight:600;color:var(--pc);letter-spacing:-0.02em">${((metrics?.avg_engagement_pro || 0) * 100).toFixed(2)}%</div>
            <div style="font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--fg-3);margin-top:0.375rem">Engajamento médio</div>
          </div>
        </div>

        <div class="rank-divider"><span class="rd-label">★ Destaque positivo</span><span class="rd-rule"></span></div>
        ${renderPostCard('POST DE MAIOR PERFORMANCE', top_post, true, false)}

        <div class="card" style="margin-top:0.5rem">
          <h5>INSIGHTS CRUZADOS</h5>
          <div class="grid-3" style="margin-top:1rem;gap:1.5rem">
            <div>
              <strong style="font-family:var(--mono);font-size:10px;color:var(--pc);letter-spacing:0.18em;text-transform:uppercase">Padrão que funciona</strong>
              <p style="font-size:13px;color:var(--fg-2);margin-top:0.5rem;line-height:1.65">${esc(cross_insights?.padrao_que_funciona || '')}</p>
            </div>
            <div>
              <strong style="font-family:var(--mono);font-size:10px;color:var(--pc);letter-spacing:0.18em;text-transform:uppercase">O que o de menor pode aprender</strong>
              <p style="font-size:13px;color:var(--fg-2);margin-top:0.5rem;line-height:1.65">${esc(cross_insights?.o_que_o_worst_pode_aprender || '')}</p>
            </div>
            <div>
              <strong style="font-family:var(--mono);font-size:10px;color:var(--pc);letter-spacing:0.18em;text-transform:uppercase">Padrões gerais do perfil</strong>
              <p style="font-size:13px;color:var(--fg-2);margin-top:0.5rem;line-height:1.65">${esc(cross_insights?.padroes_do_perfil || '')}</p>
            </div>
          </div>
        </div>

        ${other_posts_analyzed.length ? `<div class="rank-divider"><span class="rd-label">Demais posts profissionais · ranqueados por nota</span><span class="rd-rule"></span></div>` : ''}
        ${other_posts_analyzed.map((p, i) => renderPostCard(`#${i + 2} · ${(p.analysis?.nota_geral ?? 0).toFixed(1)}/10`, p, false, false)).join('')}

        <div class="rank-divider"><span class="rd-label">⚠ Maior oportunidade de melhoria</span><span class="rd-rule"></span></div>
        ${renderPostCard('POST DE MENOR PERFORMANCE', worst_post, false, true)}
      </div>
    </section>

    <!-- 04 OPORTUNIDADES -->
    <section id="oportunidades">
      <div class="wrap">
        <div class="kicker">04 · Oportunidades</div>
        <h2>O que fazer pra crescer</h2>
        ${(overview?.oportunidades || []).map((o: any, i: number) => `
          <div class="opp-card">
            <div class="opp-num">${i + 1}</div>
            <div class="opp-content">
              <h4>${esc(o.titulo)}</h4>
              <p>${esc(o.racional)}</p>
              <div class="opp-meta">
                <span>IMPACTO: <strong style="color:${o.impacto_esperado === 'alto' ? 'var(--good)' : o.impacto_esperado === 'medio' ? 'var(--pc-400)' : 'var(--fg-3)'}">${esc(o.impacto_esperado).toUpperCase()}</strong></span>
                <span>·</span>
                <span>ESFORÇO: <strong>${esc(o.esforco).toUpperCase()}</strong></span>
              </div>
              <div class="opp-step"><strong>Comece esta semana:</strong> ${esc(o.primeiro_passo)}</div>
            </div>
          </div>`).join('')}
      </div>
    </section>

    <!-- 05 RISCOS -->
    <section id="riscos">
      <div class="wrap">
        <div class="kicker">05 · Riscos</div>
        <h2>O que pode travar</h2>
        ${(overview?.riscos || []).map((r: any) => `
          <div class="risco-card">
            <h4>${esc(r.titulo)}</h4>
            <p>${esc(r.descricao)}</p>
            <div class="risco-impacto">SE NÃO RESOLVIDO: ${esc(r.impacto_se_nao_resolvido)}</div>
          </div>`).join('')}
      </div>
    </section>

    <!-- 06 PROXIMOS -->
    <section id="proximos">
      <div class="wrap">
        <div class="kicker">06 · Próximos passos</div>
        <h2>Pra começar agora</h2>
        ${(overview?.proximos_passos || []).map((p: string, i: number) => `
          <div class="passo-card">
            <div class="passo-num">${i + 1}</div>
            <div class="passo-texto">${esc(p)}</div>
          </div>`).join('')}
      </div>
    </section>

    ${personal_posts.length ? `
    <section id="pessoais">
      <div class="wrap">
        <div class="kicker">07 · Posts pessoais</div>
        <div class="extras">
          <h3>Não incluídos na análise estratégica</h3>
          <p class="extras-desc">Esses são conteúdos de lifestyle/viagem que não competem com o conteúdo educativo principal. Foram excluídos da análise pra não distorcer a comparação.</p>
          <div class="extras-grid">
            ${personal_posts.map((p: any) => `
              <div class="extras-item">
                ${p.thumb_url
                  ? `<img src="${p.thumb_url}" alt="post"/>`
                  : `<div style="aspect-ratio:1;background:var(--paper-2);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--fg-3);font-family:var(--mono);font-size:10px">sem thumb</div>`}
                <div class="extras-item-meta">${fmtNum(p.likes)} ♥ · ${fmtNum(p.comments)} ✎</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </section>` : ''}

    <footer>
      <div class="brand">Pinguim<span> · </span>Raio-X<span> · </span>v1.0</div>
      <div class="meta">Gerado em ${fmtDate(meta.generated_at)} · ${meta.duration_seconds || '—'}s de processamento · ${other_posts_analyzed.length + 2} posts analisados em profundidade · Whisper + GPT-4o + Apify</div>
      <div class="formula">
        Este raio-x foi feito com base em dados públicos do Instagram capturados na data acima. O engajamento de cada post é calculado com a fórmula <strong>(likes + 3×comentários) ÷ views</strong>, que pondera interações profundas (comentários valem 3 vezes mais que curtidas). Por isso, um post com menos visualizações pode aparecer como o de melhor performance — significa que ele converteu mais audiência em interação. Recomendações são sugestões estratégicas baseadas em padrões observados no perfil, não promessas de resultado.
      </div>
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
