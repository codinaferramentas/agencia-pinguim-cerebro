/**
 * Modal de auditoria do Squad Cyber.
 *
 * Diferente do squad-modal.js (canvas pixel-art dos sócios Pinguim), este é
 * um modal especifico pra Squad Cyber — 6 conselheiros (Kim, Weidman, Manico,
 * Carey, Santos, Sanders) trabalhando enquanto a Edge Function `auditar-seguranca`
 * roda.
 *
 * Visual: 6 cards com avatar + status (idle/working/done/erro) + log live
 * com falas dos conselheiros usando voz real (extraida dos SOULs).
 */

const CONSELHEIROS = [
  {
    id: 'kim',
    nome: 'Peter Kim',
    role: 'Red Team · The Hacker Playbook',
    emoji: '🛡',
    cor: '#ef4444',
    falas: [
      'Iniciando red team. Vou pensar como atacante.',
      'Procurando endpoints expostos sem auth...',
      'Testando IDOR — request injection em URLs.',
      'Simulando F12 — vendo o que vaza no Network tab.',
    ],
  },
  {
    id: 'weidman',
    nome: 'Georgia Weidman',
    role: 'Penetration Testing',
    emoji: '🔓',
    cor: '#f59e0b',
    falas: [
      'Defesa em profundidade. Conferindo cada camada.',
      'Princípio do menor privilégio em todas as chaves.',
      'Auditando RLS por linha em cada tabela.',
      'Validando que cada policy bate com o caso de uso.',
    ],
  },
  {
    id: 'manico',
    nome: 'Jim Manico',
    role: 'OWASP · Secure Coding',
    emoji: '🔐',
    cor: '#10b981',
    falas: [
      'Rodando OWASP Top 10 contra o sistema.',
      'Validando input de cada Edge Function.',
      'Checando funções SECURITY DEFINER têm search_path.',
      'Secure by design. Nada por padrão é confiável.',
    ],
  },
  {
    id: 'carey',
    nome: 'Marcus Carey',
    role: 'Threat Intelligence',
    emoji: '🎯',
    cor: '#3b82f6',
    falas: [
      'Coleta → análise → disseminação → feedback.',
      'Lendo logs do Vercel e Supabase das últimas 6h.',
      'Identificando padrões de ataque conhecidos.',
      'Cruzando IPs com base de threat intel.',
    ],
  },
  {
    id: 'santos',
    nome: 'Omar Santos',
    role: 'Cisco · Zero Trust',
    emoji: '⚔',
    cor: '#a855f7',
    falas: [
      'Zero Trust. Nenhuma requisição é confiável.',
      'Validando JWT em cada Edge Function.',
      'Auditando allowlist das tools dos agentes.',
      'Verificando escopo mínimo das chaves.',
    ],
  },
  {
    id: 'sanders',
    nome: 'Chris Sanders',
    role: 'Intrusion Detection',
    emoji: '👁',
    cor: '#06b6d4',
    falas: [
      'Comparando tráfego com baseline de 7 dias.',
      'Estabelecendo baseline do comportamento normal.',
      'Procurando desvios significativos.',
      'Anomalia vira incidente, incidente vira ação.',
    ],
  },
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  });
  return n;
}

/**
 * Abre o modal de auditoria do Squad Cyber e dispara o roteiro em paralelo
 * com a chamada real `apiCall()` (que executa a Edge Function auditar-seguranca).
 *
 * @returns Promise<resultado da auditoria>
 */
