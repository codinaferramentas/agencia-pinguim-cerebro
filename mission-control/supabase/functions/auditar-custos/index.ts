// ========================================================================
// Edge Function: auditar-custos
// ========================================================================
// Roda diario via cron. Agrega custos do dia a partir das fontes:
//   - ingest_lotes.custo_usd       (OpenAI dos pacotes ZIP / upload manual)
//   - chave_uso                    (proxy de invocacoes OpenAI avulsas)
//   - integracoes.custo_acumulado  (Apify e outras integracoes externas)
//   - banco_metricas               (Supabase Pro: US$25/mes rateado por dia)
//
// Grava em pinguim.custos_diarios (idempotente: on conflict update).
//
// Disparado por:
//   - cron pg_cron diario 05h
//   - manualmente via UI (botao "Atualizar agora")
//   - smoke test
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
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const headerJwt = auth.replace('Bearer ', '');
  if (!headerJwt) return false;
  if (headerJwt === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (headerJwt.startsWith('eyJ')) {
    try {
      const adminClient = createClient(SUPABASE_URL, headerJwt, { auth: { persistSession: false } });
      const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) return true;
    } catch (_) {}
  }
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sbAnon.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

// Tabela de pricing OpenAI (US$ por mil tokens, simplificado)
// Pra conversao chave_uso -> custo, precisamos saber qual operacao
// Por enquanto usamos heuristica baseada no consumidor.
const PRICING_OPENAI_POR_USO: Record<string, number> = {
  // Custo medio estimado por invocacao da Edge Function
  'buscar-cerebro': 0.000005,        // 1 embedding
  'gerar-persona': 0.05,              // gpt-4o-mini com 30 fontes
  'ingest-pacote': 0.10,              // medio: classificacao + embedding + as vezes Whisper/Vision
  'ingest-url': 0.02,                 // 1 fonte
  'revetorizar-fonte': 0.001,         // embedding de poucos chunks
  'ingest-engine-local': 0.05,        // varia muito
  'smoke-test': 0,
  'teste-local': 0,
  'desconhecido': 0,
};

