// Edge: tool-plano-cerebros-snapshot
// GET /functions/v1/tool-plano-cerebros-snapshot
// GET /functions/v1/tool-plano-cerebros-snapshot?cerebro_id=<uuid>  (detalhe de 1)
//
// Retorna foto consolidada do Plano de Cerebros pro Mission Control renderizar:
//  - resumo (3 cards do topo)
//  - cerebros: lista 10 cérebros internos com status_carga, fontes, persona
//  - cerebro_detalhe (se cerebro_id passado): fontes cadastradas + planejadas + sugestoes
//  - integracoes_catalogo: cardapio pra cadastrar fonte nova

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Pra cada integracao do catalogo, gera sugestao automatica pra um cerebro produto.
// "Voce nao usa essa integracao, mas podia — daria pra alimentar com isso".
function sugestoesParaCerebro(produto_slug: string, integracoes: any[], fontesExistentes: Set<string>): any[] {
  const sugs: any[] = [];
  for (const integ of integracoes) {
    // Se sócio ja tem fonte por essa integracao, pula
    if (fontesExistentes.has(integ.slug)) continue;
    // Aplica heuristica de relevancia
    if (integ.slug === 'manual') continue; // manual sempre disponivel, nao precisa sugerir
    if (integ.slug.startsWith('supabase-')) {
      // Supabase externo só sugere se for do produto correspondente
      const slugProduto = integ.slug.replace('supabase-', '');
      if (slugProduto !== produto_slug) continue;
    }
    sugs.push({
      integracao_slug: integ.slug,
      nome: integ.nome,
      emoji: integ.emoji,
      categoria: integ.categoria,
      descricao: integ.descricao,
      exemplo_uso: integ.exemplo_uso,
      ativa: integ.ativa,
    });
  }
  return sugs;
}

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

    // 1) Lista cerebros via view
    const { data: cerebros, error: errC } = await sb
      .from('vw_plano_cerebros')
      .select('*');
    if (errC) throw new Error('view: ' + errC.message);

    // 2) Catalogo de integracoes
    const { data: integracoes, error: errI } = await sb
      .from('integracoes_catalogo')
      .select('*')
      .order('categoria, nome');
    if (errI) throw new Error('integracoes: ' + errI.message);

    // 3) Resumo do topo
    const total = (cerebros || []).length;
    const verde = (cerebros || []).filter((c: any) => c.status_carga === 'verde').length;
    const amarelo = (cerebros || []).filter((c: any) => c.status_carga === 'amarelo').length;
    const vermelho = (cerebros || []).filter((c: any) => c.status_carga === 'vermelho').length;

    // 4) Total de fontes planejadas em todos cerebros
    const totalPlanejadas = (cerebros || []).reduce((s: number, c: any) =>
      s + (Number(c.fontes_planejadas_mapeadas) || 0) + (Number(c.fontes_planejadas_rodando) || 0), 0);
    const totalRodando = (cerebros || []).reduce((s: number, c: any) =>
      s + (Number(c.fontes_planejadas_rodando) || 0), 0);

    const resumo = {
      total_cerebros: total,
      verde, amarelo, vermelho,
      fontes_planejadas_total: totalPlanejadas,
      fontes_planejadas_rodando: totalRodando,
      fontes_planejadas_pendentes: totalPlanejadas - totalRodando,
    };

    // 5) Se nao pediu detalhe, retorna lista
    if (!cerebro_id) {
      return jsonRespTool({
        ok: true,
        resumo,
        cerebros,
        integracoes_catalogo: integracoes,
      });
    }

    // 6) Detalhe de UM cerebro
    const cerebro = (cerebros || []).find((c: any) => c.cerebro_id === cerebro_id);
    if (!cerebro) return jsonRespTool({ ok: false, erro: 'cerebro nao encontrado' }, 404);

    // Fontes cadastradas (cerebro_fontes)
    const { data: fontesCadastradas } = await sb
      .from('cerebro_fontes')
      .select('id, tipo, titulo, origem, autor, url, criado_em, ingest_status')
      .eq('cerebro_id', cerebro_id)
      .order('criado_em', { ascending: false })
      .limit(100);

    // Fontes planejadas (cerebro_fontes_planejadas)
    const { data: fontesPlanejadas } = await sb
      .from('cerebro_fontes_planejadas')
      .select('id, integracao_slug, tipo_fonte, titulo, descricao, url_origem, status, prioridade, proposta_cron, cron_descricao, observacoes, criado_em')
      .eq('cerebro_id', cerebro_id)
      .order('prioridade', { ascending: false })
      .order('criado_em', { ascending: false });

    // Quais integracoes ele JA usa
    const slugsUsados = new Set<string>();
    for (const f of fontesPlanejadas || []) {
      if (f.integracao_slug) slugsUsados.add(f.integracao_slug);
    }
    // tipo "origem" das cerebro_fontes nao casa 1:1 com slug — sao manuais. Nao popula slugsUsados deles.

    // Sugestoes (integracoes que nao foram cadastradas como planejada ainda)
    const sugestoes = sugestoesParaCerebro(cerebro.produto_slug, integracoes || [], slugsUsados);

    return jsonRespTool({
      ok: true,
      resumo,
      cerebro,
      fontes_cadastradas: fontesCadastradas || [],
      fontes_planejadas: fontesPlanejadas || [],
      sugestoes,
      integracoes_catalogo: integracoes,
    });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
