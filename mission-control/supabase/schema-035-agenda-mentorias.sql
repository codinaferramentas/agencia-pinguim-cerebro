-- ========================================================================
-- schema-035-agenda-mentorias.sql
-- Gestão de Agendas de Mentorias (pedido do Luiz, 2026-08-14)
-- Etapa 1: resumo do dia 7h BRT + alertas 1h/10min/na hora → Discord
--          (#novo-grupo-pinguim). Etapa 2 (futura): WhatsApp Evolution.
--
-- Agendas monitoradas (leitura via conta ferramenta@agenciapinguim.com,
-- refresh_token em pinguim.conexoes_google):
--   1. ProAlt  — proalt.agenda@gmail.com
--   2. ELO     — ciclo.agendas@gmail.com
--   3. Pinguim — contato@agenciapinguim.com (SÓ eventos com Rafael/Djairo)
-- ========================================================================

-- Dedup de envios: o worker roda a cada 5 min; essa tabela garante que cada
-- (tipo, evento, horário) dispara UMA vez. Se o evento for remarcado
-- (evento_inicio muda), os alertas voltam a valer pro novo horário.
create table if not exists pinguim.agenda_alertas_enviados (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('resumo_dia', 'alerta_1h', 'alerta_10min', 'alerta_na_hora')),
  evento_id     text not null,           -- id do evento no Google (ou 'resumo-YYYY-MM-DD')
  evento_inicio timestamptz not null,    -- pro resumo: início do dia BRT
  agenda        text,                    -- slug: proalt | elo | pinguim
  titulo        text,
  enviado_em    timestamptz not null default now(),
  unique (tipo, evento_id, evento_inicio)
);

comment on table pinguim.agenda_alertas_enviados is
  'Dedup dos avisos de agenda de mentorias (Discord/WhatsApp). Worker: edge agenda-mentorias-worker.';

create index if not exists idx_agenda_alertas_enviado_em
  on pinguim.agenda_alertas_enviados (enviado_em);

-- Squad Cyber: RLS ligada, sem policies — só service_role acessa.
alter table pinguim.agenda_alertas_enviados enable row level security;

-- ------------------------------------------------------------------------
-- Cron: worker a cada 5 min (o próprio worker decide o que fazer:
--   • 07h-12h BRT e resumo ainda não enviado → manda resumo do dia
--   • sempre → varre janelas de alerta 1h / 10min / na hora
-- Roda o dia todo porque tem encontro à noite (ex.: 19h30 BRT = 22h30 UTC)
-- e o "na hora" pode cair depois da meia-noite UTC.
-- ------------------------------------------------------------------------
select cron.schedule(
  'agenda-mentorias-worker',
  '*/5 * * * *',
  $$select pinguim.disparar_edge_function('agenda-mentorias-worker')$$
);

-- ------------------------------------------------------------------------
-- FIX (aproveitando a passagem): job 39 'pinguim-monitor-saude-worker'
-- estava com o argumento SEM aspas — SQL inválido, falhava todo dia às
-- 13h UTC desde 12/ago. cron.schedule com mesmo nome substitui o comando.
-- ------------------------------------------------------------------------
select cron.schedule(
  'pinguim-monitor-saude-worker',
  '0 13 * * *',
  $$select pinguim.disparar_edge_function('monitor-saude-worker')$$
);
