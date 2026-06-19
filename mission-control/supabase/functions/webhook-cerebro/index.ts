// Edge: webhook-cerebro
// V3 (2026-06-16)
//
// Endpoint PUBLICO (sem auth) que recebe webhook externo (YA Forms,
// Tally, Typeform, etc) e ingere como fonte do cerebro/categoria.
//
// URL: POST https://<project>.supabase.co/functions/v1/webhook-cerebro/<slug_produto>/<categoria_slug>
//      ou via query: ?produto=desafio-de-conte-do-lo-fi&categoria=pesquisas
//
// Token opcional via query string ou header: ?token=XXX ou x-webhook-token: XXX
// Token correto = secret armazenado em pinguim.cofre_chaves com nome WEBHOOK_TOKEN_<slug_produto>_<categoria>
// Sem token configurado = endpoint aberto (uso interno/teste).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-token, x-webhook-source',
};
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Parse URL: /functions/v1/webhook-cerebro/<slug_produto>/<categoria_slug>
  const url = new URL(req.url);
  const partes = url.pathname.split('/').filter(Boolean);
  // partes: ['functions','v1','webhook-cerebro', slug_produto, categoria_slug]
  let slug_produto = partes[3] || url.searchParams.get('produto');
  let categoria_slug = partes[4] || url.searchParams.get('categoria');

  // GET = ping pra teste rapido
  if (req.method === 'GET') {
    return json({
      ok: true,
      msg: 'webhook-cerebro online',
      slug_produto,
      categoria_slug,
      hint: 'Envie POST com Content-Type: application/json e body do formulario',
    });
  }

  if (req.method !== 'POST') return json({ ok: false, erro: 'use POST' }, 405);
  if (!slug_produto || !categoria_slug) {
    return json({ ok: false, erro: 'URL deve incluir /slug_produto/categoria_slug' }, 400);
  }

  // Le body — tenta JSON, fallback texto
  let payload: any = {};
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      payload = await req.json();
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      payload = Object.fromEntries(form.entries());
    } else {
      const txt = await req.text();
      try { payload = JSON.parse(txt); } catch { payload = { raw: txt }; }
    }
  } catch (e) {
    return json({ ok: false, erro: 'body invalido: ' + (e as Error).message }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  try {
    // 1. Resolve cerebro pelo slug do produto
    const { data: cerebros, error: errC } = await sb
      .from('cerebros')
      .select('id, produto_id, produtos!inner(slug, nome)')
      .eq('produtos.slug', slug_produto)
      .limit(1);
    if (errC) throw new Error('SQL cerebros: ' + errC.message);
    if (!cerebros || cerebros.length === 0) {
      return json({ ok: false, erro: `cerebro nao encontrado pro produto slug='${slug_produto}'` }, 404);
    }
    const cerebro = cerebros[0] as any;
    const cerebro_id = cerebro.id;
    const produto_nome = cerebro.produtos?.nome || slug_produto;

    // 2. Resolve categoria + valida
    const { data: catList, error: errCat } = await sb
      .from('vw_cerebro_plano_categoria')
      .select('plano_id, categoria_nome, categoria_tipos_fonte')
      .eq('cerebro_id', cerebro_id)
      .eq('categoria_slug', categoria_slug)
      .limit(1);
    if (errCat) throw new Error('SQL cat: ' + errCat.message);
    if (!catList || catList.length === 0) {
      return json({ ok: false, erro: `categoria '${categoria_slug}' nao encontrada no plano` }, 404);
    }
    const tipos = (catList[0] as any).categoria_tipos_fonte || [];
    const tipoFonte = tipos.includes('resposta_pesquisa') ? 'resposta_pesquisa' : (tipos[0] || 'resposta_pesquisa');

    // 3. Monta titulo + conteudo markdown
    const fonte_externa = req.headers.get('x-webhook-source') || url.searchParams.get('fonte') || 'webhook';
    const titulo = gerarTitulo(payload, produto_nome, categoria_slug);

    // 4. CHECK IDEMPOTENCIA PRIMEIRO (antes de inserir cerebro_fonte)
    // Se response.id ja foi processado pra este (cerebro, categoria), pula salvar
    const fonteExternaId = extrairIdExterno(payload);
    if (fonteExternaId) {
      const { data: jaProc } = await sb
        .from('fontes_processadas')
        .select('id, cerebro_fonte_id')
        .eq('cerebro_id', cerebro_id)
        .eq('categoria_slug', categoria_slug)
        .eq('fonte_origem', fonte_externa)
        .eq('fonte_externa_id', fonteExternaId)
        .limit(1);
      if (jaProc && jaProc.length > 0) {
        return json({
          ok: true,
          duplicado: true,
          cerebro_fonte_id: (jaProc[0] as any).cerebro_fonte_id,
          msg: 'response.id ja processado anteriormente, ignorando',
        });
      }
    }

    const conteudoMd = payloadParaMarkdown(payload);

    // V10 (2026-06-19): classifica por origem se tiver multiplas cadastradas
    // Cada origem pode ter origem_extras.perguntas_chave[] — se conteudoMd
    // contem alguma delas, marca origem_id/origem_label na metadata.
    let origemMatch: any = null;
    try {
      const { data: origens } = await sb
        .from('cerebro_plano_categoria_origens')
        .select('id, label, origem_extras')
        .eq('plano_id', (catList[0] as any).plano_id)
        .eq('ativo', true);
      if (origens && origens.length > 0) {
        for (const o of origens as any[]) {
          const chaves: string[] = o.origem_extras?.perguntas_chave || [];
          if (chaves.length > 0 && chaves.some(k => conteudoMd.includes(k))) {
            origemMatch = o;
            break;
          }
        }
        // Se nada bateu mas so tem 1 origem cadastrada, atribui automaticamente
        if (!origemMatch && origens.length === 1) origemMatch = origens[0];
      }
    } catch (_) { /* tolerante */ }

    // 5. Salva como cerebro_fonte (so passa daqui se nao for duplicata)
    const { data: fonte, error: errF } = await sb
      .from('cerebro_fontes')
      .insert({
        cerebro_id,
        tipo: tipoFonte,
        titulo: titulo.slice(0, 200),
        origem: fonte_externa,
        url: null,
        conteudo_md: conteudoMd,
        metadata: origemMatch ? {
          origem_id: origemMatch.id,
          origem_label: origemMatch.label,
          classificador: 'webhook_v10',
        } : null,
      })
      .select('id')
      .single();
    if (errF) throw new Error('insert cerebro_fontes: ' + errF.message);
    const cerebro_fonte_id = (fonte as any).id;

    // Atualiza contador da origem
    if (origemMatch) {
      try {
        const { data: cur } = await sb
          .from('cerebro_plano_categoria_origens')
          .select('qtd_fontes_geradas')
          .eq('id', origemMatch.id)
          .single();
        await sb
          .from('cerebro_plano_categoria_origens')
          .update({
            qtd_fontes_geradas: ((cur as any)?.qtd_fontes_geradas || 0) + 1,
            ultima_execucao: new Date().toISOString(),
            ultimo_status_run: 'ok',
          })
          .eq('id', origemMatch.id);
      } catch (_) { /* tolerante */ }
    }

    // 6. Marca em fontes_processadas (idempotencia formal)
    const finalFonteExternaId = fonteExternaId || `${Date.now()}-${cerebro_fonte_id.slice(0,8)}`;
    await sb.from('fontes_processadas').insert({
      cerebro_id,
      categoria_slug,
      fonte_externa_id: finalFonteExternaId,
      fonte_origem: fonte_externa,
      cerebro_fonte_id,
      metadata: {
        titulo, fonte_externa, payload_keys: Object.keys(payload || {}),
        origem_id: origemMatch?.id, origem_label: origemMatch?.label,
      },
    });

    // 6. Atualiza categoria: ultima_execucao + promove status se em construcao
    await sb
      .from('cerebro_plano_categoria')
      .update({
        ultima_execucao: new Date().toISOString(),
        ultimo_status_run: 'ok',
        status_automacao: 'ativo',
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', (catList[0] as any).plano_id);

    // 7. Vetoriza (REGRA DURA — sem isso fonte fica invisivel pros agentes)
    // Chama internamente a Edge Function revetorizar-fonte. Tolerante a falha.
    let vetorizado = false;
    let vetorizado_chunks = 0;
    try {
      const vetR = await fetch(`${SUPABASE_URL}/functions/v1/revetorizar-fonte`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fonte_id: cerebro_fonte_id }),
      });
      if (vetR.ok) {
        const vd = await vetR.json();
        vetorizado = true;
        vetorizado_chunks = vd.chunks || 0;
      } else {
        console.warn(`vetorizacao falhou (nao bloqueante): HTTP ${vetR.status}`);
      }
    } catch (e) {
      console.warn(`vetorizacao falhou (nao bloqueante): ${(e as Error).message}`);
    }

    return json({ ok: true, cerebro_fonte_id, titulo, tipo_fonte: tipoFonte, vetorizado, vetorizado_chunks });
  } catch (e) {
    console.error('webhook-cerebro erro:', e);
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});

