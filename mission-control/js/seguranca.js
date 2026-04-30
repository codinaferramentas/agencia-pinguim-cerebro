/**
 * Pilar Segurança — Pinguim OS
 *
 * Painel + sub-paginas:
 *  - Visao geral: cards de status (RLS, Cofre, Raio-X, OWASP, Incidentes, Politicas)
 *  - Cofre: variaveis de ambiente da Vercel (mascaradas)
 *  - Raio-X: tabelas, linhas exatas, % do plano Supabase
 *  - Incidentes: tentativas de invasao detectadas
 *  - Politicas: regras escritas (Dalio) — feedback vira politica
 *  - Auditoria: relatorios historicos
 *
 * Conselheiros consultados (squad cybersecurity, Pinguim OS):
 *  Peter Kim · Georgia Weidman · Jim Manico · Marcus Carey ·
 *  Omar Santos · Chris Sanders.
 */
import { getSupabase } from './sb-client.js?v=20260429d';
import { abrirSquadCyberModal } from './squad-cyber-modal.js?v=20260430h';

const el = (tag, attrs = {}, children = []) => {
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
};

let aba = 'visao';

export async function renderSeguranca() {
  const page = document.getElementById('page-seguranca');
  page.innerHTML = '';

  const header = el('div', { class: 'page-header' }, [
    el('div', {}, [
      el('h1', { class: 'page-title' }, '🛡 Segurança'),
      el('div', { class: 'page-subtitle' },
        'Squad Cyber: Peter Kim, Georgia Weidman, Jim Manico, Marcus Carey, Omar Santos, Chris Sanders. Defesa em profundidade + Zero Trust + IDS + Threat Intel. Tudo automático, tudo visível.'),
    ]),
  ]);

  const tabs = el('div', { class: 'seguranca-tabs' }, [
    abaBtn('visao', 'Visão geral'),
    abaBtn('cofre', 'Cofre de chaves'),
    abaBtn('raio-x', 'Raio-X do banco'),
    abaBtn('incidentes', 'Incidentes'),
    abaBtn('politicas', 'Políticas'),
    abaBtn('auditoria', 'Histórico'),
  ]);

  const conteudo = el('div', { id: 'seguranca-conteudo' });

  page.append(header, tabs, conteudo);

  await renderAba(aba, conteudo);
}

function abaBtn(id, label) {
  return el('button', {
    class: 'seguranca-tab' + (aba === id ? ' active' : ''),
    type: 'button',
    onclick: async () => {
      aba = id;
      await renderSeguranca();
    },
  }, label);
}

