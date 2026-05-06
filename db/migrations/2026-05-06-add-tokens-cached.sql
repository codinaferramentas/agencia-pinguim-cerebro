-- ========================================================================
-- Migration: adiciona tokens_cached em agente_execucoes
-- ========================================================================
-- Prompt caching do OpenAI (automático pra prompts ≥1024 tokens) devolve
-- quantos tokens vieram do cache. Isso impacta custo (90% desconto no gpt-5).
-- Registramos pra FinOps saber quanto economizou.
-- ========================================================================

ALTER TABLE pinguim.agente_execucoes
  ADD COLUMN IF NOT EXISTS tokens_cached int DEFAULT 0;

COMMENT ON COLUMN pinguim.agente_execucoes.tokens_cached IS 'Tokens de input que vieram do prompt cache (desconto 90% gpt-5, 50% gpt-4o)';
