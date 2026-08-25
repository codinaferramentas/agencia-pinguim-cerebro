-- ========================================================================
-- schema-040-grupos-whatsapp-alertas.sql
-- Alertas nos grupos de WhatsApp (Trello + agenda contato@ + Evolution)
-- Projeto: controle de agenda e alertas pros ALUNOS (Andre 2026-08-25).
--
-- Tabela de-para dos grupos: o card do Trello referencia o grupo por NOME
-- (seção **PÚBLICO**), o evento da agenda referencia por LINK de convite
-- (chat.whatsapp.com na descrição) e o Evolution dispara pelo JID.
-- Essa tabela amarra as três pontas.
--
-- jid_evolution começa NULL — preenchido na fase Evolution (de-para real).
-- ========================================================================

create table if not exists pinguim.grupos_whatsapp_alertas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,      -- como aparece no PÚBLICO do card (match case-insensitive)
  link_convite  text unique,               -- https://chat.whatsapp.com/<codigo> (null = pendente)
  jid_evolution text,                      -- <id>@g.us — preenchido na fase Evolution
  ativo         boolean not null default true,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table pinguim.grupos_whatsapp_alertas is
  'De-para dos grupos de WhatsApp dos alertas de agenda: nome (card Trello) ↔ link convite (evento agenda) ↔ JID (Evolution).';

-- Squad Cyber: RLS ligada, sem policies — só service_role.
alter table pinguim.grupos_whatsapp_alertas enable row level security;
