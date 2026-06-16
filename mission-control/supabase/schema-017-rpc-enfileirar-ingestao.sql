-- ============================================================
-- schema-017-rpc-enfileirar-ingestao.sql
-- ============================================================
-- RPC pra enfileirar job de ingestao de categoria (midia/whatsapp/etc).
-- Aciona o worker local (server-cli) via pinguim.jobs.
-- ============================================================

CREATE OR REPLACE FUNCTION pinguim.enfileirar_job_ingestao_categoria(
  p_cerebro_id   uuid,
  p_categoria_slug text,
  p_disparado_por text DEFAULT 'manual',  -- 'manual' | 'evento_auto' | 'detector_hibrido'
  p_notificacao_id uuid DEFAULT NULL       -- se veio de uma notificacao pendente, marca essa
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_plano  record;
  v_pedido text;
BEGIN
  -- Pega plano da categoria pra montar payload + validar
  SELECT * INTO v_plano
    FROM pinguim.vw_cerebro_plano_categoria
   WHERE cerebro_id = p_cerebro_id AND categoria_slug = p_categoria_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plano nao encontrado pra cerebro_id=% categoria=%', p_cerebro_id, p_categoria_slug;
  END IF;

  v_pedido := 'Ingerir categoria ' || v_plano.categoria_nome || ' do cerebro ' || p_cerebro_id::text || ' (disparado_por: ' || p_disparado_por || ')';

  INSERT INTO pinguim.jobs (
    tenant_id, cliente_id,
    canal_origem, pedido_original, tipo_pedido,
    plano_json, briefing_resumo, status, aprovado_em
  ) VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
    'mission-control',
    v_pedido,
    'ingerir-categoria-midia',
    jsonb_build_object(
      'cerebro_id', p_cerebro_id,
      'categoria_slug', p_categoria_slug,
      'plano_id', v_plano.plano_id,
      'origem_pasta_drive_id', v_plano.origem_pasta_drive_id,
      'disparado_por', p_disparado_por,
      'notificacao_id', p_notificacao_id
    ),
    'Ingestao ' || v_plano.categoria_nome || ' (' || v_plano.categoria_emoji || ')',
    'aprovado',  -- ja sai aprovado pro worker pegar
    now()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION pinguim.enfileirar_job_ingestao_categoria TO service_role;
