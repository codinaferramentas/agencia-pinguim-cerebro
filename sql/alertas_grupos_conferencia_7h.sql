-- Versão com corpo (a de 1 argumento segue igual, manda '{}')
create or replace function pinguim.disparar_edge_function(funcao_nome text, corpo jsonb)
returns bigint language plpgsql security definer
set search_path to 'pinguim', 'vault', 'pg_catalog', 'pg_temp'
as $$
declare
  request_id bigint;
  service_key text;
begin
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'pinguim_service_role_key' limit 1;
  if service_key is null or service_key = 'PLACEHOLDER_SUBSTITUIR_VIA_DASHBOARD' then return 0; end if;
  select net.http_post(
    url := 'https://wmelierxzpjamiofeemh.supabase.co/functions/v1/' || funcao_nome,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := coalesce(corpo, '{}'::jsonb),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function pinguim.disparar_edge_function(text, jsonb) from public, anon, authenticated;

-- 7h BRT = 10h UTC, segunda a sexta
select cron.schedule('alertas-grupos-conferencia-7h', '0 10 * * 1-5',
  $$select pinguim.disparar_edge_function('alertas-grupos-worker', '{"conferir": true}'::jsonb)$$);
select jobid, jobname, schedule from cron.job where jobname = 'alertas-grupos-conferencia-7h';

-- coluna de destino (codina = prévia no DM; canal = #novo-grupo-pinguim marcando a dona)
-- alter table pinguim.alertas_grupos_config add column if not exists conciliacao_destino text not null default 'codina' check (conciliacao_destino in ('codina','canal'));
