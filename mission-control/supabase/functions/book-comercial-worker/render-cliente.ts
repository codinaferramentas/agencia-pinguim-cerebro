// ============================================================
// render-cliente.ts — Book Comercial 365 · relatório ENTREGÁVEL
// O cliente enxerga o problema (o quê + por quê); a solução
// pronta fica com o consultor. Portanto este render NÃO contém:
// bio sugerida/variações/keyword/CTA sugerido, prescrições por
// post, transcrições, posicionamento-alvo, próximos passos nem
// qualquer material interno de venda.
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
  pilarRow,
  renderPostCard,
  rubricaBarras,
  rubricaScore10,
  secHead,
  semaforo,
  shell,
  statRow,
} from './render-shared.ts';

export interface ClienteCtx {
  lead: Lead;
  analise: AnaliseJson;
  gerado_em: string;
}

// CSS específico do relatório do cliente (nada de blocos internos).
const CLIENTE_CSS = `
.oport{display:grid;grid-template-columns:52px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid var(--line)}
.oport:last-child{border-bottom:0}
.oport-num{font-family:var(--f-black);font-size:34px;color:var(--accent);line-height:1}
.oport h4{font-size:14.5px;font-weight:700}
.oport p{font-size:13px;line-height:1.6;color:var(--ink-soft);margin:4px 0 0}
.risco-cli{border-left:3px solid var(--bad);background:#fffdf8;border-top:1px solid var(--line);border-right:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0 10px 10px 0;padding:16px 18px;margin-bottom:12px}
.risco-cli h4{font-size:14px;font-weight:700}
.risco-cli p{font-size:12.5px;color:var(--ink-soft);margin:4px 0}
.risco-cli-imp{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--bad);font-weight:700}
.bio-atual-cli{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;font-size:13px;line-height:1.55;white-space:pre-wrap;box-shadow:0 2px 10px rgba(17,17,17,.05)}
.bio-score-cli{font-family:var(--f-black);font-size:34px;line-height:1;margin-top:14px}
.bio-score-cli small{font-size:14px;color:var(--muted)}
@media print{
  .oport,.risco-cli,.bio-atual-cli{break-inside:avoid;page-break-inside:avoid}
}
`;

const heroCliente = (ctx: ClienteCtx): string => {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;
  const m = (ctx.analise?.metrics ?? {}) as Record<string, unknown>;
  const ov = (ctx.analise?.overview ?? {}) as Record<string, unknown>;

  return `
<section class="hero">
  <div class="hero-top">
    ${marca()}
    <span class="hero-badge">Comercial 365</span>
  </div>
  <div class="hero-kicker">Análise de perfil</div>
  <div class="hero-perfil">
    ${avatarHtml(p.avatar_url, ctx.lead?.nome || p.full_name)}
    <div>
      <h1 class="hero-nome">${esc(ctx.lead?.nome || p.full_name || p.handle || 'Perfil')}</h1>
      <div class="hero-handle">@${esc(p.handle || ctx.lead?.instagram || '—')}${p.is_verified ? '<span class="verif">✔</span>' : ''}</div>
    </div>
  </div>
  ${statRow([
    { num: fmtNum(p.followers), label: 'seguidores' },
    { num: fmtNum(p.posts_count), label: 'posts' },
    { num: fmtPct(m.avg_engagement_pro), label: 'engajamento médio' },
    { num: fmtNota(ov.nota_geral), label: 'nota geral' },
  ])}
</section>`;
};

