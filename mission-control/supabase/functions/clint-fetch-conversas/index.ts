// ========================================================================
// Edge Function: clint-fetch-conversas
// ========================================================================
// Adapter Clint -> pinguim.cerebro_inteligencia
//
// Fluxo:
//   1. Le CLINT_API_TOKEN do Cofre
//   2. Lista contatos (paginado, 1000 por vez) — opcional filtro por updated_at
//   3. Para cada contato: GET /v2/chats/contact/{id}
//   4. Para cada chat: GET /v2/messages/chat/{id} (com cursor)
//   5. Filtra mensagens recebidas (do contato, nao do vendedor)
//   6. Classifica via OpenAI: tipo (objecao/pergunta/conversao/duvida/elogio/reclamacao/ruido)
//      + categoria (preco/tempo/suporte/etc) + score
//   7. Identifica produto pelo deal_origin_group dos deals do contato
//   8. Insere em cerebro_inteligencia (ON CONFLICT DO NOTHING via UNIQUE)
//   9. Atualiza cursor em cerebro_inteligencia_coleta
//
// Modos de operacao:
//   - body { modo: 'inicial' }    -> carga total (todos contatos, ignora cursor)
//   - body { modo: 'incremental' } -> so contatos com updated_at > ultima_coleta
//   - body { modo: 'amostra', limite_contatos: N } -> testa com N contatos
//
// Idempotencia: UNIQUE(origem_adapter, origem_id) na tabela.
// origem_id = `${chat_id}|${message_id}` — nunca duplica.
//
// IMPORTANTE: rate limit conservador (200ms entre chamadas Clint).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

const CLINT_BASE = 'https://api.clint.digital';
const RATE_DELAY_MS = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const headerJwt = auth.replace('Bearer ', '');
  if (!headerJwt) return false;
  if (headerJwt === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (headerJwt.startsWith('eyJ')) {
    try {
      const adminClient = createClient(SUPABASE_URL, headerJwt, { auth: { persistSession: false } });
      const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) return true;
    } catch (_) {}
  }
  return false;
}

