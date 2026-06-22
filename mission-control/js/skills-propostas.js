/* Skills Propostas — tela do MC pro Codina revisar skills que socios criaram
   localmente no Claude Code deles e querem que outros usem.

   Mostra tambem tickets abertos via tool-abrir-ticket-codina.
*/

import { getSupabaseClient } from './sb-client.js?v=20260622a';

const SOCIOS = {
  codina:  { nome: 'Codina',  emoji: '🐬' },
  pedro:   { nome: 'Pedro',   emoji: '🔷' },
  luiz:    { nome: 'Luiz',    emoji: '🟠' },
  micha:   { nome: 'Micha',   emoji: '🟢' },
};

const STATUS_SKILL = {
  pendente:    { label: 'Pendente',    cor: '#E85D1F' },
  em_revisao:  { label: 'Em revisão',  cor: '#E85D1F' },
  aprovada:    { label: 'Aprovada',    cor: '#1F7A3A' },
  rejeitada:   { label: 'Rejeitada',   cor: '#6B6B6B' },
};

const STATUS_TICKET = {
  aberto:        { label: 'Aberto',         cor: '#E85D1F' },
  em_andamento:  { label: 'Em andamento',   cor: '#0EA5E9' },
  resolvido:     { label: 'Resolvido',      cor: '#1F7A3A' },
  rejeitado:     { label: 'Rejeitado',      cor: '#6B6B6B' },
  arquivado:     { label: 'Arquivado',      cor: '#6B6B6B' },
};

const TIPO_TICKET_LABEL = {
  tool_nova:   'Tool nova',
  integracao:  'Integração',
  bug:         'Bug',
  duvida:      'Dúvida',
  feature:     'Feature',
};

const PRIORIDADE_COR = {
  baixa:    '#6B6B6B',
  media:    '#0EA5E9',
  alta:     '#E85D1F',
  urgente:  '#DC2626',
};

let abaAtiva = 'skills'; // skills | tickets
let filtroStatus = 'pendente';

export async function renderSkillsPropostas() {
  const page = document.getElementById('page-skills-propostas');
  if (!page) return;

  page.innerHTML = renderShell();
  bindEventos();
  await carregarConteudo();
}

function renderShell() {
  return `
    <div class="sp-wrap" style="padding:24px;max-width:1120px;margin:0 auto">
      <header style="margin-bottom:24px">
        <h1 style="font-size:1.75rem;font-weight:600;letter-spacing:-0.02em;margin-bottom:4px">Skills propostas & Tickets</h1>
        <p style="color:var(--muted);font-size:0.9375rem">Skills que Pedro/Luiz/Micha criaram no Claude Code deles + tickets de tool nova / bug / dúvida.</p>
      </header>

      <div class="sp-tabs" style="display:flex;gap:8px;border-bottom:1px solid var(--line);margin-bottom:20px">
        <button class="sp-tab" data-aba="skills" style="padding:10px 16px;border:none;background:none;font-size:0.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px">Skills propostas <span id="sp-count-skills" style="color:var(--muted)"></span></button>
        <button class="sp-tab" data-aba="tickets" style="padding:10px 16px;border:none;background:none;font-size:0.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px">Tickets <span id="sp-count-tickets" style="color:var(--muted)"></span></button>
      </div>

      <div class="sp-filtros" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
        <button class="sp-chip" data-status="pendente">Pendentes</button>
        <button class="sp-chip" data-status="todos">Todos</button>
        <button class="sp-chip" data-status="aprovada">Aprovadas / Resolvidos</button>
        <button class="sp-chip" data-status="rejeitada">Rejeitadas</button>
      </div>

      <div id="sp-conteudo"></div>
    </div>
  `;
}

