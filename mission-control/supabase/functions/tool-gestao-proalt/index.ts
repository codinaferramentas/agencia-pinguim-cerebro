// ============================================================
// Edge Function: tool-gestao-proalt
// ============================================================
// Proxy seguro pra gestao de usuarios da ProAlt.
// Usa PROALT_SERVICE_ROLE_KEY do cofre Pinguim pra falar com Supabase ProAlt
// (vdrlvflludyqkyhfoiwb).
//
// Actions via { action } no body POST:
//
//  - buscar_usuario:    { termo } → busca por email/nome/telefone (LIKE), max 20
//  - obter_usuario:     { user_id } → dados completos (profile + role)
//  - criar_usuario:     { email, password?, full_name, phone?, role? }
//                       password default = "mudar@1234"; role default = "user"
//                       Cria via Auth Admin API + trigger handle_new_user
//                       preenche profiles/user_roles/user_plans automaticamente
//  - atualizar_usuario: { user_id, full_name?, phone?, email?, role? }
//  - resetar_senha:     { user_id, new_password }
//  - trocar_email:      { user_id, new_email } (atualiza auth + profile)
//  - excluir:           { user_id } → DELETE auth (cascade nas demais)
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { variantesTelefoneBR, orTelefoneTermos, soDigitos } from '../_shared/telefone-br.ts';

const PROALT_URL = 'https://vdrlvflludyqkyhfoiwb.supabase.co';
const PROALT_REST = `${PROALT_URL}/rest/v1`;
const PROALT_AUTH_ADMIN = `${PROALT_URL}/auth/v1/admin`;

let _keyCache: { key: string; expira: number } | null = null;
async function proaltKey(): Promise<string> {
  const agora = Date.now();
  if (_keyCache && _keyCache.expira > agora) return _keyCache.key;
  const key = await getChave('PROALT_SERVICE_ROLE_KEY', 'tool-gestao-proalt');
  _keyCache = { key, expira: agora + 5 * 60 * 1000 };
  return key;
}

function proaltHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function proaltREST(method: string, path: string, body?: unknown, prefer?: string) {
  const key = await proaltKey();
  const headers: Record<string, string> = proaltHeaders(key);
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${PROALT_REST}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data, erro: !r.ok ? (data?.message || data?.error || txt.slice(0, 200)) : undefined };
}

// ============================================================
// Actions
// ============================================================

async function actBuscarUsuario(body: any) {
  const termo = String(body.termo || '').trim();
  if (!termo || termo.length < 2) return jsonRespTool({ ok: false, erro: 'termo obrigatorio (2+ chars)' }, 400);

  // Se o termo parece telefone (8+ digitos), expande variantes BR
  // pra cobrir formatos com/sem DDI 55, com/sem 9 do celular, com/sem +.
  // Senao, usa o termo cru — pode ser email/nome.
  const digitos = soDigitos(termo);
  const ehTelefone = digitos.length >= 8;
  const telOr = ehTelefone ? orTelefoneTermos('phone', variantesTelefoneBR(termo)) : `phone.ilike.*${termo}*`;
  const orInterno = `email.ilike.*${termo}*,full_name.ilike.*${termo}*,${telOr}`;
  const path = `/profiles?or=(${encodeURIComponent(orInterno)})&select=user_id,full_name,email,phone,last_access_at,access_count,created_at&limit=20`;
  const r = await proaltREST('GET', path);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'buscar_usuario: ' + r.erro }, 500);

  // Enriquece com role
  const userIds = (r.data || []).map((u: any) => u.user_id).filter(Boolean);
  let roleMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const ids = userIds.map((id: string) => `"${id}"`).join(',');
    const rr = await proaltREST('GET', `/user_roles?select=user_id,role&user_id=in.(${ids})`);
    if (rr.ok && Array.isArray(rr.data)) {
      roleMap = Object.fromEntries(rr.data.map((r: any) => [r.user_id, r.role]));
    }
  }
  const usuarios = (r.data || []).map((u: any) => ({ ...u, role: roleMap[u.user_id] || 'user' }));
  return jsonRespTool({ ok: true, total: usuarios.length, usuarios });
}

async function actObterUsuario(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  const r = await proaltREST('GET', `/profiles?user_id=eq.${user_id}&select=*&limit=1`);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'obter_usuario: ' + r.erro }, 500);
  const u = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (!u) return jsonRespTool({ ok: false, erro: 'usuario nao encontrado' }, 404);

  const rr = await proaltREST('GET', `/user_roles?user_id=eq.${user_id}&select=role&limit=1`);
  const role = (rr.ok && Array.isArray(rr.data) && rr.data[0]) ? rr.data[0].role : 'user';

  return jsonRespTool({ ok: true, usuario: { ...u, role } });
}

