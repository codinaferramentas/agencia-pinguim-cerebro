// ========================================================================
// Edge Function: bonus-blackfriday-worker
// ========================================================================
// Combo Black (Hotmart produto 8729703). Cada venda aprovada do combo libera,
// de presente, acesso em TRÊS programas:
//
//   1. Escola do Perpétuo (Curseduca turma 74) → validade 10 anos
//   2. Sirius (Supabase ryyingyyzgzsbnkugfpa)  → plano CICLO + 12 flags, 2 anos
//   3. Elo    (Supabase hqyyxtyvfjnkpjtcydgj)  → plano Elo, vigência 2 anos
// e registra o comprador na planilha "Alunos ELO/ProAlt", aba black26 (lista
// pro time entrar em contato).
//
// DUAS entradas, mesma fila (transação única → nunca libera em dobro):
//   1. webhook da Hotmart cadastrado no combo → libera na hora (exige hottok)
//   2. cron a cada 1 min (bonus-bf-combo) lê do Dash as vendas aprovadas do
//      combo → rede de segurança se o webhook falhar ou atrasar. Mesmo padrão
//      do crm-sync-vendas (marca d'água + sobreposição).
//
// Garantias:
//   - outbox pinguim.bonus_bf_outbox: venda lida = venda gravada, nada se perde
//   - claim atômico (RPC bonus_bf_claim): dois ticks nunca processam a mesma linha
//   - rastreio por destino (*_ok): retry refaz só o que faltou
//   - idempotente por email em cada sistema (busca antes de criar)
//   - NUNCA encurta validade nem rebaixa plano de quem já é aluno ativo
//
// ESCOPO v1: só concede. Reembolso/chargeback = revogação manual via CRM.
// Schema: schema-044-bonus-blackfriday.sql
// Deploy: Management API, verify_jwt=false. Auth feita aqui: webhook → hottok
//         (HOTMART_HOTTOK_COMBO_BF); cron/manual → requireAuthTool (service role).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CONSUMIDOR = 'bonus-blackfriday-worker';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

// ------------------------------------------------------------------------
// Regra de detecção do combo. A 1ª compra de teste confirma como a Hotmart
// registra o combo no Dash; se vier por oferta em vez de produto, basta
// preencher OFERTAS_COMBO e redeployar.
// ------------------------------------------------------------------------
const PRODUTOS_COMBO = [8729703];          // hotmart_product_id
const OFERTAS_COMBO: string[] = [];        // offer_id (fallback, vazio por ora)
const STATUS_CONCEDE = ['approved', 'completed'];
const SOBREPOSICAO_MIN = 15;               // relê 15 min pra trás (venda gravada atrasada)

// Validades do bônus (decisão André 2026-10-15)
const ANOS_ESCOLA = 10;
const ANOS_SIRIUS = 2;
const ANOS_ELO = 2;

// validade atual até 1 dia antes do alvo já conta como "cobre" (recompra no
// mesmo dia não reescreve a data por segundos de diferença)
const TOLERANCIA_MS = 86_400_000;

const SENHA_PADRAO = 'mudar@1234';         // todos os sistemas; onboarding fica com os legados
const MAX_TENTATIVAS = 30;                 // ~30 min de retry a 1/min antes de 'dead'
const CONCORRENCIA = 4;                    // linhas processadas em paralelo
const ORCAMENTO_MS = 45_000;               // para de pegar linhas novas depois disso

const SIRIUS = {
  url: 'https://ryyingyyzgzsbnkugfpa.supabase.co',
  chave: 'SIRIUS_SERVICE_ROLE_KEY',
  // plano CICLO (acesso completo). Conferido ao vivo em 2026-09-30; o código
  // busca por nome primeiro e só usa este UUID se não achar.
  planoCicloFallback: '6c29e3f5-8e66-4324-88dd-39ad1c486a70',
};
// 12 flags (conferidas nas colunas reais de profiles em 2026-09-30)
const SIRIUS_FEATURE_KEYS = [
  'access_personas', 'access_viral_scripts', 'access_products', 'access_headlines',
  'access_marketing_creatives', 'access_challenges', 'access_challenge_templates',
  'access_templates', 'access_stories', 'access_analysis',
  'access_ganchos', 'access_nicho_nutricao',
];

const ELO = {
  url: 'https://hqyyxtyvfjnkpjtcydgj.supabase.co',
  chave: 'ELO_SERVICE_ROLE_KEY',
};

const CURSEDUCA = {
  base: 'https://prof.curseduca.pro',
  turma: 74,                 // "Escola do Perpétuo: Plano Black (Black 2025)"
  tag: 'combo-black',
};

// Lista do time: planilha "Alunos ELO/ProAlt" (a mesma do hotmart-planilha-worker), aba black26
const PLANILHA = {
  id: '1bJjWFTD5qn5o1SkvAAeMaFb4Ravcx2ozDITI7q1lZ4c',
  aba: 'black26',
};

const DISCORD_CANAL_ALERTA = '1372556339578011701'; // #novo-grupo-pinguim

// ========================================================================
// Utilitários
// ========================================================================
function soDigitos(s: unknown): string { return String(s ?? '').replace(/\D/g, ''); }

