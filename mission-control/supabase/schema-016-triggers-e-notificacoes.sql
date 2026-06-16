-- ============================================================
-- schema-016-triggers-e-notificacoes.sql
-- ============================================================
-- 2026-06-16: matriz completa de triggers + notificacoes de pendencia
-- ============================================================

-- 1) Coluna origem_pasta_drive_id
ALTER TABLE pinguim.cerebro_plano_categoria
  ADD COLUMN IF NOT EXISTS origem_pasta_drive_id text;
COMMENT ON COLUMN pinguim.cerebro_plano_categoria.origem_pasta_drive_id IS
  'ID da pasta no Google Drive monitorada pelo detector hibrido (trigger_tipo evento_*)';

-- 2) Tabela notificacoes_pendentes (PRECISA EXISTIR antes da view)
CREATE TABLE IF NOT EXISTS pinguim.notificacoes_pendentes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id      uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  categoria_slug  text NOT NULL,
  tipo            text NOT NULL,
  titulo          text NOT NULL,
  descricao       text,
  payload         jsonb DEFAULT '{}'::jsonb,
  detectado_em    timestamptz NOT NULL DEFAULT now(),
  resolvido_em    timestamptz,
  resolvido_por   text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_pend_unique_ativa
  ON pinguim.notificacoes_pendentes (cerebro_id, categoria_slug, tipo, (payload->>'fonte_externa_id'))
  WHERE resolvido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_notificacoes_pend_busca
  ON pinguim.notificacoes_pendentes (cerebro_id, categoria_slug)
  WHERE resolvido_em IS NULL;

COMMENT ON TABLE pinguim.notificacoes_pendentes IS
  'V3 — Pendencias detectadas pelo detector hibrido (arquivo novo em pasta Drive monitorada, etc). UI mostra badge "X arquivo aguardando" no card da categoria.';

GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.notificacoes_pendentes TO service_role;
GRANT SELECT ON pinguim.notificacoes_pendentes TO anon, authenticated;

-- 3) Atualiza view incluindo origem_pasta_drive_id + pendencias_count
DROP VIEW IF EXISTS pinguim.vw_cerebro_plano_categoria;
CREATE VIEW pinguim.vw_cerebro_plano_categoria AS
SELECT
  p.id AS plano_id, p.cerebro_id, c.slug AS categoria_slug, c.nome AS categoria_nome,
  c.emoji AS categoria_emoji, c.descricao AS categoria_descricao, c.tipos_fonte AS categoria_tipos_fonte,
  c.ordem AS categoria_ordem, p.status_automacao, p.origem_configurada, p.origem_pasta_drive_id,
  p.schedule_cron, p.schedule_descricao, p.ferramenta, p.responsavel, p.ultima_execucao,
  p.ultimo_status_run, p.notas, p.prioridade, p.trigger_tipo,
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
  (
    SELECT count(*)::int FROM pinguim.notificacoes_pendentes n
    WHERE n.cerebro_id = p.cerebro_id AND n.categoria_slug = c.slug
      AND n.resolvido_em IS NULL
  ) AS pendencias_count,
  p.atualizado_em
FROM pinguim.cerebro_plano_categoria p
JOIN pinguim.cerebro_categorias_catalogo c ON c.slug = p.categoria_slug
ORDER BY p.cerebro_id, c.ordem;

GRANT SELECT ON pinguim.vw_cerebro_plano_categoria TO service_role, anon, authenticated;
