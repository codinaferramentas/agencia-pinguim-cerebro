// ========================================================================
// Edge Function: bonus-blackfriday-worker
// ========================================================================
// Operação Black Friday: UMA venda Hotmart numa oferta-bônus libera acesso,
// de presente, em QUATRO programas — de uma vez, com retry parcial e auditoria.
//
//   1. ProAlt   (Supabase vdrlvflludyqkyhfoiwb) → user_plans plano "Completo" (FULL)
//   2. Elo      (Supabase hqyyxtyvfjnkpjtcydgj) → profiles role 'aluno', plano 'Elo'
//   3. Sirius   (Supabase ryyingyyzgzsbnkugfpa) → plano cheio + 10 flags access_*
//   4. Perpétuo (Curseduca prof.curseduca.pro)  → membro no grupo 74 (POST /members)
//
// Mesma arquitetura, já testada em produção, do hotmart-planilha-worker:
// OUTBOX (pinguim.bonus_bf_outbox) + rastreio SEPARADO por destino + cron */5.
// Diferença: a linha NÃO é apagada no sucesso — vira status 'concluido' e fica
// como auditoria permanente ("quem ganhou o quê"). Decisão André 2026-09-29.
//
// TRÊS modos, distinguidos pelo FORMATO do body (disparar_edge_function só
// manda {}, não repassa argumentos):
//   • body com venda (buyer/purchase/subscriber) → MODO WEBHOOK (venda nova)
//   • body vazio {}                              → MODO RETRY (cron reprocessa)
//   • body não reconhecido                       → MODO CAPTURA (teste Hotmart)
//
// IDEMPOTÊNCIA em duas camadas:
//   - de LINHA: UPSERT por transação Hotmart (reenvio do webhook não duplica linha)
//   - de DESTINO: cada conector busca por email ANTES de criar (aluno já existente
//     só tem o acesso GARANTIDO, nunca duplicado). Retry refaz só flags false.
//
// Auth: webhook público (Hotmart não manda JWT). Segurança = hottok opcional.
//   → precisa estar na allowlist "no-JWT" (verify_jwt=false), igual ao
//     hotmart-planilha-worker.
//
// ESCOPO v1 (André 2026-09-29): SÓ CONCEDE (venda aprovada). Cancelamento/
// refund/chargeback = revogação MANUAL via CRM. Não revogamos automático aqui.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Cliente do NOSSO banco (pinguim) — outbox/auditoria.
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

// ------------------------------------------------------------------------
// Ponteiros dos sistemas-alvo. NENHUM segredo aqui — só URLs públicas de
// projeto e o NOME da chave no cofre. As service keys vêm de getChave().
// (Mesmas chaves que tool-gestao-proalt/elo/sirius e o worker Curseduca já usam.)
// ------------------------------------------------------------------------
const PROALT = {
  url: 'https://vdrlvflludyqkyhfoiwb.supabase.co',
  chave: 'PROALT_SERVICE_ROLE_KEY',
  // UUID real do plano "Completo" (ex-FULL), conferido em clientes/proalt entitlements.ts
  planoCompleto: '2cf21005-9c84-4c60-8566-782809edc41b',
};
const ELO = {
  url: 'https://hqyyxtyvfjnkpjtcydgj.supabase.co',
  chave: 'ELO_SERVICE_ROLE_KEY',
};
const SIRIUS = {
  url: 'https://ryyingyyzgzsbnkugfpa.supabase.co',
  chave: 'SIRIUS_SERVICE_ROLE_KEY',
  // plan_id do plano "CICLO" (acesso completo canônico, o mesmo que o SSO
  // sirius-link usa). Conferido AO VIVO na tabela plans em 2026-09-30.
  // Usado como FALLBACK se o match por nome na tabela plans falhar.
  planoCheioFallback: '6c29e3f5-8e66-4324-88dd-39ad1c486a70',
};
const CURSEDUCA = {
  base: 'https://prof.curseduca.pro',
  grupoBonus: 74, // "Escola do Perpétuo: Plano Black" — mesmo do hotmart-planilha-worker
  tag: 'bonus-blackfriday',
};

