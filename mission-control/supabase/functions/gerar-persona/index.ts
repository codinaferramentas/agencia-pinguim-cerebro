// ========================================================================
// Edge Function: gerar-persona v2
// ========================================================================
// Estrutura de dossie (11 blocos), inspirada em Eugene Schwartz + JTBD +
// Russell Brunson + PDF de persona-analise do cliente.
//
// Caminho C hibrido:
//   - Ao regenerar, campos marcados em `campos_editados` NAO sao sobrescritos
//   - Snapshot automatico em pinguim.personas_snapshots antes de cada upsert
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const MODEL = 'gpt-4o-mini';
const MAX_FONTES = 30;
const MAX_CHARS_POR_FONTE = 3000;

const CAMPOS_V2 = [
  'identidade', 'rotina', 'nivel_consciencia', 'jobs_to_be_done',
  'vozes_cabeca', 'desejos_reais', 'crencas_limitantes',
  'dores_latentes', 'objecoes_compra', 'vocabulario', 'onde_vive',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const SCHEMA_INSTRUCTION = `Retorne estritamente JSON neste formato, sem texto fora do JSON:
{
  "identidade": {
    "nome_ficticio": "nome proprio que encaixa no perfil",
    "idade": "faixa etaria (ex: Entre 35 e 55 anos)",
    "profissao": "profissao ou contexto ocupacional",
    "momento_de_vida": "2-3 frases sobre o momento atual da pessoa"
  },
  "rotina": {
    "como_e_o_dia": "paragrafo descrevendo o dia tipico",
    "desafios_diarios": "paragrafo sobre os desafios praticos e emocionais"
  },
  "nivel_consciencia": {
    "estagio_predominante": "um de: inconsciente | dor | solucao | produto | mais_consciente",
    "justificativa": "por que voce classificou assim com base nas fontes",
    "abordagem_recomendada": "como falar com essa persona dado o estagio"
  },
  "jobs_to_be_done": {
    "funcional": "a tarefa pratica que a pessoa quer resolver",
    "emocional": "como a pessoa quer se sentir apos resolver",
    "social": "como a pessoa quer ser vista pelos outros"
  },
  "vozes_cabeca": [
    "10 pensamentos que essa pessoa repete em silencio, em primeira pessoa",
    "use linguagem real das fontes",
    "ate 10 itens"
  ],
  "desejos_reais": [
    "10 desejos nao ditos, reprimidos ou adiados, em primeira pessoa",
    "comece com 'Eu quero' ou 'Eu sonho' ou 'Eu gostaria'",
    "ate 10 itens"
  ],
  "crencas_limitantes": [
    "10 crencas que a impedem de conseguir, em primeira pessoa negativa",
    "comece com 'Eu nao' ou 'Eu preciso de'",
    "ate 10 itens"
  ],
  "dores_latentes": [
    "10 frustracoes mal resolvidas do dia a dia, em primeira pessoa",
    "comece com 'Eu me sinto' ou 'Eu nao tenho'",
    "ate 10 itens"
  ],
  "objecoes_compra": [
    "5-8 objecoes especificas que essa persona teria ao comprar este produto",
    "em primeira pessoa: 'Sera que isso funciona pra mim?', 'Nao tenho tempo', etc",
    "ordenadas da mais frequente pra menos"
  ],
  "vocabulario": [
    { "palavra": "termo caracteristico", "por_que_usa": "explicacao curta do significado pro publico" },
    "10 entradas"
  ],
  "onde_vive": {
    "comunidades_online": "onde essa persona consome conteudo (grupos, redes, foruns)",
    "influenciadores_tipicos": "criadores que ela provavelmente ja segue",
    "podcasts_canais": "tipos de podcast/canal que atraem essa persona"
  }
}

Regras:
- Seja especifico, nunca generico. Extraia linguagem das fontes quando possivel.
- Se dados insuficientes pra um campo, escreva "Dados insuficientes — alimente o Cerebro com [tipo que falta]"
- Nao invente numeros ou dados quantitativos.`;

async function callOpenAI(fontes: Array<{ titulo: string; tipo: string; conteudo_md: string }>, cerebroNome: string) {
  const bloco = fontes.map((f, i) => {
    const trecho = (f.conteudo_md || '').slice(0, MAX_CHARS_POR_FONTE);
    return `### Fonte ${i + 1} [${f.tipo}] — ${f.titulo}\n${trecho}`;
  }).join('\n\n---\n\n');

  const system = `Voce e um analista de audiencia especializado em infoprodutos e copy de resposta direta. Seu trabalho e ler fontes reais (aulas, depoimentos, paginas, objecoes, sacadas, chats) de um produto e extrair um DOSSIE COMPLETO da persona real desse produto.

Use o framework de Eugene Schwartz (niveis de consciencia), Jobs to be Done, e Voice of Customer. O dossie vai ser usado por agentes de IA pra criar copy, anuncios, scripts de venda e responder objecoes.

${SCHEMA_INSTRUCTION}`;

  const user = `Produto: ${cerebroNome}\nTotal de fontes: ${fontes.length}\n\n${bloco}`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI ${r.status}: ${err}`);
  }

  const j = await r.json();
  const content = j.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const { cerebro_slug, cerebro_id: cerebroIdInput, preservar_campos = true } = body;

    const client = sb();

    // Resolve cerebro
    let cerebroId = cerebroIdInput as string | undefined;
    let cerebroNome = '';
    if (!cerebroId && cerebro_slug) {
      const { data: prod } = await client.from('produtos').select('id, nome').eq('slug', cerebro_slug).single();
      if (!prod) return jsonResp({ error: 'produto nao encontrado' }, 404);
      cerebroNome = prod.nome;
      const { data: cer } = await client.from('cerebros').select('id').eq('produto_id', prod.id).single();
      if (!cer) return jsonResp({ error: 'cerebro nao encontrado' }, 404);
      cerebroId = cer.id;
    } else if (cerebroId) {
      const { data: cer } = await client.from('cerebros').select('id, produto_id').eq('id', cerebroId).single();
      if (!cer) return jsonResp({ error: 'cerebro nao encontrado' }, 404);
      const { data: prod } = await client.from('produtos').select('nome').eq('id', cer.produto_id).single();
      cerebroNome = prod?.nome || '';
    } else {
      return jsonResp({ error: 'informe cerebro_slug ou cerebro_id' }, 400);
    }

    // Busca fontes
    const { data: fontes, error: eFontes } = await client
      .from('cerebro_fontes')
      .select('tipo, titulo, conteudo_md')
      .eq('cerebro_id', cerebroId)
      .eq('ingest_status', 'ok')
      .order('criado_em', { ascending: false })
      .limit(MAX_FONTES);

    if (eFontes) return jsonResp({ error: eFontes.message }, 500);
    if (!fontes || fontes.length === 0) {
      return jsonResp({ error: 'cerebro sem fontes — alimente primeiro' }, 400);
    }

    // Persona existente (pra versao + preservar campos editados)
    const { data: personaExistente } = await client
      .from('personas')
      .select('*')
      .eq('cerebro_id', cerebroId)
      .maybeSingle();

    // Snapshot antes de sobrescrever
    if (personaExistente) {
      await client.from('personas_snapshots').insert({
        persona_id: personaExistente.id,
        cerebro_id: cerebroId,
        versao: personaExistente.versao || 1,
        snapshot: personaExistente,
        motivo: 'regenerar',
        fontes_usadas: personaExistente.fontes_usadas,
        modelo: personaExistente.modelo,
      });
    }

    // Chama OpenAI
    const geradaPelaIA = await callOpenAI(fontes, cerebroNome);

    // Monta payload preservando campos editados manualmente (caminho C)
    const campos_editados: string[] = personaExistente?.campos_editados || [];
    const payload: Record<string, unknown> = {
      cerebro_id: cerebroId,
      fontes_usadas: fontes.length,
      modelo: MODEL,
      atualizado_em: new Date().toISOString(),
      versao: (personaExistente?.versao || 0) + 1,
      campos_editados,
    };

    for (const campo of CAMPOS_V2) {
      if (preservar_campos && campos_editados.includes(campo) && personaExistente?.[campo] != null) {
        payload[campo] = personaExistente[campo]; // mantem edicao manual
      } else {
        payload[campo] = geradaPelaIA[campo] || null;
      }
    }

    // Upsert
    const { error: eUpsert } = await client.from('personas').upsert(payload, { onConflict: 'cerebro_id' });
    if (eUpsert) return jsonResp({ error: eUpsert.message }, 500);

    return jsonResp({
      ok: true,
      fontes_usadas: fontes.length,
      campos_preservados: campos_editados,
    });
  } catch (e) {
    return jsonResp({ error: (e as Error).message }, 500);
  }
});