async function actCriarUsuario(body: any) {
  const required = ['email', 'full_name'];
  for (const k of required) {
    if (!body[k] || !String(body[k]).trim()) return jsonRespTool({ ok: false, erro: `${k} obrigatorio` }, 400);
  }
  const email = String(body.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonRespTool({ ok: false, erro: 'email invalido' }, 400);
  const password = String(body.password || 'mudar@1234');
  if (password.length < 6) return jsonRespTool({ ok: false, erro: 'senha minima 6 chars' }, 400);
  const role = String(body.role || 'user');
  if (!['user', 'manager', 'admin'].includes(role)) return jsonRespTool({ ok: false, erro: 'role invalido (user/manager/admin)' }, 400);

  const key = await proaltKey();

  // Cria em auth.users via Admin API com user_metadata.
  // Trigger handle_new_user vai preencher profiles/user_roles/user_plans automaticamente.
  const rAuth = await fetch(`${PROALT_AUTH_ADMIN}/users`, {
    method: 'POST',
    headers: proaltHeaders(key),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: String(body.full_name).trim(),
        phone: body.phone || null,
        role,
        plan: 'Completo',
      },
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

  // Garantia: espera 500ms pro trigger rodar
  await new Promise((r) => setTimeout(r, 500));

  // Se role != 'user', UPSERT na user_roles (trigger pode ter colocado default)
  if (role !== 'user') {
    await proaltREST('PATCH', `/user_roles?user_id=eq.${user_id}`, { role });
  }

  return jsonRespTool({ ok: true, user_id });
}

async function actAtualizarUsuario(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  // 1) Profile
  const profilePatch: Record<string, any> = {};
  if (body.full_name !== undefined) profilePatch.full_name = body.full_name;
  if (body.phone !== undefined) profilePatch.phone = body.phone;
  if (body.email !== undefined) profilePatch.email = body.email;

  if (Object.keys(profilePatch).length > 0) {
    const r = await proaltREST('PATCH', `/profiles?user_id=eq.${user_id}`, profilePatch, 'return=representation');
    if (!r.ok) return jsonRespTool({ ok: false, erro: 'atualizar profile: ' + r.erro }, 500);
  }

  // 2) Role (se mudou)
  if (body.role) {
    if (!['user', 'manager', 'admin'].includes(body.role)) return jsonRespTool({ ok: false, erro: 'role invalido' }, 400);
    const r = await proaltREST('PATCH', `/user_roles?user_id=eq.${user_id}`, { role: body.role });
    if (!r.ok) {
      // Tenta INSERT se não existia
      const ri = await proaltREST('POST', `/user_roles`, { user_id, role: body.role }, 'resolution=ignore-duplicates');
      if (!ri.ok) return jsonRespTool({ ok: false, erro: 'atualizar role: ' + (r.erro || ri.erro) }, 500);
    }
  }

  // 3) Email no auth (se mudou)
  if (body.email) {
    const key = await proaltKey();
    await fetch(`${PROALT_AUTH_ADMIN}/users/${user_id}`, {
      method: 'PUT',
      headers: proaltHeaders(key),
      body: JSON.stringify({ email: body.email, email_confirm: true }),
    });
  }

  return jsonRespTool({ ok: true });
}

async function actResetarSenha(body: any) {
  const user_id = String(body.user_id || '').trim();
  const new_password = String(body.new_password || '');
  if (!user_id || !new_password) return jsonRespTool({ ok: false, erro: 'user_id e new_password obrigatorios' }, 400);
  if (new_password.length < 6) return jsonRespTool({ ok: false, erro: 'senha minima 6 chars' }, 400);

  const key = await proaltKey();
  const r = await fetch(`${PROALT_AUTH_ADMIN}/users/${user_id}`, {
    method: 'PUT',
    headers: proaltHeaders(key),
    body: JSON.stringify({ password: new_password }),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'resetar_senha: ' + (data?.msg || txt.slice(0, 200)) }, r.status);
  return jsonRespTool({ ok: true });
}

async function actTrocarEmail(body: any) {
  const user_id = String(body.user_id || '').trim();
  const new_email = String(body.new_email || '').trim();
  if (!user_id || !new_email) return jsonRespTool({ ok: false, erro: 'user_id e new_email obrigatorios' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) return jsonRespTool({ ok: false, erro: 'email invalido' }, 400);

  const key = await proaltKey();
  const r = await fetch(`${PROALT_AUTH_ADMIN}/users/${user_id}`, {
    method: 'PUT',
    headers: proaltHeaders(key),
    body: JSON.stringify({ email: new_email, email_confirm: true }),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'trocar_email auth: ' + (data?.msg || txt.slice(0, 200)) }, r.status);

  // Sincroniza profile.email
  await proaltREST('PATCH', `/profiles?user_id=eq.${user_id}`, { email: new_email });
  return jsonRespTool({ ok: true });
}

async function actExcluir(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  const key = await proaltKey();
  const r = await fetch(`${PROALT_AUTH_ADMIN}/users/${user_id}`, {
    method: 'DELETE',
    headers: proaltHeaders(key),
  });
  if (!r.ok) {
    const txt = await r.text();
    return jsonRespTool({ ok: false, erro: 'excluir auth: ' + txt.slice(0, 200) }, r.status);
  }
  // Cleanup defensivo
  await proaltREST('DELETE', `/profiles?user_id=eq.${user_id}`);
  await proaltREST('DELETE', `/user_roles?user_id=eq.${user_id}`);
  return jsonRespTool({ ok: true });
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
      case 'buscar_usuario': return await actBuscarUsuario(body);
      case 'obter_usuario': return await actObterUsuario(body);
      case 'criar_usuario': return await actCriarUsuario(body);
      case 'atualizar_usuario': return await actAtualizarUsuario(body);
      case 'resetar_senha': return await actResetarSenha(body);
      case 'trocar_email': return await actTrocarEmail(body);
      case 'excluir': return await actExcluir(body);
      default: return jsonRespTool({ ok: false, erro: `action desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonRespTool({ ok: false, erro: 'excecao: ' + msg }, 500);
  }
});
