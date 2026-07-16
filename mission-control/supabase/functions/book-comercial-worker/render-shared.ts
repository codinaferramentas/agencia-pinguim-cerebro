// ============================================================
// render-shared.ts — helpers + CSS comum dos renderizadores
// do Book Comercial 365 (identidade visual "elo.")
//
// IMPORTANTE: este arquivo é importado pelo render-cliente.ts.
// NÃO incluir aqui (nem em class names, nem em CSS) as strings
// proibidas no HTML do cliente: bio_sugerida / variacao /
// recomendac / identidade_ideal / transcript / roteiro / munição.
// Tudo que for exclusivo do consultor vive no render-book.ts.
// ============================================================

// ---------- Tipos ----------

export interface Lead {
  nome: string;
  email: string;
  telefone: string;
  instagram: string;
  nicho: string | null;
  faturamento: string | null;
  data_call: string;
  form_recebido: boolean;
}

// JSON da tool-analise-perfil-ig — campos todos possivelmente ausentes.
export interface AnaliseJson {
  meta?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  top_post?: Record<string, unknown> | null;
  worst_post?: Record<string, unknown> | null;
  other_posts_analyzed?: Record<string, unknown>[];
  bio_analysis?: Record<string, unknown> | null;
  cross_insights?: Record<string, unknown> | null;
  overview?: Record<string, unknown> | null;
  personal_posts?: Record<string, unknown>[];
  posts?: Record<string, unknown>[];
  [k: string]: unknown;
}

// ---------- Formatação ----------

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

