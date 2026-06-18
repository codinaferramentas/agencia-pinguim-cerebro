-- ============================================================
-- schema-030 — Renomear status_automacao 'rodando' -> 'ativo' (2026-06-18 noite finalissima)
-- ============================================================
-- Feedback Andre: "rodando" da sensacao de "roda sozinho", mas varias
-- categorias marcadas rodando sao manuais (transcricao YouTube, aulas Elo).
-- Don Norman: vocabulario tem que refletir modelo mental, nao infra.
-- Tufte: visual nao pode produzir interpretacao falsa.
--
-- Solucao: rename 'rodando' -> 'ativo'. Sub-rotulo eh modo_disparo
-- (automatico OU manual) que ja existe desde schema-027.
--
-- Status final no sistema:
--   ativo + automatico → motor existe + roda sozinho (cron/webhook)
--   ativo + manual     → motor existe + voce dispara (sobe arquivo/URL)
--   em_construcao      → em implementacao
--   planejada          → decidida em reuniao, nao comecou
--   sem_coleta         → pendente discussao
--   nao_aplicavel      → nao faz sentido pro produto
-- ============================================================

-- 1) Renomear na tabela principal
UPDATE pinguim.cerebro_plano_categoria
   SET status_automacao = 'ativo'
 WHERE status_automacao = 'rodando';

-- 2) Recriar TODAS as RPCs do painel pra usar 'ativo'
-- (mantendo assinatura igual, so trocando o filtro WHERE)

-- 2.1) painel_automacao_kpis
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_kpis()
RETURNS TABLE (
  total_cerebros bigint,
  total_categorias_aplicaveis bigint,
  total_rodando bigint,           -- mantem nome do field pra UI nao quebrar
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
    count(*) FILTER (WHERE cpc.status_automacao = 'ativo')::bigint AS total_rodando,
    count(*) FILTER (WHERE cpc.trigger_tipo = 'manual' AND cpc.status_automacao NOT IN ('nao_aplicavel','sem_coleta'))::bigint AS total_manuais,
    count(*) FILTER (WHERE cpc.ultimo_status_run = 'falha' AND cpc.ultima_execucao > now() - INTERVAL '24 hours')::bigint AS total_falhou_24h,
    count(*) FILTER (WHERE cpc.ultima_execucao > now() - INTERVAL '24 hours')::bigint AS total_executou_24h,
    count(*) FILTER (WHERE cpc.status_automacao = 'ativo' AND (cpc.ultima_execucao IS NULL OR cpc.ultima_execucao < now() - INTERVAL '7 days'))::bigint AS total_defasadas_7d,
    count(*) FILTER (WHERE cpc.status_automacao = 'nao_aplicavel')::bigint AS total_nao_aplicavel
  FROM pinguim.cerebro_plano_categoria cpc
  WHERE cpc.cerebro_id IN (SELECT id FROM cers);
$$;

-- 2.2) painel_automacao_execucoes_recentes
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

