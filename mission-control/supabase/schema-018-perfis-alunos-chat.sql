-- ============================================================
-- schema-018-perfis-alunos-chat.sql
-- ============================================================
-- 2026-06-16: extracao automatica de perfis de alunos a partir dos
-- chats WhatsApp dos desafios. Quando alunos se apresentam, parser
-- extrai (autor, instagram, primeira_mensagem, nicho_hints) e salva
-- pra consulta direta — alimenta cerebro do desafio com dado
-- estruturado, nao so texto solto pro RAG.
-- ============================================================

CREATE TABLE IF NOT EXISTS pinguim.perfis_alunos_chat (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id      uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  cerebro_fonte_id uuid REFERENCES pinguim.cerebro_fontes(id) ON DELETE CASCADE,
  autor           text NOT NULL,
  instagram       text,
  primeira_mencao_em text,
  primeira_mensagem  text,
  total_msgs      integer DEFAULT 0,
  nicho_hints     text[],
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cerebro_fonte_id, autor)
);

CREATE INDEX IF NOT EXISTS idx_perfis_alunos_cerebro ON pinguim.perfis_alunos_chat (cerebro_id);
CREATE INDEX IF NOT EXISTS idx_perfis_alunos_instagram ON pinguim.perfis_alunos_chat (instagram) WHERE instagram IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfis_alunos_nicho ON pinguim.perfis_alunos_chat USING GIN (nicho_hints);

COMMENT ON TABLE pinguim.perfis_alunos_chat IS
  'V3 — Perfis de alunos extraidos automaticamente dos chats WhatsApp (apresentacoes nos grupos do desafio). Usado pra consultar nicho/Instagram dos participantes.';

GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.perfis_alunos_chat TO service_role;
GRANT SELECT ON pinguim.perfis_alunos_chat TO anon, authenticated;
