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

const blocoConsultor = (inner: string, opts?: { grande?: boolean; semTag?: boolean }): string => `
<div class="dark${opts?.grande ? ' dark-grande' : ''}">
  ${opts?.semTag ? '' : '<span class="dark-tag">⚡ Munição do consultor</span>'}
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

  return blocoConsultor(recHtml + transHtml);
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

const secaoResumoConsultor = (ctx: BookCtx): string => {
  const ov = (ctx.analise?.overview ?? {}) as Record<string, unknown>;
  const nota = ov.nota_geral;

  const bullets: string[] = [];
  if (ctx.municao?.insights_comerciais?.length) {
    bullets.push(...ctx.municao.insights_comerciais.slice(0, 4).map((i) => String(i)));
  }
  if (bullets.length < 3 && ov.veredito_curto) bullets.push(String(ov.veredito_curto));

  const produtoHtml = ctx.municao ? `
    <div class="produto-alvo">
      <h5>Produto-alvo</h5>
      <div class="produto-alvo-nome">${esc(ctx.municao.produto_alvo)}</div>
      ${ctx.municao.produto_alternativa ? `<div style="font-size:12px;color:#9c968a;margin-top:6px">Plano B: <strong style="color:#d8d2c6">${esc(ctx.municao.produto_alternativa)}</strong></div>` : ''}
      ${ctx.municao.produto_alvo_racional ? `<p class="produto-alvo-rac">${esc(ctx.municao.produto_alvo_racional)}</p>` : ''}
    </div>` : '<p class="produto-alvo-rac" style="margin-top:14px">Munição comercial ainda não gerada para este lead.</p>';

  let linhaCliente = '';
  if (ctx.raiox) {
    if (ctx.raiox.ja_cliente) {
      const produtos = (ctx.raiox.hotmart?.produtos ?? []).map((pr) => pr.nome).filter(Boolean);
      linhaCliente = `<div class="linha-cliente"><strong>Já é aluno</strong>${ctx.raiox.cliente_desde ? ` desde ${fmtData(ctx.raiox.cliente_desde)}` : ''}${produtos.length ? ` — comprou: ${esc(produtos.join(', '))}` : ''}. Detalhes no Raio-X.</div>`;
    } else {
      linhaCliente = `<div class="linha-cliente"><strong>Lead novo</strong> — sem histórico de compras conosco.</div>`;
    }
  }

  return `
<section class="sec">
  ${secHead('00', 'Resumo pro consultor', '30 segundos antes de entrar na call')}
  ${blocoConsultor(`
    <div class="resumo00-grid">
      <div>
        <h5>Nota geral do perfil</h5>
        <div class="resumo00-nota" style="color:${semaforo(nota)}">${fmtNota(nota)}<small>/10</small></div>
        ${produtoHtml}
      </div>
      <div>
        <h5>O que mais importa nessa call</h5>
        <ul class="lista-seta">
          ${bullets.length ? bullets.map((b) => `<li>${esc(b)}</li>`).join('') : '<li>Análise estratégica completa nas seções seguintes.</li>'}
        </ul>
        ${linhaCliente}
      </div>
    </div>
  `)}
  ${(ctx.respostas_form?.length)
    ? `<div class="card" style="margin-top:16px">
    <h5>Ficha do formulário de qualificação (respostas literais do lead)</h5>
    <dl class="form-qa">
      ${ctx.respostas_form.map((r) => `<div><dt>${esc(r.pergunta)}</dt><dd>${esc(r.resposta)}</dd></div>`).join('')}
    </dl>
  </div>`
    : ''}
</section>`;
};

const secaoVeredito = (ctx: BookCtx, num: string): string => {
  const ov = (ctx.analise?.overview ?? null) as Record<string, unknown> | null;
  if (!ov) {
    return `
<section class="sec">
  ${secHead(num, 'Veredito', 'Diagnóstico estratégico do perfil')}
  <div class="card"><p class="vazio">Diagnóstico estratégico indisponível para este perfil.</p></div>
</section>`;
  }
  const pilares = (ov.pilares ?? {}) as Record<string, { nota?: unknown; justificativa?: unknown }>;

  return `
