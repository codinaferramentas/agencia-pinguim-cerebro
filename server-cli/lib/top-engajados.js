// ============================================================
// top-engajados.js — V2.15 Skill (Andre 2026-05-11)
// ============================================================
// Monta ranking TOP N de alunos engajados em ProAlt, Elo e Sirius,
// fazendo TODAS as queries necessárias em PARALELO num único processo
// Node (em vez de 5-10 Bash calls sequenciais do LLM).
//
// Critérios canônicos (Andre 2026-05-11):
//   - ProAlt: volume de uso do APP — soma de personas + analises_criativos
//             + creatives + pages (NÃO inclui roteiros — não tem user_id)
//   - Elo: contagem de user_progress (aulas completadas) + bookings
//   - Sirius: conteúdo criado — soma de challenges + personas + creatives + viral_scripts
//
// Schema descoberto via descrever-tabela (2026-05-11):
//   - proalt.profiles: id, user_id, full_name, email, created_at, last_access_at
//   - elo.profiles: id, nome, nome_completo, email, ciclo_atual, last_access
//   - sirius.profiles: id, user_id, nome, email, last_login_at
//   - elo.user_progress: tem completed_at (não tem 'progress' numérico)
//   - sirius.content_challenge_participants: usa joined_at (não created_at)
//
// Resultado: relatório markdown pronto pra ser entregue ao sócio.
// ============================================================

const dbe = require('./db-externo');

const LIMITE_POR_TABELA = 2000;

// ============================================================
// PROALT
// ============================================================
async function rankProAlt(topN = 15) {
  const tabelas = ['personas', 'analises_criativos', 'creatives', 'pages'];
  const t0 = Date.now();
  const erros = [];

  const resultados = await Promise.all(
    tabelas.map(t =>
      dbe.consultarTabela('proalt', t, { select: 'user_id', limite: LIMITE_POR_TABELA })
        .catch(e => { erros.push(`${t}: ${e.message.slice(0, 100)}`); return []; })
    )
  );

  const scorePorUser = {};
  const detalhePorUser = {};
  for (let i = 0; i < tabelas.length; i++) {
    const r = resultados[i];
    const t = tabelas[i];
    if (!Array.isArray(r)) continue;
    for (const linha of r) {
      const uid = linha.user_id;
      if (!uid) continue;
      scorePorUser[uid] = (scorePorUser[uid] || 0) + 1;
      if (!detalhePorUser[uid]) detalhePorUser[uid] = {};
      detalhePorUser[uid][t] = (detalhePorUser[uid][t] || 0) + 1;
    }
  }

  const ranking = Object.entries(scorePorUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([uid, score]) => ({ user_id: uid, score, detalhe: detalhePorUser[uid] }));

  // Enrich: profiles.user_id (não id) — ProAlt schema
  if (ranking.length > 0) {
    const uids = ranking.map(r => r.user_id);
    try {
      const profiles = await dbe.consultarTabela('proalt', 'profiles', {
        select: 'user_id,full_name,email,last_access_at',
        filtros: { user_id: `in.(${uids.join(',')})` },
        limite: topN * 2,
      });
      const mapa = {};
      for (const p of (profiles || [])) mapa[p.user_id] = p;
      for (const r of ranking) {
        const prof = mapa[r.user_id] || {};
        r.email = prof.email || '(sem email)';
        r.nome = prof.full_name || '(sem nome)';
        r.ultimo_acesso = prof.last_access_at || null;
      }
    } catch (e) { erros.push(`profiles enrich: ${e.message.slice(0, 100)}`); }
  }

  return { ranking, erros, latencia_ms: Date.now() - t0, total_amostra: Object.keys(scorePorUser).length };
}

