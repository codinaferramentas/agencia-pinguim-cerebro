-- Aviso de gravação para subir na área de membros (André 16/11/2026).
-- Edge gravacoes-worker: encontro de grupo terminou (Zoom contato@/pedro@ ou Google Meet do contato@) →
-- aviso no Discord #gravacoes-para-subir marcando Luiz Guilherme e Rafa, com produto e destino provável
-- (ProAlt, Elo e lançamentos → Hotmart · Taurus, Orion e Lyra → Escola). Calls 1:1 não entram.
-- Baixa: reação ✅ (subiu) ou ❌ (não precisa) na mensagem; resposta à mensagem vira "onde subiu" (histórico p/ aprender).
-- Lembrete diário às 9h SP do que segue sem baixa.

create table if not exists pinguim.gravacao_aviso (
  id bigserial primary key,
  origem text not null check (origem in ('zoom', 'meet')),
  referencia text not null,              -- meeting_uuid do Zoom ou pasta_id do Meet
  titulo text not null,
  produto text,                          -- slug: proalt, elo, taurus-master, lancamento-lofi...
  destino text,                          -- 'Hotmart' | 'Escola' | null (não sei)
  inicio timestamptz not null,
  duracao_min int,
  conta text,                            -- conta do Zoom/Drive onde está a gravação
  link text,
  discord_msg_id text,
  status text not null default 'pendente' check (status in ('pendente', 'subida', 'nao_precisa')),
  baixa_por text,
  baixa_em timestamptz,
  onde_subiu text,                       -- respostas do time na mensagem (aprendizado)
  lembrado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (origem, referencia)
);
create index if not exists gravacao_aviso_status on pinguim.gravacao_aviso (status);
alter table pinguim.gravacao_aviso enable row level security; -- só service_role

create table if not exists pinguim.gravacao_config (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default false,
  canal_id text not null default '1571928848617181244',
  marcar text[] not null default '{1084804999151878206,1083728715726463068}', -- Luiz Guilherme, Rafa
  desde timestamptz not null default now(),
  ultimo_lembrete date
);
alter table pinguim.gravacao_config enable row level security;
insert into pinguim.gravacao_config (id) values (1) on conflict do nothing;

-- cron a cada 15 min (o lembrete das 9h roda na rodada entre 9h00 e 9h14 SP)
select cron.unschedule(jobid) from cron.job where jobname = 'gravacoes-worker';
select cron.schedule('gravacoes-worker', '*/15 * * * *', $$select pinguim.disparar_edge_function('gravacoes-worker')$$);
