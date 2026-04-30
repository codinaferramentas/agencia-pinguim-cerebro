-- =====================================================================
-- Crons de Seguranca (pg_cron + pg_net)
-- =====================================================================
-- Roda Edge Functions diariamente:
--   03:00 UTC (00:00 BRT) — auditar-seguranca
--   04:00 UTC (01:00 BRT) — raio-x-banco
--
-- Requer extensoes: pg_cron, pg_net (ja habilitadas em projetos Supabase recentes)
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: dispara Edge Function via http
create or replace function pinguim.disparar_edge_function(funcao_nome text)
returns bigint
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
declare
  request_id bigint;
  base_url text := current_setting('app.supabase_url', true);
  service_key text := current_setting('app.supabase_service_role_key', true);
begin
  -- Fallback hardcoded (substituir no projeto via ALTER DATABASE ... SET)
  if base_url is null then
    base_url := 'https://wmelierxzpjamiofeemh.supabase.co';
  end if;

  if service_key is null then
    raise notice 'app.supabase_service_role_key nao setado, abortando.';
    return 0;
  end if;

  select net.http_post(
    url := base_url || '/functions/v1/' || funcao_nome,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into request_id;

  return request_id;
end;
$$;

-- Remove jobs anteriores se existirem (idempotente)
do $$
begin
  perform cron.unschedule('seguranca-auditoria-diaria');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('seguranca-raio-x-diario');
exception when others then null;
end $$;

-- Agenda novos
select cron.schedule(
  'seguranca-auditoria-diaria',
  '0 3 * * *',
  $cron$ select pinguim.disparar_edge_function('auditar-seguranca'); $cron$
);

select cron.schedule(
  'seguranca-raio-x-diario',
  '0 4 * * *',
  $cron$ select pinguim.disparar_edge_function('raio-x-banco'); $cron$
);

-- Para listar jobs ativos:
-- select * from cron.job;
-- Para historico de execucoes:
-- select * from cron.job_run_details order by start_time desc limit 20;