// ============================================================
// ELO — user_progress (aulas completadas) + bookings
// ============================================================
async function rankElo(topN = 15) {
  const t0 = Date.now();
  const erros = [];

  const [progResp, bookResp, onboardResp] = await Promise.all([
    dbe.consultarTabela('elo', 'user_progress', { select: 'user_id', limite: LIMITE_POR_TABELA })
      .catch(e => { erros.push(`user_progress: ${e.message.slice(0, 100)}`); return []; }),
    dbe.consultarTabela('elo', 'bookings', { select: 'aluno_id', limite: LIMITE_POR_TABELA })
      .catch(e => { erros.push(`bookings: ${e.message.slice(0, 100)}`); return []; })
      .then(rows => Array.isArray(rows) ? rows.map(r => ({ user_id: r.aluno_id })) : rows),
    dbe.consultarTabela('elo', 'onboarding_progress', { select: 'user_id', limite: LIMITE_POR_TABELA })
      .catch(e => { erros.push(`onboarding_progress: ${e.message.slice(0, 100)}`); return []; }),
  ]);

  // Score: contagem de aulas completadas (peso 1) + bookings (peso 2) + onboarding (peso 0.5)
  const progPorUser = {};
  for (const p of (Array.isArray(progResp) ? progResp : [])) {
    if (!p.user_id) continue;
    progPorUser[p.user_id] = (progPorUser[p.user_id] || 0) + 1;
  }
  const bookPorUser = {};
  for (const b of (Array.isArray(bookResp) ? bookResp : [])) {
    if (!b.user_id) continue;
    bookPorUser[b.user_id] = (bookPorUser[b.user_id] || 0) + 1;
  }
  const onbPorUser = {};
  for (const o of (Array.isArray(onboardResp) ? onboardResp : [])) {
    if (!o.user_id) continue;
    onbPorUser[o.user_id] = (onbPorUser[o.user_id] || 0) + 1;
  }

  const todos = new Set([...Object.keys(progPorUser), ...Object.keys(bookPorUser), ...Object.keys(onbPorUser)]);
  const scorePorUser = {};
  const detalhePorUser = {};
  for (const uid of todos) {
    const p = progPorUser[uid] || 0;
    const b = bookPorUser[uid] || 0;
    const o = onbPorUser[uid] || 0;
    const score = p * 1 + b * 2 + o * 0.5;
    if (score > 0) {
      scorePorUser[uid] = score;
      detalhePorUser[uid] = { aulas_completas: p, bookings: b, onboarding: o };
    }
  }

  const ranking = Object.entries(scorePorUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([uid, score]) => ({ user_id: uid, score: +score.toFixed(1), detalhe: detalhePorUser[uid] }));

  // Enrich: elo.profiles.id (não user_id — Elo schema)
  if (ranking.length > 0) {
    const uids = ranking.map(r => r.user_id);
    try {
      const profiles = await dbe.consultarTabela('elo', 'profiles', {
        select: 'id,nome,nome_completo,email,last_access',
        filtros: { id: `in.(${uids.join(',')})` },
        limite: topN * 2,
      });
      const mapa = {};
      for (const p of (profiles || [])) mapa[p.id] = p;
      for (const r of ranking) {
        const prof = mapa[r.user_id] || {};
        r.email = prof.email || '(sem email)';
        r.nome = prof.nome_completo || prof.nome || '(sem nome)';
        r.ultimo_acesso = prof.last_access || null;
      }
    } catch (e) { erros.push(`profiles enrich: ${e.message.slice(0, 100)}`); }
  }

  return { ranking, erros, latencia_ms: Date.now() - t0, total_amostra: todos.size };
}

