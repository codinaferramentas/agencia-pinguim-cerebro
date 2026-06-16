-- ============================================================
-- schema-010-plano-automacao-categoria.sql
-- ============================================================
-- Plano de Cerebros v3 (2026-06-16) — virada arquitetural
--
-- Mudanca chave: unidade fundamental NAO eh mais a "fonte individual"
-- (cerebro_fontes_planejadas com cards de 50 aulas). Eh a CATEGORIA
-- de fonte + seu PLANO DE AUTOMACAO.
--
-- Cada cerebro tem N categorias (catalogo fixo). Cada categoria tem
-- um estado de automacao (sem_coleta -> planejada -> em_construcao
-- -> rodando -> pausada/falhou), atributos (origem configurada,
-- schedule, ferramenta, responsavel, ultima_execucao).
--
-- Cards individuais sumiram da reuniao — vao pra drawer/detalhe.
-- ============================================================

-- ============================================================
-- 1) Catalogo de categorias canonicas
-- ============================================================
CREATE TABLE IF NOT EXISTS pinguim.cerebro_categorias_catalogo (
  slug          text PRIMARY KEY,
  nome          text NOT NULL,
  emoji         text,
  descricao     text,           -- "o que entra nesta categoria"
  tipos_fonte   text[] NOT NULL DEFAULT '{}'::text[],
                                -- mapeamento p/ cerebro_fontes.tipo (ex: ['aula'])
                                -- vazio = categoria que ainda nao tem fonte no banco
  ordem         integer NOT NULL DEFAULT 0,
  ativa         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pinguim.cerebro_categorias_catalogo IS
  'V3 — Catalogo fixo de categorias de fonte que alimentam cerebros. Cada categoria mapeia 1+ tipos da cerebro_fontes via tipos_fonte[].';

INSERT INTO pinguim.cerebro_categorias_catalogo (slug, nome, emoji, descricao, tipos_fonte, ordem) VALUES
  ('aulas',           'Aulas',                  '📚', 'Transcricoes e materiais de aula do produto',         ARRAY['aula']::text[],         1),
  ('manifestos',      'Manifestos',             '📜', 'Manifestos, posicionamentos e textos de doutrina',    ARRAY['manifesto']::text[],    2),
  ('depoimentos',     'Depoimentos',            '⭐', 'Depoimentos de alunos, casos de sucesso',             ARRAY['depoimento']::text[],   3),
  ('paginas_venda',   'Paginas de venda',       '📄', 'Paginas de venda do produto (snapshot atual)',        ARRAY['pagina_venda']::text[], 4),
  ('csv',             'CSV / Planilhas',        '📊', 'Dados estruturados (vendas, leads, KPIs)',            ARRAY['csv']::text[],          5),
  ('chat_whatsapp',   'Chat WhatsApp',          '💬', 'Mensagens raspadas de grupos WhatsApp',               ARRAY[]::text[],               6),
  ('chat_discord',    'Chat Discord',           '💬', 'Mensagens raspadas de canais Discord',                ARRAY[]::text[],               7),
  ('chat_export',     'Chats exportados',       '💬', 'Exports de conversas (atendimento, suporte)',         ARRAY['chat_export']::text[],  8),
  ('externo',         'Externo',                '🌐', 'Referencias externas (concorrentes, inspiracao)',     ARRAY['externo']::text[],      9),
  ('reels',           'Reels / Videos curtos',  '🎬', 'Reels TikTok/Instagram, videos curtos',               ARRAY[]::text[],              10),
  ('outros',          'Outros',                 '📦', 'Tipos nao mapeados em nenhuma categoria do catalogo', ARRAY[]::text[],              99)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  emoji = EXCLUDED.emoji,
  descricao = EXCLUDED.descricao,
  tipos_fonte = EXCLUDED.tipos_fonte,
  ordem = EXCLUDED.ordem;

-- ============================================================
-- 2) Plano de automacao por (cerebro, categoria)
-- ============================================================
-- Cada cerebro tem N linhas (uma por categoria do catalogo + opcionais custom).
-- Status_automacao eh o estado do ciclo de vida.
-- Auto-popula na 1a abertura do cerebro via RPC (ver garantir_plano).