function bindEventos() {
  const page = document.getElementById('page-skills-propostas');
  page.querySelectorAll('.sp-tab').forEach(t => {
    t.addEventListener('click', async () => {
      abaAtiva = t.dataset.aba;
      atualizarVisualAbas();
      await carregarConteudo();
    });
  });
  page.querySelectorAll('.sp-chip').forEach(c => {
    c.addEventListener('click', async () => {
      filtroStatus = c.dataset.status;
      atualizarVisualChips();
      await carregarConteudo();
    });
  });
  atualizarVisualAbas();
  atualizarVisualChips();
}

function atualizarVisualAbas() {
  document.querySelectorAll('.sp-tab').forEach(t => {
    const ativo = t.dataset.aba === abaAtiva;
    t.style.color = ativo ? 'var(--text)' : 'var(--muted)';
    t.style.borderBottomColor = ativo ? '#E85D1F' : 'transparent';
  });
}

function atualizarVisualChips() {
  document.querySelectorAll('.sp-chip').forEach(c => {
    const ativo = c.dataset.status === filtroStatus;
    c.style.cssText = `padding:6px 12px;font-size:0.8125rem;border-radius:999px;cursor:pointer;font-family:inherit;border:1px solid var(--line);transition:all 150ms ease;${ativo ? 'background:var(--text);color:var(--bg);border-color:var(--text)' : 'background:var(--surface);color:var(--text)'}`;
  });
}

async function carregarConteudo() {
  const sb = getSupabaseClient();
  const conteudo = document.getElementById('sp-conteudo');
  conteudo.innerHTML = '<div style="padding:48px;text-align:center;color:var(--muted)">Carregando…</div>';

  if (abaAtiva === 'skills') {
    let query = sb.schema('pinguim').from('skills_propostas').select('*').order('criada_em', { ascending: false });
    if (filtroStatus === 'pendente') query = query.in('status', ['pendente','em_revisao']);
    else if (filtroStatus === 'aprovada') query = query.eq('status', 'aprovada');
    else if (filtroStatus === 'rejeitada') query = query.eq('status', 'rejeitada');
    const { data, error } = await query;
    if (error) { conteudo.innerHTML = `<div style="padding:24px;color:var(--status-alerta)">Erro: ${error.message}</div>`; return; }
    renderSkills(data || []);
    atualizarContadores('skills', data?.length || 0);
  } else {
    let query = sb.schema('pinguim').from('tickets_codina').select('*').order('criado_em', { ascending: false });
    if (filtroStatus === 'pendente') query = query.in('status', ['aberto','em_andamento']);
    else if (filtroStatus === 'aprovada') query = query.eq('status', 'resolvido');
    else if (filtroStatus === 'rejeitada') query = query.in('status', ['rejeitado','arquivado']);
    const { data, error } = await query;
    if (error) { conteudo.innerHTML = `<div style="padding:24px;color:var(--status-alerta)">Erro: ${error.message}</div>`; return; }
    renderTickets(data || []);
    atualizarContadores('tickets', data?.length || 0);
  }
}

function atualizarContadores(tipo, n) {
  const el = document.getElementById('sp-count-' + tipo);
  if (el) el.textContent = `(${n})`;
}

