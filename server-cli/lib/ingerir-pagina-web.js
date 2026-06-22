// ============================================================
// ingerir-pagina-web.js — V1 (2026-06-21)
// ============================================================
// Lib pra ingerir HTML estatico publico como fonte do cerebro,
// SEM passar pela Edge de briefing comercial (tool-clonar-pagina-venda).
//
// Caso de uso: material_apoio do produto (playbooks, protocolos,
// material educacional em pagina web publica). Diferente de pagina_venda,
// onde a Edge gera briefing comercial estilo "carta de venda".
//
// Funciona:
// 1. fetch direto da URL (sem auth, sem Apify, custo zero)
// 2. parse HTML -> markdown limpo (H1/H2/H3 + paragrafos + listas)
// 3. md5 do conteudo pra idempotencia (se igual, pula)
// 4. salva como cerebro_fonte com tipo_fonte configurado, vetoriza
// 5. marca plano executado
//
// Limitacoes:
// - SO HTML estatico (SPA precisa do _other_ caminho via Apify Chromium)
// - Sem login (pagina publica)
// ============================================================

const crypto = require('crypto');
const db = require('./db');
const { vetorizarFonte } = require('./vetorizar-fonte');

async function ingerirPaginaWeb({
  cerebro_id,
  categoria_slug,
  url_alvo,
  tipo_fonte = 'material_apoio',
  on_log = () => {},
}) {
  if (!cerebro_id) throw new Error('cerebro_id obrigatorio');
  if (!categoria_slug) throw new Error('categoria_slug obrigatorio');
  if (!url_alvo) throw new Error('url_alvo obrigatorio');

  on_log({ etapa: 'inicio', url_alvo });

  // 1. Fetch HTML
  let html;
  try {
    const r = await fetch(url_alvo, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Pinguim Cerebro Crawler)' },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    html = await r.text();
  } catch (e) {
    on_log({ etapa: 'falha_fetch', erro: e.message });
    await db.marcarPlanoExecutado({ cerebro_id, categoria_slug, status: 'falha', erro_msg: e.message });
    return { total_urls: 1, novos: 0, falhas: 1, ja_processados: 0, detalhes: [{ url: url_alvo, ok: false, erro: e.message }] };
  }
  on_log({ etapa: 'baixou_html', bytes: html.length });

  // 2. Parse -> markdown
  const { titulo, markdown } = _htmlParaMarkdown(html);
  on_log({ etapa: 'parseou', titulo, chars_md: markdown.length });

  if (markdown.length < 200) {
    on_log({ etapa: 'conteudo_curto', motivo: 'menos de 200 chars apos parse' });
    await db.marcarPlanoExecutado({ cerebro_id, categoria_slug, status: 'falha', erro_msg: 'conteudo muito curto apos parse (<200 chars)' });
    return { total_urls: 1, novos: 0, falhas: 1, ja_processados: 0, detalhes: [{ url: url_alvo, ok: false, erro: 'conteudo muito curto' }] };
  }

  // 3. md5 pra idempotencia
  const md5 = crypto.createHash('md5').update(markdown).digest('hex');

  const jaProc = await db.rodarSQL(`
    SELECT fonte_externa_id FROM pinguim.fontes_processadas
     WHERE cerebro_id = '${cerebro_id}'::uuid
       AND categoria_slug = '${categoria_slug.replace(/'/g, "''")}'
       AND fonte_origem = 'web_direto'
       AND fonte_externa_id = '${md5}'
     LIMIT 1;
  `);
  if (jaProc && jaProc.length > 0) {
    on_log({ etapa: 'ja_processado', md5 });
    await db.marcarPlanoExecutado({ cerebro_id, categoria_slug, status: 'sem_match' });
    return { total_urls: 1, novos: 0, falhas: 0, ja_processados: 1, detalhes: [{ url: url_alvo, ok: true, md5, motivo: 'ja_processado_mesmo_md5' }] };
  }

  // 4. Salva fonte via REST (payload pode ser grande)
  let fonteId;
  try {
    const novo = await db.inserirFonteRest({
      cerebro_id,
      tipo: tipo_fonte,
      titulo: titulo.slice(0, 200),
      origem: 'web_direto',
      url: url_alvo,
      conteudo_md: markdown,
    });
    fonteId = novo.id;
    on_log({ etapa: 'salvou', cerebro_fonte_id: fonteId });
  } catch (e) {
    on_log({ etapa: 'falha_insert', erro: e.message });
    await db.marcarPlanoExecutado({ cerebro_id, categoria_slug, status: 'falha', erro_msg: e.message });
    return { total_urls: 1, novos: 0, falhas: 1, ja_processados: 0, detalhes: [{ url: url_alvo, ok: false, erro: e.message }] };
  }

  // 5. Marca processado
  await db.rodarSQL(`
    INSERT INTO pinguim.fontes_processadas
      (cerebro_id, categoria_slug, fonte_externa_id, fonte_origem, cerebro_fonte_id, metadata)
    VALUES (
      '${cerebro_id}'::uuid,
      '${categoria_slug.replace(/'/g, "''")}',
      '${md5}',
      'web_direto',
      '${fonteId}'::uuid,
      '${JSON.stringify({ url: url_alvo, chars: markdown.length, html_bytes: html.length }).replace(/'/g, "''")}'::jsonb
    )
    ON CONFLICT DO NOTHING;
  `);

  // 6. Vetoriza
  const vet = await vetorizarFonte(fonteId);
  on_log({ etapa: 'vetorizado', ok: vet.ok, chunks: vet.chunks });

  // 7. Marca plano
  await db.marcarPlanoExecutado({ cerebro_id, categoria_slug, status: 'ok' });

  return {
    total_urls: 1,
    novos: 1,
    falhas: 0,
    ja_processados: 0,
    detalhes: [{ url: url_alvo, ok: true, md5, cerebro_fonte_id: fonteId, chars: markdown.length, vetorizado: vet.ok, chunks: vet.chunks }],
  };
}

