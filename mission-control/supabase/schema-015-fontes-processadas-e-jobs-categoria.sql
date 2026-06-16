-- ============================================================
-- schema-015-fontes-processadas-e-jobs-categoria.sql
-- ============================================================
-- 2026-06-16: infra de execucao de categorias
--
-- 1) Tabela pinguim.fontes_processadas — idempotencia
--    Marca quais arquivos externos (Drive file_id, WhatsApp msg_id, etc)
--    ja foram processados pra evitar retrabalho em "rodar agora" repetido.
--
-- 2) Coluna trigger_tipo em cerebro_plano_categoria
--    'manual' | 'cron' | 'webhook'
-- ============================================================

CREATE TABLE IF NOT EXISTS pinguim.fontes_processadas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id      uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  categoria_slug  text NOT NULL REFERENCES pinguim.cerebro_categorias_catalogo(slug) ON DELETE CASCADE,
  fonte_externa_id text NOT NULL,    -- ID no sistema de origem (Drive file_id, msg_id, etc)
  fonte_origem    text NOT NULL,     -- 'google_drive' | 'whatsapp_evolution' | etc
  cerebro_fonte_id uuid REFERENCES pinguim.cerebro_fontes(id) ON DELETE SET NULL,
  processado_em   timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb DEFAULT '{}'::jsonb,
  UNIQUE (cerebro_id, categoria_slug, fonte_origem, fonte_externa_id)
);

CREATE INDEX IF NOT EXISTS idx_fontes_processadas_lookup
  ON pinguim.fontes_processadas (cerebro_id, categoria_slug, fonte_origem);

COMMENT ON TABLE pinguim.fontes_processadas IS
  'V3 — Idempotencia de coleta. Marca quais fontes externas (file_id Drive, msg WhatsApp etc) ja foram ingeridas pra rodar workers idempotentes.';

-- Coluna trigger_tipo (manual/cron/webhook)
ALTER TABLE pinguim.cerebro_plano_categoria
  ADD COLUMN IF NOT EXISTS trigger_tipo text NOT NULL DEFAULT 'manual';
COMMENT ON COLUMN pinguim.cerebro_plano_categoria.trigger_tipo IS
  'Como a coleta dispara: manual (botao na UI) / cron (agendado) / webhook (evento externo)';

-- Atualiza view pra expor trigger_tipo (drop+create porque ordem de colunas mudou)
DROP VIEW IF EXISTS pinguim.vw_cerebro_plano_categoria;
CREATE VIEW pinguim.vw_cerebro_plano_categoria AS
SELECT
  p.id AS plano_id, p.cerebro_id, c.slug AS categoria_slug, c.nome AS categoria_nome,
  c.emoji AS categoria_emoji, c.descricao AS categoria_descricao, c.tipos_fonte AS categoria_tipos_fonte,
  c.ordem AS categoria_ordem, p.status_automacao, p.origem_configurada, p.schedule_cron,
  p.schedule_descricao, p.ferramenta, p.responsavel, p.ultima_execucao, p.ultimo_status_run,
  p.notas, p.prioridade, p.trigger_tipo,
  CASE
    WHEN c.slug = 'outros' THEN (
      SELECT count(*) FROM pinguim.cerebro_fontes f
      WHERE f.cerebro_id = p.cerebro_id
        AND NOT EXISTS (
          SELECT 1 FROM pinguim.cerebro_categorias_catalogo c2
          WHERE c2.slug <> 'outros' AND f.tipo = ANY(c2.tipos_fonte)
        )
    )
    WHEN cardinality(c.tipos_fonte) = 0 THEN 0
    ELSE (
      SELECT count(*) FROM pinguim.cerebro_fontes f
      WHERE f.cerebro_id = p.cerebro_id AND f.tipo = ANY(c.tipos_fonte)
    )
  END AS qtd_atual,
  CASE
    WHEN c.slug = 'outros' THEN (
      SELECT max(f.criado_em) FROM pinguim.cerebro_fontes f
      WHERE f.cerebro_id = p.cerebro_id
        AND NOT EXISTS (
          SELECT 1 FROM pinguim.cerebro_categorias_catalogo c2
          WHERE c2.slug <> 'outros' AND f.tipo = ANY(c2.tipos_fonte)
        )
    )
    WHEN cardinality(c.tipos_fonte) = 0 THEN NULL
    ELSE (
      SELECT max(f.criado_em) FROM pinguim.cerebro_fontes f
      WHERE f.cerebro_id = p.cerebro_id AND f.tipo = ANY(c.tipos_fonte)
    )
  END AS ultima_fonte_em,
  p.atualizado_em
FROM pinguim.cerebro_plano_categoria p
JOIN pinguim.cerebro_categorias_catalogo c ON c.slug = p.categoria_slug
ORDER BY p.cerebro_id, c.ordem;

GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.fontes_processadas TO service_role;
