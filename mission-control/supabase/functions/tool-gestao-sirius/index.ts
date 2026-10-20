// ============================================================
// Edge Function: tool-gestao-sirius
// ============================================================
// Proxy seguro pra gestao de usuarios da Sirius ADM.
// Usa SIRIUS_SERVICE_ROLE_KEY do cofre pra chamar API Sirius
// (Supabase ryyingyyzgzsbnkugfpa).
//
// Actions via { action } no body POST:
//
//  - listar_planos:     {} → lista de plans ativos (id, name, price, currency, cycle)
//  - default_acesso:    { plan_name } → JSONB com defaults das 10 flags access_*
//  - buscar_usuario:    { termo } → busca por email/nome/telefone (LIKE), retorna max 20
//  - obter_usuario:     { user_id } → dados completos do profile
//
//  - criar_usuario:     { email, password, nome, telefone, papel, funcao, avatar_url,
//                         preferred_language, plan_id, vigencia_brt, token_limit_override,
//                         script_limit_override, features (obj de 10 flags) }
//                       Cria via Edge create-user da Sirius + aplica features
//
//  - atualizar_usuario: { user_id, ...campos_a_atualizar }
//                       UPDATE direto em profiles (NAO touch em auth.users)
//
//  - trocar_plano:      { user_id, plan_id, vigencia_brt?, aplicar_defaults_features }
//
//  - resetar_senha:     { user_id, new_password }
//  - trocar_email:      { user_id, new_email }
//  - adicionar_creditos: { user_id, amount, reason }
//  - desativar:         { user_id } → plan_status='cancelled'
//  - excluir:           { user_id } → DELETE auth + profile (cuidado: irreversivel)
//
//  Desafios (check-in só vale pra quem está em content_challenge_participants):
//  - listar_desafios:    { termo? } → desafios com datas, status, criador, nº participantes
//  - desafios_usuario:   { user_id } → desafios da pessoa + nº de check-ins
//  - adicionar_desafios: { user_id, challenge_ids[] } → inclui (sem duplicar) + liga access_challenges
//  - remover_desafio:    { user_id, challenge_id } → apaga check-ins dela + participação
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { variantesTelefoneBR, orTelefoneTermos, soDigitos } from '../_shared/telefone-br.ts';

const SIRIUS_URL = 'https://ryyingyyzgzsbnkugfpa.supabase.co';
const SIRIUS_REST = `${SIRIUS_URL}/rest/v1`;
const SIRIUS_AUTH_ADMIN = `${SIRIUS_URL}/auth/v1/admin`;
const SIRIUS_FUNCS = `${SIRIUS_URL}/functions/v1`;

const FEATURE_KEYS = [
  'access_personas',
  'access_viral_scripts',
  'access_products',
  'access_headlines',
  'access_marketing_creatives',
  'access_challenges',
  'access_challenge_templates',
  'access_templates',
  'access_stories',
  'access_analysis',
  'access_ganchos',
  'access_nicho_nutricao',
];

let _siriusKeyCache: { key: string; expira: number } | null = null;
async function siriusKey(): Promise<string> {
  const agora = Date.now();
  if (_siriusKeyCache && _siriusKeyCache.expira > agora) return _siriusKeyCache.key;
  const key = await getChave('SIRIUS_SERVICE_ROLE_KEY', 'tool-gestao-sirius');
  _siriusKeyCache = { key, expira: agora + 5 * 60 * 1000 };
  return key;
}

function siriusHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

// REST helper: chama PostgREST Sirius (CRUD em tabelas)
async function siriusREST(method: string, path: string, body?: unknown, prefer?: string): Promise<{ ok: boolean; data: any; status: number; erro?: string }> {
  const key = await siriusKey();
  const headers: Record<string, string> = siriusHeaders(key);
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SIRIUS_REST}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data, erro: !r.ok ? (data?.message || data?.error || txt.slice(0, 200)) : undefined };
}

// RPC helper
async function siriusRPC(fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; data: any; erro?: string }> {
  const key = await siriusKey();
  const r = await fetch(`${SIRIUS_REST}/rpc/${fn}`, {
    method: 'POST',
    headers: siriusHeaders(key),
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, data, erro: !r.ok ? (data?.message || txt.slice(0, 200)) : undefined };
}

// ============================================================
// Actions
// ============================================================

async function actListarPlanos() {
  const r = await siriusREST('GET', '/plans?select=id,name,price,currency,cycle_type,cycle_duration,token_limit,script_limit,access_origin&status=eq.active&order=currency,price');
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'listar_planos: ' + r.erro }, 500);
  return jsonRespTool({ ok: true, planos: r.data || [] });
}

