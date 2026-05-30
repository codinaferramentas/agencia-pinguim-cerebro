// ============================================================
// Render HTML standalone — paleta Pinguim laranja+dark
// Estrutura conforme ESPEC seção 11
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
const tierBadge = (tier?: string): string => {
  if (!tier) return '';
  const map: Record<string, string> = {
    gold: 'background:linear-gradient(135deg,#E85C00 0%,#FB923C 100%);color:#fff',
    silver: 'background:linear-gradient(135deg,#9aa1ad 0%,#c5cad4 100%);color:#1a1a1a',
    bronze: 'background:linear-gradient(135deg,#8a6a4d 0%,#b8946d 100%);color:#fff',
  };
  return `<span style="${map[tier] || map.silver};padding:4px 10px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">${tier}</span>`;
};
const pilarColor = (nota: number): string => {
  if (nota >= 8) return '#22c55e';
  if (nota >= 6) return '#FB923C';
  return '#ef4444';
};
const rubricaTo10 = (r: any): string => {
  if (!r) return '—';
  const vals = Object.values(r).filter((v) => typeof v === 'number') as number[];
  if (!vals.length) return '—';
  const sum = vals.reduce((a, b) => a + b, 0);
  return ((sum / (vals.length * 5)) * 10).toFixed(1);
};

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0f;--bg-2:#0e1019;--card:#111118;--card-2:#16181f;
  --line:#1f2937;--line-2:#2a2a3e;
  --text:#f1f5f9;--muted:#94a3b8;--muted-2:#64748b;
  --accent:#E85C00;--accent-2:#FB923C;
  --good:#22c55e;--warn:#FB923C;--bad:#ef4444;
  --serif:'Cormorant Garamond','Playfair Display',Georgia,serif;
  --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
}
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
body{font-family:var(--sans);background:var(--bg);color:var(--text);line-height:1.55;font-size:15px}
.wrap{max-width:1080px;margin:0 auto;padding:32px 24px}
h1,h2,h3,h4{font-family:var(--serif);font-weight:600;line-height:1.2}
h1{font-size:42px}h2{font-size:38px;margin-bottom:24px}
h3{font-size:22px;margin-bottom:8px}h4{font-size:17px}
.section{padding:48px 0;border-top:1px solid var(--line)}
.section:first-child{border-top:0}
.label{font-family:var(--sans);font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:16px}
.card-accent{background:linear-gradient(135deg,rgba(232,92,0,0.08) 0%,rgba(251,146,60,0.04) 100%);border-color:rgba(232,92,0,0.3)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:900px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}.wrap{padding:20px 16px}h1{font-size:32px}h2{font-size:28px}}

.hero{padding:48px 0 32px;text-align:left}
.hero-brand{display:flex;gap:12px;align-items:center;margin-bottom:24px}
.hero-mark{font-family:var(--serif);font-size:18px;font-weight:700;letter-spacing:0.2em;color:var(--accent)}
.hero-meta{font-size:11px;color:var(--muted);letter-spacing:0.15em;text-transform:uppercase}
.hero-profile{display:flex;gap:24px;align-items:center;margin-bottom:24px;flex-wrap:wrap}
.hero-avatar{width:96px;height:96px;border-radius:50%;border:2px solid var(--accent);object-fit:cover;flex-shrink:0}
.hero-info h1{font-size:36px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.verified{color:var(--accent);font-size:24px}
.hero-handle{font-size:16px;color:var(--muted);margin-top:4px}
.hero-stats{display:flex;gap:24px;margin-top:12px;flex-wrap:wrap}
.hero-stats>div{display:flex;flex-direction:column}
.hero-stats strong{font-family:var(--serif);font-size:24px;font-weight:600;color:var(--accent)}
.hero-stats span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em}
.hero-footer{font-size:12px;color:var(--muted-2);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hero-footer strong{color:var(--text)}

.veredito-nota{font-family:var(--serif);font-size:80px;font-weight:600;color:var(--accent);line-height:1}
.veredito-frase{font-family:var(--serif);font-size:22px;font-style:italic;color:var(--text);margin-top:12px}
.pilar{display:grid;grid-template-columns:160px 60px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);align-items:center}
.pilar-nome{font-weight:600;font-size:13px}
.pilar-nota{font-family:var(--serif);font-size:28px;font-weight:600}
.pilar-bar{height:6px;background:var(--card-2);border-radius:3px;overflow:hidden;margin-top:8px}
.pilar-bar-fill{height:100%;border-radius:3px}
.pilar-just{font-size:13px;color:var(--muted)}

