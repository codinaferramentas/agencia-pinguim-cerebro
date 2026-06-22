-- ============================================================
-- Schema 032 — Skills propostas pelos sócios + Tickets pro Codina
-- 2026-06-22
-- ============================================================
-- Quando Pedro/Misha/Luiz criam skill local no Claude Code deles
-- e querem que outros sócios usem, o Pinguim manda o MD pra
-- pinguim.skills_propostas via tool-promover-skill.
-- Codina vê no painel "Skills propostas" e aprova/rejeita.
--
-- Quando sócio pede algo que precisa de tool nova, Pinguim
-- abre ticket em pinguim.tickets_codina via tool-abrir-ticket-codina.

-- ============================================================
-- Tabela: pinguim.skills_propostas
-- ============================================================
CREATE TABLE IF NOT EXISTS pinguim.skills_propostas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_slug    TEXT NOT NULL CHECK (socio_slug IN ('codina','pedro','luiz','micha')),
  skill_nome    TEXT NOT NULL,
  skill_md      TEXT NOT NULL,
  descricao_curta TEXT,
  contexto_uso  TEXT, -- pq o sócio acha que outros podem usar
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada','em_revisao')),
  feedback_codina TEXT, -- se rejeitou ou pediu revisão, motivo
  skill_final_md  TEXT, -- versão final que Codina aprovou (pode ter editado)
  criada_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisada_em   TIMESTAMPTZ,
  aprovada_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_skills_propostas_status ON pinguim.skills_propostas(status);
CREATE INDEX IF NOT EXISTS idx_skills_propostas_socio ON pinguim.skills_propostas(socio_slug);
CREATE INDEX IF NOT EXISTS idx_skills_propostas_criada ON pinguim.skills_propostas(criada_em DESC);

COMMENT ON TABLE pinguim.skills_propostas IS 'Skills criadas localmente por sócios (Pedro/Luiz/Micha) via Claude Code e propostas pra serem disponibilizadas pros 4 via Mission Control.';
COMMENT ON COLUMN pinguim.skills_propostas.skill_md IS 'Conteúdo completo do SKILL.md (frontmatter + corpo) como o sócio enviou.';
COMMENT ON COLUMN pinguim.skills_propostas.skill_final_md IS 'Versão final aprovada pelo Codina. Pode ter sido editada do original.';

-- ============================================================
-- Tabela: pinguim.tickets_codina
-- ============================================================
CREATE TABLE IF NOT EXISTS pinguim.tickets_codina (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_slug    TEXT NOT NULL CHECK (socio_slug IN ('codina','pedro','luiz','micha')),
  tipo          TEXT NOT NULL CHECK (tipo IN ('tool_nova','integracao','bug','duvida','feature')),
  titulo        TEXT NOT NULL,
  descricao     TEXT NOT NULL,
  contexto_pedido TEXT, -- o que o sócio tava tentando fazer quando precisou
  prioridade    TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  status        TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','resolvido','rejeitado','arquivado')),
  resposta_codina TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido_em  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON pinguim.tickets_codina(status);
CREATE INDEX IF NOT EXISTS idx_tickets_socio ON pinguim.tickets_codina(socio_slug);
CREATE INDEX IF NOT EXISTS idx_tickets_prioridade ON pinguim.tickets_codina(prioridade);
CREATE INDEX IF NOT EXISTS idx_tickets_criado ON pinguim.tickets_codina(criado_em DESC);

COMMENT ON TABLE pinguim.tickets_codina IS 'Tickets abertos pelos sócios via Pinguim no Claude Code quando precisam de algo que o Codina tem que construir (tool nova, integração, etc).';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE pinguim.skills_propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.tickets_codina ENABLE ROW LEVEL SECURITY;

-- Service role acessa tudo (edge functions usam service_role)
DROP POLICY IF EXISTS "service_role_all_skills" ON pinguim.skills_propostas;
CREATE POLICY "service_role_all_skills" ON pinguim.skills_propostas FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_tickets" ON pinguim.tickets_codina;
CREATE POLICY "service_role_all_tickets" ON pinguim.tickets_codina FOR ALL USING (auth.role() = 'service_role');

-- Anon pode ler (pro painel MC mostrar)
DROP POLICY IF EXISTS "anon_select_skills" ON pinguim.skills_propostas;
CREATE POLICY "anon_select_skills" ON pinguim.skills_propostas FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_select_tickets" ON pinguim.tickets_codina;
CREATE POLICY "anon_select_tickets" ON pinguim.tickets_codina FOR SELECT USING (true);
