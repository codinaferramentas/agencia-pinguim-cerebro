// ============================================================
// render-book.ts — Book Comercial 365 · versão CONSULTOR
// Material INTERNO: análise completa + blocos pretos de munição
// (produto-alvo, playbook da call, raio-x do cliente, cases).
// Identidade visual "elo." — ver render-shared.ts.
// ============================================================

import {
  AnaliseJson,
  DIAG_BIO_LABELS,
  Lead,
  PILAR_LABELS,
  RUBRICA_BIO_LABELS,
  avatarHtml,
  esc,
  fmtData,
  fmtNota,
  fmtNum,
  fmtPct,
  marca,
  notaChip,
  pilarRow,
  renderPostCard,
  rubricaBarras,
  rubricaScore10,
  secHead,
  semaforo,
  shell,
  statRow,
  truncaPalavras,
} from './render-shared.ts';

// ---------- Contratos ----------

export interface RaioX {
  encontrado_em: string[];
  ja_cliente: boolean;
  cliente_desde: string | null;
  hotmart: null | {
    total_transacoes: number;
    gasto_total: number;
    valor_reembolsado: number;
    produtos: { nome: string; compras: { status: string; valor: number; data: string }[] }[];
  };
  teve_reembolso: boolean;
  plataformas: { fonte: string; resumo: string }[];
  resumo_ia: string;
}

export interface Municao {
  produto_alvo: string; // Elo | ProAlt | Lyra | Taurus Master | Taurus LT
  produto_alternativa?: string;
  produto_alvo_racional: string;
  cases: { autor: string; produto: string; resumo: string; relevancia_nicho: string; valor_mencionado: string | null }[];
  insights_comerciais: string[];
  roteiro_call: string[];
  angulos_objecao: { objecao: string; resposta: string }[];
}

export interface Roteiro {
  abertura: string;
  passos: { titulo_secao: string; fala: string; direcao: string; fato_ancora: string }[];
  transicao_oferta: string;
}

export interface BookCtx {
  lead: Lead;
  analise: AnaliseJson;
  raiox: RaioX | null;
  municao: Municao | null;
  roteiro?: Roteiro | null;
  gerado_em: string;
  /** todas as respostas do formulário de qualificação Yay!Forms (ficha do lead) */
  respostas_form?: { pergunta: string; resposta: string }[] | null;
}

// ---------- CSS exclusivo do book (blocos pretos etc.) ----------