-- 2.3) painel_automacao_proximos_crons (schema-025 — agrupando motor central)
DROP FUNCTION IF EXISTS pinguim.painel_automacao_proximos_crons();
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_proximos_crons()
RETURNS TABLE (
  origem text,
  produto_nome text,
  nome text,
  cron_descricao text,
  cron_expr text,
  trigger_tipo text,
  ultima_execucao timestamptz,
  ultimo_status text,
  qtd_cerebros_alvo int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  WITH base AS (
    SELECT
      cpc.categoria_slug,
      cat.emoji,
      cat.nome AS cat_nome,
      cat.motor_unico,
      p.nome AS produto_nome,
      cpc.schedule_descricao,
      cpc.schedule_cron,
      cpc.trigger_tipo,
      cpc.ultima_execucao,
      cpc.ultimo_status_run
    FROM pinguim.cerebro_plano_categoria cpc
    JOIN pinguim.cerebros c ON c.id = cpc.cerebro_id
    JOIN pinguim.produtos p ON p.id = c.produto_id
    LEFT JOIN pinguim.cerebro_categorias_catalogo cat ON cat.slug = cpc.categoria_slug
    WHERE cpc.status_automacao = 'ativo'
      AND cpc.trigger_tipo IN ('cron','evento_auto','evento_avisar','webhook')
      AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                     'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
  )
  SELECT
    'categoria'::text AS origem, produto_nome,
    emoji || ' ' || cat_nome AS nome,
    schedule_descricao AS cron_descricao, schedule_cron AS cron_expr,
    trigger_tipo, ultima_execucao, ultimo_status_run AS ultimo_status,
    1 AS qtd_cerebros_alvo
  FROM base WHERE motor_unico = false OR motor_unico IS NULL
  UNION ALL
  SELECT
    'motor_central'::text, ('— distribui pra ' || count(*)::text || ' cerebros')::text,
    emoji || ' ' || cat_nome, max(schedule_descricao), max(schedule_cron),
    'cron_central'::text, max(ultima_execucao), max(ultimo_status_run),
    count(*)::int
  FROM base WHERE motor_unico = true
  GROUP BY categoria_slug, emoji, cat_nome
  ORDER BY origem, produto_nome, nome;
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_proximos_crons() TO anon, authenticated;

-- 2.4) painel_automacao_alertas
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_alertas(p_dias integer DEFAULT 7)
RETURNS TABLE (
  tipo_alerta text, cerebro_id uuid, produto_nome text, categoria_slug text,
  categoria_emoji text, categoria_nome text, trigger_tipo text,
  ultima_execucao timestamptz, ultimo_status_run text, dias_desde_ultima int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  WITH base AS (
    SELECT c.id AS cerebro_id, p.nome AS produto_nome, cpc.categoria_slug,
           cat.emoji AS categoria_emoji, cat.nome AS categoria_nome,
           cpc.trigger_tipo, cpc.ultima_execucao, cpc.ultimo_status_run, cpc.status_automacao,
           EXTRACT(DAY FROM (now() - cpc.ultima_execucao))::int AS dias_desde_ultima
      FROM pinguim.cerebro_plano_categoria cpc
      JOIN pinguim.cerebros c ON c.id = cpc.cerebro_id
      JOIN pinguim.produtos p ON p.id = c.produto_id
      LEFT JOIN pinguim.cerebro_categorias_catalogo cat ON cat.slug = cpc.categoria_slug
     WHERE p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                      'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
  )
  SELECT * FROM (
    SELECT 'cron_falhou'::text AS tipo_alerta, cerebro_id, produto_nome, categoria_slug,
           categoria_emoji, categoria_nome, trigger_tipo, ultima_execucao, ultimo_status_run,
           COALESCE(dias_desde_ultima, 0) AS dias_desde_ultima
      FROM base WHERE status_automacao = 'ativo' AND ultimo_status_run = 'falha'
    UNION ALL
    SELECT 'rodando_defasada'::text, cerebro_id, produto_nome, categoria_slug,
           categoria_emoji, categoria_nome, trigger_tipo, ultima_execucao, ultimo_status_run,
           COALESCE(dias_desde_ultima, 999)
      FROM base WHERE status_automacao = 'ativo'
        AND (ultima_execucao IS NULL OR ultima_execucao < now() - (p_dias || ' days')::interval)
    UNION ALL
    SELECT 'manual_sem_update'::text, cerebro_id, produto_nome, categoria_slug,
           categoria_emoji, categoria_nome, trigger_tipo, ultima_execucao, ultimo_status_run,
           COALESCE(dias_desde_ultima, 999)
      FROM base WHERE trigger_tipo = 'manual'
        AND status_automacao NOT IN ('nao_aplicavel','sem_coleta')
        AND (ultima_execucao IS NULL OR ultima_execucao < now() - (p_dias || ' days')::interval)
  ) u
  ORDER BY u.dias_desde_ultima DESC NULLS FIRST
  LIMIT 100;
$$;

-- 2.5) painel_automacao_por_cerebro
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_por_cerebro()
RETURNS TABLE (
  cerebro_id uuid, produto_nome text, rodando int, manuais int,
  sem_coleta int, nao_aplicavel int, defasadas int,
  total_fontes int, ultima_atividade timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  SELECT
    c.id AS cerebro_id, p.nome AS produto_nome,
    count(*) FILTER (WHERE cpc.status_automacao = 'ativo')::int AS rodando,
    count(*) FILTER (WHERE cpc.trigger_tipo = 'manual' AND cpc.status_automacao NOT IN ('nao_aplicavel','sem_coleta'))::int AS manuais,
    count(*) FILTER (WHERE cpc.status_automacao = 'sem_coleta')::int AS sem_coleta,
    count(*) FILTER (WHERE cpc.status_automacao = 'nao_aplicavel')::int AS nao_aplicavel,
    count(*) FILTER (WHERE cpc.status_automacao = 'ativo' AND (cpc.ultima_execucao IS NULL OR cpc.ultima_execucao < now() - INTERVAL '7 days'))::int AS defasadas,
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

-- 2.6) painel_automacao_matriz (mantem comportamento — retorna 'ativo' agora)
DROP FUNCTION IF EXISTS pinguim.painel_automacao_matriz();
CREATE OR REPLACE FUNCTION pinguim.painel_automacao_matriz()
RETURNS TABLE (
  cerebro_id uuid, produto_nome text, produto_emoji text,
  categoria_slug text, categoria_nome text, categoria_emoji text,
  motor_unico boolean, status_automacao text, trigger_tipo text,
  schedule_cron text, schedule_descricao text, cadencia text,
  modo_disparo text, ultima_execucao timestamptz, ultimo_status_run text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  SELECT
    c.id, p.nome, p.emoji,
    cpc.categoria_slug, cat.nome, cat.emoji,
    COALESCE(cat.motor_unico, false),
    cpc.status_automacao, cpc.trigger_tipo,
    cpc.schedule_cron, cpc.schedule_descricao,
    COALESCE(cpc.cadencia::text, 'sem_cadencia'),
    COALESCE(cpc.modo_disparo::text, 'manual'),
    cpc.ultima_execucao, cpc.ultimo_status_run
  FROM pinguim.cerebro_plano_categoria cpc
  JOIN pinguim.cerebros c ON c.id = cpc.cerebro_id
  JOIN pinguim.produtos p ON p.id = c.produto_id
  LEFT JOIN pinguim.cerebro_categorias_catalogo cat ON cat.slug = cpc.categoria_slug
  WHERE cpc.status_automacao != 'nao_aplicavel'
    AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                   'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil');
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_matriz() TO anon, authenticated;

-- 3) Corrigir descricao do card Aulas Elo (era mentiroso: dizia "automatico via detector hibrido 10min")
UPDATE pinguim.cerebro_plano_categoria
   SET schedule_descricao = 'Manual. Quando você sobe arquivo no Drive OU cola URL YouTube no botão, sistema transcreve e ingere automaticamente.',
       trigger_tipo = 'manual'
 WHERE categoria_slug = 'aulas'
   AND cerebro_id IN (
     SELECT c.id FROM pinguim.cerebros c
       JOIN pinguim.produtos p ON p.id = c.produto_id
      WHERE p.nome = 'Elo'
   );