async function renderAba(qual, container) {
  container.innerHTML = '';
  const loading = el('div', { class: 'seguranca-loading' }, 'Carregando...');
  container.appendChild(loading);
  try {
    if (qual === 'visao')      await renderVisaoGeral(container);
    else if (qual === 'cofre') await renderCofre(container);
    else if (qual === 'raio-x') await renderRaioX(container);
    else if (qual === 'incidentes') await renderIncidentes(container);
    else if (qual === 'politicas') await renderPoliticas(container);
    else if (qual === 'auditoria') await renderAuditoria(container);
  } catch (e) {
    container.innerHTML = `<div class="seguranca-erro">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// VISAO GERAL — cards
// ============================================================
async function renderVisaoGeral(container) {
  const sb = getSupabase();
  if (!sb) { container.innerHTML = '<div class="seguranca-erro">Sem conexão.</div>'; return; }

  // Buca os relatorios MAIS RECENTES por tipo
  const { data: rels } = await sb.from('seguranca_relatorios')
    .select('*').order('criado_em', { ascending: false }).limit(50);

  const ultimoPorTipo = {};
  (rels || []).forEach(r => { if (!ultimoPorTipo[r.tipo]) ultimoPorTipo[r.tipo] = r; });

  // Incidentes em aberto
  const { data: inc } = await sb.from('seguranca_incidentes')
    .select('severidade').eq('resolvido', false);
  const totalIncidentes = (inc || []).length;
  const incCriticos = (inc || []).filter(i => i.severidade === 'critico').length;

  // Politicas ativas
  const { count: politicasAtivas } = await sb.from('politicas_seguranca')
    .select('id', { count: 'exact', head: true }).eq('ativo', true);

  container.innerHTML = '';

  const grade = el('div', { class: 'seguranca-grade' });

  grade.append(
    cardStatus({
      icon: '🔒',
      titulo: 'Row Level Security (RLS)',
      relatorio: ultimoPorTipo.rls,
      conselheiro: 'Georgia Weidman',
      acao: { label: 'Auditar agora', onclick: () => rodarAuditoria('rls') },
    }),
    cardStatus({
      icon: '📜',
      titulo: 'Policies de acesso',
      relatorio: ultimoPorTipo.policies,
      conselheiro: 'Jim Manico',
    }),
    cardStatus({
      icon: '🛡',
      titulo: 'Funções SECURITY DEFINER',
      relatorio: ultimoPorTipo.security_definer,
      conselheiro: 'Omar Santos',
    }),
    cardStatus({
      icon: '🚨',
      titulo: 'Incidentes em aberto',
      status: incCriticos > 0 ? 'critical' : (totalIncidentes > 0 ? 'warning' : 'ok'),
      resumo: totalIncidentes === 0
        ? 'Nenhum incidente em aberto.'
        : `${totalIncidentes} incidente(s), ${incCriticos} crítico(s).`,
      conselheiro: 'Chris Sanders · Marcus Carey',
      acao: totalIncidentes > 0 ? { label: 'Ver incidentes', onclick: () => { aba = 'incidentes'; renderSeguranca(); } } : null,
    }),
    cardStatus({
      icon: '📊',
      titulo: 'Raio-X do banco',
      relatorio: ultimoPorTipo.raio_x_banco,
      conselheiro: 'Sanders',
      acao: { label: 'Atualizar', onclick: () => rodarRaioX() },
    }),
    cardStatus({
      icon: '🔑',
      titulo: 'Cofre de chaves (Vercel)',
      status: 'ok',
      resumo: 'Configuração via Vercel API. Painel mostra nomes mascarados.',
      conselheiro: 'Peter Kim',
      acao: { label: 'Abrir cofre', onclick: () => { aba = 'cofre'; renderSeguranca(); } },
    }),
    cardStatus({
      icon: '⚖',
      titulo: 'Políticas escritas',
      status: politicasAtivas > 0 ? 'ok' : 'warning',
      resumo: politicasAtivas === 0
        ? 'Nenhuma política escrita ainda. Princípio Dalio: feedback vira política, política não evapora.'
        : `${politicasAtivas} política(s) ativa(s).`,
      conselheiro: 'Ray Dalio',
      acao: { label: 'Ver políticas', onclick: () => { aba = 'politicas'; renderSeguranca(); } },
    }),
    cardStatus({
      icon: '🔍',
      titulo: 'Red Team (Hacker Playbook)',
      status: 'planejado',
      resumo: 'Agente cron simulando ataque diariamente — entra na Fase 2.',
      conselheiro: 'Peter Kim',
    }),
  );

  // Ações globais — visual padronizado, com tooltips
  const acoes = el('div', { class: 'seguranca-acoes-global' }, [
    el('button', {
      class: 'btn btn-primary',
      title: 'Squad Cyber roda auditoria completa do sistema (RLS + policies + funções SECURITY DEFINER + incidentes). Anima na tela enquanto roda.',
      onclick: () => rodarAuditoriaComAnimacao(),
    }, '▶ Rodar auditoria completa'),
    el('button', {
      class: 'btn btn-primary',
      style: 'background: var(--surface-3); color: var(--fg); border-color: var(--border)',
      title: 'Re-agrega tamanho e contagem real de cada tabela do banco. Atualiza a aba Raio-X.',
      onclick: () => rodarRaioXComToast(),
    }, '📊 Atualizar raio-X'),
  ]);

  container.append(acoes, grade);
}

function cardStatus({ icon, titulo, relatorio, status, resumo, conselheiro, acao }) {
  const st = status || (relatorio?.status) || 'unknown';
  const txt = resumo || (relatorio?.resumo) || (relatorio ? '' : 'Sem auditoria ainda — rode pra ver o estado.');
  const dataHora = relatorio?.criado_em
    ? new Date(relatorio.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;
  return el('div', { class: `seg-card seg-card-${st}` }, [
    el('div', { class: 'seg-card-head' }, [
      el('div', { class: 'seg-card-icon' }, icon),
      el('div', { class: 'seg-card-titulo' }, titulo),
      el('div', { class: `seg-badge seg-badge-${st}` }, labelStatus(st)),
    ]),
    el('div', { class: 'seg-card-resumo' }, txt),
    el('div', { class: 'seg-card-meta' }, [
      el('span', { class: 'seg-card-conselheiro' }, conselheiro ? `🎙 ${conselheiro}` : ''),
      dataHora ? el('span', { class: 'seg-card-data' }, dataHora) : null,
    ]),
    acao ? el('button', { class: 'btn btn-ghost seg-card-acao', onclick: acao.onclick }, acao.label) : null,
  ]);
}

function labelStatus(s) {
  return ({ ok: 'OK', warning: 'Atenção', critical: 'Crítico', unknown: 'Sem dado', planejado: 'Planejado' }[s] || s);
}

// ============================================================
// COFRE — gestao manual de chaves (Pinguim OS, agnostico de provedor)
// ============================================================
async function renderCofre(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) { container.innerHTML = '<div class="seguranca-erro">Sem conexão.</div>'; return; }

  const { data, error } = await sb.from('vw_cofre_chaves')
    .select('*').order('provedor').order('nome');
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  const total = (data || []).length;
  const porProvedor = {};
  (data || []).forEach(d => {
    porProvedor[d.provedor] = (porProvedor[d.provedor] || 0) + 1;
  });

  // Header com info + botao novo
  // Auditoria de uso (ultimas 24h)
  const { data: usoData } = await sb.rpc('listar_chaves_em_uso', { p_horas: 24 });
  const usoPorChave = {};
  (usoData || []).forEach(u => { usoPorChave[u.chave_nome] = u; });

  const headerInfo = el('div', { class: 'cofre-header' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:600;font-size:.9375rem' }, `${total} chave(s) cadastrada(s)`),
      el('div', { style: 'font-size:.8125rem;color:var(--fg-muted);margin-top:.25rem' },
        Object.entries(porProvedor).map(([p, n]) => `${p}: ${n}`).join(' · ') || 'Nenhuma chave ainda.'),
      el('div', { style: 'font-size:.75rem;color:var(--fg-dim);margin-top:.5rem;max-width:60ch' },
        '🛡 Cofre como fonte canônica. Edge Functions + scripts locais leem aqui (cache 5min). Rotação no painel = mudança ativa em todo o sistema sem deploy.'),
    ]),
    el('button', { class: 'btn btn-primary', onclick: () => abrirNovaChave(container) }, '+ Nova chave'),
  ]);

  container.append(headerInfo);

  // Bloco auditoria (so se houver uso registrado)
  if ((usoData || []).length > 0) {
    const auditoriaBloco = el('div', { class: 'cofre-auditoria' }, [
      el('div', { class: 'cofre-auditoria-titulo' }, '📊 Uso nas últimas 24h'),
      el('div', { class: 'cofre-auditoria-grid' }, usoData.map(u => {
        const sucessoPct = u.total_leituras > 0
          ? Math.round(((u.total_leituras - u.total_falhas) / u.total_leituras) * 100)
          : 0;
        const ultima = new Date(u.ultima_leitura);
        const minAtras = Math.round((Date.now() - ultima.getTime()) / 60000);
        return el('div', { class: 'cofre-auditoria-card' }, [
          el('div', { class: 'cofre-auditoria-chave' }, u.chave_nome),
          el('div', { class: 'cofre-auditoria-stats' }, [
            el('span', { class: 'cofre-auditoria-total' }, `${u.total_leituras} leituras`),
            el('span', { class: `cofre-auditoria-sucesso cofre-auditoria-sucesso-${sucessoPct === 100 ? 'ok' : sucessoPct > 0 ? 'warn' : 'err'}` },
              `${sucessoPct}% sucesso`),
          ]),
          el('div', { class: 'cofre-auditoria-meta' }, [
            el('span', {}, `${u.consumidores.length} consumidor(es): ${u.consumidores.slice(0, 3).join(', ')}${u.consumidores.length > 3 ? '...' : ''}`),
            el('span', {}, ` · última há ${minAtras < 60 ? minAtras + 'min' : Math.round(minAtras/60) + 'h'}`),
          ]),
        ]);
      })),
    ]);
    container.append(auditoriaBloco);
  }

  if (total === 0) {
    container.append(el('div', { class: 'seguranca-empty', style: 'margin-top:1rem' }, [
      el('div', { style: 'font-size:2rem;margin-bottom:.5rem' }, '🔑'),
      el('div', { style: 'font-weight:600;margin-bottom:.25rem' }, 'Cofre vazio'),
      el('div', { style: 'color:var(--fg-muted);max-width:50ch;margin:0 auto;font-size:.875rem' },
        'Cadastra cada chave que existe no projeto (OpenAI, Anthropic, Supabase, Vercel, etc). Valor fica criptografado, painel mostra só o nome + últimos 4 chars + onde a chave vive.'),
    ]));
    return;
  }

  const tabela = el('table', { class: 'cofre-tabela' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Nome'),
        el('th', {}, 'Provedor'),
        el('th', {}, 'Escopo'),
        el('th', {}, 'Onde vive'),
        el('th', {}, 'Últimos 4'),
        el('th', {}, 'Última rotação'),
        el('th', {}, ''),
      ]),
    ]),
    el('tbody', {}, (data || []).map(v => el('tr', {}, [
      el('td', { class: 'cofre-nome' }, v.nome),
      el('td', {}, [el('span', { class: `cofre-provedor cofre-provedor-${(v.provedor || '').toLowerCase()}` }, v.provedor)]),
      el('td', {}, [el('span', { class: `cofre-escopo cofre-escopo-${v.escopo}` }, v.escopo)]),
      el('td', { style: 'font-size:.75rem;color:var(--fg-muted)' }, v.onde_vive),
      el('td', { class: 'cofre-mascara' }, v.ultimos_4 ? '••••' + v.ultimos_4 : '—'),
      el('td', { class: 'cofre-data' },
        v.ultima_rotacao
          ? `há ${v.dias_desde_ultima_rotacao}d`
          : (v.ativo ? 'nunca' : 'inativa')),
      el('td', {}, [
        el('button', {
          class: 'btn btn-ghost', style: 'font-size:.7rem;padding:.25rem .5rem',
          onclick: () => abrirEditarChave(v.id, container),
        }, '✎'),
      ]),
    ]))),
  ]);

  container.append(tabela);
}

async function abrirNovaChave(refContainer) { abrirFormChave(null, refContainer); }
async function abrirEditarChave(id, refContainer) { abrirFormChave(id, refContainer); }

async function abrirFormChave(id, refContainer) {
  const sb = getSupabase();
  let valoresAtuais = {
    nome: '', provedor: 'OpenAI', escopo: 'secret', onde_vive: 'vercel-env',
    descricao: '', valor_completo: '', observacoes: '', ativo: true,
  };
  if (id) {
    const { data } = await sb.from('cofre_chaves').select('*').eq('id', id).single();
    if (data) valoresAtuais = data;
  }

  const back = el('div', { class: 'modal-backdrop', onclick: e => { if (e.target === back) fechar(); } });
  const card = el('div', { class: 'modal-card', style: 'max-width:640px' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const inputNome = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Ex.: OPENAI_API_KEY', required: 'required' });
  inputNome.value = valoresAtuais.nome || '';
  const selectProvedor = el('select', { class: 'novo-cerebro-input' });
  ['OpenAI', 'Anthropic', 'Google', 'Perplexity', 'Supabase', 'Vercel', 'GitHub', 'Stripe', 'Discord', 'Twilio', 'Email', 'Outro']
    .forEach(p => { const o = el('option', { value: p }, p); if (p === valoresAtuais.provedor) o.selected = true; selectProvedor.append(o); });
  const selectEscopo = el('select', { class: 'novo-cerebro-input' });
  [['public', 'public — exposto ao front'], ['secret', 'secret — só backend'], ['admin', 'admin — service_role / root']]
    .forEach(([v, l]) => { const o = el('option', { value: v }, l); if (v === valoresAtuais.escopo) o.selected = true; selectEscopo.append(o); });
  const selectOndeVive = el('select', { class: 'novo-cerebro-input' });
  [['vercel-env', 'Vercel env vars'], ['supabase-secret', 'Supabase Edge Function secrets'], ['github-secret', 'GitHub Actions secrets'], ['.env.local', 'Local .env.local'], ['outro', 'Outro']]
    .forEach(([v, l]) => { const o = el('option', { value: v }, l); if (v === valoresAtuais.onde_vive) o.selected = true; selectOndeVive.append(o); });

  const inputDesc = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Pra que serve' });
  inputDesc.value = valoresAtuais.descricao || '';

  const inputValor = el('input', { type: 'password', class: 'novo-cerebro-input', placeholder: id ? 'Deixa em branco pra manter o valor atual' : 'Cola a chave aqui', autocomplete: 'new-password' });

  const inputObs = el('textarea', { rows: '2', class: 'novo-cerebro-input', placeholder: 'Limites do plano, restrições, etc' });
  inputObs.value = valoresAtuais.observacoes || '';

  const checkAtivo = el('input', { type: 'checkbox' });
  checkAtivo.checked = valoresAtuais.ativo;

  // Wrappers consistentes — usa classe ao inves de inline style
  function campo(labelTxt, input, dica) {
    return el('div', { class: 'cofre-field' }, [
      el('label', { class: 'cofre-field-label' }, labelTxt),
      input,
      dica ? el('div', { class: 'cofre-field-dica' }, dica) : null,
    ]);
  }

  const form = el('form', {
    class: 'cofre-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const btnSubmit = e.submitter;
      const payload = {
        nome: inputNome.value.trim(),
        provedor: selectProvedor.value,
        escopo: selectEscopo.value,
        onde_vive: selectOndeVive.value,
        descricao: inputDesc.value.trim(),
        observacoes: inputObs.value.trim(),
        ativo: checkAtivo.checked,
      };
      const novoValor = inputValor.value.trim();
      if (novoValor) {
        payload.valor_completo = novoValor;
        payload.ultima_rotacao = new Date().toISOString();
      }

      // Validar chave contra o provedor antes de salvar (so OpenAI/Anthropic por enquanto)
      if (novoValor && (payload.provedor === 'OpenAI' || payload.provedor === 'Anthropic')) {
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Validando...'; }
        try {
          const { data: { session } } = await sb.auth.getSession();
          const r = await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/validar-chave`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': window.__ENV__.SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ provedor: payload.provedor, valor: novoValor }),
          });
          const data = await r.json();
          if (!data.valido) {
            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = id ? 'Salvar' : 'Cadastrar'; }
            const seguir = confirm(`⚠ A chave foi REJEITADA por ${payload.provedor}:\n\n"${data.motivo}"\n\nSalvar mesmo assim? (não vai funcionar até você corrigir)`);
            if (!seguir) return;
          }
        } catch (e2) {
          // erro de rede / função fora — segue sem bloquear
          console.warn('Validação não rodou:', e2);
        }
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Salvando...'; }
      }

      let result;
      if (id) result = await sb.from('cofre_chaves').update(payload).eq('id', id);
      else result = await sb.from('cofre_chaves').insert(payload);
      if (result.error) {
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = id ? 'Salvar' : 'Cadastrar'; }
        alert(result.error.message); return;
      }
      fechar();
      toast(id ? `✓ Chave ${payload.nome} atualizada. Sistema usa a nova em até 5 min.` : `✓ Chave ${payload.nome} cadastrada no cofre.`);
      await renderSeguranca();
    },
  }, [
    el('div', { class: 'cofre-row-2' }, [
      campo('Nome (ex.: OPENAI_API_KEY)', inputNome),
      campo('Provedor', selectProvedor),
    ]),
    el('div', { class: 'cofre-row-2' }, [
      campo('Escopo', selectEscopo),
      campo('Onde vive', selectOndeVive),
    ]),
    campo('Descrição', inputDesc, 'Pra que serve essa chave (ex.: usada por Edge Function buscar-cerebro)'),
    campo(
      id ? 'Novo valor (cola pra rotacionar — vazio mantém o atual)' : 'Valor da chave',
      inputValor,
      id ? null : 'Cola o valor da chave aqui. Fica criptografado no banco. O painel só mostra os últimos 4 chars.'
    ),
    campo('Observações', inputObs, 'Limites do plano, restrições, escopos (opcional)'),
    el('label', { class: 'cofre-checkbox-line' }, [checkAtivo, el('span', {}, 'Chave ativa')]),
    el('div', { class: 'cofre-form-footer' }, [
      id ? el('button', {
        type: 'button', class: 'btn btn-ghost cofre-btn-apagar',
        onclick: async () => {
          if (!confirm('Apagar essa chave do cofre? (não apaga do provedor — só do registro daqui)')) return;
          const nome = valoresAtuais.nome;
          const { error } = await sb.from('cofre_chaves').delete().eq('id', id);
          if (error) { alert(error.message); return; }
          fechar();
          toast(`✗ Chave ${nome} removida do cofre.`, 'aviso');
          await renderSeguranca();
        },
      }, 'Apagar') : el('span', {}),
      el('div', { class: 'cofre-form-acoes' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: fechar }, 'Cancelar'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, id ? 'Salvar' : 'Cadastrar'),
      ]),
    ]),
  ]);

  card.append(
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem' }, [
      el('div', {}, [
        el('div', { style: 'font-family:var(--font-heading);font-weight:600;font-size:1rem' }, id ? 'Editar chave' : 'Nova chave no cofre'),
        el('div', { style: 'font-size:.75rem;color:var(--fg-muted);margin-top:.125rem' }, 'O valor é criptografado em RLS. O painel só mostra os últimos 4 chars.'),
      ]),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    form,
  );
  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