.bio-side{display:flex;flex-direction:column;gap:8px}
.bio-text{background:var(--bg-2);border:1px solid var(--line);border-radius:8px;padding:12px 14px;font-size:14px;white-space:pre-wrap;font-family:var(--sans);min-height:60px}
.bio-score{font-family:var(--serif);font-size:48px;font-weight:600;color:var(--accent);line-height:1}
.rubrica{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 12px;margin-top:8px}
.rubrica-item{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--line)}
.rubrica-item strong{color:var(--accent)}

.post-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:24px}
.post-card-top{border-color:var(--accent);background:linear-gradient(135deg,rgba(232,92,0,0.05) 0%,var(--card) 60%)}
.post-card-worst{border-color:rgba(239,68,68,0.4);background:linear-gradient(135deg,rgba(239,68,68,0.04) 0%,var(--card) 60%)}
.post-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px}
.post-label{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--accent);font-weight:700}
.post-body{display:grid;grid-template-columns:280px 1fr;gap:24px}
@media(max-width:900px){.post-body{grid-template-columns:1fr}}
.post-media img{width:100%;border-radius:8px;border:1px solid var(--line);aspect-ratio:1;object-fit:cover}
.post-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
.post-metric{background:var(--bg-2);border-radius:6px;padding:8px;text-align:center}
.post-metric-v{font-family:var(--serif);font-size:18px;font-weight:600;color:var(--accent)}
.post-metric-l{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em}
.post-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--muted)}
.post-link{display:inline-block;margin-top:8px;font-size:12px;color:var(--accent);text-decoration:none}
.post-link:hover{text-decoration:underline}
.post-nota{font-family:var(--serif);font-size:64px;font-weight:600;color:var(--accent);line-height:1;margin-bottom:8px}
.caption-box{background:var(--bg-2);border-left:3px solid var(--accent);padding:12px 14px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.6;white-space:pre-wrap;margin:12px 0;max-height:180px;overflow-y:auto}
.transcript{margin:12px 0;background:var(--bg-2);border:1px solid var(--line);border-radius:8px;padding:0}
.transcript summary{padding:10px 14px;cursor:pointer;font-size:12px;color:var(--accent);user-select:none}
.transcript[open] summary{border-bottom:1px solid var(--line)}
.transcript p{padding:12px 14px;font-size:13px;line-height:1.6;color:var(--muted);white-space:pre-wrap}
.fatores{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
@media(max-width:900px){.fatores{grid-template-columns:1fr}}
.fatores ul{list-style:none;padding:0}
.fatores li{padding:8px 0 8px 24px;position:relative;font-size:13px;border-bottom:1px solid var(--line)}
.fatores .pos li:before{content:'✓';position:absolute;left:0;color:var(--good);font-weight:700}
.fatores .neg li:before{content:'×';position:absolute;left:0;color:var(--bad);font-weight:700}
.analise-block{margin-top:12px}
.analise-block h5{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;font-family:var(--sans);font-weight:600}
.analise-block p{font-size:13px;color:var(--text);line-height:1.6;margin-bottom:12px}
.citacoes{background:rgba(232,92,0,0.06);border-left:3px solid var(--accent);padding:12px 14px;border-radius:0 8px 8px 0;font-style:italic;font-size:13px;margin:12px 0}
.citacoes blockquote{margin:6px 0;color:var(--text)}
.recomendacoes{margin-top:16px;background:var(--bg-2);border-radius:8px;padding:16px}
.recomendacoes h5{margin-bottom:8px}
.recomendacoes ol{padding-left:20px}
.recomendacoes li{font-size:13px;margin-bottom:6px;line-height:1.6}
.rank-divider{display:flex;align-items:center;gap:12px;margin:32px 0 16px}
.rd-label{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--accent);font-weight:700}
.rd-rule{flex:1;height:1px;background:linear-gradient(90deg,var(--accent) 0%,transparent 100%);opacity:0.3}