function renderSkills(skills) {
  const conteudo = document.getElementById('sp-conteudo');
  if (!skills.length) {
    conteudo.innerHTML = `<div style="padding:48px;text-align:center;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:12px"><strong style="display:block;margin-bottom:6px;color:var(--text)">Nenhuma skill proposta com esse filtro.</strong>Quando um sócio criar skill no Claude Code dele e pedir "exporta pro MC", ela aparece aqui.</div>`;
    return;
  }
  conteudo.innerHTML = skills.map(s => {
    const socio = SOCIOS[s.socio_slug] || { nome: s.socio_slug, emoji: '👤' };
    const status = STATUS_SKILL[s.status] || { label: s.status, cor: '#6B6B6B' };
    const data = new Date(s.criada_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    return `
      <article style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:12px">
        <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:1.25rem">${socio.emoji}</span>
              <strong style="font-size:1rem">${escapeHtml(s.skill_nome)}</strong>
              <span style="font-size:0.6875rem;padding:2px 8px;border-radius:999px;background:${status.cor}15;color:${status.cor};font-weight:600;letter-spacing:0.04em;text-transform:uppercase;font-family:'JetBrains Mono',monospace">${status.label}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${socio.nome} · ${data}</div>
          </div>
          ${s.status === 'pendente' || s.status === 'em_revisao' ? `
            <div style="display:flex;gap:6px">
              <button data-acao="aprovar" data-id="${s.id}" data-nome="${escapeAttr(s.skill_nome)}" style="padding:6px 12px;font-size:0.8125rem;background:#1F7A3A;color:white;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:500">Aprovar</button>
              <button data-acao="rejeitar" data-id="${s.id}" style="padding:6px 12px;font-size:0.8125rem;background:var(--surface);color:var(--muted);border:1px solid var(--line);border-radius:8px;cursor:pointer;font-family:inherit">Rejeitar</button>
            </div>
          ` : ''}
        </header>

        ${s.descricao_curta ? `<p style="font-size:0.875rem;color:var(--text);margin-bottom:10px;line-height:1.55">${escapeHtml(s.descricao_curta)}</p>` : ''}
        ${s.contexto_uso ? `<p style="font-size:0.8125rem;color:var(--muted);margin-bottom:12px;line-height:1.55"><strong>Por que ele acha útil pros outros:</strong> ${escapeHtml(s.contexto_uso)}</p>` : ''}

        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-size:0.8125rem;color:var(--muted)">Ver SKILL.md (${s.skill_md.length} chars)</summary>
          <pre style="margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:0.75rem;line-height:1.5;background:var(--bg);padding:14px;border-radius:8px;white-space:pre-wrap;word-wrap:break-word;max-height:400px;overflow:auto">${escapeHtml(s.skill_md)}</pre>
        </details>

        ${s.feedback_codina ? `<div style="margin-top:10px;padding:10px 12px;background:var(--bg);border-left:3px solid #E85D1F;border-radius:6px;font-size:0.8125rem"><strong>Feedback do Codina:</strong> ${escapeHtml(s.feedback_codina)}</div>` : ''}
      </article>
    `;
  }).join('');

  // bind botoes aprovar / rejeitar
  document.querySelectorAll('[data-acao="aprovar"]').forEach(b => {
    b.addEventListener('click', () => acaoAprovar(b.dataset.id, b.dataset.nome));
  });
  document.querySelectorAll('[data-acao="rejeitar"]').forEach(b => {
    b.addEventListener('click', () => acaoRejeitar(b.dataset.id));
  });
}

function renderTickets(tickets) {
  const conteudo = document.getElementById('sp-conteudo');
  if (!tickets.length) {
    conteudo.innerHTML = `<div style="padding:48px;text-align:center;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:12px"><strong style="display:block;margin-bottom:6px;color:var(--text)">Nenhum ticket com esse filtro.</strong>Quando um sócio pedir algo que precisa de tool/feature nova, o Pinguim abre ticket aqui automaticamente.</div>`;
    return;
  }
  conteudo.innerHTML = tickets.map(t => {
    const socio = SOCIOS[t.socio_slug] || { nome: t.socio_slug, emoji: '👤' };
    const status = STATUS_TICKET[t.status] || { label: t.status, cor: '#6B6B6B' };
    const tipoLabel = TIPO_TICKET_LABEL[t.tipo] || t.tipo;
    const corPrio = PRIORIDADE_COR[t.prioridade] || '#6B6B6B';
    const data = new Date(t.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const shortId = t.id.slice(0, 8);
    return `
      <article style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:12px">
        <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
              <span style="font-size:0.625rem;padding:2px 8px;border-radius:999px;background:${corPrio}15;color:${corPrio};font-weight:600;letter-spacing:0.04em;text-transform:uppercase;font-family:'JetBrains Mono',monospace">${t.prioridade}</span>
              <span style="font-size:0.6875rem;padding:2px 8px;border-radius:4px;background:var(--bg);color:var(--muted);font-family:'JetBrains Mono',monospace">${tipoLabel}</span>
              <strong style="font-size:0.9375rem">${escapeHtml(t.titulo)}</strong>
              <span style="font-size:0.6875rem;padding:2px 8px;border-radius:999px;background:${status.cor}15;color:${status.cor};font-weight:600;text-transform:uppercase;font-family:'JetBrains Mono',monospace">${status.label}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${socio.emoji} ${socio.nome} · ${data} · #${shortId}</div>
          </div>
          ${t.status === 'aberto' || t.status === 'em_andamento' ? `
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button data-acao-tk="andamento" data-id="${t.id}" style="padding:6px 12px;font-size:0.8125rem;background:#0EA5E9;color:white;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:500">Em andamento</button>
              <button data-acao-tk="resolver" data-id="${t.id}" style="padding:6px 12px;font-size:0.8125rem;background:#1F7A3A;color:white;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:500">Resolver</button>
              <button data-acao-tk="arquivar" data-id="${t.id}" style="padding:6px 12px;font-size:0.8125rem;background:var(--surface);color:var(--muted);border:1px solid var(--line);border-radius:8px;cursor:pointer;font-family:inherit">Arquivar</button>
            </div>
          ` : ''}
        </header>

        <p style="font-size:0.875rem;color:var(--text);margin-bottom:10px;line-height:1.55;white-space:pre-wrap">${escapeHtml(t.descricao)}</p>
        ${t.contexto_pedido ? `<p style="font-size:0.8125rem;color:var(--muted);margin-bottom:10px;line-height:1.55;padding-left:12px;border-left:2px solid var(--line)"><strong>Contexto:</strong> ${escapeHtml(t.contexto_pedido)}</p>` : ''}
        ${t.resposta_codina ? `<div style="margin-top:10px;padding:10px 12px;background:var(--bg);border-left:3px solid #1F7A3A;border-radius:6px;font-size:0.8125rem"><strong>Resposta:</strong> ${escapeHtml(t.resposta_codina)}</div>` : ''}
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-acao-tk]').forEach(b => {
    b.addEventListener('click', () => acaoTicket(b.dataset.id, b.dataset.acaoTk));
  });
}

async function acaoAprovar(id, nome) {
  const ok = confirm(`Aprovar skill "${nome}"?\n\nIsso marca como aprovada. Voce ainda precisa COLAR o MD em c:/Squad/cerebro/skills/${nome}/SKILL.md no repo, commitar e pushar pra disponibilizar pros 4 socios na proxima atualizacao automatica (06h).`);
  if (!ok) return;
  const sb = getSupabaseClient();
  const { error } = await sb.schema('pinguim').from('skills_propostas')
    .update({ status: 'aprovada', aprovada_em: new Date().toISOString(), revisada_em: new Date().toISOString() })
    .eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  await carregarConteudo();
}

async function acaoRejeitar(id) {
  const motivo = prompt('Por que tá rejeitando? (motivo vai pro socio ver)');
  if (motivo === null) return;
  const sb = getSupabaseClient();
  const { error } = await sb.schema('pinguim').from('skills_propostas')
    .update({ status: 'rejeitada', feedback_codina: motivo, revisada_em: new Date().toISOString() })
    .eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  await carregarConteudo();
}

async function acaoTicket(id, acao) {
  const sb = getSupabaseClient();
  const novoStatus = { andamento: 'em_andamento', resolver: 'resolvido', arquivar: 'arquivado' }[acao];
  const atualiza = { status: novoStatus };
  if (acao === 'resolver') {
    const resp = prompt('Resposta pro socio (opcional):');
    if (resp) atualiza.resposta_codina = resp;
    atualiza.resolvido_em = new Date().toISOString();
  }
  const { error } = await sb.schema('pinguim').from('tickets_codina').update(atualiza).eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  await carregarConteudo();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/\n/g, '\\n');
}
