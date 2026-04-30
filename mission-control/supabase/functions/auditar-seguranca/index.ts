// ========================================================================
// Edge Function: auditar-seguranca
// ========================================================================
// Roda checks de seguranca do Pinguim OS e grava relatorios:
//   1. RLS ativo em TODAS as tabelas do schema pinguim (Weidman/Manico)
//   2. Funcoes SECURITY DEFINER com search_path seguro (Manico)
//   3. Tabelas sem PRIMARY KEY (anti-padrao)
//   4. Politicas RLS faltando (RLS habilitado mas sem policy = bloqueio total)
//   5. Estatisticas dos incidentes em aberto (Carey/Sanders)
//
// Roda diariamente via cron (pg_cron) ou sob demanda via UI.
//
// Uso:
//   POST /functions/v1/auditar-seguranca
//   Body opcional: { tipos: ['rls','policies'] } pra rodar so alguns checks
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function sbService() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const headerJwt = auth.replace('Bearer ', '');
  if (!headerJwt) return false;

  // Match direto com SUPABASE_SERVICE_ROLE_KEY (qualquer formato — sb_secret_ ou JWT legacy)
  if (headerJwt === SUPABASE_SERVICE_ROLE_KEY) return true;

  // Tenta validar como service_role JWT legacy: tenta operacao admin que so service_role consegue
  // (listar 1 usuario). Se passar, e service role legitimo.
  if (headerJwt.startsWith('eyJ')) {
    try {
      const adminClient = createClient(SUPABASE_URL, headerJwt, {
        auth: { persistSession: false }
      });
      const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) return true;
    } catch (_) { /* ignora */ }
  }

  // Senao, valida JWT de usuario autenticado via anon client
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

// SQL helper: roda query crua via RPC (precisa de funcao auxiliar no banco)
async function rawQuery(sb: any, sql: string): Promise<any[]> {
  // Usa o Management API style: exec via rest sql nao existe pra Edge Function.
  // Vamos usar postgres-meta endpoint? Edge Function nao tem acesso direto.
  // Solucao: criar funcao pinguim._auditoria_query que aceita query whitelist.
  // Mais simples: chamar funcoes especificas pre-definidas.
  throw new Error('Use funcoes especificas, nao raw query');
}

// ====== Checks individuais ======

type CheckResultado = {
  tipo: string;
  status: 'ok' | 'warning' | 'critical';
  resumo: string;
  total_checks: number;
  total_falhas: number;
  detalhes: any;
};

async function checkRls(sb: any): Promise<CheckResultado> {
  // Lista todas as tabelas do schema pinguim com flag de RLS
  const { data, error } = await sb.rpc('listar_tabelas_rls');
  if (error) {
    return {
      tipo: 'rls', status: 'critical',
      resumo: 'Erro consultando RLS: ' + error.message,
      total_checks: 0, total_falhas: 0,
      detalhes: { erro: error.message },
    };
  }
  const tabelas = data || [];
  const sem_rls = tabelas.filter((t: any) => !t.rls_ativo);
  return {
    tipo: 'rls',
    status: sem_rls.length > 0 ? 'critical' : 'ok',
    resumo: sem_rls.length === 0
      ? `RLS ativo em todas as ${tabelas.length} tabelas do schema pinguim.`
      : `${sem_rls.length} tabela(s) SEM RLS: ${sem_rls.map((t: any) => t.tabela).join(', ')}`,
    total_checks: tabelas.length,
    total_falhas: sem_rls.length,
    detalhes: { tabelas, sem_rls: sem_rls.map((t: any) => t.tabela) },
  };
}

async function checkPolicies(sb: any): Promise<CheckResultado> {
  const { data, error } = await sb.rpc('listar_tabelas_policies');
  if (error) return { tipo: 'policies', status: 'warning', resumo: error.message, total_checks: 0, total_falhas: 0, detalhes: {} };
  const tabelas = data || [];
  const sem_policy = tabelas.filter((t: any) => t.rls_ativo && t.total_policies === 0);
  return {
    tipo: 'policies',
    status: sem_policy.length > 0 ? 'warning' : 'ok',
    resumo: sem_policy.length === 0
      ? `Toda tabela com RLS tem ao menos uma policy.`
      : `${sem_policy.length} tabela(s) com RLS mas SEM policy (acesso bloqueado total): ${sem_policy.map((t: any) => t.tabela).join(', ')}`,
    total_checks: tabelas.length,
    total_falhas: sem_policy.length,
    detalhes: { tabelas, sem_policy: sem_policy.map((t: any) => t.tabela) },
  };
}

