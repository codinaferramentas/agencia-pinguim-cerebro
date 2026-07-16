// ============================================================
// Edge Function: book-lead-form
// ============================================================
// Endpoint que recebe o webhook do Yay!Forms do circuito
// Comercial 365 e grava o lead em pinguim.book_leads_form.
//
// O worker (book-comercial-worker) casa esses dados com o
// agendamento do CloserFlow (public.bookings) pra gerar o
// Book do consultor.
//
// Auth: token dedicado BOOK_FORM_TOKEN (cofre), passado como
// query string `?t=...` ou header `x-book-token` (o Yay!Forms
// só permite configurar a URL, então query string é o caminho).
//
// Deploy: npx supabase functions deploy book-lead-form --no-verify-jwt
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';
import { soDigitos } from '../_shared/telefone-br.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-book-token, x-client-info, x-supabase-api-version',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Comparação constant-time (mesmo padrão do auth-evento.ts)
function tokenIgual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizar(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ============================================================
// Parser tolerante do payload do Yay!Forms
// ============================================================
// O Yay!Forms manda webhook no formato compatível com Typeform:
//   { event_type: 'form_response', form_response: { form_id, token,
//     definition: { fields: [{id,title,type,ref}] },
//     answers: [{ type, text|email|phone_number|number|boolean,
//                 choice:{label}, choices:{labels[]}, field:{id,ref,type} }] } }
// Também aceitamos formatos achatados (garantia contra mudança de formato).

interface ParExtraido { pergunta: string; resposta: string }

function respostaParaTexto(a: Record<string, unknown>): string {
  if (typeof a.text === 'string') return a.text;
  if (typeof a.email === 'string') return a.email;
  if (typeof a.phone_number === 'string') return a.phone_number;
  if (typeof a.url === 'string') return a.url;
  if (typeof a.number === 'number') return String(a.number);
  if (typeof a.boolean === 'boolean') return a.boolean ? 'sim' : 'nao';
  if (typeof a.date === 'string') return a.date;
  const choice = a.choice as Record<string, unknown> | undefined;
  if (choice && typeof choice.label === 'string') return choice.label;
  const choices = a.choices as Record<string, unknown> | undefined;
  if (choices && Array.isArray(choices.labels)) return (choices.labels as string[]).join(', ');
  // último recurso: primeiro valor string/number que não seja metadado
  for (const [k, v] of Object.entries(a)) {
    if (k === 'type' || k === 'field') continue;
    if (typeof v === 'string' || typeof v === 'number') return String(v);
  }
  return '';
}

function extrairPares(payload: Record<string, unknown>): { pares: ParExtraido[]; formId: string | null; submissionId: string | null; tiposPorPergunta: Map<string, string> } {
  const fr = (payload.form_response || payload) as Record<string, unknown>;
  const tiposPorPergunta = new Map<string, string>();
  const pares: ParExtraido[] = [];

  const definition = fr.definition as Record<string, unknown> | undefined;
  const defFields = (definition?.fields || fr.fields || []) as Record<string, unknown>[];
  const tituloPorId = new Map<string, string>();
  for (const f of defFields) {
    const id = String(f.id ?? f.ref ?? '');
    if (id && typeof f.title === 'string') tituloPorId.set(id, f.title);
    if (typeof f.ref === 'string' && typeof f.title === 'string') tituloPorId.set(f.ref, f.title);
  }

  const answers = (fr.answers || []) as Record<string, unknown>[];
  if (Array.isArray(answers) && answers.length > 0) {
    for (const a of answers) {
      const field = (a.field || {}) as Record<string, unknown>;
      const fid = String(field.id ?? field.ref ?? '');
      const pergunta = tituloPorId.get(fid) || String(field.title ?? field.ref ?? fid ?? 'campo');
      const resposta = respostaParaTexto(a).trim();
      if (!resposta) continue;
      pares.push({ pergunta, resposta });
      if (typeof a.type === 'string') tiposPorPergunta.set(pergunta, a.type);
    }
  } else {
    // Formato achatado: { "Nome": "...", "Email": "..." } ou { data: {...} }
    const flat = (fr.data || fr) as Record<string, unknown>;
    for (const [k, v] of Object.entries(flat)) {
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      if (['event_id', 'event_type', 'form_id', 'token', 'submitted_at', 'landed_at'].includes(k)) continue;
      const resposta = String(v).trim();
      if (resposta) pares.push({ pergunta: k, resposta });
    }
  }

  const formId = String(fr.form_id ?? payload.form_id ?? '') || null;
  const submissionId = String(fr.token ?? payload.event_id ?? fr.submission_id ?? '') || null;
  return { pares, formId, submissionId, tiposPorPergunta };
}

function classificarCampos(pares: ParExtraido[], tipos: Map<string, string>) {
  const out: { nome: string | null; email: string | null; telefone: string | null; instagram: string | null; faturamento: string | null; nicho: string | null } = {
    nome: null, email: null, telefone: null, instagram: null, faturamento: null, nicho: null,
  };

  for (const { pergunta, resposta } of pares) {
    const p = normalizar(pergunta);
    const tipo = tipos.get(pergunta) || '';

    if (!out.email && (tipo === 'email' || /e-?mail/.test(p) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resposta))) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resposta.trim())) { out.email = resposta.trim().toLowerCase(); continue; }
    }
    if (!out.telefone && (tipo === 'phone_number' || /whats|telefone|celular|fone|phone/.test(p))) {
      const dig = soDigitos(resposta);
      if (dig.length >= 8) { out.telefone = dig; continue; }
    }
    if (!out.instagram && (/instagram|insta\b|perfil/.test(p) || resposta.trim().startsWith('@'))) {
      out.instagram = resposta.trim(); continue;
    }
    if (!out.faturamento && /fatura|receita|renda|ganho|financeiro/.test(p)) { out.faturamento = resposta.trim(); continue; }
    if (!out.nicho && /nicho|segmento|mercado|atuacao|area de atua|atua com|trabalha com/.test(p)) { out.nicho = resposta.trim(); continue; }
    if (!out.nome && /\bnome\b/.test(p) && !/instagram|usuario|arroba/.test(p)) { out.nome = resposta.trim(); continue; }
  }
  return out;
}