const BOOK_CSS = `
/* ---- bloco preto do consultor ---- */
.dark{background:var(--dark);color:#ece7dd;border-radius:12px;padding:24px 26px;margin:18px 0}
.dark-tag{display:inline-block;font-family:var(--f-black);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dark);background:var(--accent);padding:5px 11px;border-radius:4px;margin-bottom:16px}
.dark h4{font-family:var(--f-black);font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:#fff;margin:0 0 10px}
.dark h5{font-weight:700;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#9c968a;margin:0 0 8px}
.dark p{color:#d8d2c6}
.dark .fr{color:#f1ede6}
.dark a{color:var(--accent)}
.dark-sub{padding:18px 0;border-bottom:1px solid rgba(255,255,255,.12)}
.dark-sub:last-child{border-bottom:0;padding-bottom:0}
.dark-sub:first-of-type{padding-top:4px}
.dark .lista-seta li{border-bottom-color:rgba(255,255,255,.1);color:#d8d2c6}

/* ---- seção 00 resumo ---- */
.resumo00-grid{display:grid;grid-template-columns:250px 1fr;gap:30px;align-items:start}
@media(max-width:680px){.resumo00-grid{grid-template-columns:1fr}}
.resumo00-nota{font-family:var(--f-black);font-size:64px;line-height:1;letter-spacing:-.03em}
.resumo00-nota small{font-size:20px;color:#9c968a}
.produto-alvo{margin-top:14px}
.produto-alvo-nome{font-family:var(--f-black);font-size:30px;color:var(--accent);text-transform:uppercase;letter-spacing:.02em;line-height:1}
.produto-alvo-rac{font-size:13px;color:#b9b3a8;margin-top:8px;line-height:1.55}
.linha-cliente{margin-top:16px;font-size:13px;color:#d8d2c6;border-top:1px solid rgba(255,255,255,.12);padding-top:14px}
.linha-cliente strong{color:#fff}

/* ---- ficha do formulário (seção 00) ---- */
.form-qa{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;break-inside:avoid}
@media(max-width:680px){.form-qa{grid-template-columns:1fr}}
.form-qa div{padding:8px 0;border-bottom:1px solid var(--line)}
.form-qa dt{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:0}
.form-qa dd{font-size:13px;color:var(--ink-soft);margin:3px 0 0}

/* ---- call box no hero ---- */
.call-box{display:flex;gap:16px;align-items:center;background:var(--accent-soft);border:1px solid var(--accent);border-left:5px solid var(--accent);border-radius:10px;padding:16px 20px;margin-top:24px;flex-wrap:wrap}
.call-box-label{font-family:var(--f-black);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);white-space:nowrap}
.call-box-valor{font-family:var(--f-black);font-size:clamp(15px,2.6vw,20px);color:var(--ink);line-height:1.2}
.hero-contatos{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px}
@media(max-width:700px){.hero-contatos{grid-template-columns:repeat(2,1fr)}}
.hc-item .hc-label{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:4px}
.hc-item .hc-valor{font-size:13px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}

/* ---- bio "screenshot" ---- */
.bio-shot{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;max-width:430px;box-shadow:0 2px 10px rgba(17,17,17,.06);color:var(--ink)}
.bio-shot .bio-shot-nome{color:var(--ink)}
.bio-shot .bio-shot-texto{color:var(--ink-soft)}
.bio-shot-top{display:flex;gap:12px;align-items:center;margin-bottom:10px}
.bio-shot-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:1.5px solid var(--line);background:var(--paper-2)}
.bio-shot-nome{font-weight:700;font-size:14px;line-height:1.25}
.bio-shot-kw{font-size:12px;color:var(--muted)}
.bio-shot-texto{font-size:13px;line-height:1.5;white-space:pre-wrap}
.bio-shot-cta{margin-top:10px;font-size:12.5px;font-weight:700;color:var(--accent)}
.bio-score-novo{font-family:var(--f-black);font-size:34px;line-height:1;margin-top:14px}
.bio-score-novo small{font-size:14px;color:#9c968a}
.bio-vars{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
@media(max-width:700px){.bio-vars{grid-template-columns:1fr}}
.bio-var{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:14px}
.bio-var-label{font-family:var(--f-black);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
.bio-var-texto{font-size:12.5px;line-height:1.55;white-space:pre-wrap;color:#ece7dd}

/* ---- transcript (só no book) ---- */
.transcript{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:8px;margin-top:12px}
.transcript summary{padding:10px 14px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);user-select:none}
.transcript[open] summary{border-bottom:1px solid rgba(255,255,255,.1)}
.transcript p{padding:12px 16px;font-size:12.5px;line-height:1.65;white-space:pre-wrap;margin:0;color:#c9c3b7}
.transcript-print{font-size:11.5px;font-style:italic;color:#b9b3a8;margin-top:10px}

/* ---- índice / mapa de uso ---- */
.mapa{display:flex;flex-direction:column;gap:14px;margin:16px 0}
.mapa-grupo{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;break-inside:avoid}
.mapa-grupo-etq{padding:11px 18px;font-family:var(--f-black);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.mapa-q-antes{background:var(--paper-2);color:var(--ink-soft)}
.mapa-q-vivo{background:#141210;color:var(--accent)}
.mapa-q-consulta{background:var(--accent-soft);color:var(--accent)}
.mapa-item{display:flex;flex-direction:column;gap:2px;padding:12px 18px;border-top:1px solid var(--line)}
.mapa-item strong{font-size:14px;color:var(--ink)}
.mapa-item span{font-size:12.5px;color:var(--muted);line-height:1.45}
/* selo de momento no cabeçalho de cada seção */
.momento{display:inline-flex;align-items:center;gap:6px;font-family:var(--f-black);font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:4px 11px;border-radius:5px;margin-bottom:12px}
.momento-antes{background:var(--paper-2);color:var(--ink-soft)}
.momento-vivo{background:#141210;color:var(--accent)}
.momento-consulta{background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent)}

/* ---- ANÁLISE DO PERFIL (fala + dado colados) ---- */
.an-passo{margin:22px 0 0;break-inside:avoid}
.an-passo-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.an-passo-num{font-family:var(--f-black);font-size:22px;color:var(--accent);line-height:1}
.an-passo-titulo{font-family:var(--f-black);font-size:15px;text-transform:uppercase;letter-spacing:.03em;color:var(--ink)}
.an-cena{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;align-items:stretch;break-inside:avoid}
@media(max-width:760px){.an-cena{grid-template-columns:1fr}}
/* lado esquerdo: a FALA (teleprompter) */
.an-fala{background:#141210;color:#ece7dd;border-radius:12px;padding:20px 22px}
.an-fala-etq{font-family:var(--f-black);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:9px}
.an-fala-txt{font-family:var(--f-serif);font-size:16.5px;line-height:1.6;color:#f4f1ea;margin:0}
.an-direcao{margin-top:14px;background:rgba(244,83,31,.14);border-radius:6px;padding:8px 12px;font-size:12px;color:#f0d9cd;line-height:1.45}
.an-dir-etq{font-family:var(--f-black);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-right:7px}
/* lado direito: o DADO real */
.an-dado{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.an-dado-tit{font-family:var(--f-black);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-bottom:12px}
.an-dado-tit strong{color:inherit}
.an-post{display:flex;gap:14px;align-items:center}
.an-post-thumb{width:88px;height:88px;object-fit:cover;border-radius:9px;border:1px solid var(--line);flex-shrink:0}
.an-post-noimg{display:flex;align-items:center;justify-content:center;background:var(--paper-2);font-size:10px;color:var(--muted);text-align:center}
.an-post-tipo{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:6px}
.an-post-nums{display:flex;flex-direction:column;gap:3px;font-size:13px;color:var(--ink-soft)}
.an-post-nums strong{color:var(--ink);font-family:var(--f-black);font-size:15px}
.an-legenda{margin-top:14px;font-family:var(--f-serif);font-style:italic;font-size:13px;line-height:1.5;color:var(--ink-soft)}
.an-legenda-etq{display:block;font-family:var(--f-sans);font-style:normal;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:5px}
.an-obs{margin-top:14px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;line-height:1.5;color:var(--ink-soft)}
.an-obs-etq{display:inline-block;font-family:var(--f-black);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:3px;margin-right:6px;color:#fff}
.an-obs-pos{background:var(--good)}
.an-obs-neg{background:var(--warn)}
.an-bio-atual{background:var(--paper-2);border-radius:8px;padding:12px 14px;font-size:13.5px;line-height:1.5;color:var(--ink);white-space:pre-wrap}
.an-bio-nova{margin-top:12px;background:var(--accent-soft);border:1px solid var(--accent);border-radius:8px;padding:12px 14px;font-family:var(--f-serif);font-style:italic;font-size:13.5px;line-height:1.5;color:var(--ink)}
/* visão geral (tabelinha) */
.vg{display:flex;flex-direction:column;gap:9px}
.vg-linha{display:grid;grid-template-columns:1fr 70px 34px;gap:10px;align-items:center}
.vg-nome{font-size:12.5px;color:var(--ink-soft)}
.vg-barra{height:7px;background:var(--paper-2);border-radius:4px;overflow:hidden}
.vg-fill{display:block;height:100%;border-radius:4px}
.vg-nota{font-family:var(--f-black);font-size:14px;text-align:right}
/* ponte pra oferta */
.an-ponte{background:var(--dark);border:2px solid var(--accent);border-radius:14px;padding:24px 26px;margin:26px 0 0;break-inside:avoid}
.an-ponte-etq{font-family:var(--f-black);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
.an-ponte-txt{font-family:var(--f-serif);font-size:18px;line-height:1.6;color:#f4f1ea;font-style:italic;margin:0}
.an-ponte-nota{margin-top:14px;font-size:11.5px;color:#9c968a;border-top:1px solid rgba(255,255,255,.14);padding-top:12px}

/* ---- script teleprompter (análise ao vivo) ---- */
.tp-intro{background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px;padding:20px 24px;margin:16px 0}
.tp-intro .tp-etq{font-family:var(--f-black);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
.tp-fala{font-family:var(--f-serif);font-size:19px;line-height:1.5;color:var(--ink);font-style:italic}
.tp-passo{background:#fff;border:1px solid var(--line);border-radius:12px;padding:0;margin:16px 0;overflow:hidden;box-shadow:0 2px 10px rgba(17,17,17,.05);break-inside:avoid}
.tp-passo-head{display:flex;align-items:center;gap:14px;background:var(--paper-2);padding:14px 22px;border-bottom:1px solid var(--line)}
.tp-passo-num{font-family:var(--f-black);font-size:26px;color:var(--accent);line-height:1}
.tp-passo-titulo{font-family:var(--f-black);font-size:15px;text-transform:uppercase;letter-spacing:.03em;color:var(--ink)}
.tp-passo-body{padding:20px 24px}
.tp-passo-body .tp-leia{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:10px}
.tp-passo-body .tp-fala{font-family:var(--f-serif);font-size:18px;line-height:1.6;color:var(--ink);font-style:normal}
.tp-direcao{display:flex;gap:9px;align-items:flex-start;margin-top:16px;background:#141210;color:#ece7dd;border-radius:7px;padding:11px 15px;font-size:12.5px;line-height:1.5}
.tp-direcao .tp-dir-etq{font-family:var(--f-black);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);white-space:nowrap;padding-top:2px}
.tp-fato{margin-top:12px;font-size:11px;color:var(--muted);border-top:1px dashed var(--line);padding-top:10px}
.tp-fato strong{color:var(--ink-soft);font-weight:700}
.tp-oferta{background:var(--dark);color:#ece7dd;border-radius:12px;padding:20px 24px;margin:16px 0}
.tp-oferta .tp-etq{font-family:var(--f-black);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
.tp-oferta .tp-fala{font-family:var(--f-serif);font-size:18px;line-height:1.55;color:#f1ede6;font-style:italic}

/* ---- playbook ---- */
.opp{display:grid;grid-template-columns:52px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid rgba(255,255,255,.12)}
.opp:last-child{border-bottom:0}
.opp-num{font-family:var(--f-black);font-size:34px;color:var(--accent);line-height:1}
.opp h4{font-size:14.5px;text-transform:none;letter-spacing:0;font-family:var(--f-sans);font-weight:700}
.opp p{font-size:13px;line-height:1.6;margin:4px 0 8px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 8px}
.chip{font-family:var(--f-black);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;border-radius:3px;color:#fff}
.chip-good{background:var(--good)}
.chip-warn{background:var(--warn)}
.chip-bad{background:var(--bad)}
.chip-neutro{background:rgba(255,255,255,.16)}
.opp-passo{background:rgba(244,83,31,.12);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;padding:9px 13px;font-size:12.5px;line-height:1.55;color:#ece7dd}
.opp-passo strong{color:var(--accent)}
.risco{border-left:3px solid var(--bad);padding:10px 0 10px 16px;margin-bottom:12px}
.risco h4{font-size:14px;font-family:var(--f-sans);font-weight:700;text-transform:none;letter-spacing:0}
.risco p{font-size:12.5px;margin:4px 0}
.risco-imp{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--bad);font-weight:700}
.passo-call{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.12)}
.passo-call:last-child{border-bottom:0}
.passo-call-num{font-family:var(--f-black);font-size:24px;color:var(--accent);line-height:1.2}
.passo-call-txt{font-size:13.5px;line-height:1.6;color:#ece7dd}
.obje{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:14px 16px;margin-bottom:10px}
.obje-q{font-family:var(--f-serif);font-style:italic;font-size:14.5px;color:#f1ede6;margin-bottom:8px}
.obje-q::before{content:'“ ';color:var(--accent)}
.obje-a{font-size:12.5px;line-height:1.6;color:#c9c3b7}
.obje-a strong{color:var(--accent);font-size:10px;letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:3px}

/* ---- raio-x ---- */
.rx-status{display:inline-block;font-family:var(--f-black);font-size:15px;letter-spacing:.1em;text-transform:uppercase;color:#fff;padding:9px 18px;border-radius:6px}
.rx-status-cliente{background:var(--good)}
.rx-status-novo{background:var(--accent)}
.rx-fontes{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.rx-fonte{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);background:var(--paper-2);border:1px solid var(--line);border-radius:999px;padding:4px 12px}
.rx-produto{display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:10px 0;border-bottom:1px dashed var(--line);flex-wrap:wrap}
.rx-produto:last-child{border-bottom:0}
.rx-produto-nome{font-weight:700;font-size:13.5px}
.rx-compras{font-size:11.5px;color:var(--muted)}
.rx-plat{padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}
.rx-plat:last-child{border-bottom:0}
.rx-plat strong{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.rx-resumo{font-family:var(--f-serif);font-style:italic;font-size:16.5px;line-height:1.55;color:var(--ink-soft)}

/* ---- munição do nicho ---- */
.case{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:16px 18px;margin-bottom:12px}
.case-top{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}
.case-autor{font-family:var(--f-black);font-size:14px;color:#fff}
.case-produto{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.case p{font-size:12.5px;line-height:1.6;margin:0 0 8px}
.case-rel{font-size:11.5px;color:#9c968a}
.case-rel strong{color:#d8d2c6;font-size:10px;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:2px}
.case-valor{display:inline-block;font-family:var(--f-black);font-size:12px;color:var(--dark);background:var(--accent);border-radius:4px;padding:3px 9px;margin-top:8px}

@media print{
  .dark,.case,.obje,.opp,.passo-call,.risco,.bio-shot,.call-box{break-inside:avoid;page-break-inside:avoid}
  .dark-grande{break-inside:auto}
  .transcript{display:none}
}
`;

