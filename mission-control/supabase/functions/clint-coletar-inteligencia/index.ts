// ========================================================================
// Edge Function: clint-coletar-inteligencia
// ========================================================================
// Fase B: coleta + classifica mensagens de cliente em 1 produto especifico.
//
// Otimizacoes pra cortar custo OpenAI:
// 1. FILTRO PRE-IA (local, sem custo): descarta saudacoes, ok/obrigado,
//    mensagens muito curtas, emoji puro, etc.
// 2. LIMITAR mensagens por deal: pega so as N primeiras msgs DO CLIENTE
//    (default 5) — a maior parte do valor vem no inicio.
// 3. BATCH classification: classifica 20 msgs por chamada OpenAI
//    (compartilha prompt sistema). ~65% mais barato que 1 a 1.
//
// Input:
//   { mapeamento_id?: uuid, nome_clint?: text, max_msgs_por_deal?: 5,
//     amostra_pct?: 100, max_deals?: null, modo_dry_run?: false }
//
// Output: stats detalhadas + custo estimado real.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}
async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const h = auth.replace('Bearer ', '');
  if (!h) return false;
  if (h === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (h.startsWith('eyJ')) {
    try {
      const cli = createClient(SUPABASE_URL, h, { auth: { persistSession: false } });
      const { error } = await cli.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) return true;
    } catch (_) {}
  }
  const a = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await a.auth.getUser(h);
  return !error && !!data?.user;
}

const RATE_DELAY_MS = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function clintGet(token: string, path: string): Promise<any> {
  const r = await fetch(`https://api.clint.digital${path}`, {
    headers: { 'api-token': token, 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`Clint ${path} HTTP ${r.status}`);
  return await r.json();
}

// ---------- Filtro PRE-IA (descarta sem custo) ----------
const STOPWORDS = new Set([
  'ok', 'okk', 'okay', 'okey', 'obrigado', 'obrigada', 'valeu', 'vlw', 'tks',
  'sim', 'nao', 'não', 'nada', 'tá', 'ta', 'blz', 'beleza', 'show', 'top',
  'oi', 'olá', 'ola', 'hey', 'eai', 'e ai',
  'bom dia', 'boa tarde', 'boa noite', 'tudo bem',
  'kkk', 'kkkk', 'rsrs', 'haha', 'hehe',
  '+', '?', '.', '...', '!',
]);
const REGEX_SO_EMOJI = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
const REGEX_SO_PONTUACAO = /^[\s\W_]+$/;

function passaPreIA(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  if (t.length < 8) return false;          // afrouxado de 15 -> 8 (objecoes reais sao curtas: "ta caro")
  if (STOPWORDS.has(t)) return false;
  if (REGEX_SO_EMOJI.test(t)) return false;
  if (REGEX_SO_PONTUACAO.test(t)) return false;
  return true;
}

// ---------- Classificacao em BATCH (20 por chamada) ----------
const PROMPT_BATCH = `Voce classifica mensagens de clientes em vendas low-ticket digital.

Para CADA mensagem (numerada), retorne JSON com campos:
- id (numero da mensagem 1-N)
- tipo: "objecao" | "pergunta" | "conversao" | "duvida" | "elogio" | "reclamacao" | "ruido"
  - objecao = cliente reclamando ou hesitando ("ta caro", "vou pensar", "nao tenho tempo")
  - pergunta = duvida especifica sobre produto/servico
  - conversao = sinal de compra ("vou comprar", "como pago", "fechado")
  - duvida = pergunta generica
  - elogio = depoimento positivo
  - reclamacao = pos-venda, problema com produto
  - ruido = saudacao, agradecimento, off-topic
- categoria: subtipo opcional (ex: "preco", "tempo", "suporte" pra objecao)
- score: 0-100 (quao util pro Cerebro)
- confianca: 0.0-1.0

Retorne APENAS JSON valido no formato: { "items": [ {id,tipo,categoria,score,confianca}, ... ] }

Mensagens:`;

async function classificarBatch(textos: string[], openaiKey: string): Promise<any[] | null> {
  if (textos.length === 0) return [];
  const userMsg = textos.map((t, i) => `${i + 1}. ${t.slice(0, 800)}`).join('\n');
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: PROMPT_BATCH },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2500,
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('OpenAI fail:', r.status, txt.slice(0, 200));
      return null;
    }
    const j = await r.json();
    const conteudo = j?.choices?.[0]?.message?.content;
    if (!conteudo) return null;
    const parsed = JSON.parse(conteudo);
    return parsed.items || parsed.classifications || [];
  } catch (e) {
    console.error('Erro classificarBatch:', (e as Error).message);
    return null;
  }
}

