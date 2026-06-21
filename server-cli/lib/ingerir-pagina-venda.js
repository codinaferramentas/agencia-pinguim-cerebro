// ============================================================
// ingerir-pagina-venda.js — V3 (2026-06-16)
// ============================================================
// Lib generica pra ingerir paginas de venda como fonte de cerebro.
// Chama a Edge Function tool-clonar-pagina-venda (Apify Chromium real)
// que ja salva HTML+briefing+screenshot no Storage e em pinguim.arsenal_items.
// Aqui replicamos o registro como cerebro_fonte (tipo='pagina_venda')
// pra unificar com o resto do cerebro (vetorizado, listavel na vw_cerebros_completos).
//
// Idempotencia: usa md5 do HTML como fonte_externa_id em fontes_processadas.
// Se a pagina nao mudou, nao gera fonte nova.
//
// AUTO-DISCOVERY /vN: stub. Hoje varre so a URL configurada. Versao futura:
// faz HEAD em /v1, /v2, /v3, ... ate 404 dar pra detectar versoes novas.
// ============================================================

const db = require('./db');
const crypto = require('crypto');
const { vetorizarFonte } = require('./vetorizar-fonte');

async function ingerirPaginaVenda({
  cerebro_id,
  categoria_slug,
  url_alvo,
  cliente_id,
  tipo_fonte = 'pagina_venda',
  pular_auto_discovery = false,
  on_log = () => {},
}) {
  if (!cerebro_id) throw new Error('cerebro_id obrigatorio');
  if (!categoria_slug) throw new Error('categoria_slug obrigatorio');
  if (!url_alvo) throw new Error('url_alvo obrigatorio');

  // Resolve cliente_id (V2.13 padrao SOCIO_SLUG do .env.local, fallback Codina)
  if (!cliente_id) {
    try {
      const socio = require('./socio');
      const s = await socio.getSocioAtual();
      cliente_id = s.cliente_id;
    } catch {
      cliente_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; // fallback Codina
    }
  }

  on_log({ etapa: 'inicio', url_alvo });

  // 1. Descobre URLs candidatas (raiz + /v1, /v2, /v3 se existirem)
  //    Se pular_auto_discovery=true, usa so a URL exata (caso material_apoio)
  const urls = pular_auto_discovery ? [url_alvo] : await _descobrirUrls(url_alvo, on_log);
  on_log({ etapa: 'descobriu_urls', total: urls.length, urls });

  // 2. Pra cada URL: chama edge function, calcula md5, processa se nova
  const detalhes = [];
  let novos_ok = 0;
  let falhas = 0;
  let ja_processados = 0;

  for (const url of urls) {
    const det = { url, ok: false };
    try {
      on_log({ etapa: 'clonando', url });
      const briefing = await _chamarEdgeClonar({ url, cliente_id });
      if (!briefing) throw new Error('edge retornou null');
      if (!briefing || !briefing.ok) {
        throw new Error(briefing?.erro || 'edge retornou sem ok');
      }

      // md5 do HTML pra idempotencia
      const htmlPath = briefing.html_storage_path || '';
      const md5 = crypto.createHash('md5').update(htmlPath + '|' + (briefing.titulo || '')).digest('hex');
      det.md5 = md5;

      // Confere se ja processou esse md5
      const jaProc = await db.rodarSQL(`
        SELECT id FROM pinguim.fontes_processadas
         WHERE cerebro_id = '${cerebro_id}'::uuid
           AND categoria_slug = '${categoria_slug}'
           AND fonte_origem = 'web_apify'
           AND fonte_externa_id = '${md5}'
         LIMIT 1
      `);
      if (jaProc && jaProc.length > 0) {
        ja_processados++;
        det.ja_processado = true;
        on_log({ etapa: 'pulou_idempotente', url, md5 });
        detalhes.push(det);
        continue;
      }

      // Salva briefing como conteudo_md (estruturado)
      const conteudoMd = _briefingPraMd(briefing);
      const fonteRow = await db.rodarSQL(`
        INSERT INTO pinguim.cerebro_fontes
          (cerebro_id, tipo, titulo, origem, url, conteudo_md, criado_em)
        VALUES (
          '${cerebro_id}'::uuid,
          '${tipo_fonte}',
          ${esc((briefing.titulo || url).slice(0, 200))},
          'web_apify',
          ${esc(url)},
          ${esc(conteudoMd)},
          now()
        )
        RETURNING id;
      `);
      const fonteId = fonteRow[0].id;

      // Marca como processada
      await db.rodarSQL(`
        INSERT INTO pinguim.fontes_processadas
          (cerebro_id, categoria_slug, fonte_externa_id, fonte_origem, cerebro_fonte_id, metadata)
        VALUES (
          '${cerebro_id}'::uuid,
          ${esc(categoria_slug)},
          '${md5}',
          'web_apify',
          '${fonteId}'::uuid,
          ${esc(JSON.stringify({ url, titulo: briefing.titulo, arsenal_item_id: briefing.item_id, html_storage_path: htmlPath }))}::jsonb
        )
        ON CONFLICT DO NOTHING;
      `);

      // Vetoriza (REGRA DURA — sem isso, fonte fica invisivel pros agentes)
      const vetR = await vetorizarFonte(fonteId);
      on_log({ etapa: 'vetorizado', url, ok: vetR.ok, chunks: vetR.chunks, erro: vetR.erro });

      det.ok = true;
      det.cerebro_fonte_id = fonteId;
      det.chars = conteudoMd.length;
      det.vetorizado = vetR.ok;
      novos_ok++;
      on_log({ etapa: 'salvou', url, cerebro_fonte_id: fonteId });
    } catch (e) {
      det.erro = e.message || String(e);
      falhas++;
      on_log({ etapa: 'falha', url, erro: det.erro });
    }
    detalhes.push(det);
  }

  on_log({ etapa: 'fim', novos: novos_ok, falhas, ja_processados });

  // Marca o plano. Mesmo com 0 novos a execucao aconteceu — painel para de mentir "nunca rodou".
  const statusRun = falhas > 0 && novos_ok === 0 ? 'falha' : 'ok';
  await db.marcarPlanoExecutado({ cerebro_id, categoria_slug, status: statusRun });

  return { total_urls: urls.length, novos: novos_ok, falhas, ja_processados, detalhes };
}

