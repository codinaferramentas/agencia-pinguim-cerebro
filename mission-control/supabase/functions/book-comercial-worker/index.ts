// ============================================================
// Edge Function: book-comercial-worker
// ============================================================
// Worker do circuito Comercial 365 (Book do consultor).
//
// A cada invocação (pg_cron a cada 2 min, ou manual):
//  1. SYNC — lê agendamentos confirmados do evento comercial-365
//     (public.bookings, CloserFlow — SOMENTE LEITURA) e garante
//     uma linha em pinguim.book_analises pra cada um.
//  2. CLAIM — pega 1 job (pending, failed com tentativa sobrando,
//     ou processing travado há >10min) priorizando a call mais
//     próxima.
//  3. PIPELINE (com checkpoint por etapa — retomável):
//     a. casa com o formulário Yay!Forms (book_leads_form) por
//        email/telefone → nicho + faturamento
//     b. motor de análise IG (tool-analise-perfil-ig)
//     c. raio-X + munição (tool-consultar-pessoa + prova social + gpt-4o)
//     d. render Book consultor + Análise cliente (pele elo.)
//     e. PDF (serviço externo, opcional) — fallback HTML
//     f. upload no Drive (Hub Comercial)
//     g. linha na planilha de controle
//
// Input opcional: { booking_id?: string, forcar?: boolean }
//  - booking_id: processa este agendamento específico
//  - forcar: reprocessa mesmo se status=done (re-render/re-upload)
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { soDigitos } from '../_shared/telefone-br.ts';
import { consultarPessoa, buscarDepoimentos, gerarMunicao, montarRaiox, resumirAnalise } from './raiox.ts';
import { accessTokenGoogle, uploadArquivo, upsertLinhaPlanilha, LinhaPlanilha } from './drive.ts';
import { renderBookConsultor } from './render-book.ts';
import { renderCliente } from './render-cliente.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENTO_SLUG = 'comercial-365';
const MAX_TENTATIVAS = 3;

const sbPub = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'public' } });
const sbPin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });

// ============================================================
// Helpers
// ============================================================
function fmtDataCall(startsAt: string | null): string {
  if (!startsAt) return 'a definir';
  const d = new Date(startsAt);
  const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(d);
  return `${data} às ${hora.replace(':', 'h')} (Brasília)`;
}

