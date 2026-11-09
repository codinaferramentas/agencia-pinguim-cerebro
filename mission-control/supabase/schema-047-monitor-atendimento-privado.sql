-- ========================================================================
-- schema-047-monitor-atendimento-privado.sql
-- ========================================================================
-- Painel CS fase 2 (09/11/2026): conversas no PRIVADO dos números de
-- atendimento. Mesmo webhook (monitor-grupos-webhook); a instância vem em
-- body.instance.
--
--   · contato manda msg e não há atendimento aberto → abre (canal_tipo
--     'privado', canal = 'privado:<instancia>'); msgs seguintes até alguém
--     responder entram no mesmo atendimento. Áudio/imagem entram como
--     "[áudio]"/"[imagem]".
--   · número da atendente responde na conversa (fromMe) → fecha. No privado
--     não precisa de reply: é 1:1.
--   · não abre: agradecimento/ok/emoji sozinho, e contatos da equipe
--     (ADMs dos grupos + os próprios números de atendimento).
--   · grupos continuam lidos SÓ pela instância principal (elo_1775155882289)
--     — as outras também estão nos grupos e não podem contar em dobro.
-- ========================================================================

create table if not exists pinguim.monitor_instancias (
  instancia         text primary key,            -- nome da instância na Evolution
  canal_nome        text not null,               -- como aparece no painel (📱 + nome)
  atendente         text not null,               -- quem responde por esse número
  telefone          text,                        -- dígitos do número da instância
  monitora_privado  boolean not null default true,
  criado_em         timestamptz not null default now()
);
comment on table pinguim.monitor_instancias is
  'Números de atendimento cujas conversas privadas viram atendimento no Painel CS. Desligar = update set monitora_privado = false.';
alter table pinguim.monitor_instancias enable row level security;

insert into pinguim.monitor_instancias (instancia, canal_nome, atendente, telefone) values
  ('elo_1775155882289', 'CS Ingrid',   'Ingrid Nascimento', '5511940734320'),
  ('Fernanda Lisboa',   'CS Fernanda', 'Fernanda Lisboa',   '5511992622056')
on conflict (instancia) do update set canal_nome = excluded.canal_nome, atendente = excluded.atendente, telefone = excluded.telefone;

alter table pinguim.monitor_atendimentos drop constraint if exists monitor_atendimentos_como_respondeu_check;
alter table pinguim.monitor_atendimentos add constraint monitor_atendimentos_como_respondeu_check
  check (como_respondeu in ('reply','mencao','privado'));
