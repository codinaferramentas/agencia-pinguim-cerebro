-- ============================================================================
-- pinguim.discord_canais — cadastro centralizado de webhooks Discord
-- ============================================================================
-- Cada canal cadastrado tem um slug curto que o agente usa como referencia
-- ("vendas", "alertas", "bot-testes"). A Edge Function enviar-mensagem-discord
-- resolve o slug em webhook_url na hora de mandar.
--
-- ambiente: 'teste' | 'producao' — Playground sempre usa teste por default
-- ============================================================================

CREATE TABLE IF NOT EXISTS pinguim.discord_canais (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  nome            text NOT NULL,
  webhook_url     text NOT NULL,
  ambiente        text NOT NULL DEFAULT 'producao',
  descricao       text,
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discord_canais_ambiente_check') THEN
    ALTER TABLE pinguim.discord_canais
      ADD CONSTRAINT discord_canais_ambiente_check
      CHECK (ambiente IN ('teste', 'producao'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS discord_canais_slug_idx ON pinguim.discord_canais (slug);
CREATE INDEX IF NOT EXISTS discord_canais_ativo_idx ON pinguim.discord_canais (ativo);

-- RLS
ALTER TABLE pinguim.discord_canais ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='pinguim' AND tablename='discord_canais' AND policyname='discord_canais_authenticated_all') THEN
    CREATE POLICY discord_canais_authenticated_all ON pinguim.discord_canais FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Trigger atualizado_em
DROP TRIGGER IF EXISTS discord_canais_set_atualizado ON pinguim.discord_canais;
CREATE TRIGGER discord_canais_set_atualizado
  BEFORE UPDATE ON pinguim.discord_canais
  FOR EACH ROW EXECUTE FUNCTION pinguim.set_atualizado_em();
