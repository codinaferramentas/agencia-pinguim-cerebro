-- =====================================================================
-- Cron disparando Edge Functions usando Supabase Vault (recomendado)
-- =====================================================================
-- O Vault e o cofre nativo do Supabase pra secrets. Acessivel apenas
-- via SECURITY DEFINER. Esconde a chave do service_role das queries
-- normais.

-- Garante extensao
create extension if not exists supabase_vault cascade;

-- Salva service_role_key no vault (idempotente)
do $$
declare
  service_key_atual text;
begin
  select decrypted_secret into service_key_atual
  from vault.decrypted_secrets
  where name = 'pinguim_service_role_key'
  limit 1;

  if service_key_atual is null then
    perform vault.create_secret(
      'PLACEHOLDER_SUBSTITUIR_VIA_DASHBOARD',
      'pinguim_service_role_key',
      'Service role key usado por crons internos (auditar-seguranca, raio-x-banco)'
    );
  end if;
end $$;

-- Helper redefinido pra ler do vault
create or replace function pinguim.disparar_edge_function(funcao_nome text)
returns bigint
language plpgsql
security definer
set search_path = pinguim, vault, pg_catalog, pg_temp
as $$
declare
  request_id bigint;
  base_url text := 'https://wmelierxzpjamiofeemh.supabase.co';
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'pinguim_service_role_key'
  limit 1;

  if service_key is null or service_key = 'PLACEHOLDER_SUBSTITUIR_VIA_DASHBOARD' then
    raise notice 'service_role_key nao configurado no vault.';
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