async function actDefaultAcesso(body: any) {
  const plan_name = String(body.plan_name || '').trim();
  if (!plan_name) return jsonRespTool({ ok: false, erro: 'plan_name obrigatorio' }, 400);
  const r = await siriusRPC('get_plan_default_access', { plan_name });
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'default_acesso: ' + r.erro }, 500);
  return jsonRespTool({ ok: true, defaults: r.data || {} });
}

async function actBuscarUsuario(body: any) {
  const termo = String(body.termo || '').trim();
  if (!termo || termo.length < 2) return jsonRespTool({ ok: false, erro: 'termo obrigatorio (2+ chars)' }, 400);

  // PostgREST OR — busca por email, nome OU telefone.
  // Telefone com 8+ digitos expande variantes BR (com/sem DDI, com/sem 9, com/sem +).
  const digitos = soDigitos(termo);
  const ehTelefone = digitos.length >= 8;
  const telOr = ehTelefone ? orTelefoneTermos('telefone', variantesTelefoneBR(termo)) : `telefone.ilike.*${termo}*`;
  const orInterno = `email.ilike.*${termo}*,nome.ilike.*${termo}*,${telOr}`;
  const path = `/profiles?or=(${encodeURIComponent(orInterno)})&select=user_id,email,nome,telefone,papel,plan_id,plan_status,plan_expires_at,cycle_start,last_payment_at,${FEATURE_KEYS.join(',')}&limit=20`;
  const r = await siriusREST('GET', path);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'buscar_usuario: ' + r.erro }, 500);

  // Enriquece com nome do plano
  const planIds = [...new Set((r.data || []).map((p: any) => p.plan_id).filter(Boolean))];
  let planMap: Record<string, string> = {};
  if (planIds.length > 0) {
    const ids = planIds.map((id: string) => `"${id}"`).join(',');
    const rp = await siriusREST('GET', `/plans?select=id,name&id=in.(${ids})`);
    if (rp.ok && Array.isArray(rp.data)) {
      planMap = Object.fromEntries(rp.data.map((p: any) => [p.id, p.name]));
    }
  }
  const usuarios = (r.data || []).map((u: any) => ({ ...u, plan_nome: u.plan_id ? planMap[u.plan_id] || null : null }));
  return jsonRespTool({ ok: true, total: usuarios.length, usuarios });
}

async function actObterUsuario(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);
  const r = await siriusREST('GET', `/profiles?user_id=eq.${user_id}&select=*&limit=1`);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'obter_usuario: ' + r.erro }, 500);
  const u = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (!u) return jsonRespTool({ ok: false, erro: 'usuario nao encontrado' }, 404);
  let plan_nome = null;
  if (u.plan_id) {
    const rp = await siriusREST('GET', `/plans?id=eq.${u.plan_id}&select=name&limit=1`);
    if (rp.ok && Array.isArray(rp.data) && rp.data[0]) plan_nome = rp.data[0].name;
  }
  return jsonRespTool({ ok: true, usuario: { ...u, plan_nome } });
}