// ============================================================
// RAIO-X — tabelas, linhas, plano
// ============================================================
async function renderRaioX(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) { container.innerHTML = '<div class="seguranca-erro">Sem conexão.</div>'; return; }

  const { data: { session } } = await sb.auth.getSession();
  const fnUrl = `${window.__ENV__.SUPABASE_URL}/functions/v1/raio-x-banco`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!resp.ok) {
    container.append(el('div', { class: 'seguranca-erro' }, `Erro ${resp.status} ao consultar raio-X.`));
    return;
  }
  const dados = await resp.json();

  const tamanhoMB = dados.tamanho_total_bytes / 1024 / 1024;
  const limiteMB = dados.plano_limite_bytes / 1024 / 1024;
  const pct = dados.pct_plano || 0;
  const status = pct >= 90 ? 'critical' : (pct >= 70 ? 'warning' : 'ok');

  const head = el('div', { class: 'raiox-head' }, [
    el('div', { class: 'raiox-pct-wrap' }, [
      el('div', { class: 'raiox-pct-label' }, `${tamanhoMB.toFixed(2)} MB / ${limiteMB.toFixed(0)} MB`),
      el('div', { class: 'raiox-bar-bg' }, [
        el('div', { class: `raiox-bar-fg raiox-bar-${status}`, style: `width:${Math.min(100, pct)}%` }),
      ]),
      el('div', { class: 'raiox-pct-num' }, `${pct.toFixed(2)}% do plano`),
    ]),
    dados.projecao?.dias_para_estourar != null
      ? el('div', { class: 'raiox-projecao' },
          `Projeção: estoura em ~${dados.projecao.dias_para_estourar} dias (${(dados.projecao.taxa_crescimento_dia_bytes / 1024).toFixed(1)} KB/dia)`)
      : el('div', { class: 'raiox-projecao raiox-projecao-vazia' }, 'Projeção: histórico ainda curto.'),
  ]);

  const tabela = el('table', { class: 'raiox-tabela' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Tabela'),
        el('th', { style: 'text-align:right' }, 'Linhas (estimadas)'),
        el('th', { style: 'text-align:right' }, 'Linhas (exatas)'),
        el('th', { style: 'text-align:right' }, 'Tamanho total'),
        el('th', { style: 'text-align:right' }, 'Dados'),
        el('th', { style: 'text-align:right' }, 'Índices'),
      ]),
    ]),
    el('tbody', {}, (dados.tabelas || []).map(t => el('tr', {}, [
      el('td', {}, t.tabela),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, fmtNum(t.total_linhas_estimado)),
      el('td', { style: 'text-align:right' }, t.total_linhas_exato != null ? fmtNum(t.total_linhas_exato) : '—'),
      el('td', { style: 'text-align:right' }, fmtBytes(t.tamanho_total_bytes)),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, fmtBytes(t.tamanho_dados_bytes)),
      el('td', { style: 'text-align:right;color:var(--fg-muted)' }, fmtBytes(t.tamanho_indices_bytes)),
    ]))),
  ]);

  container.append(head, tabela);
}

