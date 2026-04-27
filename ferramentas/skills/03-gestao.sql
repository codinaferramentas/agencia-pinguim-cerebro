-- ============================================================================
-- Pinguim OS — Skills (etapa 2.1 — gestao completa)
-- ============================================================================
-- Adiciona:
--   pinguim.skill_versoes      : historico de versoes do conteudo_md
--   pinguim.skill_aprendizados : feedback EPP (Evolução Permanente)
-- ============================================================================

-- 1) Versoes do SKILL.md (snapshot a cada save)
CREATE TABLE IF NOT EXISTS pinguim.skill_versoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        uuid NOT NULL REFERENCES pinguim.skills(id) ON DELETE CASCADE,
  versao          text NOT NULL,
  conteudo_md     text NOT NULL,
  resumo_mudanca  text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  criado_por      text
);
CREATE INDEX IF NOT EXISTS skill_versoes_skill_idx
  ON pinguim.skill_versoes (skill_id, criado_em DESC);

-- 2) Aprendizados (loop EPP — feedback humano vira melhoria)
CREATE TABLE IF NOT EXISTS pinguim.skill_aprendizados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        uuid NOT NULL REFERENCES pinguim.skills(id) ON DELETE CASCADE,
  texto           text NOT NULL,
  contexto        text,           -- ex: "execucao em 2026-04-28 com Cerebro Elo"
  origem          text DEFAULT 'humano',  -- 'humano' | 'auto' (de log de execucao)
  aplicado        boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  criado_por      text
);
CREATE INDEX IF NOT EXISTS skill_aprendizados_skill_idx
  ON pinguim.skill_aprendizados (skill_id, criado_em DESC);

-- 3) RLS
ALTER TABLE pinguim.skill_versoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.skill_aprendizados ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='pinguim' AND tablename='skill_versoes' AND policyname='skill_versoes_authenticated_all') THEN
    CREATE POLICY skill_versoes_authenticated_all ON pinguim.skill_versoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='pinguim' AND tablename='skill_aprendizados' AND policyname='skill_aprendizados_authenticated_all') THEN
    CREATE POLICY skill_aprendizados_authenticated_all ON pinguim.skill_aprendizados FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