/** Normaliza @ do Instagram: tira @, URL, espaços, lowercase. */
function normalizarInstagram(v: string | null): string | null {
  if (!v) return null;
  let h = v.trim().toLowerCase();
  const m = h.match(/instagram\.com\/([a-z0-9._]+)/);
  if (m) h = m[1];
  h = h.replace(/^@/, '').replace(/[\/\s?].*$/, '').trim();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ ok: false, erro: 'Use POST' }, 405);

  // Auth por token dedicado
  const url = new URL(req.url);
  const tokenRecebido = url.searchParams.get('t') || req.headers.get('x-book-token') || '';
  let tokenEsperado = '';
  try {
    tokenEsperado = await getChave('BOOK_FORM_TOKEN', 'book-lead-form');
  } catch (_) {
    return jsonResp({ ok: false, erro: 'BOOK_FORM_TOKEN nao configurado no cofre' }, 500);
  }
  if (!tokenIgual(tokenRecebido, tokenEsperado)) return jsonResp({ ok: false, erro: 'token invalido' }, 401);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return jsonResp({ ok: false, erro: 'JSON invalido' }, 400); }

  try {
    const { pares, formId, submissionId, tiposPorPergunta } = extrairPares(payload);
    const campos = classificarCampos(pares, tiposPorPergunta);
    const instagram = normalizarInstagram(campos.instagram);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });

    const row = {
      nome: campos.nome,
      email: campos.email,
      telefone: campos.telefone,
      instagram: instagram || campos.instagram,
      faturamento: campos.faturamento,
      nicho: campos.nicho,
      respostas: pares,
      payload_bruto: payload,
      form_id: formId,
      submission_id: submissionId,
    };

    let data, error;
    if (submissionId) {
      ({ data, error } = await sb.from('book_leads_form').upsert(row, { onConflict: 'submission_id' }).select('id').single());
    } else {
      ({ data, error } = await sb.from('book_leads_form').insert(row).select('id').single());
    }
    if (error) throw new Error(error.message);

    console.log(`[book-lead-form] lead gravado: ${data.id} | email=${campos.email} | ig=${instagram} | nicho=${campos.nicho}`);
    return jsonResp({ ok: true, id: data.id, campos_extraidos: { ...campos, instagram: instagram || campos.instagram } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[book-lead-form] erro:', msg);
    return jsonResp({ ok: false, erro: msg }, 500);
  }
});
