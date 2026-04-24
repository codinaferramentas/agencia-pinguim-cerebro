/* Mission Control — Personas v2
   Dossie com 11 blocos. Caminho C hibrido (preservar edicao manual).
   Export PDF estruturado via window.print com CSS print-friendly.
*/

import { getSupabaseClient } from './sb-client.js';

const CAMPOS = [
  'identidade', 'rotina', 'nivel_consciencia', 'jobs_to_be_done',
  'vozes_cabeca', 'desejos_reais', 'crencas_limitantes',
  'dores_latentes', 'objecoes_compra', 'vocabulario', 'onde_vive',
];

const BLOCOS = [
  { key: 'identidade', titulo: 'Identidade', icon: '▣', hint: 'Dados basicos' },
  { key: 'rotina', titulo: 'Rotina', icon: '◐', hint: 'Dia a dia + desafios' },
  { key: 'nivel_consciencia', titulo: 'Nivel de consciencia', icon: '◉', hint: 'Schwartz · 5 estagios' },
  { key: 'jobs_to_be_done', titulo: 'Jobs to be Done', icon: '▸', hint: 'Funcional · Emocional · Social' },
  { key: 'vozes_cabeca', titulo: 'Vozes da cabeca', icon: '❝', hint: 'Pensamentos em silencio' },
  { key: 'desejos_reais', titulo: 'Desejos reais', icon: '✦', hint: 'Reprimidos ou adiados' },
  { key: 'crencas_limitantes', titulo: 'Crencas limitantes', icon: '▼', hint: 'O que a impede' },
  { key: 'dores_latentes', titulo: 'Dores latentes', icon: '◈', hint: 'Frustracoes do dia a dia' },
  { key: 'objecoes_compra', titulo: 'Objecoes de compra', icon: '✕', hint: 'Pra script comercial' },
  { key: 'vocabulario', titulo: 'Vocabulario', icon: '≡', hint: 'Palavras reais + porque' },
  { key: 'onde_vive', titulo: 'Onde vive', icon: '◯', hint: 'Comunidades · Influenciadores' },
];

export async function fetchPersonaCompleta(slug) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data: prod } = await sb.from('produtos').select('id').eq('slug', slug).single();
  if (!prod) return null;
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
  if (!cer) return null;
  const { data: persona } = await sb.from('personas').select('*').eq('cerebro_id', cer.id).maybeSingle();
  return persona || null;
}

