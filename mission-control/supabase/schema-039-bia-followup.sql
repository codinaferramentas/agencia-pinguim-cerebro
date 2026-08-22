-- ========================================================================
-- schema-039-bia-followup.sql
-- ========================================================================
-- F3 da Bia: motor de follow-up (edge bia-followup-worker + cron */5).
-- Doc: docs/AGENTE-BIA-VENDAS-PROALT.md §6.4 e roadmap F3.
--
-- Config nova:
--   followup_modo     'dry-run' (gera e grava sem enviar) | 'ativo' (Unichat)
--   unichat_envio_url endpoint de envio da API Unichat (F4; token no cofre
--                     como UNICHAT_API_TOKEN)
-- ========================================================================

insert into pinguim.bia_config (chave, valor) values
  ('followup_modo',     'dry-run'),
  ('unichat_envio_url', 'PENDENTE'),
  ('debounce_segundos', '12')   -- espera o lead terminar de digitar (0 desliga)
on conflict (chave) do nothing;

-- Cron: mesmo padrão dos jobs 40/42 (disparar_edge_function via vault).
-- ⚠️ argumento SEMPRE entre aspas (lição do job 39 quebrado).
select cron.schedule(
  'bia-followup-worker',
  '*/5 * * * *',
  $$select pinguim.disparar_edge_function('bia-followup-worker')$$
);
