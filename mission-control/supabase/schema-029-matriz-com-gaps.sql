-- ============================================================
-- schema-029 — Matriz inclui gaps (2026-06-18 noite finalissima)
-- ============================================================
-- Feedback Andre: matriz so mostrava 'rodando'. Faltava saber
-- "tenho cobertura COMPLETA nesse cerebro ou tem buraco?".
--
-- RPC agora devolve TODAS as categorias do plano (qualquer status,
-- exceto nao_aplicavel). UI separa em coluna GAP no fim pra
-- em_construcao / planejada / sem_coleta.
-- ============================================================

DROP FUNCTION IF EXISTS pinguim.painel_automacao_matriz();
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_matriz()
RETURNS TABLE (
  cerebro_id uuid,
  produto_nome text,
  produto_emoji text,
  categoria_slug text,
  categoria_nome text,
  categoria_emoji text,
  motor_unico boolean,
  status_automacao text,
  trigger_tipo text,
  schedule_cron text,
  schedule_descricao text,
  cadencia text,
  modo_disparo text,
  ultima_execucao timestamptz,
  ultimo_status_run text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  SELECT
    c.id AS cerebro_id,
    p.nome AS produto_nome,
    p.emoji AS produto_emoji,
    cpc.categoria_slug,
    cat.nome AS categoria_nome,
    cat.emoji AS categoria_emoji,
    COALESCE(cat.motor_unico, false) AS motor_unico,
    cpc.status_automacao,
    cpc.trigger_tipo,
    cpc.schedule_cron,
    cpc.schedule_descricao,
    COALESCE(cpc.cadencia::text, 'sem_cadencia') AS cadencia,
    COALESCE(cpc.modo_disparo::text, 'manual') AS modo_disparo,
    cpc.ultima_execucao,
    cpc.ultimo_status_run
  FROM pinguim.cerebro_plano_categoria cpc
  JOIN pinguim.cerebros c ON c.id = cpc.cerebro_id
  JOIN pinguim.produtos p ON p.id = c.produto_id
  LEFT JOIN pinguim.cerebro_categorias_catalogo cat ON cat.slug = cpc.categoria_slug
  WHERE cpc.status_automacao != 'nao_aplicavel'
    AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                   'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil');
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_matriz() TO anon, authenticated;
