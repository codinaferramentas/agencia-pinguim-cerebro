// ========================================================================
// Edge Function: hotmart-planilha-worker
// ========================================================================
// Rotina universal: venda Hotmart (ProAlt, depois Elo) → linha na planilha
// Google certa, escolhida pelo ID da oferta que aparece no FINAL do nome da
// aba (padrão "Nome ... -<oferta1>-<oferta2>").
//
// Dois modos, distinguidos pelo FORMATO do body (disparar_edge_function não
// repassa argumentos — só manda {}):
//
//   • MODO WEBHOOK  (body é um evento Hotmart, tem comprador/buyer):
//       1. (opcional) valida hottok
//       2. INSERT na outbox (status 'pendente')  — nada se perde
//       3. resolve planilha do produto
//       4. lê nomes de TODAS as abas → acha a que contém o ID da oferta
//            achou    → append da linha
//            não achou → append na aba INCONSISTENCIA (+ coluna do ID)
//       5. sucesso → DELETE da outbox (auto-limpa)
//          falha    → deixa 'pendente'/'erro' pro retry
//
//   • MODO RETRY  (body vazio — veio do cron */5):
//       reprocessa cada linha 'pendente'/'erro' da outbox.
//
//   • MODO CAPTURA embutido: se chegar um POST que NÃO reconhecemos como
//     venda (ex.: o "Enviar teste" da Hotmart, ou um evento diferente),
//     gravamos o payload cru na outbox com status 'erro' e devolvemos 200 +
//     o que vimos, pra inspeção. Assim o teste da Hotmart cai num lugar
//     visível e a gente mapeia os campos reais.
//
// Auth: webhook público (Hotmart não manda JWT). Segurança = hottok.
//   → precisa estar na allowlist de "no-JWT" do config.toml (verify_jwt=false).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

// ------------------------------------------------------------------------
// Config por produto. Só ProAlt por ora; Elo entra adicionando uma entrada.
// A planilha e (opcional) o nome da chave do hottok no cofre ficam aqui —
// NENHUM segredo hardcoded, só ponteiros.
// ------------------------------------------------------------------------
const PRODUTOS: Record<string, { spreadsheet_id: string; hottok_chave?: string }> = {
  proalt: {
    spreadsheet_id: '1bJjWFTD5qn5o1SkvAAeMaFb4Ravcx2ozDITI7q1lZ4c',
    hottok_chave: 'HOTMART_HOTTOK_PROALT', // opcional; se ausente no cofre, não bloqueia
  },
  // elo: { spreadsheet_id: '...', hottok_chave: 'HOTMART_HOTTOK_ELO' },
};

// Produto default quando não dá pra inferir (por ora só temos ProAlt ligado).
const PRODUTO_DEFAULT = 'proalt';

const ABA_INCONSISTENCIA = 'INCONSISTENCIA';

