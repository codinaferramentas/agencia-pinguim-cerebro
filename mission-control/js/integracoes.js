/* Integracoes — gestao de credenciais externas (Apify, RapidAPI, etc).
   Lê pinguim.vw_integracoes (sem chave_secreta). Toda escrita passa pela
   Edge Function 'integracoes' que tem service_role.
*/

import { getSupabase } from './sb-client.js?v=20260421p';

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

const ICONES = {
  openai: '🤖',
  apify: '🕷',
  'youtube-legendas': '📝',
  supabase: '🗄',
};

const DESCRICOES = {
  openai: 'Modelos de IA (Vision, Whisper, GPT, Embeddings). Configurada via variável de ambiente da Edge Function.',
  apify: 'Um token só, todos os atores. Cole sua chave Apify e o sistema escolhe o ator certo conforme a URL: Reels do Instagram (com transcrição do áudio), TikTok, YouTube (fallback), site qualquer (página de vendas, blog), Biblioteca de Anúncios do Meta (espiar concorrente). Conta em apify.com com US$ 5 grátis por mês.',
  'youtube-legendas': 'Extrai legendas geradas automaticamente pelo YouTube. Sem chave, sem custo. Funciona em ~95% dos vídeos. Quando não funciona, o sistema cai pra Apify (se configurado).',
  supabase: 'Banco, Storage e Auth do sistema. Configurado via variáveis de ambiente.',
};

const COMO_CONFIGURAR = {
  apify: [
    'Acesse apify.com e crie uma conta (US$ 5 grátis por mês — cobre milhares de Reels).',
    'No console, abra Settings → Integrations → API tokens.',
    'Clique "Create new token" (deixe permissões padrão).',
    'Copie o token completo (começa com "apify_api_…") e cole abaixo.',
    'Pronto — uma chave só, o sistema usa em qualquer URL (Instagram, TikTok, YouTube).',
  ],
};

export async function renderIntegracoes() {
  const page = document.getElementById('page-integracoes');
  if (!page) return;
  page.innerHTML = '';

  const sb = getSupabase();
  if (!sb) {
    page.innerHTML = '<div style="padding:3rem;color:var(--fg-muted)">Sem conexão com o banco.</div>';
    return;
  }

  const wrap = el('div', { class: 'integracoes-wrap' });
  wrap.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, '🔌 Integrações'),
    el('p', { class: 'page-subtitle' },
      'Serviços externos que o Pinguim OS pode usar. Configure as chaves uma vez e o sistema usa automaticamente quando precisar — você não precisa pensar nisso depois.'
    ),
  ]));

  page.appendChild(wrap);

  const lista = el('div', { class: 'integracoes-grid' });
  wrap.appendChild(lista);
  lista.appendChild(el('div', { style: 'padding:2rem;color:var(--fg-muted);text-align:center' }, 'Carregando…'));

  const { data, error } = await sb.from('vw_integracoes').select('*').order('categoria').order('nome');
  if (error) {
    lista.innerHTML = `<div style="padding:2rem;color:var(--danger)">Erro: ${error.message}</div>`;
    return;
  }

  lista.innerHTML = '';
  const porCategoria = {};
  (data || []).forEach(i => {
    if (!porCategoria[i.categoria]) porCategoria[i.categoria] = [];
    porCategoria[i.categoria].push(i);
  });

  const ordemCat = ['ia', 'conteudo', 'infra'];
  const labelsCat = { ia: 'Inteligência Artificial', conteudo: 'Captação de Conteúdo', infra: 'Infraestrutura' };

  ordemCat.forEach(cat => {
    if (!porCategoria[cat]) return;
    wrap.appendChild(el('div', { class: 'integracoes-cat-label' }, labelsCat[cat] || cat));
    const grid = el('div', { class: 'integracoes-grid' });
    porCategoria[cat].forEach(i => grid.appendChild(cardIntegracao(i)));
    wrap.appendChild(grid);
  });

  // Bloco Comunicacao — canais Discord (cadastrados no painel, usados por skills)
  await renderCanaisDiscord(wrap, sb);
}

