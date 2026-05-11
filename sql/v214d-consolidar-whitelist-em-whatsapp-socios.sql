-- ============================================================
-- V2.14 D Categoria I — CONSOLIDAÇÃO: usar whatsapp_socios (canônica)
-- ============================================================
-- Erro detectado 2026-05-11: criei whatsapp_autorizados redundante.
-- Tabela canônica é pinguim.whatsapp_socios (existe desde 2026-05-09).
--
-- Plano:
--   1. Estender whatsapp_socios com observacao
--   2. Migrar 5 números da whatsapp_autorizados pra whatsapp_socios
--      (resolvendo cliente_id via pinguim.socios.slug)
--   3. Criar/recriar checar_whatsapp_autorizado lendo da canônica
--   4. Dropar whatsapp_autorizados
--   5. Tabela whatsapp_bloqueados continua (essa é log novo, não existia)
-- ============================================================

BEGIN;

-- 1) Estender whatsapp_socios
ALTER TABLE pinguim.whatsapp_socios
  ADD COLUMN IF NOT EXISTS observacao text;

-- Trigger de atualizado_em (caso ainda não exista)
CREATE OR REPLACE FUNCTION pinguim.fn_whatsapp_socios_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_whatsapp_socios_touch ON pinguim.whatsapp_socios;
CREATE TRIGGER trg_whatsapp_socios_touch
  BEFORE UPDATE ON pinguim.whatsapp_socios
  FOR EACH ROW EXECUTE FUNCTION pinguim.fn_whatsapp_socios_touch();

-- 2) Migrar 5 números da whatsapp_autorizados pra whatsapp_socios
-- Resolve cliente_id via JOIN com pinguim.socios.slug
-- Pra Katia (teste) que NÃO tem sócio, usa cliente_id do Codina (fallback —
-- cliente_id é NOT NULL no schema; Katia é "convidada" do Codina pra teste).
INSERT INTO pinguim.whatsapp_socios (numero, cliente_id, socio_slug, apelido, observacao, ativo)
SELECT
  wa.numero,
  COALESCE(s.cliente_id, (SELECT cliente_id FROM pinguim.socios WHERE slug='codina')) AS cliente_id,
  wa.socio_slug,
  wa.rotulo,
  wa.observacao,
  wa.ativo
FROM pinguim.whatsapp_autorizados wa
LEFT JOIN pinguim.socios s ON s.slug = wa.socio_slug AND s.ativo = true
ON CONFLICT (numero) DO UPDATE SET
  cliente_id = EXCLUDED.cliente_id,
  socio_slug = EXCLUDED.socio_slug,
  apelido = EXCLUDED.apelido,
  observacao = EXCLUDED.observacao,
  ativo = EXCLUDED.ativo,
  atualizado_em = now();

-- 3) Recriar RPC checar_whatsapp_autorizado lendo da canônica
-- DROP antes porque return type mudou (adicionei cliente_id)
DROP FUNCTION IF EXISTS pinguim.checar_whatsapp_autorizado(text);

CREATE OR REPLACE FUNCTION pinguim.checar_whatsapp_autorizado(p_numero text)
RETURNS TABLE (autorizado boolean, socio_slug text, rotulo text, cliente_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    true AS autorizado,
    ws.socio_slug,
    ws.apelido AS rotulo,
    ws.cliente_id
  FROM pinguim.whatsapp_socios ws
  WHERE ws.numero = p_numero AND ws.ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::text, NULL::text, NULL::uuid;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pinguim.checar_whatsapp_autorizado(text) TO authenticated, service_role;

-- 4) Drop trigger antigo (vinculado à tabela que vai sumir)
DROP TRIGGER IF EXISTS trg_whatsapp_autorizados_touch ON pinguim.whatsapp_autorizados;
DROP FUNCTION IF EXISTS pinguim.fn_whatsapp_autorizados_touch();

-- 5) Dropar whatsapp_autorizados (errada/duplicada)
DROP TABLE IF EXISTS pinguim.whatsapp_autorizados;

COMMIT;

-- Verificação
SELECT numero, cliente_id, socio_slug, apelido, ativo
  FROM pinguim.whatsapp_socios
 ORDER BY apelido;