function fmtNum(n) {
  if (n == null || n < 0) return '—';
  return new Intl.NumberFormat('pt-BR').format(n);
}
function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// ============================================================
// INCIDENTES
// ============================================================
async function renderIncidentes(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb.from('seguranca_incidentes')
    .select('*').order('criado_em', { ascending: false }).limit(100);
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }

  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' }, [
      el('div', { style: 'font-size:2rem;margin-bottom:.5rem' }, '✅'),
      el('div', { style: 'font-weight:600' }, 'Nenhum incidente registrado'),
      el('div', { style: 'color:var(--fg-muted);font-size:.875rem;margin-top:.25rem' },
        'Quando o trigger detectar tabela sem RLS, ou IDS detectar anomalia, aparece aqui.'),
    ]));
    return;
  }

  const tabela = el('table', { class: 'incidentes-tabela' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Quando'),
        el('th', {}, 'Tipo'),
        el('th', {}, 'Severidade'),
        el('th', {}, 'Recurso'),
        el('th', {}, 'Ação'),
        el('th', {}, 'Status'),
      ]),
    ]),
    el('tbody', {}, data.map(i => el('tr', { class: i.resolvido ? 'incidente-resolvido' : '' }, [
      el('td', {}, new Date(i.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
      el('td', {}, i.tipo),
      el('td', {}, [el('span', { class: `incidente-sev incidente-sev-${i.severidade}` }, i.severidade)]),
      el('td', { style: 'font-family:var(--font-mono);font-size:.75rem' }, i.recurso || '—'),
      el('td', {}, i.acao_tomada || '—'),
      el('td', {}, i.resolvido ? 'Resolvido' : 'Aberto'),
    ]))),
  ]);

  container.append(tabela);
}

