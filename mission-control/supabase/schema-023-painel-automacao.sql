-- ============================================================
-- schema-023 — RPCs do Painel de Automação transversal (2026-06-18)
-- ============================================================
-- Visão "Como tá tudo agora, atravessando os 10 cérebros".
-- Responde: o que rodou hoje, o que vai rodar, o que tá parado.
-- Tudo agregado server-side pra UI ser rápida.
-- ============================================================

-- 1) KPIs transversais
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_kpis()
RETURNS TABLE (
  total_cerebros bigint,
  total_categorias_aplicaveis bigint,
  total_rodando bigint,
  total_manuais bigint,
  total_falhou_24h bigint,
  total_executou_24h bigint,
  total_defasadas_7d bigint,
  total_nao_aplicavel bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  WITH cers AS (
    SELECT c.id FROM pinguim.cerebros c
    JOIN pinguim.produtos p ON p.id = c.produto_id
    WHERE p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                     'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
  )
  SELECT
    (SELECT count(*)::bigint FROM cers) AS total_cerebros,
    count(*) FILTER (WHERE cpc.status_automacao != 'nao_aplicavel')::bigint AS total_categorias_aplicaveis,
    count(*) FILTER (WHERE cpc.status_automacao = 'rodando')::bigint AS total_rodando,
    count(*) FILTER (WHERE cpc.trigger_tipo = 'manual' AND cpc.status_automacao NOT IN ('nao_aplicavel','sem_coleta'))::bigint AS total_manuais,
    count(*) FILTER (WHERE cpc.ultimo_status_run = 'falha' AND cpc.ultima_execucao > now() - INTERVAL '24 hours')::bigint AS total_falhou_24h,
    count(*) FILTER (WHERE cpc.ultima_execucao > now() - INTERVAL '24 hours')::bigint AS total_executou_24h,
    count(*) FILTER (WHERE cpc.status_automacao = 'rodando' AND (cpc.ultima_execucao IS NULL OR cpc.ultima_execucao < now() - INTERVAL '7 days'))::bigint AS total_defasadas_7d,
    count(*) FILTER (WHERE cpc.status_automacao = 'nao_aplicavel')::bigint AS total_nao_aplicavel
  FROM pinguim.cerebro_plano_categoria cpc
  WHERE cpc.cerebro_id IN (SELECT id FROM cers);
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_kpis() TO anon, authenticated;

-- 2) Execuções recentes (24h ou janela arbitrária) — todos cérebros
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_execucoes_recentes(p_horas integer DEFAULT 24)
RETURNS TABLE (
  cerebro_id uuid,
  produto_nome text,
  categoria_slug text,
  categoria_emoji text,
  categoria_nome text,
  trigger_tipo text,
  ultima_execucao timestamptz,
  ultimo_status_run text,
  qtd_atual integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  SELECT
    c.id AS cerebro_id,
    p.nome AS produto_nome,
    cpc.categoria_slug,
    cat.emoji AS categoria_emoji,
    cat.nome AS categoria_nome,
    cpc.trigger_tipo,
    cpc.ultima_execucao,
    cpc.ultimo_status_run,
    (SELECT count(*)::int FROM pinguim.fontes_processadas fp
       WHERE fp.cerebro_id = c.id AND fp.categoria_slug = cpc.categoria_slug) AS qtd_atual
  FROM pinguim.cerebro_plano_categoria cpc
  JOIN pinguim.cerebros c ON c.id = cpc.cerebro_id
  JOIN pinguim.produtos p ON p.id = c.produto_id
  LEFT JOIN pinguim.cerebro_categorias_catalogo cat ON cat.slug = cpc.categoria_slug
  WHERE cpc.ultima_execucao IS NOT NULL
    AND cpc.ultima_execucao > now() - (p_horas || ' hours')::interval
    AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                   'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
  ORDER BY cpc.ultima_execucao DESC
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_execucoes_recentes(integer) TO anon, authenticated;

-- 3) Crons agendados (que vão rodar) — junta categorias automatizadas + relatorios_config
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_proximos_crons()
RETURNS TABLE (
  origem text,        -- 'categoria' ou 'relatorio'
  produto_nome text,
  nome text,
  cron_descricao text,
  cron_expr text,
  trigger_tipo text,
  ultima_execucao timestamptz,
  ultimo_status text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  -- Categorias de cérebros com cron
  SELECT
    'categoria'::text AS origem,
    p.nome AS produto_nome,
    cat.emoji || ' ' || cat.nome AS nome,
    cpc.schedule_descricao AS cron_descricao,
    cpc.schedule_cron AS cron_expr,
    cpc.trigger_tipo,
    cpc.ultima_execucao,
    cpc.ultimo_status_run AS ultimo_status
  FROM pinguim.cerebro_plano_categoria cpc
  JOIN pinguim.cerebros c ON c.id = cpc.cerebro_id
  JOIN pinguim.produtos p ON p.id = c.produto_id
  LEFT JOIN pinguim.cerebro_categorias_catalogo cat ON cat.slug = cpc.categoria_slug
  WHERE cpc.status_automacao = 'rodando'
    AND cpc.trigger_tipo IN ('cron','evento_auto','evento_avisar','webhook')
    AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                   'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')

  UNION ALL

  -- Relatórios agendados (Categoria F4)
  SELECT
    'relatorio'::text AS origem,
    '—'::text AS produto_nome,
    nome,
    cron_descricao,
    cron_expr,
    'cron'::text AS trigger_tipo,
    ultima_execucao,
    ultimo_status
  FROM pinguim.relatorios_config
  WHERE ativo = true

  ORDER BY produto_nome, nome;
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_proximos_crons() TO anon, authenticated;

