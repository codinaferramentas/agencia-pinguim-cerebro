-- ========================================================================
-- schema-052-monitor-resumo-grupos.sql
-- ========================================================================
-- Fechamento dos GRUPOS (pedido Andre 12/11/2026): todo dia 8h BRT, visão de
-- volume do dia anterior pro time — mensagens de alunos, perguntas (equipe x
-- turma), reclamações, críticas, sugestões, elogios, risco — por grupo.
-- Sem detalhe (fica nas tags) e sem pendência (fica no #painel-cs).
--
-- Destino: resumo_grupos_canal_id NULL = DM dos dm_user_ids (Codina, fase de
-- aprovação). Aprovado → update set resumo_grupos_canal_id =
-- '1372556339578011701' (#novo-grupo-pinguim). Sem deploy.
-- Edge: monitor-atendimento-resumo, body {modo:'grupos'}.
-- ========================================================================

alter table pinguim.monitor_atendimento_config
  add column if not exists resumo_grupos_ativo boolean not null default true,
  add column if not exists resumo_grupos_canal_id text;

-- disparo genérico da edge com um "modo" no body (sla, grupos…)
create or replace function pinguim.disparar_monitor_modo(p_modo text)
returns bigint language plpgsql security definer
set search_path to 'pinguim', 'vault', 'pg_catalog', 'pg_temp' as $$
declare request_id bigint; service_key text;
begin
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'pinguim_service_role_key' limit 1;
  if service_key is null then return 0; end if;
  select net.http_post(
    url := 'https://wmelierxzpjamiofeemh.supabase.co/functions/v1/monitor-atendimento-resumo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := jsonb_build_object('modo', p_modo),
    timeout_milliseconds := 60000) into request_id;
  return request_id;
end $$;
revoke all on function pinguim.disparar_monitor_modo(text) from public, anon, authenticated;

-- 8h05 BRT (11h05 UTC), logo depois do painel CS das 8h
select cron.schedule('monitor-resumo-grupos', '5 11 * * *', $$select pinguim.disparar_monitor_modo('grupos')$$);
