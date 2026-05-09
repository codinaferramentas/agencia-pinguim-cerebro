-- V2.14 Frente D — WhatsApp Evolution
-- Tabela de auditoria de mensagens recebidas/enviadas via Evolution API.
-- Princ 12: persistencia banco, nunca RAM. RLS service_role.

CREATE TABLE IF NOT EXISTS pinguim.whatsapp_mensagens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      text        NOT NULL,                    -- ID da mensagem Evolution
  instancia       text        NOT NULL,                    -- nome da instancia Evolution
  direcao         text        NOT NULL CHECK (direcao IN ('recebida','enviada')),
  remote_jid      text        NOT NULL,                    -- 5511...@s.whatsapp.net (ou @g.us)
  numero_remetente text       NOT NULL,                    -- so digitos
  push_name       text,                                     -- nome no perfil WhatsApp
  is_group        boolean     NOT NULL DEFAULT false,
  is_status       boolean     NOT NULL DEFAULT false,
  tipo            text        NOT NULL,                    -- texto/imagem/video/audio/documento/sticker
  texto           text,                                     -- conteudo extraido (ou caption)
  texto_len       int         GENERATED ALWAYS AS (length(coalesce(texto,''))) STORED,
  -- Resposta gerada (so quando direcao='recebida' e foi processada)
  cliente_id      uuid,                                     -- sócio destinatario (resolvido via SOCIO_SLUG)
  thread_id       text,                                     -- thread no chat web (pra continuidade entre canais)
  resposta_id     uuid,                                     -- aponta pra mensagem 'enviada' que respondeu esta
  processada      boolean     NOT NULL DEFAULT false,
  processada_em   timestamptz,
  latencia_ms     int,                                      -- tempo do recebimento ate envio da resposta
  erro            text,                                     -- se processamento falhou
  -- Timing
  postada_em      timestamptz NOT NULL,                    -- quando o user postou (timestamp_evt)
  ingerida_em     timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb       DEFAULT '{}'::jsonb,         -- payload bruto pra debug
  -- Dedup
  UNIQUE (message_id, direcao)
);

CREATE INDEX IF NOT EXISTS whatsapp_mensagens_postada_idx   ON pinguim.whatsapp_mensagens (postada_em DESC);
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_remote_idx    ON pinguim.whatsapp_mensagens (remote_jid, postada_em DESC);
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_cliente_idx   ON pinguim.whatsapp_mensagens (cliente_id, postada_em DESC);
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_processada_idx ON pinguim.whatsapp_mensagens (processada) WHERE processada = false;

ALTER TABLE pinguim.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_full ON pinguim.whatsapp_mensagens;
CREATE POLICY service_role_full ON pinguim.whatsapp_mensagens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Mapeamento numero -> sócio (pra webhook saber qual cliente_id usar)
-- Evita colocar numero no SOCIO_SLUG (que é env var).
CREATE TABLE IF NOT EXISTS pinguim.whatsapp_socios (
  numero          text        PRIMARY KEY,                 -- 5531999900591 (so digitos)
  cliente_id      uuid        NOT NULL,
  socio_slug      text,
  apelido         text,                                     -- "Codina", "Luiz", etc
  ativo           boolean     NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pinguim.whatsapp_socios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_full ON pinguim.whatsapp_socios;
CREATE POLICY service_role_full ON pinguim.whatsapp_socios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT 'pinguim.whatsapp_mensagens criada' as status,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='pinguim' AND table_name='whatsapp_mensagens') as cols_msg,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='pinguim' AND table_name='whatsapp_socios') as cols_socios;
