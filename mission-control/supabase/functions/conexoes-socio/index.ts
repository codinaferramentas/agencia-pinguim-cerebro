// ============================================================
// Edge Function: conexoes-socio
// ============================================================
// Substitui o fluxo do server-cli (ngrok) pra conectar Google
// dos socios via Mission Control (Vercel).
//
// Faz 6 actions via { action } no body POST:
//
//  - iniciar:           { nome, telefone, label, marcar_padrao?, incluir_em_relatorio? }
//                       Resolve socio por telefone, gera state, retorna authorize_url.
//
//  - listar:            { telefone } OU { cliente_id }
//                       Retorna conexoes ativas do socio.
//
//  - padrao:            { conexao_id }
//                       Marca conexao como padrao do socio.
//
//  - toggle-relatorio:  { conexao_id, valor }
//                       Liga/desliga "sai em relatorio diario".
//
//  - revogar:           { conexao_id }
//                       Soft-delete da conexao.
//
//  - callback:          GET ?code=...&state=...
//                       (chamada do Google apos autorizacao)
//                       Troca code por refresh_token, salva via RPC, retorna HTML
//
// Auth: usa SUPABASE_ANON_KEY como header Authorization (publico — mesma logica
// das outras edges do MC). Sem auth, retorna 401.
//
// IMPORTANTE: a redirect_uri OAuth e fixa nessa Edge:
//   https://wmelierxzpjamiofeemh.supabase.co/functions/v1/conexoes-socio?action=callback
//
// Adicionar essa URI em Authorized redirect URIs do app OAuth no Google Console.
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/conexoes-socio?action=callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// HTML helpers pro callback (UI igual fluxo antigo do server-cli)
const PAGE_BASE = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Conta Google — Pinguim 🐧</title>
<style>
body{background:#0a0a0f;color:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem}
.card{background:#111118;border:1px solid #2a2a3e;border-radius:14px;padding:2.5rem;max-width:560px;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.4)}
.icon{font-size:3rem;margin-bottom:.5rem}
h1{margin:.25rem 0 1rem;font-size:1.35rem;font-weight:600}
h1 span{color:#E85C00}
.ok{color:#22c55e}.err{color:#ef4444}
p{color:#94a3b8;margin:.55rem 0;line-height:1.55}
.email{color:#f1f5f9;font-weight:600}
.tag{display:inline-block;background:rgba(232,92,0,.15);color:#E85C00;padding:.18rem .55rem;border-radius:6px;font-size:.78em;font-weight:600;margin-left:.4rem}
.badge{display:inline-block;background:rgba(16,185,129,.15);color:#22c55e;padding:.18rem .55rem;border-radius:6px;font-size:.78em;font-weight:600;margin-left:.4rem}
.detail{background:#1a1a28;padding:.8rem 1rem;border-radius:8px;font-size:.85rem;color:#cbd5e1;margin-top:1rem;text-align:left;word-break:break-all}
.tip{margin-top:1.25rem;font-size:.88rem;color:#64748b}
</style></head><body><div class="card">`;
const PAGE_END = `</div></body></html>`;
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function htmlOk(args: { email: string; label: string; nome: string; is_padrao: boolean }) {
  return `${PAGE_BASE}
    <div class="icon ok">🐧</div>
    <h1 class="ok">Conta conectada <span>com sucesso</span></h1>
    <p>Olá <strong>${esc(args.nome)}</strong> — sua conta Google foi conectada ao Pinguim OS.</p>
    <p class="email">${esc(args.email)} <span class="tag">${esc(args.label)}</span>${args.is_padrao ? '<span class="badge">⭐ padrão</span>' : ''}</p>
    <p>Permissões: Gmail (ler + responder) · Calendar (ler + criar) · Drive (ler + editar)</p>
    <p class="tip">Pode fechar essa aba. Sua conta já está pronta pra ser usada.</p>
  ${PAGE_END}`;
}
function htmlErr(titulo: string, msg: string, detalhe?: string) {
  return `${PAGE_BASE}
    <div class="icon err">⚠️</div>
    <h1 class="err">${esc(titulo)}</h1>
    <p>${esc(msg)}</p>
    ${detalhe ? `<div class="detail">${esc(detalhe)}</div>` : ''}
    <p class="tip">Volte ao Mission Control e tente conectar de novo.</p>
  ${PAGE_END}`;
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

// State token: hash aleatorio guardado em oauth_states_google_externo (com label + dados pro callback)
async function gerarStateToken(dados: {
  nome: string;
  telefone: string;
  label: string;
  marcar_padrao: boolean | null;
  incluir_em_relatorio: boolean;
}): Promise<string> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const state_token = 'msocio-' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  // Guarda dados em oauth_states_google_externo (reusa tabela existente)
  // projeto_nome = JSON serializado com dados auxiliares
  const aux = JSON.stringify({
    nome: dados.nome,
    telefone: dados.telefone,
    marcar_padrao: dados.marcar_padrao,
    incluir_em_relatorio: dados.incluir_em_relatorio,
  });

  // Hash sintetico de "origem" — pra essa edge, usa hash do anon key (publico, mas previne reuso cruzado)
  const tokenHash = await sha256(SUPABASE_ANON_KEY + ':conexoes-socio');

  const { error } = await sb().from('oauth_states_google_externo').insert({
    state_token,
    label: dados.label,
    projeto_nome: aux, // reusa coluna pra carregar dados auxiliares
    origem_token_hash: tokenHash,
    status: 'pendente',
  });
  if (error) throw new Error(`persistir state: ${error.message}`);
  return state_token;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// Action: iniciar (POST)
// ============================================================
async function actIniciar(body: any) {
  const nome = String(body.nome || '').trim();
  const telefone = String(body.telefone || '').trim().replace(/\D/g, '');
  const label = String(body.label || '').trim();
  const marcar_padrao = body.marcar_padrao === true || body.marcar_padrao === false ? body.marcar_padrao : null;
  const incluir_em_relatorio = body.incluir_em_relatorio === false ? false : true;

  if (!nome) return jsonResp({ ok: false, error: 'nome obrigatorio' }, 400);
  if (!telefone || telefone.length < 12) return jsonResp({ ok: false, error: 'telefone invalido (DDI+DDD+numero)' }, 400);
  if (!label) return jsonResp({ ok: false, error: 'label obrigatorio (ex: Pinguim, Pessoal)' }, 400);

  // Resolve socio
  const { data: socio, error: errSocio } = await sb().rpc('resolver_socio_por_telefone', { p_telefone: telefone });
  if (errSocio) return jsonResp({ ok: false, error: 'resolver socio: ' + errSocio.message }, 500);
  const sRow = Array.isArray(socio) && socio[0] ? socio[0] : null;
  if (!sRow) {
    return jsonResp({
      ok: false,
      error: 'telefone nao encontrado em pinguim.whatsapp_socios. Cadastre o socio primeiro.',
    }, 404);
  }

  const client_id = await getChave('GOOGLE_OAUTH_CLIENT_ID', 'conexoes-socio-iniciar');
  if (!client_id) return jsonResp({ ok: false, error: 'GOOGLE_OAUTH_CLIENT_ID nao cadastrado no cofre' }, 500);

  const state = await gerarStateToken({ nome, telefone, label, marcar_padrao, incluir_em_relatorio });

  const params = new URLSearchParams({
    client_id,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  const authorize_url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return jsonResp({
    ok: true,
    authorize_url,
    socio: { slug: sRow.socio_slug, apelido: sRow.apelido },
  });
}

// ============================================================
// Action: listar (POST com telefone OU cliente_id)
// ============================================================
async function actListar(body: any) {
  let cliente_id = body.cliente_id ? String(body.cliente_id) : null;
  if (!cliente_id) {
    const telefone = String(body.telefone || '').trim().replace(/\D/g, '');
    if (!telefone || telefone.length < 12) return jsonResp({ ok: false, error: 'informe telefone (12+ digitos) ou cliente_id' }, 400);
    const { data: socio } = await sb().rpc('resolver_socio_por_telefone', { p_telefone: telefone });
    const sRow = Array.isArray(socio) && socio[0] ? socio[0] : null;
    if (!sRow) return jsonResp({ ok: true, cliente_id: null, conexoes: [] });
    cliente_id = sRow.cliente_id;
  }

  const { data: conexoes, error } = await sb()
    .from('conexoes_google')
    .select('id, label, email_google, escopo, is_padrao, incluir_em_relatorio, criado_em')
    .eq('cliente_id', cliente_id)
    .is('revogado_em', null)
    .order('is_padrao', { ascending: false })
    .order('criado_em', { ascending: false });
  if (error) return jsonResp({ ok: false, error: 'listar: ' + error.message }, 500);

  return jsonResp({ ok: true, cliente_id, conexoes: conexoes || [] });
}

// ============================================================
// Action: padrao (POST)
// ============================================================
async function actPadrao(body: any) {
  const conexao_id = String(body.conexao_id || '').trim();
  if (!conexao_id) return jsonResp({ ok: false, error: 'conexao_id obrigatorio' }, 400);
  const { error } = await sb().rpc('marcar_conexao_padrao', { p_conexao_id: conexao_id });
  if (error) return jsonResp({ ok: false, error: 'padrao: ' + error.message }, 500);
  return jsonResp({ ok: true, conexao_id });
}

// ============================================================
// Action: toggle-relatorio (POST)
// ============================================================
async function actToggleRelatorio(body: any) {
  const conexao_id = String(body.conexao_id || '').trim();
  const valor = body.valor;
  if (!conexao_id) return jsonResp({ ok: false, error: 'conexao_id obrigatorio' }, 400);
  if (typeof valor !== 'boolean') return jsonResp({ ok: false, error: 'valor (boolean) obrigatorio' }, 400);
  const { error } = await sb()
    .from('conexoes_google')
    .update({ incluir_em_relatorio: valor, atualizado_em: new Date().toISOString() })
    .eq('id', conexao_id);
  if (error) return jsonResp({ ok: false, error: 'toggle-relatorio: ' + error.message }, 500);
  return jsonResp({ ok: true, conexao_id, incluir_em_relatorio: valor });
}

// ============================================================
// Action: revogar (POST)
// ============================================================
async function actRevogar(body: any) {
  const conexao_id = String(body.conexao_id || '').trim();
  if (!conexao_id) return jsonResp({ ok: false, error: 'conexao_id obrigatorio' }, 400);
  const { error } = await sb().rpc('revogar_conexao_google', { p_conexao_id: conexao_id });
  if (error) return jsonResp({ ok: false, error: 'revogar: ' + error.message }, 500);
  return jsonResp({ ok: true, conexao_id });
}

// ============================================================
// Action: callback (GET ?code&state)
// ============================================================
async function actCallback(url: URL) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return htmlResponse(htmlErr('Autorização recusada', `Google reportou: ${errorParam}`, url.searchParams.get('error_description') || ''), 400);
  }
  if (!code) return htmlResponse(htmlErr('Faltou ?code', 'Volte ao Mission Control e tente conectar de novo.'), 400);
  if (!state) return htmlResponse(htmlErr('Faltou state', 'A sessão expirou. Volte ao Mission Control e tente de novo.'), 400);

  // Recupera state
  const { data: stateRow, error: errState } = await sb()
    .from('oauth_states_google_externo')
    .select('*')
    .eq('state_token', state)
    .maybeSingle();

  if (errState || !stateRow) {
    return htmlResponse(htmlErr('Sessão inválida', 'Esse state token não foi encontrado.'), 400);
  }
  if (new Date(stateRow.expira_em).getTime() < Date.now()) {
    await sb().from('oauth_states_google_externo').update({ status: 'expirado', concluido_em: new Date().toISOString() }).eq('state_token', state);
    return htmlResponse(htmlErr('Sessão expirou', 'A sessão tinha 15 min de validade. Volte ao Mission Control.'), 400);
  }
  if (stateRow.status !== 'pendente') {
    return htmlResponse(htmlErr('Sessão já usada', `Status atual: ${stateRow.status}. Inicie uma nova conexão.`), 400);
  }

  let dadosAux: any = {};
  try { dadosAux = JSON.parse(stateRow.projeto_nome || '{}'); } catch { /* legacy state, segue */ }

  try {
    const [clientId, clientSecret] = await Promise.all([
      getChave('GOOGLE_OAUTH_CLIENT_ID', 'conexoes-socio-callback'),
      getChave('GOOGLE_OAUTH_CLIENT_SECRET', 'conexoes-socio-callback'),
    ]);

    // Troca code por tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResp.json();
    if (!tokenResp.ok || tokens.error) throw new Error(`OAuth: ${tokens.error_description || tokens.error}`);
    if (!tokens.refresh_token) throw new Error('Google não devolveu refresh_token. Reautorize garantindo prompt=consent.');

    // Busca email da conta
    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userResp.json();
    if (!userResp.ok) throw new Error(`userinfo: ${user.error_description || user.error}`);
    const email = user.email;
    if (!email) throw new Error('Google não devolveu email da conta');

    // Resolve socio (precisa do telefone do state pra achar cliente_id)
    const telefone = String(dadosAux.telefone || '').replace(/\D/g, '');
    if (!telefone) throw new Error('Telefone do state ausente — não consigo identificar o sócio');
    const { data: socioArr, error: errSocio } = await sb().rpc('resolver_socio_por_telefone', { p_telefone: telefone });
    if (errSocio) throw new Error('resolver_socio: ' + errSocio.message);
    const socio = Array.isArray(socioArr) && socioArr[0] ? socioArr[0] : null;
    if (!socio) throw new Error(`telefone ${telefone} não encontrado em whatsapp_socios`);

    // UPSERT via RPC
    const { data: regArr, error: errReg } = await sb().rpc('registrar_conexao_google', {
      p_cliente_id: socio.cliente_id,
      p_socio_slug: socio.socio_slug,
      p_label: stateRow.label,
      p_email_google: email,
      p_refresh_token: tokens.refresh_token,
      p_escopo: tokens.scope || null,
      p_telefone_socio: telefone,
      p_marcar_padrao: dadosAux.marcar_padrao === true ? true : (dadosAux.marcar_padrao === false ? false : null),
      p_incluir_em_relatorio: dadosAux.incluir_em_relatorio === false ? false : true,
    });
    if (errReg) throw new Error('registrar_conexao: ' + errReg.message);
    const reg = Array.isArray(regArr) && regArr[0] ? regArr[0] : null;

    // Marca state como autorizado
    await sb().from('oauth_states_google_externo').update({
      status: 'autorizado',
      email_google: email,
      conexao_id: reg?.id || null,
      concluido_em: new Date().toISOString(),
    }).eq('state_token', state);

    return htmlResponse(
      htmlOk({
        email,
        label: stateRow.label,
        nome: dadosAux.nome || socio.apelido || '',
        is_padrao: !!(reg && reg.is_padrao),
      }),
      200,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb().from('oauth_states_google_externo').update({
      status: 'erro',
      erro: msg,
      concluido_em: new Date().toISOString(),
    }).eq('state_token', state);
    return htmlResponse(htmlErr('Falha ao concluir autorização', 'Erro técnico durante troca de tokens.', msg), 500);
  }
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ============================================================
// Router principal
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const actionQuery = url.searchParams.get('action');

  // Callback: GET ?action=callback&code=...&state=... (do Google)
  if (req.method === 'GET' && actionQuery === 'callback') {
    return actCallback(url);
  }

  // Demais actions: POST { action, ...body }
  if (req.method !== 'POST') {
    return jsonResp({ ok: false, error: 'Use POST com { action, ... }' }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ ok: false, error: 'JSON invalido' }, 400);
  }

  const action = String(body.action || '').trim();
  if (!action) return jsonResp({ ok: false, error: 'action obrigatorio (iniciar | listar | padrao | toggle-relatorio | revogar)' }, 400);

  try {
    if (action === 'iniciar') return await actIniciar(body);
    if (action === 'listar') return await actListar(body);
    if (action === 'padrao') return await actPadrao(body);
    if (action === 'toggle-relatorio') return await actToggleRelatorio(body);
    if (action === 'revogar') return await actRevogar(body);
    return jsonResp({ ok: false, error: `action desconhecida: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResp({ ok: false, error: msg }, 500);
  }
});
