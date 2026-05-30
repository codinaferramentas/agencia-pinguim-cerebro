// ============================================================
// Edge Function: tool-gestao-elo
// ============================================================
// Proxy seguro pra gestao de alunos do Elo App.
// Usa ELO_SERVICE_ROLE_KEY do cofre Pinguim pra falar com Supabase Elo
// (hqyyxtyvfjnkpjtcydgj).
//
// IMPORTANTE: profiles.id = auth.users.id (1:1, diferente do ProAlt
// onde tem coluna user_id separada).
//
// Actions:
//
//  - buscar_usuario:    { termo } → busca por email/nome/telefone/instagram, max 20
//  - obter_usuario:     { user_id } → dados completos do profile
//  - criar_usuario:     { email, password?, nome, nome_completo?, telefone?,
//                         instagram?, plano?, vigencia_ate?, role? }
//                       Cria via Auth Admin API + UPSERT profile (trigger
//                       handle_new_user pode ter rodado, upsert previne dup key).
//  - atualizar_usuario: { user_id, ...campos } → PATCH em profile + auth
//  - resetar_senha:     { user_id, new_password }
//  - trocar_email:      { user_id, new_email }
//  - desativar:         { user_id } → plan_status='inactive'
//  - excluir:           { user_id } → auth.admin.deleteUser (cascade no profile)
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const ELO_URL = 'https://hqyyxtyvfjnkpjtcydgj.supabase.co';
const ELO_REST = `${ELO_URL}/rest/v1`;
const ELO_AUTH_ADMIN = `${ELO_URL}/auth/v1/admin`;

const ROLES_VALIDOS = ['aluno', 'gs', 'mentor', 'admin'];

let _keyCache: { key: string; expira: number } | null = null;
async function eloKey(): Promise<string> {
  const agora = Date.now();
  if (_keyCache && _keyCache.expira > agora) return _keyCache.key;
  const key = await getChave('ELO_SERVICE_ROLE_KEY', 'tool-gestao-elo');
  _keyCache = { key, expira: agora + 5 * 60 * 1000 };
  return key;
}

function eloHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function eloREST(method: string, path: string, body?: unknown, prefer?: string) {
  const key = await eloKey();
  const headers: Record<string, string> = eloHeaders(key);
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${ELO_REST}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data, erro: !r.ok ? (data?.message || data?.error || txt.slice(0, 200)) : undefined };
}

// Calcula iniciais (2 primeiras letras do nome em UPPERCASE)
function calcularIniciais(nome: string): string {
  return nome.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

// Default vigencia: hoje + 1 ano
function vigenciaPadrao(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

// ============================================================
// Actions
// ============================================================

async function actBuscarUsuario(body: any) {
  const termo = String(body.termo || '').trim();
  if (!termo || termo.length < 2) return jsonRespTool({ ok: false, erro: 'termo obrigatorio (2+ chars)' }, 400);

  const t = encodeURIComponent(termo);
  const path = `/profiles?or=(email.ilike.*${t}*,nome.ilike.*${t}*,nome_completo.ilike.*${t}*,telefone.ilike.*${t}*,instagram.ilike.*${t}*)&select=id,nome,nome_completo,email,telefone,instagram,seguidores,role,plano,plan_status,vigencia_ate,ciclo_atual,semana_atual,elo_10k,avatar_url,created_at&limit=20`;
  const r = await eloREST('GET', path);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'buscar_usuario: ' + r.erro }, 500);

  return jsonRespTool({ ok: true, total: (r.data || []).length, usuarios: r.data || [] });
}

async function actObterUsuario(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  const r = await eloREST('GET', `/profiles?id=eq.${user_id}&select=*&limit=1`);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'obter_usuario: ' + r.erro }, 500);
  const u = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (!u) return jsonRespTool({ ok: false, erro: 'usuario nao encontrado' }, 404);

  return jsonRespTool({ ok: true, usuario: u });
}

