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
    return { ok: true, latencia_total_ms, md, html: marsdownToSimpleHtml(md), resultados, excluidos: { emails: excluir_emails, user_ids: excluir_user_ids } };
  }
  return { ok: true, latencia_total_ms, md, resultados, excluidos: { emails: excluir_emails, user_ids: excluir_user_ids } };
}

function marsdownToSimpleHtml(md) {
  // Conversão básica markdown → HTML, sem dependências externas
  let html = md;
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  html = html.replace(/(<li>.*?<\/li>(\n<li>.*?<\/li>)*)/g, '<ol>$1</ol>');
  html = html.replace(/\n\n/g, '</p><p>');
  return `<html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}h1{color:#1a1a1a}h2{color:#333;border-bottom:2px solid #ddd;padding-bottom:5px;margin-top:30px}li{margin:5px 0}strong{color:#000}em{color:#777;font-size:0.9em}</style></head><body><p>${html}</p></body></html>`;
}

module.exports = { gerarRelatorio, rankProAlt, rankElo, rankSirius };