function fmtDataArquivo(startsAt: string | null): string {
  const d = startsAt ? new Date(startsAt) : new Date();
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

function normalizarInstagram(v: string | null | undefined): string | null {
  if (!v) return null;
  let h = String(v).trim().toLowerCase();
  const m = h.match(/instagram\.com\/([a-z0-9._]+)/);
  if (m) h = m[1];
  h = h.replace(/^@/, '').replace(/[\/\s?].*$/, '').trim();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

function nomeArquivoSeguro(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

async function getConfig(chave: string): Promise<string | null> {
  const { data } = await sbPin.from('book_config').select('valor').eq('chave', chave).maybeSingle();
  return data?.valor || null;
}

async function atualizarAnalise(bookingId: string, patch: Record<string, unknown>) {
  const { error } = await sbPin.from('book_analises').update({ ...patch, updated_at: new Date().toISOString() }).eq('booking_id', bookingId);
  if (error) throw new Error('update book_analises: ' + error.message);
}

// ============================================================
// 1. SYNC bookings → book_analises
// ============================================================
async function syncBookings(): Promise<number> {
  const { data: eventos, error: e1 } = await sbPub.from('events').select('id').eq('slug', EVENTO_SLUG).limit(1);
  if (e1) throw new Error('events: ' + e1.message);
  if (!eventos?.length) return 0;
  const eventId = eventos[0].id;

  const { data: cfs } = await sbPub.from('custom_fields').select('id,label').eq('event_id', eventId).ilike('label', '%instagram%');
  const cfInstagram = cfs?.[0]?.id || null;

  const { data: bookings, error: e2 } = await sbPub
    .from('bookings')
    .select('id, client_name, client_email, client_phone, starts_at, status, custom_fields_data, created_at')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .order('starts_at', { ascending: true });
  if (e2) throw new Error('bookings: ' + e2.message);
  if (!bookings?.length) return 0;

  const ids = bookings.map((b: any) => b.id);
  const { data: existentes } = await sbPin.from('book_analises').select('booking_id').in('booking_id', ids);
  const jaTem = new Set((existentes || []).map((r: any) => r.booking_id));

  const novos = bookings.filter((b: any) => !jaTem.has(b.id)).map((b: any) => ({
    booking_id: b.id,
    status: 'pending',
    client_name: b.client_name,
    client_email: (b.client_email || '').toLowerCase() || null,
    client_phone: b.client_phone ? soDigitos(b.client_phone) : null,
    starts_at: b.starts_at,
    instagram_handle: cfInstagram ? normalizarInstagram(b.custom_fields_data?.[cfInstagram]) : null,
  }));

  if (novos.length) {
    const { error: e3 } = await sbPin.from('book_analises').insert(novos);
    if (e3) throw new Error('insert book_analises: ' + e3.message);
  }
  return novos.length;
}

// ============================================================
// 2. CLAIM de 1 job
// ============================================================
async function claimJob(bookingIdForcado: string | null, forcar: boolean): Promise<any | null> {
  if (bookingIdForcado) {
    const { data } = await sbPin.from('book_analises').select('*').eq('booking_id', bookingIdForcado).maybeSingle();
    if (!data) return null;
    if (data.status === 'done' && !forcar) return null;
    await atualizarAnalise(data.booking_id, { status: 'processing', started_at: new Date().toISOString(), tentativas: (data.tentativas || 0) + 1, error_message: null });
    return { ...data, tentativas: (data.tentativas || 0) + 1 };
  }

  const dezMinAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: candidatos } = await sbPin
    .from('book_analises')
    .select('*')
    .or(`status.eq.pending,and(status.eq.failed,tentativas.lt.${MAX_TENTATIVAS}),and(status.eq.processing,updated_at.lt.${dezMinAtras})`)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(5);

  for (const c of candidatos || []) {
    // claim otimista: só ganha quem conseguir mudar o status
    const { data: claimed } = await sbPin
      .from('book_analises')
      .update({ status: 'processing', started_at: new Date().toISOString(), tentativas: (c.tentativas || 0) + 1, error_message: null, updated_at: new Date().toISOString() })
      .eq('booking_id', c.booking_id)
      .eq('updated_at', c.updated_at)
      .select('booking_id');
    if (claimed?.length) return { ...c, tentativas: (c.tentativas || 0) + 1 };
  }
  return null;
}

// ============================================================
// 3. Match com formulário Yay!Forms
// ============================================================
async function acharFormulario(email: string | null, telefone: string | null): Promise<any | null> {
  if (email) {
    const { data } = await sbPin.from('book_leads_form').select('*').ilike('email', email).order('recebido_em', { ascending: false }).limit(1);
    if (data?.length) return data[0];
  }
  if (telefone) {
    const dig = soDigitos(telefone);
    const sufixo = dig.slice(-8);
    if (sufixo.length === 8) {
      const { data } = await sbPin.from('book_leads_form').select('*').ilike('telefone', `%${sufixo}`).order('recebido_em', { ascending: false }).limit(1);
      if (data?.length) return data[0];
    }
  }
  return null;
}

// ============================================================
// 4. Storage (HTML renderizável por link) + PDF externo (opcional)
// ============================================================
// O HTML de cada saída sempre sobe pro bucket book-html (público,
// caminho com UUID — só acessa quem tem o link, mesmo modelo da
// pasta do Drive). A URL pública abre o book RENDERIZADO no
// navegador. O serviço de PDF (quando configurado em book_config:
// pdf_endpoint/pdf_token) imprime a partir dessa URL — o HTML com
// imagens base64 passa dos 4,5MB de body que o Vercel aceita, por
// isso vai por URL e não no body.
async function subirHtmlStorage(html: string, storagePath: string): Promise<string | null> {
  const up = await sbPin.storage.from('book-html').upload(storagePath, new Blob([html], { type: 'text/html' }), { upsert: true, contentType: 'text/html' });
  if (up.error) { console.error('[worker] storage upload:', up.error.message); return null; }
  return `${SUPABASE_URL}/storage/v1/object/public/book-html/${storagePath}`;
}

async function gerarPdf(urlHtml: string | null): Promise<Uint8Array | null> {
  if (!urlHtml) return null;
  const endpoint = await getConfig('pdf_endpoint');
  if (!endpoint) return null;
  const token = (await getConfig('pdf_token')) || '';
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pdf-token': token },
      body: JSON.stringify({ url: urlHtml }),
    });
    if (!r.ok) { console.error('[worker] pdf HTTP', r.status, (await r.text()).slice(0, 200)); return null; }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 1000) return null;
    return buf;
  } catch (e) {
    console.error('[worker] pdf erro:', (e as Error).message);
    return null;
  }
}

