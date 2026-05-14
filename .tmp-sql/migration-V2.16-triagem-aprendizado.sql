-- ============================================================
-- V2.16 — Triagem de Emails aprendizado pessoal (Andre 2026-05-14)
-- ============================================================
-- 2 tabelas pra que cada sócio:
--   (1) crie baldes próprios (categoria custom no relatório)
--   (2) corrija classificação errada (próxima triagem aprende)
-- ============================================================

-- Tabela 1: baldes custom por sócio
CREATE TABLE IF NOT EXISTS pinguim.triagem_baldes_custom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  slug text NOT NULL,
  nome text NOT NULL,
  icone text DEFAULT '🏷',
  descricao text DEFAULT '',
  cor text DEFAULT 'mute',
  criado_em timestamptz DEFAULT now(),
  desativado boolean DEFAULT false,
  CONSTRAINT triagem_baldes_custom_uniq_slug_cliente UNIQUE(cliente_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_triagem_baldes_custom_cliente
  ON pinguim.triagem_baldes_custom(cliente_id)
  WHERE desativado = false;

ALTER TABLE pinguim.triagem_baldes_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS triagem_baldes_custom_owner ON pinguim.triagem_baldes_custom;
CREATE POLICY triagem_baldes_custom_owner ON pinguim.triagem_baldes_custom
  FOR ALL USING (true) WITH CHECK (true);
-- Política liberal por enquanto (server-cli usa service_role).
-- Quando a app subir multi-tenant via JWT, trocar pra owner-only.

-- Tabela 2: aprendizados de reclassificação por sócio
CREATE TABLE IF NOT EXISTS pinguim.triagem_aprendizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  message_id text NOT NULL,
  assunto text,
  remetente_email text,
  remetente_nome text,
  snippet text,
  balde_antigo text NOT NULL,
  balde_novo text NOT NULL,
  motivo_humano text,
  criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_triagem_aprendizados_cliente
  ON pinguim.triagem_aprendizados(cliente_id, criado_em DESC);

ALTER TABLE pinguim.triagem_aprendizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS triagem_aprendizados_owner ON pinguim.triagem_aprendizados;
CREATE POLICY triagem_aprendizados_owner ON pinguim.triagem_aprendizados
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE pinguim.triagem_baldes_custom IS
  'V2.16 — baldes personalizados criados pelo sócio na triagem de emails (pessoal por cliente_id).';

COMMENT ON TABLE pinguim.triagem_aprendizados IS
  'V2.16 — correções manuais de classificação. Últimos N viram exemplos no prompt do LLM-classifier da próxima triagem.';
