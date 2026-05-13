-- ============================================================
-- V2.15.1 — RLS em relatorios_destinatarios + grant na view
-- Andre 2026-05-13: painel Mission Control (Vercel) lê via anon key.
-- Mesmo padrão das outras tabelas pinguim.* (authenticated_all + service_role_all).
-- ============================================================

ALTER TABLE pinguim.relatorios_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY relatorios_destinatarios_authenticated_all
  ON pinguim.relatorios_destinatarios
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY relatorios_destinatarios_service_role_all
  ON pinguim.relatorios_destinatarios
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- View herda permissões da query base. Como view consulta relatorios_config
-- (que já tem policy) + agrega jsonb dos destinatários, precisa de GRANT
-- explícito pro anon/authenticated:
GRANT SELECT ON pinguim.relatorios_config_com_destinatarios TO anon, authenticated;