// ---------- Componentes internos ----------

// Bloco preto = "material que você USA na venda". Cada uso tem RÓTULO PRÓPRIO
// (não mais "Munição do consultor" repetido — o painel apontou que confunde).
const blocoConsultor = (inner: string, opts?: { grande?: boolean; semTag?: boolean; tag?: string }): string => `
<div class="dark${opts?.grande ? ' dark-grande' : ''}">
  ${opts?.semTag ? '' : `<span class="dark-tag">${opts?.tag ?? '⚡ Use na venda'}</span>`}
  ${inner}
</div>`;

const nivelLabel = (s: string): string => (s === 'medio' ? 'médio' : s);

const chipImpacto = (v: unknown): string => {
  const s = String(v ?? '').toLowerCase();
  const cls = s === 'alto' ? 'chip-good' : s === 'medio' || s === 'médio' ? 'chip-warn' : 'chip-neutro';
  return s ? `<span class="chip ${cls}">impacto ${esc(nivelLabel(s))}</span>` : '';
};

const chipEsforco = (v: unknown): string => {
  const s = String(v ?? '').toLowerCase();
  const cls = s === 'baixo' ? 'chip-good' : s === 'medio' || s === 'médio' ? 'chip-warn' : 'chip-bad';
  return s ? `<span class="chip ${cls}">esforço ${esc(nivelLabel(s))}</span>` : '';
};