<section class="sec">
  ${secHead(num, 'Veredito', 'Diagnóstico estratégico do perfil')}
  <div class="veredito">
    <div class="veredito-nota" style="color:${semaforo(ov.nota_geral)}">${fmtNota(ov.nota_geral)}<small>/10</small></div>
    ${ov.veredito_curto ? `<div class="veredito-frase">“${esc(ov.veredito_curto)}”</div>` : ''}
  </div>
  <div class="card">
    ${Object.entries(pilares).map(([k, v]) =>
      pilarRow(PILAR_LABELS[k] || k.replace(/_/g, ' '), v?.nota, v?.justificativa)).join('') || '<p class="vazio">Pilares não avaliados.</p>'}
  </div>
  <div class="grid-2">
    <div class="card">
      <h5>Como o perfil aparece hoje</h5>
      <p style="font-size:13.5px">${esc(ov.identidade_atual || '—')}</p>
    </div>
    <div class="card">
      <h5>Público inferido</h5>
      <p style="font-size:13.5px">${esc(ov.publico_alvo_inferido || '—')}</p>
    </div>
  </div>
  ${ov.identidade_ideal ? blocoConsultor(`
    <h4>Posicionamento-alvo do perfil</h4>
    <p style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9c968a;margin:0 0 10px">Não é o produto — é a transformação que a call vende: onde o perfil dele precisa chegar</p>
    <p class="fr" style="font-size:17px;line-height:1.5">${esc(ov.identidade_ideal)}</p>
  `) : ''}
</section>`;
};

const secaoBio = (ctx: BookCtx, num: string): string => {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;
  const bio = (ctx.analise?.bio_analysis ?? null) as Record<string, unknown> | null;
  const diag = (bio?.analise_diagnostica ?? {}) as Record<string, unknown>;
  const scoreAtual = rubricaScore10(bio?.rubrica_bio_atual);
  const scoreNovo = rubricaScore10(bio?.rubrica_bio_nova);

  const bioShot = (texto: unknown): string => `
    <div class="bio-shot">
      <div class="bio-shot-top">
        ${avatarHtml(p.avatar_url, p.full_name || p.handle, 'bio-shot-avatar')}
        <div>
          <div class="bio-shot-nome">${esc(p.full_name || p.handle || '—')}${bio?.sugestao_keyword_nome ? ` <span class="bio-shot-kw">| ${esc(bio.sugestao_keyword_nome)}</span>` : ''}</div>
          <div class="bio-shot-kw">@${esc(p.handle || '—')}</div>
        </div>
      </div>
      <div class="bio-shot-texto">${esc(texto || '—')}</div>
      ${p.bio_link ? `<div class="bio-shot-cta">🔗 ${esc(p.bio_link)}</div>` : ''}
    </div>`;

  const consultorBio = bio ? blocoConsultor(`
    <h4>Bio sugerida (pronta pra propor na call)</h4>
    ${bioShot(bio.bio_sugerida)}
    ${scoreNovo !== null ? `<div class="bio-score-novo" style="color:${semaforo(scoreNovo)}">${fmtNota(scoreNovo)}<small>/10</small> <small style="font-size:11px;letter-spacing:.1em;text-transform:uppercase">score da nova bio</small></div>` : ''}
    ${bio.justificativa_bio ? `<p style="font-size:13px;margin-top:12px">${esc(bio.justificativa_bio)}</p>` : ''}
    ${bio.sugestao_keyword_nome ? `<p style="font-size:12.5px"><strong style="color:var(--accent)">Keyword pro campo Nome:</strong> ${esc(bio.sugestao_keyword_nome)}</p>` : ''}
    ${bio.cta_sugerido ? `<p style="font-size:12.5px"><strong style="color:var(--accent)">CTA sugerido:</strong> ${esc(bio.cta_sugerido)}</p>` : ''}
    <div class="bio-vars">
      ${[
        ['Autoridade', bio.bio_variacao_autoridade],
        ['Conexão', bio.bio_variacao_conexao],
        ['Ação', bio.bio_variacao_acao],
      ].filter(([, v]) => v).map(([label, v]) => `
      <div class="bio-var">
        <div class="bio-var-label">${label}</div>
        <div class="bio-var-texto">${esc(v)}</div>
      </div>`).join('')}
    </div>
  `) : '';

  return `
