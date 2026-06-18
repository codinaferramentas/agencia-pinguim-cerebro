-- ============================================================
-- schema-024 — Captura semanal de chat WhatsApp de grupos (2026-06-18)
-- ============================================================
-- Caminho A do plano: bot Evolution captura msgs em tempo real via webhook,
-- salva em pinguim.whatsapp_msgs_brutas. Cron domingo 4h BRT consolida
-- ultimos 7 dias num markdown e salva como cerebro_fonte tipo chat_export.
--
-- Cada grupo pode ser monitorado em N cerebros (ex: grupo do Elo pode
-- alimentar tanto cerebro Elo quanto cerebro Andre Pessoal). Cadastro em
-- whatsapp_grupos_monitorados.
-- ============================================================

-- Cadastro de grupos monitorados — qual chat alimenta qual cerebro
CREATE TABLE IF NOT EXISTS pinguim.whatsapp_grupos_monitorados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,                    -- ex: 120363422749349891@g.us
  nome_grupo text NOT NULL,                 -- ex: 'CANCELAMENTO COLETIVO | ELO'
  cerebro_id uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  categoria_slug text NOT NULL DEFAULT 'chat_whatsapp',
  ativo boolean NOT NULL DEFAULT true,
  evolution_instancia text NOT NULL DEFAULT 'Agente Pinguim',
  schedule_cron text NOT NULL DEFAULT '0 7 * * 0',  -- domingo 4h BRT (7h UTC)
  janela_dias integer NOT NULL DEFAULT 7,
  notas text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, cerebro_id, categoria_slug)
);

CREATE INDEX IF NOT EXISTS idx_wa_grupos_ativo ON pinguim.whatsapp_grupos_monitorados(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_wa_grupos_chat ON pinguim.whatsapp_grupos_monitorados(chat_id);

-- Mensagens brutas capturadas via webhook em tempo real
CREATE TABLE IF NOT EXISTS pinguim.whatsapp_msgs_brutas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,                    -- grupo origem
  message_id text NOT NULL,                 -- id Evolution pra dedup
  autor_telefone text,                      -- 5511XXXX@s.whatsapp.net
  autor_push_name text,                     -- nome que a pessoa colocou no WA
  tipo_msg text NOT NULL,                   -- 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker'
  texto text,                               -- corpo (NULL se for audio/sem texto)
  caption text,                             -- texto que acompanha midia (image/video/doc)
  reply_to_message_id text,                 -- se for resposta a outra msg
  reply_to_autor text,                      -- nome de quem foi respondido
  reply_to_preview text,                    -- preview da msg respondida
  enviada_em timestamptz NOT NULL,          -- timestamp original do WA
  recebida_em timestamptz NOT NULL DEFAULT now(),
  payload_raw jsonb,                        -- payload completo do webhook (pra debug)
  consolidada boolean NOT NULL DEFAULT false, -- true depois que entrou num cerebro_fonte
  UNIQUE (chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_msgs_chat_enviada ON pinguim.whatsapp_msgs_brutas(chat_id, enviada_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_nao_consolidadas ON pinguim.whatsapp_msgs_brutas(chat_id, enviada_em) WHERE consolidada = false;

-- Registro de cada consolidacao executada (audit + idempotencia)
CREATE TABLE IF NOT EXISTS pinguim.whatsapp_consolidacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES pinguim.whatsapp_grupos_monitorados(id) ON DELETE CASCADE,
  cerebro_fonte_id uuid REFERENCES pinguim.cerebro_fontes(id) ON DELETE SET NULL,
  janela_inicio timestamptz NOT NULL,
  janela_fim timestamptz NOT NULL,
  qtd_msgs_periodo integer NOT NULL,
  qtd_autores integer NOT NULL,
  status text NOT NULL,                     -- 'ok' | 'sem_msgs' | 'falhou'
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_consolidacoes_grupo ON pinguim.whatsapp_consolidacoes(grupo_id, criado_em DESC);