// ============================================================
// SIRIUS
// ============================================================
async function rankSirius(topN = 15) {
  const t0 = Date.now();
  const erros = [];

  const tabelas = ['content_challenge_participants', 'personas', 'marketing_creatives', 'viral_scripts'];
  const resultados = await Promise.all(
    tabelas.map(t =>
      dbe.consultarTabela('sirius', t, { select: 'user_id', limite: LIMITE_POR_TABELA })
        .catch(e => { erros.push(`${t}: ${e.message.slice(0, 100)}`); return []; })
    )
  );

  const scorePorUser = {};
  const detalhePorUser = {};
  for (let i = 0; i < tabelas.length; i++) {
    const r = resultados[i];
    const t = tabelas[i];
    if (!Array.isArray(r)) continue;
    for (const linha of r) {
      const uid = linha.user_id;
      if (!uid) continue;
      scorePorUser[uid] = (scorePorUser[uid] || 0) + 1;
      if (!detalhePorUser[uid]) detalhePorUser[uid] = {};
      detalhePorUser[uid][t] = (detalhePorUser[uid][t] || 0) + 1;
    }
  }

  const ranking = Object.entries(scorePorUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([uid, score]) => ({ user_id: uid, score, detalhe: detalhePorUser[uid] }));

  // Enrich: sirius.profiles tem id (pk) + user_id (link com auth.users). Link é via user_id.
  if (ranking.length > 0) {
    const uids = ranking.map(r => r.user_id);
    try {
      const profiles = await dbe.consultarTabela('sirius', 'profiles', {
        select: 'user_id,nome,email,last_login_at',
        filtros: { user_id: `in.(${uids.join(',')})` },
        limite: topN * 2,
      });
      const mapa = {};
      for (const p of (profiles || [])) mapa[p.user_id] = p;
      for (const r of ranking) {
        const prof = mapa[r.user_id] || {};
        r.email = prof.email || '(sem email)';
        r.nome = prof.nome || '(sem nome)';
        r.ultimo_acesso = prof.last_login_at || null;
      }
    } catch (e) { erros.push(`profiles enrich: ${e.message.slice(0, 100)}`); }
  }

  return { ranking, erros, latencia_ms: Date.now() - t0, total_amostra: Object.keys(scorePorUser).length };
}

// ============================================================
// CRITERIO POR PRODUTO — explicacao para rodape de relatorio
// ============================================================
const CRITERIO_POR_PRODUTO = {
  ProAlt: 'Uso do APP: soma de personas + analises_criativos + creatives + pages (1 ponto cada). Mede uso real do sistema, NAO consumo de aula.',
  Elo: 'Aulas completas (peso 1) + bookings (peso 2) + onboarding (peso 0.5). Elo APP e voltado pra acompanhamento de aula e agendamentos.',
  Sirius: 'Uso do APP: soma de personas + marketing_creatives + viral_scripts + content_challenge_participants (1 ponto cada). Mede criacao de conteudo, NAO consumo de aula.',
};

// Filtro de exclusao — aplica em ranking ja montado
function filtrarExclusoes(ranking, excluir_emails = [], excluir_user_ids = []) {
  if (!excluir_emails.length && !excluir_user_ids.length) return ranking;
  const emailSet = new Set(excluir_emails.map(e => String(e).toLowerCase().trim()));
  const uidSet = new Set(excluir_user_ids.map(u => String(u).toLowerCase().trim()));
  return ranking.filter(r => {
    const e = String(r.email || '').toLowerCase();
    const u = String(r.user_id || '').toLowerCase();
    return !emailSet.has(e) && !uidSet.has(u);
  });
}