// ---------- Mapeamento produto -> cerebro ----------
async function carregarMapeamentos(c: any, mapeamento_id: string | null, nome_clint: string | null) {
  let q = c.from('clint_produto_mapeamento').select('*').eq('decisao', 'mapeado');
  if (mapeamento_id) q = q.eq('id', mapeamento_id);
  if (nome_clint) q = q.eq('nome_clint', nome_clint);
  const { data, error } = await q;
  if (error) throw new Error('Falha ao ler mapeamento: ' + error.message);
  return data || [];
}

// ---------- Carrega origens do Clint pra resolver origin_id -> nome_clint ----------
async function carregarOrigensDoProduto(token: string, nomesProduto: Set<string>): Promise<Set<string>> {
  // Retorna conjunto de origin_ids que pertencem aos produtos pedidos
  const origemIds = new Set<string>();
  for (let p = 1; p <= 5; p++) {
    const resp = await clintGet(token, `/v1/origins?limit=200&page=${p}`);
    const origens = resp?.data || [];
    for (const o of origens) {
      const grupo = o.group?.name?.trim();
      if (grupo && nomesProduto.has(grupo)) origemIds.add(o.id);
    }
    if (!resp?.hasNext) break;
    await sleep(RATE_DELAY_MS);
  }
  return origemIds;
}

