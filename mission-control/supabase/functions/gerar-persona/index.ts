// ========================================================================
// Edge Function: gerar-persona
// ========================================================================
// Lê fontes do Cérebro, manda pro OpenAI e persiste em pinguim.personas.
// Input: { cerebro_slug: string }  OU  { cerebro_id: uuid }
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const MODEL = 'gpt-4o-mini';
const MAX_FONTES = 30;
const MAX_CHARS_POR_FONTE = 4000;

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

async function callOpenAI(fontes: Array<{ titulo: string; tipo: string; conteudo_md: string }>, cerebroNome: string) {
  const bloco = fontes.map((f, i) => {
    const trecho = (f.conteudo_md || '').slice(0, MAX_CHARS_POR_FONTE);
    return `### Fonte ${i + 1} [${f.tipo}] — ${f.titulo}\n${trecho}`;
  }).join('\n\n---\n\n');

  const system = `Você é um analista de audiência especializado em infoprodutos. Dado um conjunto de fontes (aulas, depoimentos, páginas de vendas, objeções, sacadas) de um produto, extraia a Persona desse produto — o cliente real que consome o material.

Retorne estritamente JSON nesse formato, sem texto antes/depois:
{
  "quem_e": "2-4 frases descrevendo quem é a persona: idade aproximada, ocupação/contexto, nível de conhecimento, situação atual.",
  "dor_principal": "A principal dor/frustração recorrente. 1-3 frases. Use a linguagem das fontes.",
  "gatilhos_compra": "O que faz essa persona comprar. 3-5 bullets curtos em string separada por quebras de linha.",
  "objecoes": "Top 3 objeções mais frequentes. Numere. Use linguagem real dos depoimentos quando possível.",
  "linguagem": "Vocabulário característico da persona: 5-8 termos/expressões que ela usa, separados por vírgula."
}

Seja específico, nunca genérico. Se os dados não permitirem uma conclusão clara pra algum campo, escreva "Dados insuficientes — alimente o Cérebro com [tipo de fonte que falta]."`;

  const user = `Produto: ${cerebroNome}\nTotal de fontes analisadas: ${fontes.length}\n\n${bloco}`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
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
    const { cerebro_slug, cerebro_id: cerebroIdInput } = await req.json();

    const client = sb();

    // Resolve cérebro
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

    // Chama OpenAI
    const persona = await callOpenAI(fontes, cerebroNome);

    // Upsert na tabela personas
    const { error: eUpsert } = await client.from('personas').upsert({
      cerebro_id: cerebroId,
      quem_e: persona.quem_e || null,
      dor_principal: persona.dor_principal || null,
      gatilhos_compra: persona.gatilhos_compra || null,
      objecoes: persona.objecoes || null,
      linguagem: persona.linguagem || null,
      fontes_usadas: fontes.length,
      modelo: MODEL,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'cerebro_id' });

    if (eUpsert) return jsonResp({ error: eUpsert.message }, 500);

    return jsonResp({ ok: true, fontes_usadas: fontes.length, persona });
  } catch (e) {
    return jsonResp({ error: (e as Error).message }, 500);
  }
});