// ============================================================
// ORQUESTRADOR
// ============================================================
async function gerarRelatorio({
  produtos = ['proalt', 'elo', 'sirius'],
  topN = 15,
  formato = 'markdown',
  excluir_emails = [],
  excluir_user_ids = [],
} = {}) {
  const t0 = Date.now();
  // Pega 50% a mais pra cobrir os excluidos sem ficar com ranking curto
  const buffer = (excluir_emails.length || excluir_user_ids.length) ? Math.ceil(topN * 1.5) + 5 : topN;

  const tarefas = produtos.map(p => {
    if (p === 'proalt') return rankProAlt(buffer).then(r => ({ produto: 'ProAlt', ...r }));
    if (p === 'elo')    return rankElo(buffer).then(r => ({ produto: 'Elo', ...r }));
    if (p === 'sirius') return rankSirius(buffer).then(r => ({ produto: 'Sirius', ...r }));
    return Promise.resolve({ produto: p, erros: [`produto desconhecido: ${p}`], ranking: [] });
  });
  let resultados = await Promise.all(tarefas);

  // Aplica filtro de exclusao + corta no topN
  resultados = resultados.map(r => {
    if (!r.ranking) return r;
    const filtrado = filtrarExclusoes(r.ranking, excluir_emails, excluir_user_ids).slice(0, topN);
    return { ...r, ranking: filtrado };
  });

  const latencia_total_ms = Date.now() - t0;
  if (formato === 'json') return { ok: true, latencia_total_ms, resultados, excluidos: { emails: excluir_emails, user_ids: excluir_user_ids } };

  let md = `# Top ${topN} alunos engajados por produto\n\n`;
  md += `_Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — latência total ${(latencia_total_ms/1000).toFixed(1)}s_\n\n`;
  if (excluir_emails.length || excluir_user_ids.length) {
    md += `_Exclusões aplicadas: ${[...excluir_emails, ...excluir_user_ids].join(', ')}_\n\n`;
  }

  for (const r of resultados) {
    md += `## ${r.produto} (top ${r.ranking.length} de ${r.total_amostra} usuários ativos)\n\n`;
    if (r.ranking.length === 0) {
      md += `_(sem dados disponíveis)_\n\n`;
      if (r.erros?.length) md += `_⚠ ${r.erros.join(' · ')}_\n\n`;
      continue;
    }
    for (let i = 0; i < r.ranking.length; i++) {
      const x = r.ranking[i];
      const det = Object.entries(x.detalhe).map(([k, v]) => `${k}=${v}`).join(', ');
      md += `${i + 1}. **${x.nome}** (${x.email}) — score ${x.score} · ${det}\n`;
    }
    md += '\n';
    if (r.erros?.length) md += `_⚠ erros: ${r.erros.join(' · ')}_\n\n`;
  }

  // Rodape com criterio canonico de cada produto (transparencia — sócio sabe o que score significa)
  md += `---\n\n## Como o score é calculado\n\n`;
  for (const r of resultados) {
    const criterio = CRITERIO_POR_PRODUTO[r.produto];
    if (criterio) md += `- **${r.produto}** — ${criterio}\n`;
  }
  md += `\n_Fonte: Supabases dos produtos (ProAlt, Elo, Sirius) consultados via Categoria M (db-externo, somente leitura). Não usa dados Hotmart._\n`;

  if (formato === 'html') {
    const html = renderHtml({
      resultados,
      topN,
      latenciaMs: latencia_total_ms,
      excluidos: { emails: excluir_emails, user_ids: excluir_user_ids },
    });
    return { ok: true, latencia_total_ms, md, html, resultados, excluidos: { emails: excluir_emails, user_ids: excluir_user_ids } };
  }
  return { ok: true, latencia_total_ms, md, resultados, excluidos: { emails: excluir_emails, user_ids: excluir_user_ids } };
}

// ============================================================
// renderHtml — gera HTML dark profissional a partir do payload estruturado
// (V2.15 — substitui o marsdownToSimpleHtml antigo que era light/feio)
// ============================================================
const ESCAPE_HTML = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CORES_PRODUTO = {
  ProAlt: { bg: 'rgba(232, 92, 0, 0.15)', border: '#E85C00', label: 'Uso do APP' },
  Elo:    { bg: 'rgba(168, 85, 247, 0.15)', border: '#A855F7', label: 'Progresso + Bookings' },
  Sirius: { bg: 'rgba(34, 197, 94, 0.15)',  border: '#22C55E', label: 'Conteúdo criado' },
};

