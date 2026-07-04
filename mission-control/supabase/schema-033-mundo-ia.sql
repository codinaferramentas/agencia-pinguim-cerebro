-- ============================================================
-- schema-033 — Mundo IA (2026-07-04)
-- ============================================================
-- Monitor de PERFIS/CANAIS de referências e concorrentes.
-- Raspa Instagram (posts/stories) + YouTube (vídeos/lives) dos alvos
-- cadastrados, filtra janela de 24h, transcreve lives (legenda nativa),
-- resume com IA marcando o que é ACIONÁVEL, e entrega às 7h BRT:
--   - HTML no Mission Control (aba 🌎 Mundo IA)
--   - resumo no WhatsApp do dono
--   - "cópia à parte" pronta pro grupo dos sócios (dono dispara)
--
-- NÃO confundir com "Radar IA Diário" (slug radar-ia-diario) — aquele é
-- curadoria de NOTÍCIAS (RSS/HN/Reddit/GitHub). Este monitora PESSOAS.
--
-- Multi-sócio desde o dia 1: tudo tem dono_socio. Cada sócio cadastra
-- seus próprios alvos e recebe seu próprio relatório.
--
-- Fluxo (2 pg_cron chamando edge functions via net.http_post):
--   01h BRT  mundo-ia-motor?fase=raspagem  → popula mundo_ia_capturas
--   07h BRT  mundo-ia-motor?fase=envio     → monta mundo_ia_execucoes + envia
-- ============================================================

-- ------------------------------------------------------------
-- 1) ALVOS — perfis/canais monitorados (gestão via aba no MC)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.mundo_ia_alvos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_socio text NOT NULL,                  -- quem cadastrou (nome do sócio); cada um vê os seus
  tipo text NOT NULL,                        -- 'instagram' | 'youtube'
  handle text NOT NULL,                      -- ex: 'oalanicolas' (sem @, sem url)
  url text NOT NULL,                         -- url canônica do perfil/canal
  apelido text,                              -- rótulo amigável ex: 'Alan Nicolas'
  ativo boolean NOT NULL DEFAULT true,       -- pausar sem apagar
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mundo_ia_alvos_tipo_chk CHECK (tipo IN ('instagram', 'youtube')),
  UNIQUE (dono_socio, tipo, handle)
);

CREATE INDEX IF NOT EXISTS idx_mundo_ia_alvos_ativo ON pinguim.mundo_ia_alvos(dono_socio, ativo) WHERE ativo = true;

-- ------------------------------------------------------------
-- 2) CONFIG — 1 linha por sócio (destino + preferências de envio)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.mundo_ia_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_socio text NOT NULL UNIQUE,
  whatsapp_destino text,                     -- ex: '5511985879361' (só dígitos)
  envia_whatsapp boolean NOT NULL DEFAULT true,
  hora_envio text NOT NULL DEFAULT '07:00',  -- BRT, informativo (schedule real no cron)
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3) CAPTURAS — cada post/vídeo raspado (dedup + histórico)
--    UNIQUE(alvo_id, id_externo) => nunca raspa/transcreve 2x o mesmo item
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.mundo_ia_capturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alvo_id uuid NOT NULL REFERENCES pinguim.mundo_ia_alvos(id) ON DELETE CASCADE,
  tipo text NOT NULL,                        -- 'instagram' | 'youtube'
  subtipo text,                              -- IG: 'post'|'reel'|'sidecar'|'video' ; YT: 'video'|'live'|'stream'
  id_externo text NOT NULL,                  -- IG shortcode ou YT videoId
  url text NOT NULL,
  publicado_em timestamptz,                  -- timestamp original do post/vídeo
  titulo_ou_legenda text,                    -- caption IG / title YT
  transcricao text,                          -- só YT (legenda nativa); NULL pra IG
  midia_url text,                            -- thumbnail/imagem principal
  metadados jsonb,                           -- views/likes/duração/etc
  raspado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alvo_id, id_externo)
);

CREATE INDEX IF NOT EXISTS idx_mundo_ia_capturas_pub ON pinguim.mundo_ia_capturas(publicado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mundo_ia_capturas_alvo ON pinguim.mundo_ia_capturas(alvo_id, publicado_em DESC);

-- ------------------------------------------------------------
-- 4) EXECUÇÕES — cada relatório gerado (o das 7h)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinguim.mundo_ia_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_socio text NOT NULL,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  janela_inicio timestamptz NOT NULL,
  janela_fim timestamptz NOT NULL,
  html text,                                 -- o relatório visual completo
  resumo_grupo text,                         -- a "cópia à parte" pronta pro grupo dos sócios
  total_posts integer NOT NULL DEFAULT 0,
  total_acionaveis integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',         -- 'ok' | 'sem_novidade' | 'falhou'
  erro text,
  enviado_whatsapp boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_mundo_ia_exec_dono ON pinguim.mundo_ia_execucoes(dono_socio, gerado_em DESC);