const asNum = (n: unknown): number | null => {
  if (n === null || n === undefined || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
};

const milhar = (v: number): string =>
  String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const umaCasa = (v: number): string =>
  v.toFixed(1).replace(/\.0$/, '').replace('.', ',');

/** 1.234 / 12,5 mil / 1,2 mi — pt-BR. '—' se ausente. */
export const fmtNum = (n: unknown): string => {
  const v = asNum(n);
  if (v === null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return umaCasa(v / 1_000_000) + ' mi';
  if (abs >= 10_000) return umaCasa(v / 1_000) + ' mil';
  return milhar(v);
};

/** Nota com 1 casa decimal e vírgula. '—' se ausente. */
export const fmtNota = (n: unknown): string => {
  const v = asNum(n);
  return v === null ? '—' : v.toFixed(1).replace('.', ',');
};

/** Percentual a partir de fração (0.0123 -> "1,23%"). */
export const fmtPct = (n: unknown): string => {
  const v = asNum(n);
  return v === null ? '—' : (v * 100).toFixed(2).replace('.', ',') + '%';
};

/** Data pt-BR dd/mm/aaaa. Aceita ISO date/datetime; string já formatada passa direto. */
export const fmtData = (raw: unknown): string => {
  if (raw === null || raw === undefined || raw === '') return '—';
  const s = String(raw);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const base = `${m[3]}/${m[2]}/${m[1]}`;
    const t = s.match(/[T ](\d{2}):(\d{2})/);
    return t ? `${base} às ${t[1]}h${t[2]}` : base;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d{4}/.test(s)) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return esc(s);
};

/** Primeiras N palavras + reticências. */
export const truncaPalavras = (s: unknown, n: number): string => {
  const palavras = String(s ?? '').trim().split(/\s+/);
  if (palavras.length <= n) return String(s ?? '').trim();
  return palavras.slice(0, n).join(' ') + '…';
};

/** Trunca por caracteres respeitando palavra. */
export const truncaChars = (s: unknown, max: number): string => {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
};

// ---------- Semáforo / scores ----------

/** Cor por nota 0-10: >=8 verde, 6-7.9 âmbar, <6 vermelho. */
export const semaforo = (nota: unknown): string => {
  const v = asNum(nota);
  if (v === null) return 'var(--muted)';
  if (v >= 8) return 'var(--good)';
  if (v >= 6) return 'var(--warn)';
  return 'var(--bad)';
};

/** Score 0-10 a partir de uma rubrica de critérios 1-5: soma/(n*5)*10, 1 casa. */
export const rubricaScore10 = (r: unknown): number | null => {
  if (!r || typeof r !== 'object') return null;
  const vals = Object.values(r as Record<string, unknown>)
    .map(asNum)
    .filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const soma = vals.reduce((a, b) => a + b, 0);
  return Math.round((soma / (vals.length * 5)) * 100) / 10;
};

// ---------- Labels canônicos ----------

export const RUBRICA_BIO_LABELS: Record<string, string> = {
  clareza: 'Clareza',
  autoridade: 'Autoridade',
  forca_cta: 'Força do CTA',
  seo_descoberta: 'SEO / Descoberta',
  voz_da_marca: 'Voz da marca',
  especificidade: 'Especificidade',
};

export const RUBRICA_POST_LABELS: Record<string, string> = {
  gancho: 'Gancho',
  legenda: 'Legenda',
  formato: 'Formato',
  engajamento: 'Engajamento',
  estrategia: 'Estratégia',
};

export const PILAR_LABELS: Record<string, string> = {
  clareza_nicho: 'Clareza de nicho',
  autoridade_percebida: 'Autoridade percebida',
  estrategia_conteudo: 'Estratégia de conteúdo',
  monetizacao: 'Monetização',
  engajamento_relacionamento: 'Engajamento & relacionamento',
};

export const DIAG_BIO_LABELS: Record<string, string> = {
  proposta_valor: 'Proposta de valor',
  segmentacao_publico: 'Segmentação de público',
  gatilhos_autoridade: 'Gatilhos de autoridade',
  cta_conversao: 'CTA & conversão',
  seo_instagram: 'SEO no Instagram',
  tom_de_voz: 'Tom de voz',
};

// ---------- Componentes ----------

/** Marca "pinguim." com ponto laranja. */
export const marca = (): string =>
  `<span class="marca">pinguim<span class="marca-pt">.</span></span>`;

/** Badge de série: gold→Série A, silver→Série B, bronze→Série C. Nunca escreve o tier cru. */
export const serieBadge = (tier: unknown): string => {
  const map: Record<string, { txt: string; cls: string }> = {
    gold: { txt: 'Série A', cls: 'serie-a' },
    silver: { txt: 'Série B', cls: 'serie-b' },
    bronze: { txt: 'Série C', cls: 'serie-c' },
  };
  const t = map[String(tier ?? '').toLowerCase()] || map.silver;
  return `<span class="serie ${t.cls}">${t.txt}</span>`;
};

/** Chip de nota 0-10 com semáforo. */
export const notaChip = (nota: unknown): string => {
  return `<span class="nota-chip" style="color:${semaforo(nota)}">${fmtNota(nota)}<small>/10</small></span>`;
};

/** Cabeçalho de seção: número gigante laranja + título + régua laranja. */
export const secHead = (num: string, titulo: string, sub?: string): string => `
<header class="sec-head">
  <span class="sec-num">${esc(num)}</span>
  <div class="sec-head-txt">
    <h2 class="sec-titulo">${esc(titulo)}</h2>
    ${sub ? `<p class="sec-sub">${esc(sub)}</p>` : ''}
  </div>
</header>`;

/** Barra horizontal 1-5 (rubricas). */
export const barraRubrica = (label: string, val: unknown, escuro = false): string => {
  const v = asNum(val);
  const pct = v === null ? 0 : Math.max(0, Math.min(100, (v / 5) * 100));
  return `
<div class="rub-item${escuro ? ' rub-escuro' : ''}">
  <span class="rub-label">${esc(label)}</span>
  <span class="rub-track"><span class="rub-fill" style="width:${pct}%"></span></span>
  <span class="rub-val">${v === null ? '—' : String(v).replace('.', ',')}<small>/5</small></span>
</div>`;
};

/** Bloco de barras a partir de um objeto rubrica {criterio: 1-5}. */
export const rubricaBarras = (
  rubrica: unknown,
  labels: Record<string, string>,
  escuro = false
): string => {
  if (!rubrica || typeof rubrica !== 'object') return '<p class="vazio">Sem avaliação disponível.</p>';
  const linhas = Object.entries(rubrica as Record<string, unknown>)
    .map(([k, v]) => barraRubrica(labels[k] || k.replace(/_/g, ' '), v, escuro))
    .join('');
  return `<div class="rub">${linhas}</div>`;
};

/** Linha de pilar (nota 1-10, barra com semáforo, justificativa). */
export const pilarRow = (nome: string, nota: unknown, justificativa: unknown): string => {
  const v = asNum(nota);
  const cor = semaforo(v);
  const pct = v === null ? 0 : Math.max(0, Math.min(100, v * 10));
  return `
<div class="pilar">
  <div class="pilar-topo">
    <span class="pilar-nome">${esc(nome)}</span>
    <span class="pilar-nota" style="color:${cor}">${fmtNota(v)}</span>
  </div>
  <div class="pilar-track"><div class="pilar-fill" style="width:${pct}%;background:${cor}"></div></div>
  ${justificativa ? `<p class="pilar-just">${esc(justificativa)}</p>` : ''}
</div>`;
};

/** Stat row do hero: número grande laranja + label. */
export const statRow = (stats: { num: string; label: string }[]): string => `
<div class="stats" style="grid-template-columns:repeat(${stats.length},1fr)">
  ${stats.map((s) => `
  <div class="stat">
    <div class="stat-num">${s.num}</div>
    <div class="stat-label">${esc(s.label)}</div>
  </div>`).join('')}
</div>`;

/** Avatar circular com placeholder (inicial do nome). */
export const avatarHtml = (url: unknown, nome: unknown, cls = 'avatar'): string => {
  if (url && typeof url === 'string') {
    return `<img class="${cls}" src="${esc(url)}" alt="avatar de ${esc(nome)}"/>`;
  }
  const inicial = String(nome ?? '?').trim().charAt(0).toUpperCase() || '?';
  return `<div class="${cls} avatar-ph">${esc(inicial)}</div>`;
};

// ---------- Post card (parte comum aos dois renders) ----------

export interface PostCardOpts {
  label: string;
  destaque?: 'top' | 'worst';
  compacto?: boolean;
  /** HTML extra injetado no fim do card (ex.: material interno no book). */
  extraHtml?: string;
}

const analiseMini = (titulo: string, texto: unknown): string => {
  if (!texto) return '';
  return `
  <div class="an-mini">
    <h5>${esc(titulo)}</h5>
    <p>${esc(texto)}</p>
  </div>`;
};

/**
 * Card de post: thumb + métricas + série + nota + resumo + fatores +
 * análises + rubrica + citações. Sem nenhum conteúdo interno de consultor
 * (isso entra via opts.extraHtml, montado no render-book).
 */
export const renderPostCard = (post: Record<string, unknown>, opts: PostCardOpts): string => {
  const a = (post?.analysis ?? null) as Record<string, unknown> | null;
  const tier = a?.classificacao ?? post?.tier;
  const isVideo = post?.post_type === 'Reel' || post?.post_type === 'Video';
  const cls = [
    'post-card',
    opts.destaque === 'top' ? 'post-top' : '',
    opts.destaque === 'worst' ? 'post-worst' : '',
    opts.compacto ? 'post-compacto' : '',
  ].filter(Boolean).join(' ');

  const citacoes = Array.isArray(a?.citacoes_de_impacto) ? (a?.citacoes_de_impacto as unknown[]) : [];
  const fatoresPos = Array.isArray(a?.fatores_positivos) ? (a?.fatores_positivos as unknown[]) : [];
  const fatoresNeg = Array.isArray(a?.fatores_negativos) ? (a?.fatores_negativos as unknown[]) : [];
  const caption = post?.full_caption ? truncaChars(post.full_caption, opts.compacto ? 160 : 260) : '';

  const metricas = `
    <div class="pm-grid">
      <div class="pm"><span class="pm-v">${fmtNum(post?.likes)}</span><span class="pm-l">curtidas</span></div>
      <div class="pm"><span class="pm-v">${fmtNum(post?.comments)}</span><span class="pm-l">coment.</span></div>
      ${isVideo && post?.views != null ? `<div class="pm"><span class="pm-v">${fmtNum(post?.views)}</span><span class="pm-l">views</span></div>` : ''}
      <div class="pm"><span class="pm-v">${fmtPct(post?.engagement_score)}</span><span class="pm-l">engaj.</span></div>
    </div>`;

  const analises = a ? `
    <div class="an-grid">
      ${analiseMini('Gancho', a.analise_gancho)}
      ${analiseMini('Áudio', a.analise_audio)}
      ${analiseMini('Legenda', a.analise_legenda)}
      ${analiseMini('Formato', a.analise_formato)}
      ${analiseMini('Hashtags', a.analise_hashtags)}
      ${analiseMini('Estratégia', a.analise_estrategica)}
    </div>` : '';

  const fatores = (fatoresPos.length || fatoresNeg.length) ? `
    <div class="fatores">
      <div class="fat fat-pos">
        <h5>O que funcionou</h5>
        <ul>${fatoresPos.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>
      <div class="fat fat-neg">
        <h5>Pontos a evoluir</h5>
        <ul>${fatoresNeg.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>
    </div>` : '';

  return `
<article class="${cls}">
  <div class="post-head">
    <span class="post-label">${esc(opts.label)}</span>
    <span class="post-head-dir">
      ${serieBadge(tier)}
      ${a ? notaChip(a.nota_geral) : ''}
    </span>
  </div>
  <div class="post-body">
    <div class="post-media">
      ${post?.thumb_url
        ? `<img class="post-thumb" src="${esc(post.thumb_url)}" alt="capa do post"/>`
        : `<div class="post-thumb post-thumb-ph">sem imagem</div>`}
      ${metricas}
      <div class="post-meta">
        ${post?.post_type ? `<span>${esc(post.post_type)}</span>` : ''}
        ${post?.timestamp ? `<span>·</span><span>${fmtData(post.timestamp)}</span>` : ''}
        ${post?.video_duration ? `<span>·</span><span>${esc(post.video_duration)}s</span>` : ''}
      </div>
      ${post?.url ? `<a class="post-link so-tela" href="${esc(post.url)}" target="_blank" rel="noopener">ver no Instagram →</a>` : ''}
    </div>
    <div class="post-conteudo">
      ${a?.resumo_desempenho ? `<p class="post-resumo">${esc(a.resumo_desempenho)}</p>` : '<p class="vazio">Análise detalhada indisponível para este post.</p>'}
      ${caption ? `<div class="caption-box">${esc(caption)}</div>` : ''}
      ${a?.rubrica ? rubricaBarras(a.rubrica, RUBRICA_POST_LABELS) : ''}
      ${fatores}
      ${analises}
      ${citacoes.length ? `
      <div class="citacoes">
        <h5>Frases marcantes</h5>
        ${citacoes.map((c) => `<blockquote class="fr">“${esc(c)}”</blockquote>`).join('')}
      </div>` : ''}
      ${opts.extraHtml || ''}
    </div>
  </div>
</article>`;
};

// ---------- CSS comum ----------

export const SHARED_CSS = `
:root{
  --paper:#f7f4ef; --paper-2:#efeae1;
  --ink:#111111; --ink-soft:#33322f;
  --muted:#8a857c; --muted-2:#b4afa4; --line:#ded8cc;
  --accent:#f4531f; --accent-soft:#fdeee7;
  --dark:#141210;
  --good:#1f9d55; --warn:#c9821f; --bad:#d0402a;
  --f-black:'Archivo Black','Arial Black',system-ui,sans-serif;
  --f-serif:'Fraunces',Georgia,'Times New Roman',serif;
  --f-sans:'Archivo',-apple-system,system-ui,'Segoe UI',sans-serif;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;
  color:var(--ink);
  font-family:var(--f-sans);
  font-size:15px;
  line-height:1.6;
  background-color:var(--paper);
  background-image:radial-gradient(circle, rgba(138,133,124,.28) .5px, transparent .6px);
  background-size:22px 22px;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
img{max-width:100%}
a{color:var(--accent);text-decoration:none}
h1,h2,h3,h4{margin:0}
p{margin:0 0 .75em}
p:last-child{margin-bottom:0}
small{font-weight:400}
.fr{font-family:var(--f-serif);font-style:italic}
.vazio{color:var(--muted);font-size:13px;font-style:italic}

.pagina{max-width:900px;margin:0 auto;padding:0 28px 48px}

/* ---- marca ---- */
.marca{font-family:var(--f-black);font-size:inherit;letter-spacing:.01em;color:inherit}
.marca-pt{color:var(--accent)}

/* ---- hero ---- */
.hero{padding:36px 0 8px}
.hero-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--line);margin-bottom:30px;font-size:17px}
.hero-badge{font-family:var(--f-black);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);border:1.5px solid var(--accent);padding:6px 12px;border-radius:999px;white-space:nowrap}
.hero-kicker{font-family:var(--f-black);font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-bottom:14px}
.hero-perfil{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.hero-nome{font-family:var(--f-black);font-size:clamp(38px,7vw,66px);line-height:.98;letter-spacing:-.01em;text-transform:uppercase;color:var(--ink);overflow-wrap:anywhere}
.hero-handle{font-size:16px;color:var(--muted);margin-top:10px}
.hero-handle .verif{color:var(--accent);font-size:.85em;margin-left:6px}
.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--ink);flex-shrink:0;background:var(--paper-2)}
.avatar-ph{display:flex;align-items:center;justify-content:center;font-family:var(--f-black);font-size:36px;color:var(--muted)}
.hero-bio-frase{margin:18px 0 0;max-width:60ch;color:var(--ink-soft);font-size:15px}

/* ---- stat row ---- */
.stats{display:grid;gap:0;border-top:3px solid var(--ink);border-bottom:1px solid var(--line);margin:28px 0 8px}
.stat{padding:18px 10px 14px;border-right:1px solid var(--line)}
.stat:last-child{border-right:0}
.stat-num{font-family:var(--f-black);font-size:clamp(22px,3.4vw,32px);color:var(--accent);line-height:1;letter-spacing:-.01em}
.stat-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-top:8px;font-weight:600}
@media(max-width:640px){.stats{grid-template-columns:repeat(2,1fr)!important}.stat{border-bottom:1px solid var(--line)}}

/* ---- seções ---- */
.sec{margin-top:64px}
.sec-head{display:flex;align-items:flex-end;gap:18px;border-bottom:3px solid var(--accent);padding-bottom:10px;margin-bottom:26px}
.sec-num{font-family:var(--f-black);font-size:54px;line-height:.9;color:var(--accent);letter-spacing:-.02em}
.sec-titulo{font-family:var(--f-black);font-size:clamp(19px,3vw,25px);text-transform:uppercase;letter-spacing:.02em;color:var(--ink);line-height:1.05}
.sec-sub{margin:6px 0 0;font-size:13px;color:var(--muted)}

/* ---- cards ---- */
.card{background:#fffdf8;border:1px solid var(--line);border-radius:10px;padding:20px 22px;margin-bottom:14px}
.card h5,.an-mini h5,.fat h5,.citacoes h5{font-family:var(--f-sans);font-weight:700;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.card-accent{background:var(--accent-soft);border-color:var(--accent);border-left-width:4px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media(max-width:700px){.grid-2,.grid-3{grid-template-columns:1fr}}

/* ---- veredito ---- */
.veredito{display:flex;gap:28px;align-items:center;flex-wrap:wrap;background:#fffdf8;border:1px solid var(--line);border-radius:10px;padding:28px;margin-bottom:16px}
.veredito-nota{font-family:var(--f-black);font-size:76px;line-height:1;letter-spacing:-.03em}
.veredito-nota small{font-size:24px;color:var(--muted)}
.veredito-frase{flex:1;min-width:260px;font-family:var(--f-serif);font-style:italic;font-size:21px;line-height:1.42;color:var(--ink-soft)}

/* ---- pilares ---- */
.pilar{padding:14px 0;border-bottom:1px solid var(--line)}
.pilar:last-child{border-bottom:0}
.pilar-topo{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.pilar-nome{font-weight:700;font-size:14px}
.pilar-nota{font-family:var(--f-black);font-size:22px;letter-spacing:-.01em}
.pilar-track{height:8px;background:var(--paper-2);border:1px solid var(--line);border-radius:4px;overflow:hidden;margin:8px 0 6px}
.pilar-fill{height:100%}
.pilar-just{font-size:13px;color:var(--muted);margin:0}

/* ---- rubrica (barras 1-5) ---- */
.rub{display:grid;gap:7px;margin:14px 0}
.rub-item{display:grid;grid-template-columns:130px 1fr 44px;gap:10px;align-items:center;font-size:12px}
.rub-label{color:var(--ink-soft);font-weight:600}
.rub-track{height:8px;background:var(--paper-2);border:1px solid var(--line);border-radius:4px;overflow:hidden;display:block}
.rub-fill{height:100%;background:var(--accent);display:block}
.rub-val{font-family:var(--f-black);font-size:12px;color:var(--ink);text-align:right}
.rub-val small{color:var(--muted);font-family:var(--f-sans)}
.rub-escuro .rub-label{color:#d8d2c6}
.rub-escuro .rub-track{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.14)}
.rub-escuro .rub-val{color:#f1ede6}
@media(max-width:560px){.rub-item{grid-template-columns:104px 1fr 40px}}

/* ---- séries ---- */
.serie{font-family:var(--f-black);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#fff;padding:4px 10px;border-radius:4px;white-space:nowrap}
.serie-a{background:var(--good)}
.serie-b{background:var(--warn)}
.serie-c{background:var(--bad)}
.nota-chip{font-family:var(--f-black);font-size:19px;letter-spacing:-.01em}
.nota-chip small{font-size:11px;color:var(--muted);font-family:var(--f-sans)}

/* ---- post cards ---- */
.post-card{background:#fffdf8;border:1px solid var(--line);border-radius:10px;padding:22px;margin-bottom:18px}
.post-top{border-top:4px solid var(--good)}
.post-worst{border-top:4px solid var(--bad)}
.post-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.post-label{font-family:var(--f-black);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink)}
.post-head-dir{display:flex;align-items:center;gap:12px}
.post-body{display:grid;grid-template-columns:230px 1fr;gap:22px}
@media(max-width:760px){.post-body{grid-template-columns:1fr}}
.post-thumb{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:var(--paper-2)}
.post-thumb-ph{display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.pm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.pm{background:var(--paper-2);border-radius:6px;padding:8px 6px;text-align:center}
.pm-v{display:block;font-family:var(--f-black);font-size:14px;color:var(--accent)}
.pm-l{display:block;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-top:3px;font-weight:600}
.post-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;font-size:11px;color:var(--muted)}
.post-link{display:inline-block;margin-top:8px;font-size:12px;font-weight:700;letter-spacing:.04em}
.post-resumo{font-size:14px;line-height:1.62;color:var(--ink-soft)}
.caption-box{background:var(--paper-2);border-left:3px solid var(--muted-2);border-radius:0 8px 8px 0;padding:11px 14px;font-size:12.5px;line-height:1.6;color:var(--ink-soft);white-space:pre-wrap;margin:12px 0}
.fatores{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
@media(max-width:700px){.fatores{grid-template-columns:1fr}}
.fat ul{list-style:none;margin:0;padding:0}
.fat li{position:relative;padding:5px 0 5px 20px;font-size:12.5px;line-height:1.55;border-bottom:1px dashed var(--line)}
.fat li:last-child{border-bottom:0}
.fat-pos li::before{content:'+';position:absolute;left:0;top:4px;color:var(--good);font-weight:800}
.fat-neg li::before{content:'×';position:absolute;left:0;top:4px;color:var(--bad);font-weight:800}
.an-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;margin:14px 0}
@media(max-width:700px){.an-grid{grid-template-columns:1fr}}
.an-mini p{font-size:12.5px;line-height:1.6;color:var(--ink-soft);margin:0}
.citacoes{background:var(--accent-soft);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:14px 18px;margin:14px 0}
.citacoes blockquote{margin:6px 0;font-size:15px;line-height:1.5;color:var(--ink)}
.post-compacto{padding:18px}
.post-compacto .post-body{grid-template-columns:150px 1fr}
.post-compacto .an-mini p,.post-compacto .fat li{font-size:12px}
@media(max-width:640px){.post-compacto .post-body{grid-template-columns:1fr}}

/* ---- divisor de ranking ---- */
.rank-div{display:flex;align-items:center;gap:14px;margin:34px 0 16px}
.rank-div span{font-family:var(--f-black);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);white-space:nowrap}
.rank-div::after{content:'';flex:1;height:2px;background:linear-gradient(90deg,var(--accent),transparent)}

/* ---- listas de destaque ---- */
.lista-seta{list-style:none;margin:0;padding:0}
.lista-seta li{position:relative;padding:7px 0 7px 24px;font-size:13.5px;line-height:1.55;border-bottom:1px solid var(--line)}
.lista-seta li:last-child{border-bottom:0}
.lista-seta li::before{content:'→';position:absolute;left:0;color:var(--accent);font-weight:800}

/* ---- avisos ---- */
.aviso-discreto{font-size:11.5px;color:var(--muted);border:1px dashed var(--muted-2);border-radius:6px;padding:6px 12px;display:inline-block;margin-top:12px}

/* ---- print only / screen only ---- */
.so-print{display:none}

/* ---- rodapé ---- */
.rodape{margin-top:70px;padding:26px 0 10px;border-top:3px solid var(--ink);text-align:center}
.rodape .marca{font-size:22px}
.rodape-meta{font-size:11.5px;color:var(--muted);margin-top:10px;letter-spacing:.04em}

/* ================= PRINT / PDF (A4, Chrome headless) ================= */
@media print{
  @page{size:A4 portrait;margin:14mm 12mm}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-size:10.5pt;background-color:var(--paper)}
  .pagina{max-width:100%;padding:0}
  .so-tela{display:none!important}
  .so-print{display:block!important}
  .hero{padding-top:0}
  .hero-nome{font-size:34pt}
  .sec{margin-top:34px}
  .sec-head{break-after:avoid;page-break-after:avoid}
  .card,.pilar,.veredito,.citacoes,.an-mini,.fat,.pm-grid,.rub,.stat{break-inside:avoid;page-break-inside:avoid}
  .post-card{break-inside:auto}
  .post-compacto{break-inside:avoid;page-break-inside:avoid}
  .post-head{break-after:avoid}
  a{color:inherit}
  .post-link{display:none}
}
`;

// ---------- Shell ----------

export const shell = (opts: { titulo: string; corpo: string; cssExtra?: string }): string => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(opts.titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@1,9..144,400;1,9..144,600&display=swap" rel="stylesheet">
<style>${SHARED_CSS}${opts.cssExtra || ''}</style>
</head>
<body>
<div class="pagina">
${opts.corpo}
</div>
</body>
</html>`;
