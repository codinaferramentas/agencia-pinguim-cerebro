// Edge: tool-plano-cerebros-snapshot
// GET /functions/v1/tool-plano-cerebros-snapshot
// GET /functions/v1/tool-plano-cerebros-snapshot?cerebro_id=<uuid>  (detalhe de 1)
//
// V2 (2026-06-15) — layout Kanban:
// - Lista de cerebros vem com contagens das 3 colunas (atuais/a_incluir/automatizar)
// - Detalhe de 1 cerebro retorna fontes ja agrupadas por coluna do Kanban
// - Catalogo de integracoes vem com descricao_equipe + flag cofre_tem_chaves
// - REMOVIDO bloco "sugestoes" (Andre cravou: sem invencao)

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

    // 1) Lista cerebros via view
    const { data: cerebros, error: errC } = await sb
      .from('vw_plano_cerebros')
      .select('*');
    if (errC) throw new Error('view: ' + errC.message);

    // 2) Catalogo de integracoes + verifica cofre
    const { data: integracoes, error: errI } = await sb
      .from('integracoes_catalogo')
      .select('*')
      .order('categoria, nome');
    if (errI) throw new Error('integracoes: ' + errI.message);

    // 2b) Checa cofre — pra cada integracao, ver se TODAS chaves estao no cofre
    const { data: cofreRows } = await sb
      .from('cofre_chaves')
      .select('nome')
      .eq('ativo', true);
    const chavesNoCofre = new Set((cofreRows || []).map((r: any) => r.nome));
    const integracoesComStatus = (integracoes || []).map((i: any) => {
      const chaves = (i.cofre_chaves || []) as string[];
      const todasNoCofre = chaves.length === 0 ? true : chaves.every(k => chavesNoCofre.has(k));
      return { ...i, cofre_ok: todasNoCofre };
    });

    // 3) Resumo do topo
    const total = (cerebros || []).length;
    const verde = (cerebros || []).filter((c: any) => c.status_carga === 'verde').length;
    const amarelo = (cerebros || []).filter((c: any) => c.status_carga === 'amarelo').length;
    const vermelho = (cerebros || []).filter((c: any) => c.status_carga === 'vermelho').length;

    // 4) Total de fontes mapeadas pra automacao em todos cerebros
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
        integracoes_catalogo: integracoesComStatus,
      });
    }

    // 6) Detalhe de UM cerebro
    const cerebro = (cerebros || []).find((c: any) => c.cerebro_id === cerebro_id);
    if (!cerebro) return jsonRespTool({ ok: false, erro: 'cerebro nao encontrado' }, 404);

    // 6a) Coluna 1 do Kanban — Fontes Atuais (cerebro_fontes ja vetorizadas)
    const { data: fontesAtuais } = await sb
      .from('cerebro_fontes')
      .select('id, tipo, titulo, origem, autor, url, criado_em, ingest_status')
      .eq('cerebro_id', cerebro_id)
      .order('criado_em', { ascending: false });

    // 6b) Coluna 2 (A Incluir) + Coluna 3 (Automatizar) — cerebro_fontes_planejadas separadas por status
    const { data: fontesPlanejadas } = await sb
      .from('cerebro_fontes_planejadas')
      .select('id, integracao_slug, tipo_fonte, titulo, descricao, url_origem, status, prioridade, proposta_cron, cron_descricao, observacoes, documentacao_automacao, criado_em, atualizado_em')
      .eq('cerebro_id', cerebro_id)
      .order('prioridade', { ascending: false })
      .order('criado_em', { ascending: false });

    const fontesAIncluir = (fontesPlanejadas || []).filter((f: any) => f.status === 'mapeada');
    const fontesAutomatizar = (fontesPlanejadas || []).filter((f: any) => ['em_construcao', 'rodando', 'pausada'].includes(f.status));

    return jsonRespTool({
      ok: true,
      resumo,
      cerebro,
      kanban: {
        atuais: fontesAtuais || [],
        a_incluir: fontesAIncluir,
        automatizar: fontesAutomatizar,
      },
      integracoes_catalogo: integracoesComStatus,
    });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