async function agregarDia(c: any, dia: string) {
  const stats = {
    dia,
    fontes_ingest_lotes: 0,
    fontes_chave_uso: 0,
    fontes_banco: 0,
    custos_inseridos: 0,
  };

  // 1. Custo OpenAI dos ingest_lotes do dia
  const { data: lotes } = await c.from('ingest_lotes')
    .select('custo_usd, criado_em, finalizado_em')
    .gte('criado_em', `${dia}T00:00:00Z`)
    .lt('criado_em', `${dia}T23:59:59Z`);
  const custoLotes = (lotes || []).reduce((s: number, l: any) => s + Number(l.custo_usd || 0), 0);
  if (custoLotes > 0) {
    await c.from('custos_diarios').upsert({
      dia,
      provedor: 'OpenAI',
      operacao: 'ingest-engine',
      custo_usd: custoLotes,
      qtd_eventos: (lotes || []).length,
      metadata: { fonte: 'ingest_lotes' },
    }, { onConflict: 'dia,provedor,operacao' });
    stats.custos_inseridos++;
  }
  stats.fontes_ingest_lotes = (lotes || []).length;

  // 2. Custo OpenAI estimado do chave_uso do dia (sucessos OPENAI_API_KEY)
  const { data: usos } = await c.from('chave_uso')
    .select('consumidor, sucesso')
    .eq('chave_nome', 'OPENAI_API_KEY')
    .eq('sucesso', true)
    .gte('criado_em', `${dia}T00:00:00Z`)
    .lt('criado_em', `${dia}T23:59:59Z`);

  // Agrupa por consumidor pra calcular custo estimado
  const porConsumidor: Record<string, number> = {};
  (usos || []).forEach((u: any) => {
    porConsumidor[u.consumidor] = (porConsumidor[u.consumidor] || 0) + 1;
  });

  for (const [consumidor, qtd] of Object.entries(porConsumidor)) {
    // Pula consumidores ja contabilizados via ingest_lotes (evita double count)
    if (consumidor === 'ingest-pacote' || consumidor === 'ingest-url') continue;
    const custoUnit = PRICING_OPENAI_POR_USO[consumidor] ?? 0;
    if (custoUnit === 0) continue;
    const custoEstimado = qtd * custoUnit;
    await c.from('custos_diarios').upsert({
      dia,
      provedor: 'OpenAI',
      operacao: consumidor,
      custo_usd: custoEstimado,
      qtd_eventos: qtd,
      metadata: { fonte: 'chave_uso', custo_unitario: custoUnit, estimado: true },
    }, { onConflict: 'dia,provedor,operacao' });
    stats.custos_inseridos++;
  }
  stats.fontes_chave_uso = (usos || []).length;

  // 3. Apify (e outras integracoes externas) — diff diario do custo_acumulado
  // Nao temos timestamp por chamada, so o acumulado. Pra rateio por dia,
  // pegamos o delta entre o acumulado do dia anterior (registrado em metadata)
  // e o acumulado atual. Se for primeira vez, registra o acumulado todo no dia atual.
  const { data: integracoes } = await c.from('integracoes')
    .select('slug, custo_acumulado_usd, total_chamadas, ultimo_uso')
    .gt('custo_acumulado_usd', 0);

  for (const integ of (integracoes || [])) {
    // So contabiliza no dia em que a integracao foi efetivamente usada
    if (!integ.ultimo_uso) continue;
    const usoDia = new Date(integ.ultimo_uso).toISOString().slice(0, 10);
    if (usoDia !== dia) continue;

    // Pega ultima entrada da integracao em custos_diarios pra calcular delta
    const { data: anteriores } = await c.from('custos_diarios')
      .select('metadata')
      .eq('provedor', integ.slug === 'apify' ? 'Apify' : integ.slug)
      .eq('operacao', 'integracao')
      .lt('dia', dia)
      .order('dia', { ascending: false })
      .limit(1);
    const acumuladoAnterior = Number(anteriores?.[0]?.metadata?.acumulado_usd || 0);
    const acumuladoAtual = Number(integ.custo_acumulado_usd || 0);
    const deltaDia = Math.max(0, acumuladoAtual - acumuladoAnterior);

    if (deltaDia > 0) {
      await c.from('custos_diarios').upsert({
        dia,
        provedor: integ.slug === 'apify' ? 'Apify' : integ.slug,
        operacao: 'integracao',
        custo_usd: deltaDia,
        qtd_eventos: integ.total_chamadas,
        metadata: { acumulado_usd: acumuladoAtual, fonte: 'integracoes' },
      }, { onConflict: 'dia,provedor,operacao' });
      stats.custos_inseridos++;
    }
  }

  // 4. Banco Supabase Pro: US$ 25/mes fixo, rateado por dia
  // Pega o snapshot mais recente do dia pra mostrar % usado
  const { data: bancoMetric } = await c.from('banco_metricas')
    .select('tamanho_bytes, criado_em')
    .gte('criado_em', `${dia}T00:00:00Z`)
    .lt('criado_em', `${dia}T23:59:59Z`)
    .order('criado_em', { ascending: false })
    .limit(1);

  // Plano Pro Supabase: US$ 25/mes (assinatura + 8GB DB + 100GB egress + 50GB storage incluidos)
  // Rateio diario = 25 / dias do mes
  const SUPABASE_PRO_USD_MES = 25;
  const dataDia = new Date(`${dia}T12:00:00Z`);
  const diasNoMes = new Date(dataDia.getFullYear(), dataDia.getMonth() + 1, 0).getDate();
  const custoSupabaseDia = SUPABASE_PRO_USD_MES / diasNoMes;

  // Limites do plano Pro pra projecao (db_size, file_storage, etc)
  const PLANO_DB_LIMITE_BYTES = 8 * 1024 * 1024 * 1024;
  const tamanhoBytes = bancoMetric?.[0]?.tamanho_bytes ? Number(bancoMetric[0].tamanho_bytes) : 0;
  const pctPlano = PLANO_DB_LIMITE_BYTES > 0 ? (tamanhoBytes / PLANO_DB_LIMITE_BYTES) * 100 : 0;

  await c.from('custos_diarios').upsert({
    dia,
    provedor: 'Supabase',
    operacao: 'banco',
    custo_usd: custoSupabaseDia,
    qtd_eventos: 1,
    metadata: {
      plano: 'Pro',
      mensalidade_usd: SUPABASE_PRO_USD_MES,
      dias_no_mes: diasNoMes,
      tamanho_bytes: tamanhoBytes,
      pct_db_incluido: pctPlano.toFixed(2),
    },
  }, { onConflict: 'dia,provedor,operacao' });
  stats.custos_inseridos++;
  stats.fontes_banco = 1;

  return stats;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  const ok = await requireAuth(req);
  if (!ok) return jsonResp({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const dias_atras: number = Number(body.dias_atras) || 0;

  const c = sb();
  const inicio = Date.now();
  const resultados: any[] = [];

  // Re-agrega ultimos N dias (default 1 = hoje + ontem)
  const N = Math.max(1, Math.min(30, dias_atras + 1));
  for (let i = 0; i < N; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dia = d.toISOString().slice(0, 10);
    try {
      const stats = await agregarDia(c, dia);
      resultados.push(stats);
    } catch (e) {
      resultados.push({ dia, erro: (e as Error).message });
    }
  }

  // Grava relatorio em seguranca_relatorios pro pilar Cyber tambem ver
  await c.from('seguranca_relatorios').insert({
    tipo: 'finops_diario',
    status: 'ok',
    resumo: `FinOps agregou ${N} dia(s). ${resultados.reduce((s, r) => s + (r.custos_inseridos || 0), 0)} entrada(s) inseridas/atualizadas.`,
    total_checks: N,
    total_falhas: resultados.filter(r => r.erro).length,
    detalhes: { resultados, duracao_ms: Date.now() - inicio },
  });

  return jsonResp({
    ok: true,
    duracao_ms: Date.now() - inicio,
    dias_processados: N,
    resultados,
  });
});
