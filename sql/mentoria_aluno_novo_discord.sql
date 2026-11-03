-- Aviso no Discord (#novo-grupo-pinguim) a cada aluno NOVO de mentoria (Taurus, Orion, Lyra, Express).
-- Só 1ª parcela/recorrência. Lê o Dash (hotmart_transactions); edge mentoria-aluno-novo-worker, cron a cada 2 min.
-- André 03/11/2026: marca Ingrid (onboarding) + Fernanda + Luiz Guilherme; PS da 2ª cadeira; desde 27/10/2026.

create table if not exists pinguim.mentoria_aviso (
  transacao      text primary key,              -- transaction_code da Hotmart (1 aviso por venda)
  produto        text not null,
  produto_hotmart bigint,
  nome           text,
  email          text,
  telefone       text,
  data_compra    timestamptz,
  status         text not null default 'pendente', -- pendente → enviado | erro | pulado
  discord_msg_id text,
  erro           text,
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz
);
create index if not exists mentoria_aviso_email on pinguim.mentoria_aviso (email, produto);
alter table pinguim.mentoria_aviso enable row level security; -- só service_role

create table if not exists pinguim.mentoria_aviso_config (
  id        int primary key default 1 check (id = 1),
  ativo     boolean not null default true,
  desde     timestamptz not null default '2026-10-27T03:00:00Z', -- 27/10 00h em SP
  canal_id  text not null default '1372556339578011701',         -- #novo-grupo-pinguim
  marcar    text[] not null default array['1205120597433122846','1210285892489449603','1084804999151878206'], -- Ingrid, Fernanda, Luiz Guilherme
  produtos  jsonb not null default '{"8289053":"Mentoria Taurus Low Ticket","8103827":"Mentoria Taurus Low Ticket","2605400":"Mentoria Taurus","8300294":"Mentoria Taurus Master","2634662":"Mastermind Orion","8294498":"Mastermind Orion","4044671":"Mentoria Lyra","4139144":"Mentoria Lyra","8300861":"Mentoria Lyra","8270005":"Mentoria Express"}'
);
alter table pinguim.mentoria_aviso_config enable row level security;
insert into pinguim.mentoria_aviso_config (id) values (1) on conflict do nothing;

select cron.schedule('mentoria-aluno-novo-worker', '*/2 * * * *',
  $$select pinguim.disparar_edge_function('mentoria-aluno-novo-worker')$$);