// Cria usuario via Supabase Auth Admin API + UPDATE profile.
// NAO usa a Edge create-user da Sirius (ela exige JWT admin, nao aceita service_role).
async function actCriarUsuario(body: any) {
  const required = ['email', 'password', 'nome'];
  for (const k of required) {
    if (!body[k] || !String(body[k]).trim()) return jsonRespTool({ ok: false, erro: `${k} obrigatorio` }, 400);
  }
  const email = String(body.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonRespTool({ ok: false, erro: 'email invalido' }, 400);
  const password = String(body.password);
  if (password.length < 8) return jsonRespTool({ ok: false, erro: 'senha minima 8 chars' }, 400);

  const key = await siriusKey();

  // 1) Cria em auth.users via Admin API (com email confirmado)
  const rAuth = await fetch(`${SIRIUS_AUTH_ADMIN}/users`, {
    method: 'POST',
    headers: siriusHeaders(key),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });
  const txtAuth = await rAuth.text();
  let dataAuth: any = null;
  try { dataAuth = JSON.parse(txtAuth); } catch { dataAuth = txtAuth; }
  if (!rAuth.ok) {
    const msg = dataAuth?.msg || dataAuth?.error_description || dataAuth?.error || txtAuth.slice(0, 200);
    return jsonRespTool({ ok: false, erro: 'criar auth: ' + msg }, rAuth.status);
  }
  const user_id = dataAuth?.id || dataAuth?.user?.id;
  if (!user_id) return jsonRespTool({ ok: false, erro: 'auth nao retornou user_id', resposta_bruta: dataAuth }, 500);

  // 2) Espera 500ms pro trigger handle_new_user criar o profile basico
  await new Promise((r) => setTimeout(r, 500));

  // 3) PATCH em profiles com TUDO de uma vez (nome, papel, plano, features, overrides, vigencia)
  const patch: Record<string, any> = {
    nome: String(body.nome).trim(),
    email,
    papel: body.papel || 'user',
    funcao: body.funcao || null,
    avatar_url: body.avatar_url || null,
    telefone: body.telefone || null,
    preferred_language: body.preferred_language || 'pt',
  };
  if (body.plan_id) {
    patch.plan_id = body.plan_id;
    patch.plan_status = 'active';
    patch.cycle_start = new Date().toISOString().slice(0, 10);
  }
  if (body.vigencia_brt) patch.last_payment_at = body.vigencia_brt;
  if (body.token_limit_override != null && body.token_limit_override !== '') patch.token_limit_override = body.token_limit_override;
  if (body.script_limit_override != null && body.script_limit_override !== '') patch.script_limit_override = body.script_limit_override;
  if (body.hotmart_user_id) patch.hotmart_user_id = body.hotmart_user_id;
  // features
  if (body.features && typeof body.features === 'object') {
    for (const k of FEATURE_KEYS) {
      if (typeof body.features[k] === 'boolean') patch[k] = body.features[k];
    }
  }

  // PATCH profile (UPSERT pra cobrir caso onde trigger nao criou ainda)
  const ru = await siriusREST('PATCH', `/profiles?user_id=eq.${user_id}`, patch, 'return=representation');
  if (!ru.ok) {
    // Tenta INSERT direto se PATCH falhou (provavel: trigger nao rodou)
    const insertBody = { user_id, ...patch, cycle_start: patch.cycle_start || new Date().toISOString().slice(0, 10), plan_status: patch.plan_status || 'active' };
    const rInsert = await siriusREST('POST', `/profiles`, insertBody, 'return=representation');
    if (!rInsert.ok) return jsonRespTool({ ok: false, erro: 'criar profile: ' + rInsert.erro, user_id_auth: user_id }, 500);
  } else if (Array.isArray(ru.data) && ru.data.length === 0) {
    // PATCH retornou 0 rows = profile não existia. Tenta INSERT.
    const insertBody = { user_id, ...patch, cycle_start: patch.cycle_start || new Date().toISOString().slice(0, 10), plan_status: patch.plan_status || 'active' };
    const rInsert = await siriusREST('POST', `/profiles`, insertBody, 'return=representation');
    if (!rInsert.ok) return jsonRespTool({ ok: false, erro: 'profile vazio + insert falhou: ' + rInsert.erro, user_id_auth: user_id }, 500);
  }

  // Sincroniza user_roles se papel != user default
  if (patch.papel && patch.papel !== 'user') {
    await siriusREST('POST', `/user_roles`, { user_id, role: patch.papel }, 'resolution=ignore-duplicates');
  }

  return jsonRespTool({ ok: true, user_id });
}

async function actAtualizarUsuario(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  const camposPermitidos = ['nome', 'telefone', 'funcao', 'avatar_url', 'preferred_language', 'papel', 'plan_id', 'plan_status', 'token_limit_override', 'script_limit_override', 'last_payment_at', 'plan_expires_at', 'is_beta_tester', ...FEATURE_KEYS];
  const patch: Record<string, any> = {};
  for (const k of camposPermitidos) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) return jsonRespTool({ ok: false, erro: 'nada pra atualizar' }, 400);

  const r = await siriusREST('PATCH', `/profiles?user_id=eq.${user_id}`, patch, 'return=representation');
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'atualizar: ' + r.erro }, 500);

  // Se trocou papel, sincroniza user_roles
  if (patch.papel) {
    await siriusREST('POST', `/user_roles`, { user_id, role: patch.papel }, 'resolution=ignore-duplicates');
  }

  return jsonRespTool({ ok: true, usuario: Array.isArray(r.data) && r.data[0] ? r.data[0] : null });
}

