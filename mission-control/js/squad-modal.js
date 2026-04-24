/* Mission Control — Squad Modal
   Monta o overlay (canvas + painel lateral com log/agentes/status),
   instancia a engine, roda o roteiro escolhido e retorna a promise final.
*/

import { criarEngine, SQUAD_AGENTS } from './squad-animation.js?v=20260424h';
import { ROTEIROS } from './squad-roteiros.js?v=20260424h';

export async function abrirSquadModal({ roteiro, apiCall, titulo, subtitulo, cerebroNome }) {
  const roteiroFn = ROTEIROS[roteiro];
  if (!roteiroFn) throw new Error(`Roteiro ${roteiro} nao encontrado`);

  // Monta DOM
  const overlay = document.createElement('div');
  overlay.className = 'squad-overlay';
  overlay.innerHTML = `
    <div class="squad-modal">
      <div class="squad-header">
        <div>
          <div class="squad-badge">Squad em acao</div>
          <h2 class="squad-title">${escapeHTML(titulo || 'Processando')}</h2>
          <div class="squad-subtitle">${escapeHTML(subtitulo || '')}</div>
        </div>
        <div class="squad-close-hint">Nao feche a aba</div>
      </div>
      <div class="squad-body">
        <div class="squad-canvas-wrap">
          <canvas class="squad-canvas" width="960" height="600"></canvas>
        </div>
        <aside class="squad-panel">
          <div class="squad-panel-block">
            <div class="squad-panel-title">Status</div>
            <div class="squad-statusbar" id="squad-statusbar">Aguardando...</div>
            <div class="squad-counters">
              <div><span class="squad-counter-num" id="squad-c-elapsed">0s</span><span class="squad-counter-label">Tempo</span></div>
              <div><span class="squad-counter-num" id="squad-c-steps">0</span><span class="squad-counter-label">Etapas</span></div>
              <div><span class="squad-counter-num" id="squad-c-ativos">0<span class="squad-counter-total">/${SQUAD_AGENTS.length}</span></span><span class="squad-counter-label">Na missao</span></div>
            </div>
          </div>
          <div class="squad-panel-block">
            <div class="squad-panel-title">Log de atividade</div>
            <div class="squad-log" id="squad-log"></div>
          </div>
          <div class="squad-panel-block">
            <div class="squad-panel-title">Equipe Pinguim</div>
            <div class="squad-agent-list" id="squad-agents"></div>
          </div>
        </aside>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Popula lista de agentes
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
      <div class="squad-agent-status">em dia a dia</div>
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

  // Wrapper: intercepta setProtagonists pra atualizar UI (contador + status dos itens)
  const engine = {
    ...engineRaw,
    setProtagonists: (ids) => {
      engineRaw.setProtagonists(ids);
      // Atualiza contador "Na missao"
      if (cAtivos) cAtivos.innerHTML = `${ids.length}<span class="squad-counter-total">/${SQUAD_AGENTS.length}</span>`;
      // Atualiza status visual de cada item na lista de agentes
      SQUAD_AGENTS.forEach(a => {
        const row = overlay.querySelector(`#squad-agent-${a.id}`);
        if (!row) return;
        const isAtivo = ids.includes(a.id);
        row.classList.toggle('squad-agent-ativo', isAtivo);
        const status = row.querySelector('.squad-agent-status');
        if (status) status.textContent = isAtivo ? 'na missao' : 'em dia a dia';
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
    const result = await roteiroFn({ engine, log, setStatus, apiCall, cerebroNome });
    // Finalizacao suave
    setStatus('<span style="color:#10b981">✅ Entrega concluida!</span>');
    await new Promise(r => setTimeout(r, 800));
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
    // Adiciona botao pra fechar em caso de erro
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost squad-error-close';
    closeBtn.textContent = 'Fechar';
    closeBtn.onclick = () => { engine.destroy(); overlay.remove(); };
    overlay.querySelector('.squad-header').appendChild(closeBtn);
    throw e;
  }
}

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
