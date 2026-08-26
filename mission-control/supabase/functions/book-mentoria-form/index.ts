// ============================================================
// Edge Function: book-mentoria-form
// ============================================================
// SEGUNDA entrada do Book Comercial 365: formulário externo
// "Mentoria em Grupo" (Micha, Yay!Forms). Diferente do circuito
// comercial-365, aqui NÃO há agendamento de call — o time entra
// em contato depois. Então este webhook:
//   1. parseia o form (mesmo formato Yay!Forms)
//   2. grava o lead em pinguim.book_leads_form (histórico + ficha)
//   3. cria a análise em pinguim.book_analises com origem
//      'mentoria-grupo' e booking_id sintético (UUID), status pending
//   4. dispara o worker na hora
// O worker gera a análise SEM call (sem data), grava no Drive com
// sufixo -mentoria-grupo.
//
// Auth: token BOOK_MENTORIA_TOKEN (cofre), via query ?t= ou header.
// Deploy: npx supabase functions deploy book-mentoria-form --no-verify-jwt
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';
import { soDigitos } from '../_shared/telefone-br.ts';
import { extrairPares, classificarCampos, normalizarInstagram } from '../_shared/yayforms.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGEM = 'mentoria-grupo';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-book-token, x-client-info, x-supabase-api-version',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function tokenIgual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// UUID determinístico a partir do submissionId (idempotência: reenvio do
// mesmo formulário não cria análise duplicada). SHA-1 → formato UUID v5-like.
async function uuidDeterministico(seed: string): Promise<string> {
  const data = new TextEncoder().encode('mentoria-grupo:' + seed);
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
  const h = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ ok: false, erro: 'Use POST' }, 405);

  const url = new URL(req.url);
  const tokenRecebido = url.searchParams.get('t') || req.headers.get('x-book-token') || '';
  let tokenEsperado = '';
  try {
    tokenEsperado = await getChave('BOOK_MENTORIA_TOKEN', 'book-mentoria-form');
  } catch (_) {
    return jsonResp({ ok: false, erro: 'BOOK_MENTORIA_TOKEN nao configurado no cofre' }, 500);
  }
  if (!tokenIgual(tokenRecebido, tokenEsperado)) return jsonResp({ ok: false, erro: 'token invalido' }, 401);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return jsonResp({ ok: false, erro: 'JSON invalido' }, 400); }

  try {
    const { pares, formId, submissionId, tiposPorPergunta } = extrairPares(payload);
    const campos = classificarCampos(pares, tiposPorPergunta);
    const instagram = normalizarInstagram(campos.instagram);

    if (!instagram) {
      // sem @ utilizável não dá pra analisar — registra e recusa com clareza
      console.warn(`[book-mentoria-form] sem instagram | email=${campos.email} | pares=${pares.length}`);
      return jsonResp({ ok: false, erro: 'formulario sem @ de Instagram utilizavel', campos_extraidos: campos }, 422);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });

    // 1) grava o lead (histórico + ficha do formulário no book)
    const leadRow = {
      nome: campos.nome, email: campos.email, telefone: campos.telefone ? soDigitos(campos.telefone) : null,
      instagram, faturamento: campos.faturamento, nicho: campos.nicho,
      respostas: pares, payload_bruto: payload,
      form_id: formId, submission_id: submissionId ? `mentoria:${submissionId}` : null,
    };
    let leadId: string | null = null;
    if (submissionId) {
      const { data, error } = await sb.from('book_leads_form').upsert(leadRow, { onConflict: 'submission_id' }).select('id').single();
      if (error) throw new Error('lead upsert: ' + error.message);
      leadId = data.id;
    } else {
      const { data, error } = await sb.from('book_leads_form').insert(leadRow).select('id').single();
      if (error) throw new Error('lead insert: ' + error.message);
      leadId = data.id;
    }

    // 2) cria a análise (booking_id sintético determinístico p/ idempotência)
    const bookingId = await uuidDeterministico(submissionId || (campos.email || '') + instagram);
    const { data: existente } = await sb.from('book_analises').select('booking_id, status').eq('booking_id', bookingId).maybeSingle();

    if (!existente) {
      const { error: eIns } = await sb.from('book_analises').insert({
        booking_id: bookingId,
        origem: ORIGEM,
        status: 'pending',
        lead_form_id: leadId,
        client_name: campos.nome,
        client_email: (campos.email || '').toLowerCase() || null,
        client_phone: campos.telefone ? soDigitos(campos.telefone) : null,
        starts_at: null, // sem call
        instagram_handle: instagram,
        nicho: campos.nicho,
        faturamento: campos.faturamento,
      });
      if (eIns) throw new Error('analise insert: ' + eIns.message);
    }

    // 3) acorda a FILA do worker (sem booking_id específico) — ele pega 1 job
    // por vez e auto-encadeia. Numa carga histórica de ~40 formulários em
    // rajada, todos entram como 'pending' instantâneo mas são processados em
    // sequência (~1/min), sem 40 análises paralelas estourando OpenAI/Apify.
    fetch(`${SUPABASE_URL}/functions/v1/book-comercial-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}`, 'x-internal-token': SERVICE_ROLE },
      body: JSON.stringify({ carga: true }),
    }).catch((e) => console.error('[book-mentoria-form] acordar fila:', e.message));

    console.log(`[book-mentoria-form] OK | ig=@${instagram} | email=${campos.email} | booking=${bookingId} | novo=${!existente}`);
    return jsonResp({ ok: true, booking_id: bookingId, origem: ORIGEM, ja_existia: !!existente, campos_extraidos: { ...campos, instagram } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[book-mentoria-form] erro:', msg);
    return jsonResp({ ok: false, erro: msg }, 500);
  }
});
