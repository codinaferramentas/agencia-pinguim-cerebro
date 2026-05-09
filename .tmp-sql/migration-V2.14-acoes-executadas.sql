-- V2.14 Frente D — Camada B anti-duplicacao
-- Tabela de acoes destrutivas executadas (gmail send, drive editar, etc)
-- Antes de executar, agente checa se hash ja foi disparado nas ultimas N min.

CREATE TABLE IF NOT EXISTS pinguim.acoes_executadas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid        NOT NULL,
  tipo_acao       text        NOT NULL,                    -- 'gmail-enviar', 'gmail-modificar', 'drive-editar', 'calendar-criar', etc
  hash_acao       text        NOT NULL,                    -- sha256(tipo + destino + corpo_normalizado)
  destino         text,                                     -- email destinatario, fileId, eventId, etc (legivel pra debug)
  resumo          text,                                     -- assunto/breve descricao pra log humano
  origem_canal    text        NOT NULL CHECK (origem_canal IN ('chat-web','whatsapp','telegram','discord','cron','admin')),
  origem_message_id text,                                   -- id da msg que disparou (whatsapp/discord/etc)
  status          text        NOT NULL DEFAULT 'sucesso' CHECK (status IN ('sucesso','falhou','bloqueado_duplicata')),
  motivo          text,                                     -- detalhe se falhou ou bloqueou
  metadata        jsonb       DEFAULT '{}'::jsonb,
  executada_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acoes_executadas_hash_recente_idx
  ON pinguim.acoes_executadas (cliente_id, hash_acao, executada_em DESC)
  WHERE status = 'sucesso';

CREATE INDEX IF NOT EXISTS acoes_executadas_tipo_idx
  ON pinguim.acoes_executadas (tipo_acao, executada_em DESC);

ALTER TABLE pinguim.acoes_executadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_full ON pinguim.acoes_executadas;
CREATE POLICY service_role_full ON pinguim.acoes_executadas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC: checa se mesma acao ja foi executada nas ultimas N minutos
CREATE OR REPLACE FUNCTION pinguim.checar_acao_duplicada(
  p_cliente_id uuid,
  p_hash_acao text,
  p_janela_min int DEFAULT 5
) RETURNS TABLE (
  duplicata boolean,
  acao_anterior_id uuid,
  acao_anterior_em timestamptz,
  minutos_atras numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
BEGIN
  RETURN QUERY
  SELECT
    true AS duplicata,
    a.id AS acao_anterior_id,
    a.executada_em AS acao_anterior_em,
    extract(epoch from (now() - a.executada_em)) / 60 AS minutos_atras
  FROM pinguim.acoes_executadas a
  WHERE a.cliente_id = p_cliente_id
    AND a.hash_acao = p_hash_acao
    AND a.status = 'sucesso'
    AND a.executada_em >= now() - (p_janela_min || ' minutes')::interval
  ORDER BY a.executada_em DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::timestamptz, NULL::numeric;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION pinguim.checar_acao_duplicada TO service_role;

SELECT 'pinguim.acoes_executadas criada' AS status,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='pinguim' AND table_name='acoes_executadas') AS cols;