/** Extra interno por post: recomendações acionáveis + transcrição. */
const extraPostConsultor = (post: Record<string, unknown>): string => {
  const a = (post?.analysis ?? null) as Record<string, unknown> | null;
  const recomendacoes = Array.isArray(a?.recomendacoes) ? (a?.recomendacoes as unknown[]) : [];
  const transcript = post?.transcript ? String(post.transcript) : '';
  if (!recomendacoes.length && !transcript && !post?.transcript_skipped_reason) return '';

  const recHtml = recomendacoes.length ? `
    <h5 style="margin-top:4px">Recomendações acionáveis</h5>
    <ol style="margin:0;padding-left:20px;font-size:12.5px;line-height:1.6;color:#ece7dd">
      ${recomendacoes.map((r) => `<li style="margin-bottom:6px">${esc(r)}</li>`).join('')}
    </ol>` : '';

  const transHtml = transcript ? `
    <details class="transcript so-tela">
      <summary>Transcrição literal do áudio — abre no HTML</summary>
      <p>${esc(transcript)}</p>
    </details>
    <p class="transcript-print so-print">Transcrição (início): “${esc(truncaPalavras(transcript, 40))}” — íntegra disponível na versão HTML.</p>`
    : (post?.transcript_skipped_reason
      ? `<p style="font-size:11.5px;color:#9c968a;margin-top:10px">Sem transcrição de áudio (${esc(post.transcript_skipped_reason)}).</p>`
      : '');

  return blocoConsultor(recHtml + transHtml, { tag: '📎 Pra aprofundar' });
};

// ---------- Seções ----------

const heroBook = (ctx: BookCtx): string => {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;
  const m = (ctx.analise?.metrics ?? {}) as Record<string, unknown>;
  const ov = (ctx.analise?.overview ?? {}) as Record<string, unknown>;
  const lead = ctx.lead;

  return `
<section class="hero">
  <div class="hero-top">
    ${marca()}
    <span class="hero-badge">Comercial 365</span>
  </div>
  <div class="hero-kicker">Book Comercial</div>
  <div class="hero-perfil">
    ${avatarHtml(p.avatar_url, lead.nome || p.full_name)}
    <div>
      <h1 class="hero-nome">${esc(lead.nome || p.full_name || p.handle || 'Lead')}</h1>
      <div class="hero-handle">@${esc(p.handle || lead.instagram || '—')}${p.is_verified ? '<span class="verif">✔</span>' : ''}</div>
    </div>
  </div>

  <div class="call-box">
    <span class="call-box-label">Call agendada</span>
    <span class="call-box-valor">${esc(lead.data_call || 'a agendar')}</span>
  </div>

  <div class="hero-contatos">
    <div class="hc-item"><div class="hc-label">E-mail</div><div class="hc-valor">${esc(lead.email || '—')}</div></div>
    <div class="hc-item"><div class="hc-label">WhatsApp</div><div class="hc-valor">${esc(lead.telefone || '—')}</div></div>
    <div class="hc-item"><div class="hc-label">Nicho declarado</div><div class="hc-valor">${esc(lead.nicho || '—')}</div></div>
    <div class="hc-item"><div class="hc-label">Faturamento declarado</div><div class="hc-valor">${esc(lead.faturamento || '—')}</div></div>
  </div>
  ${lead.form_recebido === false ? '<div class="aviso-discreto">⚠ formulário não recebido — dados declarados podem estar incompletos</div>' : ''}

  ${statRow([
    { num: fmtNum(p.followers), label: 'seguidores' },
    { num: fmtNum(p.posts_count), label: 'posts' },
    { num: fmtPct(m.avg_engagement_pro), label: 'engajamento médio' },
    { num: fmtNota(ov.nota_geral), label: 'nota geral' },
  ])}
</section>`;
};

