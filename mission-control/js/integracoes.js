/* Integracoes — gestao de credenciais externas (Apify, RapidAPI, etc).
   Lê pinguim.vw_integracoes (sem chave_secreta). Toda escrita passa pela
   Edge Function 'integracoes' que tem service_role.
*/

import { getSupabase } from './sb-client.js?v=20260421p';
import { renderContasGooglePessoais } from './contas-google-pessoais.js?v=20260515c';

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

  // V2.14.7 — Contas Google pessoais (multi-conta por socio)
  const contasGoogleWrap = el('div', {});
  wrap.appendChild(contasGoogleWrap);
  renderContasGooglePessoais(contasGoogleWrap);

  // Card fixo: Clint (CRM) — leva pra tela de mapeamento de produtos
  wrap.appendChild(el('div', { class: 'cofre-header', style: 'margin-bottom:1rem;cursor:pointer' }, [
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:1rem' }, [
      el('div', {}, [
        el('h3', { style: 'margin:0' }, '🔌 Clint — CRM'),
        el('p', { style: 'margin:.25rem 0 0;font-size:.875rem;color:var(--fg-muted)' },
          'Webhook recebe eventos em tempo real. API tem 134k contatos pra coletar Inteligência Viva por Cérebro — começa pelo de-para de produtos.'),
      ]),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          location.hash = '#clint-mapeamento';
          if (window.__navegar) window.__navegar('clint-mapeamento');
        },
      }, '→ Mapeamento de Produtos'),
    ]),
  ]));

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
