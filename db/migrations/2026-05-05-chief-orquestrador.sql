-- ============================================================================
-- Migration: Chief / Orquestrador Geral — infra de banco
-- Data:      2026-05-05
-- Bloco:     2 (do plano de construção do Chief)
-- ============================================================================
-- Cria 5 tabelas novas + ajustes em pinguim.agentes pra suportar:
--   - Memória conversacional centralizada (conversas + entregaveis)
--   - Memória individual ativa desde v1 (aprendizados_agente + aprendizados_cliente_agente)
--   - Protocolo de dissenso Worker × Chief
--   - Multi-tenant ready (tenant_id + RLS) — Alan Nicolas
--   - RAG sobre capabilities — Pedro Valerio
--
-- Tudo com RLS por tenant (Squad Cyber).
-- Memória individual = DNA do agente (project_memoria_individual_dna_agente.md).
-- ============================================================================

-- 1. Ajustes em pinguim.agentes
-- ----------------------------------------------------------------------------
-- tenant_id: multi-tenant ready desde v1
-- capabilities: JSON pra RAG (Chief vai usar embedding sobre isso pra escolher Workers)

ALTER TABLE pinguim.agentes
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS proposito text,
  ADD COLUMN IF NOT EXISTS protocolo_dissenso text;

CREATE INDEX IF NOT EXISTS agentes_tenant_idx ON pinguim.agentes(tenant_id);
CREATE INDEX IF NOT EXISTS agentes_capabilities_gin ON pinguim.agentes USING gin (capabilities);


