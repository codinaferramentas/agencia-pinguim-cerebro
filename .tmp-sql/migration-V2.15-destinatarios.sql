-- ============================================================
-- V2.15 Multi-destinatário (Andre 2026-05-13)
-- Substitui whatsapp_numero/email_destino (1 só) por tabela
-- relacional com N destinatários por agendamento.
-- ============================================================

CREATE TABLE IF NOT EXISTS pinguim.relatorios_destinatarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relatorio_id  uuid NOT NULL REFERENCES pinguim.relatorios_config(id) ON DELETE CASCADE,
  canal         text NOT NULL CHECK (canal IN ('whatsapp', 'email', 'discord', 'telegram')),
  valor         text NOT NULL,         -- numero (whatsapp/telegram), email, canal_id (discord)
  nome          text,                  -- "André", "Luiz" — opcional, só pra UI
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (relatorio_id, canal, valor)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_destinatarios_relatorio
  ON pinguim.relatorios_destinatarios(relatorio_id) WHERE ativo = true;

-- Migração dos dados existentes:
-- Pra cada relatorio_config com whatsapp_numero, cria 1 destinatário
INSERT INTO pinguim.relatorios_destinatarios (relatorio_id, canal, valor, nome, ativo)
SELECT
  id,
  'whatsapp',
  whatsapp_numero,
  'Sócio',
  true
FROM pinguim.relatorios_config
WHERE whatsapp_numero IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pinguim.relatorios_destinatarios d
    WHERE d.relatorio_id = relatorios_config.id
      AND d.canal = 'whatsapp'
      AND d.valor = relatorios_config.whatsapp_numero
  );

INSERT INTO pinguim.relatorios_destinatarios (relatorio_id, canal, valor, nome, ativo)
SELECT
  id,
  'email',
  email_destino,
  'Sócio',
  true
FROM pinguim.relatorios_config
WHERE email_destino IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pinguim.relatorios_destinatarios d
    WHERE d.relatorio_id = relatorios_config.id
      AND d.canal = 'email'
      AND d.valor = relatorios_config.email_destino
  );

-- Não dropamos whatsapp_numero/email_destino ainda — worker antigo ainda lê deles.
-- Frente seguinte: migrar worker pra usar tabela, depois remover colunas legadas.

-- ============================================================
-- View pra consulta rápida (usada pelo worker e UI)
-- ============================================================
CREATE OR REPLACE VIEW pinguim.relatorios_config_com_destinatarios AS
SELECT
  c.*,
  COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'canal', d.canal,
        'valor', d.valor,
        'nome', d.nome,
        'ativo', d.ativo
      ) ORDER BY d.criado_em
    )
    FROM pinguim.relatorios_destinatarios d
    WHERE d.relatorio_id = c.id AND d.ativo = true),
    '[]'::jsonb
  ) AS destinatarios
FROM pinguim.relatorios_config c;
