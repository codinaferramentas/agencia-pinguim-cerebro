// ============================================================
// Edge Function: tool-gestao-perpetuo
// ============================================================
// Proxy seguro pra gestão de acesso da Escola do Perpétuo, que vive na
// Curseduca (prof.curseduca.pro), grupo 74 ("Plano Black"). Diferente dos
// outros 3 apps (ProAlt/Elo/Sirius = Supabase próprio), aqui liberar acesso
// = adicionar o membro ao grupo via POST /members (idempotente por email).
// Reusa as MESMAS chaves de cofre do bonus-blackfriday-worker e do
// hotmart-planilha-worker (CURSEDUCA_API_KEY / _ACCESS_TOKEN / _SENHA_PADRAO).
//
// Actions:
//  - buscar_usuario: { termo } → GET /members?search= (max 20)
//  - criar_usuario:  { email, full_name, phone?, documento? } → POST /members
//                    (senha padrão da Curseduca, grupo 74). 409/já-existe = ok.
//  - remover_acesso: { user_id } → DELETE /members/{id}/groups/74 (tira do grupo)
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { soDigitos } from '../_shared/telefone-br.ts';

const CURSEDUCA_BASE = 'https://prof.curseduca.pro';
const GRUPO_PERPETUO = 74; // Escola do Perpétuo: Plano Black
const TAG_CRM = 'crm-liberacao';

let _cache: { api: string; tok: string; senha: string; expira: number } | null = null;
async function chaves() {
  const agora = Date.now();
  if (_cache && _cache.expira > agora) return _cache;
  const [api, tok, senha] = await Promise.all([
    getChave('CURSEDUCA_API_KEY', 'tool-gestao-perpetuo'),
    getChave('CURSEDUCA_ACCESS_TOKEN', 'tool-gestao-perpetuo'),
    getChave('CURSEDUCA_SENHA_PADRAO', 'tool-gestao-perpetuo'),
  ]);
  _cache = { api, tok, senha, expira: agora + 5 * 60 * 1000 };
  return _cache;
}
function headers(api: string, tok: string) {
  return { api_key: api, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
}

function cpfValido(v: string): boolean {
  const c = soDigitos(v || '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesoIni: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * (pesoIni - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === parseInt(c[9], 10) && dv(c.slice(0, 10), 11) === parseInt(c[10], 10);
}

async function actBuscarUsuario(body: any) {
  const termo = String(body.termo || '').trim();
  if (termo.length < 2) return jsonRespTool({ ok: false, erro: 'termo obrigatorio (2+ chars)' }, 400);
  const { api, tok } = await chaves();
  const r = await fetch(`${CURSEDUCA_BASE}/members?search=${encodeURIComponent(termo)}&limit=20`, { headers: headers(api, tok) });
  if (r.status === 401 || r.status === 403) return jsonRespTool({ ok: false, erro: 'token Curseduca expirado/inválido' }, 502);
  if (!r.ok) return jsonRespTool({ ok: false, erro: 'buscar: ' + (await r.text()).slice(0, 150) }, 500);
  const j = await r.json().catch(() => ({}));
  const usuarios = (j.data || []).map((m: any) => ({
    user_id: String(m.id), id: String(m.id), full_name: m.name, nome: m.name, email: m.email,
    telefone: m.phone ? `${m.phone.areaCode || ''}${m.phone.number || ''}` : null,
    situation: m.situation, ultimo_acesso: m.lastAccess || null,
  }));
  return jsonRespTool({ ok: true, total: usuarios.length, usuarios });
}

async function actCriarUsuario(body: any) {
  const email = String(body.email || '').trim();
  const nome = String(body.full_name || body.nome || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonRespTool({ ok: false, erro: 'email inválido' }, 400);
  if (!nome) return jsonRespTool({ ok: false, erro: 'nome obrigatorio' }, 400);

  const { api, tok, senha } = await chaves();
  const corpo: any = {
    name: nome, email, password: senha, tag: TAG_CRM,
    group: { id: GRUPO_PERPETUO }, sendMemberRegisteredEmail: false,
  };
  if (cpfValido(body.documento)) corpo.document = soDigitos(body.documento);
  if (body.phone) {
    const dig = soDigitos(body.phone);
    corpo.phones = { mobile: { countryCode: '55', areaCode: dig.slice(0, 2), number: dig.slice(2) } };
  }

  const r = await fetch(`${CURSEDUCA_BASE}/members`, { method: 'POST', headers: headers(api, tok), body: JSON.stringify(corpo) });
  if (r.status === 401 || r.status === 403) return jsonRespTool({ ok: false, erro: 'token Curseduca expirado/inválido' }, 502);
  if (!r.ok && r.status !== 409) {
    const t = await r.text();
    // "já existe" = sucesso idempotente (membro já está no grupo)
    if (!/exist|já|registrad|duplicate/i.test(t)) return jsonRespTool({ ok: false, erro: `criar: ${r.status} ${t.slice(0, 180)}` }, r.status);
    return jsonRespTool({ ok: true, user_id: '', ja_existia: true });
  }
  const j = await r.json().catch(() => ({}));
  return jsonRespTool({ ok: true, user_id: String(j.id ?? j.uuid ?? '') });
}

async function actRemoverAcesso(body: any) {
  const memberId = String(body.user_id || '').trim();
  if (!memberId) return jsonRespTool({ ok: false, erro: 'user_id obrigatorio' }, 400);
  const { api, tok } = await chaves();
  const r = await fetch(`${CURSEDUCA_BASE}/members/${memberId}/groups/${GRUPO_PERPETUO}`, {
    method: 'DELETE', headers: headers(api, tok),
  });
  if (r.status === 401 || r.status === 403) return jsonRespTool({ ok: false, erro: 'token Curseduca expirado/inválido' }, 502);
  // 404 = já não estava no grupo → idempotente, conta como sucesso
  if (!r.ok && r.status !== 404) return jsonRespTool({ ok: false, erro: `remover: ${r.status} ${(await r.text()).slice(0, 150)}` }, r.status);
  return jsonRespTool({ ok: true });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ ok: false, erro: 'JSON invalido' }, 400); }
  const action = String(body.action || '').trim();

  try {
    switch (action) {
      case 'buscar_usuario': return await actBuscarUsuario(body);
      case 'criar_usuario': return await actCriarUsuario(body);
      case 'remover_acesso': return await actRemoverAcesso(body);
      default: return jsonRespTool({ ok: false, erro: `action desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    return jsonRespTool({ ok: false, erro: 'excecao: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