-- 4) Alertas: categorias rodando mas sem update há +N dias OU manuais parados
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_alertas(p_dias integer DEFAULT 7)
RETURNS TABLE (
  tipo_alerta text,     -- 'rodando_defasada' | 'manual_sem_update' | 'cron_falhou'
  cerebro_id uuid,
  produto_nome text,
  categoria_slug text,
  categoria_emoji text,
  categoria_nome text,
  trigger_tipo text,
  ultima_execucao timestamptz,
  ultimo_status_run text,
  dias_desde_ultima int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  WITH base AS (
    SELECT
      c.id AS cerebro_id,
      p.nome AS produto_nome,
      cpc.categoria_slug,
      cat.emoji AS categoria_emoji,
      cat.nome AS categoria_nome,
      cpc.trigger_tipo,
      cpc.ultima_execucao,
      cpc.ultimo_status_run,
      cpc.status_automacao,
      EXTRACT(DAY FROM (now() - cpc.ultima_execucao))::int AS dias_desde_ultima
    FROM pinguim.cerebro_plano_categoria cpc
    JOIN pinguim.cerebros c ON c.id = cpc.cerebro_id
    JOIN pinguim.produtos p ON p.id = c.produto_id
    LEFT JOIN pinguim.cerebro_categorias_catalogo cat ON cat.slug = cpc.categoria_slug
    WHERE p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                     'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
  )
  SELECT * FROM (
    -- Cron rodando mas falhou no último run (severo)
    SELECT 'cron_falhou'::text AS tipo_alerta,
           cerebro_id, produto_nome, categoria_slug, categoria_emoji, categoria_nome,
           trigger_tipo, ultima_execucao, ultimo_status_run,
           COALESCE(dias_desde_ultima, 0) AS dias_desde_ultima
      FROM base
      WHERE status_automacao = 'rodando' AND ultimo_status_run = 'falha'
    UNION ALL
    -- Rodando mas defasado
    SELECT 'rodando_defasada'::text,
           cerebro_id, produto_nome, categoria_slug, categoria_emoji, categoria_nome,
           trigger_tipo, ultima_execucao, ultimo_status_run,
           COALESCE(dias_desde_ultima, 999)
      FROM base
      WHERE status_automacao = 'rodando'
        AND (ultima_execucao IS NULL OR ultima_execucao < now() - (p_dias || ' days')::interval)
    UNION ALL
    -- Manuais com ultima_execucao parada
    SELECT 'manual_sem_update'::text,
           cerebro_id, produto_nome, categoria_slug, categoria_emoji, categoria_nome,
           trigger_tipo, ultima_execucao, ultimo_status_run,
           COALESCE(dias_desde_ultima, 999)
      FROM base
      WHERE trigger_tipo = 'manual'
        AND status_automacao NOT IN ('nao_aplicavel','sem_coleta')
        AND (ultima_execucao IS NULL OR ultima_execucao < now() - (p_dias || ' days')::interval)
  ) u
  ORDER BY u.dias_desde_ultima DESC NULLS FIRST
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_alertas(integer) TO anon, authenticated;

-- 5) Resumo por cérebro (mini-grid)
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_por_cerebro()
RETURNS TABLE (
  cerebro_id uuid,
  produto_nome text,
  rodando int,
  manuais int,
  sem_coleta int,
  nao_aplicavel int,
  defasadas int,
  total_fontes int,
  ultima_atividade timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  SELECT
    c.id AS cerebro_id,
    p.nome AS produto_nome,
    count(*) FILTER (WHERE cpc.status_automacao = 'rodando')::int AS rodando,
    count(*) FILTER (WHERE cpc.trigger_tipo = 'manual' AND cpc.status_automacao NOT IN ('nao_aplicavel','sem_coleta'))::int AS manuais,
    count(*) FILTER (WHERE cpc.status_automacao = 'sem_coleta')::int AS sem_coleta,
    count(*) FILTER (WHERE cpc.status_automacao = 'nao_aplicavel')::int AS nao_aplicavel,
    count(*) FILTER (WHERE cpc.status_automacao = 'rodando' AND (cpc.ultima_execucao IS NULL OR cpc.ultima_execucao < now() - INTERVAL '7 days'))::int AS defasadas,
    (SELECT count(*)::int FROM pinguim.cerebro_fontes f WHERE f.cerebro_id = c.id AND f.ingest_status = 'ok') AS total_fontes,
    max(cpc.ultima_execucao) AS ultima_atividade
  FROM pinguim.cerebros c
  JOIN pinguim.produtos p ON p.id = c.produto_id
  LEFT JOIN pinguim.cerebro_plano_categoria cpc ON cpc.cerebro_id = c.id
  WHERE p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                   'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
  GROUP BY c.id, p.nome
  ORDER BY rodando DESC, p.nome;
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_por_cerebro() TO anon, authenticated;