// CORS liberado (webhook server-to-server; navegador não chama, mas mantém padrão).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hotmart-hottok',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ========================================================================
// OAuth Google (mesmo padrão de tool-ler/editar-planilha-google)
// ========================================================================
const _tok: { access_token: string | null; expira_em_ms: number } = { access_token: null, expira_em_ms: 0 };
async function accessTokenGoogle(): Promise<string> {
  const agora = Date.now();
  if (_tok.access_token && _tok.expira_em_ms > agora + 5 * 60_000) return _tok.access_token;
  const [cid, sec, rt] = await Promise.all([
    getChave('GOOGLE_OAUTH_CLIENT_ID', 'hotmart-planilha-worker'),
    getChave('GOOGLE_OAUTH_CLIENT_SECRET', 'hotmart-planilha-worker'),
    getChave('GOOGLE_OAUTH_REFRESH', 'hotmart-planilha-worker'),
  ]);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: sec, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  if (!r.ok) throw new Error(`OAuth refresh ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (!j.access_token) throw new Error('refresh sem access_token');
  _tok.access_token = j.access_token;
  _tok.expira_em_ms = agora + (parseInt(j.expires_in, 10) || 3600) * 1000;
  return j.access_token;
}

// ========================================================================
// Sheets API helpers
// ========================================================================
async function listarAbas(spreadsheetId: string, token: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Sheets listar abas ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
}

// append de uma linha no fim de uma aba (values.append cuida da última linha)
async function appendLinha(spreadsheetId: string, aba: string, valores: any[], token: string): Promise<void> {
  const range = `${aba}!A1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`
    + `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ majorDimension: 'ROWS', values: [valores] }),
  });
  if (!r.ok) throw new Error(`Sheets append "${aba}" ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// cria a aba INCONSISTENCIA se não existir (idempotente)
async function garantirAbaInconsistencia(spreadsheetId: string, abasExistentes: string[], token: string): Promise<void> {
  if (abasExistentes.includes(ABA_INCONSISTENCIA)) return;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: ABA_INCONSISTENCIA } } }] }),
  });
  if (!r.ok) throw new Error(`Sheets criar aba INCONSISTENCIA ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ========================================================================
// Matching da aba pelo ID da oferta.
//
// O ID da oferta é literalmente um pedaço do NOME da aba. Uma aba pode ter
// VÁRIAS ofertas ("ProAlt Agosto V1-jmvztt7y-g1eac87q") e a planilha pode
// ter dezenas de abas (um mês por planilha, várias abas por planilha).
//
// Estratégia: varre TODAS as abas (feito no chamador) e, pra cada uma,
// quebra o nome em "tokens" por qualquer separador não-alfanumérico
// (-, _, espaço, etc.) e checa se ALGUM token é exatamente o ID da oferta.
// Assim não depende do separador ser '-', e não dá falso-positivo por
// substring (ex.: oferta "abc" não casaria dentro de "abcdef").
// Case-insensitive.
// ========================================================================
function abaCasaOferta(nomeAba: string, ofertaId: string): boolean {
  if (!ofertaId) return false;
  const alvo = ofertaId.trim().toLowerCase();
  if (!alvo) return false;
  const tokens = nomeAba.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
  return tokens.includes(alvo);
}

// ========================================================================
// Extração do que interessa do payload da Hotmart.
// Hotmart tem 2 gerações de webhook (v1 e v2/"nova versão"). Os caminhos
// mudam. Aqui a gente tenta os dois e cai pro que existir. Quando o teste
// real chegar, a gente trava no formato certo — por isso o modo captura.
// ========================================================================
function pick(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    let v = obj;
    for (const k of path.split('.')) v = v?.[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function extrairVenda(payload: any): {
  ofertaId: string;
  data: string;
  nome: string;
  documento: string;
  email: string;
  ddd: string;
  telefone: string;
} | null {
  // buyer/comprador em v1 e v2
  const buyer = payload?.data?.buyer ?? payload?.buyer ?? payload?.data?.purchase?.buyer ?? {};
  const purchase = payload?.data?.purchase ?? payload?.purchase ?? {};

  const email = pick(buyer, 'email') || pick(payload, 'data.subscriber.email', 'subscriber.email');
  // Se não achou email nem nome, isto não parece uma venda → deixa o modo captura tratar.
  const nome = pick(buyer, 'name') || pick(payload, 'data.subscriber.name');
  if (!email && !nome) return null;

  // ID da oferta — confirmado no payload REAL v2.0.0: data.purchase.offer.code.
  // Mantém fallbacks pra v1/variações por segurança.
  const ofertaId = pick(payload,
    'data.purchase.offer.code', 'purchase.offer.code',
    'data.offer.code', 'offer.code',
    'data.purchase.offer.key', 'prod_offer', 'offer_code',
  );

  // Telefone (payload real): buyer.checkout_phone (número) +
  // buyer.checkout_phone_code (código/DDD). Ambos podem vir só com dígitos.
  const foneBruto = pick(buyer, 'checkout_phone', 'phone')
    || pick(payload, 'data.buyer.phone', 'buyer.phone');
  const codigoFone = pick(buyer, 'checkout_phone_code', 'phone_local_code', 'ddd');
  const { ddd, telefone } = separarDddTelefone(codigoFone, foneBruto);

  const documento = pick(buyer, 'document', 'documents.0.value')
    || pick(payload, 'data.buyer.document');

  // Data (payload real): order_date vem como TIMESTAMP EM MILISSEGUNDOS
  // (ex.: 1511783344000). Converte pra "DD/MM/AAAA HH:MM" BRT, igual aos
  // prints da planilha. Fallback approved_date / creation_date.
  const dataMs = pick(purchase, 'order_date', 'approved_date')
    || pick(payload, 'creation_date', 'data.purchase.order_date');
  const data = formatarDataBR(dataMs);

  return {
    ofertaId,
    data,
    nome,
    documento,
    email,
    ddd,
    telefone,
  };
}

// America/Sao_Paulo = UTC-3 fixo (sem horário de verão desde 2019).
const TZ_OFFSET_MS = -3 * 3600 * 1000;

// Converte timestamp Hotmart (ms) pra "DD/MM/AAAA HH:MM:SS" BRT — mesmo
// formato das linhas existentes da planilha (ex.: "12/08/2026 16:19:45").
// Se vier vazio ou não-numérico, devolve o que veio (defensivo).
function formatarDataBR(valor: string): string {
  const n = Number(valor);
  if (!valor || !Number.isFinite(n) || n <= 0) return valor || '';
  const d = new Date(n + TZ_OFFSET_MS);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// Separa DDD do número. A Hotmart manda checkout_phone_code (pode ser DDD, ou
// código país+DDD, ou vazio) e checkout_phone (número, às vezes já com DDD).
// Regra: se o code tem 2-3 dígitos, é o DDD. Senão, tenta extrair os 2
// primeiros dígitos do número como DDD. Nunca inventa — na dúvida deixa o
// número inteiro em telefone e DDD vazio.
function separarDddTelefone(code: string, numero: string): { ddd: string; telefone: string } {
  const soDig = (s: string) => String(s || '').replace(/\D/g, '');
  const c = soDig(code);
  const n = soDig(numero);
  // code com cara de DDD (2-3 dígitos) → usa direto
  if (c.length >= 2 && c.length <= 3) return { ddd: c, telefone: n };
  // número com 10-11 dígitos (DDD + fone) → fatia os 2 primeiros como DDD
  if (n.length >= 10 && n.length <= 11) return { ddd: n.slice(0, 2), telefone: n.slice(2) };
  // não dá pra afirmar → não inventa
  return { ddd: '', telefone: n };
}

// Monta a linha na ORDEM das colunas da planilha (dos prints):
// A Data | B Contato | C Documento | D Email | E DDD | F Telefone | G Entrada...
// (Entrada e status ficam pro pessoal / ficam vazias por ora — confirmar no teste real.)
function montarLinha(v: ReturnType<typeof extrairVenda>): any[] {
  if (!v) return [];
  return [v.data, v.nome, v.documento, v.email, v.ddd, v.telefone];
}

// ========================================================================
// Núcleo: processa UMA venda (usado no webhook e no retry).
// Recebe a linha da outbox já persistida. Escreve na planilha e limpa.
// ========================================================================
async function processarOutbox(row: any): Promise<{ status: string; aba?: string; erro?: string }> {
  const cfg = PRODUTOS[row.produto] ?? PRODUTOS[PRODUTO_DEFAULT];
  const spreadsheetId = row.spreadsheet_id || cfg.spreadsheet_id;
  const linha: any[] = row.linha ?? montarLinha(extrairVenda(row.payload));
  const ofertaId: string = row.oferta_id || '';

  const token = await accessTokenGoogle();
  const abas = await listarAbas(spreadsheetId, token);

  // acha a aba pelo ID da oferta
  const abaAlvo = abas.find((a) => abaCasaOferta(a, ofertaId));

  if (abaAlvo) {
    await appendLinha(spreadsheetId, abaAlvo, linha, token);
    return { status: 'inserido', aba: abaAlvo };
  }

  // sem aba → INCONSISTENCIA (+ coluna com o ID que não bateu)
  await garantirAbaInconsistencia(spreadsheetId, abas, token);
  await appendLinha(spreadsheetId, ABA_INCONSISTENCIA, [...linha, `oferta:${ofertaId || '(vazia)'}`], token);
  return { status: 'inconsistencia', aba: ABA_INCONSISTENCIA };
}

async function marcarEApagar(id: string, resultado: { status: string; aba?: string }) {
  // sucesso (inserido OU inconsistencia): a venda chegou na planilha → limpa.
  await sb.from('hotmart_planilha_outbox').delete().eq('id', id);
}

async function marcarErro(id: string, erro: string) {
  const { data } = await sb.from('hotmart_planilha_outbox').select('tentativas').eq('id', id).maybeSingle();
  await sb.from('hotmart_planilha_outbox')
    .update({ status: 'erro', ultimo_erro: erro.slice(0, 500), tentativas: (data?.tentativas ?? 0) + 1, atualizado_em: new Date().toISOString() })
    .eq('id', id);
}

// ========================================================================
// Handler
// ========================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // ---- MODO RETRY: body vazio (cron */5) → reprocessa a outbox ----------
  const pareceVenda = body && typeof body === 'object' &&
    (body.data?.buyer || body.buyer || body.data?.purchase || body.purchase || body.data?.subscriber);

  if (!pareceVenda) {
    // Pode ser o cron (body {}) OU um POST de teste da Hotmart que não
    // reconhecemos como venda. Se tem QUALQUER conteúdo além de vazio,
    // é captura (teste) — grava pra inspeção. Se é {} puro, é retry.
    const vazio = !body || Object.keys(body).length === 0;
    if (vazio) {
      // RETRY
      const { data: pendentes } = await sb.from('hotmart_planilha_outbox')
        .select('*').in('status', ['pendente', 'erro']).order('criado_em').limit(50);
      let ok = 0, falhou = 0;
      for (const row of pendentes ?? []) {
        try {
          const r = await processarOutbox(row);
          await marcarEApagar(row.id, r);
          ok++;
        } catch (e) {
          await marcarErro(row.id, e instanceof Error ? e.message : String(e));
          falhou++;
        }
      }
      return json({ modo: 'retry', reprocessados: ok, ainda_pendentes: falhou });
    }

    // CAPTURA (teste da Hotmart / evento não-venda): grava cru pra inspeção.
    const { data: cap } = await sb.from('hotmart_planilha_outbox')
      .insert({ produto: PRODUTO_DEFAULT, payload: body, status: 'erro', ultimo_erro: 'captura: body não reconhecido como venda' })
      .select('id').maybeSingle();
    return json({
      modo: 'captura',
      recebido: true,
      nota: 'Payload gravado pra inspeção (não parece uma venda). Me manda o id abaixo que eu leio e mapeio.',
      outbox_id: cap?.id ?? null,
      chaves_no_topo: Object.keys(body),
    });
  }

  // ---- MODO WEBHOOK: venda nova -----------------------------------------
  try {
    // 1) (opcional) valida hottok — só se estiver configurado no cofre.
    const cfg = PRODUTOS[PRODUTO_DEFAULT];
    if (cfg.hottok_chave) {
      let hottokEsperado = '';
      try { hottokEsperado = await getChave(cfg.hottok_chave, 'hotmart-planilha-worker'); } catch { /* não configurado → não bloqueia (v1 tolerante) */ }
      if (hottokEsperado) {
        const recebido = req.headers.get('x-hotmart-hottok') || body?.hottok || '';
        if (recebido !== hottokEsperado) return json({ erro: 'hottok inválido' }, 401);
      }
    }

    const venda = extrairVenda(body);
    const ofertaId = venda?.ofertaId || '';
    const linha = montarLinha(venda);

    // 2) INSERT na outbox — nada se perde a partir daqui.
    const { data: ins, error: errIns } = await sb.from('hotmart_planilha_outbox')
      .insert({
        produto: PRODUTO_DEFAULT,
        oferta_id: ofertaId,
        spreadsheet_id: cfg.spreadsheet_id,
        payload: body,
        linha,
        status: 'pendente',
      })
      .select('*').single();
    if (errIns) throw new Error('insert outbox: ' + errIns.message);

    // 3) tenta escrever na planilha JÁ (caminho feliz). Se falhar, o cron pega.
    try {
      const r = await processarOutbox(ins);
      await marcarEApagar(ins.id, r);
      return json({ ok: true, status: r.status, aba: r.aba, oferta: ofertaId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await marcarErro(ins.id, msg);
      // 202: recebemos e guardamos; o retry conclui. Hotmart não precisa reenviar.
      return json({ ok: true, status: 'pendente', nota: 'guardado na outbox, retry vai concluir', erro: msg, outbox_id: ins.id }, 202);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ erro: msg }, 500);
  }
});
