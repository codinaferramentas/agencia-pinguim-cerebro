// ========================================================================
// Edge Function: comprimir-output
// ========================================================================
// Padrão Replit Agent 4: comprime output de Worker A antes de passar pro
// Worker B. Reduz custo + ruído + estouro de contexto.
//
// Recebe: { texto, contexto?, max_tokens? }
// Retorna: { resumo, tokens_originais, tokens_resumo, reducao_pct }
//
// Modelo: gpt-4o-mini (custo baixo, qualidade ok pra sumarização).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { chamarLLM, logarCustoFinOps, calcularCustoUSD } from '../_shared/agente.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

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
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sbAnon.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);
  if (!(await requireAuth(req))) return jsonResp({ error: 'Não autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON inválido' }, 400); }

  const { texto, contexto = '', max_tokens = 300 } = body;
  if (!texto || typeof texto !== 'string') {
    return jsonResp({ error: 'Faltou: texto (string)' }, 400);
  }

  // Se o texto já é curto (<800 chars), não comprime — retorna como está
  if (texto.length < 800) {
    return jsonResp({
      resumo: texto,
      tokens_originais: Math.ceil(texto.length / 4),
      tokens_resumo: Math.ceil(texto.length / 4),
      reducao_pct: 0,
      pulou_compressao: true,
      motivo: 'texto curto (<800 chars)',
    });
  }

  try {
    const systemPrompt = `Você é um sumarizador. Recebe output de um agente especialista e devolve resumo conciso pra ser usado no briefing do próximo agente.

Regras:
- Preservar TODA informação acionável (números, nomes, decisões, próximos passos).
- Cortar floreio, repetição, explicação pedagógica.
- Manter estrutura (se for lista, devolve lista).
- Máximo ${max_tokens} tokens.
- Não invente. Se não tem informação X, não escreve sobre X.
${contexto ? `\n## Contexto da próxima etapa\n${contexto}\n\nFaça o resumo focando no que é relevante pra esse contexto.` : ''}`;

    const llmResp = await chamarLLM({
      modelo: 'openai:gpt-4o-mini',
      systemPrompt,
      messages: [{ role: 'user', content: texto }],
      temperatura: 0.2,
      maxTokens: max_tokens,
    }, 'comprimir-output');

    const custoUSD = calcularCustoUSD(llmResp.modeloUsado, llmResp.tokensIn, llmResp.tokensOut, llmResp.tokensCached);
    await logarCustoFinOps({
      agenteSlug: 'compressor',
      modelo: llmResp.modeloUsado,
      custoUSD,
      tokensIn: llmResp.tokensIn,
      tokensOut: llmResp.tokensOut,
      tokensCached: llmResp.tokensCached,
    });

    const reducao = ((1 - llmResp.tokensOut / llmResp.tokensIn) * 100).toFixed(1);

    return jsonResp({
      resumo: llmResp.content,
      tokens_originais: llmResp.tokensIn,
      tokens_resumo: llmResp.tokensOut,
      reducao_pct: Number(reducao),
      custo_usd: Number(custoUSD.toFixed(6)),
      latencia_ms: llmResp.latenciaMs,
    });
  } catch (e: any) {
    console.error('[comprimir-output] erro:', e.message);
    return jsonResp({ error: e.message }, 500);
  }
});
