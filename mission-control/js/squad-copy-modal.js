/* Mission Control — Squad Copy Modal
   Overlay para o salão dos mestres. Espelha squad-modal.js mas usa
   o motor próprio (criarEngineCopy) e roteiros próprios (ROTEIROS_COPY).

   Reutiliza CSS da .squad-overlay já existente (mesmas classes).
*/

import { criarEngineCopy, listarAgentesParaSidebar, COPY_FONTES, COPY_MESTRES_DEFAULT } from './squad-copy-animation.js?v=20260508a';
import { ROTEIROS_COPY } from './squad-copy-roteiros.js?v=20260508a';

// V2.5 — `mestresSlugs` opcional. Se nao vier, usa o default V2.4 (4 mestres).
export async function abrirSquadCopyModal({ roteiro, apiCall, titulo, subtitulo, pedido, mestresSlugs }) {
  const roteiroFn = ROTEIROS_COPY[roteiro];
  if (!roteiroFn) throw new Error(`Roteiro de copy '${roteiro}' nao encontrado`);

  // ============================== MONTAR DOM ==============================
  const overlay = document.createElement('div');
  overlay.className = 'squad-overlay';
  overlay.innerHTML = `
    <div class="squad-modal">
      <div class="squad-header">
        <div>
          <div class="squad-badge">Salão dos Mestres · Pipeline Criativo</div>
          <h2 class="squad-title">${escapeHTML(titulo || 'Gerando copy')}</h2>
          <div class="squad-subtitle">${escapeHTML(subtitulo || '')}</div>
        </div>
        <div class="squad-close-hint">Não feche a aba</div>
      </div>
      <div class="squad-body">
        <div class="squad-canvas-wrap">
          <canvas class="squad-canvas" width="960" height="600"></canvas>
        </div>
        <aside class="squad-panel">
          <div class="squad-panel-block">
            <div class="squad-panel-title">Status</div>
            <div class="squad-statusbar" id="squad-copy-statusbar">Aguardando pedido...</div>
            <div class="squad-counters">
              <div><span class="squad-counter-num" id="squad-copy-c-elapsed">0s</span><span class="squad-counter-label">Tempo</span></div>
              <div><span class="squad-counter-num" id="squad-copy-c-steps">0</span><span class="squad-counter-label">Etapas</span></div>
              <div><span class="squad-counter-num" id="squad-copy-c-mestres">0<span class="squad-counter-total" id="squad-copy-c-mestres-total">/0</span></span><span class="squad-counter-label">Mestres</span></div>
            </div>
          </div>
          <div class="squad-panel-block">
            <div class="squad-panel-title">Log de atividade</div>
            <div class="squad-log" id="squad-copy-log"></div>
          </div>
          <div class="squad-panel-block">
            <div class="squad-panel-title">Mestres convocados</div>
            <div class="squad-agent-list" id="squad-copy-agents"></div>
          </div>
        </aside>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // V2.5 — popula sidebar com a lista dinamica de mestres (vinda do backend ou default)
  const agentesParaSidebar = listarAgentesParaSidebar(mestresSlugs);
  const totalMestres = agentesParaSidebar.length - 1; // -1 pelo Atendente
  const totalEl = overlay.querySelector('#squad-copy-c-mestres-total');
  if (totalEl) totalEl.textContent = `/${totalMestres}`;

  const agentsEl = overlay.querySelector('#squad-copy-agents');
  agentesParaSidebar.forEach(a => {
    const row = document.createElement('div');
    row.className = 'squad-agent-item';
    row.id = `squad-copy-agent-${a.id}`;
    const corBadge = a.id === 'atendente' ? '#E85C00' : (a.shirt === '#ffffff' ? '#dc2626' : a.shirt);
    const inicial = a.nome.charAt(0).toUpperCase();
    row.innerHTML = `
      <div class="squad-agent-avatar" style="background: ${corBadge}33; border: 1.5px solid ${corBadge}; color: ${corBadge}; font-weight: bold;">${inicial}</div>
      <div class="squad-agent-info">
        <div class="squad-agent-name">${escapeHTML(a.nome)}</div>
        <div class="squad-agent-role">${escapeHTML(a.papel)}</div>
      </div>
      <div class="squad-agent-status">${a.id === 'atendente' ? 'pronto' : 'aguardando'}</div>
    `;
    agentsEl.appendChild(row);
  });

  const canvas = overlay.querySelector('.squad-canvas');
  const statusbar = overlay.querySelector('#squad-copy-statusbar');
  const logEl = overlay.querySelector('#squad-copy-log');
  const cSteps = overlay.querySelector('#squad-copy-c-steps');
  const cElapsed = overlay.querySelector('#squad-copy-c-elapsed');
  const cMestres = overlay.querySelector('#squad-copy-c-mestres');

  // Cria engine — V2.5 passa lista de mestres dinamica (default = 4 hardcoded)
  const engineRaw = criarEngineCopy(canvas, mestresSlugs);

  // Wrappers que sincronizam UI lateral com estado da engine.
  // Quando um mestre vira visível, marca como "convocado" no painel.
  const engine = {
    ...engineRaw,
    setVisivel: (id, visivel) => {
      engineRaw.setVisivel(id, visivel);
      const row = overlay.querySelector(`#squad-copy-agent-${id}`);
      if (row) {
        row.classList.toggle('squad-agent-ativo', visivel && id !== 'atendente');
        const status = row.querySelector('.squad-agent-status');
        if (status && visivel && id !== 'atendente') {
          status.textContent = 'convocado';
          atualizarContadorMestres();
        }
      }
    },
    setState: (id, state) => {
      engineRaw.setState(id, state);
      const row = overlay.querySelector(`#squad-copy-agent-${id}`);
      const status = row?.querySelector('.squad-agent-status');
      if (status) {
        if (state === 'working') status.textContent = 'escrevendo';
        else if (state === 'done') status.textContent = 'entregou';
        else if (state === 'sitting') status.textContent = 'sentou';
      }
    },
  };

  function atualizarContadorMestres() {
    const ativos = overlay.querySelectorAll('.squad-agent-ativo').length;
    cMestres.innerHTML = `${ativos}<span class="squad-counter-total">/${totalMestres}</span>`;
  }

  const t0 = Date.now();
  const elapsedTimer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    cElapsed.textContent = s + 's';
  }, 500);

  let etapas = 0;
  function setStatus(texto) {
    statusbar.innerHTML = texto;
    etapas++;
    cSteps.textContent = etapas;
  }
  function log(autor, texto, tipo) {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const line = document.createElement('div');
    line.className = `squad-log-line ${tipo || 'info'}`;
    line.innerHTML = `<span class="squad-log-time">${h}:${m}:${s}</span> <span class="squad-log-author">${escapeHTML(autor)}:</span> ${escapeHTML(texto)}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ============================== EXECUTA ROTEIRO ==============================
  try {
    const result = await roteiroFn({ engine, log, setStatus, apiCall, pedido });
    setStatus('<span style="color:#10b981">✅ Copy entregue!</span>');
    await new Promise(r => setTimeout(r, 1200));
    clearInterval(elapsedTimer);
    engine.destroy();
    overlay.classList.add('squad-closing');
    await new Promise(r => setTimeout(r, 260));
    overlay.remove();
    return result;
  } catch (e) {
    clearInterval(elapsedTimer);
    statusbar.innerHTML = `<span style="color:#FF5555">Falha: ${escapeHTML(e.message || String(e))}</span>`;
    log('Sistema', `Erro: ${e.message || e}`, 'final');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost squad-error-close';
    closeBtn.textContent = 'Fechar';
    closeBtn.onclick = () => { engine.destroy(); overlay.remove(); };
    overlay.querySelector('.squad-header').appendChild(closeBtn);
    throw e;
  }
}

/* ============================================================
   API publica — dispara animação em paralelo ao processo real.
   Igual a iniciarSquadParalelo do squad-modal.js, mas pra copy.
   - Toggle pinguim_squad_animacao continua sendo o mesmo
   - Off = no-op (chamador continua sem precisar de if)
   ============================================================ */
export function iniciarSquadCopyParalelo({ pedido, titulo, subtitulo, mestresSlugs }) {
  const squadOn = localStorage.getItem('pinguim_squad_animacao') === 'on';
  if (!squadOn) return { sinalizarConclusao: () => {}, sinalizarErro: () => {} };

  let resolveExt, rejectExt;
  const promiseExt = new Promise((res, rej) => { resolveExt = res; rejectExt = rej; });

  abrirSquadCopyModal({
    roteiro: 'gerarCopy',
    titulo: titulo || 'Gerando copy',
    subtitulo: subtitulo || '',
    pedido,
    mestresSlugs, // V2.5 — opcional; se nao vier, modal usa default
    apiCall: () => promiseExt,
  }).catch(() => { /* erro do squad nao bloqueia o chamador */ });

  return {
    sinalizarConclusao: (resultado) => resolveExt(resultado || { ok: true }),
    sinalizarErro: (e) => rejectExt(e),
  };
}

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
