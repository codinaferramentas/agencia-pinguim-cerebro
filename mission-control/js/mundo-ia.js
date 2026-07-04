// ============================================================
// mundo-ia.js — aba 🌎 Mundo IA (Andre 2026-07-04)
// ============================================================
// Monitor de perfis/canais de referências (Instagram + YouTube).
// Qualquer sócio cadastra seus alvos, define WhatsApp e recebe às 7h um
// relatório com o que essas pessoas postaram nas últimas 24h + o que é
// acionável + uma cópia pronta pro grupo dos sócios.
//
// Chama as edge functions mundo-ia-gestao (CRUD) e mundo-ia-motor (via
// rodar_agora). Autenticação: sessão do sócio (Bearer JWT automático no
// functions.invoke). Multi-sócio: dono_socio = nome do sócio logado.
// ============================================================

import { getSupabase } from './sb-client.js?v=20260421p';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return n;
};

const fmtData = (s) => { try { return new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s || '—'; } };

// dono_socio: deriva do email logado (mapa simples; default primeiro nome do email).
const MAPA_SOCIO = {
  'contato@agenciapinguim.com': 'André',
  'andre@agenciapinguim.com': 'André',
  'luiz@agenciapinguim.com': 'Luiz',
  'micha@agenciapinguim.com': 'Micha',
  'pedro@agenciapinguim.com': 'Pedro',
};
let DONO = 'André';

async function resolverDono() {
  try {
    const { data } = await getSupabase().auth.getUser();
    const email = data?.user?.email || '';
    DONO = MAPA_SOCIO[email] || (email ? email.split('@')[0] : 'André');
  } catch { DONO = 'André'; }
}

async function gestao(acao, extra = {}) {
  const { data, error } = await getSupabase().functions.invoke('mundo-ia-gestao', {
    body: { acao, dono_socio: DONO, ...extra },
  });
  if (error) throw new Error(error.message || 'erro na edge mundo-ia-gestao');
  if (data && data.erro) throw new Error(data.erro);
  return data;
}

// ------------------------------------------------------------
// Render principal
// ------------------------------------------------------------
export async function renderMundoIA() {
  const page = document.getElementById('page-mundo-ia');
  if (!page) return;
  page.innerHTML = '';
  await resolverDono();

  const root = el('div', { class: 'mundo-ia-page', style: 'max-width:960px;margin:0 auto;padding:24px 20px' });
  page.appendChild(root);

  root.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:8px' }, [
    el('div', {}, [
      el('h1', { style: 'margin:0;font-size:1.5rem' }, '🌎 Mundo IA'),
      el('div', { style: 'color:var(--muted);font-size:0.875rem;margin-top:4px' },
        `Monitor de referências · ${DONO} · raspa Instagram + YouTube todo dia e te entrega às 7h`),
    ]),
    el('div', { style: 'display:flex;gap:8px' }, [
      btn('▶ Rodar agora', 'primary', async (b) => {
        b.disabled = true; b.textContent = 'Raspando + gerando…';
        try {
          await gestao('rodar_agora', { fase: 'raspagem' });
          await gestao('rodar_agora', { fase: 'envio' });
          toast('Relatório gerado! Veja em "Últimos relatórios".');
          await carregarExecucoes(execWrap);
        } catch (e) { toast('Erro: ' + e.message, true); }
        b.disabled = false; b.textContent = '▶ Rodar agora';
      }),
    ]),
  ]));

  // grid: alvos | config
  const grid = el('div', { style: 'display:grid;grid-template-columns:1fr;gap:20px;margin-top:20px' });
  root.appendChild(grid);

  const alvosCard = card('🎯 Meus alvos', 'Perfis e canais que você monitora. Adicione concorrentes/referências aqui.');
  const configCard = card('⚙️ Configuração', 'Pra onde vai o resumo e se o envio de WhatsApp está ligado.');
  const execCard = card('📄 Últimos relatórios', 'Histórico do que foi entregue. Abra o HTML ou copie a mensagem pro grupo.');
  grid.append(alvosCard.wrap, configCard.wrap, execCard.wrap);

  const alvosWrap = el('div'); alvosCard.body.appendChild(alvosWrap);
  const configWrap = el('div'); configCard.body.appendChild(configWrap);
  const execWrap = el('div'); execCard.body.appendChild(execWrap);

  await Promise.all([
    carregarAlvos(alvosWrap),
    carregarConfig(configWrap),
    carregarExecucoes(execWrap),
  ]);
}