export async function gerarPersonaComProgresso(slug, onEtapa) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase nao conectado');
  const { data: { session } } = await sb.auth.getSession();

  onEtapa?.({ etapa: 1, total: 4, label: 'Buscando fontes do Cerebro' });
  await new Promise(r => setTimeout(r, 300));

  onEtapa?.({ etapa: 2, total: 4, label: 'Preparando contexto' });
  await new Promise(r => setTimeout(r, 300));

  onEtapa?.({ etapa: 3, total: 4, label: 'Analisando com IA (pode levar 30s)' });

  const resp = await fetch(`${window.__ENV__.SUPABASE_URL}/functions/v1/gerar-persona`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || window.__ENV__.SUPABASE_ANON_KEY}`,
      'apikey': window.__ENV__.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ cerebro_slug: slug }),
  });

  const j = await resp.json();
  if (!resp.ok || j.error) throw new Error(j.error || `HTTP ${resp.status}`);

  onEtapa?.({ etapa: 4, total: 4, label: 'Salvando persona' });
  await new Promise(r => setTimeout(r, 200));

  return j;
}

export async function salvarEdicaoCampo(personaId, campo, novoValor) {
  const sb = getSupabaseClient();
  const { data: atual } = await sb.from('personas').select('campos_editados').eq('id', personaId).single();
  const editados = new Set(atual?.campos_editados || []);
  editados.add(campo);

  const update = {
    [campo]: novoValor,
    campos_editados: [...editados],
    atualizado_em: new Date().toISOString(),
  };

  const { error } = await sb.from('personas').update(update).eq('id', personaId);
  if (error) throw error;
}

export function exportarPDF(persona, cerebroNome) {
  const html = gerarHTMLPDF(persona, cerebroNome);
  const win = window.open('', '_blank', 'width=900,height=1200');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

function renderListaHTML(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '<p class="vazio">—</p>';
  return '<ol>' + arr.map(item => `<li>${escapeHTML(String(item))}</li>`).join('') + '</ol>';
}

function renderVocabularioHTML(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '<p class="vazio">—</p>';
  return '<table><thead><tr><th>Palavra</th><th>Por que usa</th></tr></thead><tbody>' +
    arr.map(item => {
      const palavra = typeof item === 'object' ? item.palavra : item;
      const porque = typeof item === 'object' ? (item.por_que_usa || '') : '';
      return `<tr><td><strong>${escapeHTML(String(palavra))}</strong></td><td>${escapeHTML(String(porque))}</td></tr>`;
    }).join('') + '</tbody></table>';
}

function renderObjetoHTML(obj, ordem) {
  if (!obj || typeof obj !== 'object') return '<p class="vazio">—</p>';
  const keys = ordem || Object.keys(obj);
  return '<dl>' + keys.map(k => {
    const v = obj[k];
    if (v == null) return '';
    return `<dt>${escapeHTML(formatarLabel(k))}</dt><dd>${escapeHTML(String(v))}</dd>`;
  }).filter(Boolean).join('') + '</dl>';
}

function formatarLabel(key) {
  return key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function gerarHTMLPDF(persona, cerebroNome) {
  const blocoHTML = (b) => {
    const val = persona[b.key];
    let inner = '';
    if (b.key === 'vocabulario') inner = renderVocabularioHTML(val);
    else if (Array.isArray(val)) inner = renderListaHTML(val);
    else if (val && typeof val === 'object') inner = renderObjetoHTML(val);
    else inner = val ? `<p>${escapeHTML(String(val))}</p>` : '<p class="vazio">—</p>';
    return `
      <section class="bloco">
        <h2>${b.icon} ${b.titulo}</h2>
        <div class="hint">${b.hint}</div>
        ${inner}
      </section>`;
  };

  const data = new Date(persona.atualizado_em).toLocaleString('pt-BR');
  const fontes = persona.fontes_usadas || '—';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Persona ${escapeHTML(cerebroNome)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a; line-height: 1.55; font-size: 11pt;
    max-width: 780px; margin: 0 auto; padding: 12px;
  }
  header.top { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 28px; }
  header h1 { font-size: 24pt; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.02em; }
  header .sub { color: #666; font-size: 10pt; }
  header .meta { display: flex; gap: 22px; margin-top: 12px; font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.06em; }
  header .meta span strong { color: #111; }

  section.bloco { break-inside: avoid; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eee; }
  section.bloco:last-child { border-bottom: 0; }
  section.bloco h2 {
    font-size: 13pt; font-weight: 700; margin: 0 0 4px; color: #111;
    letter-spacing: -0.01em;
  }
  section.bloco .hint { color: #888; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }

  ol { padding-left: 22px; margin: 0; }
  ol li { margin-bottom: 6px; }

  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table th, table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 10pt; vertical-align: top; }
  table th { background: #fafafa; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.06em; font-size: 8pt; }
  table td strong { color: #111; }

  dl { margin: 0; }
  dt { font-weight: 700; color: #111; margin-top: 10px; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.04em; }
  dt:first-child { margin-top: 0; }
  dd { margin: 2px 0 0; padding: 0; color: #333; }

  .vazio { color: #aaa; font-style: italic; }

  footer.fim { margin-top: 32px; padding-top: 14px; border-top: 1px solid #ddd; font-size: 8.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }

  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <header class="top">
    <h1>Persona · ${escapeHTML(cerebroNome)}</h1>
    <div class="sub">Dossie sintetizado automaticamente pelo Cerebro Pinguim.</div>
    <div class="meta">
      <span><strong>Fontes usadas:</strong> ${fontes}</span>
      <span><strong>Gerado em:</strong> ${escapeHTML(data)}</span>
      <span><strong>Modelo:</strong> ${escapeHTML(persona.modelo || '—')}</span>
      <span><strong>Versao:</strong> ${persona.versao || 1}</span>
    </div>
  </header>

  ${BLOCOS.map(blocoHTML).join('')}

  <footer class="fim">
    Pinguim · Mission Control · ${new Date().getFullYear()}
  </footer>

  <script>window.addEventListener('afterprint', () => window.close());</script>
</body>
</html>`;
}

/* ================= UI de renderizacao no painel ================= */

export function renderBlocoNoPainel(persona, cerebro) {
  const frag = document.createDocumentFragment();
  for (const b of BLOCOS) {
    frag.appendChild(criarBlocoCard(b, persona));
  }
  return frag;
}

function criarBlocoCard(bloco, persona) {
  const val = persona[bloco.key];
  const foiEditado = (persona.campos_editados || []).includes(bloco.key);

  const card = document.createElement('div');
  card.className = 'persona-bloco';
  card.dataset.campo = bloco.key;

  const header = document.createElement('div');
  header.className = 'persona-bloco-header';
  header.innerHTML = `
    <div class="persona-bloco-title">
      <span class="persona-bloco-icon">${bloco.icon}</span>
      <div>
        <h3>${bloco.titulo}${foiEditado ? ' <span class="persona-bloco-editado" title="Editado manualmente — regenerar nao sobrescreve">✎ editado</span>' : ''}</h3>
        <div class="persona-bloco-hint">${bloco.hint}</div>
      </div>
    </div>
    <button class="persona-bloco-edit" type="button" title="Editar manualmente">✎ Editar</button>
  `;
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'persona-bloco-body';
  body.innerHTML = renderValorHTML(bloco.key, val);
  card.appendChild(body);

  header.querySelector('.persona-bloco-edit').addEventListener('click', () => {
    abrirEditorCampo(persona, bloco, card);
  });

  return card;
}