function gerarTitulo(payload: any, produto_nome: string, categoria_slug: string): string {
  // Tenta YA Forms: response.answers[fieldId].fieldTitle = "Nome..." -> content
  let cand = null;
  const resp = payload?.response || payload;
  const answers = resp?.answers;
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    for (const ans of Object.values(answers as Record<string, any>)) {
      const t = String(ans?.fieldTitle || '').toLowerCase();
      if ((t.includes('nome') && t.includes('complet')) || t === 'nome') {
        if (ans?.content) { cand = String(ans.content).trim(); break; }
      }
    }
    if (!cand) {
      // tenta email
      for (const ans of Object.values(answers as Record<string, any>)) {
        const t = String(ans?.fieldTitle || '').toLowerCase();
        if (t.includes('mail')) {
          if (ans?.content) { cand = String(ans.content).trim(); break; }
        }
      }
    }
  }
  cand = cand || payload?.respondent?.name || payload?.name || payload?.nome ||
                 payload?.respondent_name || payload?.email || payload?.respondent?.email;
  const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  if (cand) return `${produto_nome} — ${categoria_slug}: ${cand} (${data})`;
  return `${produto_nome} — ${categoria_slug} (${data})`;
}

function extrairIdExterno(payload: any): string | null {
  // YA Forms: response.id (aninhado dentro de response)
  return payload?.response?.id ||
         payload?.response_id ||
         payload?.id ||
         payload?.submission_id ||
         payload?.respondent?.id ||
         null;
}