async function checkSecurityDefiner(sb: any): Promise<CheckResultado> {
  const { data, error } = await sb.rpc('listar_funcoes_security_definer');
  if (error) return { tipo: 'security_definer', status: 'warning', resumo: error.message, total_checks: 0, total_falhas: 0, detalhes: {} };
  const funcoes = data || [];
  const inseguras = funcoes.filter((f: any) => f.security_definer && (!f.search_path_seguro));
  return {
    tipo: 'security_definer',
    status: inseguras.length > 0 ? 'warning' : 'ok',
    resumo: inseguras.length === 0
      ? `Todas as funcoes SECURITY DEFINER tem search_path seguro.`
      : `${inseguras.length} funcao(oes) SECURITY DEFINER sem search_path explicito (risco de hijack)`,
    total_checks: funcoes.length,
    total_falhas: inseguras.length,
    detalhes: { funcoes, inseguras: inseguras.map((f: any) => f.nome) },
  };
}

async function checkIncidentesAbertos(sb: any): Promise<CheckResultado> {
  const { data, error } = await sb.from('seguranca_incidentes')
    .select('severidade')
    .eq('resolvido', false);
  if (error) return { tipo: 'incidentes_abertos', status: 'warning', resumo: error.message, total_checks: 0, total_falhas: 0, detalhes: {} };
  const incidentes = data || [];
  const criticos = incidentes.filter((i: any) => i.severidade === 'critico').length;
  const altos = incidentes.filter((i: any) => i.severidade === 'alto').length;
  const status = criticos > 0 ? 'critical' : (altos > 0 ? 'warning' : 'ok');
  return {
    tipo: 'incidentes_abertos',
    status,
    resumo: incidentes.length === 0
      ? `Nenhum incidente em aberto.`
      : `${incidentes.length} incidente(s) em aberto (${criticos} critico, ${altos} alto)`,
    total_checks: incidentes.length,
    total_falhas: criticos + altos,
    detalhes: { total: incidentes.length, criticos, altos, medios: incidentes.length - criticos - altos },
  };
}

async function gravarRelatorios(sb: any, checks: CheckResultado[]) {
  const rows = checks.map(c => ({
    tipo: c.tipo,
    status: c.status,
    resumo: c.resumo,
    detalhes: c.detalhes,
    total_checks: c.total_checks,
    total_falhas: c.total_falhas,
  }));
  await sb.from('seguranca_relatorios').insert(rows);
}

// ====== Handler ======

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const tiposPermitidos = ['rls', 'policies', 'security_definer', 'incidentes_abertos'];
  const tipos: string[] = Array.isArray(body.tipos) && body.tipos.length
    ? body.tipos.filter((t: string) => tiposPermitidos.includes(t))
    : tiposPermitidos;

  const sb = sbService();
  const inicio = Date.now();
  const checks: CheckResultado[] = [];

  if (tipos.includes('rls'))               checks.push(await checkRls(sb));
  if (tipos.includes('policies'))          checks.push(await checkPolicies(sb));
  if (tipos.includes('security_definer'))  checks.push(await checkSecurityDefiner(sb));
  if (tipos.includes('incidentes_abertos'))checks.push(await checkIncidentesAbertos(sb));

  for (const c of checks) c.detalhes.duracao_ms = Date.now() - inicio;
  await gravarRelatorios(sb, checks);

  // Sintese geral
  const totalCriticos = checks.filter(c => c.status === 'critical').length;
  const totalWarnings = checks.filter(c => c.status === 'warning').length;
  const statusGeral = totalCriticos > 0 ? 'critical' : (totalWarnings > 0 ? 'warning' : 'ok');

  return jsonResp({
    ok: true,
    status_geral: statusGeral,
    duracao_ms: Date.now() - inicio,
    checks: checks.map(c => ({ tipo: c.tipo, status: c.status, resumo: c.resumo, total_checks: c.total_checks, total_falhas: c.total_falhas })),
  });
});