// SEÇÃO 00 — MAPA DE USO: a 1ª coisa que o vendedor vê. Diz o que é o
// documento e quando abrir cada parte. Elimina o "por onde começo?".
interface NumMap { nBriefing: string; nRaiox: string | null; nOferta: string; nArgs: string; nAnalise: string; nProvas: string }

// ÍNDICE — agrupa por MOMENTO (antes / durante / consulta), cada item com
// o número da seção. É a 1ª coisa que o vendedor vê.
const secaoMapaUso = (ctx: BookCtx, nm: NumMap): string => {
  const grupos = [
    {
      etq: '📋 Antes da call', cls: 'mapa-q-antes',
      itens: [
        { s: `${nm.nBriefing} · Briefing do lead`, o: 'Quem é, nota do perfil, o que ele já comprou' },
        ...(nm.nRaiox ? [{ s: `${nm.nRaiox} · Raio-X do relacionamento`, o: 'Histórico de compras e presença nas plataformas' }] : []),
        { s: `${nm.nOferta} · Decisão de oferta`, o: 'Qual produto apresentar e por quê' },
        { s: `${nm.nArgs} · Argumentos & objeções`, o: 'Como responder as objeções mais prováveis' },
      ],
    },
    {
      etq: '⚡ Durante a call', cls: 'mapa-q-vivo',
      itens: [
        { s: `${nm.nAnalise} · Análise do perfil ao vivo`, o: 'O presente pro lead — leia em voz alta, na ordem: visão geral → bio → melhor conteúdo → onde melhorar → ponte pra oferta' },
      ],
    },
    {
      etq: '📎 Consulta', cls: 'mapa-q-consulta',
      itens: [
        { s: `${nm.nProvas} · Provas do nicho`, o: 'Cases de outros alunos pra citar, se precisar de prova social' },
      ],
    },
  ];

  return `
<section class="sec">
  ${secHead('', 'Índice — como usar este book', 'Cada seção tem um momento certo. Siga a ordem e conduza a call sem travar.')}
  <div class="mapa">
    ${grupos.map((g) => `
    <div class="mapa-grupo">
      <div class="mapa-grupo-etq ${g.cls}">${g.etq}</div>
      ${g.itens.map((l) => `<div class="mapa-item"><strong>${esc(l.s)}</strong><span>${esc(l.o)}</span></div>`).join('')}
    </div>`).join('')}
  </div>
</section>`;
};

// SEÇÃO 01 — BRIEFING: quem é o lead, enxuto. A nota, o essencial e a
// ficha do formulário (que antes entupia o resumo, agora fica ao fim aqui).
const secaoBriefing = (ctx: BookCtx, num: string): string => {
  const ov = (ctx.analise?.overview ?? {}) as Record<string, unknown>;
  const nota = ov.nota_geral;

  const bullets: string[] = [];
  if (ctx.municao?.insights_comerciais?.length) bullets.push(...ctx.municao.insights_comerciais.slice(0, 3).map((i) => String(i)));
  if (bullets.length < 2 && ov.veredito_curto) bullets.push(String(ov.veredito_curto));

  let linhaCliente = '';
  if (ctx.raiox) {
    if (ctx.raiox.ja_cliente) {
      const produtos = (ctx.raiox.hotmart?.produtos ?? []).map((pr) => pr.nome).filter(Boolean);
      linhaCliente = `<div class="linha-cliente"><strong>Já é aluno</strong>${ctx.raiox.cliente_desde ? ` desde ${fmtData(ctx.raiox.cliente_desde)}` : ''}${produtos.length ? ` — ${produtos.length} compra${produtos.length === 1 ? '' : 's'} conosco` : ''}. Detalhes no Raio-X (§03).</div>`;
    } else {
      linhaCliente = `<div class="linha-cliente"><strong>Lead novo</strong> — sem histórico de compras conosco.</div>`;
    }
  }

  return `
<section class="sec">
  ${secHead(num, 'Briefing do lead', 'O essencial sobre quem você vai atender', 'antes')}
  ${blocoConsultor(`
    <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:18px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:16px">
      <div class="resumo00-nota" style="color:${semaforo(nota)};font-size:44px">${fmtNota(nota)}<small style="font-size:16px">/10</small></div>
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9c968a;padding-bottom:6px">Nota do perfil<br>no Instagram</div>
    </div>
    <h5>O que mais importa nessa call</h5>
    <ul class="lista-seta">
      ${bullets.length ? bullets.map((b) => `<li>${esc(b)}</li>`).join('') : `<li>Veja a estratégia da call na seção 04.</li>`}
    </ul>
    ${linhaCliente}
  `, { tag: '📋 Briefing' })}
  ${(ctx.respostas_form?.length)
    ? `<details class="card so-tela" style="margin-top:16px">
    <summary style="cursor:pointer;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">O que o lead respondeu no formulário (${ctx.respostas_form.length} campos) — clique pra abrir</summary>
    <dl class="form-qa" style="margin-top:12px">
      ${ctx.respostas_form.map((r) => `<div><dt>${esc(r.pergunta)}</dt><dd>${esc(r.resposta)}</dd></div>`).join('')}
    </dl>
  </details>
  <div class="card so-print" style="margin-top:16px">
    <h5>Ficha do formulário (respostas do lead)</h5>
    <dl class="form-qa">
      ${ctx.respostas_form.map((r) => `<div><dt>${esc(r.pergunta)}</dt><dd>${esc(r.resposta)}</dd></div>`).join('')}
    </dl>
  </div>`
    : ''}
</section>`;
};