<section class="sec">
  ${secHead(num, 'Bio', 'A vitrine do perfil, linha a linha')}
  <div class="grid-2">
    <div class="card">
      <h5>Bio atual</h5>
      ${bioShot(p.bio_text || '(bio vazia)')}
      ${scoreAtual !== null ? `<div style="font-family:var(--f-black);font-size:30px;margin-top:14px;color:${semaforo(scoreAtual)}">${fmtNota(scoreAtual)}<small style="font-size:13px;color:var(--muted)">/10</small></div>` : ''}
      ${rubricaBarras(bio?.rubrica_bio_atual, RUBRICA_BIO_LABELS)}
    </div>
    <div class="card">
      <h5>Diagnóstico</h5>
      ${Object.keys(diag).length
        ? Object.entries(diag).map(([k, v]) => `
          <div style="margin-bottom:10px">
            <strong style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">${esc(DIAG_BIO_LABELS[k] || k.replace(/_/g, ' '))}</strong>
            <p style="font-size:12.5px;margin:3px 0 0;color:var(--ink-soft)">${esc(v)}</p>
          </div>`).join('')
        : '<p class="vazio">Diagnóstico de bio indisponível.</p>'}
    </div>
  </div>
  <div class="grid-2">
    <div class="card"><h5>Pontos fortes</h5><p style="font-size:13px">${esc(bio?.pontos_fortes || '—')}</p></div>
    <div class="card"><h5>Pontos de melhoria</h5><p style="font-size:13px">${esc(bio?.pontos_de_melhoria || '—')}</p></div>
  </div>
  ${consultorBio}
</section>`;
};

const secaoConteudo = (ctx: BookCtx, num: string): string => {
  const a = ctx.analise ?? {};
  const m = (a.metrics ?? {}) as Record<string, unknown>;
  const top = (a.top_post ?? null) as Record<string, unknown> | null;
  const worst = (a.worst_post ?? null) as Record<string, unknown> | null;
  const outros = (Array.isArray(a.other_posts_analyzed) ? a.other_posts_analyzed : [])
    .slice()
    .sort((x: Record<string, unknown>, y: Record<string, unknown>) => {
      const nx = Number((x?.analysis as Record<string, unknown>)?.nota_geral ?? -1);
      const ny = Number((y?.analysis as Record<string, unknown>)?.nota_geral ?? -1);
      return (Number.isFinite(ny) ? ny : -1) - (Number.isFinite(nx) ? nx : -1);
    });

  // subtítulo depende de termos ou não a análise dos demais posts
  const sub = outros.length
    ? `${fmtNum(m.professional_count)} posts profissionais analisados · média de ${fmtNum(m.avg_likes_pro)} curtidas e ${fmtPct(m.avg_engagement_pro)} de engajamento`
    : `O que funcionou e o que travou — comparados sobre ${fmtNum(m.professional_count)} posts, média de ${fmtNum(m.avg_likes_pro)} curtidas e ${fmtPct(m.avg_engagement_pro)} de engajamento`;

  return `
<section class="sec">
  ${secHead(num, 'Conteúdo', sub)}

  ${top ? `<div class="rank-div"><span>★ Post de maior performance</span></div>${renderPostCard(top, { label: 'Post de maior performance', destaque: 'top', extraHtml: extraPostConsultor(top) })}` : ''}

  ${worst ? `<div class="rank-div"><span>Post de menor performance</span></div>${renderPostCard(worst, { label: 'Post de menor performance', destaque: 'worst', extraHtml: extraPostConsultor(worst) })}` : ''}

  ${outros.length ? `<div class="rank-div"><span>Demais posts · ordenados por nota</span></div>${outros.map((p: Record<string, unknown>, i: number) =>
    renderPostCard(p, {
      label: `Post #${i + 1}`,
      compacto: true,
      extraHtml: extraPostConsultor(p),
    })).join('')}` : ''}
</section>`;
};