// ============================================================
// POLITICAS
// ============================================================
async function renderPoliticas(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  if (!sb) return;

  const { data } = await sb.from('politicas_seguranca').select('*').order('criado_em', { ascending: false });

  const novaBtn = el('button', { class: 'btn btn-primary', style: 'margin-bottom:1rem', onclick: () => abrirNovaPolitica(container) },
    '+ Nova política');
  container.append(novaBtn);

  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' }, [
      el('div', { style: 'font-size:2rem;margin-bottom:.5rem' }, '⚖'),
      el('div', { style: 'font-weight:600' }, 'Nenhuma política escrita'),
      el('div', { style: 'color:var(--fg-muted);font-size:.875rem;margin-top:.5rem;max-width:60ch;margin-inline:auto' },
        'Princípio Ray Dalio: cada decisão de segurança vira política escrita. Da próxima vez, consulta a política em vez de redecidir.'),
    ]));
    return;
  }

  const lista = el('div', { class: 'politicas-lista' });
  data.forEach(p => {
    lista.append(el('div', { class: `politica-card politica-${p.ativo ? 'ativa' : 'inativa'}` }, [
      el('div', { class: 'politica-head' }, [
        el('div', { class: 'politica-titulo' }, p.titulo),
        el('span', { class: `politica-badge politica-badge-${p.escopo}` }, p.escopo),
        el('span', { class: 'politica-origem' }, p.origem || 'manual'),
      ]),
      el('div', { class: 'politica-desc' }, p.descricao || ''),
      el('pre', { class: 'politica-regra' }, p.regra_md),
    ]));
  });
  container.append(lista);
}