// ============================================================
// PIPELINE de 1 lead
// ============================================================
async function processar(job: any, forcar: boolean): Promise<Record<string, unknown>> {
  const bookingId = job.booking_id;
  const log = (m: string) => console.log(`[worker][${bookingId.slice(0, 8)}] ${m}`);

  // sanity: booking ainda está confirmado? (lead pode ter cancelado)
  const { data: bkAtual } = await sbPub.from('bookings').select('status, starts_at').eq('id', bookingId).maybeSingle();
  if (!bkAtual || bkAtual.status !== 'confirmed') {
    await atualizarAnalise(bookingId, { status: 'failed', etapa: 'cancelado', error_message: `booking ${bkAtual?.status || 'sumiu'} — não vale análise`, finished_at: new Date().toISOString() });
    return { booking_id: bookingId, resultado: 'cancelado' };
  }

  // a) formulário
  const form = await acharFormulario(job.client_email, job.client_phone);
  const nicho = form?.nicho || job.nicho || null;
  const faturamento = form?.faturamento || job.faturamento || null;
  const instagram = job.instagram_handle || normalizarInstagram(form?.instagram) || null;
  if (!instagram) {
    await atualizarAnalise(bookingId, { status: 'failed', etapa: 'instagram', error_message: 'lead sem @ de Instagram utilizável (nem no agendamento, nem no formulário)', finished_at: new Date().toISOString() });
    return { booking_id: bookingId, resultado: 'failed', motivo: 'sem instagram' };
  }
  await atualizarAnalise(bookingId, { etapa: 'formulario', lead_form_id: form?.id || null, nicho, faturamento, instagram_handle: instagram });
  log(`form ${form ? 'OK' : 'NÃO RECEBIDO'} | ig=@${instagram} | nicho=${nicho}`);

  // b) motor de análise IG (checkpoint)
  let analise = forcar ? null : job.analysis_json;
  if (!analise) {
    await atualizarAnalise(bookingId, { etapa: 'motor_ig' });
    const nichoMotor = nicho || 'negócios digitais';
    const r = await fetch(`${SUPABASE_URL}/functions/v1/tool-analise-perfil-ig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}`, 'x-internal-token': SERVICE_ROLE },
      body: JSON.stringify({ handle: instagram, nicho: nichoMotor, objetivo: 'vender' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(`motor IG: ${j.erro || 'HTTP ' + r.status}`);
    analise = j.json;
    await atualizarAnalise(bookingId, { analysis_json: analise });
    log(`motor IG OK em ${j.duration_seconds}s`);
  } else {
    log('motor IG: usando checkpoint');
  }

  // c) raio-X + munição (checkpoint)
  let raioxCombo = forcar ? null : job.raiox_json;
  if (!raioxCombo) {
    await atualizarAnalise(bookingId, { etapa: 'raiox' });
    const [pessoa, depoimentos] = await Promise.all([
      consultarPessoa(job.client_email, job.client_phone),
      buscarDepoimentos(),
    ]);
    const municao = await gerarMunicao({
      lead: { nome: job.client_name || form?.nome || '', email: job.client_email, telefone: job.client_phone, instagram, nicho, faturamento },
      analiseResumo: resumirAnalise(analise),
      pessoa,
      depoimentos,
    });
    const raiox = montarRaiox(pessoa, municao);
    raioxCombo = { raiox, municao };
    await atualizarAnalise(bookingId, { raiox_json: raioxCombo, produto_alvo: municao.produto_alvo });
    log(`raio-X OK | produto_alvo=${municao.produto_alvo} | ja_cliente=${raiox.ja_cliente}`);
  } else {
    log('raio-X: usando checkpoint');
  }

  // d) render
  await atualizarAnalise(bookingId, { etapa: 'render' });
  const lead = {
    nome: job.client_name || form?.nome || `@${instagram}`,
    email: job.client_email || form?.email || '',
    telefone: job.client_phone || form?.telefone || '',
    instagram,
    nicho,
    faturamento,
    data_call: fmtDataCall(bkAtual.starts_at),
    form_recebido: !!form,
  };
  const geradoEm = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const htmlBook = renderBookConsultor({ lead, analise, raiox: raioxCombo.raiox, municao: raioxCombo.municao, gerado_em: geradoEm });
  const htmlCliente = renderCliente({ lead, analise, gerado_em: geradoEm });

  // e) Storage (HTML renderizável) + PDF (opcional) + f) Drive
  await atualizarAnalise(bookingId, { etapa: 'drive' });
  const folderId = (await getConfig('drive_folder_id'))!;
  const gToken = await accessTokenGoogle();
  const base = nomeArquivoSeguro(`${lead.nome} - ${lead.telefone || 'sem-telefone'} - ${fmtDataArquivo(bkAtual.starts_at)}`);

  const [urlHtmlBook, urlHtmlCliente] = await Promise.all([
    subirHtmlStorage(htmlBook, `${bookingId}/book-consultor.html`),
    subirHtmlStorage(htmlCliente, `${bookingId}/analise-cliente.html`),
  ]);
  const [pdfBook, pdfCliente] = await Promise.all([gerarPdf(urlHtmlBook), gerarPdf(urlHtmlCliente)]);

  const upBook = pdfBook
    ? await uploadArquivo({ token: gToken, folderId, nome: `${base} - BOOK CONSULTOR.pdf`, mime: 'application/pdf', conteudo: pdfBook })
    : await uploadArquivo({ token: gToken, folderId, nome: `${base} - BOOK CONSULTOR.html`, mime: 'text/html', conteudo: htmlBook });
  const upCliente = pdfCliente
    ? await uploadArquivo({ token: gToken, folderId, nome: `${base} - ANALISE CLIENTE.pdf`, mime: 'application/pdf', conteudo: pdfCliente })
    : await uploadArquivo({ token: gToken, folderId, nome: `${base} - ANALISE CLIENTE.html`, mime: 'text/html', conteudo: htmlCliente });
  log(`drive OK: ${upBook.id} / ${upCliente.id} (pdf=${!!pdfBook})`);

  // link que o comercial clica: PDF no Drive quando houver; senão o
  // HTML renderizado direto do Storage (abre bonito no navegador)
  const linkBook = pdfBook ? upBook.webViewLink : (urlHtmlBook || upBook.webViewLink);
  const linkCliente = pdfCliente ? upCliente.webViewLink : (urlHtmlCliente || upCliente.webViewLink);

  // g) planilha
  await atualizarAnalise(bookingId, { etapa: 'planilha' });
  const sheetId = (await getConfig('sheet_id'))!;
  const linha: LinhaPlanilha = {
    booking_id: bookingId,
    recebido_em: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(form?.recebido_em || job.created_at)),
    nome: lead.nome,
    email: lead.email,
    whatsapp: lead.telefone,
    instagram: '@' + instagram,
    nicho: nicho || '—',
    faturamento: faturamento || '—',
    call_quando: lead.data_call,
    produto_alvo: raioxCombo.municao?.produto_alvo || '—',
    status: 'Concluída',
    link_book: linkBook,
    link_cliente: linkCliente,
    ja_aluno: raioxCombo.raiox?.ja_cliente ? 'Sim' : 'Não',
  };
  await upsertLinhaPlanilha(gToken, sheetId, linha);

  await atualizarAnalise(bookingId, {
    status: 'done', etapa: 'done',
    drive_report_url: linkBook,
    drive_cliente_url: linkCliente,
    finished_at: new Date().toISOString(),
  });
  log('DONE');
  return { booking_id: bookingId, resultado: 'done', book: linkBook, cliente: linkCliente, pdf: !!pdfBook };
}

// ============================================================
// SERVE
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* cron manda {} */ }

  try {
    const sincronizados = await syncBookings();
    const job = await claimJob(body.booking_id || null, !!body.forcar);
    if (!job) {
      return jsonRespTool({ ok: true, sincronizados, mensagem: 'nenhum job pra processar' });
    }

    try {
      const resultado = await processar(job, !!body.forcar);
      return jsonRespTool({ ok: true, sincronizados, ...resultado });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[worker][${job.booking_id}] FALHOU:`, msg);
      // erro determinístico (perfil privado/inexistente/sem posts) não melhora
      // com retry — esgota já e registra na planilha
      const terminal = /PRIVATE_PROFILE|NOT_FOUND|handle invalido|sem posts/i.test(msg);
      const esgotou = terminal || (job.tentativas || 1) >= MAX_TENTATIVAS;
      await atualizarAnalise(job.booking_id, {
        status: 'failed',
        error_message: msg.slice(0, 500),
        tentativas: terminal ? MAX_TENTATIVAS : job.tentativas,
        finished_at: esgotou ? new Date().toISOString() : null,
      });
      // registra a falha na planilha (best effort, só quando esgotar)
      if (esgotou) {
        try {
          const gToken = await accessTokenGoogle();
          const sheetId = await getConfig('sheet_id');
          if (sheetId) {
            await upsertLinhaPlanilha(gToken, sheetId, {
              booking_id: job.booking_id,
              recebido_em: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(new Date(job.created_at)),
              nome: job.client_name || '—', email: job.client_email || '—', whatsapp: job.client_phone || '—',
              instagram: job.instagram_handle ? '@' + job.instagram_handle : '—',
              nicho: job.nicho || '—', faturamento: job.faturamento || '—',
              call_quando: fmtDataCall(job.starts_at), produto_alvo: '—',
              status: 'Falhou', link_book: '', link_cliente: '', ja_aluno: '',
            });
          }
        } catch (_) { /* planilha é secundária no caminho de erro */ }
      }
      return jsonRespTool({ ok: false, booking_id: job.booking_id, erro: msg, tentativa: job.tentativas, max: MAX_TENTATIVAS }, 500);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[worker] erro geral:', msg);
    return jsonRespTool({ ok: false, erro: msg }, 500);
  }
});