.opp-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:12px;display:grid;grid-template-columns:60px 1fr;gap:16px}
.opp-num{font-family:var(--serif);font-size:48px;font-weight:600;color:var(--accent);line-height:1}
.opp-content h4{font-size:18px;margin-bottom:8px}
.opp-content p{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:8px}
.opp-meta{display:flex;gap:10px;font-size:11px;color:var(--muted);margin-bottom:8px;flex-wrap:wrap}
.opp-meta strong{color:var(--text)}
.opp-step{background:rgba(232,92,0,0.08);border-radius:6px;padding:10px 12px;font-size:13px;border-left:2px solid var(--accent)}
.opp-step strong{color:var(--accent)}

.risco-card{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--bad);border-radius:12px;padding:20px;margin-bottom:12px}
.risco-card h4{font-size:17px;margin-bottom:8px}
.risco-card p{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:6px}
.risco-impacto{margin-top:8px;font-size:12px;color:var(--bad);font-style:italic}

.passo-card{display:grid;grid-template-columns:60px 1fr;gap:16px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:12px}
.passo-num{font-family:var(--serif);font-size:48px;font-weight:600;color:var(--accent);line-height:1;text-align:center}
.passo-texto{font-size:15px;line-height:1.5}

.extras{margin-top:48px;padding:20px;border:1px dashed var(--line);border-radius:12px}
.extras h3{font-size:16px;margin-bottom:8px;color:var(--muted)}
.extras-desc{font-size:12px;color:var(--muted-2);margin-bottom:16px}
.extras-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.extras-item{background:var(--card-2);border-radius:8px;padding:8px}
.extras-item img{width:100%;border-radius:6px;aspect-ratio:1;object-fit:cover}
.extras-item-meta{font-size:11px;color:var(--muted);margin-top:6px;text-align:center}

footer.footer{margin-top:48px;padding:32px 0;text-align:center;font-size:12px;color:var(--muted-2);border-top:1px solid var(--line)}
footer.footer .formula{margin-top:16px;padding:16px;background:var(--bg-2);border-radius:8px;text-align:left;font-size:12px;line-height:1.7}

