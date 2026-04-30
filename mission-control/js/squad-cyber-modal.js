/* Mission Control — Squad Cyber Modal
   Variante do squad-modal pro contexto Cyber Security. Usa o canvas
   pixel-art em squad-cyber-animation.js (3 salas em PT-BR + 6 agentes BR).

   IMPORTANTE: NAO substitui squad-modal.js — coexiste. Cada feature
   chama o modal correto. Persona/Pacote -> squad-modal. Auditoria -> aqui.
*/

import { criarEngine, SQUAD_AGENTS } from './squad-cyber-animation.js?v=20260430j';
import { ROTEIROS_CYBER } from './squad-cyber-roteiros.js?v=20260430j';

export async function abrirSquadCyberModal({ roteiro, apiCall, titulo, subtitulo, contexto }) {
  const roteiroFn = ROTEIROS_CYBER[roteiro];
  if (!roteiroFn) throw new Error(`Roteiro Cyber ${roteiro} nao encontrado`);

  const overlay = document.createElement('div');
  overlay.className = 'squad-overlay';
  overlay.innerHTML = `
    <div class="squad-modal">
      <div class="squad-header">
        <div>
          <div class="squad-badge" style="background:#ef444433;color:#ef4444;border-color:#ef4444">🛡 Squad Cyber em ação</div>
          <h2 class="squad-title">${escapeHTML(titulo || 'Auditoria de segurança')}</h2>
          <div class="squad-subtitle">${escapeHTML(subtitulo || '')}</div>
        </div>
        <div class="squad-close-hint">Trabalho em paralelo — todos ativos</div>
      </div>
      <div class="squad-body">
        <div class="squad-canvas-wrap">
          <canvas class="squad-canvas" width="980" height="600"></canvas>
        </div>
        <aside class="squad-panel">
          <div class="squad-panel-block">
            <div class="squad-panel-title">Status</div>
            <div class="squad-statusbar" id="squad-statusbar">Aguardando squad...</div>
            <div class="squad-counters">
              <div><span class="squad-counter-num" id="squad-c-elapsed">0s</span><span class="squad-counter-label">Tempo</span></div>
              <div><span class="squad-counter-num" id="squad-c-steps">0</span><span class="squad-counter-label">Etapas</span></div>
              <div><span class="squad-counter-num" id="squad-c-ativos">0<span class="squad-counter-total">/${SQUAD_AGENTS.length}</span></span><span class="squad-counter-label">Na missão</span></div>
            </div>
          </div>
          <div class="squad-panel-block">
            <div class="squad-panel-title">Log de auditoria</div>
            <div class="squad-log" id="squad-log"></div>
          </div>
          <div class="squad-panel-block">
            <div class="squad-panel-title">Squad Cyber Pinguim</div>
            <div class="squad-agent-list" id="squad-agents"></div>
          </div>
        </aside>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const agentsEl = overlay.querySelector('#squad-agents');
  SQUAD_AGENTS.forEach(a => {
    const row = document.createElement('div');
    row.className = 'squad-agent-item';
    row.id = `squad-agent-${a.id}`;
    row.innerHTML = `
      <div class="squad-agent-avatar" style="background: ${a.shirt}33; border: 1.5px solid ${a.shirt}">${a.emoji}</div>
      <div class="squad-agent-info">
        <div class="squad-agent-name">${a.name}</div>
        <div class="squad-agent-role">${a.role}</div>
      </div>
      <div class="squad-agent-status">de prontidão</div>
    `;
    agentsEl.appendChild(row);
  });

  const canvas = overlay.querySelector('.squad-canvas');
  const statusbar = overlay.querySelector('#squad-statusbar');
  const logEl = overlay.querySelector('#squad-log');
  const cSteps = overlay.querySelector('#squad-c-steps');
  const cElapsed = overlay.querySelector('#squad-c-elapsed');
  const cAtivos = overlay.querySelector('#squad-c-ativos');

  const engineRaw = criarEngine(canvas);

  // Wrapper igual ao squad-modal — intercepta setProtagonists pra UI
  const engine = {
    ...engineRaw,
    setProtagonists: (ids) => {
      engineRaw.setProtagonists(ids);
      if (cAtivos) cAtivos.innerHTML = `${ids.length}<span class="squad-counter-total">/${SQUAD_AGENTS.length}</span>`;
      SQUAD_AGENTS.forEach(a => {
        const row = overlay.querySelector(`#squad-agent-${a.id}`);
        if (!row) return;
        const isAtivo = ids.includes(a.id);
        row.classList.toggle('squad-agent-ativo', isAtivo);
        const status = row.querySelector('.squad-agent-status');
        if (status) status.textContent = isAtivo ? 'em ação' : 'de prontidão';
      });
    },
  };

  const t0 = Date.now();
  const elapsedTimer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    cElapsed.textContent = s + 's';
  }, 500);

  let etapas = 0;
  function setStatus(texto) { statusbar.innerHTML = texto; etapas++; cSteps.textContent = etapas; }
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

  try {
    const result = await roteiroFn({ engine, log, setStatus, apiCall, ...(contexto || {}) });
    setStatus('<span style="color:#10b981">✅ Auditoria concluída!</span>');
    await new Promise(r => setTimeout(r, 1000));
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

// API publica: dispara em paralelo ao apiCall (igual iniciarSquadParalelo).
// Sempre roda (ignora toggle 'pinguim_squad_animacao' — auditoria de
// seguranca e visual obrigatorio do produto).
export function iniciarCyberParalelo(roteiroId, contexto) {
  let resolveExt; let rejectExt;
  const promiseExt = new Promise((res, rej) => { resolveExt = res; rejectExt = rej; });

  abrirSquadCyberModal({
    roteiro: roteiroId,
    titulo: contexto?.titulo || 'Auditoria de segurança',
    subtitulo: contexto?.subtitulo || '',
    apiCall: () => promiseExt,
    contexto,
  }).catch(() => { /* erro do modal nao bloqueia chamador */ });

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
