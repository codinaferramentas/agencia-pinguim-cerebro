-- ============================================================
-- V2.15 Fase 3 — FinOps por Job (workflow Alan)
-- ============================================================
-- Adiciona tracking de custo de token nos jobs P-V-E.
-- Schema híbrido:
--   - pinguim.agente_execucoes ganha job_id (link granular Planner/Executor -> Job)
--   - pinguim.jobs ganha agregação cacheada (custo_total_usd, tokens_total)
--
-- Granular fica em agente_execucoes (já alimenta finops.tokens_ia_mes).
-- Agregado fica em jobs (query rápida pra listagem).
-- ============================================================

-- 1) FK opcional de agente_execucoes -> jobs
ALTER TABLE pinguim.agente_execucoes
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES pinguim.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agente_execucoes_job_idx
  ON pinguim.agente_execucoes (job_id)
  WHERE job_id IS NOT NULL;

-- 2) Agregação cacheada em jobs
ALTER TABLE pinguim.jobs
  ADD COLUMN IF NOT EXISTS planner_custo_usd numeric,
  ADD COLUMN IF NOT EXISTS planner_tokens_in integer,
  ADD COLUMN IF NOT EXISTS planner_tokens_out integer,
  ADD COLUMN IF NOT EXISTS planner_duracao_ms integer,
  ADD COLUMN IF NOT EXISTS executor_custo_usd numeric,
  ADD COLUMN IF NOT EXISTS executor_tokens_in integer,
  ADD COLUMN IF NOT EXISTS executor_tokens_out integer,
  ADD COLUMN IF NOT EXISTS executor_duracao_ms integer;

-- View agregada conveniente — soma planner + executor por job
CREATE OR REPLACE VIEW pinguim.jobs_custo AS
SELECT
  j.id,
  j.cliente_id,
  j.canal_origem,
  j.tipo_pedido,
  j.status,
  j.criado_em,
  j.concluido_em,
  COALESCE(j.planner_custo_usd, 0) + COALESCE(j.executor_custo_usd, 0) AS custo_total_usd,
  COALESCE(j.planner_tokens_in, 0)  + COALESCE(j.executor_tokens_in, 0)  AS tokens_in_total,
  COALESCE(j.planner_tokens_out, 0) + COALESCE(j.executor_tokens_out, 0) AS tokens_out_total,
  COALESCE(j.planner_duracao_ms, 0) + COALESCE(j.executor_duracao_ms, 0) AS duracao_total_ms,
  j.planner_custo_usd,
  j.executor_custo_usd,
  j.briefing_resumo
FROM pinguim.jobs j;

-- 3) Confere
SELECT 'pinguim.agente_execucoes.job_id OK' AS status
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema='pinguim' AND table_name='agente_execucoes' AND column_name='job_id'
);

SELECT 'pinguim.jobs cost columns OK' AS status
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema='pinguim' AND table_name='jobs' AND column_name='executor_custo_usd'
);

SELECT 'view pinguim.jobs_custo OK' AS status
WHERE EXISTS (
  SELECT 1 FROM information_schema.views
   WHERE table_schema='pinguim' AND table_name='jobs_custo'
);
