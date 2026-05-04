-- =====================================================================
-- Cerebro Inteligencia — pivot do brainstorm 2026-05-02
-- =====================================================================
-- Cada item = 1 OBSERVACAO individual (mensagem real de cliente).
-- UI agrega depois: "47 objecoes de preco", "12 perguntas sobre tempo".
-- Fonte = mensagens do CRM (Clint API hoje, outros adapters depois).
--
-- Funil de curadoria:
--   1. estado='bruto'      -> coletado da API, classificado por IA
--   2. estado='em_resolucao' -> humano pegou pra resolver com clone
--   3. estado='aprovado'   -> resposta gerada por clone, vira fonte
--   4. estado='descartado' -> ruido / nao relevante
-- =====================================================================

CREATE TABLE IF NOT EXISTS pinguim.cerebro_inteligencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,

  -- Classificacao
  tipo text NOT NULL,                          -- objecao | pergunta | conversao | duvida | elogio | reclamacao | ruido
  categoria text,                              -- subtipo: 'preco', 'tempo', 'suporte', 'autoridade' (objecao); 'tecnica', 'comercial' (pergunta)
  texto text NOT NULL,                         -- frase original do cliente (anonimizavel se LGPD pedir)

  -- Contexto da observacao
  origem_adapter text NOT NULL,                -- 'clint' | 'hubspot' | 'rd_station' | 'csv' | 'manual'
  origem_id text,                              -- ID externo (ex: chat_id|message_id no Clint) — idempotencia
  origem_email text,                           -- e-mail do contato (pra debug/copiloto futuro)
  contexto_funil text,                         -- ex: 'Compras aprovadas'
  contexto_etapa text,                         -- ex: 'Base', 'Contato', 'Retorno'
  vendedor text,                               -- quem atendeu

  -- Estado no funil de curadoria
  estado text NOT NULL DEFAULT 'bruto',        -- bruto | em_resolucao | aprovado | descartado
  resolucao_md text,                           -- resposta gerada por clone (markdown)
  resolucao_clone_id uuid REFERENCES pinguim.produtos(id),  -- clone que resolveu (Hormozi, Cialdini, etc)
  fonte_id uuid REFERENCES pinguim.cerebro_fontes(id),      -- quando aprovado, vira fonte; ref pra rastreabilidade
  resolvido_em timestamptz,
  resolvido_por text,

  -- Score de relevancia (0-100, calculado pela IA na classificacao)
  score_relevancia integer DEFAULT 50,

  -- IA
  classificacao_modelo text,                   -- 'gpt-4o-mini' etc
  classificacao_confianca numeric(3,2),        -- 0.00-1.00

  ocorrido_em timestamptz NOT NULL,            -- quando o cliente DISSE (data da mensagem original)
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  UNIQUE(origem_adapter, origem_id)            -- idempotencia: nao duplica mesma mensagem
);