function renderTabelaProduto(produto, ranking, total_amostra) {
  const cor = CORES_PRODUTO[produto] || { bg: 'rgba(100,116,139,0.15)', border: '#64748B', label: '' };
  if (!ranking.length) {
    return `<section class="card-produto" style="border-color:${cor.border}33">
      <div class="card-head" style="background:${cor.bg}">
        <span class="badge" style="background:${cor.border}">${ESCAPE_HTML(produto)}</span>
        <span class="head-sub">${ESCAPE_HTML(cor.label)}</span>
        <span class="head-meta">${total_amostra || 0} usuários ativos</span>
      </div>
      <div style="padding:2rem;text-align:center;color:#64748b;">Sem dados disponíveis.</div>
    </section>`;
  }

  // Descobre colunas dinamicamente — chaves de detalhe da primeira linha
  const chavesDetalhe = Array.from(new Set(
    ranking.flatMap(r => Object.keys(r.detalhe || {}))
  ));

  const linhas = ranking.map((r, i) => {
    const cels = chavesDetalhe.map(k => `<td>${ESCAPE_HTML(r.detalhe?.[k] ?? '—')}</td>`).join('');
    return `<tr>
      <td class="rank">${i + 1}</td>
      <td class="aluno"><div class="nome">${ESCAPE_HTML(r.nome || '(sem nome)')}</div><div class="email">${ESCAPE_HTML(r.email || '')}</div></td>
      ${cels}
      <td class="score" style="color:${cor.border}">${ESCAPE_HTML(r.score)}</td>
    </tr>`;
  }).join('');

  const heads = chavesDetalhe.map(k => `<th>${ESCAPE_HTML(k.toUpperCase())}</th>`).join('');

  return `<section class="card-produto" style="border-color:${cor.border}33">
    <div class="card-head" style="background:${cor.bg}">
      <span class="badge" style="background:${cor.border}">${ESCAPE_HTML(produto)}</span>
      <span class="head-sub">${ESCAPE_HTML(cor.label)}</span>
      <span class="head-meta">${total_amostra || 0} usuários ativos</span>
    </div>
    <table>
      <thead><tr><th>#</th><th>ALUNO</th>${heads}<th>SCORE</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </section>`;
}