// ---------- Handler ----------
serve(async (req) => {
  const inicio = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const mapeamento_id: string | null = body.mapeamento_id || null;
  const nome_clint: string | null = body.nome_clint || null;
  const max_msgs_por_deal: number = Math.max(1, Math.min(20, Number(body.max_msgs_por_deal || 5)));
  const amostra_pct: number = Math.max(1, Math.min(100, Number(body.amostra_pct || 100)));
  const max_deals: number | null = body.max_deals ? Number(body.max_deals) : null;
  const modo_dry_run: boolean = !!body.modo_dry_run;

  const c = sb();

  // 1. Carrega tokens
  let clintToken: string;
  let openaiKey: string;
  try {
    clintToken = await getChave('CLINT_API_TOKEN', 'clint-coletar-inteligencia', { fallbackEnv: false });
    if (!clintToken) throw new Error('CLINT_API_TOKEN vazio');
  } catch (e) {
    return jsonResp({ ok: false, erro: 'Token Clint: ' + (e as Error).message }, 500);
  }
  try {
    openaiKey = await getChave('OPENAI_API_KEY', 'clint-coletar-inteligencia', { fallbackEnv: true });
  } catch (e) {
    return jsonResp({ ok: false, erro: 'OPENAI_API_KEY: ' + (e as Error).message }, 500);
  }

  // 2. Carrega mapeamento(s)
  const mapeamentos = await carregarMapeamentos(c, mapeamento_id, nome_clint);
  if (mapeamentos.length === 0) {
    return jsonResp({ ok: false, erro: 'Nenhum mapeamento encontrado (precisa decisao=mapeado)' }, 404);
  }

  const nomesProdutos = new Set<string>(mapeamentos.map((m: any) => m.nome_clint));
  const cerebroPorProduto = new Map<string, string>(mapeamentos.map((m: any) => [m.nome_clint, m.cerebro_id]));

  // 3. Carrega origens dos produtos pedidos
  const origemIdsValidos = await carregarOrigensDoProduto(clintToken, nomesProdutos);
  if (origemIdsValidos.size === 0) {
    return jsonResp({ ok: false, erro: 'Nenhuma origin encontrada pros produtos pedidos' }, 500);
  }

  // 4. Mapa origin_id -> produto (pra resolver depois)
  const origemIdParaProduto = new Map<string, string>();
  for (let p = 1; p <= 5; p++) {
    const resp = await clintGet(clintToken, `/v1/origins?limit=200&page=${p}`);
    const origens = resp?.data || [];
    for (const o of origens) {
      const grupo = o.group?.name?.trim();
      if (grupo && nomesProdutos.has(grupo)) origemIdParaProduto.set(o.id, grupo);
    }
    if (!resp?.hasNext) break;
    await sleep(RATE_DELAY_MS);
  }

  const stats = {
    deals_buscados: 0,
    deals_relevantes: 0,
    deals_amostrados: 0,
    chats_lidos: 0,
    msgs_brutas: 0,
    msgs_apos_filtro: 0,
    msgs_apos_limite: 0,
    chamadas_openai: 0,
    msgs_classificadas: 0,
    inseridas: 0,
    duplicadas: 0,
    erros: 0,
    custo_estimado_usd: 0,
  };
  const erros: string[] = [];
  const dozeMesesAtras = new Date();
  dozeMesesAtras.setMonth(dozeMesesAtras.getMonth() - 12);

  // 5. Varre deals filtrando por origin_id
  const dealsRelevantes: any[] = [];
  let pagina = 1;
  const tempoMaxMs = 60000; // deixa margem pra classificacao depois
  try {
    while ((Date.now() - inicio) < tempoMaxMs) {
      const resp = await clintGet(clintToken, `/v1/deals?limit=200&page=${pagina}`);
      const deals = resp?.data || [];
      stats.deals_buscados += deals.length;
      for (const d of deals) {
        if (!d.origin_id || !origemIdsValidos.has(d.origin_id)) continue;
        if (d.updated_at && new Date(d.updated_at) < dozeMesesAtras) continue;
        dealsRelevantes.push(d);
      }
      if (!resp?.hasNext) break;
      pagina++;
      await sleep(RATE_DELAY_MS);
      if (max_deals && dealsRelevantes.length >= max_deals) break;
    }
  } catch (e) {
    erros.push('busca deals: ' + (e as Error).message);
  }

  stats.deals_relevantes = dealsRelevantes.length;

  // Aplica amostra
  const totalAmostrar = Math.ceil(dealsRelevantes.length * (amostra_pct / 100));
  const dealsAmostra = dealsRelevantes
    .sort(() => Math.random() - 0.5)
    .slice(0, max_deals ? Math.min(max_deals, totalAmostrar) : totalAmostrar);
  stats.deals_amostrados = dealsAmostra.length;

  // Dry run para nesse ponto
  if (modo_dry_run) {
    return jsonResp({
      ok: true,
      modo: 'dry_run',
      duracao_ms: Date.now() - inicio,
      stats,
      proximo_passo: 'Roda novamente sem modo_dry_run pra coletar mensagens',
    });
  }

  // 6. Para cada deal: chats -> mensagens -> filtro -> batch classificacao -> insere
  const tempoMaxClassMs = 100000; // 100s pra coleta + classificacao
  const BATCH_SIZE = 20;
  const filaParaClassificar: { texto: string; deal: any; origin_id: string; chat_id: string; msg_id: string; criado: string }[] = [];

  for (const deal of dealsAmostra) {
    if ((Date.now() - inicio) > tempoMaxClassMs) {
      erros.push('Tempo esgotado processando deals');
      break;
    }
    try {
      const chatsResp = await clintGet(clintToken, `/v2/chats/contact/${deal.contact?.id}`);
      const chats = chatsResp?.data || [];
      stats.chats_lidos += chats.length;
      await sleep(RATE_DELAY_MS);

      const msgsClienteDoDeal: any[] = [];
      for (const chat of chats) {
        if (msgsClienteDoDeal.length >= max_msgs_por_deal) break;
        const msgsResp = await clintGet(clintToken, `/v2/messages/chat/${chat.id}?limit=50`);
        const msgs = msgsResp?.data || [];
        await sleep(RATE_DELAY_MS);
        // Ordena cronologicamente (mais antiga primeiro pra pegar o "comeco")
        msgs.sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''));
        for (const m of msgs) {
          stats.msgs_brutas++;
          // No Clint:
          //   type='USER' = mensagem enviada PELO VENDEDOR (sai do user_id)
          //   type='CONTACT' = mensagem enviada PELO CLIENTE
          //   type='EVENT' = automacao/template/sistema (descartar)
          const tipo = (m.type || '').toUpperCase();
          if (tipo !== 'CONTACT') continue; // so cliente

          // O texto pode estar em 'content' (V2) ou 'text' (V1)
          const texto = (m.content || m.text || '').trim();
          if (!texto) continue;
          if (!passaPreIA(texto)) continue;
          stats.msgs_apos_filtro++;
          msgsClienteDoDeal.push({ texto, m, chat });
          if (msgsClienteDoDeal.length >= max_msgs_por_deal) break;
        }
      }

      stats.msgs_apos_limite += msgsClienteDoDeal.length;

      for (const item of msgsClienteDoDeal) {
        filaParaClassificar.push({
          texto: item.texto,
          deal,
          origin_id: deal.origin_id,
          chat_id: item.chat.id,
          msg_id: item.m.id,
          criado: item.m.created_at || new Date().toISOString(),
        });
      }
    } catch (e) {
      erros.push(`deal ${deal.id?.slice(0, 8)}: ${(e as Error).message}`);
      stats.erros++;
    }
  }

  // 7. Classifica em batches
  for (let i = 0; i < filaParaClassificar.length; i += BATCH_SIZE) {
    if ((Date.now() - inicio) > 130000) {
      erros.push('Tempo esgotado classificando, parando');
      break;
    }
    const lote = filaParaClassificar.slice(i, i + BATCH_SIZE);
    const textos = lote.map(l => l.texto);
    stats.chamadas_openai++;
    const resultados = await classificarBatch(textos, openaiKey);
    if (!resultados) { stats.erros++; continue; }

    for (const cls of resultados) {
      const idx = (Number(cls.id) || 0) - 1;
      if (idx < 0 || idx >= lote.length) continue;
      const item = lote[idx];
      stats.msgs_classificadas++;

      const tipo = String(cls.tipo || 'ruido').toLowerCase();
      const score = Math.max(0, Math.min(100, Number(cls.score || 50)));
      // Pula ruidos com score baixo (economia de banco — ja classificou de qq jeito)
      if (tipo === 'ruido' && score < 30) continue;

      const produto = origemIdParaProduto.get(item.origin_id);
      if (!produto) continue;
      const cerebroId = cerebroPorProduto.get(produto);
      if (!cerebroId) continue;

      const origem_id = `${item.chat_id}|${item.msg_id}`;
      const { error: errIns } = await c.from('cerebro_inteligencia').insert({
        cerebro_id: cerebroId,
        tipo,
        categoria: cls.categoria || null,
        texto: item.texto,
        origem_adapter: 'clint',
        origem_id,
        origem_email: item.deal?.contact?.email || null,
        contexto_funil: produto,
        contexto_etapa: item.deal?.stage || null,
        score_relevancia: score,
        classificacao_modelo: 'gpt-4o-mini',
        classificacao_confianca: Number(cls.confianca || 0.5),
        estado: 'bruto',
        ocorrido_em: item.criado,
      });
      if (errIns) {
        if (errIns.code === '23505') stats.duplicadas++;
        else { erros.push('insert: ' + errIns.message); stats.erros++; }
      } else {
        stats.inseridas++;
      }
    }
  }

  // 8. Estima custo aproximado (batches × tokens)
  // batch ~250 sistema + 1600 user (20×80) + 800 output = 2650 tokens
  // input 1850 × 0.15/1M + output 800 × 0.60/1M = 0.000277 + 0.00048 = ~US$ 0.000757 por chamada
  const custoPorBatch = 0.000757;
  stats.custo_estimado_usd = Number((stats.chamadas_openai * custoPorBatch).toFixed(4));

  return jsonResp({
    ok: true,
    duracao_ms: Date.now() - inicio,
    parametros: { mapeamento_id, nome_clint, max_msgs_por_deal, amostra_pct, max_deals, modo_dry_run },
    stats,
    erros: erros.slice(0, 5),
  });
});