CREATE TABLE IF NOT EXISTS pinguim.cerebro_plano_categoria (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id         uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  categoria_slug     text NOT NULL REFERENCES pinguim.cerebro_categorias_catalogo(slug),
  status_automacao   text NOT NULL DEFAULT 'sem_coleta',
                     -- 'sem_coleta' | 'planejada' | 'em_construcao' | 'rodando' | 'pausada' | 'falhou'
  origem_configurada text,        -- "Hotmart Members API" | "Google Drive pasta X" | "manual" | etc
  schedule_cron      text,        -- "0 4 * * *"
  schedule_descricao text,        -- "todo dia 04h BRT"
  ferramenta         text,        -- "Edge tool-ingerir-aulas + cron"
  responsavel        text,        -- nome do socio responsavel
  ultima_execucao    timestamptz, -- preenchido pelo worker quando cron rodar (futuro)
  ultimo_status_run  text,        -- 'ok' | 'falha' | null
  notas              text,        -- texto livre da reuniao
  prioridade         integer DEFAULT 0,  -- ordenacao manual
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cerebro_id, categoria_slug)
);

CREATE INDEX IF NOT EXISTS idx_plano_cat_cerebro ON pinguim.cerebro_plano_categoria (cerebro_id, status_automacao);

COMMENT ON TABLE pinguim.cerebro_plano_categoria IS
  'V3 — Plano de automacao por (cerebro, categoria). 1 linha = 1 categoria do cerebro com seu ciclo de vida.';

-- ============================================================
-- 3) RPC: garantir que cerebro tem 1 linha por categoria do catalogo
-- ============================================================
-- Chamada na 1a abertura do cerebro (ou sempre que abrir — eh idempotente).
-- Categorias com fontes existentes ficam 'rodando' por default (ja tem dado).
-- Categorias sem fonte ficam 'sem_coleta'.

CREATE OR REPLACE FUNCTION pinguim.cerebro_plano_garantir(p_cerebro_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cat record;
  v_qtd integer;
BEGIN
  FOR v_cat IN
    SELECT slug, tipos_fonte FROM pinguim.cerebro_categorias_catalogo WHERE ativa = true
  LOOP
    -- Conta fontes desta categoria neste cerebro
    SELECT count(*) INTO v_qtd
    FROM pinguim.cerebro_fontes f
    WHERE f.cerebro_id = p_cerebro_id
      AND (
        v_cat.tipos_fonte = ARRAY[]::text[] OR f.tipo = ANY(v_cat.tipos_fonte)
      );

    INSERT INTO pinguim.cerebro_plano_categoria (cerebro_id, categoria_slug, status_automacao)
    VALUES (
      p_cerebro_id,
      v_cat.slug,
      CASE WHEN v_qtd > 0 THEN 'rodando' ELSE 'sem_coleta' END
    )
    ON CONFLICT (cerebro_id, categoria_slug) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================
-- 4) RPC: editar plano de uma categoria
-- ============================================================
CREATE OR REPLACE FUNCTION pinguim.cerebro_plano_categoria_editar(
  p_id uuid,
  p_status_automacao text DEFAULT NULL,
  p_origem_configurada text DEFAULT NULL,
  p_schedule_cron text DEFAULT NULL,
  p_schedule_descricao text DEFAULT NULL,
  p_ferramenta text DEFAULT NULL,
  p_responsavel text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_prioridade integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pinguim.cerebro_plano_categoria SET
    status_automacao   = COALESCE(p_status_automacao,   status_automacao),
    origem_configurada = COALESCE(p_origem_configurada, origem_configurada),
    schedule_cron      = COALESCE(p_schedule_cron,      schedule_cron),
    schedule_descricao = COALESCE(p_schedule_descricao, schedule_descricao),
    ferramenta         = COALESCE(p_ferramenta,         ferramenta),
    responsavel        = COALESCE(p_responsavel,        responsavel),
    notas              = COALESCE(p_notas,              notas),
    prioridade         = COALESCE(p_prioridade,         prioridade),
    atualizado_em      = now()
  WHERE id = p_id;
END;
$$;

-- ============================================================
-- 5) RPC: avancar status (botao primario do card)
-- ============================================================
-- Mapa de transicoes:
--   sem_coleta     -> planejada
--   planejada      -> em_construcao
--   em_construcao  -> rodando
--   rodando        -> pausada
--   pausada        -> rodando
--   falhou         -> rodando

