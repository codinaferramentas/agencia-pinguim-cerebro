/* Contas Google Pessoais — V2.14.7 (Andre 2026-05-15)
   Multi-conta Google por sócio. Cada sócio conecta N contas (ex: Luiz com
   "Pinguim" + "Pessoal"), uma marcada como padrão pra desambiguar "meu email".

   Fluxo:
   1. Sócio preenche nome + telefone WhatsApp + label
   2. Clica "Conectar Google" → POST /api/conexoes/iniciar (ngrok)
   3. server-cli responde com authorize_url do Google
   4. Sócio é redirecionado pro Google, autoriza
   5. Google volta em https://<ngrok>/api/conexoes/callback
   6. server-cli grava em pinguim.conexoes_google
   7. Sócio fecha aba, volta aqui, vê a conta listada

   Como o callback acontece no server-cli (ngrok), essa tela só dispara o
   início e periodicamente recarrega a lista pra mostrar conta nova.
*/

const PUBLIC_BASE_URL = 'https://almost-pawing-urban.ngrok-free.dev';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (c instanceof Node) n.appendChild(c);
    else n.appendChild(document.createTextNode(String(c)));
  });
  return n;
};

async function api(method, path, body = null) {
  const headers = { 'ngrok-skip-browser-warning': '1' };
  if (body) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  let r;
  try {
    r = await fetch(PUBLIC_BASE_URL + path, opts);
  } catch (e) {
    const err = new Error('Server-cli local não respondeu. PC ligado? Ngrok rodando? (' + (e.message || 'fetch failed') + ')');
    err.kind = 'offline';
    throw err;
  }
  let texto;
  try { texto = await r.text(); }
  catch (_) {
    throw new Error(`Sem resposta legível (HTTP ${r.status})`);
  }
  let j;
  try { j = JSON.parse(texto); }
  catch (_) {
    throw new Error(`Resposta não-JSON (HTTP ${r.status}): ${texto.slice(0, 120)}`);
  }
  if (!j.ok) throw new Error(j.error || 'erro');
  return j;
}

function normTelefone(s) {
  return String(s || '').replace(/\D/g, '');
}

function fmtTelefone(s) {
  const n = normTelefone(s);
  if (n.length < 12) return s;
  const ddi = n.slice(0, 2);
  const ddd = n.slice(2, 4);
  const resto = n.slice(4);
  if (resto.length === 9) return `+${ddi} ${ddd} ${resto.slice(0,5)}-${resto.slice(5)}`;
  if (resto.length === 8) return `+${ddi} ${ddd} ${resto.slice(0,4)}-${resto.slice(4)}`;
  return s;
}