// Descobre URLs candidatas: raiz + /v1, /v2, /v3, /v4, /v5 se existirem (HEAD)
async function _descobrirUrls(urlBase, on_log) {
  const u = new URL(urlBase);
  const base = `${u.protocol}//${u.host}`;
  const path = u.pathname.replace(/\/$/, '');

  const candidatos = new Set();
  candidatos.add(`${base}${path || '/'}`);

  // tenta /v1 ate /v5
  for (let i = 1; i <= 5; i++) {
    const candidato = `${base}${path}/v${i}`;
    try {
      const r = await fetch(candidato, { method: 'HEAD', redirect: 'follow' });
      if (r.ok || r.status === 405) { // 405 = HEAD nao suportado mas existe
        candidatos.add(candidato);
        on_log({ etapa: 'descobriu_versao', url: candidato });
      }
    } catch { /* ignora */ }
  }
  return Array.from(candidatos);
}

// Chama Edge Function tool-clonar-pagina-venda (mesma que arsenal usa)
async function _chamarEdgeClonar({ url, cliente_id }) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const supabaseUrl = env.SUPABASE_URL || `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
  const r = await fetch(`${supabaseUrl}/functions/v1/tool-clonar-pagina-venda`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ACCESS_TOKEN}`,
      'x-internal-token': env.INTERNAL_TOOL_TOKEN || '',
    },
    body: JSON.stringify({ url, cliente_id }),
  });
  const data = await r.json();
  return data;
}

function _briefingPraMd(b) {
  const linhas = [];
  if (b.titulo) linhas.push(`# ${b.titulo}`);
  if (b.dominio) linhas.push(`> URL: ${b.url || b.dominio}`);
  linhas.push('');
  const brief = b.briefing || {};
  if (brief.headline) linhas.push(`## Headline\n${brief.headline}`);
  if (brief.sub_headline) linhas.push(`\n${brief.sub_headline}`);
  if (brief.oferta) {
    linhas.push('\n## Oferta');
    if (brief.oferta.produto) linhas.push(`- Produto: ${brief.oferta.produto}`);
    if (brief.oferta.promessa) linhas.push(`- Promessa: ${brief.oferta.promessa}`);
    if (brief.oferta.publico) linhas.push(`- Público: ${brief.oferta.publico}`);
    if (brief.oferta.data_evento) linhas.push(`- Data: ${brief.oferta.data_evento}`);
  }
  if (Array.isArray(brief.dores_objecoes) && brief.dores_objecoes.length) {
    linhas.push('\n## Dores/Objeções');
    brief.dores_objecoes.forEach(d => linhas.push(`- ${d}`));
  }
  if (Array.isArray(brief.beneficios) && brief.beneficios.length) {
    linhas.push('\n## Benefícios');
    brief.beneficios.forEach(d => linhas.push(`- ${d}`));
  }
  if (Array.isArray(brief.como_funciona) && brief.como_funciona.length) {
    linhas.push('\n## Como funciona');
    brief.como_funciona.forEach(d => linhas.push(`- ${d}`));
  }
  if (brief.prova_social) {
    linhas.push('\n## Prova social');
    if (Array.isArray(brief.prova_social.depoimentos)) brief.prova_social.depoimentos.forEach(d => linhas.push(`- Depoimento: ${d}`));
    if (Array.isArray(brief.prova_social.numeros)) brief.prova_social.numeros.forEach(d => linhas.push(`- Número: ${d}`));
    if (Array.isArray(brief.prova_social.perfis_atendidos)) brief.prova_social.perfis_atendidos.forEach(d => linhas.push(`- Perfil: ${d}`));
  }
  if (brief.garantia) linhas.push(`\n## Garantia\n${brief.garantia}`);
  if (brief.cta_principal) {
    linhas.push('\n## CTA');
    if (brief.cta_principal.preco) linhas.push(`- Preço: ${brief.cta_principal.preco}`);
    if (brief.cta_principal.texto_botao) linhas.push(`- Botão: ${brief.cta_principal.texto_botao}`);
    if (brief.cta_principal.urgencia) linhas.push(`- Urgência: ${brief.cta_principal.urgencia}`);
  }
  if (brief.sobre_autor) linhas.push(`\n## Sobre o autor\n${brief.sobre_autor}`);
  if (Array.isArray(brief.faqs) && brief.faqs.length) {
    linhas.push('\n## FAQ');
    brief.faqs.forEach(f => linhas.push(`- **${f.pergunta}** — ${f.resposta}`));
  }
  return linhas.join('\n');
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

module.exports = { ingerirPaginaVenda };