async function renderCanaisDiscord(wrap, sb) {
  wrap.appendChild(el('div', { class: 'integracoes-cat-label' }, 'Comunicação'));

  const card = el('div', { class: 'integ-card', style: 'grid-column:1/-1' });
  card.appendChild(el('div', { class: 'integ-card-head' }, [
    el('span', { class: 'integ-card-icon' }, '💬'),
    el('div', {}, [
      el('h3', {}, 'Canais Discord'),
      el('div', { class: 'integ-card-status', style: 'color:var(--fg-muted);font-size:.75rem' }, 'cadastre webhooks pra agentes mandarem mensagem'),
    ]),
  ]));
  card.appendChild(el('p', { class: 'integ-card-desc' },
    'Cada canal cadastrado vira um slug curto (ex: "vendas", "alertas") que a skill enviar-mensagem-discord usa pra resolver o webhook. Agente fala com o canal pelo nome — você troca o webhook quando quiser sem mexer no código.'
  ));

  const lista = el('div', { id: 'discord-canais-lista', style: 'display:flex;flex-direction:column;gap:.5rem;margin-top:1rem' });
  card.appendChild(lista);

  card.appendChild(el('button', {
    class: 'btn btn-primary',
    type: 'button',
    style: 'margin-top:.875rem',
    onclick: () => abrirModalCanalDiscord(null),
  }, '+ Novo canal Discord'));

  wrap.appendChild(card);

  // Carrega lista
  const { data, error } = await sb.from('discord_canais').select('*').order('ambiente').order('slug');
  if (error) {
    lista.appendChild(el('div', { style: 'color:var(--danger);font-size:.8125rem' }, 'Erro: ' + error.message));
    return;
  }
  if (!data || data.length === 0) {
    lista.appendChild(el('div', { style: 'color:var(--fg-dim);font-style:italic;font-size:.875rem;padding:1rem;text-align:center;background:var(--surface-1);border-radius:6px' },
      'Nenhum canal cadastrado. Crie webhook em Discord > Configurações do canal > Integrações > Webhooks, e cadastre aqui.'));
    return;
  }
  data.forEach(c => lista.appendChild(rowCanalDiscord(c)));
}

function rowCanalDiscord(c) {
  const url = c.webhook_url || '';
  const urlReduzida = url.length > 60 ? url.slice(0, 30) + '…' + url.slice(-15) : url;
  const corAmbiente = c.ambiente === 'producao' ? '#22c55e' : '#f5a524';

  const row = el('div', {
    style: 'display:grid;grid-template-columns:auto 1fr auto auto;gap:.875rem;align-items:center;padding:.75rem .875rem;background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:8px',
  }, [
    el('span', {
      style: `font-family:var(--font-mono);font-size:.625rem;text-transform:uppercase;color:${corAmbiente};border:1px solid ${corAmbiente};padding:.125rem .5rem;border-radius:4px;letter-spacing:.05em`,
    }, c.ambiente),
    el('div', {}, [
      el('div', { style: 'font-family:var(--font-heading);font-weight:600;color:var(--fg-title);font-size:.875rem' },
        `${c.nome} · ${c.slug}`),
      el('div', { style: 'font-family:var(--font-mono);font-size:.6875rem;color:var(--fg-dim);margin-top:.125rem' },
        urlReduzida),
      c.descricao ? el('div', { style: 'color:var(--fg-muted);font-size:.75rem;margin-top:.25rem' }, c.descricao) : null,
    ]),
    el('span', { style: `font-size:.6875rem;color:${c.ativo ? '#22c55e' : 'var(--fg-dim)'}` }, c.ativo ? '✓ ativo' : '× inativo'),
    el('div', { style: 'display:flex;gap:.25rem' }, [
      el('button', {
        type: 'button',
        title: 'Editar',
        style: 'background:transparent;border:1px solid var(--border-subtle);color:var(--fg-muted);padding:.25rem .5rem;border-radius:4px;font-size:.75rem;cursor:pointer',
        onclick: () => abrirModalCanalDiscord(c),
      }, 'Editar'),
      el('button', {
        type: 'button',
        title: 'Excluir',
        style: 'background:transparent;border:1px solid var(--border-subtle);color:var(--danger);padding:.25rem .5rem;border-radius:4px;font-size:.75rem;cursor:pointer',
        onclick: () => excluirCanalDiscord(c),
      }, 'Excluir'),
    ]),
  ]);
  return row;
}