async function actTrocarPlano(body: any) {
  const user_id = String(body.user_id || '').trim();
  const plan_id = String(body.plan_id || '').trim();
  if (!user_id || !plan_id) return jsonRespTool({ ok: false, erro: 'user_id e plan_id obrigatorios' }, 400);

  const patch: Record<string, any> = {
    plan_id,
    plan_status: 'active',
    last_payment_at: body.vigencia_brt || new Date().toISOString(),
    cycle_start: new Date().toISOString().slice(0, 10),
  };

  // Se pediu pra reaplicar defaults das features
  if (body.aplicar_defaults_features) {
    // Pega nome do plano
    const rp = await siriusREST('GET', `/plans?id=eq.${plan_id}&select=name&limit=1`);
    const plan_name = Array.isArray(rp.data) && rp.data[0]?.name;
    if (plan_name) {
      const rd = await siriusRPC('get_plan_default_access', { plan_name });
      if (rd.ok && rd.data && typeof rd.data === 'object') {
        for (const k of FEATURE_KEYS) {
          if (typeof rd.data[k] === 'boolean') patch[k] = rd.data[k];
        }
      }
    }
  }

  const r = await siriusREST('PATCH', `/profiles?user_id=eq.${user_id}`, patch, 'return=representation');
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'trocar_plano: ' + r.erro }, 500);
  return jsonRespTool({ ok: true, usuario: Array.isArray(r.data) && r.data[0] ? r.data[0] : null });
}

async function actResetarSenha(body: any) {
  const user_id = String(body.user_id || '').trim();
  const new_password = String(body.new_password || '');
  if (!user_id || !new_password) return jsonRespTool({ ok: false, erro: 'user_id e new_password obrigatorios' }, 400);
  if (new_password.length < 8) return jsonRespTool({ ok: false, erro: 'senha minima 8 chars' }, 400);

  const key = await siriusKey();
  const r = await fetch(`${SIRIUS_AUTH_ADMIN}/users/${user_id}`, {
    method: 'PUT',
    headers: siriusHeaders(key),
    body: JSON.stringify({ password: new_password }),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'resetar_senha: ' + (data?.msg || data?.error_description || txt.slice(0, 200)) }, r.status);
  return jsonRespTool({ ok: true });
}

async function actTrocarEmail(body: any) {
  const user_id = String(body.user_id || '').trim();
  const new_email = String(body.new_email || '').trim();
  if (!user_id || !new_email) return jsonRespTool({ ok: false, erro: 'user_id e new_email obrigatorios' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) return jsonRespTool({ ok: false, erro: 'email invalido' }, 400);

  const key = await siriusKey();
  const r = await fetch(`${SIRIUS_AUTH_ADMIN}/users/${user_id}`, {
    method: 'PUT',
    headers: siriusHeaders(key),
    body: JSON.stringify({ email: new_email, email_confirm: true }),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'trocar_email auth: ' + (data?.msg || txt.slice(0, 200)) }, r.status);

  // Sincroniza profiles.email
  await siriusREST('PATCH', `/profiles?user_id=eq.${user_id}`, { email: new_email });
  return jsonRespTool({ ok: true });
}

async function actAdicionarCreditos(body: any) {
  const user_id = String(body.user_id || '').trim();
  const amount = parseInt(body.amount, 10);
  const reason = String(body.reason || 'Bonus concedido via Pinguim');
  if (!user_id || !amount || amount <= 0) return jsonRespTool({ ok: false, erro: 'user_id e amount (>0) obrigatorios' }, 400);

  const r = await siriusRPC('add_credits', { p_user_id: user_id, p_amount: amount, p_reason: reason });
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'adicionar_creditos: ' + r.erro }, 500);
  return jsonRespTool({ ok: true });
}

async function actDesativar(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);
  const r = await siriusREST('PATCH', `/profiles?user_id=eq.${user_id}`, { plan_status: 'cancelled' }, 'return=representation');
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'desativar: ' + r.erro }, 500);
  return jsonRespTool({ ok: true });
}