// SEÇÃO 02 — DECISÃO DE OFERTA: promovida a seção própria (era enterrada
// no resumo). É a decisão de venda — merece destaque.
const secaoDecisaoOferta = (ctx: BookCtx, num: string): string => {
  const m = ctx.municao;
  const corpo = m ? `
    <div class="produto-alvo" style="margin-top:0">
      <h5>Produto pra apresentar</h5>
      <div class="produto-alvo-nome">${esc(m.produto_alvo)}</div>
      ${m.produto_alternativa ? `<div style="font-size:13px;color:#b9b3a8;margin-top:8px">Se não fizer sentido, plano B: <strong style="color:#ece7dd">${esc(m.produto_alternativa)}</strong></div>` : ''}
      ${m.produto_alvo_racional ? `<p class="produto-alvo-rac" style="font-size:13.5px;margin-top:12px">${esc(m.produto_alvo_racional)}</p>` : ''}
    </div>` : '<p style="color:#9c968a">Recomendação de produto ainda não gerada para este lead.</p>';

  return `
<section class="sec">
  ${secHead(num, 'Decisão de oferta', 'O produto certo pra este lead, com o porquê', 'antes')}
  ${blocoConsultor(corpo, { tag: '🎯 O que oferecer', grande: true })}
</section>`;
};

// ============================================================
// SEÇÃO "ANÁLISE DO PERFIL AO VIVO" — o coração do book.
// ============================================================
// Estrutura validada por vendedor sênior (André 20/07): a análise é um
// PRESENTE, com começo-meio-fim EVOLUTIVO, seguindo o Instagram.
// Cada bloco cola FALA (o que o vendedor lê) + DADO REAL (bio literal,
// foto do post, números) — nunca separados. Sequência:
//   Abertura → Visão geral (tabelinha) → Bio → Melhor conteúdo →
//   Menor engajamento → Ponte pra oferta.
// O veredito geral vem ANTES dos detalhes; a ponte só no fim.

// mini-tabela dos 5 pilares (a "tabelinha" — visão geral)
const visaoGeralHtml = (ctx: BookCtx): string => {
  const ov = (ctx.analise?.overview ?? {}) as Record<string, unknown>;
  const pilares = (ov.pilares ?? {}) as Record<string, { nota?: unknown; justificativa?: unknown }>;
  const nota = ov.nota_geral;
  const linhas = Object.entries(pilares).map(([k, v]) => `
    <div class="vg-linha">
      <span class="vg-nome">${esc(PILAR_LABELS[k] || k.replace(/_/g, ' '))}</span>
      <span class="vg-barra"><span class="vg-fill" style="width:${(Number(v?.nota) || 0) * 10}%;background:${semaforo((Number(v?.nota) || 0))}"></span></span>
      <span class="vg-nota" style="color:${semaforo(Number(v?.nota))}">${fmtNota(v?.nota)}</span>
    </div>`).join('');
  return `
    <div class="an-cena">
      <div class="an-fala">
        <div class="an-fala-etq">Leia em voz alta · abertura</div>
        <p class="an-fala-txt">${esc((ctx.roteiro?.abertura) || 'Antes de tudo, eu entrei no seu perfil e preparei uma análise sua, de presente. Vou te mostrar o que enxergo de fora — começo, meio e fim. Depois a gente conversa. Pode ser?')}</p>
        <div class="an-fala-etq" style="margin-top:16px">Agora dê a visão geral</div>
        <p class="an-fala-txt">Deixa eu começar te dando uma visão geral do seu perfil, e depois a gente mergulha em cada ponto.</p>
      </div>
      <div class="an-dado">
        <div class="an-dado-tit">Visão geral do perfil${nota != null ? ` — nota <strong style="color:${semaforo(nota)}">${fmtNota(nota)}/10</strong>` : ''}</div>
        <div class="vg">${linhas || '<p class="vazio">Pilares não avaliados.</p>'}</div>
      </div>
    </div>`;
};

// um passo da análise: fala do script + o dado real (post ou bio) ao lado
const cenaPasso = (ctx: BookCtx, passo: { titulo_secao: string; fala: string; direcao: string; fato_ancora: string } | null, dado: string, i: number, titulo: string): string => {
  const fala = passo?.fala || '';
  return `
  <div class="an-passo">
    <div class="an-passo-head"><span class="an-passo-num">${String(i).padStart(2, '0')}</span><span class="an-passo-titulo">${esc(titulo)}</span></div>
    <div class="an-cena">
      <div class="an-fala">
        <div class="an-fala-etq">Leia em voz alta</div>
        <p class="an-fala-txt">${fala ? esc(fala) : 'Fala não gerada para este passo.'}</p>
        ${passo?.direcao ? `<div class="an-direcao"><span class="an-dir-etq">Direção</span>${esc(passo.direcao)}</div>` : ''}
      </div>
      <div class="an-dado">${dado}</div>
    </div>
  </div>`;
};

// painel de dado de um post (foto + números + o que funcionou/evoluir)
const dadoPost = (post: Record<string, unknown> | null, rotulo: string): string => {
  if (!post) return '<p class="vazio">Post não disponível.</p>';
  const a = (post.analysis ?? {}) as Record<string, unknown>;
  const isVideo = post.post_type === 'Reel' || post.post_type === 'Video';
  const pos = Array.isArray(a.fatores_positivos) ? (a.fatores_positivos as unknown[]) : [];
  const neg = Array.isArray(a.fatores_negativos) ? (a.fatores_negativos as unknown[]) : [];
  return `
    <div class="an-dado-tit">${esc(rotulo)}</div>
    <div class="an-post">
      ${post.thumb_url ? `<img class="an-post-thumb" src="${esc(post.thumb_url)}" alt="post">` : '<div class="an-post-thumb an-post-noimg">sem imagem</div>'}
      <div class="an-post-info">
        <div class="an-post-tipo">${esc(post.post_type || 'post')}</div>
        <div class="an-post-nums">
          <span><strong>${fmtNum(post.likes)}</strong> curtidas</span>
          <span><strong>${fmtNum(post.comments)}</strong> coment.</span>
          ${isVideo && post.views != null ? `<span><strong>${fmtNum(post.views)}</strong> views</span>` : ''}
        </div>
      </div>
    </div>
    ${post.full_caption ? `<div class="an-legenda"><span class="an-legenda-etq">Legenda do post</span>“${esc(truncaPalavras(String(post.full_caption), 40))}”</div>` : ''}
    ${(pos.length || neg.length) ? `<div class="an-obs">
      ${pos.length ? `<div><span class="an-obs-etq an-obs-pos">Acertou</span> ${esc(String(pos[0]))}</div>` : ''}
      ${neg.length ? `<div><span class="an-obs-etq an-obs-neg">Dá pra melhorar</span> ${esc(String(neg[0]))}</div>` : ''}
    </div>` : ''}`;
};

