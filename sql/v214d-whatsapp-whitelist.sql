-- ============================================================
-- V2.14 D Categoria I — WhatsApp WHITELIST
-- ============================================================
-- Atendente Pinguim só responde números autorizados.
-- Qualquer outro número → silêncio total + log em whatsapp_bloqueados.
--
-- Decisão: tabela nova (não estender pinguim.socios) — permite:
--   - N números por sócio (Andre tem WhatsApp + número de trabalho)
--   - Números de teste (Katia) que não são sócios
--   - Auditoria limpa (cada autorização tem criado_em, criado_por)
--   - Revogação simples (set ativo=false sem deletar histórico)
-- ============================================================

-- 1) WHITELIST — quem PODE falar com o bot
CREATE TABLE IF NOT EXISTS pinguim.whatsapp_autorizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL,                          -- formato Evolution: só dígitos (55DDD9XXXXXXXX)
  socio_slug text,                               -- slug em pinguim.socios (NULL = número de teste sem sócio)
  rotulo text NOT NULL,                          -- "Codina", "Pedro Aredes", "Katia (teste)", etc
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text DEFAULT 'manual'
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_autorizados_numero_idx
  ON pinguim.whatsapp_autorizados (numero);
CREATE INDEX IF NOT EXISTS whatsapp_autorizados_ativo_idx
  ON pinguim.whatsapp_autorizados (ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS whatsapp_autorizados_socio_idx
  ON pinguim.whatsapp_autorizados (socio_slug) WHERE ativo = true;

ALTER TABLE pinguim.whatsapp_autorizados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_autorizados_all ON pinguim.whatsapp_autorizados;
CREATE POLICY whatsapp_autorizados_all ON pinguim.whatsapp_autorizados
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION pinguim.fn_whatsapp_autorizados_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_whatsapp_autorizados_touch ON pinguim.whatsapp_autorizados;
CREATE TRIGGER trg_whatsapp_autorizados_touch
  BEFORE UPDATE ON pinguim.whatsapp_autorizados
  FOR EACH ROW EXECUTE FUNCTION pinguim.fn_whatsapp_autorizados_touch();

-- 2) LOG — quem TENTOU falar e foi bloqueado
CREATE TABLE IF NOT EXISTS pinguim.whatsapp_bloqueados (
  id bigserial PRIMARY KEY,
  numero text NOT NULL,
  push_name text,                                -- nome do WhatsApp que apareceu (se vier)
  texto_resumido text,                           -- primeiros 200 chars da mensagem (auditoria)
  evento text,
  raw_payload jsonb,                             -- payload Evolution completo (compacto)
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_bloqueados_numero_idx
  ON pinguim.whatsapp_bloqueados (numero, criado_em DESC);
CREATE INDEX IF NOT EXISTS whatsapp_bloqueados_criado_idx
  ON pinguim.whatsapp_bloqueados (criado_em DESC);

ALTER TABLE pinguim.whatsapp_bloqueados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_bloqueados_all ON pinguim.whatsapp_bloqueados;
CREATE POLICY whatsapp_bloqueados_all ON pinguim.whatsapp_bloqueados
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 3) RPC pra checagem rápida no webhook (single query)
CREATE OR REPLACE FUNCTION pinguim.checar_whatsapp_autorizado(p_numero text)
RETURNS TABLE (autorizado boolean, socio_slug text, rotulo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    true AS autorizado,
    wa.socio_slug,
    wa.rotulo
  FROM pinguim.whatsapp_autorizados wa
  WHERE wa.numero = p_numero AND wa.ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::text, NULL::text;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pinguim.checar_whatsapp_autorizado(text) TO authenticated, service_role;

-- 4) Popular whitelist inicial (Andre 2026-05-11 noite)
INSERT INTO pinguim.whatsapp_autorizados (numero, socio_slug, rotulo, observacao) VALUES
  ('5511985879361',  'codina', 'Codina (André)',  'Sócio fundador Pinguim, número principal'),
  ('553199900591',   'pedro',  'Pedro Aredes',     'Sócio Pinguim — tráfego/escala'),
  ('553175149048',   'micha',  'Micha Menezes',    'Sócio Pinguim — lo-fi/Reels/audiência'),
  ('553199958307',   'luiz',   'Luiz Cota',        'Sócio fundador estratégico Pinguim'),
  ('5511984290116',  NULL,     'Katia (teste)',    'Número de teste — usado em smoke tests externos')
ON CONFLICT (numero) DO UPDATE SET
  socio_slug = EXCLUDED.socio_slug,
  rotulo = EXCLUDED.rotulo,
  observacao = EXCLUDED.observacao,
  ativo = true,
  atualizado_em = now();
