-- =====================================================================
-- webhook_logs — toda chamada recebida em qualquer webhook do Pinguim
-- =====================================================================
-- Fase 1 do Customer Profile: capturar payloads brutos pra entender
-- formato real do Clint antes de escrever parser.
--
-- Mantem ultimos 1000 registros (cleanup manual ou cron futuro).
-- =====================================================================

CREATE TABLE IF NOT EXISTS pinguim.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,                          -- 'clint' | 'hotmart' | etc
  endpoint text NOT NULL,                        -- nome da edge function
  status_resposta integer NOT NULL,              -- 200 | 401 | 500 | etc
  metodo text NOT NULL DEFAULT 'POST',
  ip text,
  headers jsonb DEFAULT '{}'::jsonb,
  query_params jsonb DEFAULT '{}'::jsonb,
  payload jsonb,                                 -- corpo bruto do request
  erro text,                                     -- se status != 2xx
  duracao_ms integer,
  recebido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_origem_data
  ON pinguim.webhook_logs(origem, recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status
  ON pinguim.webhook_logs(status_resposta);

ALTER TABLE pinguim.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_logs_authenticated ON pinguim.webhook_logs;
CREATE POLICY webhook_logs_authenticated ON pinguim.webhook_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.webhook_logs TO authenticated;

-- ---------- RPC: listar logs paginados pra UI ----------
CREATE OR REPLACE FUNCTION pinguim.listar_webhook_logs(
  p_origem text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  origem text,
  endpoint text,
  status_resposta integer,
  metodo text,
  query_params jsonb,
  payload jsonb,
  erro text,
  duracao_ms integer,
  recebido_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  select id, origem, endpoint, status_resposta, metodo,
         query_params, payload, erro, duracao_ms, recebido_em
  from pinguim.webhook_logs
  where (p_origem is null or origem = p_origem)
  order by recebido_em desc
  limit p_limit;
$$;

GRANT EXECUTE ON FUNCTION pinguim.listar_webhook_logs(text, integer) TO authenticated;

-- ---------- RPC: stats rapidos ----------
CREATE OR REPLACE FUNCTION pinguim.stats_webhook_logs(p_origem text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  select jsonb_build_object(
    'total', (select count(*) from pinguim.webhook_logs where p_origem is null or origem = p_origem),
    'hoje', (select count(*) from pinguim.webhook_logs where recebido_em >= current_date and (p_origem is null or origem = p_origem)),
    'ok_24h', (select count(*) from pinguim.webhook_logs where recebido_em >= now() - interval '24 hours' and status_resposta < 300 and (p_origem is null or origem = p_origem)),
    'erro_24h', (select count(*) from pinguim.webhook_logs where recebido_em >= now() - interval '24 hours' and status_resposta >= 400 and (p_origem is null or origem = p_origem)),
    'ultimo', (select recebido_em from pinguim.webhook_logs where p_origem is null or origem = p_origem order by recebido_em desc limit 1)
  );
$$;

GRANT EXECUTE ON FUNCTION pinguim.stats_webhook_logs(text) TO authenticated;