export async function abrirSquadCyberModal({ titulo, subtitulo, apiCall }) {
  const back = el('div', { class: 'squad-cyber-back' });
  const card = el('div', { class: 'squad-cyber-card' });
  function fechar() {
    back.classList.remove('squad-cyber-visible');
    setTimeout(() => back.remove(), 300);
  }

  // Header
  const header = el('div', { class: 'squad-cyber-header' }, [
    el('div', {}, [
      el('div', { class: 'squad-cyber-eyebrow' }, '🛡 Squad Cyber'),
      el('div', { class: 'squad-cyber-titulo' }, titulo || 'Auditoria de segurança'),
      subtitulo ? el('div', { class: 'squad-cyber-sub' }, subtitulo) : null,
    ]),
    el('button', { class: 'squad-cyber-close', onclick: fechar, title: 'Fechar' }, '×'),
  ]);

  // Cards dos conselheiros
  const cardsRow = el('div', { class: 'squad-cyber-conselheiros' });
  const cardEls = {};
  CONSELHEIROS.forEach(c => {
    const cardEl = el('div', { class: 'squad-cyber-conselheiro idle', style: `--cyber-cor:${c.cor}` }, [
      el('div', { class: 'squad-cyber-avatar' }, c.emoji),
      el('div', { class: 'squad-cyber-conselheiro-info' }, [
        el('div', { class: 'squad-cyber-conselheiro-nome' }, c.nome),
        el('div', { class: 'squad-cyber-conselheiro-role' }, c.role),
      ]),
      el('div', { class: 'squad-cyber-status-dot' }),
    ]);
    cardEls[c.id] = cardEl;
    cardsRow.appendChild(cardEl);
  });

  // Bolha de fala (uma global, troca de cor + posicao)
  const bolha = el('div', { class: 'squad-cyber-bolha' });

  // Log
  const logArea = el('div', { class: 'squad-cyber-log' });
  function pushLog(autor, msg, tipo = 'info') {
    const linha = el('div', { class: `squad-cyber-log-linha squad-cyber-log-${tipo}` }, [
      el('span', { class: 'squad-cyber-log-autor' }, autor),
      el('span', { class: 'squad-cyber-log-msg' }, msg),
    ]);
    logArea.appendChild(linha);
    logArea.scrollTop = logArea.scrollHeight;
  }

  // Progresso
  const progressoTxt = el('div', { class: 'squad-cyber-progresso-txt' }, '0 / 4 checks rodando');
  const progressoBar = el('div', { class: 'squad-cyber-progresso-bg' }, [
    el('div', { class: 'squad-cyber-progresso-fg', style: 'width:0%' }),
  ]);

  card.append(header, cardsRow, bolha, progressoBar, progressoTxt, logArea);
  back.appendChild(card);
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('squad-cyber-visible'));

  // === Roteiro animado ===
  function setStatus(id, status) {
    const c = cardEls[id];
    if (!c) return;
    c.classList.remove('idle', 'working', 'done', 'erro');
    c.classList.add(status);
  }
  function falar(id, msg) {
    const c = CONSELHEIROS.find(x => x.id === id);
    if (!c) return;
    const cardEl = cardEls[id];
    const r = cardEl.getBoundingClientRect();
    const containerR = card.getBoundingClientRect();
    bolha.textContent = msg;
    bolha.style.left = (r.left - containerR.left + r.width / 2 - 80) + 'px';
    bolha.style.top = (r.top - containerR.top + r.height + 8) + 'px';
    bolha.style.borderColor = c.cor;
    bolha.classList.add('squad-cyber-bolha-visible');
    setTimeout(() => bolha.classList.remove('squad-cyber-bolha-visible'), 1800);
  }
  function setProgresso(checksFeitos, total) {
    const pct = total > 0 ? Math.round((checksFeitos / total) * 100) : 0;
    progressoTxt.textContent = `${checksFeitos} / ${total} checks`;
    progressoBar.firstChild.style.width = pct + '%';
  }

  // Total de checks padrao (RLS + policies + security_definer + incidentes)
  setProgresso(0, 4);

  // Inicia 6 conselheiros em sequencia, todos working
  let resultadoAuditoria = null;
  let erroAuditoria = null;

  // Dispara API real em paralelo
  const apiPromise = apiCall().then(r => { resultadoAuditoria = r; }).catch(e => { erroAuditoria = e; });

  // Roteiro: cada conselheiro entra, fala, marca como working ou done
  // baseado no que retorna da API
  for (let i = 0; i < CONSELHEIROS.length; i++) {
    const c = CONSELHEIROS[i];
    setStatus(c.id, 'working');
    falar(c.id, c.falas[0]);
    pushLog(c.nome, c.falas[0], 'working');
    await delay(700);
  }

  // Aguarda API real
  while (resultadoAuditoria === null && erroAuditoria === null) {
    // Roteiro de fundo: cada conselheiro fala uma frase aleatoria
    const c = CONSELHEIROS[Math.floor(Math.random() * CONSELHEIROS.length)];
    const frase = c.falas[Math.floor(Math.random() * c.falas.length)];
    falar(c.id, frase);
    await delay(1200);
  }

  if (erroAuditoria) {
    CONSELHEIROS.forEach(c => setStatus(c.id, 'erro'));
    pushLog('Sistema', `Erro: ${erroAuditoria.message || erroAuditoria}`, 'erro');
    setProgresso(0, 4);
    await delay(2200);
    fechar();
    throw erroAuditoria;
  }

  // Marca todos como done + mostra resumo dos checks
  CONSELHEIROS.forEach(c => setStatus(c.id, 'done'));
  const r = resultadoAuditoria;
  if (r && Array.isArray(r.checks)) {
    setProgresso(r.checks.length, r.checks.length);
    r.checks.forEach((chk) => {
      const tipo = chk.status === 'ok' ? 'done' : (chk.status === 'critical' ? 'erro' : 'aviso');
      pushLog('Resultado', `${chk.tipo}: ${chk.resumo}`, tipo);
    });
    const status = r.status_geral === 'ok' ? 'done' : (r.status_geral === 'critical' ? 'erro' : 'aviso');
    pushLog('Squad Cyber', `Auditoria concluída em ${r.duracao_ms}ms — status geral: ${r.status_geral.toUpperCase()}`, status);
  } else {
    setProgresso(4, 4);
    pushLog('Squad Cyber', 'Auditoria concluída.', 'done');
  }

  await delay(2500);
  fechar();
  return resultadoAuditoria;
}