@media print{
  body{background:#fff!important}
  *{color:#111!important}
  .accent,.hero-mark,.hero-stats strong,.verified,.veredito-nota,.bio-score,.post-nota,.opp-num,.passo-num,.rd-label,.post-label{color:#b07a30!important}
  details{display:block!important}
  details>summary~*{display:block!important}
  .card,.post-card,.opp-card,.risco-card,.passo-card,.extras{background:#fff!important;border-color:#ccc!important;box-shadow:none}
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

function renderPostCard(label: string, post: any, rank?: string): string {
  const a = post.analysis;
  const tier = a?.classificacao || post.tier;
  const cardClass = label.startsWith('TOP') ? 'post-card-top' : label.startsWith('WORST') ? 'post-card-worst' : '';
  const isVideo = post.post_type === 'Reel' || post.post_type === 'Video';

  return `
<div class="post-card ${cardClass}">
  <div class="post-header">
    <span class="post-label">${esc(rank || label)}</span>
    ${tierBadge(tier)}
  </div>
  <div class="post-body">
    <div class="post-media">
      ${post.thumb_url ? `<img src="${post.thumb_url}" alt="thumbnail"/>` : `<div style="width:100%;aspect-ratio:1;background:var(--card-2);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted-2)">sem thumbnail</div>`}
      <div class="post-metrics">
        <div class="post-metric"><div class="post-metric-v">${fmtNum(post.likes)}</div><div class="post-metric-l">likes</div></div>
        <div class="post-metric"><div class="post-metric-v">${fmtNum(post.comments)}</div><div class="post-metric-l">coment.</div></div>
        ${isVideo ? `<div class="post-metric"><div class="post-metric-v">${fmtNum(post.views)}</div><div class="post-metric-l">views</div></div>` : ''}
        <div class="post-metric"><div class="post-metric-v">${(post.engagement_score * 100).toFixed(2)}%</div><div class="post-metric-l">engaj.</div></div>
      </div>
      <div class="post-meta">
        <span>${esc(post.post_type)}</span>
        ${post.timestamp ? `<span>·</span><span>${esc(new Date(post.timestamp).toLocaleDateString('pt-BR'))}</span>` : ''}
      </div>
      ${post.url ? `<a class="post-link" href="${esc(post.url)}" target="_blank">ver no Instagram →</a>` : ''}
    </div>
    <div>
      <div class="post-nota">${(a?.nota_geral ?? 0).toFixed(1)}<span style="font-size:24px;color:var(--muted)">/10</span></div>
      <p style="font-size:14px;line-height:1.6;color:var(--text);margin-bottom:12px">${esc(a?.resumo_desempenho || '')}</p>
      ${post.full_caption ? `<div class="caption-box">${esc(post.full_caption)}</div>` : ''}
      ${post.transcript ? `<details class="transcript"><summary>📝 Transcrição literal do áudio</summary><p>${esc(post.transcript)}</p></details>` : ''}
      <div class="fatores">
        <div class="pos"><h5 class="label" style="margin-bottom:8px">O que funcionou</h5><ul>${(a?.fatores_positivos || []).map((f: string) => `<li>${esc(f)}</li>`).join('')}</ul></div>
        <div class="neg"><h5 class="label" style="margin-bottom:8px">Pontos a melhorar</h5><ul>${(a?.fatores_negativos || []).map((f: string) => `<li>${esc(f)}</li>`).join('')}</ul></div>
      </div>
      <div class="analise-block">
        <h5>Gancho</h5><p>${esc(a?.analise_gancho || '')}</p>
        <h5>Áudio</h5><p>${esc(a?.analise_audio || 'N/A')}</p>
        <h5>Legenda</h5><p>${esc(a?.analise_legenda || '')}</p>
        <h5>Formato</h5><p>${esc(a?.analise_formato || '')}</p>
        <h5>Hashtags</h5><p>${esc(a?.analise_hashtags || '')}</p>
        <h5>Estratégia</h5><p>${esc(a?.analise_estrategica || '')}</p>
      </div>
      ${(a?.citacoes_de_impacto || []).length ? `<div class="citacoes"><h5 class="label" style="margin-bottom:6px">Frases marcantes</h5>${(a.citacoes_de_impacto).map((c: string) => `<blockquote>"${esc(c)}"</blockquote>`).join('')}</div>` : ''}
      <div class="recomendacoes">
        <h5 class="label">Recomendações acionáveis</h5>
        <ol>${(a?.recomendacoes || []).map((r: string) => `<li>${esc(r)}</li>`).join('')}</ol>
      </div>
    </div>
  </div>
</div>`;
}

export function renderHtml(input: RenderInput): string {
  const { meta, profile, metrics, top_post, worst_post, other_posts_analyzed, bio_analysis, cross_insights, overview, personal_posts } = input;

  const rubricaLabels = { clareza: 'Clareza', autoridade: 'Autoridade', forca_cta: 'Força CTA', seo_descoberta: 'SEO', voz_da_marca: 'Voz', especificidade: 'Especificidade' };
  const pilarLabels: Record<string, string> = { clareza_nicho: 'Clareza de Nicho', autoridade_percebida: 'Autoridade Percebida', estrategia_conteudo: 'Estratégia de Conteúdo', monetizacao: 'Monetização', engajamento_relacionamento: 'Engajamento & Relacionamento' };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Raio-X · @${esc(profile.handle)}</title>
<style>${CSS}</style>
</head>
<body><div class="wrap">

<!-- HERO -->
<section class="hero">
  <div class="hero-brand">
    <span class="hero-mark">🐧 RAIO-X PINGUIM</span>
    <span class="hero-meta">Análise Estratégica · Instagram</span>
  </div>
  <div class="hero-profile">
    ${profile.avatar_url ? `<img class="hero-avatar" src="${profile.avatar_url}" alt="avatar"/>` : `<div class="hero-avatar" style="background:var(--card-2);display:flex;align-items:center;justify-content:center;color:var(--muted-2);font-size:32px">👤</div>`}
    <div class="hero-info">
      <h1>${esc(profile.full_name || profile.handle)}${profile.is_verified ? ' <span class="verified">✓</span>' : ''}</h1>
      <div class="hero-handle">@${esc(profile.handle)}</div>
      <div class="hero-stats">
        <div><strong>${fmtNum(profile.followers)}</strong><span>seguidores</span></div>
        <div><strong>${fmtNum(profile.following)}</strong><span>seguindo</span></div>
        <div><strong>${fmtNum(profile.posts_count)}</strong><span>publicações</span></div>
      </div>
    </div>
  </div>
  <div class="hero-footer">
    <span>Diagnóstico estratégico</span><span>·</span>
    <span>Gerado em ${fmtDate(meta.generated_at)}</span><span>·</span>
    <span>Nicho: <strong>${esc(meta.nicho)}</strong></span>
  </div>
</section>

<!-- 01 VEREDITO -->
<section class="section">
  <span class="label">01 · Veredito</span>
  <h2>Diagnóstico estratégico</h2>
  <div class="card card-accent" style="text-align:center;padding:40px 24px">
    <div class="veredito-nota">${(overview?.nota_geral ?? 0).toFixed(1)}<span style="font-size:32px;color:var(--muted);font-weight:400">/10</span></div>
    <div class="veredito-frase">"${esc(overview?.veredito_curto || '')}"</div>
  </div>
  <div class="grid-3" style="margin-top:24px">
    <div class="card"><h5 class="label">Como aparece hoje</h5><p style="margin-top:8px;font-size:14px;line-height:1.6">${esc(overview?.identidade_atual || '')}</p></div>
    <div class="card"><h5 class="label">Para onde pode evoluir</h5><p style="margin-top:8px;font-size:14px;line-height:1.6">${esc(overview?.identidade_ideal || '')}</p></div>
    <div class="card"><h5 class="label">Público inferido</h5><p style="margin-top:8px;font-size:14px;line-height:1.6">${esc(overview?.publico_alvo_inferido || '')}</p></div>
  </div>
  <div style="margin-top:24px">
    ${Object.entries(overview?.pilares || {}).map(([k, v]: [string, any]) => `
      <div class="pilar">
        <div class="pilar-nome">${esc(pilarLabels[k] || k)}</div>
        <div class="pilar-nota" style="color:${pilarColor(v.nota)}">${v.nota.toFixed(1)}</div>
        <div>
          <div class="pilar-bar"><div class="pilar-bar-fill" style="width:${v.nota * 10}%;background:${pilarColor(v.nota)}"></div></div>
          <div class="pilar-just">${esc(v.justificativa)}</div>
        </div>
      </div>`).join('')}
  </div>
</section>

<!-- 02 BIO -->
<section class="section">
  <span class="label">02 · Bio</span>
  <h2>Análise e otimização da bio</h2>
  <div class="grid-2">
    <div>
      <h5 class="label">Bio atual</h5>
      <div class="bio-text">${esc(profile.bio_text || '(vazio)')}</div>
      <div class="bio-score">${rubricaTo10(bio_analysis?.rubrica_bio_atual)}<span style="font-size:18px;color:var(--muted)">/10</span></div>
      <div class="rubrica">
        ${Object.entries(bio_analysis?.rubrica_bio_atual || {}).map(([k, v]: [string, any]) => `<div class="rubrica-item"><span>${esc((rubricaLabels as any)[k] || k)}</span><strong>${v}/5</strong></div>`).join('')}
      </div>
    </div>
    <div>
      <h5 class="label">Bio sugerida</h5>
      <div class="bio-text" style="border-left:3px solid var(--accent)">${esc(bio_analysis?.bio_sugerida || '')}</div>
      <div class="bio-score">${rubricaTo10(bio_analysis?.rubrica_bio_nova)}<span style="font-size:18px;color:var(--muted)">/10</span></div>
      <div class="rubrica">
        ${Object.entries(bio_analysis?.rubrica_bio_nova || {}).map(([k, v]: [string, any]) => `<div class="rubrica-item"><span>${esc((rubricaLabels as any)[k] || k)}</span><strong>${v}/5</strong></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h5 class="label">Diagnóstico detalhado</h5>
    <div class="grid-2" style="margin-top:8px;gap:12px">
      ${Object.entries(bio_analysis?.analise_diagnostica || {}).map(([k, v]: [string, any]) => `<div><strong style="font-size:12px;color:var(--accent);text-transform:capitalize">${esc(k.replace(/_/g, ' '))}</strong><div style="font-size:13px;color:var(--muted);margin-top:4px">${esc(v)}</div></div>`).join('')}
    </div>
  </div>
  <div class="grid-2" style="margin-top:16px">
    <div class="card"><h5 class="label">Pontos fortes</h5><p style="margin-top:8px;font-size:13px;line-height:1.6">${esc(bio_analysis?.pontos_fortes || '')}</p></div>
    <div class="card"><h5 class="label">Pontos de melhoria</h5><p style="margin-top:8px;font-size:13px;line-height:1.6">${esc(bio_analysis?.pontos_de_melhoria || '')}</p></div>
  </div>
  ${bio_analysis?.sugestao_keyword_nome ? `<div class="card card-accent" style="margin-top:16px"><h5 class="label">Keyword sugerida pro campo Nome</h5><p style="margin-top:8px;font-size:14px"><strong style="color:var(--accent);font-size:18px">${esc(bio_analysis.sugestao_keyword_nome)}</strong></p></div>` : ''}
  ${bio_analysis?.justificativa_bio ? `<div class="card card-accent" style="margin-top:16px"><h5 class="label">Por que essa bio funciona</h5><p style="margin-top:8px;font-size:13px;line-height:1.6">${esc(bio_analysis.justificativa_bio)}</p></div>` : ''}
  <h3 style="margin-top:32px;margin-bottom:12px">3 variações estratégicas</h3>
  <div class="grid-3">
    <div class="card"><h5 class="label">Autoridade</h5><div class="bio-text" style="margin-top:8px">${esc(bio_analysis?.bio_variacao_autoridade || '')}</div></div>
    <div class="card"><h5 class="label">Conexão</h5><div class="bio-text" style="margin-top:8px">${esc(bio_analysis?.bio_variacao_conexao || '')}</div></div>
    <div class="card"><h5 class="label">Ação</h5><div class="bio-text" style="margin-top:8px">${esc(bio_analysis?.bio_variacao_acao || '')}</div></div>
  </div>
</section>

<!-- 03 POSTS -->
<section class="section">
  <span class="label">03 · Posts</span>
  <h2>Análise profunda de conteúdo</h2>
  <div class="grid-4">
    <div class="card" style="text-align:center"><div style="font-family:var(--serif);font-size:32px;color:var(--accent);font-weight:600">${fmtNum(metrics?.avg_likes_pro)}</div><div class="label">likes médios</div></div>
    <div class="card" style="text-align:center"><div style="font-family:var(--serif);font-size:32px;color:var(--accent);font-weight:600">${fmtNum(metrics?.avg_comments_pro)}</div><div class="label">comentários</div></div>
    <div class="card" style="text-align:center"><div style="font-family:var(--serif);font-size:32px;color:var(--accent);font-weight:600">${fmtNum(metrics?.avg_views_pro)}</div><div class="label">views</div></div>
    <div class="card" style="text-align:center"><div style="font-family:var(--serif);font-size:32px;color:var(--accent);font-weight:600">${((metrics?.avg_engagement_pro || 0) * 100).toFixed(2)}%</div><div class="label">engaj. médio</div></div>
  </div>

  <div class="rank-divider"><span class="rd-label">★ Destaque positivo</span><span class="rd-rule"></span></div>
  ${renderPostCard('★ POST DE MAIOR PERFORMANCE', top_post)}

  <div class="card" style="background:var(--card-2);border-left:3px solid var(--accent);margin-top:8px">
    <h5 class="label">Insights cruzados</h5>
    <div class="grid-3" style="margin-top:12px;gap:16px">
      <div><strong style="color:var(--accent);font-size:12px">Padrão que funciona</strong><p style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.6">${esc(cross_insights?.padrao_que_funciona || '')}</p></div>
      <div><strong style="color:var(--accent);font-size:12px">O que o de menor performance pode aprender</strong><p style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.6">${esc(cross_insights?.o_que_o_worst_pode_aprender || '')}</p></div>
      <div><strong style="color:var(--accent);font-size:12px">Padrões gerais do perfil</strong><p style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.6">${esc(cross_insights?.padroes_do_perfil || '')}</p></div>
    </div>
  </div>

  ${other_posts_analyzed.length ? `<div class="rank-divider"><span class="rd-label">Demais posts profissionais · ranqueados por nota</span><span class="rd-rule"></span></div>` : ''}
  ${other_posts_analyzed.map((p, i) => renderPostCard(`#${i + 2} · ${(p.analysis?.nota_geral ?? 0).toFixed(1)}/10`, p, `#${i + 2} · ${(p.analysis?.nota_geral ?? 0).toFixed(1)}/10`)).join('')}

  <div class="rank-divider"><span class="rd-label">⚠ Maior oportunidade de melhoria</span><span class="rd-rule"></span></div>
  ${renderPostCard('⚠ POST DE MENOR PERFORMANCE', worst_post)}
</section>

<!-- 04 OPORTUNIDADES -->
<section class="section">
  <span class="label">04 · Oportunidades</span>
  <h2>O que fazer pra crescer</h2>
  ${(overview?.oportunidades || []).map((o: any, i: number) => `
    <div class="opp-card">
      <div class="opp-num">${i + 1}</div>
      <div class="opp-content">
        <h4>${esc(o.titulo)}</h4>
        <p>${esc(o.racional)}</p>
        <div class="opp-meta">
          <span>Impacto: <strong style="color:${o.impacto_esperado === 'alto' ? 'var(--good)' : o.impacto_esperado === 'medio' ? 'var(--warn)' : 'var(--muted)'}">${esc(o.impacto_esperado)}</strong></span>
          <span>·</span>
          <span>Esforço: <strong>${esc(o.esforco)}</strong></span>
        </div>
        <div class="opp-step"><strong>Comece esta semana:</strong> ${esc(o.primeiro_passo)}</div>
      </div>
    </div>`).join('')}
</section>

<!-- 05 RISCOS -->
<section class="section">
  <span class="label">05 · Riscos</span>
  <h2>O que pode travar</h2>
  ${(overview?.riscos || []).map((r: any) => `
    <div class="risco-card">
      <h4>${esc(r.titulo)}</h4>
      <p>${esc(r.descricao)}</p>
      <div class="risco-impacto">Se não resolvido: ${esc(r.impacto_se_nao_resolvido)}</div>
    </div>`).join('')}
</section>

<!-- 06 PROXIMOS -->
<section class="section">
  <span class="label">06 · Próximos passos</span>
  <h2>Pra começar agora</h2>
  ${(overview?.proximos_passos || []).map((p: string, i: number) => `
    <div class="passo-card">
      <div class="passo-num">${i + 1}</div>
      <div class="passo-texto">${esc(p)}</div>
    </div>`).join('')}
</section>

<!-- EXTRAS -->
${personal_posts.length ? `
<div class="extras">
  <h3>Posts pessoais não incluídos na análise estratégica</h3>
  <p class="extras-desc">Esses são conteúdos de lifestyle/viagem que não competem com o conteúdo educativo principal. Foram excluídos da análise para não distorcer a comparação.</p>
  <div class="extras-grid">
    ${personal_posts.map((p: any) => `
      <div class="extras-item">
        ${p.thumb_url ? `<img src="${p.thumb_url}" alt="post"/>` : `<div style="aspect-ratio:1;background:var(--card-2);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--muted-2)">—</div>`}
        <div class="extras-item-meta">${fmtNum(p.likes)} ❤ · ${fmtNum(p.comments)} 💬</div>
      </div>`).join('')}
  </div>
</div>` : ''}

<footer class="footer">
  <strong>— FIM DO DIAGNÓSTICO —</strong>
  <div style="margin-top:8px">Gerado em ${fmtDate(meta.generated_at)} · ${meta.duration_seconds || '—'}s de processamento · ${other_posts_analyzed.length + 2} posts profissionais analisados em profundidade · transcrições via OpenAI Whisper.</div>
  <div class="formula">
    Este raio-x foi feito com base em dados públicos do Instagram capturados na data acima. O engajamento de cada post é calculado com a fórmula <strong>(likes + 3×comentários) ÷ views</strong>, que pondera interações profundas (comentários valem 3 vezes mais que curtidas). Por isso, um post com menos visualizações pode aparecer como o de melhor performance — significa que ele converteu mais audiência em interação. Recomendações são sugestões estratégicas baseadas em padrões observados no perfil, não promessas de resultado.
  </div>
</footer>

</div></body></html>`;
}