// ------------------------------------------------------------
// Alvos
// ------------------------------------------------------------
async function carregarAlvos(wrap) {
  wrap.innerHTML = '<div style="color:var(--muted);padding:12px">Carregando…</div>';
  let alvos = [];
  try { alvos = (await gestao('listar_alvos')).alvos || []; }
  catch (e) { wrap.innerHTML = `<div style="color:var(--status-alerta);padding:12px">Erro: ${e.message}</div>`; return; }

  wrap.innerHTML = '';
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  if (!alvos.length) lista.appendChild(el('div', { style: 'color:var(--muted);padding:8px' }, 'Nenhum alvo ainda. Adicione o primeiro abaixo.'));
  for (const a of alvos) {
    const icone = a.tipo === 'youtube' ? '▶️' : '📸';
    lista.appendChild(el('div', {
      style: `display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;${a.ativo ? '' : 'opacity:0.5'}`,
    }, [
      el('span', { style: 'font-size:1.2rem' }, icone),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { style: 'font-weight:600' }, a.apelido || a.handle),
        el('a', { href: a.url, target: '_blank', rel: 'noopener', style: 'color:var(--muted);font-size:0.8125rem;text-decoration:none' }, a.url),
      ]),
      btnMini(a.ativo ? 'Pausar' : 'Ativar', async () => { await gestao('toggle_alvo', { id: a.id }); await carregarAlvos(wrap); }),
      btnMini('Remover', async () => {
        if (!confirm(`Remover ${a.apelido || a.handle} do Mundo IA?`)) return;
        await gestao('remover_alvo', { id: a.id }); await carregarAlvos(wrap);
      }, true),
    ]));
  }
  wrap.appendChild(lista);

  // form add
  const tipoSel = el('select', { style: inputCss() }, [
    el('option', { value: 'instagram' }, '📸 Instagram'),
    el('option', { value: 'youtube' }, '▶️ YouTube'),
  ]);
  const urlInput = el('input', { type: 'text', placeholder: 'Cole a URL do perfil/canal (ex: instagram.com/fulano)', style: inputCss() + 'flex:1' });
  const apelidoInput = el('input', { type: 'text', placeholder: 'Apelido (opcional)', style: inputCss() + 'width:160px' });
  const addBtn = btn('＋ Adicionar', 'primary', async (b) => {
    const url = urlInput.value.trim();
    if (!url) { toast('Cole a URL do perfil.', true); return; }
    b.disabled = true;
    try {
      await gestao('add_alvo', { tipo: tipoSel.value, url, apelido: apelidoInput.value.trim() || null });
      urlInput.value = ''; apelidoInput.value = '';
      await carregarAlvos(wrap);
      toast('Alvo adicionado!');
    } catch (e) { toast('Erro: ' + e.message, true); }
    b.disabled = false;
  });
  wrap.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center' }, [tipoSel, urlInput, apelidoInput, addBtn]));
}

// ------------------------------------------------------------
// Config
// ------------------------------------------------------------
async function carregarConfig(wrap) {
  wrap.innerHTML = '<div style="color:var(--muted);padding:12px">Carregando…</div>';
  let cfg = null;
  try { cfg = (await gestao('carregar_config')).config; }
  catch (e) { wrap.innerHTML = `<div style="color:var(--status-alerta);padding:12px">Erro: ${e.message}</div>`; return; }

  wrap.innerHTML = '';
  const zap = el('input', { type: 'text', value: cfg?.whatsapp_destino || '', placeholder: '5511985879361 (com DDI 55)', style: inputCss() + 'flex:1' });
  const envia = el('input', { type: 'checkbox' }); envia.checked = cfg ? !!cfg.envia_whatsapp : true;

  wrap.appendChild(el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
    el('label', { style: 'display:flex;flex-direction:column;gap:4px' }, [
      el('span', { style: 'font-size:0.8125rem;color:var(--muted)' }, 'WhatsApp que recebe o resumo das 7h'),
      zap,
    ]),
    el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer' }, [
      envia, el('span', {}, 'Enviar resumo no WhatsApp (além do HTML no painel)'),
    ]),
    el('div', {}, [
      btn('Salvar configuração', 'primary', async (b) => {
        b.disabled = true;
        try {
          await gestao('salvar_config', { whatsapp_destino: zap.value.trim() || null, envia_whatsapp: envia.checked, hora_envio: '07:00' });
          toast('Configuração salva!');
        } catch (e) { toast('Erro: ' + e.message, true); }
        b.disabled = false;
      }),
    ]),
    el('div', { style: 'color:var(--muted);font-size:0.8125rem;border-top:1px solid var(--line);padding-top:10px' },
      'A raspagem roda 01h e o envio 07h (horário de Brasília). A cópia pro grupo dos sócios sai pronta no relatório — você dispara quando quiser.'),
  ]));
}

