-- ========================================================================
-- schema-041-disparos-grupos-whatsapp.sql
-- Disparos nos grupos de WhatsApp (Trello + agenda contato@ + Evolution)
-- Edge: alertas-grupos-worker | De-para: schema-040 grupos_whatsapp_alertas
--
-- SEGURANÇA (pedido central do Andre 25/08): mensagem sai NO MÁXIMO UMA VEZ.
--   1. Trava atômica: UNIQUE parcial (card, grupo, data) p/ tipo automatico —
--      o INSERT acontece ANTES do envio; execução concorrente bate na trava.
--   2. Sem retry automático: se a Evolution der erro/timeout DEPOIS da trava,
--      o registro fica status 'erro' e o robô NÃO reenvia sozinho (timeout
--      não garante que não enviou). Reenvio = decisão humana (lista
--      "🔁 Enviar Agora" no Trello → tipo 'manual', fora da trava).
-- ========================================================================

create table if not exists pinguim.disparos_grupos_whatsapp (
  id               uuid primary key default gen_random_uuid(),
  card_id          text not null,             -- id do card no Trello
  card_nome        text,
  grupo_jid        text not null,             -- JID REAL de destino (mesmo em modo teste)
  grupo_nome       text,
  data_ref         date not null,             -- dia (BRT) do disparo
  horario_previsto text,                      -- HH:MM programado no card
  tipo             text not null default 'automatico' check (tipo in ('automatico', 'manual')),
  modo             text not null default 'producao' check (modo in ('teste', 'producao')),
  status           text not null default 'enviando' check (status in ('enviando', 'enviado', 'erro')),
  erro             text,
  agenda_confirmada boolean,                  -- existia evento na agenda contato@ com o link do grupo?
  enviado_em       timestamptz not null default now()
);

-- A TRAVA: um disparo automático por card+grupo+dia. Manuais ficam fora
-- (gestor pode forçar quantas vezes quiser — sempre consciente, via lista).
create unique index if not exists uq_disparo_automatico
  on pinguim.disparos_grupos_whatsapp (card_id, grupo_jid, data_ref)
  where tipo = 'automatico';

create index if not exists idx_disparos_grupos_data on pinguim.disparos_grupos_whatsapp (data_ref);

comment on table pinguim.disparos_grupos_whatsapp is
  'Log + trava dos disparos de mensagens nos grupos WhatsApp (fonte da verdade; Trello é o espelho visual via comentários).';

alter table pinguim.disparos_grupos_whatsapp enable row level security;

-- ------------------------------------------------------------------------
-- Config do worker (linha única): modo teste redireciona TODO disparo pro
-- grupo TESTES MGS PINGUIM com carimbo do destino real. Virar produção =
-- update modo_teste=false (Andre dá a ordem).
-- ------------------------------------------------------------------------
create table if not exists pinguim.alertas_grupos_config (
  id              int primary key default 1 check (id = 1),
  modo_teste      boolean not null default true,
  jid_grupo_teste text,
  -- monitor da instância Evolution (alerta Discord Codina+Ingrid se cair):
  instancia_status        text not null default 'open',
  instancia_caiu_em       timestamptz,
  instancia_ultimo_alerta timestamptz,
  atualizado_em   timestamptz not null default now()
);

alter table pinguim.alertas_grupos_config enable row level security;

insert into pinguim.alertas_grupos_config (id, modo_teste, jid_grupo_teste)
values (1, true, '120363412147836318@g.us')
on conflict (id) do update set jid_grupo_teste = excluded.jid_grupo_teste;

-- ------------------------------------------------------------------------
-- Cron: worker a cada 1 MINUTO (Andre 25/08 — precisão de disparo: card das
-- 17:23 sai às 17:23; "Enviar Agora" espera no máximo 1 min). Custo real é
-- desprezível: ~1.4k invocações/dia da edge + ~6 chamadas Trello/min, tudo
-- muito abaixo de qualquer limite. O process-reminders (job 1) já roda 1/1min
-- há meses no mesmo banco.
-- ------------------------------------------------------------------------
select cron.schedule(
  'alertas-grupos-worker',
  '* * * * *',
  $$select pinguim.disparar_edge_function('alertas-grupos-worker')$$
);