function maisAnos(anos: number, base = new Date()): string {
  const d = new Date(base);
  d.setUTCFullYear(d.getUTCFullYear() + anos);
  return d.toISOString();
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// Hotmart manda telefone com/sem DDI e às vezes o DDD em campo separado.
function separarTelefone(code: string, numero: string): { ddd: string; telefone: string } {
  const c = soDigitos(code);
  let n = soDigitos(numero);
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) n = n.slice(2);
  if (c.length >= 2 && c.length <= 3 && n.length <= 9) return { ddd: c.slice(-2), telefone: n };
  if (n.length >= 10 && n.length <= 11) return { ddd: n.slice(0, 2), telefone: n.slice(2) };
  return { ddd: '', telefone: n };
}

function cpfValido(v: string): boolean {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesoIni: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * (pesoIni - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === parseInt(c[9], 10) && dv(c.slice(0, 10), 11) === parseInt(c[10], 10);
}

interface Comprador {
  nome: string;
  email: string;
  ddd: string;
  telefone: string;
  documento: string;
}

function compradorDaLinha(row: any): Comprador {
  const b = row.payload?.hotmart_buyers ?? {};
  const { ddd, telefone } = separarTelefone(b.checkout_phone_code, b.phone || b.checkout_phone);
  return {
    nome: String(row.comprador_nome || b.name || '').trim(),
    email: String(row.comprador_email || b.email || '').trim().toLowerCase(),
    ddd,
    telefone,
    documento: soDigitos(row.comprador_doc || b.document),
  };
}

// ------------------------------------------------------------------------
// REST genérico pros Supabases externos (service key do cofre; o cofre já
// cacheia 5 min, não precisa de cache aqui).
// ------------------------------------------------------------------------
function headersDe(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
async function rest(baseUrl: string, key: string, method: string, path: string, body?: unknown, prefer?: string) {
  const headers: Record<string, string> = headersDe(key);
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${baseUrl}/rest/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data, erro: !r.ok ? (data?.message || data?.error || txt.slice(0, 200)) : undefined };
}

// Cria usuário no Auth Admin; se o email já existe, devolve o id existente.
// (GoTrue aceita ?filter= e casa por email — conferido no código do supabase/auth.)
async function authCriarOuAchar(baseUrl: string, key: string, email: string, extra: Record<string, unknown> = {}):
  Promise<{ id: string; criado: boolean }> {
  const r = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headersDe(key),
    body: JSON.stringify({ email, password: SENHA_PADRAO, email_confirm: true, ...extra }),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (r.ok) {
    const id = data?.id || data?.user?.id;
    if (!id) throw new Error(`auth sem id (${baseUrl})`);
    return { id, criado: true };
  }
  const m = String(data?.msg || data?.error_description || data?.error || txt);
  if (r.status === 422 || /already|registered|exists|duplicate/i.test(m)) {
    const rl = await fetch(`${baseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=50`, { headers: headersDe(key) });
    if (rl.ok) {
      const jl = await rl.json();
      const u = (jl?.users || []).find((x: any) => String(x.email || '').toLowerCase() === email);
      if (u?.id) return { id: u.id, criado: false };
    }
    throw new Error(`auth: email já existe mas não achei o id (${baseUrl})`);
  }
  throw new Error(`auth criar ${r.status}: ${m.slice(0, 200)}`);
}

// ========================================================================
// CONECTOR 1 — Escola do Perpétuo (Curseduca turma 74, 10 anos)
//   - já está na turma 74 → MANTIDO (os alunos atuais são vitalícios; não
//     encurtamos). Exceção: se fomos NÓS que criamos o membro numa tentativa
//     anterior (perpetuo_member_id gravado), reaplicamos a validade.
//   - membro existe fora da turma → POST /members/groups com validade
//   - não existe → POST /members (cria já na turma) + POST /members/groups
//     com validade (o 2º passo sobrescreve a validade — testado 2026-10-15)
// ========================================================================
class CurseducaAuthError extends Error {}
class ErroComMembro extends Error {
  constructor(m: string, public memberId: string) { super(m); }
}

async function curseducaHeaders() {
  const [apiKey, accessToken] = await Promise.all([
    getChave('CURSEDUCA_API_KEY', CONSUMIDOR),
    getChave('CURSEDUCA_ACCESS_TOKEN', CONSUMIDOR),
  ]);
  return { api_key: apiKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function curseduca(method: string, path: string, body?: unknown) {
  const r = await fetch(`${CURSEDUCA.base}${path}`, {
    method,
    headers: await curseducaHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  if (r.status === 401 || r.status === 403) {
    throw new CurseducaAuthError(`token Curseduca inválido (${r.status}): ${txt.slice(0, 150)}`);
  }
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data, txt };
}

async function curseducaDefinirValidade(member: { id: number; uuid: string }, expira: string) {
  const r = await curseduca('POST', '/members/groups', {
    member: { id: member.id, uuid: member.uuid, role: 'STUDENT' },
    group: { id: CURSEDUCA.turma },
    customExpirationDate: expira,
  });
  if (!r.ok) throw new Error(`Curseduca POST /members/groups ${r.status}: ${r.txt.slice(0, 200)}`);
}

async function liberarEscola(c: Comprador, memberIdCriadoAntes: string | null): Promise<{ memberId: string; resultado: string }> {
  const expira = maisAnos(ANOS_ESCOLA);

  const busca = await curseduca('GET', `/members/by?email=${encodeURIComponent(c.email)}`);
  if (busca.ok && busca.data?.id) {
    const member = { id: Number(busca.data.id), uuid: String(busca.data.uuid) };
    const det = await curseduca('GET', `/members/${member.id}`);
    if (!det.ok) throw new Error(`Curseduca GET /members/${member.id} ${det.status}`);
    const naTurma = (det.data?.groups || []).some((g: any) => Number(g?.group?.id) === CURSEDUCA.turma);
    const fomosNos = memberIdCriadoAntes && memberIdCriadoAntes === String(member.id);
    if (naTurma && !fomosNos) return { memberId: String(member.id), resultado: 'mantido' };
    await curseducaDefinirValidade(member, expira);
    return { memberId: String(member.id), resultado: fomosNos ? 'criado' : 'adicionado' };
  }
  if (busca.status !== 404) throw new Error(`Curseduca GET /members/by ${busca.status}: ${busca.txt.slice(0, 200)}`);

  const body: any = {
    name: c.nome || c.email,
    email: c.email,
    password: SENHA_PADRAO,
    tag: CURSEDUCA.tag,
    group: { id: CURSEDUCA.turma },
    sendMemberRegisteredEmail: false,
  };
  if (cpfValido(c.documento)) body.document = c.documento;
  if (c.telefone && c.ddd) body.phones = { mobile: { countryCode: '55', areaCode: c.ddd, number: c.telefone } };

  const cria = await curseduca('POST', '/members', body);
  if (!cria.ok || !cria.data?.id) throw new Error(`Curseduca POST /members ${cria.status}: ${cria.txt.slice(0, 200)}`);
  const member = { id: Number(cria.data.id), uuid: String(cria.data.uuid) };
  try {
    await curseducaDefinirValidade(member, expira);
  } catch (e) {
    // membro já foi criado (na turma, SEM validade) — guarda o id pra o retry
    // saber que foi a gente e reaplicar a validade.
    throw new ErroComMembro(msg(e), String(member.id));
  }
  return { memberId: String(member.id), resultado: 'criado' };
}

// ========================================================================
// CONECTOR 2 — Sirius (plano CICLO + 12 flags, 2 anos)
//   ATENÇÃO: a Sirius tem trigger (auto_update_plan_expiration) que REESCREVE
//   plan_expires_at = cycle_start + duração do plano sempre que muda plan_id
//   ou cycle_start. Por isso gravamos em 2 passos: (1) plano/ciclo/flags,
//   (2) só plan_expires_at — e lemos de volta pra confirmar.
//   Aluno ativo com validade ≥ 2 anos (ou sem validade = vitalício) é MANTIDO:
//   só ligamos as flags que faltarem, sem mexer em plano nem data.
// ========================================================================
async function siriusPlanoCicloId(key: string): Promise<string> {
  const r = await rest(SIRIUS.url, key, 'GET', `/plans?select=id,name&status=eq.active`);
  if (r.ok && Array.isArray(r.data)) {
    const p = r.data.find((x: any) => String(x.name || '').trim().toUpperCase() === 'CICLO');
    if (p?.id) return p.id;
  }
  return SIRIUS.planoCicloFallback;
}

async function liberarSirius(c: Comprador): Promise<{ userId: string; resultado: string }> {
  const key = await getChave(SIRIUS.chave, CONSUMIDOR);
  const expira = maisAnos(ANOS_SIRIUS);
  const flags: Record<string, boolean> = {};
  for (const k of SIRIUS_FEATURE_KEYS) flags[k] = true;

  const rP = await rest(SIRIUS.url, key, 'GET',
    `/profiles?email=eq.${encodeURIComponent(c.email)}&select=user_id,plan_status,plan_expires_at&order=created_at.asc&limit=1`);
  if (!rP.ok) throw new Error('Sirius buscar profile: ' + rP.erro);
  let perfil = Array.isArray(rP.data) ? rP.data[0] : null;
  let userId: string = perfil?.user_id || '';

  if (!userId) {
    const auth = await authCriarOuAchar(SIRIUS.url, key, c.email);
    userId = auth.id;
    if (auth.criado) await new Promise((r) => setTimeout(r, 500)); // trigger handle_new_user cria o profile
    const rN = await rest(SIRIUS.url, key, 'GET', `/profiles?user_id=eq.${userId}&select=user_id,plan_status,plan_expires_at&limit=1`);
    perfil = rN.ok && Array.isArray(rN.data) ? rN.data[0] : null;
    if (!perfil) {
      const ins = await rest(SIRIUS.url, key, 'POST', `/profiles`,
        { user_id: userId, email: c.email, nome: c.nome || c.email, papel: 'user', preferred_language: 'pt' }, 'return=representation');
      if (!ins.ok) throw new Error('Sirius criar profile: ' + ins.erro);
    }
    const base = await rest(SIRIUS.url, key, 'PATCH', `/profiles?user_id=eq.${userId}`,
      { nome: c.nome || c.email, email: c.email, telefone: c.telefone ? `${c.ddd}${c.telefone}` : null });
    if (!base.ok) throw new Error('Sirius dados básicos: ' + base.erro);
    // login criado agora: o profile que o trigger gerou tem valores padrão, que
    // não contam como plano → força o caminho de conceder. Se o login JÁ existia
    // (email só faltava no profile), respeita o plano que a pessoa tem.
    if (auth.criado || !perfil) perfil = null;
  }

  const ativo = perfil?.plan_status === 'active';
  const atual = perfil?.plan_expires_at ? new Date(perfil.plan_expires_at).getTime() : null;
  const jaCobre = ativo && (atual === null || atual >= new Date(expira).getTime() - TOLERANCIA_MS);

  if (jaCobre) {
    const rF = await rest(SIRIUS.url, key, 'PATCH', `/profiles?user_id=eq.${userId}`, flags);
    if (!rF.ok) throw new Error('Sirius flags: ' + rF.erro);
    return { userId, resultado: 'mantido' };
  }

  // passo 1: plano + ciclo + flags (o trigger vai recalcular a validade)
  const planId = await siriusPlanoCicloId(key);
  const p1 = await rest(SIRIUS.url, key, 'PATCH', `/profiles?user_id=eq.${userId}`, {
    plan_id: planId,
    plan_status: 'active',
    cycle_start: new Date().toISOString().slice(0, 10),
    ...flags,
  });
  if (!p1.ok) throw new Error('Sirius plano: ' + p1.erro);

  // passo 2: só a validade (não toca plan_id/cycle_start → trigger não reescreve)
  const p2 = await rest(SIRIUS.url, key, 'PATCH', `/profiles?user_id=eq.${userId}`,
    { plan_expires_at: expira, plan_status: 'active' }, 'return=representation');
  if (!p2.ok) throw new Error('Sirius validade: ' + p2.erro);

  const gravado = Array.isArray(p2.data) && p2.data[0]?.plan_expires_at;
  if (!gravado || Math.abs(new Date(gravado).getTime() - new Date(expira).getTime()) > 86_400_000) {
    throw new Error(`Sirius validade não fixou (gravado ${gravado}, esperado ${expira})`);
  }
  return { userId, resultado: perfil ? 'estendido' : 'criado' };
}

// ========================================================================
// CONECTOR 3 — Elo (plano Elo, vigência 2 anos). profiles.id = auth.users.id.
//   - ativo com vigência ≥ 2 anos → MANTIDO
//   - ativo com vigência menor → só estende vigencia_ate (NÃO troca o plano:
//     tem aluno em Taurus/Lyra/Enterprise, que é mais que o Elo)
//   - expirado → reativa com plano Elo + vigência 2 anos
//   - não existe → cria (auth + profile) com plano Elo + vigência 2 anos
// ========================================================================
function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

async function liberarElo(c: Comprador): Promise<{ userId: string; resultado: string }> {
  const key = await getChave(ELO.chave, CONSUMIDOR);
  const vig = maisAnos(ANOS_ELO);

  const tratarExistente = async (perfil: any) => {
    const ativo = perfil.plan_status === 'active';
    const atual = perfil.vigencia_ate ? new Date(perfil.vigencia_ate).getTime() : null;
    if (ativo && (atual === null || atual >= new Date(vig).getTime() - TOLERANCIA_MS)) {
      return { userId: perfil.id, resultado: 'mantido' };
    }
    const patch: Record<string, unknown> = ativo
      ? { vigencia_ate: vig }
      : { vigencia_ate: vig, plan_status: 'active', plano: 'Elo' };
    const rU = await rest(ELO.url, key, 'PATCH', `/profiles?id=eq.${perfil.id}`, patch);
    if (!rU.ok) throw new Error('Elo estender: ' + rU.erro);
    return { userId: perfil.id, resultado: 'estendido' };
  };

  const rP = await rest(ELO.url, key, 'GET',
    `/profiles?email=eq.${encodeURIComponent(c.email)}&select=id,plan_status,vigencia_ate&order=created_at.asc&limit=1`);
  if (!rP.ok) throw new Error('Elo buscar profile: ' + rP.erro);
  const perfil = Array.isArray(rP.data) ? rP.data[0] : null;
  if (perfil?.id) return await tratarExistente(perfil);

  const nome = c.nome || c.email;
  const telefone = c.telefone ? `${c.ddd}${c.telefone}` : null;
  const { id: userId, criado } = await authCriarOuAchar(ELO.url, key, c.email, {
    user_metadata: { nome, telefone, plano: 'Elo', plan_status: 'active' },
  });
  if (criado) {
    await new Promise((r) => setTimeout(r, 500)); // trigger handle_new_user
  } else {
    // login já existia (perfil sem email batendo): respeita o que a pessoa tem
    const rI = await rest(ELO.url, key, 'GET', `/profiles?id=eq.${userId}&select=id,plan_status,vigencia_ate&limit=1`);
    const p2 = rI.ok && Array.isArray(rI.data) ? rI.data[0] : null;
    if (p2?.id) return await tratarExistente(p2);
  }

  const profile = {
    id: userId, nome, nome_completo: nome, email: c.email, iniciais: iniciais(nome),
    role: 'aluno', ciclo_atual: 1, semana_atual: 0, telefone,
    plano: 'Elo', plan_status: 'active',
    data_cadastro: new Date().toISOString(), vigencia_ate: vig,
  };
  const rUp = await rest(ELO.url, key, 'POST', `/profiles?on_conflict=id`, profile, 'resolution=merge-duplicates');
  if (!rUp.ok) throw new Error('Elo criar profile: ' + rUp.erro);
  return { userId, resultado: 'criado' };
}

// ========================================================================
// Leitura do Dash → outbox
// ========================================================================
async function lerDash(): Promise<{ lidas: number; novas: number }> {
  const { data: est } = await sb.from('bonus_bf_estado').select('ultima_marca').eq('id', 1).single();
  const marca = new Date(est?.ultima_marca || '2026-10-01T00:00:00Z');
  const desde = new Date(marca.getTime() - SOBREPOSICAO_MIN * 60_000).toISOString();

  const dashUrl = await getChave('DASHBOARD_URL', CONSUMIDOR);
  const dashKey = await getChave('DASHBOARD_SERVICE_ROLE_KEY', CONSUMIDOR);
  const sel = 'transaction_code,status,offer_id,purchase_date,approved_date,updated_at,price_value,src,'
    + 'hotmart_products!inner(hotmart_product_id,name),'
    + 'hotmart_buyers(name,email,phone,checkout_phone,checkout_phone_code,document)';
  const base = `${dashUrl}/rest/v1/hotmart_transactions?select=${encodeURIComponent(sel)}`
    + `&status=in.(${STATUS_CONCEDE.join(',')})&updated_at=gte.${encodeURIComponent(desde)}&order=updated_at.asc&limit=1000`;
  const consultas = [`${base}&hotmart_products.hotmart_product_id=in.(${PRODUTOS_COMBO.join(',')})`];
  if (OFERTAS_COMBO.length) consultas.push(`${base}&offer_id=in.(${OFERTAS_COMBO.map((o) => `"${o}"`).join(',')})`);

  const txs: any[] = [];
  for (const url of consultas) {
    const r = await fetch(url, { headers: { apikey: dashKey, Authorization: `Bearer ${dashKey}` } });
    if (!r.ok) throw new Error(`Dash ${r.status}: ${(await r.text()).slice(0, 200)}`);
    txs.push(...await r.json());
  }

  let maxMarca = marca.toISOString();
  const linhas = [];
  for (const t of txs) {
    if (t.updated_at > maxMarca) maxMarca = t.updated_at;
    const b = t.hotmart_buyers || {};
    linhas.push({
      transacao: t.transaction_code,
      produto_hotmart: t.hotmart_products?.hotmart_product_id ?? null,
      oferta_id: t.offer_id ?? null,
      dash_status: t.status,
      data_compra: t.approved_date || t.purchase_date || null,
      comprador_nome: b.name || null,
      comprador_email: String(b.email || '').trim().toLowerCase() || null,
      comprador_tel: b.phone || b.checkout_phone || null,
      comprador_doc: b.document || null,
      payload: t,
    });
  }

  let novas = 0;
  if (linhas.length) {
    const { data, error } = await sb.from('bonus_bf_outbox')
      .upsert(linhas, { onConflict: 'transacao', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error('outbox insert: ' + error.message);
    novas = data?.length ?? 0;
  }

  await sb.from('bonus_bf_estado').update({
    ultima_marca: maxMarca, ultima_rodada: new Date().toISOString(),
    itens_ultima: txs.length, atualizado_em: new Date().toISOString(),
  }).eq('id', 1);

  return { lidas: txs.length, novas };
}

// ========================================================================
// DESTINO 4 — Planilha "Alunos ELO/ProAlt", aba black26 (lista pro time).
//   Mesmo formato do hotmart-planilha-worker: A Data | B Nome | C Documento |
//   D Email | E DDD | F Telefone (G+ são preenchidas à mão pelo time).
//   O combo tem aba fixa (não roteia por oferta como ProAlt/Elo).
//   Idempotente: se o email já está na coluna D, não duplica a linha.
//   OAuth Google = mesmas chaves do cofre que o hotmart-planilha-worker usa.
// ========================================================================
const _tokGoogle = { token: '', expira: 0 };
async function tokenGoogle(): Promise<string> {
  if (_tokGoogle.token && _tokGoogle.expira > Date.now() + 5 * 60_000) return _tokGoogle.token;
  const [cid, sec, rt] = await Promise.all([
    getChave('GOOGLE_OAUTH_CLIENT_ID', CONSUMIDOR),
    getChave('GOOGLE_OAUTH_CLIENT_SECRET', CONSUMIDOR),
    getChave('GOOGLE_OAUTH_REFRESH', CONSUMIDOR),
  ]);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: sec, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  _tokGoogle.token = j.access_token;
  _tokGoogle.expira = Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000;
  return j.access_token;
}

// "DD/MM/AAAA HH:MM:SS" em BRT (UTC-3 fixo), igual às outras abas.
function dataBR(iso: string | null): string {
  const t = iso ? new Date(iso).getTime() : Date.now();
  const d = new Date(t - 3 * 3600_000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// Linha inserida por append não herda o formato da coluna: sem isto a Data
// aparece como número serial (46310,74455). Aplica "dd/mm/yyyy hh:mm:ss" na
// coluna A (sem o cabeçalho) — idempotente, mesmo truque do hotmart-planilha-worker.
// Não é fatal: a venda já entrou; só a exibição da data ficaria errada.
let _sheetIdAba: number | null = null;
async function formatarColunaData(base: string, H: Record<string, string>): Promise<void> {
  try {
    if (_sheetIdAba === null) {
      const r = await fetch(`${base}?fields=sheets.properties(title,sheetId)`, { headers: H });
      const j = await r.json();
      const aba = (j.sheets || []).find((s: any) => s.properties?.title === PLANILHA.aba);
      if (!aba) return;
      _sheetIdAba = aba.properties.sheetId;
    }
    const r = await fetch(`${base}:batchUpdate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ requests: [{ repeatCell: {
        range: { sheetId: _sheetIdAba, startColumnIndex: 0, endColumnIndex: 1, startRowIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'dd/mm/yyyy hh:mm:ss' } } },
        fields: 'userEnteredFormat.numberFormat',
      } }] }),
    });
    if (!r.ok) console.warn('formatar Data black26', r.status, (await r.text()).slice(0, 150));
  } catch (e) { console.warn('formatar Data black26', msg(e)); }
}

// Escritas na mesma aba em paralelo (CONCORRENCIA linhas) passam por aqui uma
// de cada vez: a checagem "email já está?" e o append não se atropelam.
let _filaPlanilha: Promise<unknown> = Promise.resolve();

async function registrarPlanilha(row: any, c: Comprador): Promise<{ resultado: string }> {
  const tarefa = _filaPlanilha.then(async () => {
    const token = await tokenGoogle();
    const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA.id}`;
    const faixa = (r: string) => encodeURIComponent(`'${PLANILHA.aba}'!${r}`);

    const rD = await fetch(`${base}/values/${faixa('D:D')}`, { headers: H });
    if (!rD.ok) throw new Error(`Sheets ler aba ${PLANILHA.aba} ${rD.status}: ${(await rD.text()).slice(0, 200)}`);
    const emails = ((await rD.json()).values || []).map((v: string[]) => String(v[0] || '').trim().toLowerCase());
    if (emails.includes(c.email)) return { resultado: 'mantido' };

    const linha = [dataBR(row.data_compra), c.nome, c.documento, c.email, c.ddd, c.telefone];
    const rA = await fetch(`${base}/values/${faixa('A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST', headers: H, body: JSON.stringify({ majorDimension: 'ROWS', values: [linha] }),
    });
    if (!rA.ok) throw new Error(`Sheets append ${PLANILHA.aba} ${rA.status}: ${(await rA.text()).slice(0, 200)}`);
    await formatarColunaData(base, H);
    return { resultado: 'adicionado' };
  });
  _filaPlanilha = tarefa.catch(() => {});
  return await tarefa;
}

// ========================================================================
// Processamento de uma linha (já reivindicada). Os 4 destinos rodam em
// paralelo e cada um falha sozinho; só os que estão false são tentados.
// ========================================================================
async function processarLinha(row: any): Promise<{ concluido: boolean; faltam: string[] }> {
  const c = compradorDaLinha(row);
  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  const faltam: string[] = [];

  if (!c.email) {
    const tent = (row.tentativas ?? 0) + 1;
    await sb.from('bonus_bf_outbox').update({
      ...patch, status: 'dead', tentativas: tent, ultimo_erro: 'venda sem email no Dash — liberar manualmente',
    }).eq('id', row.id);
    return { concluido: false, faltam: ['email'] };
  }

  const tarefas: Promise<void>[] = [];

  if (!row.perpetuo_ok) {
    tarefas.push(liberarEscola(c, row.perpetuo_member_id || null).then(async (r) => {
      Object.assign(patch, { perpetuo_ok: true, perpetuo_member_id: r.memberId, perpetuo_resultado: r.resultado, perpetuo_erro: null });
      await refletirNoCrm('waid_escola_perpetuo', c, r.memberId, 'Plano Black', r.resultado === 'mantido' ? null : maisAnos(ANOS_ESCOLA));
    }).catch(async (e) => {
      faltam.push('escola');
      patch.perpetuo_erro = msg(e).slice(0, 300);
      if (e instanceof ErroComMembro) patch.perpetuo_member_id = e.memberId;
      if (e instanceof CurseducaAuthError) {
        await alertarDiscord('🔴 **Combo Black: token da Curseduca expirou.** Acessos da Escola presos na fila (não se perdem). '
          + 'Renove `CURSEDUCA_ACCESS_TOKEN` no cofre. Detalhe: ' + msg(e).slice(0, 180));
      }
    }));
  }
  if (!row.planilha_ok) {
    tarefas.push(registrarPlanilha(row, c).then((r) => {
      Object.assign(patch, { planilha_ok: true, planilha_resultado: r.resultado, planilha_erro: null });
    }).catch((e) => { faltam.push('planilha'); patch.planilha_erro = msg(e).slice(0, 300); }));
  }
  if (!row.sirius_ok) {
    tarefas.push(liberarSirius(c).then(async (r) => {
      Object.assign(patch, { sirius_ok: true, sirius_user_id: r.userId, sirius_resultado: r.resultado, sirius_erro: null });
      await refletirNoCrm('sirius', c, r.userId, r.resultado === 'mantido' ? null : 'CICLO', r.resultado === 'mantido' ? null : maisAnos(ANOS_SIRIUS));
    }).catch((e) => { faltam.push('sirius'); patch.sirius_erro = msg(e).slice(0, 300); }));
  }
  if (!row.elo_ok) {
    tarefas.push(liberarElo(c).then(async (r) => {
      Object.assign(patch, { elo_ok: true, elo_user_id: r.userId, elo_resultado: r.resultado, elo_erro: null });
      await refletirNoCrm('elo', c, r.userId, r.resultado === 'criado' ? 'Elo' : null, r.resultado === 'mantido' ? null : maisAnos(ANOS_ELO));
    }).catch((e) => { faltam.push('elo'); patch.elo_erro = msg(e).slice(0, 300); }));
  }

  await Promise.all(tarefas);

  const concluido = faltam.length === 0;
  if (concluido) {
    Object.assign(patch, { status: 'concluido', ultimo_erro: null });
  } else {
    const tent = (row.tentativas ?? 0) + 1;
    Object.assign(patch, {
      status: tent >= MAX_TENTATIVAS ? 'dead' : 'erro',
      tentativas: tent,
      ultimo_erro: `faltam: ${faltam.join(', ')}`,
    });
    if (tent === MAX_TENTATIVAS) {
      await alertarDiscord(`🟠 **Combo Black: venda ${row.transacao} (${c.email}) desistiu após ${tent} tentativas.** `
        + `Faltam: ${faltam.join(', ')}. Ver pinguim.bonus_bf_outbox e liberar manualmente.`);
    }
  }
  await sb.from('bonus_bf_outbox').update(patch).eq('id', row.id);
  return { concluido, faltam };
}

// Reflete o acesso na ficha do CRM 360 NA HORA (tabela pinguim.crm_acesso_app,
// a mesma que o botão "Liberar acesso" do CRM grava via crm_acesso_registrar).
// Sem isto o card só mostra o acesso depois do sync diário das 04:00 BRT
// (crm-sync-perfis / crm-sync-waid). Best-effort: falha aqui não desfaz a
// liberação — o sync diário corrige. plano/vigência null = não mexe no que há.
async function refletirNoCrm(app: string, c: Comprador, idNoApp: string, plano: string | null, vigencia: string | null): Promise<void> {
  try {
    const { data: clienteId, error } = await sb.rpc('crm_acesso_registrar', {
      p_app: app, p_email: c.email, p_nome: c.nome || c.email,
      p_tel: c.telefone ? `${c.ddd}${c.telefone}` : null,
      p_id_no_app: idNoApp || null, p_plano: plano, p_cliente_id: null,
    });
    if (error) throw new Error(error.message);
    if (vigencia && clienteId) {
      await sb.from('crm_acesso_app').update({ vigencia_ate: vigencia }).eq('cliente_id', clienteId).eq('app', app);
    }
  } catch (e) {
    console.warn('refletirNoCrm', app, c.email, msg(e));
  }
}

async function alertarDiscord(texto: string): Promise<void> {
  try {
    const botToken = await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR);
    await fetch(`https://discord.com/api/v10/channels/${DISCORD_CANAL_ALERTA}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: texto.slice(0, 1900) }),
    });
  } catch (_) { /* best-effort */ }
}

// ========================================================================
// Fila: reivindica e processa uma linha (usado pelo cron e pelo webhook)
// ========================================================================
async function processarId(id: string): Promise<'concluido' | 'pendente' | 'pulado'> {
  const { data: claim, error } = await sb.rpc('bonus_bf_claim', { p_id: id });
  if (error) throw new Error('claim: ' + error.message);
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row) return 'pulado'; // outro tick já está com ela
  try {
    const r = await processarLinha(row);
    return r.concluido ? 'concluido' : 'pendente';
  } catch (e) {
    await sb.from('bonus_bf_outbox').update({
      status: 'erro', ultimo_erro: msg(e).slice(0, 500),
      tentativas: (row.tentativas ?? 0) + 1, atualizado_em: new Date().toISOString(),
    }).eq('id', row.id);
    return 'pendente';
  }
}

// ========================================================================
// ENTRADA 1 — webhook da Hotmart (libera na hora)
//   Segurança: o endpoint é público, então SÓ libera com o hottok certo
//   (HOTMART_HOTTOK_COMBO_BF no cofre). Enquanto o cofre não tiver o hottok,
//   roda em MODO CAPTURA: registra a chamada (com o hottok recebido) e não
//   libera nada — a leitura do Dash continua cobrindo as vendas.
//   Toda chamada vai pro pinguim.bonus_bf_webhook_log (diagnóstico).
//   Responde 200 depois de registrar (a Hotmart não precisa reenviar).
// ========================================================================
const EVENTOS_CONCEDE = ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'PURCHASE_COMPLETED'];

function pick(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    let v = obj;
    for (const k of path.split('.')) v = v?.[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function iguaisSemVazarTempo(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function pareceWebhookHotmart(body: any): boolean {
  return !!body && typeof body === 'object' && Object.keys(body).length > 0
    && !!(body.event || body.data?.purchase || body.data?.buyer || body.hottok);
}

async function receberWebhook(req: Request, body: any): Promise<Response> {
  const evento = pick(body, 'event').toUpperCase();
  const produtoId = Number(pick(body, 'data.product.id', 'prod')) || null;
  const produtoNome = pick(body, 'data.product.name', 'prod_name') || null;
  const oferta = pick(body, 'data.purchase.offer.code', 'off') || null;
  const transacao = pick(body, 'data.purchase.transaction', 'transaction') || null;
  const buyer = body?.data?.buyer ?? {};
  const email = (pick(buyer, 'email') || pick(body, 'email')).toLowerCase() || null;

  const hottokRecebido = req.headers.get('x-hotmart-hottok') || pick(body, 'hottok');
  let hottokCofre = '';
  try { hottokCofre = await getChave('HOTMART_HOTTOK_COMBO_BF', CONSUMIDOR, { fallbackEnv: false }); } catch { /* ainda não configurado */ }
  const hottokOk = hottokCofre ? iguaisSemVazarTempo(hottokRecebido, hottokCofre) : null;

  const log = async (acao: string) => {
    await sb.from('bonus_bf_webhook_log').insert({
      evento, produto_id: produtoId, produto_nome: produtoNome, oferta, transacao,
      comprador_email: email, hottok_ok: hottokOk,
      hottok_recebido: hottokCofre ? null : (hottokRecebido || null),
      acao, payload: body,
    });
  };

  if (hottokOk === false) { await log('recusado:hottok'); return jsonRespTool({ ok: false, erro: 'hottok inválido' }, 401); }
  if (hottokOk === null) {
    await log('captura');
    return jsonRespTool({ ok: true, modo: 'captura', nota: 'registrado; a liberação pelo webhook liga quando o hottok estiver no cofre' });
  }

  const ehCombo = (produtoId !== null && PRODUTOS_COMBO.includes(produtoId)) || (!!oferta && OFERTAS_COMBO.includes(oferta));
  if (!ehCombo) { await log('ignorado:outro_produto'); return jsonRespTool({ ok: true, ignorado: 'outro_produto', produto: produtoId }); }
  if (!EVENTOS_CONCEDE.includes(evento)) { await log(`ignorado:evento_${evento || 'vazio'}`); return jsonRespTool({ ok: true, ignorado: 'evento', evento }); }
  if (!transacao || !email) { await log('ignorado:sem_transacao_ou_email'); return jsonRespTool({ ok: true, ignorado: 'sem_transacao_ou_email' }); }

  const dataMs = Number(pick(body, 'data.purchase.approved_date', 'data.purchase.order_date'));
  // mesma forma que a linha do Dash (compradorDaLinha lê payload.hotmart_buyers)
  const linha = {
    transacao,
    produto_hotmart: produtoId,
    oferta_id: oferta,
    dash_status: pick(body, 'data.purchase.status').toLowerCase() || evento.toLowerCase(),
    data_compra: dataMs > 0 ? new Date(dataMs).toISOString() : null,
    comprador_nome: pick(buyer, 'name') || null,
    comprador_email: email,
    comprador_tel: pick(buyer, 'checkout_phone', 'phone') || null,
    comprador_doc: pick(buyer, 'document') || null,
    payload: {
      origem: 'webhook',
      hotmart_buyers: {
        name: pick(buyer, 'name'), email,
        phone: pick(buyer, 'phone'), checkout_phone: pick(buyer, 'checkout_phone'),
        checkout_phone_code: pick(buyer, 'checkout_phone_code'), document: pick(buyer, 'document'),
      },
      webhook: body,
    },
  };
  const { error } = await sb.from('bonus_bf_outbox').upsert(linha, { onConflict: 'transacao', ignoreDuplicates: true });
  if (error) { await log('erro:outbox'); throw new Error('outbox: ' + error.message); }
  await log('enfileirado');

  const { data: row } = await sb.from('bonus_bf_outbox').select('id,status').eq('transacao', transacao).single();
  if (!row) throw new Error('outbox: linha não encontrada após inserir');
  if (row.status === 'concluido') return jsonRespTool({ ok: true, status: 'concluido', ja_processado: true });
  const r = await processarId(row.id);
  return jsonRespTool({ ok: true, status: r, transacao });
}

// ========================================================================
// ENTRADA 2 — cron a cada 1 min: lê o Dash (rede de segurança) e drena a
// fila (inclui retry do que o webhook não conseguiu concluir).
// ========================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  const t0 = Date.now();
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  try {
    if (pareceWebhookHotmart(body)) return await receberWebhook(req, body);

    if (!(await requireAuthTool(req))) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

    const leitura = await lerDash();

    const { data: candidatos } = await sb.from('bonus_bf_outbox')
      .select('id').in('status', ['pendente', 'erro', 'processando']).order('criado_em').limit(200);

    const fila = [...(candidatos ?? [])];
    let concluidos = 0, pendentes = 0, pulados = 0;

    const trabalhador = async () => {
      while (fila.length && Date.now() - t0 < ORCAMENTO_MS) {
        const r = await processarId(fila.shift()!.id);
        if (r === 'concluido') concluidos++; else if (r === 'pendente') pendentes++; else pulados++;
      }
    };
    await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));

    return jsonRespTool({
      ok: true, dash_lidas: leitura.lidas, novas: leitura.novas,
      concluidos, pendentes, pulados, restantes: fila.length, ms: Date.now() - t0,
    });
  } catch (e) {
    console.error('bonus-blackfriday-worker', e);
    return jsonRespTool({ ok: false, erro: msg(e) }, 500);
  }
});