async function actExcluir(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  // 1. Deleta de auth.users via admin API (cascade pode pegar profile, mas explicito eh mais seguro)
  const key = await siriusKey();
  const rAuth = await fetch(`${SIRIUS_AUTH_ADMIN}/users/${user_id}`, {
    method: 'DELETE',
    headers: siriusHeaders(key),
  });
  if (!rAuth.ok) {
    const txt = await rAuth.text();
    return jsonRespTool({ ok: false, erro: 'excluir auth: ' + txt.slice(0, 200) }, rAuth.status);
  }

  // 2. Garante delete em profiles (se cascade nao pegou)
  await siriusREST('DELETE', `/profiles?user_id=eq.${user_id}`);
  return jsonRespTool({ ok: true });
}

// ============================================================
// DESAFIOS (content_challenges / content_challenge_participants)
// A pessoa só participa (faz check-in) se estiver na tabela de participantes.
// Remover = mesmo que o "sair do desafio" do app: apaga os check-ins dela
// naquele desafio e depois a participação.
// ============================================================

function statusDesafio(inicio: string, fim: string): 'futuro' | 'ativo' | 'encerrado' {
  const hoje = new Date().toISOString().slice(0, 10);
  if (hoje < String(inicio).slice(0, 10)) return 'futuro';
  if (hoje > String(fim).slice(0, 10)) return 'encerrado';
  return 'ativo';
}

async function nomesPorUserId(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const mapa: Record<string, string> = {};
  for (let i = 0; i < unicos.length; i += 80) {
    const lote = unicos.slice(i, i + 80).map((id) => `"${id}"`).join(',');
    const r = await siriusREST('GET', `/profiles?select=user_id,nome,email&user_id=in.(${lote})`);
    if (r.ok && Array.isArray(r.data)) for (const p of r.data) mapa[p.user_id] = p.nome || p.email || '';
  }
  return mapa;
}

async function actListarDesafios(body: any) {
  const termo = String(body.termo || '').trim();
  let path = `/content_challenges?select=id,title,start_date,end_date,creator_id,content_challenge_participants(count)&order=start_date.desc&limit=500`;
  if (termo) path += `&title=ilike.*${encodeURIComponent(termo)}*`;
  const r = await siriusREST('GET', path);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'listar_desafios: ' + r.erro }, 500);
  const criadores = await nomesPorUserId((r.data || []).map((d: any) => d.creator_id));
  const desafios = (r.data || []).map((d: any) => ({
    id: d.id, titulo: d.title, inicio: d.start_date, fim: d.end_date,
    status: statusDesafio(d.start_date, d.end_date),
    criador: criadores[d.creator_id] || null,
    participantes: d.content_challenge_participants?.[0]?.count ?? 0,
  }));
  return jsonRespTool({ ok: true, total: desafios.length, desafios });
}

async function actDesafiosUsuario(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);
  const r = await siriusREST('GET',
    `/content_challenge_participants?select=id,joined_at,challenge_id,content_challenges(title,start_date,end_date)&user_id=eq.${user_id}&order=joined_at.desc`);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'desafios_usuario: ' + r.erro }, 500);
  const parts = r.data || [];
  // check-ins por participação (1 query só)
  const contagem: Record<string, number> = {};
  if (parts.length) {
    const ids = parts.map((p: any) => `"${p.id}"`).join(',');
    const rc = await siriusREST('GET', `/content_challenge_checkins?select=participant_id&participant_id=in.(${ids})&limit=10000`);
    if (rc.ok && Array.isArray(rc.data)) for (const c of rc.data) contagem[c.participant_id] = (contagem[c.participant_id] || 0) + 1;
  }
  const desafios = parts.map((p: any) => ({
    participacao_id: p.id, desafio_id: p.challenge_id, entrou_em: p.joined_at,
    titulo: p.content_challenges?.title || '(desafio removido)',
    inicio: p.content_challenges?.start_date || null, fim: p.content_challenges?.end_date || null,
    status: p.content_challenges ? statusDesafio(p.content_challenges.start_date, p.content_challenges.end_date) : 'encerrado',
    checkins: contagem[p.id] || 0,
  }));
  return jsonRespTool({ ok: true, desafios });
}

