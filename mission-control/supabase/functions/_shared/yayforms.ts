// ============================================================
// _shared/yayforms.ts
// ============================================================
// Parser tolerante do webhook do Yay!Forms, compartilhado pelas duas
// entradas do Book Comercial 365 (book-lead-form e book-mentoria-form).
//
// Formato REAL confirmado em produção:
//   { response: { id, formId, answers: { <fieldId>: { content, fieldTitle } } } }
// content: string | string[] | null (null = statement/aviso, sem resposta).
// Algumas integrações embrulham em { body: { response: {...} } } — a
// função desembrulha o `body` sozinha.
// ============================================================

import { soDigitos } from './telefone-br.ts';

export interface ParExtraido { pergunta: string; resposta: string }

function normalizar(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

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
  for (const [k, v] of Object.entries(a)) {
    if (k === 'type' || k === 'field') continue;
    if (typeof v === 'string' || typeof v === 'number') return String(v);
  }
  return '';
}

export function extrairPares(payloadBruto: Record<string, unknown>): { pares: ParExtraido[]; formId: string | null; submissionId: string | null; tiposPorPergunta: Map<string, string> } {
  // desembrulha { body: {...} } quando a integração aninha assim
  const payload = (payloadBruto.body && typeof payloadBruto.body === 'object'
    ? payloadBruto.body
    : payloadBruto) as Record<string, unknown>;

  const fr = (payload.form_response || payload) as Record<string, unknown>;
  const tiposPorPergunta = new Map<string, string>();
  const pares: ParExtraido[] = [];

  // formato real Yay!Forms: response.answers = { <fieldId>: {fieldTitle, content} }
  const resp = payload.response as Record<string, unknown> | undefined;
  if (resp && resp.answers && typeof resp.answers === 'object' && !Array.isArray(resp.answers)) {
    for (const a of Object.values(resp.answers as Record<string, any>)) {
      const pergunta = String(a?.fieldTitle || '').trim();
      let conteudo = a?.content;
      if (conteudo === null || conteudo === undefined) continue;
      if (Array.isArray(conteudo)) conteudo = conteudo.join(', ');
      const resposta = String(conteudo).trim();
      if (!pergunta || !resposta) continue;
      pares.push({ pergunta, resposta });
    }
    return { pares, formId: String(resp.formId ?? '') || null, submissionId: String(resp.id ?? '') || null, tiposPorPergunta };
  }

  // formato Typeform-like: answers[] com definition.fields[]
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
    // formato achatado { "Nome": "...", ... }
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

/** Normaliza @ do Instagram: tira @, URL, lowercase. Texto livre com
 * espaço no meio NÃO é handle (ex.: "nao sei vender") — retorna null. */
export function normalizarInstagram(v: string | null): string | null {
  if (!v) return null;
  let h = String(v).trim().toLowerCase();
  const m = h.match(/instagram\.com\/([a-z0-9._]+)/);
  if (m) h = m[1];
  h = h.replace(/^@/, '').replace(/[\/?].*$/, '').trim();
  if (/\s/.test(h)) return null;
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

export function classificarCampos(pares: ParExtraido[], tipos: Map<string, string>) {
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
      if (normalizarInstagram(resposta)) { out.instagram = resposta.trim(); continue; }
    }
    if (!out.faturamento && /fatura|receita|renda|ganho|financeiro/.test(p)) { out.faturamento = resposta.trim(); continue; }
    if (!out.nicho && /nicho|segmento|mercado|atuacao|area de atua|atua com|trabalha com/.test(p)) { out.nicho = resposta.trim(); continue; }
    if (!out.nome && /\bnome\b/.test(p) && !/instagram|usuario|arroba/.test(p)) { out.nome = resposta.trim(); continue; }
  }

  // nicho fica mais útil composto com "o que você vende" (quando existir)
  if (out.nicho) {
    const vende = pares.find(({ pergunta }) => /o que voce vende|o que vende/.test(normalizar(pergunta)));
    if (vende && !out.nicho.toLowerCase().includes(vende.resposta.toLowerCase())) {
      out.nicho = `${out.nicho} — ${vende.resposta}`;
    }
  }
  return out;
}
