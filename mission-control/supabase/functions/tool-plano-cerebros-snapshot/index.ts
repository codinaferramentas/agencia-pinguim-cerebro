// Edge: tool-plano-cerebros-snapshot
// V3 (2026-06-16) — virada arquitetural:
// Unidade fundamental agora eh CATEGORIA (catalogo fixo), nao fonte individual.
//
// GET /functions/v1/tool-plano-cerebros-snapshot
//   -> lista 10 cerebros + KPIs agregados por status_automacao + integracoes
// GET /functions/v1/tool-plano-cerebros-snapshot?cerebro_id=<uuid>
//   -> detalhe: plano por categoria (vw_cerebro_plano_categoria) + integracoes

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

  const url = new URL(req.url);
  const cerebro_id = url.searchParams.get('cerebro_id');

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      db: { schema: 'pinguim' },
    });

    // 1) Lista cerebros via view existente
    const { data: cerebros, error: errC } = await sb.from('vw_plano_cerebros').select('*');
    if (errC) throw new Error('view cerebros: ' + errC.message);

    // 2) Catalogo de integracoes + cofre check
    const { data: integracoes, error: errI } = await sb
      .from('integracoes_catalogo')
      .select('*')
      .order('categoria, nome');
    if (errI) throw new Error('integracoes: ' + errI.message);

    const { data: cofreRows } = await sb
      .from('cofre_chaves')
      .select('nome')
      .eq('ativo', true);
    const chavesNoCofre = new Set((cofreRows || []).map((r: any) => r.nome));
    const integracoesComStatus = (integracoes || []).map((i: any) => {
      const chaves = (i.cofre_chaves || []) as string[];
      const cofre_ok = chaves.length === 0 ? true : chaves.every((k) => chavesNoCofre.has(k));
      return { ...i, cofre_ok };
    });

    // 3) Para cada cerebro, garantir plano e contar status_automacao
    // Faz UMA query agregada por status pra todos os cerebros
    const { data: agreg } = await sb
      .from('vw_cerebro_plano_categoria')
      .select('cerebro_id, status_automacao');
    const porCerebro: Record<string, any> = {};
    for (const row of (agreg || []) as any[]) {
      if (!porCerebro[row.cerebro_id]) {
        porCerebro[row.cerebro_id] = { sem_coleta: 0, planejada: 0, em_construcao: 0, rodando: 0, pausada: 0, falhou: 0 };
      }
      porCerebro[row.cerebro_id][row.status_automacao] = (porCerebro[row.cerebro_id][row.status_automacao] || 0) + 1;
    }
    // Anexa nos cerebros + garante plano se nunca foi gerado
    const cerebrosOut: any[] = [];
    for (const c of (cerebros || []) as any[]) {
      const counts = porCerebro[c.cerebro_id];
      if (!counts && c.cerebro_id) {
        // Auto-popula plano na 1a abertura
        await sb.rpc('cerebro_plano_garantir', { p_cerebro_id: c.cerebro_id });
      }
      cerebrosOut.push({
        ...c,
        plano_counts: counts || { sem_coleta: 11, planejada: 0, em_construcao: 0, rodando: 0, pausada: 0, falhou: 0 },
      });
    }

    // 4) Resumo agregado global
    const totalSem = cerebrosOut.reduce((s, c) => s + (c.plano_counts?.sem_coleta || 0), 0);
    const totalPlan = cerebrosOut.reduce((s, c) => s + (c.plano_counts?.planejada || 0), 0);
    const totalCons = cerebrosOut.reduce((s, c) => s + (c.plano_counts?.em_construcao || 0), 0);
    const totalRod = cerebrosOut.reduce((s, c) => s + (c.plano_counts?.rodando || 0), 0);
    const totalPaus = cerebrosOut.reduce((s, c) => s + (c.plano_counts?.pausada || 0), 0);

    const resumo = {
      total_cerebros: cerebrosOut.length,
      categorias_sem_coleta: totalSem,
      categorias_planejadas: totalPlan,
      categorias_em_construcao: totalCons,
      categorias_rodando: totalRod,
      categorias_pausadas: totalPaus,
    };

    // 5) Se nao pediu detalhe, retorna lista
    if (!cerebro_id) {
      return jsonRespTool({
        ok: true,
        resumo,
        cerebros: cerebrosOut,
        integracoes_catalogo: integracoesComStatus,
      });
    }

    // 6) Detalhe: plano por categoria
    const cerebro = cerebrosOut.find((c) => c.cerebro_id === cerebro_id);
    if (!cerebro) return jsonRespTool({ ok: false, erro: 'cerebro nao encontrado' }, 404);

    // Garante plano (idempotente — se ja tem, NOOP)
    await sb.rpc('cerebro_plano_garantir', { p_cerebro_id: cerebro_id });

    const { data: plano } = await sb
      .from('vw_cerebro_plano_categoria')
      .select('*')
      .eq('cerebro_id', cerebro_id)
      .order('categoria_ordem');

    return jsonRespTool({
      ok: true,
      resumo,
      cerebro,
      plano: plano || [],
      integracoes_catalogo: integracoesComStatus,
    });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
