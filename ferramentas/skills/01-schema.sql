-- ============================================================================
-- Pinguim OS — Skills (etapa 1)
-- ============================================================================
-- Estrutura:
--   pinguim.skills            : catalogo de skills (3 categorias)
--   pinguim.agente_skills     : relacao N:N (qual agente usa qual skill)
--   pinguim.skill_execucoes   : log de cada execucao (por skill, por agente)
--   pinguim.vw_skills_catalogo: view com contador de agentes que usam
--
-- Categorias de Skill:
--   universal    -> qualquer agente pode usar (ex: google-drive-ler)
--   por_area     -> familia de agentes da mesma especialidade (comercial/marketing/cs...)
--   especifica   -> de 1 agente so
--
-- Status:
--   planejada     -> no catalogo mas sem implementacao ainda
--   em_construcao -> SKILL.md em progresso
--   ativa         -> rodando em producao
--   pausada       -> desativada temporariamente
-- ============================================================================

-- 1) Adiciona colunas que faltam em pinguim.skills
ALTER TABLE pinguim.skills
  ADD COLUMN IF NOT EXISTS area              text,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'planejada',
  ADD COLUMN IF NOT EXISTS quando_usar       text,
  ADD COLUMN IF NOT EXISTS total_execucoes   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_execucao   timestamptz,
  ADD COLUMN IF NOT EXISTS atualizado_em     timestamptz NOT NULL DEFAULT now();

-- Constraint pra status valido
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skills_status_check') THEN
    ALTER TABLE pinguim.skills
      ADD CONSTRAINT skills_status_check
      CHECK (status IN ('planejada', 'em_construcao', 'ativa', 'pausada'));
  END IF;
END $$;

-- Constraint pra categoria valida (3 familias)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skills_categoria_check') THEN
    ALTER TABLE pinguim.skills
      ADD CONSTRAINT skills_categoria_check
      CHECK (categoria IN ('universal', 'por_area', 'especifica'));
  END IF;
END $$;

-- Indexes uteis
CREATE INDEX IF NOT EXISTS skills_categoria_idx ON pinguim.skills (categoria);
CREATE INDEX IF NOT EXISTS skills_area_idx      ON pinguim.skills (area);
CREATE INDEX IF NOT EXISTS skills_status_idx    ON pinguim.skills (status);
CREATE UNIQUE INDEX IF NOT EXISTS skills_slug_idx ON pinguim.skills (slug);

-- Ajusta categoria nos rows ja existentes (eram universal=true mas categoria='operacional/copy/etc')
-- Move o valor antigo de categoria pra area, e marca categoria='universal' onde universal=true
UPDATE pinguim.skills
SET area = categoria,
    categoria = CASE WHEN universal THEN 'universal' ELSE 'especifica' END
WHERE categoria NOT IN ('universal', 'por_area', 'especifica');

-- 2) Tabela de relacao agente <-> skill
CREATE TABLE IF NOT EXISTS pinguim.agente_skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id       uuid NOT NULL REFERENCES pinguim.agentes(id) ON DELETE CASCADE,
  skill_id        uuid NOT NULL REFERENCES pinguim.skills(id)   ON DELETE CASCADE,
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agente_id, skill_id)
);
CREATE INDEX IF NOT EXISTS agente_skills_agente_idx ON pinguim.agente_skills (agente_id);
CREATE INDEX IF NOT EXISTS agente_skills_skill_idx  ON pinguim.agente_skills (skill_id);

-- 3) Log de execucoes (generico, escala pra 300 agentes)
CREATE TABLE IF NOT EXISTS pinguim.skill_execucoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        uuid NOT NULL REFERENCES pinguim.skills(id) ON DELETE CASCADE,
  agente_id       uuid REFERENCES pinguim.agentes(id) ON DELETE SET NULL,
  cerebro_id      uuid REFERENCES pinguim.cerebros(id) ON DELETE SET NULL,
  input           jsonb,
  output          jsonb,
  sucesso         boolean,
  erro            text,
  duracao_ms      integer,
  custo_usd       numeric(10,6),
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skill_execucoes_skill_idx   ON pinguim.skill_execucoes (skill_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS skill_execucoes_agente_idx  ON pinguim.skill_execucoes (agente_id, criado_em DESC);

-- 4) View do catalogo (com contador de agentes que usam)
CREATE OR REPLACE VIEW pinguim.vw_skills_catalogo AS
SELECT
  s.id,
  s.slug,
  s.nome,
  s.categoria,
  s.area,
  s.status,
  s.descricao,
  s.quando_usar,
  s.universal,
  s.versao,
  s.total_execucoes,
  s.ultima_execucao,
  s.criado_em,
  s.atualizado_em,
  COALESCE(ag.total_agentes, 0) AS total_agentes
FROM pinguim.skills s
LEFT JOIN (
  SELECT skill_id, COUNT(DISTINCT agente_id) AS total_agentes
  FROM pinguim.agente_skills
  WHERE ativo = true
  GROUP BY skill_id
) ag ON ag.skill_id = s.id
ORDER BY
  CASE s.categoria WHEN 'universal' THEN 1 WHEN 'por_area' THEN 2 ELSE 3 END,
  s.area NULLS FIRST,
  s.nome;

-- 5) RLS — mesma politica do resto: authenticated full read/write
ALTER TABLE pinguim.skills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.agente_skills    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.skill_execucoes  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='pinguim' AND tablename='skills' AND policyname='skills_authenticated_all') THEN
    CREATE POLICY skills_authenticated_all ON pinguim.skills FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='pinguim' AND tablename='agente_skills' AND policyname='agente_skills_authenticated_all') THEN
    CREATE POLICY agente_skills_authenticated_all ON pinguim.agente_skills FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='pinguim' AND tablename='skill_execucoes' AND policyname='skill_execucoes_authenticated_all') THEN
    CREATE POLICY skill_execucoes_authenticated_all ON pinguim.skill_execucoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6) Trigger pra atualizar atualizado_em automaticamente
CREATE OR REPLACE FUNCTION pinguim.set_atualizado_em() RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS skills_set_atualizado ON pinguim.skills;
CREATE TRIGGER skills_set_atualizado
  BEFORE UPDATE ON pinguim.skills
  FOR EACH ROW EXECUTE FUNCTION pinguim.set_atualizado_em();
