-- ============================================================
-- schema-025 — Motor central + limpeza painel automacao (2026-06-18)
-- ============================================================
-- Fix do dashboard:
--   1) Adiciona coluna `motor_unico` em cerebro_categorias_catalogo
--      → marca depoimentos (motor Discord central distribui pros N)
--   2) Refatora painel_automacao_proximos_crons:
--      - REMOVE relatorios_config (vai virar sidebar 'Agendamentos de Relatorio')
--      - AGRUPA categorias com motor_unico=true em 1 linha so
--        (com qtd_cerebros_alvo pra UI mostrar "distribui pra N cerebros")
-- ============================================================

-- 1) Coluna nova no catalogo
ALTER TABLE pinguim.cerebro_categorias_catalogo
  ADD COLUMN IF NOT EXISTS motor_unico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pinguim.cerebro_categorias_catalogo.motor_unico IS
  'Quando true: existe 1 motor central que roda 1x e distribui resultado pros N cerebros que tem essa categoria. UI agrega em 1 linha so no painel.';

-- 2) Marca depoimentos como motor unico (Discord #depoimentos -> classificador central)
UPDATE pinguim.cerebro_categorias_catalogo
   SET motor_unico = true
 WHERE slug = 'depoimentos';

-- 3) Refatora a RPC: tira relatorios, agrupa motor_unico
DROP FUNCTION IF EXISTS pinguim.painel_automacao_proximos_crons();

CREATE OR REPLACE FUNCTION pinguim.painel_automacao_proximos_crons()
RETURNS TABLE (
  origem text,                  -- 'categoria' ou 'motor_central'
  produto_nome text,            -- nome do produto OU '— motor central distribui'
  nome text,                    -- emoji + nome da categoria
  cron_descricao text,
  cron_expr text,
  trigger_tipo text,
  ultima_execucao timestamptz,
  ultimo_status text,
  qtd_cerebros_alvo int         -- 1 para categoria normal, N para motor_central
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
    WHERE cpc.status_automacao = 'rodando'
      AND cpc.trigger_tipo IN ('cron','evento_auto','evento_avisar','webhook')
      AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                     'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil')
  )
  -- Categorias normais (1 linha por cerebro)
  SELECT
    'categoria'::text AS origem,
    produto_nome,
    emoji || ' ' || cat_nome AS nome,
    schedule_descricao AS cron_descricao,
    schedule_cron AS cron_expr,
    trigger_tipo,
    ultima_execucao,
    ultimo_status_run AS ultimo_status,
    1 AS qtd_cerebros_alvo
  FROM base
  WHERE motor_unico = false OR motor_unico IS NULL

  UNION ALL

  -- Motor central (1 linha agregando todos os cerebros que tem)
  SELECT
    'motor_central'::text AS origem,
    ('— distribui pra ' || count(*)::text || ' cerebros')::text AS produto_nome,
    emoji || ' ' || cat_nome AS nome,
    max(schedule_descricao) AS cron_descricao,
    max(schedule_cron) AS cron_expr,
    'cron_central'::text AS trigger_tipo,
    max(ultima_execucao) AS ultima_execucao,
    max(ultimo_status_run) AS ultimo_status,
    count(*)::int AS qtd_cerebros_alvo
  FROM base
  WHERE motor_unico = true
  GROUP BY categoria_slug, emoji, cat_nome

  ORDER BY origem, produto_nome, nome;
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_proximos_crons() TO anon, authenticated;