function abrirModalCanalDiscord(canal) {
  const editando = !!canal;
  const overlay = el('div', {
    style: 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:1rem',
    onclick: (e) => { if (e.target === overlay) document.body.removeChild(overlay); },
  });
  const modal = el('div', {
    style: 'background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:560px;width:100%',
  });

  const labelStyle = 'display:block;font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-dim);font-family:var(--font-mono);margin-bottom:.25rem';
  const inputStyle = 'width:100%;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:.5rem .625rem;color:var(--fg);font-size:.875rem;margin-bottom:.875rem';

  modal.appendChild(el('h2', { style: 'font-family:var(--font-heading);font-size:1.125rem;color:var(--fg-title);margin:0 0 1rem' },
    editando ? `Editar canal: ${canal.nome}` : 'Novo canal Discord'));

  modal.appendChild(el('label', { style: labelStyle }, 'Slug (ex: vendas, alertas, bot-testes)'));
  const slugIn = el('input', { id: 'cd-slug', type: 'text', value: canal?.slug || '', placeholder: 'kebab-case', style: inputStyle });
  modal.appendChild(slugIn);

  modal.appendChild(el('label', { style: labelStyle }, 'Nome amigável'));
  modal.appendChild(el('input', { id: 'cd-nome', type: 'text', value: canal?.nome || '', placeholder: 'Ex: Bot Testes — Pinguim', style: inputStyle }));

  modal.appendChild(el('label', { style: labelStyle }, 'Webhook URL'));
  modal.appendChild(el('input', { id: 'cd-url', type: 'text', value: canal?.webhook_url || '', placeholder: 'https://discord.com/api/webhooks/...', style: inputStyle + ';font-family:var(--font-mono);font-size:.75rem' }));
  modal.appendChild(el('div', { style: 'font-size:.6875rem;color:var(--fg-dim);margin-top:-.625rem;margin-bottom:.875rem' },
    'Crie em: Discord > Configurações do canal > Integrações > Webhooks > Novo webhook > Copiar URL'));

  modal.appendChild(el('label', { style: labelStyle }, 'Ambiente'));
  const sel = el('select', { id: 'cd-amb', style: inputStyle }, [
    el('option', { value: 'teste' }, 'Teste (Playground usa esse por padrão)'),
    el('option', { value: 'producao' }, 'Produção (canal real, agente usa)'),
  ]);
  if (canal?.ambiente) sel.value = canal.ambiente;
  modal.appendChild(sel);

  modal.appendChild(el('label', { style: labelStyle }, 'Descrição (opcional)'));
  modal.appendChild(el('textarea', { id: 'cd-desc', rows: '2', style: inputStyle + ';resize:vertical;font-family:var(--font-body)' }, canal?.descricao || ''));

  modal.appendChild(el('label', { style: 'display:flex;align-items:center;gap:.5rem;font-size:.8125rem;color:var(--fg);margin-bottom:.875rem;cursor:pointer' }, [
    el('input', { id: 'cd-ativo', type: 'checkbox', checked: canal?.ativo !== false ? 'checked' : null }),
    'Canal ativo (skills podem usar)',
  ]));

  const erroDiv = el('div', { id: 'cd-erro', style: 'color:var(--danger);font-size:.75rem;margin-bottom:.5rem;min-height:1rem' });
  modal.appendChild(erroDiv);

  modal.appendChild(el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end' }, [
    el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => document.body.removeChild(overlay) }, 'Cancelar'),
    el('button', {
      class: 'btn btn-primary',
      type: 'button',
      onclick: () => salvarCanalDiscord(canal, overlay),
    }, editando ? 'Salvar' : '+ Criar'),
  ]));

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  setTimeout(() => slugIn.focus(), 50);
}