// Senha inicial de quem for CRIADO por esta venda. Troca depois no "esqueci a senha".
// Mesma das outras integrações (entitlements.ts / tool-gestao-*).
const SENHA_PADRAO = 'mudar@1234';

// Hottok da oferta-bônus (opcional; se ausente no cofre, não bloqueia — v1 tolerante).
const HOTTOK_CHAVE = 'HOTMART_HOTTOK_BONUS_BF';

// Alerta operacional (mesmo canal do worker de planilha/agenda).
const DISCORD_CANAL_ALERTA = '1372556339578011701'; // #novo-grupo-pinguim

// Flags de acesso da Sirius — TODAS true = acesso total (bônus premium).
// Lista conferida AO VIVO nas colunas de profiles em 2026-09-30 (são 12, não
// 10 como as tools antigas assumiam: access_ganchos e access_nicho_nutricao
// foram adicionadas depois). Ligar todas garante "acesso total" de verdade.
const SIRIUS_FEATURE_KEYS = [
  'access_personas', 'access_viral_scripts', 'access_products', 'access_headlines',
  'access_marketing_creatives', 'access_challenges', 'access_challenge_templates',
  'access_templates', 'access_stories', 'access_analysis',
  'access_ganchos', 'access_nicho_nutricao',
];

// CORS (webhook server-to-server; mantém headers do supabase-js por padrão).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hotmart-hottok',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ========================================================================
// Extração do que interessa do payload Hotmart (mesma lógica robusta v1/v2
// do hotmart-planilha-worker: tenta vários caminhos, cai no que existir).
// ========================================================================
function pick(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    let v = obj;
    for (const k of path.split('.')) v = v?.[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function soDigitos(s: string): string { return String(s || '').replace(/\D/g, ''); }

interface Venda {
  ofertaId: string;
  transacao: string;
  evento: string;     // event do webhook (PURCHASE_APPROVED, PURCHASE_REFUNDED, ...)
  status: string;
  nome: string;
  email: string;
  telefone: string;   // só dígitos, sem DDD separado (uso simples pros conectores)
  ddd: string;
  documento: string;
}

function extrairVenda(payload: any): Venda | null {
  const buyer = payload?.data?.buyer ?? payload?.buyer ?? payload?.data?.purchase?.buyer ?? {};
  const purchase = payload?.data?.purchase ?? payload?.purchase ?? {};

  const email = (pick(buyer, 'email') || pick(payload, 'data.subscriber.email', 'subscriber.email')).toLowerCase();
  const nome = pick(buyer, 'name') || pick(payload, 'data.subscriber.name');
  // Sem email nem nome → não parece venda; deixa o modo captura tratar.
  if (!email && !nome) return null;

  const ofertaId = pick(payload,
    'data.purchase.offer.code', 'purchase.offer.code',
    'data.offer.code', 'offer.code', 'data.purchase.offer.key');

  // event é o campo canônico do TIPO de evento (compra/refund/chargeback).
  // É o que decide concessão — mais confiável que o status, que pode faltar.
  const evento = pick(payload, 'event', 'data.event').toUpperCase();

  const status = pick(payload,
    'data.purchase.status', 'purchase.status', 'data.status', 'status').toUpperCase();

  const transacao = pick(payload,
    'data.purchase.transaction', 'purchase.transaction', 'data.transaction', 'transaction');

  const foneBruto = pick(buyer, 'checkout_phone', 'phone') || pick(payload, 'data.buyer.phone', 'buyer.phone');
  const codigoFone = pick(buyer, 'checkout_phone_code', 'phone_local_code', 'ddd');
  const { ddd, telefone } = separarDddTelefone(codigoFone, foneBruto);

  const documento = pick(buyer, 'document', 'documents.0.value') || pick(payload, 'data.buyer.document');

  return { ofertaId, transacao, evento, status, nome, email, telefone, ddd, documento };
}

function separarDddTelefone(code: string, numero: string): { ddd: string; telefone: string } {
  const c = soDigitos(code);
  const n = soDigitos(numero);
  if (c.length >= 2 && c.length <= 3) return { ddd: c, telefone: n };
  if (n.length >= 10 && n.length <= 11) return { ddd: n.slice(0, 2), telefone: n.slice(2) };
  return { ddd: '', telefone: n };
}

// Eventos/status Hotmart que CONCEDEM acesso. (v1: só concessão — refund/
// chargeback/cancel é revogação MANUAL via CRM, não tratada aqui.)
// FAIL-CLOSED: só concede quando o evento/status é EXPLICITAMENTE de aprovação.
// Um webhook de refund cujo status caia num campo não-mapeado não vira grant.
const EVENTO_GRANT = new Set(['PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'PURCHASE_COMPLETED']);
const STATUS_GRANT = new Set(['APPROVED', 'COMPLETE', 'COMPLETED']);
function concedeAcesso(evento: string, status: string): boolean {
  // Prioriza o EVENT (campo canônico do tipo do webhook). Se o event veio,
  // ele manda: só concede se for de aprovação.
  if (evento) return EVENTO_GRANT.has(evento);
  // Sem event (raro): cai pro status, e só concede se for explicitamente de
  // aprovação. Status vazio → NÃO concede (fail-closed).
  return STATUS_GRANT.has(status);
}

// ========================================================================
// Helpers REST genéricos por sistema (PostgREST + Auth Admin API).
// Cada sistema é um Supabase com sua própria service key no cofre.
// ========================================================================
const _keyCache = new Map<string, { key: string; expira: number }>();
async function keyDe(chave: string): Promise<string> {
  const agora = Date.now();
  const c = _keyCache.get(chave);
  if (c && c.expira > agora) return c.key;
  const key = await getChave(chave, 'bonus-blackfriday-worker');
  _keyCache.set(chave, { key, expira: agora + 5 * 60 * 1000 });
  return key;
}
function headersDe(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
async function rest(baseUrl: string, key: string, method: string, path: string, body?: unknown, prefer?: string) {
  const headers: Record<string, string> = headersDe(key);
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${baseUrl}/rest/v1${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data, erro: !r.ok ? (data?.message || data?.error || txt.slice(0, 200)) : undefined };
}
// Cria usuário na Auth Admin API, idempotente: se já existe (email registrado),
// devolve o id existente em vez de estourar. Retorna { userId, criado }.
async function authCriarOuAchar(baseUrl: string, key: string, email: string, extra: Record<string, unknown> = {}):
  Promise<{ userId: string | null; jaExistia: boolean }> {
  const r = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headersDe(key),
    body: JSON.stringify({ email, password: SENHA_PADRAO, email_confirm: true, ...extra }),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (r.ok) {
    const userId = data?.id || data?.user?.id || null;
    return { userId, jaExistia: false };
  }
  // Já registrado → acha o id via Admin API (list por email).
  const msg = String(data?.msg || data?.error_description || data?.error || txt);
  if (/already|registered|exists|duplicate/i.test(msg) || r.status === 422) {
    const rl = await fetch(`${baseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
      headers: headersDe(key),
    });
    if (rl.ok) {
      const jl = await rl.json();
      const u = (jl?.users || []).find((x: any) => (x.email || '').toLowerCase() === email.toLowerCase());
      if (u?.id) return { userId: u.id, jaExistia: true };
    }
    return { userId: null, jaExistia: true };
  }
  throw new Error(`auth criar (${baseUrl}) ${r.status}: ${msg.slice(0, 200)}`);
}

// ========================================================================
// CONECTOR 1 — ProAlt. Fonte da verdade do acesso = public.user_plans
// (user_id → plan_id). Idempotente: acha/cria user, garante plano FULL.
// (Replica clientes/proalt entitlements.ts, inline e idempotente.)
// ========================================================================
async function liberarProAlt(v: Venda): Promise<{ userId: string }> {
  const key = await keyDe(PROALT.chave);

  // 1) acha por email em profiles. order determinístico (created_at.asc) pra,
  //    havendo email duplicado histórico, sempre casar o MESMO user_id entre
  //    retries — senão o acesso pousaria em identidades diferentes a cada run.
  let userId = '';
  const rP = await rest(PROALT.url, key, 'GET', `/profiles?email=eq.${encodeURIComponent(v.email)}&select=user_id&order=created_at.asc&limit=1`);
  if (rP.ok && Array.isArray(rP.data) && rP.data[0]?.user_id) {
    userId = rP.data[0].user_id;
  } else {
    // 2) cria via Auth Admin (trigger handle_new_user preenche profiles/user_roles/user_plans)
    const { userId: uid } = await authCriarOuAchar(PROALT.url, key, v.email, {
      user_metadata: { full_name: v.nome || v.email, phone: v.telefone || null, plan: 'Completo' },
    });
    if (!uid) throw new Error('ProAlt: não obteve user_id (auth)');
    userId = uid;
    await new Promise((r) => setTimeout(r, 500)); // deixa o trigger rodar
  }

  // 3) GARANTE plano Completo em user_plans (upsert por user_id) — o coração do
  //    acesso. on_conflict=user_id é OBRIGATÓRIO: o PK da tabela é 'id', então
  //    sem isto o merge-duplicates não teria alvo por user_id e o POST sempre
  //    INSERIRIA (duplicando plano, ou colidindo com a linha que o trigger já
  //    criou). Com on_conflict=user_id, reenvio/retry só atualiza o plan_id.
  const rUp = await rest(PROALT.url, key, 'POST', `/user_plans?on_conflict=user_id`,
    { user_id: userId, plan_id: PROALT.planoCompleto },
    'resolution=merge-duplicates');
  if (!rUp.ok) {
    // Fallback defensivo: se o upsert não pegou, tenta PATCH da linha existente.
    const rPatch = await rest(PROALT.url, key, 'PATCH', `/user_plans?user_id=eq.${userId}`, { plan_id: PROALT.planoCompleto });
    if (!rPatch.ok) throw new Error('ProAlt user_plans: ' + (rUp.erro || rPatch.erro));
  }
  return { userId };
}

// ========================================================================
// CONECTOR 2 — Elo. profiles.id = auth.users.id (1:1, sem coluna user_id).
// Idempotente: acha/cria, garante role 'aluno', plano 'Elo', plan_status active.
// ========================================================================
function calcularIniciais(nome: string): string {
  return nome.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function vigenciaMais1Ano(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
async function liberarElo(v: Venda): Promise<{ userId: string }> {
  const key = await keyDe(ELO.chave);
  const nome = v.nome || v.email;

  let userId = '';
  const rP = await rest(ELO.url, key, 'GET', `/profiles?email=eq.${encodeURIComponent(v.email)}&select=id,plan_status&limit=1`);
  const existente = (rP.ok && Array.isArray(rP.data) && rP.data[0]) ? rP.data[0] : null;

  if (existente?.id) {
    userId = existente.id;
    // já existe → só GARANTE que está ativo com plano (não rebaixa nada além disso).
    // CHECA .ok e lança se falhar: senão elo_ok viraria true numa ativação que
    // não aconteceu, e a linha nunca mais seria reprocessada (falso 'concluido').
    const rU = await rest(ELO.url, key, 'PATCH', `/profiles?id=eq.${userId}`, { plan_status: 'active', plano: 'Elo' });
    if (!rU.ok) throw new Error('Elo ativar existente: ' + rU.erro);
    return { userId };
  }

  // cria auth + upsert profile
  const { userId: uid } = await authCriarOuAchar(ELO.url, key, v.email, {
    user_metadata: { nome, telefone: v.telefone || null, plano: 'Elo', plan_status: 'active' },
  });
  if (!uid) throw new Error('Elo: não obteve user_id (auth)');
  userId = uid;
  await new Promise((r) => setTimeout(r, 500));

  const profile: Record<string, any> = {
    id: userId, nome, nome_completo: nome, email: v.email,
    iniciais: calcularIniciais(nome), role: 'aluno', ciclo_atual: 1, semana_atual: 0,
    telefone: v.telefone || null, plano: 'Elo', plan_status: 'active',
    data_cadastro: new Date().toISOString(), vigencia_ate: vigenciaMais1Ano(),
  };
  const rUp = await rest(ELO.url, key, 'POST', `/profiles`, profile, 'resolution=merge-duplicates,return=representation');
  if (!rUp.ok) {
    const rPatch = await rest(ELO.url, key, 'PATCH', `/profiles?id=eq.${userId}`, profile);
    if (!rPatch.ok) throw new Error('Elo profile: ' + (rUp.erro || rPatch.erro));
  }
  return { userId };
}

// ========================================================================
// CONECTOR 3 — Sirius. Acesso = plan_id + 10 flags access_*. Bônus premium:
// liga TODAS as 10 flags = true (acesso total literal, não depende de plano).
// Busca o plan_id do plano cheio ao vivo na tabela plans (fallback pro UUID
// de referência). NUNCA inventa: se não achar plano, ainda liga as flags
// (acesso garantido) e devolve nota pra revisão.
// ========================================================================
async function siriusPlanoCheioId(key: string): Promise<string | null> {
  // O plano de acesso completo canônico é o "CICLO" (mesmo do SSO sirius-link).
  // Match EXATO por nome, case-insensitive — nada de heurística por preço, que
  // pegaria planos de campanha errados ("SIRIUS ANUAL - HOT2" etc).
  const r = await rest(SIRIUS.url, key, 'GET', `/plans?select=id,name&status=eq.active`);
  if (r.ok && Array.isArray(r.data)) {
    const exato = r.data.find((p: any) => String(p.name || '').trim().toUpperCase() === 'CICLO');
    if (exato?.id) return exato.id;
  }
  return null;
}
async function liberarSirius(v: Venda): Promise<{ userId: string; nota?: string }> {
  const key = await keyDe(SIRIUS.chave);

  // resolve plan_id do plano cheio (ao vivo, com fallback)
  let planId = await siriusPlanoCheioId(key);
  let nota: string | undefined;
  if (!planId) { planId = SIRIUS.planoCheioFallback; nota = 'plano cheio não encontrado por nome; usei UUID fallback'; }

  // features = todas true (acesso total)
  const features: Record<string, boolean> = {};
  for (const k of SIRIUS_FEATURE_KEYS) features[k] = true;

  const patchBase: Record<string, any> = {
    plan_id: planId, plan_status: 'active',
    cycle_start: new Date().toISOString().slice(0, 10),
    last_payment_at: new Date().toISOString(),
    ...features,
  };

  let userId = '';
  const rP = await rest(SIRIUS.url, key, 'GET', `/profiles?email=eq.${encodeURIComponent(v.email)}&select=user_id&limit=1`);
  if (rP.ok && Array.isArray(rP.data) && rP.data[0]?.user_id) {
    userId = rP.data[0].user_id;
    const rU = await rest(SIRIUS.url, key, 'PATCH', `/profiles?user_id=eq.${userId}`, patchBase, 'return=representation');
    if (!rU.ok) throw new Error('Sirius profile (update): ' + rU.erro);
    return { userId, nota };
  }

  // cria auth + upsert profile
  const { userId: uid } = await authCriarOuAchar(SIRIUS.url, key, v.email);
  if (!uid) throw new Error('Sirius: não obteve user_id (auth)');
  userId = uid;
  await new Promise((r) => setTimeout(r, 500));

  const patch = { nome: v.nome || v.email, email: v.email, papel: 'user', telefone: v.telefone || null, preferred_language: 'pt', ...patchBase };
  const rU = await rest(SIRIUS.url, key, 'PATCH', `/profiles?user_id=eq.${userId}`, patch, 'return=representation');
  if (!rU.ok || (Array.isArray(rU.data) && rU.data.length === 0)) {
    const rInsert = await rest(SIRIUS.url, key, 'POST', `/profiles`, { user_id: userId, ...patch }, 'return=representation');
    if (!rInsert.ok) throw new Error('Sirius profile (insert): ' + (rU.erro || rInsert.erro));
  }
  return { userId, nota };
}

// ========================================================================
// CONECTOR 4 — Perpétuo (Curseduca grupo 74). POST /members idempotente por
// email. Mesma lógica do hotmart-planilha-worker (auth api_key + Bearer).
// ========================================================================
class CurseducaAuthError extends Error {}
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
async function liberarPerpetuo(v: Venda): Promise<{ memberId: string }> {
  if (!v.email) throw new Error('Perpétuo: venda sem email (obrigatório)');
  const [apiKey, accessToken, senha] = await Promise.all([
    getChave('CURSEDUCA_API_KEY', 'bonus-blackfriday-worker'),
    getChave('CURSEDUCA_ACCESS_TOKEN', 'bonus-blackfriday-worker'),
    getChave('CURSEDUCA_SENHA_PADRAO', 'bonus-blackfriday-worker'),
  ]);
  const body: any = {
    name: v.nome || v.email, email: v.email, password: senha,
    tag: CURSEDUCA.tag, group: { id: CURSEDUCA.grupoBonus }, sendMemberRegisteredEmail: false,
  };
  if (cpfValido(v.documento)) body.document = soDigitos(v.documento);
  if (v.telefone) body.phones = { mobile: { countryCode: '55', areaCode: v.ddd || '', number: v.telefone } };

  const r = await fetch(`${CURSEDUCA.base}/members`, {
    method: 'POST',
    headers: { api_key: apiKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 401 || r.status === 403) {
    throw new CurseducaAuthError(`token Curseduca expirado/inválido (${r.status}): ${(await r.text()).slice(0, 150)}`);
  }
  // 409/já-existe conta como sucesso idempotente (membro já está no grupo)
  if (!r.ok && r.status !== 409) {
    const t = await r.text();
    if (!/exist|já|registrad|duplicate/i.test(t)) throw new Error(`Perpétuo POST /members ${r.status}: ${t.slice(0, 200)}`);
    return { memberId: '' };
  }
  const j = await r.json().catch(() => ({}));
  return { memberId: String(j.id ?? j.uuid ?? '') };
}

async function alertarDiscord(texto: string): Promise<void> {
  try {
    const botToken = await getChave('DISCORD_BOT_TOKEN', 'bonus-blackfriday-worker');
    await fetch(`https://discord.com/api/v10/channels/${DISCORD_CANAL_ALERTA}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: texto.slice(0, 1900) }),
    });
  } catch (_) { /* best-effort */ }
}

// ========================================================================
// Núcleo: processa UMA linha da outbox. Roda os 4 conectores; cada um marca
// seu flag *_ok ANTES do próximo. Nunca refaz um destino já true. Coleta
// erros por destino sem abortar os outros (fan-out resiliente).
// Retorna { concluido, pendentes[] }.
// ========================================================================
// Reivindica a linha atomicamente (status→processando) via RPC. Devolve a
// linha "fresca" (estado atual no banco) se ganhou o claim, ou null se outro
// processo já a tem — nesse caso o caller PULA, evitando processamento duplo.
async function claimLinha(id: string): Promise<any | null> {
  const { data, error } = await sb.rpc('bonus_bf_claim', { p_id: id });
  if (error) throw new Error('claim: ' + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

async function processarLinha(row: any): Promise<{ concluido: boolean; pendentes: string[] }> {
  const v = extrairVenda(row.payload);
  if (!v) throw new Error('payload sem venda reconhecível');
  if (!v.email) throw new Error('venda sem email — não dá pra liberar nada');

  const pendentes: string[] = [];
  const patch: Record<string, any> = { atualizado_em: new Date().toISOString() };

  // ---- ProAlt ----
  if (!row.proalt_ok) {
    try {
      const { userId } = await liberarProAlt(v);
      patch.proalt_ok = true; patch.proalt_user_id = userId; patch.proalt_erro = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patch.proalt_erro = msg.slice(0, 300); pendentes.push('proalt');
    }
  }
  // ---- Elo ----
  if (!row.elo_ok) {
    try {
      const { userId } = await liberarElo(v);
      patch.elo_ok = true; patch.elo_user_id = userId; patch.elo_erro = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patch.elo_erro = msg.slice(0, 300); pendentes.push('elo');
    }
  }
  // ---- Sirius ----
  if (!row.sirius_ok) {
    try {
      const { userId, nota } = await liberarSirius(v);
      patch.sirius_ok = true; patch.sirius_user_id = userId; patch.sirius_erro = nota ? `nota: ${nota}` : null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patch.sirius_erro = msg.slice(0, 300); pendentes.push('sirius');
    }
  }
  // ---- Perpétuo ----
  if (!row.perpetuo_ok) {
    try {
      const { memberId } = await liberarPerpetuo(v);
      patch.perpetuo_ok = true; patch.perpetuo_member_id = memberId; patch.perpetuo_erro = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patch.perpetuo_erro = msg.slice(0, 300); pendentes.push('perpetuo');
      if (e instanceof CurseducaAuthError) {
        await alertarDiscord(`🔴 **Bônus BF: token Curseduca expirou.** Acessos presos no outbox (não se perdem) até renovar `
          + `\`CURSEDUCA_ACCESS_TOKEN\` no cofre. Detalhe: ${msg.slice(0, 180)}`);
      }
    }
  }

  const concluido = (row.proalt_ok || patch.proalt_ok) && (row.elo_ok || patch.elo_ok)
    && (row.sirius_ok || patch.sirius_ok) && (row.perpetuo_ok || patch.perpetuo_ok);

  patch.status = concluido ? 'concluido' : 'erro';
  if (!concluido) {
    patch.tentativas = (row.tentativas ?? 0) + 1;
    patch.ultimo_erro = `faltam: ${pendentes.join(', ')}`;
  } else {
    patch.ultimo_erro = null;
  }

  await sb.from('bonus_bf_outbox').update(patch).eq('id', row.id);
  return { concluido, pendentes };
}

// ========================================================================
// Handler
// ========================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const pareceVenda = body && typeof body === 'object' &&
    (body.data?.buyer || body.buyer || body.data?.purchase || body.purchase || body.data?.subscriber);

  // ---- MODO RETRY (body {}) ou CAPTURA (body não-venda) ----
  if (!pareceVenda) {
    const vazio = !body || Object.keys(body).length === 0;
    if (vazio) {
      // Candidatos: pendente/erro + linhas presas em 'processando' (watchdog).
      // MAX_TENTATIVAS evita que capturas/lixo não-processável girem pra sempre:
      // ao estourar, viram 'dead' (fora do índice de retry).
      const MAX_TENTATIVAS = 12;
      const { data: candidatos } = await sb.from('bonus_bf_outbox')
        .select('*').in('status', ['pendente', 'erro', 'processando']).order('criado_em').limit(50);
      let concluidos = 0, aindaPendentes = 0, pulados = 0;
      for (const cand of candidatos ?? []) {
        // claim atômico: se outro processo já pegou esta linha, pula.
        const row = await claimLinha(cand.id);
        if (!row) { pulados++; continue; }
        try {
          const r = await processarLinha(row);
          if (r.concluido) concluidos++; else aindaPendentes++;
        } catch (e) {
          aindaPendentes++;
          const tent = (row.tentativas ?? 0) + 1;
          await sb.from('bonus_bf_outbox').update({
            status: tent >= MAX_TENTATIVAS ? 'dead' : 'erro',
            ultimo_erro: (e instanceof Error ? e.message : String(e)).slice(0, 500),
            tentativas: tent, atualizado_em: new Date().toISOString(),
          }).eq('id', row.id);
        }
      }
      return json({ modo: 'retry', concluidos, ainda_pendentes: aindaPendentes, pulados });
    }
    // CAPTURA (teste Hotmart): grava cru pra inspeção. status 'dead' = terminal,
    // fora do índice de retry (não é venda → nunca vai processar; não deve girar).
    const { data: cap } = await sb.from('bonus_bf_outbox')
      .insert({ payload: body, status: 'dead', ultimo_erro: 'captura: body não reconhecido como venda' })
      .select('id').maybeSingle();
    return json({
      modo: 'captura', recebido: true,
      nota: 'Payload gravado pra inspeção (não parece venda). Me manda o id que eu leio e mapeio.',
      outbox_id: cap?.id ?? null, chaves_no_topo: Object.keys(body),
    });
  }

  // ---- MODO WEBHOOK: venda nova ----
  try {
    // 1) valida hottok (se configurado no cofre)
    let hottokEsperado = '';
    try { hottokEsperado = await getChave(HOTTOK_CHAVE, 'bonus-blackfriday-worker'); } catch { /* não configurado → não bloqueia */ }
    if (hottokEsperado) {
      const recebido = req.headers.get('x-hotmart-hottok') || body?.hottok || '';
      if (recebido !== hottokEsperado) return json({ erro: 'hottok inválido' }, 401);
    }

    // 2) renovação recorrente → ignora (acesso já existe)
    const recNum = Number(body?.data?.purchase?.recurrence_number ?? body?.purchase?.recurrence_number ?? 1);
    if (Number.isFinite(recNum) && recNum > 1) {
      return json({ ok: true, ignorado: 'renovacao_recorrente', recurrence_number: recNum });
    }

    const venda = extrairVenda(body);
    if (!venda?.email) return json({ ok: false, erro: 'venda sem email' }, 400);

    // 3) só concede em evento/status de aprovação (v1: sem revogação automática).
    //    Fail-closed: refund/cancel/chargeback (ou status ambíguo) NÃO libera.
    if (!concedeAcesso(venda.evento, venda.status)) {
      // grava a linha pra auditoria mas não libera nada (você vê no CRM e trata manual)
      await sb.from('bonus_bf_outbox').insert({
        oferta_id: venda.ofertaId, transacao: venda.transacao || null, comprador_nome: venda.nome,
        comprador_email: venda.email, comprador_tel: venda.telefone, comprador_doc: venda.documento,
        payload: body, status: 'erro',
        ultimo_erro: `evento não-concessão: ${venda.evento || venda.status || '(vazio)'} (revogação manual via CRM)`,
      }).select('id').maybeSingle();
      return json({ ok: true, ignorado: 'evento_nao_concessao', evento: venda.evento, status: venda.status });
    }

    // 4) Chave de dedup: transação Hotmart quando houver; senão email+oferta
    //    (cobre payloads de teste sem transação — evita 2 linhas pro mesmo bônus).
    const dedupTransacao = venda.transacao || null;
    const buscaDedup = dedupTransacao
      ? sb.from('bonus_bf_outbox').select('*').eq('transacao', dedupTransacao)
      : sb.from('bonus_bf_outbox').select('*').is('transacao', null)
          .eq('comprador_email', venda.email).eq('oferta_id', venda.ofertaId || '');

    let row: any;
    const { data: existRows } = await buscaDedup.order('criado_em').limit(1);
    if (existRows && existRows[0]) {
      row = existRows[0];
      if (row.status === 'concluido') return json({ ok: true, status: 'concluido', ja_processado: true, id: row.id });
    }

    if (!row) {
      // INSERT. Se dois webhooks concorrentes correrem (Hotmart reenvia), o
      // índice único uq_bonus_bf_transacao faz o 2º falhar — nesse caso a gente
      // NÃO estoura 500 (que faria a Hotmart reenviar de novo): re-busca a linha
      // que o 1º criou e segue com ela. TOCTOU tratado como idempotência.
      const { data: ins, error: errIns } = await sb.from('bonus_bf_outbox').insert({
        oferta_id: venda.ofertaId, transacao: dedupTransacao, comprador_nome: venda.nome,
        comprador_email: venda.email, comprador_tel: venda.telefone, comprador_doc: venda.documento,
        payload: body, status: 'pendente',
      }).select('*').single();
      if (errIns) {
        // colisão no índice único → o concorrente já inseriu. Re-busca e reusa.
        if (/duplicate|unique|23505/i.test(errIns.message) && dedupTransacao) {
          const { data: raced } = await sb.from('bonus_bf_outbox').select('*').eq('transacao', dedupTransacao).maybeSingle();
          if (raced) {
            if (raced.status === 'concluido') return json({ ok: true, status: 'concluido', ja_processado: true, id: raced.id });
            row = raced;
          } else {
            throw new Error('insert outbox (colisão sem linha): ' + errIns.message);
          }
        } else {
          throw new Error('insert outbox: ' + errIns.message);
        }
      } else {
        row = ins;
      }
    }

    // 5) caminho feliz: reivindica a linha (claim atômico) e libera os 4 já.
    //    Se o cron pegou a linha nesse meio-tempo, o claim volta null → deixamos
    //    pro cron concluir (não processamos em paralelo). Falha parcial → retry.
    const claimed = await claimLinha(row.id);
    if (!claimed) {
      return json({ ok: true, status: 'em_processamento', email: venda.email, id: row.id,
        nota: 'linha já sendo processada por outro tick; o retry conclui' }, 202);
    }
    const r = await processarLinha(claimed);
    if (r.concluido) {
      return json({ ok: true, status: 'concluido', email: venda.email, id: row.id });
    }
    return json({
      ok: true, status: 'parcial', email: venda.email, id: row.id,
      pendentes: r.pendentes, nota: 'guardado na outbox; o retry conclui os que faltaram',
    }, 202);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