// painel de dado da bio (bio literal + o gap)
const dadoBio = (ctx: BookCtx): string => {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;
  const bio = (ctx.analise?.bio_analysis ?? {}) as Record<string, unknown>;
  return `
    <div class="an-dado-tit">A bio dele hoje</div>
    <div class="an-bio-atual">${esc(p.bio_text || '(bio vazia)')}</div>
    ${bio.pontos_de_melhoria ? `<div class="an-obs"><div><span class="an-obs-etq an-obs-neg">O gap</span> ${esc(String(bio.pontos_de_melhoria))}</div></div>` : ''}
    ${bio.bio_sugerida ? `<div class="an-bio-nova"><span class="an-legenda-etq">💡 Sugestão pronta pra propor</span>“${esc(String(bio.bio_sugerida))}”</div>` : ''}`;
};

const secaoAnalisePerfil = (ctx: BookCtx, num: string): string => {
  const r = ctx.roteiro;
  const top = (ctx.analise?.top_post ?? null) as Record<string, unknown> | null;
  const worst = (ctx.analise?.worst_post ?? null) as Record<string, unknown> | null;
  // casa cada passo do script pelo título (bio / melhor / travou / veredito)
  const acha = (re: RegExp) => (r?.passos || []).find((p) => re.test(p.titulo_secao || '')) || null;
  const pBio = acha(/bio/i);
  const pMelhor = acha(/melhor|acert|maior/i);
  const pPior = acha(/trav|menor|pior|fraco/i);

  return `
<section class="sec">
  ${secHead(num, 'Análise do perfil ao vivo', 'O presente pro lead — leia em voz alta, na ordem. Cada fala já vem com o dado ao lado.', 'vivo')}
  ${visaoGeralHtml(ctx)}
  ${cenaPasso(ctx, pBio, dadoBio(ctx), 1, 'Comece pela bio')}
  ${cenaPasso(ctx, pMelhor, dadoPost(top, '★ Post de maior engajamento'), 2, 'O que ele acertou')}
  ${cenaPasso(ctx, pPior, dadoPost(worst, 'Post de menor engajamento'), 3, 'Onde dá pra melhorar')}
  ${r?.transicao_oferta ? `<div class="an-ponte">
    <div class="an-ponte-etq">⚡ Só agora: a ponte pra oferta</div>
    <p class="an-ponte-txt">${esc(r.transicao_oferta)}</p>
    <div class="an-ponte-nota">Entregue a análise TODA antes de ler isto. O presente cria a reciprocidade; a ponte colhe.</div>
  </div>` : ''}
</section>`;
};

// SEÇÃO Argumentos & objeções — SÓ o que é de VENDA (não de conteúdo).
// As sugestões de conteúdo (oportunidades/riscos/próximos passos do perfil)
// saíram daqui — elas vivem DENTRO da análise, como prova de autoridade,
// nunca como argumento comercial (André 20/07: ninguém compra mentoria de
// R$ 37k porque você ensinou a fazer um reel).
const secaoArgumentos = (ctx: BookCtx, num: string): string => {
  const mun = ctx.municao;

  const blocoRoteiro = mun?.roteiro_call?.length ? `
    <div class="dark-sub">
      <h4>Roteiro comercial da call — passo a passo</h4>
      ${mun.roteiro_call.map((p, i) => `
      <div class="passo-call">
        <div class="passo-call-num">${i + 1}</div>
        <div class="passo-call-txt">${esc(p)}</div>
      </div>`).join('')}
    </div>` : '';

  const blocoObjecoes = mun?.angulos_objecao?.length ? `
    <div class="dark-sub">
      <h4>Objeções mais prováveis — e como responder</h4>
      ${mun.angulos_objecao.map((o) => `
      <div class="obje">
        <div class="obje-q">“${esc(o.objecao)}”</div>
        <div class="obje-a"><strong>Como responder</strong>${esc(o.resposta)}</div>
      </div>`).join('')}
    </div>` : '';

  const conteudo = blocoRoteiro + blocoObjecoes;

  return `
<section class="sec">
  ${secHead(num, 'Argumentos & objeções', 'O plano comercial da conversa e as respostas prontas pras objeções', 'antes')}
  ${blocoConsultor(conteudo.trim() || '<p class="vazio" style="color:#9c968a">Argumentos ainda não gerados para este lead.</p>', { grande: true, tag: '🧭 Plano comercial' })}
</section>`;
};