async function abrirNovaPolitica(refContainer) {
  const sb = getSupabase();
  const back = el('div', { class: 'modal-backdrop', onclick: e => { if (e.target === back) fechar(); } });
  const card = el('div', { class: 'modal-card', style: 'max-width:640px' });
  function fechar() { back.classList.remove('open'); setTimeout(() => back.remove(), 180); }

  const inputTitulo = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Ex.: RLS obrigatório em toda tabela', required: 'required' });
  const inputDesc = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Descrição curta' });
  const selectEscopo = el('select', { class: 'novo-cerebro-input' }, [
    el('option', { value: 'global' }, 'Global'),
    el('option', { value: 'agente' }, 'Agente específico'),
    el('option', { value: 'tool' }, 'Tool específica'),
    el('option', { value: 'tabela' }, 'Tabela específica'),
  ]);
  const inputAlvo = el('input', { type: 'text', class: 'novo-cerebro-input', placeholder: 'Slug do alvo (vazio se global)' });
  const textareaRegra = el('textarea', { rows: '8', class: 'novo-cerebro-input', placeholder: 'A regra em markdown. Liste princípio, motivo e como aplicar.', required: 'required' });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const titulo = inputTitulo.value.trim();
      const slug = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { error } = await sb.from('politicas_seguranca').insert({
        slug, titulo, descricao: inputDesc.value.trim(),
        regra_md: textareaRegra.value.trim(),
        escopo: selectEscopo.value,
        alvo: inputAlvo.value.trim() || null,
        origem: 'manual',
      });
      if (error) { alert(error.message); return; }
      fechar();
      toast(`✓ Política "${titulo}" salva.`);
      await renderSeguranca();
    },
  }, [
    el('label', { class: 'novo-cerebro-label' }, 'Título'),
    inputTitulo,
    el('label', { class: 'novo-cerebro-label', style: 'margin-top:.75rem' }, 'Descrição'),
    inputDesc,
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:.75rem' }, [
      el('div', {}, [el('label', { class: 'novo-cerebro-label' }, 'Escopo'), selectEscopo]),
      el('div', {}, [el('label', { class: 'novo-cerebro-label' }, 'Alvo (opcional)'), inputAlvo]),
    ]),
    el('label', { class: 'novo-cerebro-label', style: 'margin-top:.75rem' }, 'Regra (markdown)'),
    textareaRegra,
    el('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: fechar }, 'Cancelar'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar política'),
    ]),
  ]);
  card.append(
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem' }, [
      el('div', { style: 'font-family:var(--font-heading);font-weight:600;font-size:1rem' }, 'Nova política de segurança'),
      el('button', { class: 'modal-close', onclick: fechar }, '×'),
    ]),
    form,
  );
  back.append(card);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