// Script de teleprompter: o comercial LÊ isto ao vivo pra conduzir a
// análise de perfil como se fosse especialista em conteúdo.
const secaoScriptAnalise = (ctx: BookCtx, num: string): string => {
  const r = ctx.roteiro;
  if (!r || !Array.isArray(r.passos) || r.passos.length === 0) {
    return `
<section class="sec">
  ${secHead(num, 'Script da análise ao vivo', 'Roteiro pronto pra conduzir a análise de perfil na call')}
  <div class="card"><p class="vazio">Script ainda não gerado para este lead.</p></div>
</section>`;
  }

  const passosHtml = r.passos.map((p, i) => `
    <div class="tp-passo">
      <div class="tp-passo-head">
        <span class="tp-passo-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="tp-passo-titulo">${esc(p.titulo_secao)}</span>
      </div>
      <div class="tp-passo-body">
        <div class="tp-leia">Leia em voz alta</div>
        <p class="tp-fala">${esc(p.fala)}</p>
        ${p.direcao ? `<div class="tp-direcao"><span class="tp-dir-etq">Direção</span><span>${esc(p.direcao)}</span></div>` : ''}
        ${p.fato_ancora ? `<div class="tp-fato"><strong>Fato usado:</strong> ${esc(p.fato_ancora)}</div>` : ''}
      </div>
    </div>`).join('');

  return `
<section class="sec">
  ${secHead(num, 'Script da análise ao vivo', 'Teleprompter pronto — leia palavra por palavra e conduza como especialista')}

  ${r.abertura ? `<div class="tp-intro">
    <div class="tp-etq">▸ Abertura — leia isto pra começar</div>
    <p class="tp-fala">${esc(r.abertura)}</p>
  </div>` : ''}

  ${passosHtml}

  ${r.transicao_oferta ? `<div class="tp-oferta">
    <div class="tp-etq">⚡ Fechamento — ponte pra oferta</div>
    <p class="tp-fala">${esc(r.transicao_oferta)}</p>
  </div>` : ''}
</section>`;
};