function renderHtml({ resultados = [], topN = 15, latenciaMs = 0, excluidos = { emails: [], user_ids: [] }, geradoEmISO = null }) {
  const dataBR = geradoEmISO
    ? new Date(geradoEmISO).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const produtosLabel = resultados.map(r => r.produto).join(' · ');
  const exclusoesTxt = (excluidos.emails?.length || excluidos.user_ids?.length)
    ? `<div class="exclusoes">⊘ Exclusões: ${ESCAPE_HTML([...(excluidos.emails || []), ...(excluidos.user_ids || [])].join(', '))}</div>`
    : '';

  const blocosProdutos = resultados.map(r => renderTabelaProduto(r.produto, r.ranking || [], r.total_amostra)).join('\n');

  const criterios = resultados.map(r => {
    const c = CRITERIO_POR_PRODUTO[r.produto];
    return c ? `<li><strong>${ESCAPE_HTML(r.produto)}</strong> — ${ESCAPE_HTML(c)}</li>` : '';
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Top ${topN} Engajados · Pinguim OS</title>
<style>
  :root { --bg:#0a0a0f; --bg2:#111118; --card:#1a1a28; --border:#2a2a3e; --text:#f1f5f9; --text2:#94a3b8; --text3:#64748b; --laranja:#E85C00; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'IBM Plex Sans',-apple-system,system-ui,sans-serif; background:var(--bg); color:var(--text); line-height:1.5; padding:2.5rem 1.5rem; }
  .wrap { max-width:1100px; margin:0 auto; }
  .header { text-align:center; margin-bottom:2.5rem; }
  .header h1 { font-size:1.75rem; font-weight:700; letter-spacing:-0.01em; }
  .header .sub { color:var(--text2); font-size:.85rem; margin-top:.5rem; }
  .exclusoes { display:inline-block; margin-top:1rem; padding:.4rem .85rem; background:rgba(232,92,0,0.08); border:1px solid rgba(232,92,0,0.3); border-radius:999px; font-size:.78rem; color:var(--laranja); }
  .card-produto { background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:1.5rem; }
  .card-head { display:flex; align-items:center; gap:1rem; padding:1rem 1.5rem; border-bottom:1px solid var(--border); }
  .badge { display:inline-block; padding:.25rem .65rem; border-radius:6px; color:white; font-size:.7rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .head-sub { color:var(--text); font-weight:500; font-size:.9rem; }
  .head-meta { margin-left:auto; color:var(--text3); font-size:.8rem; }
  table { width:100%; border-collapse:collapse; }
  thead { background:var(--card); }
  th { text-align:left; padding:.75rem 1rem; font-size:.7rem; font-weight:600; color:var(--text2); text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid var(--border); }
  th:first-child { width:48px; text-align:center; }
  th:last-child { text-align:right; width:80px; }
  td { padding:.85rem 1rem; border-bottom:1px solid var(--border); font-size:.88rem; vertical-align:middle; }
  tbody tr:last-child td { border-bottom:none; }
  tbody tr:hover { background:rgba(255,255,255,0.02); }
  .rank { text-align:center; color:var(--text3); font-weight:700; font-size:.85rem; }
  .aluno .nome { color:var(--text); font-weight:500; }
  .aluno .email { color:var(--text3); font-size:.75rem; margin-top:.15rem; }
  .score { text-align:right; font-weight:700; font-size:1rem; }
  .rodape { margin-top:2.5rem; padding:1.25rem 1.5rem; background:var(--card); border:1px solid var(--border); border-radius:10px; font-size:.82rem; color:var(--text2); }
  .rodape h3 { font-size:.85rem; color:var(--text); font-weight:600; margin-bottom:.6rem; text-transform:uppercase; letter-spacing:.06em; }
  .rodape ul { list-style:none; padding:0; }
  .rodape li { margin:.4rem 0; }
  .rodape li strong { color:var(--text); }
  .rodape .fonte { margin-top:1rem; font-size:.75rem; color:var(--text3); font-style:italic; }
  @media (max-width:640px){ th:nth-child(n+3):not(:last-child), td:nth-child(n+3):not(:last-child){ display:none; } .card-head{flex-wrap:wrap;} .head-meta{margin-left:0;width:100%;} }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Top ${topN} Engajados</h1>
    <div class="sub">${ESCAPE_HTML(produtosLabel)} · ${ESCAPE_HTML(dataBR)} · ${(latenciaMs / 1000).toFixed(1)}s</div>
    ${exclusoesTxt}
  </div>

  ${blocosProdutos}

  <div class="rodape">
    <h3>Como o score é calculado</h3>
    <ul>${criterios}</ul>
    <div class="fonte">Fonte: Supabases dos produtos (ProAlt, Elo, Sirius) via Categoria M (db-externo, somente leitura). Não usa dados Hotmart.</div>
  </div>
</div>
</body>
</html>`;
}

// API publica: aceita um entregavel salvo (conteudo_estruturado) e devolve HTML
function renderHtmlDoEntregavel(conteudoEstruturado = {}) {
  return renderHtml({
    resultados: conteudoEstruturado.resultados || [],
    topN: conteudoEstruturado.top_n || 15,
    latenciaMs: conteudoEstruturado.latencia_total_ms || 0,
    excluidos: {
      emails: conteudoEstruturado.excluir_emails || [],
      user_ids: conteudoEstruturado.excluir_user_ids || [],
    },
    geradoEmISO: conteudoEstruturado.gerado_em || null,
  });
}

module.exports = { gerarRelatorio, rankProAlt, rankElo, rankSirius, renderHtml, renderHtmlDoEntregavel };