CREATE OR REPLACE FUNCTION pinguim.cerebro_plano_categoria_avancar(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_atual text;
  v_proximo text;
BEGIN
  SELECT status_automacao INTO v_atual FROM pinguim.cerebro_plano_categoria WHERE id = p_id;
  v_proximo := CASE v_atual
    WHEN 'sem_coleta'    THEN 'planejada'
    WHEN 'planejada'     THEN 'em_construcao'
    WHEN 'em_construcao' THEN 'rodando'
    WHEN 'rodando'       THEN 'pausada'
    WHEN 'pausada'       THEN 'rodando'
    WHEN 'falhou'        THEN 'rodando'
    ELSE v_atual
  END;
  UPDATE pinguim.cerebro_plano_categoria
     SET status_automacao = v_proximo, atualizado_em = now()
   WHERE id = p_id;
  RETURN v_proximo;
END;
$$;

-- ============================================================
-- 6) View: snapshot pronto pra UI por (cerebro, categoria)
-- ============================================================
-- Junta plano + catalogo + count atual de fontes vetorizadas + freshness real.

CREATE OR REPLACE VIEW pinguim.vw_cerebro_plano_categoria AS
SELECT
  p.id                                  AS plano_id,
  p.cerebro_id,
  c.slug                                AS categoria_slug,
  c.nome                                AS categoria_nome,
  c.emoji                               AS categoria_emoji,
  c.descricao                           AS categoria_descricao,
  c.tipos_fonte                         AS categoria_tipos_fonte,
  c.ordem                               AS categoria_ordem,
  p.status_automacao,
  p.origem_configurada,
  p.schedule_cron,
  p.schedule_descricao,
  p.ferramenta,
  p.responsavel,
  p.ultima_execucao,
  p.ultimo_status_run,
  p.notas,
  p.prioridade,
  -- Count atual: conta fontes vetorizadas que casam com os tipos da categoria
  (
    SELECT count(*)
    FROM pinguim.cerebro_fontes f
    WHERE f.cerebro_id = p.cerebro_id
      AND (
        c.tipos_fonte = ARRAY[]::text[] OR f.tipo = ANY(c.tipos_fonte)
      )
  )                                     AS qtd_atual,
  -- Freshness real: ultima fonte ingerida desta categoria
  (
    SELECT max(criado_em)
    FROM pinguim.cerebro_fontes f
    WHERE f.cerebro_id = p.cerebro_id
      AND (
        c.tipos_fonte = ARRAY[]::text[] OR f.tipo = ANY(c.tipos_fonte)
      )
  )                                     AS ultima_fonte_em,
  p.atualizado_em
FROM pinguim.cerebro_plano_categoria p
JOIN pinguim.cerebro_categorias_catalogo c ON c.slug = p.categoria_slug
ORDER BY p.cerebro_id, c.ordem;

-- ============================================================
-- 7) Grants
-- ============================================================
GRANT SELECT ON pinguim.cerebro_categorias_catalogo TO service_role, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.cerebro_plano_categoria TO service_role;
GRANT SELECT ON pinguim.vw_cerebro_plano_categoria TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION pinguim.cerebro_plano_garantir TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.cerebro_plano_categoria_editar TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.cerebro_plano_categoria_avancar TO service_role;