const secaoPlaybook = (ctx: BookCtx, num: string): string => {
  const ov = (ctx.analise?.overview ?? {}) as Record<string, unknown>;
  const ci = (ctx.analise?.cross_insights ?? null) as Record<string, unknown> | null;
  const oportunidades = Array.isArray(ov.oportunidades) ? (ov.oportunidades as Record<string, unknown>[]) : [];
  const riscos = Array.isArray(ov.riscos) ? (ov.riscos as Record<string, unknown>[]) : [];
  const passos = Array.isArray(ov.proximos_passos) ? (ov.proximos_passos as unknown[]) : [];
  const mun = ctx.municao;

  const blocoCI = ci ? `
    <div class="dark-sub">
      <h4>Padrões do conteúdo</h4>
      <div class="grid-3" style="gap:18px">
        ${ci.padrao_que_funciona ? `<div><h5>O que funciona</h5><p style="font-size:12.5px">${esc(ci.padrao_que_funciona)}</p></div>` : ''}
        ${ci.o_que_o_worst_pode_aprender ? `<div><h5>Lição do post de menor performance</h5><p style="font-size:12.5px">${esc(ci.o_que_o_worst_pode_aprender)}</p></div>` : ''}
        ${ci.padroes_do_perfil ? `<div><h5>Padrões gerais do perfil</h5><p style="font-size:12.5px">${esc(ci.padroes_do_perfil)}</p></div>` : ''}
      </div>
    </div>` : '';

  const blocoOpp = oportunidades.length ? `
    <div class="dark-sub">
      <h4>Oportunidades — o argumento de venda mora aqui</h4>
      ${oportunidades.map((o, i) => `
      <div class="opp">
        <div class="opp-num">${i + 1}</div>
        <div>
          <h4>${esc(o.titulo || '')}</h4>
          <p>${esc(o.racional || '')}</p>
          <div class="chips">${chipImpacto(o.impacto_esperado)}${chipEsforco(o.esforco)}</div>
          ${o.primeiro_passo ? `<div class="opp-passo"><strong>Primeiro passo:</strong> ${esc(o.primeiro_passo)}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>` : '';

  const blocoRiscos = riscos.length ? `
    <div class="dark-sub">
      <h4>Riscos — as dores pra nomear na call</h4>
      ${riscos.map((r) => `
      <div class="risco">
        <h4>${esc(r.titulo || '')}</h4>
        <p>${esc(r.descricao || '')}</p>
        ${r.impacto_se_nao_resolvido ? `<div class="risco-imp">Se não resolver: ${esc(r.impacto_se_nao_resolvido)}</div>` : ''}
      </div>`).join('')}
    </div>` : '';

  const blocoPassos = passos.length ? `
    <div class="dark-sub">
      <h4>Próximos passos do perfil</h4>
      ${passos.map((p, i) => `
      <div class="passo-call">
        <div class="passo-call-num">${i + 1}</div>
        <div class="passo-call-txt">${esc(p)}</div>
      </div>`).join('')}
    </div>` : '';

  const blocoRoteiro = mun?.roteiro_call?.length ? `
    <div class="dark-sub">
      <h4>Roteiro da call — passo a passo</h4>
      ${mun.roteiro_call.map((p, i) => `
      <div class="passo-call">
        <div class="passo-call-num">${i + 1}</div>
        <div class="passo-call-txt">${esc(p)}</div>
      </div>`).join('')}
    </div>` : '';

  const blocoObjecoes = mun?.angulos_objecao?.length ? `
    <div class="dark-sub">
      <h4>Ângulos de objeção</h4>
      ${mun.angulos_objecao.map((o) => `
      <div class="obje">
        <div class="obje-q">${esc(o.objecao)}”</div>
        <div class="obje-a"><strong>Como responder</strong>${esc(o.resposta)}</div>
      </div>`).join('')}
    </div>` : '';

  const conteudo = blocoCI + blocoOpp + blocoRiscos + blocoPassos + blocoRoteiro + blocoObjecoes;

  return `
<section class="sec">
  ${secHead(num, 'Playbook da call', 'Plano de voo — leia isto antes de entrar na conversa')}
  ${blocoConsultor(conteudo.trim() || '<p class="vazio" style="color:#9c968a">Playbook indisponível — análise estratégica e munição comercial ainda não geradas para este lead.</p>', { grande: true })}
</section>`;
};

const secaoRaioX = (ctx: BookCtx, num: string): string => {
  const rx = ctx.raiox;
  if (!rx) {
    return `
<section class="sec">
  ${secHead(num, 'Raio-X do cliente', 'Relacionamento do lead com o nosso ecossistema')}
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
  ${secHead(num, 'Raio-X do cliente', 'Relacionamento do lead com o nosso ecossistema')}
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
  ${secHead(num, 'Munição do nicho', 'Prova social e argumentos específicos do segmento')}
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
  ${secHead(num, 'Munição do nicho', 'Prova social e argumentos específicos do segmento')}
  ${blocoConsultor(casesHtml + insightsHtml, { grande: true })}
</section>`;
};

// ---------- Render principal ----------

export function renderBookConsultor(ctx: BookCtx): string {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;

  // Ordem pensada como um VENDEDOR usa (André 18-20/07):
  //  00 Resumo · 01 Playbook (plano de voo) · 02 Raio-X (quem é) ·
  //  03 Munição (cases pra vender) · 04 SCRIPT DA ANÁLISE (teleprompter
  //  que ele lê ao vivo) · e depois o material técnico que embasa o
  //  script (veredito, bio, conteúdo) pra consulta/aprofundamento.
  const corpo = `
${heroBook(ctx)}
${secaoResumoConsultor(ctx)}
${secaoPlaybook(ctx, '01')}
${secaoRaioX(ctx, '02')}
${secaoMunicaoNicho(ctx, '03')}
${secaoScriptAnalise(ctx, '04')}
${secaoVeredito(ctx, '05')}
${secaoBio(ctx, '06')}
${secaoConteudo(ctx, '07')}
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
