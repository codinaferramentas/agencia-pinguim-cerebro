-- ============================================================
-- V2.14 D — DISCORD WHITELIST + ROLES (sócio/funcionário/cliente)
-- ============================================================
-- Atendente Pinguim responde @ menção no Discord SÓ pra IDs cadastrados.
-- 3 papéis:
--   - socio: 4 sócios (Codina/Pedro/Micha/Luiz) — todas tools
--   - funcionario: time interno (Rafa, Djairo, etc) — escopo operacional
--   - cliente: futuro (V2.16) — consultas básicas
--
-- Permissões: jsonb com mapa de tools permitidas. Default por papel.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pinguim.discord_autorizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL UNIQUE,
  papel text NOT NULL CHECK (papel IN ('socio', 'funcionario', 'cliente')),
  socio_slug text,           -- preenchido só se papel=socio (codina/pedro/micha/luiz)
  cliente_id uuid,           -- preenchido só se papel=socio (resolve via socios.slug)
  nome_discord text NOT NULL, -- nome exibido no Discord (auditoria)
  permissoes jsonb,          -- override de permissões. NULL = usa default do papel.
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discord_autorizados_papel_idx
  ON pinguim.discord_autorizados (papel) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS discord_autorizados_socio_idx
  ON pinguim.discord_autorizados (socio_slug) WHERE ativo = true AND socio_slug IS NOT NULL;

ALTER TABLE pinguim.discord_autorizados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discord_autorizados_all ON pinguim.discord_autorizados;
CREATE POLICY discord_autorizados_all ON pinguim.discord_autorizados
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION pinguim.fn_discord_autorizados_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_discord_autorizados_touch ON pinguim.discord_autorizados;
CREATE TRIGGER trg_discord_autorizados_touch
  BEFORE UPDATE ON pinguim.discord_autorizados
  FOR EACH ROW EXECUTE FUNCTION pinguim.fn_discord_autorizados_touch();

-- Log de tentativas (alguém marcou bot sem estar autorizado)
CREATE TABLE IF NOT EXISTS pinguim.discord_bloqueados (
  id bigserial PRIMARY KEY,
  discord_user_id text NOT NULL,
  nome_discord text,
  canal_id text,
  canal_nome text,
  texto_resumido text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discord_bloqueados_user_idx
  ON pinguim.discord_bloqueados (discord_user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS discord_bloqueados_criado_idx
  ON pinguim.discord_bloqueados (criado_em DESC);

ALTER TABLE pinguim.discord_bloqueados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discord_bloqueados_all ON pinguim.discord_bloqueados;
CREATE POLICY discord_bloqueados_all ON pinguim.discord_bloqueados
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- RPC pra checar autorização rápido
CREATE OR REPLACE FUNCTION pinguim.checar_discord_autorizado(p_user_id text)
RETURNS TABLE (autorizado boolean, papel text, socio_slug text, cliente_id uuid, nome text, permissoes jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public
AS $$
BEGIN
  RETURN QUERY
  SELECT true AS autorizado,
         da.papel,
         da.socio_slug,
         da.cliente_id,
         da.nome_discord AS nome,
         da.permissoes
    FROM pinguim.discord_autorizados da
   WHERE da.discord_user_id = p_user_id AND da.ativo = true
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::jsonb;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pinguim.checar_discord_autorizado(text) TO authenticated, service_role;

-- ============================================================
-- POPULAR whitelist inicial (2026-05-11 noite)
-- ============================================================

-- 4 sócios — discord_user_id capturado posteriormente quando marcarem o bot 1ª vez
-- Por ora deixa placeholder. André autoriza no momento da primeira menção
-- (handler MESSAGE_CREATE captura ID + notifica logs).
-- Cadastra APENAS Codina por enquanto (único confirmado em socios_whatsapp).

-- Os 4 sócios serão capturados via MESSAGE_CREATE quando marcarem o bot.

-- 2 funcionários confirmados (via captura no banco discord_mensagens)
INSERT INTO pinguim.discord_autorizados (discord_user_id, papel, nome_discord, observacao)
VALUES
  ('1083728715726463068', 'funcionario', 'Rafael Sousa', 'Time Pinguim — atendimento/comercial'),
  ('1083731934238228590', 'funcionario', 'Djairo Alves',  'Time Pinguim — atendimento/comercial')
ON CONFLICT (discord_user_id) DO UPDATE SET
  papel = EXCLUDED.papel,
  nome_discord = EXCLUDED.nome_discord,
  observacao = EXCLUDED.observacao,
  ativo = true,
  atualizado_em = now();

COMMIT;

SELECT discord_user_id, papel, socio_slug, nome_discord, ativo
  FROM pinguim.discord_autorizados
 ORDER BY papel, nome_discord;