// ============================================================
// AUDITORIA — historico
// ============================================================
async function renderAuditoria(container) {
  container.innerHTML = '';
  const sb = getSupabase();
  const { data, error } = await sb.from('seguranca_relatorios')
    .select('*').order('criado_em', { ascending: false }).limit(50);
  if (error) { container.append(el('div', { class: 'seguranca-erro' }, error.message)); return; }
  if (!data || data.length === 0) {
    container.append(el('div', { class: 'seguranca-empty' },
      'Nenhum relatório ainda. Roda uma auditoria pra começar a popular o histórico.'));
    return;
  }
  const tabela = el('table', { class: 'auditoria-tabela' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', {}, 'Quando'), el('th', {}, 'Tipo'), el('th', {}, 'Status'), el('th', {}, 'Resumo'), el('th', { style: 'text-align:right' }, 'Falhas/Total'),
    ])]),
    el('tbody', {}, data.map(r => el('tr', {}, [
      el('td', {}, new Date(r.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
      el('td', {}, r.tipo),
      el('td', {}, [el('span', { class: `seg-badge seg-badge-${r.status}` }, labelStatus(r.status))]),
      el('td', { style: 'max-width:60ch' }, r.resumo),
      el('td', { style: 'text-align:right' }, `${r.total_falhas || 0} / ${r.total_checks || 0}`),
    ]))),
  ]);
  container.append(tabela);
}