async function actCriarUsuario(body: any) {
  const required = ['email', 'nome'];
  for (const k of required) {
    if (!body[k] || !String(body[k]).trim()) return jsonRespTool({ ok: false, erro: `${k} obrigatorio` }, 400);
  }
  const email = String(body.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonRespTool({ ok: false, erro: 'email invalido' }, 400);
  const password = String(body.password || 'mudar@1234');
  if (password.length < 6) return jsonRespTool({ ok: false, erro: 'senha minima 6 chars' }, 400);

  const role = String(body.role || 'aluno');
  if (!ROLES_VALIDOS.includes(role)) return jsonRespTool({ ok: false, erro: `role invalido (${ROLES_VALIDOS.join('/')})` }, 400);

  const nome = String(body.nome).trim();
  const nome_completo = String(body.nome_completo || nome).trim();
  const telefone = body.telefone || null;
  const instagram = body.instagram ? String(body.instagram).replace(/^@/, '').trim() : null;
  const plano = body.plano || 'Elo';
  const vigencia_ate = body.vigencia_ate || vigenciaPadrao();
  const ciclo_atual = body.ciclo_atual != null ? parseInt(body.ciclo_atual, 10) : 1;
  const semana_atual = body.semana_atual != null ? parseInt(body.semana_atual, 10) : 0;
  const elo_10k = body.elo_10k === true;
  const seguidores = body.seguidores != null && body.seguidores !== '' ? parseInt(body.seguidores, 10) : null;

  const key = await eloKey();

  // 1) Cria auth.users com user_metadata (trigger handle_new_user vai usar)
  const rAuth = await fetch(`${ELO_AUTH_ADMIN}/users`, {
    method: 'POST',
    headers: eloHeaders(key),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, telefone, plano, plan_status: 'active' },
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

  // 2) Espera trigger
  await new Promise((r) => setTimeout(r, 500));

  // 3) UPSERT profile (trigger pode ter criado linha, upsert evita conflito)
  const profileData: Record<string, any> = {
    id: user_id,
    nome,
    nome_completo,
    email,
    iniciais: calcularIniciais(nome_completo || nome),
    role,
    ciclo_atual,
    semana_atual,
    telefone,
    instagram,
    plano,
    plan_status: 'active',
    data_cadastro: new Date().toISOString(),
    vigencia_ate,
    elo_10k,
  };
  if (seguidores != null) profileData.seguidores = seguidores;

  const rUpsert = await eloREST('POST', `/profiles`, profileData, 'resolution=merge-duplicates,return=representation');
  if (!rUpsert.ok) {
    // Tenta PATCH (caso UPSERT nao funcione em alguns setups)
    const rPatch = await eloREST('PATCH', `/profiles?id=eq.${user_id}`, profileData, 'return=representation');
    if (!rPatch.ok) return jsonRespTool({ ok: false, erro: 'criar profile: ' + (rUpsert.erro || rPatch.erro), user_id_auth: user_id }, 500);
  }

  return jsonRespTool({ ok: true, user_id });
}

async function actAtualizarUsuario(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  const camposPermitidos = [
    'nome', 'nome_completo', 'telefone', 'instagram', 'role',
    'plano', 'plan_status', 'vigencia_ate', 'ciclo_atual', 'semana_atual',
    'elo_10k', 'seguidores', 'avatar_url',
  ];

  const patch: Record<string, any> = {};
  for (const k of camposPermitidos) {
    if (body[k] !== undefined) {
      if (k === 'instagram' && body[k]) patch[k] = String(body[k]).replace(/^@/, '').trim();
      else if (k === 'seguidores') patch[k] = body[k] !== '' && body[k] != null ? parseInt(body[k], 10) : null;
      else if (k === 'ciclo_atual' || k === 'semana_atual') patch[k] = parseInt(body[k], 10);
      else if (k === 'elo_10k') patch[k] = !!body[k];
      else if (k === 'role' && !ROLES_VALIDOS.includes(body[k])) return jsonRespTool({ ok: false, erro: 'role invalido' }, 400);
      else patch[k] = body[k];
    }
  }

  if ('nome' in patch || 'nome_completo' in patch) {
    patch.iniciais = calcularIniciais(patch.nome_completo || patch.nome || '');
  }

  if (Object.keys(patch).length === 0) return jsonRespTool({ ok: false, erro: 'nada pra atualizar' }, 400);

  const r = await eloREST('PATCH', `/profiles?id=eq.${user_id}`, patch, 'return=representation');
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'atualizar: ' + r.erro }, 500);

  return jsonRespTool({ ok: true, usuario: Array.isArray(r.data) && r.data[0] ? r.data[0] : null });
}

async function actResetarSenha(body: any) {
  const user_id = String(body.user_id || '').trim();
  const new_password = String(body.new_password || '');
  if (!user_id || !new_password) return jsonRespTool({ ok: false, erro: 'user_id e new_password obrigatorios' }, 400);
  if (new_password.length < 6) return jsonRespTool({ ok: false, erro: 'senha minima 6 chars' }, 400);

  const key = await eloKey();
  const r = await fetch(`${ELO_AUTH_ADMIN}/users/${user_id}`, {
    method: 'PUT',
    headers: eloHeaders(key),
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

  const key = await eloKey();
  const r = await fetch(`${ELO_AUTH_ADMIN}/users/${user_id}`, {
    method: 'PUT',
    headers: eloHeaders(key),
    body: JSON.stringify({ email: new_email, email_confirm: true }),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'trocar_email auth: ' + (data?.msg || txt.slice(0, 200)) }, r.status);

  await eloREST('PATCH', `/profiles?id=eq.${user_id}`, { email: new_email });
  return jsonRespTool({ ok: true });
}

async function actDesativar(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);
  const r = await eloREST('PATCH', `/profiles?id=eq.${user_id}`, { plan_status: 'inactive' });
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'desativar: ' + r.erro }, 500);
  return jsonRespTool({ ok: true });
}

async function actExcluir(body: any) {
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);

  const key = await eloKey();
  const r = await fetch(`${ELO_AUTH_ADMIN}/users/${user_id}`, {
    method: 'DELETE',
    headers: eloHeaders(key),
  });
  if (!r.ok) {
    const txt = await r.text();
    return jsonRespTool({ ok: false, erro: 'excluir auth: ' + txt.slice(0, 200) }, r.status);
  }
  // Cascade do FK on delete deve cuidar do profile. Cleanup defensivo:
  await eloREST('DELETE', `/profiles?id=eq.${user_id}`);
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
      case 'desativar': return await actDesativar(body);
      case 'excluir': return await actExcluir(body);
      default: return jsonRespTool({ ok: false, erro: `action desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonRespTool({ ok: false, erro: 'excecao: ' + msg }, 500);
  }
});
