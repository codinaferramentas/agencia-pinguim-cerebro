-- ============================================================================
-- SEGURANÇA: Ligar RLS em todas as tabelas do schema pinguim
-- ============================================================================
-- Objetivo: anon key não pode mais ler/escrever nada. Só usuário AUTENTICADO
-- (com login via Supabase Auth) tem acesso. Service_role continua bypassando.
--
-- Rode esta vez inteira. É idempotente (pode rodar múltiplas vezes sem efeito
-- colateral).
-- ============================================================================

-- -------- 1) Ligar RLS nas 12 tabelas --------
ALTER TABLE pinguim.agentes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.cerebro_fontes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.cerebro_fontes_chunks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.cerebros               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.crons                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.ingest_arquivos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.ingest_lotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.perfis                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.produtos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.skills                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.squads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.tasks                  ENABLE ROW LEVEL SECURITY;

-- -------- 2) Policies: 'authenticated' pode tudo, anon nada --------
-- Drop + create garante idempotência.

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'agentes','cerebro_fontes','cerebro_fontes_chunks','cerebros','crons',
    'ingest_arquivos','ingest_lotes','perfis','produtos','skills','squads','tasks'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON pinguim.%I;', t);
    EXECUTE format(
      'CREATE POLICY authenticated_all ON pinguim.%I
         FOR ALL TO authenticated
         USING (true) WITH CHECK (true);', t
    );
  END LOOP;
END $$;

-- -------- 3) Verificação --------
-- Deve retornar 12 tabelas, todas com rowsecurity=true
SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'RLS ON' ELSE 'RLS OFF' END as status,
  (SELECT count(*) FROM pg_policies WHERE schemaname='pinguim' AND tablename=t.tablename) as policies_count
FROM pg_tables t
WHERE schemaname = 'pinguim'
ORDER BY tablename;