function payloadParaMarkdown(payload: any): string {
  if (!payload || typeof payload !== 'object') return String(payload || '');
  const linhas: string[] = [];

  // YA Forms: { response: { answers: { fieldId: { fieldTitle, content } }, geolocation, ... } }
  const resp = payload?.response || payload;
  const meta: string[] = [];

  // Metadata util (geolocalizacao, tempo, dispositivo)
  if (resp.geolocation?.city) meta.push(`Cidade: ${resp.geolocation.city}/${resp.geolocation.state || resp.geolocation.region || ''}`);
  if (resp.deviceType) meta.push(`Dispositivo: ${resp.deviceType}${resp.operatingSystem ? ' ('+resp.operatingSystem+')' : ''}`);
  if (resp.timeToComplete) meta.push(`Tempo: ${Math.round(resp.timeToComplete)}s`);
  if (resp.submittedAt) meta.push(`Enviado: ${resp.submittedAt}`);
  if (resp.referrerUrl) meta.push(`Origem: ${resp.referrerUrl}`);
  if (meta.length) linhas.push('## Contexto da resposta\n' + meta.map(m => `- ${m}`).join('\n') + '\n');

  // YA Forms answers: objeto indexado por fieldId, cada um com fieldTitle + content
  const answers = resp.answers || payload?.data?.fields || payload?.fields || payload?.respostas;
  let appended = false;

  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    linhas.push('## Respostas\n');
    for (const [_id, ans] of Object.entries(answers as Record<string, any>)) {
      const titulo = ans?.fieldTitle || ans?.label || ans?.question || ans?.title;
      const conteudo = ans?.content ?? ans?.value ?? ans?.answer ?? ans?.resposta;
      if (titulo === null || titulo === undefined) continue;
      // Pula items decorativos (titulo de secao sem content)
      if (conteudo === null || conteudo === undefined || conteudo === '') continue;
      // Limpa HTML do titulo
      const tituloLimpo = String(titulo).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      linhas.push(`**${tituloLimpo}**`);
      linhas.push(normalizarValor(conteudo));
      linhas.push('');
      appended = true;
    }
  } else if (Array.isArray(answers)) {
    linhas.push('## Respostas\n');
    for (const a of answers) {
      const k = a.label || a.question || a.title || a.key || a.pergunta || a.fieldTitle || 'campo';
      const v = a.value ?? a.answer ?? a.resposta ?? a.content;
      linhas.push(`**${String(k).replace(/<[^>]+>/g, ' ').trim()}**\n${normalizarValor(v)}\n`);
      appended = true;
    }
  }

  if (!appended) {
    // Fallback: objeto plano
    for (const [k, v] of Object.entries(payload)) {
      if (k.startsWith('_') || (typeof v === 'object' && v === null)) continue;
      linhas.push(`**${k}**\n${normalizarValor(v)}\n`);
    }
  }
  return linhas.join('\n') || '_(payload vazio)_';
}

function normalizarValor(v: any): string {
  if (v === null || v === undefined) return '_(vazio)_';
  if (Array.isArray(v)) {
    // arrays de string viram lista bullet ou inline (se 1 so item)
    if (v.length === 0) return '_(vazio)_';
    if (v.length === 1 && typeof v[0] !== 'object') return String(v[0]).trim();
    if (v.every(x => typeof x !== 'object')) {
      return v.map(x => `- ${String(x).trim()}`).join('\n');
    }
  }
  if (typeof v === 'object') return '```json\n' + JSON.stringify(v, null, 2) + '\n```';
  return String(v).trim();
}