function renderValorHTML(key, val) {
  if (val == null) return '<div class="persona-vazio">— vazio —</div>';
  if (key === 'vocabulario' && Array.isArray(val)) {
    return '<table class="persona-tabela"><thead><tr><th>Palavra</th><th>Por que usa</th></tr></thead><tbody>' +
      val.map(item => {
        const p = typeof item === 'object' ? item.palavra : item;
        const porque = typeof item === 'object' ? (item.por_que_usa || '') : '';
        return `<tr><td><strong>${escapeHTML(String(p))}</strong></td><td>${escapeHTML(String(porque))}</td></tr>`;
      }).join('') + '</tbody></table>';
  }
  if (Array.isArray(val)) return '<ol class="persona-lista">' + val.map(i => `<li>${escapeHTML(String(i))}</li>`).join('') + '</ol>';
  if (typeof val === 'object') return renderObjetoHTML(val);
  return `<p>${escapeHTML(String(val))}</p>`;
}

function abrirEditorCampo(persona, bloco, card) {
  const val = persona[bloco.key];
  let textoAtual = '';
  if (Array.isArray(val)) {
    if (bloco.key === 'vocabulario') {
      textoAtual = val.map(i => typeof i === 'object' ? `${i.palavra} :: ${i.por_que_usa || ''}` : String(i)).join('\n');
    } else {
      textoAtual = val.map(i => String(i)).join('\n');
    }
  } else if (val && typeof val === 'object') {
    textoAtual = Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('\n');
  } else {
    textoAtual = val ? String(val) : '';
  }

  const overlay = document.createElement('div');
  overlay.className = 'persona-editor-overlay';
  overlay.innerHTML = `
    <div class="persona-editor">
      <div class="persona-editor-header">
        <div>
          <h3>Editar: ${bloco.titulo}</h3>
          <div class="persona-editor-hint">${formatoDica(bloco.key)}</div>
        </div>
        <button class="persona-editor-close" type="button">×</button>
      </div>
      <textarea class="persona-editor-text">${escapeHTML(textoAtual)}</textarea>
      <div class="persona-editor-footer">
        <button class="btn btn-ghost" data-acao="cancelar">Cancelar</button>
        <button class="btn btn-primary" data-acao="salvar">Salvar edicao</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.querySelector('.persona-editor-close').addEventListener('click', fechar);
  overlay.querySelector('[data-acao="cancelar"]').addEventListener('click', fechar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });

  overlay.querySelector('[data-acao="salvar"]').addEventListener('click', async () => {
    const txt = overlay.querySelector('.persona-editor-text').value;
    const btn = overlay.querySelector('[data-acao="salvar"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const novoValor = parseTextoEdicao(bloco.key, txt, val);
      await salvarEdicaoCampo(persona.id, bloco.key, novoValor);
      fechar();
      window.dispatchEvent(new CustomEvent('persona:reload'));
    } catch (e) {
      alert('Falha ao salvar: ' + e.message);
      btn.disabled = false; btn.textContent = 'Salvar edicao';
    }
  });
}

function parseTextoEdicao(key, texto, valOriginal) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  if (Array.isArray(valOriginal)) {
    if (key === 'vocabulario') {
      return linhas.map(l => {
        const [palavra, ...rest] = l.split('::');
        return { palavra: palavra.trim(), por_que_usa: rest.join('::').trim() };
      });
    }
    return linhas;
  }
  if (valOriginal && typeof valOriginal === 'object') {
    const obj = {};
    linhas.forEach(l => {
      const idx = l.indexOf(':');
      if (idx > 0) {
        const k = l.slice(0, idx).trim();
        const v = l.slice(idx + 1).trim();
        obj[k] = v;
      }
    });
    return obj;
  }
  return texto.trim();
}

function formatoDica(key) {
  if (key === 'vocabulario') return 'Uma palavra por linha no formato: palavra :: por que usa';
  if (['vozes_cabeca','desejos_reais','crencas_limitantes','dores_latentes','objecoes_compra'].includes(key)) {
    return 'Uma frase por linha.';
  }
  if (['identidade','rotina','nivel_consciencia','jobs_to_be_done','onde_vive'].includes(key)) {
    return 'Um campo por linha no formato: chave: valor';
  }
  return '';
}
