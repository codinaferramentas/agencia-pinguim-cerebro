-- V2.13 Fase Identidade — tabela pinguim.socios
-- Mapeia SOCIO_SLUG (env) -> cliente_id real do banco.
-- Codina mantém placeholder antigo pra preservar 73 conversas + entregavel + OAuth refresh
-- ja registrados sob aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.

CREATE TABLE IF NOT EXISTS pinguim.socios (
  cliente_id   uuid PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  nome         text NOT NULL,
  email        text,
  empresa      text DEFAULT 'pinguim',  -- 'pinguim' ou 'dolphin'
  ativo        boolean DEFAULT true,
  criado_em    timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now()
);

-- RLS — segue padrão Squad Cyber
ALTER TABLE pinguim.socios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS socios_service_all ON pinguim.socios;
CREATE POLICY socios_service_all ON pinguim.socios
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS socios_authenticated_select ON pinguim.socios;
CREATE POLICY socios_authenticated_select ON pinguim.socios
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Insere os 4 socios. Codina mantem placeholder pra preservar historico.
INSERT INTO pinguim.socios (cliente_id, slug, nome, email, empresa) VALUES
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'codina', 'Codina (Dolphin)', 'contato@agenciapinguim.com', 'dolphin'),
  (gen_random_uuid(), 'luiz',  'Luiz Cota',     NULL, 'pinguim'),
  (gen_random_uuid(), 'micha', 'Micha Menezes', NULL, 'pinguim'),
  (gen_random_uuid(), 'pedro', 'Pedro Aredes',  NULL, 'pinguim')
ON CONFLICT (slug) DO NOTHING;

-- Verifica
SELECT slug, nome, empresa, cliente_id, ativo FROM pinguim.socios ORDER BY criado_em;