// ------------------------------------------------------------
// Execuções
// ------------------------------------------------------------
async function carregarExecucoes(wrap) {
  wrap.innerHTML = '<div style="color:var(--muted);padding:12px">Carregando…</div>';
  let execs = [];
  try { execs = (await gestao('ultimas_execucoes', { limite: 15 })).execucoes || []; }
  catch (e) { wrap.innerHTML = `<div style="color:var(--status-alerta);padding:12px">Erro: ${e.message}</div>`; return; }

  wrap.innerHTML = '';
  if (!execs.length) { wrap.appendChild(el('div', { style: 'color:var(--muted);padding:8px' }, 'Nenhum relatório gerado ainda. Clique em "▶ Rodar agora" pra testar.')); return; }

  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  for (const ex of execs) {
    lista.appendChild(el('div', { style: 'display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;flex-wrap:wrap' }, [
      el('div', { style: 'flex:1;min-width:180px' }, [
        el('div', { style: 'font-weight:600' }, fmtData(ex.gerado_em)),
        el('div', { style: 'color:var(--muted);font-size:0.8125rem' },
          `${ex.total_posts} publicações · ${ex.total_acionaveis} acionáveis${ex.enviado_whatsapp ? ' · ✅ enviado no Zap' : ''}`),
      ]),
      btnMini('Abrir HTML', async () => {
        const { execucao } = await gestao('carregar_execucao', { id: ex.id });
        const w = window.open('', '_blank');
        w.document.write(execucao.html || '<p>relatório vazio</p>');
        w.document.close();
      }),
      ex.total_acionaveis > 0 ? btnMini('Copiar p/ grupo', async () => {
        const { execucao } = await gestao('carregar_execucao', { id: ex.id });
        await navigator.clipboard.writeText(execucao.resumo_grupo || '');
        toast('Cópia pro grupo copiada! Cole no WhatsApp dos sócios.');
      }) : null,
    ]));
  }
  wrap.appendChild(lista);
}

// ------------------------------------------------------------
// UI helpers
// ------------------------------------------------------------
function card(titulo, sub) {
  const wrap = el('div', { style: 'border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden' });
  wrap.appendChild(el('div', { style: 'padding:16px 18px;border-bottom:1px solid var(--line)' }, [
    el('div', { style: 'font-weight:700;font-size:1rem' }, titulo),
    sub ? el('div', { style: 'color:var(--muted);font-size:0.8125rem;margin-top:2px' }, sub) : null,
  ]));
  const body = el('div', { style: 'padding:16px 18px' });
  wrap.appendChild(body);
  return { wrap, body };
}
function inputCss() { return 'padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);font-family:inherit;font-size:0.875rem;'; }
function btn(txt, kind, onclick) {
  const primary = kind === 'primary';
  const b = el('button', {
    type: 'button',
    style: `padding:8px 16px;border-radius:8px;font-family:inherit;font-size:0.875rem;font-weight:600;cursor:pointer;border:1px solid var(--line);${primary ? 'background:var(--text);color:var(--bg);border-color:var(--text)' : 'background:var(--surface);color:var(--text)'}`,
  }, txt);
  b.addEventListener('click', () => onclick(b));
  return b;
}
function btnMini(txt, onclick, danger) {
  const b = el('button', {
    type: 'button',
    style: `padding:5px 10px;border-radius:7px;font-family:inherit;font-size:0.75rem;font-weight:600;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:${danger ? 'var(--status-alerta,#EF4444)' : 'var(--text)'}`,
  }, txt);
  b.addEventListener('click', async () => { b.disabled = true; try { await onclick(); } catch (e) { toast('Erro: ' + e.message, true); } b.disabled = false; });
  return b;
}
function toast(msg, erro) {
  const t = el('div', {
    style: `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 20px;border-radius:10px;font-size:0.875rem;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.3);${erro ? 'background:#EF4444;color:#fff' : 'background:#22C55E;color:#0B1120'}`,
  }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}
