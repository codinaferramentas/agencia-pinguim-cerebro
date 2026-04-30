-- Cron diario do FinOps — 05h UTC
do $$
begin
  perform cron.unschedule('finops-auditar-diario');
exception when others then null;
end $$;

select cron.schedule(
  'finops-auditar-diario',
  '0 5 * * *',
  $cron$ select pinguim.disparar_edge_function('auditar-custos'); $cron$
);