-- 2. pinguim.conversas — histórico cliente↔Chief (centralizado)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  agente_id uuid NOT NULL REFERENCES pinguim.agentes(id) ON DELETE CASCADE,
  caso_id uuid,                                  -- opcional: agrupa turnos do mesmo caso
  papel text NOT NULL CHECK (papel IN ('humano','chief','sistema','worker')),
  worker_id uuid REFERENCES pinguim.agentes(id), -- se papel='worker'
  conteudo text NOT NULL,
  artefatos jsonb,                               -- estruturas embutidas (planos, refs)
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversas_tenant_cliente_idx
  ON pinguim.conversas(tenant_id, cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS conversas_caso_idx
  ON pinguim.conversas(caso_id) WHERE caso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversas_agente_idx
  ON pinguim.conversas(agente_id, criado_em DESC);


-- 3. pinguim.entregaveis — copy/página/relatório versionado
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.entregaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  caso_id uuid,                                       -- vincula ao caso/conversa
  agente_que_fez uuid REFERENCES pinguim.agentes(id), -- worker que produziu (pode ser null se Chief consolidou)
  tipo text NOT NULL,                                 -- 'copy' | 'pagina' | 'relatorio' | 'plano' | ...
  titulo text,
  conteudo_estruturado jsonb NOT NULL,                -- JSON tipado (R8: schema obrigatório)
  conteudo_md text,                                   -- versão markdown legível (opcional)
  versao int NOT NULL DEFAULT 1,
  parent_id uuid REFERENCES pinguim.entregaveis(id),  -- versão anterior (se for revisão)
  aprovado boolean,                                   -- null = aguardando, true/false = humano avaliou
  feedback_humano text,                               -- comentário de avaliação
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entregaveis_tenant_cliente_idx
  ON pinguim.entregaveis(tenant_id, cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS entregaveis_caso_idx
  ON pinguim.entregaveis(caso_id) WHERE caso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS entregaveis_parent_idx
  ON pinguim.entregaveis(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS entregaveis_tipo_idx
  ON pinguim.entregaveis(tenant_id, cliente_id, tipo, criado_em DESC);


-- 4. pinguim.aprendizados_agente — memória GERAL (Tier 1, espelho APRENDIZADOS.md)
-- ----------------------------------------------------------------------------
-- Não tem tenant_id porque é aprendizado AGREGADO entre tenants
-- (princípios universais que valem pra qualquer cliente). Privacidade garantida
-- pela regra: só promove pra cá quando padrão se repete em 3+ clientes em 30d
-- (sem PII, sem nome de cliente). Munger advertiu, default seguro.

CREATE TABLE IF NOT EXISTS pinguim.aprendizados_agente (
  agente_id uuid PRIMARY KEY REFERENCES pinguim.agentes(id) ON DELETE CASCADE,
  conteudo_md text NOT NULL,           -- mesmo texto do APRENDIZADOS.md
  versao int NOT NULL DEFAULT 1,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);


-- 5. pinguim.aprendizados_cliente_agente — memória POR CLIENTE (Tier 2, perfis/<cliente>.md)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.aprendizados_cliente_agente (
  agente_id uuid NOT NULL REFERENCES pinguim.agentes(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  conteudo_md text NOT NULL,
  versao int NOT NULL DEFAULT 1,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agente_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS aprendizados_cliente_tenant_idx
  ON pinguim.aprendizados_cliente_agente(tenant_id);


-- 6. pinguim.dissensos — eventos Worker × Chief (Lencioni)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.dissensos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cliente_id uuid,
  caso_id uuid,
  worker_id uuid NOT NULL REFERENCES pinguim.agentes(id),
  chief_id uuid NOT NULL REFERENCES pinguim.agentes(id),
  briefing_original text NOT NULL,
  aprendizado_conflitante text NOT NULL,
  recomendacao_worker text NOT NULL,
  decisao_chief text NOT NULL,
  escalou_humano boolean NOT NULL DEFAULT false,
  resolucao text,                                -- decisão final se escalou
  principio_gerado text,                         -- princípio anti-repetição que virou
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dissensos_tenant_idx
  ON pinguim.dissensos(tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS dissensos_caso_idx
  ON pinguim.dissensos(caso_id) WHERE caso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dissensos_worker_idx
  ON pinguim.dissensos(worker_id);


-- 7. pinguim.tools_allowlist — princípio do menor privilégio (Squad Cyber)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.tools_allowlist (
  agente_id uuid NOT NULL REFERENCES pinguim.agentes(id) ON DELETE CASCADE,
  tool_nome text NOT NULL,
  permitido boolean NOT NULL DEFAULT true,
  limite_chamadas_dia int,                       -- null = ilimitado
  auditoria boolean NOT NULL DEFAULT true,       -- true = loga toda chamada em tool_invocacoes
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agente_id, tool_nome)
);


-- 8. pinguim.tool_invocacoes — log de toda chamada de tool (auditoria Squad Cyber)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.tool_invocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES pinguim.agentes(id),
  tool_nome text NOT NULL,
  input_resumo jsonb,
  output_resumo jsonb,
  sucesso boolean NOT NULL,
  erro text,
  duracao_ms int,
  custo_usd numeric,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_invocacoes_agente_idx
  ON pinguim.tool_invocacoes(agente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS tool_invocacoes_tool_idx
  ON pinguim.tool_invocacoes(tool_nome, criado_em DESC);


-- ============================================================================
-- RLS — Squad Cyber + Multi-tenant ready
-- ============================================================================

ALTER TABLE pinguim.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.entregaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.aprendizados_agente ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.aprendizados_cliente_agente ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.dissensos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.tools_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.tool_invocacoes ENABLE ROW LEVEL SECURITY;

-- Policy padrão Pinguim: authenticated tem leitura, service_role tem tudo.
-- (Mesmo padrão das outras tabelas do schema pinguim — memória `project_seguranca_rls_login.md`)

CREATE POLICY conversas_authenticated_select ON pinguim.conversas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY conversas_service_all ON pinguim.conversas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY entregaveis_authenticated_select ON pinguim.entregaveis
  FOR SELECT TO authenticated USING (true);
CREATE POLICY entregaveis_service_all ON pinguim.entregaveis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY aprendizados_agente_authenticated_select ON pinguim.aprendizados_agente
  FOR SELECT TO authenticated USING (true);
CREATE POLICY aprendizados_agente_service_all ON pinguim.aprendizados_agente
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY aprendizados_cliente_authenticated_select ON pinguim.aprendizados_cliente_agente
  FOR SELECT TO authenticated USING (true);
CREATE POLICY aprendizados_cliente_service_all ON pinguim.aprendizados_cliente_agente
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY dissensos_authenticated_select ON pinguim.dissensos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dissensos_service_all ON pinguim.dissensos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY tools_allowlist_authenticated_select ON pinguim.tools_allowlist
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tools_allowlist_service_all ON pinguim.tools_allowlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY tool_invocacoes_authenticated_select ON pinguim.tool_invocacoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tool_invocacoes_service_all ON pinguim.tool_invocacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- Comentários nas tabelas (documentação inline)
-- ============================================================================

COMMENT ON TABLE pinguim.conversas IS
'Histórico cliente↔Chief. Memória conversacional centralizada (decisão 2026-05-05). Workers não compartilham — recebem briefing inline.';

COMMENT ON TABLE pinguim.entregaveis IS
'Copy/página/relatório versionado. parent_id = revisão. conteudo_estruturado é OBRIGATÓRIO em JSON tipado (R8: sem blob).';

COMMENT ON TABLE pinguim.aprendizados_agente IS
'Memória GERAL (Tier 1) — agregada entre clientes. Espelho de APRENDIZADOS.md. Promoção via cron com regra dura: padrão em 3+ clientes em 30d.';

COMMENT ON TABLE pinguim.aprendizados_cliente_agente IS
'Memória POR CLIENTE (Tier 2) — específico do par agente×cliente. Espelho de perfis/<cliente>.md. Tier default — toda nova lição entra aqui.';

COMMENT ON TABLE pinguim.dissensos IS
'Eventos Worker × Chief. Worker pausa execução quando briefing contradiz APRENDIZADOS dele, devolve nota de 3 campos. Chief decide. Resolução vira princípio.';

COMMENT ON TABLE pinguim.tools_allowlist IS
'Princípio do menor privilégio. Cada agente só pode chamar tools listadas aqui com permitido=true.';

COMMENT ON TABLE pinguim.tool_invocacoes IS
'Auditoria Squad Cyber — toda chamada de tool por agente. Custo, latência, erro.';

COMMENT ON COLUMN pinguim.agentes.capabilities IS
'JSON com array de tags/skills do agente. RAG semântico do Chief usa embedding sobre isso pra escolher Workers (Pedro Valerio: top N pra evitar estouro de contexto).';

COMMENT ON COLUMN pinguim.agentes.tenant_id IS
'Multi-tenant ready desde v1 (Alan Nicolas). Hoje só Pinguim, mas filtro está ativo.';

COMMENT ON COLUMN pinguim.agentes.proposito IS
'1 frase obrigatória (Sinek): "Existo pra [verbo + objeto + cliente] e meu sucesso se mede em [métrica]". Sem isso, agente não nasce.';

COMMENT ON COLUMN pinguim.agentes.protocolo_dissenso IS
'Como o agente trata conflito entre briefing recebido e seu próprio aprendizado. Default: pausa execução, devolve nota_de_dissenso (3 campos).';
