-- ============================================================
-- schema-027 — Cadencia + Modo de disparo (2026-06-18 noite)
-- ============================================================
-- Feedback Andre: matriz precisa de 6 cadencias x 2 modos (A/M).
-- Regra clara: "Se voce precisa fazer algo TODA VEZ, eh manual.
--               Se dispara sozinho ou por terceiro, eh automatico."
--
-- 2 colunas novas em cerebro_plano_categoria:
--   - cadencia: 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'tempo_real' | 'sem_cadencia'
--   - modo_disparo: 'automatico' | 'manual'
--
-- Banco eh fonte unica da verdade. Matriz le DIRETO do banco.
-- ============================================================

-- 1) ENUMs (em pinguim pra nao poluir public)
DO $$ BEGIN
  CREATE TYPE pinguim.cadencia_t AS ENUM ('diario','semanal','quinzenal','mensal','tempo_real','sem_cadencia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pinguim.modo_disparo_t AS ENUM ('automatico','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Colunas em cerebro_plano_categoria
ALTER TABLE pinguim.cerebro_plano_categoria
  ADD COLUMN IF NOT EXISTS cadencia pinguim.cadencia_t,
  ADD COLUMN IF NOT EXISTS modo_disparo pinguim.modo_disparo_t;

COMMENT ON COLUMN pinguim.cerebro_plano_categoria.cadencia IS
  'Com que frequencia roda. Visivel na matriz Produto x Frequencia.';
COMMENT ON COLUMN pinguim.cerebro_plano_categoria.modo_disparo IS
  'Quem dispara: automatico (cron/webhook/terceiro) ou manual (voce precisa subir arquivo/URL toda vez).';

-- 3) Popular dados existentes com base na regra:
--    - cron com dow=* -> diario
--    - cron com dow especifico -> semanal
--    - webhook (terceiro dispara) -> tempo_real / automatico
--    - evento_auto/manual onde voce sobe arquivo/URL -> sem_cadencia / manual
--    - cron sem dow -> assume diario

UPDATE pinguim.cerebro_plano_categoria SET
  cadencia = CASE
    -- Sem cron + manual -> sem cadencia
    WHEN trigger_tipo IN ('manual','evento_auto','evento_avisar') AND schedule_cron IS NULL THEN 'sem_cadencia'::pinguim.cadencia_t
    -- Webhook -> tempo real
    WHEN trigger_tipo = 'webhook' THEN 'tempo_real'::pinguim.cadencia_t
    -- Cron com dow=* -> diario
    WHEN trigger_tipo = 'cron' AND split_part(schedule_cron, ' ', 5) = '*' THEN 'diario'::pinguim.cadencia_t
    -- Cron com dia do mes especifico mas dow=* -> mensal/quinzenal
    WHEN trigger_tipo = 'cron' AND split_part(schedule_cron, ' ', 3) = '1' AND split_part(schedule_cron, ' ', 5) = '*' THEN 'mensal'::pinguim.cadencia_t
    WHEN trigger_tipo = 'cron' AND split_part(schedule_cron, ' ', 3) = '1,15' THEN 'quinzenal'::pinguim.cadencia_t
    -- Cron com dow especifico -> semanal
    WHEN trigger_tipo = 'cron' AND split_part(schedule_cron, ' ', 5) ~ '^[0-9]' THEN 'semanal'::pinguim.cadencia_t
    -- Default
    ELSE 'sem_cadencia'::pinguim.cadencia_t
  END,
  modo_disparo = CASE
    -- Manual explicito
    WHEN trigger_tipo = 'manual' THEN 'manual'::pinguim.modo_disparo_t
    -- "evento_auto" com descricao que cita "upload no Drive" OU "URL YouTube" -> voce sobe -> MANUAL
    WHEN trigger_tipo IN ('evento_auto','evento_avisar') AND (
      schedule_descricao ILIKE '%upload no Drive%' OR
      schedule_descricao ILIKE '%URL YouTube%' OR
      schedule_descricao ILIKE '%subir arquivo%' OR
      schedule_descricao ILIKE '%subir URL%' OR
      schedule_descricao ILIKE '%cola URL%' OR
      schedule_descricao ILIKE '%aceita URL%'
    ) THEN 'manual'::pinguim.modo_disparo_t
    -- Webhook (disparado por terceiro, ex: aluno preenche YA Forms) -> automatico
    WHEN trigger_tipo = 'webhook' THEN 'automatico'::pinguim.modo_disparo_t
    -- Cron -> automatico
    WHEN trigger_tipo = 'cron' THEN 'automatico'::pinguim.modo_disparo_t
    -- Resto
    ELSE 'manual'::pinguim.modo_disparo_t
  END
WHERE status_automacao = 'rodando' AND (cadencia IS NULL OR modo_disparo IS NULL);

-- 4) Atualiza a RPC da matriz pra devolver essas 2 colunas
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
  WHERE cpc.status_automacao = 'rodando'
    AND p.nome IN ('Lo-fi Desafio','Elo','Proalt','Lyra','Orion','Taurus',
                   'Low Ticket Desafio','Mentoria Express','365 Roteiros validados','Analise de Perfil');
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_automacao_matriz() TO anon, authenticated;