CREATE INDEX IF NOT EXISTS idx_ci_cerebro_estado ON pinguim.cerebro_inteligencia(cerebro_id, estado);
CREATE INDEX IF NOT EXISTS idx_ci_cerebro_tipo ON pinguim.cerebro_inteligencia(cerebro_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ci_ocorrido ON pinguim.cerebro_inteligencia(ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_ci_origem ON pinguim.cerebro_inteligencia(origem_adapter, origem_id);

ALTER TABLE pinguim.cerebro_inteligencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ci_authenticated ON pinguim.cerebro_inteligencia;
CREATE POLICY ci_authenticated ON pinguim.cerebro_inteligencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.cerebro_inteligencia TO authenticated;

-- =====================================================================
-- RPCs
-- =====================================================================

-- Stats agregados por Cerebro (pra UI da aba Inteligencia Viva)
CREATE OR REPLACE FUNCTION pinguim.stats_cerebro_inteligencia(p_cerebro_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  with base as (
    select * from pinguim.cerebro_inteligencia where cerebro_id = p_cerebro_id
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'por_estado', coalesce((
      select jsonb_object_agg(estado, qtd)
      from (select estado, count(*) as qtd from base group by estado) e
    ), '{}'::jsonb),
    'por_tipo', coalesce((
      select jsonb_object_agg(tipo, qtd)
      from (select tipo, count(*) as qtd from base where estado != 'descartado' group by tipo) t
    ), '{}'::jsonb),
    'por_categoria_objecao', coalesce((
      select jsonb_object_agg(categoria, qtd)
      from (select categoria, count(*) as qtd from base where tipo = 'objecao' and categoria is not null and estado != 'descartado' group by categoria) c
    ), '{}'::jsonb),
    'por_adapter', coalesce((
      select jsonb_object_agg(origem_adapter, qtd)
      from (select origem_adapter, count(*) as qtd from base group by origem_adapter) a
    ), '{}'::jsonb),
    'ultima_coleta', (select max(criado_em) from base)
  );
$$;

GRANT EXECUTE ON FUNCTION pinguim.stats_cerebro_inteligencia(uuid) TO authenticated;

-- Lista paginada por Cerebro com filtros
CREATE OR REPLACE FUNCTION pinguim.listar_cerebro_inteligencia(
  p_cerebro_id uuid,
  p_estado text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_busca text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  tipo text,
  categoria text,
  texto text,
  estado text,
  origem_adapter text,
  contexto_funil text,
  contexto_etapa text,
  score_relevancia integer,
  ocorrido_em timestamptz,
  resolvido_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  select id, tipo, categoria, texto, estado, origem_adapter,
         contexto_funil, contexto_etapa, score_relevancia, ocorrido_em, resolvido_em
  from pinguim.cerebro_inteligencia
  where cerebro_id = p_cerebro_id
    and (p_estado is null or estado = p_estado)
    and (p_tipo is null or tipo = p_tipo)
    and (p_categoria is null or categoria = p_categoria)
    and (p_busca = '' or texto ilike '%' || p_busca || '%')
  order by score_relevancia desc, ocorrido_em desc
  limit p_limit offset p_offset;
$$;

GRANT EXECUTE ON FUNCTION pinguim.listar_cerebro_inteligencia(uuid, text, text, text, text, integer, integer) TO authenticated;

-- Contador (pra UI mostrar "X de Y")
CREATE OR REPLACE FUNCTION pinguim.contar_cerebro_inteligencia(
  p_cerebro_id uuid,
  p_estado text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_busca text DEFAULT ''
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  select count(*)
  from pinguim.cerebro_inteligencia
  where cerebro_id = p_cerebro_id
    and (p_estado is null or estado = p_estado)
    and (p_tipo is null or tipo = p_tipo)
    and (p_categoria is null or categoria = p_categoria)
    and (p_busca = '' or texto ilike '%' || p_busca || '%');
$$;

GRANT EXECUTE ON FUNCTION pinguim.contar_cerebro_inteligencia(uuid, text, text, text, text) TO authenticated;

-- =====================================================================
-- Tabela auxiliar: estado da coleta por adapter
-- =====================================================================
-- Mantem cursor de "ate quando ja coletei" pra evitar refazer carga total.
CREATE TABLE IF NOT EXISTS pinguim.cerebro_inteligencia_coleta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter text NOT NULL,                       -- 'clint' | etc
  ultima_coleta_em timestamptz,                -- timestamp da ultima coleta bem-sucedida
  ultima_coleta_qtd integer,                   -- quantos itens coletados na ultima rodada
  ultima_coleta_duracao_ms integer,
  ultima_coleta_erro text,
  total_acumulado integer DEFAULT 0,
  carga_inicial_completa boolean DEFAULT false,
  cursor_externo text,                         -- ID/timestamp do ultimo item processado (paginacao)
  metadata jsonb DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(adapter)
);

ALTER TABLE pinguim.cerebro_inteligencia_coleta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cic_authenticated ON pinguim.cerebro_inteligencia_coleta;
CREATE POLICY cic_authenticated ON pinguim.cerebro_inteligencia_coleta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.cerebro_inteligencia_coleta TO authenticated;

-- Seed do cursor Clint (vazio, pronto pra primeira carga)
INSERT INTO pinguim.cerebro_inteligencia_coleta (adapter, total_acumulado, carga_inicial_completa)
VALUES ('clint', 0, false)
ON CONFLICT (adapter) DO NOTHING;