async function salvarCanalDiscord(canalExistente, overlay) {
  const erroDiv = document.getElementById('cd-erro');
  erroDiv.textContent = '';
  const slug = document.getElementById('cd-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const nome = document.getElementById('cd-nome').value.trim();
  const webhook_url = document.getElementById('cd-url').value.trim();
  const ambiente = document.getElementById('cd-amb').value;
  const descricao = document.getElementById('cd-desc').value.trim() || null;
  const ativo = document.getElementById('cd-ativo').checked;

  if (!slug || !nome || !webhook_url) {
    erroDiv.textContent = 'Slug, nome e webhook URL são obrigatórios.'; return;
  }
  try {
    const u = new URL(webhook_url);
    if (!u.hostname.endsWith('discord.com') && !u.hostname.endsWith('discordapp.com')) {
      erroDiv.textContent = 'URL precisa ser do discord.com'; return;
    }
  } catch { erroDiv.textContent = 'URL inválida'; return; }

  const sb = getSupabase();
  const payload = { slug, nome, webhook_url, ambiente, descricao, ativo };
  let resp;
  if (canalExistente) {
    resp = await sb.from('discord_canais').update(payload).eq('id', canalExistente.id);
  } else {
    resp = await sb.from('discord_canais').insert(payload);
  }
  if (resp.error) { erroDiv.textContent = 'Erro: ' + resp.error.message; return; }
  document.body.removeChild(overlay);
  renderIntegracoes();
}

async function excluirCanalDiscord(c) {
  if (!confirm(`Excluir o canal "${c.nome}" (${c.slug})?\n\nSkills que dependem desse slug vão começar a falhar.`)) return;
  const sb = getSupabase();
  const { error } = await sb.from('discord_canais').delete().eq('id', c.id);
  if (error) { alert('Erro: ' + error.message); return; }
  renderIntegracoes();
}

function cardIntegracao(integ) {
  const ativa = integ.status === 'ativa';
  const card = el('div', { class: 'integ-card' + (ativa ? ' ativa' : '') });

  const editavel = !!COMO_CONFIGURAR[integ.slug];

  card.appendChild(el('div', { class: 'integ-card-head' }, [
    el('div', { class: 'integ-icone' }, ICONES[integ.slug] || '⚙'),
    el('div', { style: 'flex:1' }, [
      el('div', { class: 'integ-nome' }, integ.nome),
      el('div', { class: 'integ-status' + (ativa ? ' on' : ' off') }, [
        el('span', { class: 'integ-status-dot' }),
        ativa ? 'Ativa' : 'Não configurada',
      ]),
    ]),
  ]));

  card.appendChild(el('p', { class: 'integ-desc' }, DESCRICOES[integ.slug] || ''));

  if (integ.total_chamadas > 0) {
    card.appendChild(el('div', { class: 'integ-stats' }, [
      el('span', {}, `${integ.total_chamadas} ${integ.total_chamadas === 1 ? 'uso' : 'usos'}`),
      el('span', { class: 'sep' }, '·'),
      el('span', {}, `R$ ${(Number(integ.custo_acumulado_usd) * 5.5).toFixed(2)}`),
    ]));
  }

  if (editavel) {
    card.appendChild(el('div', { class: 'integ-actions' }, [
      el('button', {
        class: 'btn ' + (ativa ? '' : 'btn-primary'),
        onclick: () => abrirConfigChave(integ),
      }, ativa ? 'Editar chave' : 'Configurar'),
      ativa ? el('button', {
        class: 'btn btn-ghost',
        style: 'color:var(--danger)',
        onclick: () => removerChave(integ),
      }, 'Remover') : null,
    ]));
  } else {
    card.appendChild(el('div', { class: 'integ-actions' }, [
      el('span', { style: 'font-size:.75rem;color:var(--fg-muted);font-style:italic' },
        ativa ? 'Configurada via servidor' : '—'),
    ]));
  }

  return card;
}

function abrirConfigChave(integ) {
  const passos = COMO_CONFIGURAR[integ.slug] || [];

  const back = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === back) fechar(); } });
  const card = el('div', { class: 'modal-card', style: 'max-width:560px' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const inputChave = el('input', {
    type: 'password',
    class: 'form-input',
    placeholder: integ.tem_chave ? '•••••••• (chave atual oculta — digite uma nova pra trocar)' : 'Cole a chave aqui',
    style: 'width:100%;font-family:var(--font-mono),monospace',
  });

  const erroEl = el('div', { style: 'display:none;color:var(--danger);font-size:.875rem;margin-top:.5rem' });

  async function salvar(ev) {
    ev.preventDefault();
    const chave = inputChave.value.trim();
    if (!chave) {
      erroEl.style.display = ''; erroEl.textContent = 'Digite uma chave.'; return;
    }
    const btn = ev.submitter || ev.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Salvando…';
    erroEl.style.display = 'none';

    try {
      const r = await chamarFnIntegracoes('salvar-chave', { slug: integ.slug, chave });
      if (r.error) throw new Error(r.error);
      fechar();
      renderIntegracoes();
    } catch (e) {
      erroEl.style.display = ''; erroEl.textContent = e.message;
      btn.disabled = false; btn.textContent = 'Salvar';
    }
  }

  card.append(
    el('div', { class: 'modal-head' }, [
      el('h2', {}, `${ICONES[integ.slug] || ''} ${integ.nome}`),
      el('div', { class: 'modal-sub' }, 'A chave fica guardada no servidor e nunca é exposta no navegador.'),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    el('div', { class: 'modal-body' }, [
      passos.length ? el('div', { class: 'integ-passos' }, [
        el('div', { class: 'integ-passos-label' }, 'Como obter a chave'),
        el('ol', {}, passos.map(p => el('li', {}, p))),
      ]) : null,
      el('form', { onsubmit: salvar }, [
        el('label', { class: 'novo-cerebro-label', style: 'margin-top:1rem;display:block' }, 'Chave'),
        inputChave,
        erroEl,
        el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem' }, [
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: fechar }, 'Cancelar'),
          el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'),
        ]),
      ]),
    ]),
  );
  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => {
    back.classList.add('open');
    setTimeout(() => inputChave.focus(), 200);
  });
}

async function removerChave(integ) {
  if (!confirm(`Remover a chave de ${integ.nome}? Esse serviço deixará de funcionar até você configurar de novo.`)) return;
  try {
    const r = await chamarFnIntegracoes('remover-chave', { slug: integ.slug });
    if (r.error) throw new Error(r.error);
    renderIntegracoes();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function chamarFnIntegracoes(modo, body) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Sem sessão. Faça login.');

  const url = `${window.__ENV__.SUPABASE_URL}/functions/v1/integracoes`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modo, ...body }),
  });
  return await resp.json();
}

// API publica usada pelo Avulso pra processar URL
export async function processarUrl(url, cerebroId) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Sem sessão.');

  const fnUrl = `${window.__ENV__.SUPABASE_URL}/functions/v1/ingest-url`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, cerebro_id: cerebroId }),
  });
  return await resp.json();
}