const secaoRaioX = (ctx: BookCtx, num: string): string => {
  const rx = ctx.raiox;
  if (!rx) {
    return `
<section class="sec">
  ${secHead(num, 'Raio-X do relacionamento', 'O que o lead já comprou e onde está no nosso ecossistema', 'antes')}
  <div class="card"><p class="vazio">Não foi possível consultar o histórico deste lead nas nossas bases.</p></div>
</section>`;
  }

  const hotmartHtml = rx.hotmart?.produtos?.length ? `
    <div class="card">
      <h5>Histórico Hotmart</h5>
      ${rx.hotmart.produtos.map((p) => `
      <div class="rx-produto">
        <div>
          <div class="rx-produto-nome">${esc(p.nome)}</div>
          <div class="rx-compras">
            ${(p.compras ?? []).map((c) => `${esc(c.status)} em ${fmtData(c.data)}${c.valor != null ? ` · R$ ${fmtNum(c.valor)}` : ''}`).join(' · ')}
          </div>
        </div>
        <div class="rx-compras">${(p.compras ?? []).length} compra${(p.compras ?? []).length === 1 ? '' : 's'}</div>
      </div>`).join('')}
      ${rx.teve_reembolso ? '<div class="aviso-discreto" style="margin-top:14px">⚠ houve reembolso no histórico — tratar com cuidado na call</div>' : ''}
    </div>` : (rx.teve_reembolso ? '<div class="aviso-discreto">⚠ houve reembolso no histórico</div>' : '');

  return `
<section class="sec">
  ${secHead(num, 'Raio-X do relacionamento', 'O que o lead já comprou e onde está no nosso ecossistema', 'antes')}
  <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
    <span class="rx-status ${rx.ja_cliente ? 'rx-status-cliente' : 'rx-status-novo'}">${rx.ja_cliente ? 'Já é aluno' : 'Lead novo'}</span>
    ${rx.ja_cliente && rx.cliente_desde ? `<span style="font-size:13px;color:var(--muted)">cliente desde <strong style="color:var(--ink)">${fmtData(rx.cliente_desde)}</strong></span>` : ''}
  </div>
  ${rx.encontrado_em?.length ? `<div class="rx-fontes">${rx.encontrado_em.map((f) => `<span class="rx-fonte">${esc(f)}</span>`).join('')}</div>` : ''}
  ${hotmartHtml}
  ${rx.plataformas?.length ? `
  <div class="card">
    <h5>Presença por plataforma</h5>
    ${rx.plataformas.map((p) => `<div class="rx-plat"><strong>${esc(p.fonte)}</strong>${esc(p.resumo)}</div>`).join('')}
  </div>` : ''}
  ${rx.resumo_ia ? `
  <div class="card card-accent">
    <h5>Síntese do relacionamento</h5>
    <p class="rx-resumo">${esc(rx.resumo_ia)}</p>
  </div>` : ''}
</section>`;
};

const secaoMunicaoNicho = (ctx: BookCtx, num: string): string => {
  const mun = ctx.municao;
  if (!mun || (!mun.cases?.length && !mun.insights_comerciais?.length)) {
    return `
<section class="sec">
  ${secHead(num, 'Provas do nicho', 'Cases de outros alunos pra citar quando precisar de prova social', 'consulta')}
  <div class="card"><p class="vazio">Munição comercial ainda não gerada para este lead.</p></div>
</section>`;
  }

  const casesHtml = mun.cases?.length ? `
    <div class="dark-sub">
      <h4>Cases de sucesso pra citar na call</h4>
      ${mun.cases.map((c) => `
      <div class="case">
        <div class="case-top">
          <span class="case-autor">${esc(c.autor)}</span>
          <span class="case-produto">${esc(c.produto)}</span>
        </div>
        <p>${esc(c.resumo)}</p>
        ${c.relevancia_nicho ? `<div class="case-rel"><strong>Por que cola nesse nicho</strong>${esc(c.relevancia_nicho)}</div>` : ''}
        ${c.valor_mencionado ? `<span class="case-valor">${esc(c.valor_mencionado)}</span>` : ''}
      </div>`).join('')}
    </div>` : '';

  const insightsHtml = mun.insights_comerciais?.length ? `
    <div class="dark-sub">
      <h4>Insights comerciais</h4>
      <ul class="lista-seta">
        ${mun.insights_comerciais.map((i) => `<li>${esc(i)}</li>`).join('')}
      </ul>
    </div>` : '';

  return `
<section class="sec">
  ${secHead(num, 'Provas do nicho', 'Cases de outros alunos pra citar quando precisar de prova social', 'consulta')}
  ${blocoConsultor(casesHtml + insightsHtml, { grande: true, tag: '🏆 Provas pra citar' })}
</section>`;
};

// ---------- Render principal ----------

export function renderBookConsultor(ctx: BookCtx): string {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;

  // Arquitetura v3 (André 20/07) — 3 partes com storytelling:
  //  ANTES DA CALL: 01 Briefing · 02 Raio-X · 03 Decisão de oferta ·
  //                 04 Argumentos & objeções
  //  DURANTE A CALL: 05 Análise do perfil ao vivo (UNIFICADA: visão
  //    geral → bio → melhor → menor → ponte; fala+dado colados)
  //  CONSULTA: 06 Provas do nicho
  // A análise de perfil deixou de ser 4 seções tortas (script/veredito/
  // bio/conteúdo separados) e virou UMA seção evolutiva. Numeração
  // dinâmica (Raio-X pode faltar).
  let n = 1;
  const nBriefing = String(n++).padStart(2, '0');
  const nRaiox = ctx.raiox ? String(n++).padStart(2, '0') : null;
  const nOferta = String(n++).padStart(2, '0');
  const nArgs = String(n++).padStart(2, '0');
  const nAnalise = String(n++).padStart(2, '0');
  const nProvas = String(n++).padStart(2, '0');

  const corpo = `
${heroBook(ctx)}
${secaoMapaUso(ctx, { nBriefing, nRaiox, nOferta, nArgs, nAnalise, nProvas })}
${secaoBriefing(ctx, nBriefing)}
${nRaiox ? secaoRaioX(ctx, nRaiox) : ''}
${secaoDecisaoOferta(ctx, nOferta)}
${secaoArgumentos(ctx, nArgs)}
${secaoAnalisePerfil(ctx, nAnalise)}
${secaoMunicaoNicho(ctx, nProvas)}
<footer class="rodape">
  ${marca()}
  <div class="rodape-meta">Uso interno — não compartilhar com o lead</div>
  <div class="rodape-meta">Book Comercial 365 · gerado em ${fmtData(ctx.gerado_em)}</div>
</footer>`;

  return shell({
    titulo: `Book Comercial · ${ctx.lead?.nome || String(p.handle ?? '')}`,
    corpo,
    cssExtra: BOOK_CSS,
  });
}
