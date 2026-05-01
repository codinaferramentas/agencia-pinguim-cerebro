-- =====================================================================
-- Cotacoes — USD->BRL atualizada diariamente via AwesomeAPI (gratis)
-- =====================================================================

CREATE TABLE IF NOT EXISTS pinguim.cotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  par text NOT NULL,                           -- 'USD-BRL'
  valor numeric(10, 4) NOT NULL,               -- ex: 5.1234
  fonte text NOT NULL DEFAULT 'awesomeapi',
  capturado_em timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cotacoes_par_data
  ON pinguim.cotacoes(par, capturado_em DESC);

ALTER TABLE pinguim.cotacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cotacoes_select_authenticated ON pinguim.cotacoes;
CREATE POLICY cotacoes_select_authenticated
  ON pinguim.cotacoes FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON pinguim.cotacoes TO authenticated;

-- ---------- RPC: cotacao_atual ----------
-- Devolve a ultima cotacao registrada do par. Se nao tiver nada, retorna 5.10.
CREATE OR REPLACE FUNCTION pinguim.cotacao_atual(p_par text DEFAULT 'USD-BRL')
RETURNS TABLE(par text, valor numeric, capturado_em timestamptz, fonte text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pinguim', 'pg_catalog', 'pg_temp'
AS $$
begin
  return query
  select c.par, c.valor, c.capturado_em, c.fonte
  from pinguim.cotacoes c
  where c.par = p_par
  order by c.capturado_em desc
  limit 1;

  if not found then
    return query
    select p_par, 5.10::numeric, now(), 'fallback-estatico'::text;
  end if;
end;
$$;

GRANT EXECUTE ON FUNCTION pinguim.cotacao_atual(text) TO authenticated;