const secaoVereditoCliente = (ctx: ClienteCtx): string => {
  const ov = (ctx.analise?.overview ?? null) as Record<string, unknown> | null;
  if (!ov) {
    return `
<section class="sec">
  ${secHead('01', 'Veredito', 'Diagnóstico estratégico do perfil')}
  <div class="card"><p class="vazio">Diagnóstico estratégico indisponível para este perfil.</p></div>
</section>`;
  }
  const pilares = (ov.pilares ?? {}) as Record<string, { nota?: unknown; justificativa?: unknown }>;
  const oportunidades = Array.isArray(ov.oportunidades) ? (ov.oportunidades as Record<string, unknown>[]) : [];
  const riscos = Array.isArray(ov.riscos) ? (ov.riscos as Record<string, unknown>[]) : [];

  return `
<section class="sec">
  ${secHead('01', 'Veredito', 'Diagnóstico estratégico do perfil')}
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
      <h5>Público que o perfil atrai</h5>
      <p style="font-size:13.5px">${esc(ov.publico_alvo_inferido || '—')}</p>
    </div>
  </div>
  ${oportunidades.length ? `
  <div class="card">
    <h5>Oportunidades identificadas</h5>
    ${oportunidades.map((o, i) => `
    <div class="oport">
      <div class="oport-num">${i + 1}</div>
      <div>
        <h4>${esc(o.titulo || '')}</h4>
        <p>${esc(o.racional || '')}</p>
      </div>
    </div>`).join('')}
  </div>` : ''}
  ${riscos.length ? `
  <div style="margin-top:14px">
    ${riscos.map((r) => `
    <div class="risco-cli">
      <h4>${esc(r.titulo || '')}</h4>
      <p>${esc(r.descricao || '')}</p>
      ${r.impacto_se_nao_resolvido ? `<div class="risco-cli-imp">Se não resolver: ${esc(r.impacto_se_nao_resolvido)}</div>` : ''}
    </div>`).join('')}
  </div>` : ''}
</section>`;
};

const secaoBioCliente = (ctx: ClienteCtx): string => {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;
  const bio = (ctx.analise?.bio_analysis ?? null) as Record<string, unknown> | null;
  const diag = (bio?.analise_diagnostica ?? {}) as Record<string, unknown>;
  const score = rubricaScore10(bio?.rubrica_bio_atual);

  return `
<section class="sec">
  ${secHead('02', 'Bio', 'A vitrine do perfil, linha a linha')}
  <div class="grid-2">
    <div class="card">
      <h5>Bio atual</h5>
      <div class="bio-atual-cli">${esc(p.bio_text || '(bio vazia)')}</div>
      ${score !== null ? `<div class="bio-score-cli" style="color:${semaforo(score)}">${fmtNota(score)}<small>/10</small></div>` : ''}
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
</section>`;
};

const secaoConteudoCliente = (ctx: ClienteCtx): string => {
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

  return `
<section class="sec">
  ${secHead('03', 'Conteúdo', `${fmtNum(m.professional_count)} posts profissionais analisados · média de ${fmtNum(m.avg_likes_pro)} curtidas e ${fmtPct(m.avg_engagement_pro)} de engajamento`)}

  ${top ? `<div class="rank-div"><span>★ Post de maior performance</span></div>${renderPostCard(top, { label: 'Post de maior performance', destaque: 'top' })}` : ''}

  ${worst ? `<div class="rank-div"><span>Post de menor performance</span></div>${renderPostCard(worst, { label: 'Post de menor performance', destaque: 'worst' })}` : ''}

  ${outros.length ? `<div class="rank-div"><span>Demais posts · ordenados por nota</span></div>${outros.map((p: Record<string, unknown>, i: number) =>
    renderPostCard(p, { label: `Post #${i + 1}`, compacto: true })).join('')}` : ''}
</section>`;
};

export function renderCliente(ctx: ClienteCtx): string {
  const p = (ctx.analise?.profile ?? {}) as Record<string, unknown>;

  const corpo = `
${heroCliente(ctx)}
${secaoVereditoCliente(ctx)}
${secaoBioCliente(ctx)}
${secaoConteudoCliente(ctx)}
<footer class="rodape">
  ${marca()}
  <div class="rodape-meta">Gerado em ${fmtData(ctx.gerado_em)}</div>
  <div class="rodape-meta">Análise gerada pela inteligência da Agência Pinguim</div>
</footer>`;

  return shell({
    titulo: `Análise de Perfil · @${String(p.handle ?? ctx.lead?.instagram ?? '')}`,
    corpo,
    cssExtra: CLIENTE_CSS,
  });
}