-- ------------------------------------------------------------
-- 5) RPCs de gestão (SECURITY DEFINER) — chamadas pela aba do MC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.mundo_ia_upsert_alvo(
  p_dono_socio text,
  p_tipo text,
  p_handle text,
  p_url text,
  p_apelido text DEFAULT NULL
) RETURNS pinguim.mundo_ia_alvos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pinguim' AS $$
DECLARE v_row pinguim.mundo_ia_alvos;
BEGIN
  INSERT INTO pinguim.mundo_ia_alvos (dono_socio, tipo, handle, url, apelido)
  VALUES (p_dono_socio, p_tipo, lower(regexp_replace(p_handle, '^@', '')), p_url, p_apelido)
  ON CONFLICT (dono_socio, tipo, handle) DO UPDATE
    SET url = EXCLUDED.url, apelido = EXCLUDED.apelido, ativo = true, atualizado_em = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION pinguim.mundo_ia_toggle_alvo(p_id uuid)
RETURNS pinguim.mundo_ia_alvos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pinguim' AS $$
DECLARE v_row pinguim.mundo_ia_alvos;
BEGIN
  UPDATE pinguim.mundo_ia_alvos SET ativo = NOT ativo, atualizado_em = now()
  WHERE id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION pinguim.mundo_ia_remover_alvo(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pinguim' AS $$
BEGIN
  DELETE FROM pinguim.mundo_ia_alvos WHERE id = p_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION pinguim.mundo_ia_upsert_config(
  p_dono_socio text,
  p_whatsapp_destino text DEFAULT NULL,
  p_envia_whatsapp boolean DEFAULT true,
  p_hora_envio text DEFAULT '07:00'
) RETURNS pinguim.mundo_ia_config
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pinguim' AS $$
DECLARE v_row pinguim.mundo_ia_config;
BEGIN
  INSERT INTO pinguim.mundo_ia_config (dono_socio, whatsapp_destino, envia_whatsapp, hora_envio)
  VALUES (p_dono_socio, p_whatsapp_destino, p_envia_whatsapp, p_hora_envio)
  ON CONFLICT (dono_socio) DO UPDATE
    SET whatsapp_destino = EXCLUDED.whatsapp_destino,
        envia_whatsapp = EXCLUDED.envia_whatsapp,
        hora_envio = EXCLUDED.hora_envio,
        atualizado_em = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

GRANT EXECUTE ON FUNCTION pinguim.mundo_ia_upsert_alvo(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.mundo_ia_toggle_alvo(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.mundo_ia_remover_alvo(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.mundo_ia_upsert_config(text,text,boolean,text) TO service_role;

-- ------------------------------------------------------------
-- 6) Agendamento dos 2 crons (raspagem 01h / envio 07h BRT = 04h / 10h UTC)
--    Reusa pinguim.disparar_edge_function (net.http_post pra edge).
--    OBS: disparar_edge_function só passa body {} — a edge decide a fase
--    pela query string ?fase=... embutida no nome? Não: net.http_post usa
--    url = base/functions/v1/<nome>. Então criamos wrapper que passa fase.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.mundo_ia_disparar(p_fase text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pinguim', 'vault', 'pg_catalog', 'pg_temp' AS $$
DECLARE
  request_id bigint;
  base_url text := 'https://wmelierxzpjamiofeemh.supabase.co';
  service_key text;
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'pinguim_service_role_key' LIMIT 1;
  IF service_key IS NULL OR service_key = 'PLACEHOLDER_SUBSTITUIR_VIA_DASHBOARD' THEN
    RAISE NOTICE 'service_role_key nao configurado no vault.';
    RETURN 0;
  END IF;

  SELECT net.http_post(
    url := base_url || '/functions/v1/mundo-ia-motor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('fase', p_fase),
    timeout_milliseconds := 300000       -- 5 min (raspagem+transcrição pode demorar)
  ) INTO request_id;
  RETURN request_id;
END; $$;

GRANT EXECUTE ON FUNCTION pinguim.mundo_ia_disparar(text) TO service_role;

CREATE OR REPLACE FUNCTION pinguim.mundo_ia_agendar_crons()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pinguim', 'public', 'cron' AS $$
BEGIN
  -- idempotente: desagenda se já existir
  BEGIN PERFORM cron.unschedule('mundo-ia-raspagem'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('mundo-ia-envio');    EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 01h BRT = 04h UTC (raspagem de madrugada)
  PERFORM cron.schedule('mundo-ia-raspagem', '0 4 * * *',
    $cmd$ SELECT pinguim.mundo_ia_disparar('raspagem'); $cmd$);
  -- 07h BRT = 10h UTC (montagem + envio)
  PERFORM cron.schedule('mundo-ia-envio', '0 10 * * *',
    $cmd$ SELECT pinguim.mundo_ia_disparar('envio'); $cmd$);

  RETURN 'crons mundo-ia agendados: raspagem 04h UTC, envio 10h UTC';
END; $$;

CREATE OR REPLACE FUNCTION pinguim.mundo_ia_desagendar_crons()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pinguim', 'public', 'cron' AS $$
BEGIN
  BEGIN PERFORM cron.unschedule('mundo-ia-raspagem'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('mundo-ia-envio');    EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN 'crons mundo-ia desagendados';
END; $$;

GRANT EXECUTE ON FUNCTION pinguim.mundo_ia_agendar_crons() TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.mundo_ia_desagendar_crons() TO service_role;