// ============================================================
// Acoes
// ============================================================

// Auditoria completa COM animacao do Squad Cyber.
// 6 conselheiros aparecem trabalhando enquanto a Edge Function roda
// em paralelo. Quando termina, mostra resultado dos checks no log.
async function rodarAuditoriaComAnimacao() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const apiCall = () => fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/auditar-seguranca`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  }).then(async r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

  try {
    const resultado = await abrirSquadCyberModal({
      titulo: 'Auditoria completa do sistema',
      subtitulo: 'Squad Cyber rodando 4 checks (RLS, policies, security definer, incidentes)',
      apiCall,
    });
    const status = resultado?.status_geral || 'ok';
    if (status === 'ok') {
      toast('✓ Auditoria concluída — sistema OK.', 'sucesso');
    } else if (status === 'warning') {
      toast('⚠ Auditoria concluída com avisos. Veja Histórico.', 'aviso');
    } else {
      toast('⚠ Auditoria detectou problemas críticos. Veja Incidentes.', 'erro');
    }
  } catch (e) {
    toast('✗ Erro na auditoria: ' + (e.message || e), 'erro');
  }
  await renderSeguranca();
}

// Versao legado (sem animacao) — usada por cardStatus quando user clica
// "Auditar agora" num card especifico
async function rodarAuditoriaCompleta() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/auditar-seguranca`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  await renderSeguranca();
}

async function rodarAuditoria(tipo) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/auditar-seguranca`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tipos: [tipo] }),
  });
  await renderSeguranca();
}

async function rodarRaioX() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/raio-x-banco`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  await renderSeguranca();
}

async function rodarRaioXComToast() {
  toast('📊 Atualizando raio-X do banco...', 'sucesso');
  try {
    await rodarRaioX();
    toast('✓ Raio-X atualizado.', 'sucesso');
  } catch (e) {
    toast('✗ Erro ao atualizar raio-X: ' + (e.message || e), 'erro');
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Toast de confirmacao (aparece 3s no canto inferior direito)
function toast(mensagem, tipo = 'sucesso') {
  const t = el('div', {
    class: `seg-toast seg-toast-${tipo}`,
    role: 'status',
  }, mensagem);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('seg-toast-visible'));
  setTimeout(() => {
    t.classList.remove('seg-toast-visible');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}