async function actAdicionarDesafios(body: any) {
  const user_id = String(body.user_id || '').trim();
  const ids: string[] = Array.isArray(body.challenge_ids) ? body.challenge_ids.map(String).filter(Boolean) : [];
  if (!user_id || !ids.length) return jsonRespTool({ ok: false, erro: 'user_id e challenge_ids obrigatorios' }, 400);

  // já participa? (não duplica)
  const lista = ids.map((id) => `"${id}"`).join(',');
  const rj = await siriusREST('GET', `/content_challenge_participants?select=challenge_id&user_id=eq.${user_id}&challenge_id=in.(${lista})`);
  const ja = new Set((rj.ok && Array.isArray(rj.data) ? rj.data : []).map((x: any) => x.challenge_id));
  const novos = ids.filter((id) => !ja.has(id));
  if (novos.length) {
    const ri = await siriusREST('POST', `/content_challenge_participants`, novos.map((challenge_id) => ({ challenge_id, user_id })));
    if (!ri.ok) return jsonRespTool({ ok: false, erro: 'adicionar_desafios: ' + ri.erro }, 500);
  }
  // sem a flag a pessoa nem vê a área de Desafios no app → liga junto
  const rf = await siriusREST('PATCH', `/profiles?user_id=eq.${user_id}&access_challenges=is.false`, { access_challenges: true }, 'return=representation');
  const ligouFlag = rf.ok && Array.isArray(rf.data) && rf.data.length > 0;
  return jsonRespTool({ ok: true, adicionados: novos.length, ja_participava: ids.length - novos.length, ligou_flag_desafios: ligouFlag });
}

async function actRemoverDesafio(body: any) {
  const user_id = String(body.user_id || '').trim();
  const challenge_id = String(body.challenge_id || '').trim();
  if (!user_id || !challenge_id) return jsonRespTool({ ok: false, erro: 'user_id e challenge_id obrigatorios' }, 400);
  const rp = await siriusREST('GET', `/content_challenge_participants?select=id&user_id=eq.${user_id}&challenge_id=eq.${challenge_id}`);
  if (!rp.ok) return jsonRespTool({ ok: false, erro: 'remover_desafio: ' + rp.erro }, 500);
  const partIds = (rp.data || []).map((p: any) => p.id);
  if (!partIds.length) return jsonRespTool({ ok: true, removido: false, nota: 'não participava' });
  const lista = partIds.map((id: string) => `"${id}"`).join(',');
  const rc = await siriusREST('DELETE', `/content_challenge_checkins?participant_id=in.(${lista})`, undefined, 'return=representation');
  if (!rc.ok) return jsonRespTool({ ok: false, erro: 'apagar check-ins: ' + rc.erro }, 500);
  const rd = await siriusREST('DELETE', `/content_challenge_participants?id=in.(${lista})`);
  if (!rd.ok) return jsonRespTool({ ok: false, erro: 'remover participação: ' + rd.erro }, 500);
  return jsonRespTool({ ok: true, removido: true, checkins_apagados: Array.isArray(rc.data) ? rc.data.length : 0 });
}

// ============================================================
// Router
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ ok: false, erro: 'JSON invalido' }, 400); }

  const action = String(body.action || '').trim();
  if (!action) return jsonRespTool({ ok: false, erro: 'action obrigatorio' }, 400);

  try {
    switch (action) {
      case 'listar_planos': return await actListarPlanos();
      case 'default_acesso': return await actDefaultAcesso(body);
      case 'buscar_usuario': return await actBuscarUsuario(body);
      case 'obter_usuario': return await actObterUsuario(body);
      case 'criar_usuario': return await actCriarUsuario(body);
      case 'atualizar_usuario': return await actAtualizarUsuario(body);
      case 'trocar_plano': return await actTrocarPlano(body);
      case 'resetar_senha': return await actResetarSenha(body);
      case 'trocar_email': return await actTrocarEmail(body);
      case 'adicionar_creditos': return await actAdicionarCreditos(body);
      case 'desativar': return await actDesativar(body);
      case 'excluir': return await actExcluir(body);
      case 'listar_desafios': return await actListarDesafios(body);
      case 'desafios_usuario': return await actDesafiosUsuario(body);
      case 'adicionar_desafios': return await actAdicionarDesafios(body);
      case 'remover_desafio': return await actRemoverDesafio(body);
      default: return jsonRespTool({ ok: false, erro: `action desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonRespTool({ ok: false, erro: 'excecao: ' + msg }, 500);
  }
});
