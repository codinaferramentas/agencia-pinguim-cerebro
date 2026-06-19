-- ============================================================
-- schema-031 — N origens por categoria (2026-06-19)
-- ============================================================
-- Feedback Andre: ProAlt tem 2 pesquisas (entrada + mensal de dores).
-- Hoje cerebro_plano_categoria so guarda 1 origem (origem_pasta_drive_id
-- + origem_configurada). Vamos pra modelo 1:N com tabela dedicada.
--
-- Regra universal: qualquer categoria pode ter N origens. Webhook diferencia
-- via ?origem_id=Y. Pasta Drive diferencia via path. Cada origem tem label.
-- ============================================================

CREATE TABLE IF NOT EXISTS pinguim.cerebro_plano_categoria_origens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES pinguim.cerebro_plano_categoria(id) ON DELETE CASCADE,
  label text NOT NULL,                  -- "Pesquisa entrada", "Pesquisa mensal dores", etc
  origem_tipo text NOT NULL,            -- 'webhook_yaforms' | 'drive_pasta' | 'url_pagina' | 'discord_canal' | 'whatsapp_grupo'
  origem_valor text,                    -- URL/pasta_id/canal_id/grupo_chat_id
  origem_extras jsonb,                  -- metadata especifica do tipo (ex: parser, periodicidade)
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  ultima_execucao timestamptz,
  ultimo_status_run text,
  qtd_fontes_geradas int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_origens_plano ON pinguim.cerebro_plano_categoria_origens(plano_id);
CREATE INDEX IF NOT EXISTS idx_origens_tipo  ON pinguim.cerebro_plano_categoria_origens(origem_tipo);
CREATE INDEX IF NOT EXISTS idx_origens_ativo ON pinguim.cerebro_plano_categoria_origens(ativo) WHERE ativo = true;

COMMENT ON TABLE pinguim.cerebro_plano_categoria_origens IS
  '1:N origens por categoria. Webhook usa id pra distinguir entre as origens.';

-- Migracao: pra cada cerebro_plano_categoria com origem ja configurada,
-- cria uma origem padrao (label baseada em origem_configurada).
INSERT INTO pinguim.cerebro_plano_categoria_origens
  (plano_id, label, origem_tipo, origem_valor, ordem, criado_em)
SELECT
  cpc.id,
  COALESCE(
    NULLIF(cpc.origem_configurada, ''),
    'Origem padrao'
  ) AS label,
  CASE
    WHEN cpc.trigger_tipo = 'webhook' THEN 'webhook_yaforms'
    WHEN cpc.origem_pasta_drive_id IS NOT NULL THEN 'drive_pasta'
    WHEN cpc.categoria_slug = 'paginas_venda' THEN 'url_pagina'
    ELSE 'manual'
  END AS origem_tipo,
  COALESCE(cpc.origem_pasta_drive_id, '') AS origem_valor,
  0 AS ordem,
  now()
  FROM pinguim.cerebro_plano_categoria cpc
 WHERE (cpc.origem_pasta_drive_id IS NOT NULL OR cpc.trigger_tipo = 'webhook' OR cpc.status_automacao = 'ativo')
   AND NOT EXISTS (
     SELECT 1 FROM pinguim.cerebro_plano_categoria_origens o WHERE o.plano_id = cpc.id
   );

-- RPCs

CREATE OR REPLACE FUNCTION pinguim.categoria_origem_adicionar(
  p_plano_id uuid,
  p_label text,
  p_origem_tipo text,
  p_origem_valor text DEFAULT NULL,
  p_origem_extras jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
DECLARE
  v_id uuid;
  v_ordem int;
BEGIN
  SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_ordem
    FROM pinguim.cerebro_plano_categoria_origens
   WHERE plano_id = p_plano_id;

  INSERT INTO pinguim.cerebro_plano_categoria_origens
    (plano_id, label, origem_tipo, origem_valor, origem_extras, ordem)
  VALUES (p_plano_id, p_label, p_origem_tipo, p_origem_valor, p_origem_extras, v_ordem)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION pinguim.categoria_origem_adicionar(uuid, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION pinguim.categoria_origem_remover(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
BEGIN
  DELETE FROM pinguim.cerebro_plano_categoria_origens WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION pinguim.categoria_origem_remover(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION pinguim.categoria_origens_listar(p_plano_id uuid)
RETURNS TABLE (
  id uuid, label text, origem_tipo text, origem_valor text,
  origem_extras jsonb, ativo boolean, ordem int,
  ultima_execucao timestamptz, ultimo_status_run text, qtd_fontes_geradas int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  SELECT id, label, origem_tipo, origem_valor, origem_extras, ativo, ordem,
         ultima_execucao, ultimo_status_run, qtd_fontes_geradas
    FROM pinguim.cerebro_plano_categoria_origens
   WHERE plano_id = p_plano_id
   ORDER BY ordem, criado_em;
$$;
GRANT EXECUTE ON FUNCTION pinguim.categoria_origens_listar(uuid) TO anon, authenticated;
