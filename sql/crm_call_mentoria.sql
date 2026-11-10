-- Raio-X das calls 1:1 de mentoria (André 10/11/2026).
-- Google Meet (subpasta por reunião, Drive do contato@) → transcrição das Anotações do Gemini → OpenAI → Google Doc + PDF
-- na própria subpasta → registro aqui (aba "Calls de mentoria" no CRM) → aviso no Discord #registros-calls.
-- Edge: mentoria-call-raiox-worker (mission-control). Uso interno: nunca vai para o aluno.

create table if not exists pinguim.crm_call_mentoria (
  id             bigserial primary key,
  pasta_id       text not null unique,        -- subpasta da reunião no Drive (1 registro por call)
  evento_id      text,                        -- evento da agenda contato@
  titulo         text,
  inicio         timestamptz,
  duracao_min    int,
  mentor_nome    text,
  cliente_id     uuid,                        -- aluno no CRM (null = não achado pelos emails do convite)
  aluno_nome     text,
  emails_convite text[],
  status         text not null default 'pendente', -- ok | ignorado (grupo/interna) | sem_transcricao | erro
  motivo         text,
  raio           jsonb,                       -- o raio-X (resumo, plano de ação, alertas…)
  doc_url        text,
  pdf_url        text,
  gravacao_url   text,
  transcricao_url text,
  pasta_url      text,
  discord_msg_id text,
  modelo         text,
  tokens         jsonb,
  custo_usd      numeric(8,4),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists crm_call_mentoria_cliente on pinguim.crm_call_mentoria (cliente_id, inicio desc);
create index if not exists crm_call_mentoria_inicio on pinguim.crm_call_mentoria (inicio desc);
alter table pinguim.crm_call_mentoria enable row level security; -- só o servidor lê/escreve

create table if not exists pinguim.crm_call_mentoria_config (
  id               int primary key default 1 check (id = 1),
  ativo            boolean not null default false,       -- liga o cron automático
  desde            timestamptz not null default '2026-11-10T03:00:00Z', -- o automático não olha antes disso (histórico só sob pedido)
  pasta_meet_id    text not null default '1HiTbb_gj4j2RzVk5dIn8Ks7Bar9DFX6c', -- "Google Meet" do contato@
  agenda_id        text not null default 'contato@agenciapinguim.com',
  canal_id         text not null default '1569801367760142377',               -- #registros-calls
  aviso_discord    boolean not null default true,
  mentores         jsonb not null default '{"Micha Menezes":"1076137318395691078","Luiz Cota":"866755912395915324","Pedro Aredes":"971749832609898576"}',
  modelo           text not null default 'gpt-5.5',
  max_por_execucao int not null default 2
);
alter table pinguim.crm_call_mentoria_config enable row level security;
insert into pinguim.crm_call_mentoria_config (id) values (1) on conflict do nothing;

-- cron (ligar depois do teste): a cada 15 min
-- select cron.schedule('mentoria-call-raiox-worker', '*/15 * * * *', $$select pinguim.disparar_edge_function('mentoria-call-raiox-worker')$$);

-- 10/11: email e WhatsApp do aluno no aviso e no Doc (CRM primeiro; telefone das compras do Dash se o convite usou email fora do CRM)
alter table pinguim.crm_call_mentoria add column if not exists aluno_email text;
alter table pinguim.crm_call_mentoria add column if not exists aluno_telefone text; -- só dígitos, DDD + número
