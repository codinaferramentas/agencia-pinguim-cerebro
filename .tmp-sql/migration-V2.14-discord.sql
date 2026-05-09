-- V2.14 Frente B — Discord ingest
-- Tabela onde o bot grava cada mensagem em tempo real (via Gateway WebSocket).
-- Skill discord-24h le esta tabela pra montar resumo das ultimas 24h.

CREATE TABLE IF NOT EXISTS pinguim.discord_mensagens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      text        NOT NULL UNIQUE,        -- id Discord (snowflake)
  guild_id        text        NOT NULL,                -- server id
  guild_nome      text,                                 -- denormalizado pra leitura
  canal_id        text        NOT NULL,
  canal_nome      text,                                 -- denormalizado
  canal_tipo      text,                                 -- 'text', 'thread', 'forum_post', etc
  parent_canal_id text,                                 -- se for thread, qual canal-pai
  autor_id        text        NOT NULL,
  autor_nome      text,                                 -- display_name ou username
  autor_bot       boolean     NOT NULL DEFAULT false,   -- pra excluir bots no resumo
  conteudo        text,                                 -- texto da mensagem
  conteudo_len    int         GENERATED ALWAYS AS (length(coalesce(conteudo, ''))) STORED,
  postado_em      timestamptz NOT NULL,                 -- quando o user postou (Discord timestamp)
  editado_em      timestamptz,
  -- Metadados de relevancia (Munger — pontos de atencao)
  mencoes_users   text[]      DEFAULT '{}',             -- @user mencionados
  mencoes_roles   text[]      DEFAULT '{}',             -- @role mencionados
  menciona_everyone boolean   DEFAULT false,
  reacoes_qtd     int         DEFAULT 0,                -- soma de reacoes (atualizado quando MESSAGE_REACTION_ADD)
  thread_id       text,                                 -- se virou thread, id da thread
  anexos_qtd      int         DEFAULT 0,
  embed_qtd       int         DEFAULT 0,
  -- Anti-DM/anti-spam
  ingerido_em     timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb       DEFAULT '{}'::jsonb       -- payload bruto pra debug futuro
);

-- Indices pra queries do resumo 24h (canal+janela) e Atendente (palavra-chave)
CREATE INDEX IF NOT EXISTS discord_mensagens_postado_em_idx ON pinguim.discord_mensagens (postado_em DESC);
CREATE INDEX IF NOT EXISTS discord_mensagens_canal_idx       ON pinguim.discord_mensagens (canal_id, postado_em DESC);
CREATE INDEX IF NOT EXISTS discord_mensagens_guild_idx       ON pinguim.discord_mensagens (guild_id, postado_em DESC);
-- Trigram pra busca por palavra-chave (extension pode nao estar disponivel — opcional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS discord_mensagens_conteudo_trgm
      ON pinguim.discord_mensagens USING gin (conteudo gin_trgm_ops);
  END IF;
END$$;

-- RLS — cofre Pinguim padrao (Squad Cyber)
ALTER TABLE pinguim.discord_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full ON pinguim.discord_mensagens;
CREATE POLICY service_role_full ON pinguim.discord_mensagens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Atualiza catalogo: discord-24h vai virar ATIVO quando Skill estiver pronta
UPDATE pinguim.relatorios_modulos
SET bloqueio_motivo = 'Skill em construcao — bot Discord ja conectado, falta Skill discord-24h'
WHERE slug = 'discord-24h' AND status = 'em_construcao';

-- Sanity check
SELECT 'pinguim.discord_mensagens criada' as status,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='pinguim' AND table_name='discord_mensagens') as cols;