// ============================================================
// Parser HTML -> Markdown
// ============================================================
function _htmlParaMarkdown(html) {
  // Extrai titulo
  let titulo = 'Pagina web';
  const mTitulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (mTitulo) titulo = _decodeEntities(mTitulo[1]).trim();

  // Pega so o body
  let body = html;
  const mBody = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (mBody) body = mBody[1];

  // Remove script, style, noscript inteiros
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  body = body.replace(/<style[\s\S]*?<\/style>/gi, '');
  body = body.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  // Quebra em blocos por tags estruturais — guarda hierarquia
  const linhas = [];
  // Cada match desses vira uma linha de saida
  const padroes = [
    // Headings
    { re: /<h1[^>]*>([\s\S]*?)<\/h1>/gi, fmt: (t) => `\n# ${t}\n` },
    { re: /<h2[^>]*>([\s\S]*?)<\/h2>/gi, fmt: (t) => `\n## ${t}\n` },
    { re: /<h3[^>]*>([\s\S]*?)<\/h3>/gi, fmt: (t) => `\n### ${t}\n` },
    { re: /<h4[^>]*>([\s\S]*?)<\/h4>/gi, fmt: (t) => `\n#### ${t}\n` },
    { re: /<h5[^>]*>([\s\S]*?)<\/h5>/gi, fmt: (t) => `\n##### ${t}\n` },
    { re: /<h6[^>]*>([\s\S]*?)<\/h6>/gi, fmt: (t) => `\n###### ${t}\n` },
    // List items
    { re: /<li[^>]*>([\s\S]*?)<\/li>/gi, fmt: (t) => `- ${t}` },
    // Paragrafos
    { re: /<p[^>]*>([\s\S]*?)<\/p>/gi, fmt: (t) => `\n${t}\n` },
    // Quotes
    { re: /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, fmt: (t) => `\n> ${t}\n` },
  ];

  // Estrategia: itera achando QUALQUER um desses, em ordem do offset
  const matches = [];
  for (const p of padroes) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(body)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, texto: m[1], fmt: p.fmt });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  // Anti-aninhamento: remove match que comeca dentro de outro mais externo (ex: <p><a>X</a></p>)
  const usados = [];
  for (const m of matches) {
    const dentro = usados.some(u => m.start >= u.start && m.end <= u.end);
    if (!dentro) usados.push(m);
  }

  for (const m of usados) {
    const t = _limpaTexto(m.texto);
    if (t) linhas.push(m.fmt(t));
  }

  // Junta + normaliza multiplas quebras
  let md = linhas.join('\n');
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return { titulo, markdown: md };
}

function _limpaTexto(s) {
  if (!s) return '';
  // Remove tags HTML residuais
  s = s.replace(/<[^>]+>/g, ' ');
  // Decodifica entidades comuns
  s = _decodeEntities(s);
  // Normaliza espacos
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function _decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

module.exports = { ingerirPaginaWeb, _htmlParaMarkdown };