// ---------- Clint API helpers ----------
async function clintFetch(path: string, token: string): Promise<any> {
  const r = await fetch(`${CLINT_BASE}${path}`, {
    headers: { 'api-token': token, 'Accept': 'application/json' },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Clint ${path} HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return await r.json();
}

interface ClintContact {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  ddi?: string;
  updated_at?: string;
  created_at?: string;
}

interface ClintMessage {
  id: string;
  chat_id?: string;
  text?: string;
  type?: string;
  direction?: string;     // 'inbound' = cliente; 'outbound' = vendedor
  sender_type?: string;
  created_at?: string;
}

interface ClintDeal {
  id: string;
  origin_group?: string;  // produto (Elo, ProAlt)
  origin?: string;
  stage?: string;
  status?: string;
  user?: string;
}

// ---------- Mapeamento produto -> cerebro_id ----------
async function mapProdutoCerebro(c: any): Promise<Map<string, string>> {
  // Le todos os Cerebros e cria index por nome do produto (lower)
  const { data } = await c.from('cerebros').select('id, produtos(nome)');
  const m = new Map<string, string>();
  (data || []).forEach((row: any) => {
    const nome = row?.produtos?.nome;
    if (nome) m.set(nome.toLowerCase().trim(), row.id);
  });
  return m;
}

// ---------- Classificacao via OpenAI ----------
const PROMPT_CLASSIFICAR = `Voce classifica mensagens de clientes em vendas low-ticket digital.

Para cada mensagem, retorne JSON com:
- tipo: "objecao" | "pergunta" | "conversao" | "duvida" | "elogio" | "reclamacao" | "ruido"
  - objecao = cliente reclamando ou hesitando ("ta caro", "vou pensar", "nao tenho tempo")
  - pergunta = duvida especifica sobre produto/servico
  - conversao = sinal de compra ("vou comprar", "como faco pra pagar", "fechado")
  - duvida = pergunta generica sem foco em comprar
  - elogio = depoimento positivo
  - reclamacao = pos-venda, problema com produto
  - ruido = saudacao, agradecimento, "ok", "obrigado", off-topic
- categoria: subtipo se aplicavel (ex: "preco", "tempo", "suporte", "autoridade" pra objecao)
- score_relevancia: 0-100 (quao util pro Cerebro? "ok" = 5, "ta caro pra esse momento" = 90)
- confianca: 0.0-1.0

Exemplo: { "tipo": "objecao", "categoria": "preco", "score_relevancia": 85, "confianca": 0.92 }

Mensagem:`;

async function classificar(texto: string, openaiKey: string): Promise<any | null> {
  if (!texto || texto.trim().length < 3) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: PROMPT_CLASSIFICAR },
          { role: 'user', content: texto.slice(0, 2000) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200,
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const conteudo = j?.choices?.[0]?.message?.content;
    if (!conteudo) return null;
    return JSON.parse(conteudo);
  } catch {
    return null;
  }
}

// ---------- Handler ----------
serve(async (req) => {
  const inicio = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const modo: string = body.modo || 'amostra';
  const limite_contatos: number = Math.min(Number(body.limite_contatos || 5), 50);

  const c = sb();

  // 1. Le tokens
  let clintToken: string;
  let openaiKey: string;
  try {
    clintToken = await getChave('CLINT_API_TOKEN', 'clint-fetch-conversas', { fallbackEnv: false });
    if (!clintToken) throw new Error('CLINT_API_TOKEN vazio (cadastre no cofre)');
  } catch (e) {
    return jsonResp({ ok: false, erro: 'Token Clint nao configurado: ' + (e as Error).message }, 500);
  }
  try {
    openaiKey = await getChave('OPENAI_API_KEY', 'clint-fetch-conversas', { fallbackEnv: true });
  } catch (e) {
    return jsonResp({ ok: false, erro: 'OPENAI_API_KEY nao disponivel: ' + (e as Error).message }, 500);
  }

  // 2. Le cursor da ultima coleta
  const { data: coleta } = await c.from('cerebro_inteligencia_coleta')
    .select('*').eq('adapter', 'clint').single();

  const ultimaColeta = coleta?.ultima_coleta_em;
  const cargaInicialCompleta = !!coleta?.carga_inicial_completa;

  // 3. Mapa produto -> cerebro_id
  const mapaProduto = await mapProdutoCerebro(c);

  // 4. Lista contatos
  const stats = {
    contatos_lidos: 0,
    chats_lidos: 0,
    mensagens_lidas: 0,
    inseridos: 0,
    classificados: 0,
    duplicados: 0,
    sem_produto: 0,
    erros: 0,
  };
  const erros: string[] = [];

  try {
    let url = `/v1/contacts?limit=${modo === 'amostra' ? limite_contatos : 200}`;
    if (modo === 'incremental' && ultimaColeta) {
      // Clint pode aceitar filtro por updated_at — tentar com fallback
      url += `&updated_at_gte=${encodeURIComponent(ultimaColeta)}`;
    }

    const respContatos = await clintFetch(url, clintToken);
    const contatos: ClintContact[] = respContatos?.data || respContatos?.contacts || respContatos || [];
    const limite = Math.min(contatos.length, modo === 'amostra' ? limite_contatos : contatos.length);

    for (let i = 0; i < limite; i++) {
      const contato = contatos[i];
      stats.contatos_lidos++;
      await sleep(RATE_DELAY_MS);

      // Pega deals do contato pra descobrir produto
      let produtoNome: string | null = null;
      try {
        const dealsResp = await clintFetch(`/v1/contacts/${contato.id}/deals`, clintToken);
        const deals: ClintDeal[] = dealsResp?.data || dealsResp || [];
        if (deals.length > 0 && deals[0].origin_group) {
          produtoNome = deals[0].origin_group;
        }
      } catch (_) { /* segue sem produto */ }

      if (!produtoNome) {
        stats.sem_produto++;
        continue;
      }

      const cerebroId = mapaProduto.get(produtoNome.toLowerCase().trim());
      if (!cerebroId) {
        stats.sem_produto++;
        continue;
      }

      // Pega chats do contato
      await sleep(RATE_DELAY_MS);
      let chats: any[] = [];
      try {
        const chatsResp = await clintFetch(`/v2/chats/contact/${contato.id}`, clintToken);
        chats = chatsResp?.data || chatsResp || [];
      } catch (e) {
        erros.push(`chats/${contato.id}: ${(e as Error).message}`);
        stats.erros++;
        continue;
      }

      for (const chat of chats) {
        stats.chats_lidos++;
        await sleep(RATE_DELAY_MS);

        let mensagens: ClintMessage[] = [];
        try {
          const msgResp = await clintFetch(`/v2/messages/chat/${chat.id}?limit=200`, clintToken);
          mensagens = msgResp?.data || msgResp || [];
        } catch (e) {
          erros.push(`msg/${chat.id}: ${(e as Error).message}`);
          stats.erros++;
          continue;
        }

        for (const msg of mensagens) {
          stats.mensagens_lidas++;

          // So mensagens DO CLIENTE (inbound)
          const direction = (msg.direction || msg.sender_type || '').toLowerCase();
          if (direction !== 'inbound' && direction !== 'contact' && direction !== 'received') continue;

          const texto = (msg.text || '').trim();
          if (!texto || texto.length < 5) continue;

          const origem_id = `${chat.id}|${msg.id}`;

          // Classifica
          const cls = await classificar(texto, openaiKey);
          if (!cls) { stats.erros++; continue; }
          stats.classificados++;

          // Pula ruido com score baixo (economiza espaco)
          if (cls.tipo === 'ruido' && (cls.score_relevancia || 0) < 30) continue;

          // Insere
          const { error: errIns } = await c.from('cerebro_inteligencia').insert({
            cerebro_id: cerebroId,
            tipo: cls.tipo,
            categoria: cls.categoria || null,
            texto,
            origem_adapter: 'clint',
            origem_id,
            origem_email: contato.email || null,
            classificacao_modelo: 'gpt-4o-mini',
            classificacao_confianca: cls.confianca || 0.5,
            score_relevancia: cls.score_relevancia || 50,
            estado: 'bruto',
            ocorrido_em: msg.created_at || new Date().toISOString(),
          });
          if (errIns) {
            if (errIns.code === '23505') stats.duplicados++;
            else { erros.push(`insert: ${errIns.message}`); stats.erros++; }
          } else {
            stats.inseridos++;
          }
        }
      }
    }

    // Atualiza cursor de coleta
    await c.from('cerebro_inteligencia_coleta').update({
      ultima_coleta_em: new Date().toISOString(),
      ultima_coleta_qtd: stats.inseridos,
      ultima_coleta_duracao_ms: Date.now() - inicio,
      ultima_coleta_erro: erros.length > 0 ? erros.slice(0, 3).join(' | ') : null,
      total_acumulado: (coleta?.total_acumulado || 0) + stats.inseridos,
      carga_inicial_completa: cargaInicialCompleta || (modo === 'inicial'),
      atualizado_em: new Date().toISOString(),
    }).eq('adapter', 'clint');

    return jsonResp({
      ok: true,
      modo,
      duracao_ms: Date.now() - inicio,
      stats,
      erros_amostra: erros.slice(0, 5),
    });
  } catch (e) {
    await c.from('cerebro_inteligencia_coleta').update({
      ultima_coleta_erro: (e as Error).message,
      atualizado_em: new Date().toISOString(),
    }).eq('adapter', 'clint');
    return jsonResp({
      ok: false,
      erro: (e as Error).message,
      stats,
      duracao_ms: Date.now() - inicio,
    }, 500);
  }
});
