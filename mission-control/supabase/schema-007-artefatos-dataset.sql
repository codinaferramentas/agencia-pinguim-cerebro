-- ============================================================
-- schema-007-artefatos-dataset.sql
-- ============================================================
-- Tabela `pinguim.artefatos` — datasets/resultados que tools geram
-- e que NAO devem entrar no contexto do LLM (anti-poisoning).
--
-- Pattern: igual OpenAI Assistants File Search / Claude Artifacts.
-- A tool grava o dataset completo aqui e devolve pro LLM SO:
--   { artifact_id, schema, stats, preview_5_linhas }
-- A proxima tool (ex: subir-planilha-drive) recebe artifact_id
-- e le do banco diretamente — LLM nunca toca no dataset bruto.
--
-- Vida util: 7 dias por padrao. Cron limpa expirados.
-- ============================================================

CREATE TABLE IF NOT EXISTS pinguim.artefatos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,                          -- isolamento multi-tenant
  cliente_id    uuid,                          -- a quem pertence
  agente_id     uuid REFERENCES pinguim.agentes(id),
  tool_origem   text,                          -- ex: 'tool-meta-gerar-relatorio'

  -- Metadata do dataset
  tipo          text NOT NULL,                 -- 'dataset-tabular' | 'csv' | 'json' | 'blob'
  titulo        text,                          -- ex: "Meta — Gasto por Produto x Mes — Jan-Mai 2026"
  descricao     text,                          -- contexto humano

  -- Conteudo (dataset principal vai aqui)
  schema_json   jsonb,                         -- { colunas: [{nome, tipo, unidade}], ... }
  conteudo      jsonb,                         -- dataset completo: { linhas: [...], matrizes: {...} }
  conteudo_size_bytes  integer,                -- pra metricas

  -- Resumo enviado ao LLM (NUNCA mais que ~500 tokens)
  resumo_llm    jsonb,                         -- { total, top_3, n_linhas, preview_5, agg_stats }

  -- Lifecycle
  criado_em     timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumido_por jsonb DEFAULT '[]'::jsonb,     -- log de tools que leram: [{tool, ts}]

  -- Auditoria opcional — qual job_id da execucao gerou
  agente_execucao_id uuid
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_artefatos_cliente_recente
  ON pinguim.artefatos (cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_artefatos_expira
  ON pinguim.artefatos (expira_em);
CREATE INDEX IF NOT EXISTS idx_artefatos_agente
  ON pinguim.artefatos (agente_id, criado_em DESC);

COMMENT ON TABLE pinguim.artefatos IS
  'Datasets gerados por tools que NAO devem entrar no contexto do LLM. Pattern Artifact (Claude/OpenAI File Search). Tool grava aqui, LLM recebe SO resumo + artifact_id, proxima tool le diretamente.';

COMMENT ON COLUMN pinguim.artefatos.conteudo IS
  'Dataset completo em JSONB. Inclui matrizes prontas (pivot/long/detalhe) ja formatadas para subir em planilha.';

COMMENT ON COLUMN pinguim.artefatos.resumo_llm IS
  'Resumo curto (~500 tokens max) que vai pro contexto do LLM. NUNCA inclui linhas completas — apenas total, top N, schema, sample de 5 linhas.';

-- ============================================================
-- RPC: gravar_artefato
-- ============================================================
-- Tool chama isso pra registrar dataset. Retorna artifact_id.
CREATE OR REPLACE FUNCTION pinguim.gravar_artefato(
  p_cliente_id  uuid,
  p_agente_id   uuid,
  p_tool_origem text,
  p_tipo        text,
  p_titulo      text,
  p_descricao   text,
  p_schema_json jsonb,
  p_conteudo    jsonb,
  p_resumo_llm  jsonb,
  p_tenant_id   uuid DEFAULT NULL,
  p_ttl_dias    integer DEFAULT 7
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_size integer;
BEGIN
  v_size := octet_length(p_conteudo::text);

  INSERT INTO pinguim.artefatos (
    tenant_id, cliente_id, agente_id, tool_origem,
    tipo, titulo, descricao,
    schema_json, conteudo, conteudo_size_bytes, resumo_llm,
    expira_em
  ) VALUES (
    p_tenant_id, p_cliente_id, p_agente_id, p_tool_origem,
    p_tipo, p_titulo, p_descricao,
    p_schema_json, p_conteudo, v_size, p_resumo_llm,
    now() + (p_ttl_dias || ' days')::interval
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- RPC: ler_artefato
-- ============================================================
-- Tool chama isso pra ler dataset (ex: subir-planilha-drive le pra subir no Drive).
-- Atualiza consumido_por pra auditoria.
CREATE OR REPLACE FUNCTION pinguim.ler_artefato(
  p_artifact_id uuid,
  p_consumidor  text
) RETURNS TABLE (
  id          uuid,
  tipo        text,
  titulo      text,
  descricao   text,
  schema_json jsonb,
  conteudo    jsonb,
  criado_em   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- registra consumo (alias a. obrigatorio — id da tabela conflita com id da RETURNS TABLE)
  UPDATE pinguim.artefatos a
    SET consumido_por = a.consumido_por || jsonb_build_object('tool', p_consumidor, 'ts', now())
    WHERE a.id = p_artifact_id;

  RETURN QUERY
    SELECT a.id, a.tipo, a.titulo, a.descricao, a.schema_json, a.conteudo, a.criado_em
    FROM pinguim.artefatos a
    WHERE a.id = p_artifact_id
      AND a.expira_em > now();
END;
$$;

-- ============================================================
-- RPC: limpar_artefatos_expirados
-- ============================================================
-- Cron diario chama isso pra varrer expirados.
CREATE OR REPLACE FUNCTION pinguim.limpar_artefatos_expirados()
RETURNS TABLE (removidos integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_removidos integer;
BEGIN
  WITH del AS (
    DELETE FROM pinguim.artefatos
    WHERE expira_em <= now()
    RETURNING id
  )
  SELECT count(*)::integer INTO v_removidos FROM del;
  RETURN QUERY SELECT v_removidos;
END;
$$;

-- ============================================================
-- Grants — service_role acessa tudo, anon nao
-- ============================================================
REVOKE ALL ON pinguim.artefatos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.artefatos TO service_role;

GRANT EXECUTE ON FUNCTION pinguim.gravar_artefato TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.ler_artefato TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.limpar_artefatos_expirados TO service_role;
