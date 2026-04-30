// ========================================================================
// Edge Function: raio-x-banco
// ========================================================================
// Tira raio-X completo do banco do Pinguim OS:
//   1. Tamanho real de cada tabela (sem limite do PostgREST)
//   2. Total de linhas exato (count(*) via RPC)
//   3. Espaco usado vs plano Supabase (8GB Free, ajustar se outro)
//   4. Projecao de quando estoura (com base nos ultimos 7 dias)
//   5. Grava snapshot em pinguim.banco_metricas pra serie historica
//
// Roda diariamente via cron + sob demanda via UI.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const PLANO_LIMITE_BYTES = parseInt(Deno.env.get('SUPABASE_PLANO_LIMITE_BYTES') ?? String(8 * 1024 * 1024 * 1024), 10); // 8GB padrao Free

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

async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const apikey = req.headers.get('apikey') || '';
  if (auth === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` || apikey === SUPABASE_SERVICE_ROLE_KEY) return true;
  const jwt = auth.replace('Bearer ', '');
  if (!jwt) return false;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(jwt);
  return !error && !!data?.user;
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const inicio = Date.now();
  const c = sb();

  // 1. Raio-X de cada tabela
  const { data: tabelas, error: e1 } = await c.rpc('raio_x_banco');
  if (e1) return jsonResp({ error: e1.message }, 500);

  // 2. Pra tabelas grandes, contagem exata via contar_tabela
  const TABELAS_PRIORITARIAS = ['cerebro_fontes', 'cerebro_fontes_chunks', 'produtos', 'cerebro_fonte_versoes', 'seguranca_relatorios', 'seguranca_incidentes'];
  const linhasExatas: Record<string, number> = {};
  for (const nome of TABELAS_PRIORITARIAS) {
    const { data, error } = await c.rpc('contar_tabela', { nome_tabela: nome });
    if (!error && typeof data === 'number') linhasExatas[nome] = data;
  }

  // 3. Sintese
  const tamanhoTotal = (tabelas || []).reduce((s: number, t: any) => s + Number(t.tamanho_total_bytes), 0);
  const pctPlano = PLANO_LIMITE_BYTES > 0 ? (tamanhoTotal / PLANO_LIMITE_BYTES) * 100 : 0;

  const tabelasFmt = (tabelas || []).map((t: any) => ({
    tabela: t.tabela,
    total_linhas_estimado: Number(t.total_linhas),
    total_linhas_exato: linhasExatas[t.tabela] ?? null,
    tamanho_total_bytes: Number(t.tamanho_total_bytes),
    tamanho_dados_bytes: Number(t.tamanho_dados_bytes),
    tamanho_indices_bytes: Number(t.tamanho_indices_bytes),
  }));

  // 4. Salva snapshot em banco_metricas (so as prioritarias com count exato)
  const linhasMetricas = tabelasFmt
    .filter((t: any) => t.total_linhas_exato !== null)
    .map((t: any) => ({
      tabela: t.tabela,
      schema_nome: 'pinguim',
      total_linhas: t.total_linhas_exato,
      tamanho_bytes: t.tamanho_total_bytes,
    }));
  if (linhasMetricas.length) {
    await c.from('banco_metricas').insert(linhasMetricas);
  }

  // 5. Projecao: cresce X bytes/dia, estoura em N dias?
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: hist } = await c.from('banco_metricas')
    .select('tabela, tamanho_bytes, criado_em')
    .gte('criado_em', seteDiasAtras)
    .order('criado_em', { ascending: true });
  const projecao: any = { dias_para_estourar: null, taxa_crescimento_dia_bytes: 0 };
  if (hist && hist.length >= 2) {
    const por_tabela: Record<string, any[]> = {};
    hist.forEach((h: any) => { (por_tabela[h.tabela] = por_tabela[h.tabela] || []).push(h); });
    let crescDia = 0;
    for (const tab of Object.values(por_tabela) as any[]) {
      if (tab.length < 2) continue;
      const primeiro = tab[0]; const ultimo = tab[tab.length - 1];
      const dias = Math.max(1, (new Date(ultimo.criado_em).getTime() - new Date(primeiro.criado_em).getTime()) / (24 * 3600 * 1000));
      const cresc = (Number(ultimo.tamanho_bytes) - Number(primeiro.tamanho_bytes)) / dias;
      if (cresc > 0) crescDia += cresc;
    }
    projecao.taxa_crescimento_dia_bytes = Math.round(crescDia);
    if (crescDia > 0) {
      const restante = PLANO_LIMITE_BYTES - tamanhoTotal;
      projecao.dias_para_estourar = Math.max(0, Math.round(restante / crescDia));
    }
  }

  const resposta = {
    ok: true,
    duracao_ms: Date.now() - inicio,
    plano_limite_bytes: PLANO_LIMITE_BYTES,
    tamanho_total_bytes: tamanhoTotal,
    pct_plano: Math.round(pctPlano * 100) / 100,
    tabelas: tabelasFmt,
    projecao,
  };

  // 6. Grava no relatorio (status warning se >= 70%, critical se >= 90%)
  const status = pctPlano >= 90 ? 'critical' : (pctPlano >= 70 ? 'warning' : 'ok');
  await c.from('seguranca_relatorios').insert({
    tipo: 'raio_x_banco',
    status,
    resumo: `Banco usa ${(tamanhoTotal / 1024 / 1024).toFixed(2)} MB de ${(PLANO_LIMITE_BYTES / 1024 / 1024).toFixed(0)} MB (${pctPlano.toFixed(2)}%). ${projecao.dias_para_estourar ? `Estoura em ~${projecao.dias_para_estourar} dias no ritmo atual.` : 'Sem projecao (historico curto).'}`,
    total_checks: tabelasFmt.length,
    total_falhas: status === 'ok' ? 0 : 1,
    detalhes: resposta,
  });

  return jsonResp(resposta);
});