export function renderContasGooglePessoais(container) {
  if (!container) return;
  container.innerHTML = '';

  const wrap = el('div', {
    style: 'background:var(--bg-elevated,#111118);border:1px solid var(--border,#2a2a3e);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem',
  });

  // Header
  wrap.appendChild(el('div', { style: 'display:flex;align-items:center;gap:.75rem;margin-bottom:.25rem' }, [
    el('h3', { style: 'margin:0;font-size:1.05rem' }, '🐧 Contas Google dos sócios'),
    el('span', {
      style: 'background:rgba(232,92,0,.15);color:#E85C00;padding:.15rem .55rem;border-radius:6px;font-size:.7rem;font-weight:600',
    }, 'Multi-conta'),
  ]));
  wrap.appendChild(el('p', {
    style: 'margin:.25rem 0 1.25rem;font-size:.85rem;color:var(--fg-muted,#94a3b8);line-height:1.5',
  }, 'Cada sócio pode conectar mais de uma conta Google (ex.: Pinguim + Pessoal). A primeira conta vira padrão automaticamente. Os relatórios usam a conta padrão quando o sócio fala "meu email" sem qualificar.'));

  // Form
  const form = el('div', {
    style: 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:.75rem;align-items:end;margin-bottom:1.25rem',
  });

  const inpNome = el('input', {
    type: 'text', placeholder: 'Nome (ex.: Luiz Cota)',
    style: 'padding:.6rem .75rem;background:#1a1a28;border:1px solid #2a2a3e;border-radius:8px;color:#f1f5f9;font-size:.875rem;width:100%',
  });
  const inpTel = el('input', {
    type: 'text', placeholder: 'WhatsApp (ex.: 5511...)',
    style: 'padding:.6rem .75rem;background:#1a1a28;border:1px solid #2a2a3e;border-radius:8px;color:#f1f5f9;font-size:.875rem;width:100%',
  });
  const inpLabel = el('input', {
    type: 'text', placeholder: 'Label (ex.: Pinguim, Pessoal)',
    style: 'padding:.6rem .75rem;background:#1a1a28;border:1px solid #2a2a3e;border-radius:8px;color:#f1f5f9;font-size:.875rem;width:100%',
  });

  const labelTopo = (texto) => el('label', {
    style: 'display:block;font-size:.75rem;color:#94a3b8;margin-bottom:.35rem;text-transform:uppercase;letter-spacing:.04em',
  }, texto);

  form.appendChild(el('div', {}, [labelTopo('Nome'), inpNome]));
  form.appendChild(el('div', {}, [labelTopo('Telefone'), inpTel]));
  form.appendChild(el('div', {}, [labelTopo('Label da conta'), inpLabel]));

  const btnConectar = el('button', {
    style: 'background:#E85C00;color:white;border:none;padding:.7rem 1.25rem;border-radius:8px;font-weight:600;cursor:pointer;font-size:.875rem;white-space:nowrap;height:fit-content',
  }, 'Conectar Google →');

  form.appendChild(btnConectar);
  wrap.appendChild(form);

  // Status / mensagem
  const status = el('div', {
    style: 'min-height:1.5rem;font-size:.85rem;color:#94a3b8;margin-bottom:1rem',
  });
  wrap.appendChild(status);

  // Lista de conexões (atualiza quando telefone bate)
  const listaWrap = el('div', {});
  wrap.appendChild(listaWrap);

  // ============================================================
  // Lógica
  // ============================================================
  async function carregarLista(telefone) {
    listaWrap.innerHTML = '';
    if (!telefone) return;
    try {
      const r = await api('GET', `/api/conexoes/listar?telefone=${encodeURIComponent(telefone)}`);
      if (!r.cliente_id) {
        listaWrap.appendChild(el('div', {
          style: 'padding:.85rem 1rem;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;color:#fca5a5;font-size:.85rem',
        }, '⚠ Esse telefone não está cadastrado em pinguim.whatsapp_socios. Cadastre o sócio primeiro (no painel Segurança ou via script).'));
        return;
      }
      if (!r.conexoes || r.conexoes.length === 0) {
        listaWrap.appendChild(el('div', {
          style: 'padding:.85rem 1rem;background:#1a1a28;border:1px dashed #2a2a3e;border-radius:8px;color:#94a3b8;font-size:.85rem;text-align:center',
        }, 'Nenhuma conta Google conectada ainda. Preencha label acima e clique "Conectar Google".'));
        return;
      }

      listaWrap.appendChild(el('div', {
        style: 'font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem',
      }, `Contas conectadas (${r.conexoes.length})`));

      r.conexoes.forEach(c => listaWrap.appendChild(renderCard(c, telefone)));
    } catch (e) {
      listaWrap.appendChild(el('div', {
        style: 'padding:.85rem 1rem;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;color:#fca5a5;font-size:.85rem',
      }, `✗ ${e.message}`));
    }
  }

  function renderCard(c, telefone) {
    const card = el('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 1rem;background:#1a1a28;border:1px solid ' + (c.is_padrao ? 'rgba(232,92,0,.4)' : '#2a2a3e') + ';border-radius:8px;margin-bottom:.5rem',
    });

    const info = el('div', { style: 'flex:1;min-width:0' });
    info.appendChild(el('div', {
      style: 'display:flex;align-items:center;gap:.5rem;flex-wrap:wrap',
    }, [
      el('strong', {
        style: 'color:#f1f5f9;font-size:.95rem;word-break:break-all',
      }, c.email_google || '(email não capturado)'),
      el('span', {
        style: 'background:rgba(232,92,0,.15);color:#E85C00;padding:.15rem .5rem;border-radius:5px;font-size:.7rem;font-weight:600',
      }, c.label),
      c.is_padrao ? el('span', {
        style: 'background:rgba(16,185,129,.15);color:#10b981;padding:.15rem .5rem;border-radius:5px;font-size:.7rem;font-weight:600',
      }, '⭐ padrão') : null,
    ]));
    info.appendChild(el('div', {
      style: 'font-size:.72rem;color:#64748b;margin-top:.25rem',
    }, `${c.escopo ? 'Escopo: ' + (c.escopo.length > 80 ? c.escopo.slice(0, 80) + '...' : c.escopo) : ''}`));

    card.appendChild(info);

    const acoes = el('div', { style: 'display:flex;gap:.4rem' });

    if (!c.is_padrao) {
      acoes.appendChild(el('button', {
        style: 'background:transparent;color:#94a3b8;border:1px solid #2a2a3e;padding:.4rem .7rem;border-radius:6px;cursor:pointer;font-size:.75rem',
        onclick: async () => {
          try {
            await api('POST', '/api/conexoes/padrao', { conexao_id: c.id });
            await carregarLista(telefone);
          } catch (e) { alert('Erro: ' + e.message); }
        },
      }, 'Tornar padrão'));
    }

    acoes.appendChild(el('button', {
      style: 'background:transparent;color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:.4rem .7rem;border-radius:6px;cursor:pointer;font-size:.75rem',
      onclick: async () => {
        if (!confirm(`Revogar a conta ${c.email_google} (${c.label})?\n\nO refresh_token vai ser apagado do banco. O sócio precisará reconectar pra usar essa conta de novo.`)) return;
        try {
          await api('POST', '/api/conexoes/revogar', { conexao_id: c.id });
          await carregarLista(telefone);
        } catch (e) { alert('Erro: ' + e.message); }
      },
    }, 'Revogar'));

    card.appendChild(acoes);
    return card;
  }

  // Carrega lista ao digitar telefone (debounce 600ms)
  let _debounceTel;
  inpTel.addEventListener('input', () => {
    clearTimeout(_debounceTel);
    _debounceTel = setTimeout(() => {
      const tel = normTelefone(inpTel.value);
      if (tel.length >= 12) carregarLista(tel);
      else listaWrap.innerHTML = '';
    }, 600);
  });

  // Botão "Conectar Google"
  btnConectar.addEventListener('click', async () => {
    const nome = inpNome.value.trim();
    const telefone = normTelefone(inpTel.value);
    const label = inpLabel.value.trim();

    status.innerHTML = '';
    status.style.color = '#94a3b8';

    if (!nome) { status.textContent = '✗ Preencha o nome'; return; }
    if (!telefone || telefone.length < 12) { status.textContent = '✗ Telefone inválido (mínimo DDI+DDD+número)'; return; }
    if (!label) { status.textContent = '✗ Preencha o label (ex.: Pinguim, Pessoal)'; return; }

    btnConectar.disabled = true;
    btnConectar.textContent = 'Iniciando...';
    status.textContent = '⏳ Falando com o server-cli local...';

    try {
      const r = await api('POST', '/api/conexoes/iniciar', { nome, telefone, label });
      status.style.color = '#10b981';
      status.textContent = `✓ Sócio identificado: ${r.socio.apelido}. Abrindo Google...`;

      // Recarrega lista antes de abrir Google (sócio vê o que já tem)
      await carregarLista(telefone);

      // Abre Google em nova aba
      window.open(r.authorize_url, '_blank', 'noopener');

      status.style.color = '#94a3b8';
      status.textContent = '⏳ Aguardando você autorizar no Google... (a lista aqui atualiza sozinha)';

      // Polling: recarrega lista a cada 4s por até 2min, pra capturar a nova conexão sem refresh manual
      let tentativas = 0;
      const interval = setInterval(async () => {
        tentativas++;
        await carregarLista(telefone);
        if (tentativas >= 30) {
          clearInterval(interval);
          status.textContent = 'Pronto. Se autorizou no Google, recarregue a página pra confirmar.';
        }
      }, 4000);
    } catch (e) {
      status.style.color = '#ef4444';
      status.textContent = `✗ ${e.message}`;
    } finally {
      btnConectar.disabled = false;
      btnConectar.textContent = 'Conectar Google →';
    }
  });

  container.appendChild(wrap);
}
