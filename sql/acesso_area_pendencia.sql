-- Monitor de liberação de acesso às áreas de membros da Hotmart (André 12/11/2026).
-- Quem comprou mentoria (Hotmart 1ª parcela, ou Pix anunciado no Discord #novo-grupo-pinguim) precisa de acesso
-- às áreas do Hotmart Club: Taurus LT → ProAlt · Lyra → Elo · Taurus Master/Plus/Mentoring e Orion → ProAlt e Elo ·
-- Elo/ProAlt vendidos por Pix → a área do produto · Mentoria Express → nenhuma. 2ª cadeira = mesmas áreas.
-- Aviso na hora (Rafa + Jairo, cópia Luiz Guilherme) e cobrança diária às 8h só de quem AINDA não tem acesso.
-- Edge: acesso-areas-worker (mission-control). Dispensar pelo CRM (ficha do aluno) → status 'dispensado'.

create table if not exists pinguim.acesso_area_pendencia (
  id            bigserial primary key,
  email         text not null,
  nome          text,
  whatsapp      text,
  cliente_id    uuid,
  produto       text not null,            -- Taurus Low Ticket, Lyra, Taurus Master...
  areas         text[] not null,          -- ids de pinguim.club_area: 'proalt', 'elo'
  areas_ok      text[] not null default '{}',
  origem        text not null,            -- 'hotmart' | 'pix-discord'
  referencia    text not null,            -- transaction_code ou id da mensagem do Discord
  referencia_url text,
  anunciado_por text,
  status        text not null default 'pendente', -- pendente | liberado | dispensado
  avisado_em    timestamptz,
  ultimo_check_em timestamptz,
  liberado_em   timestamptz,
  dispensado_em timestamptz,
  dispensado_por text,
  motivo        text,
  criado_em     timestamptz not null default now(),
  unique (email, produto, referencia)
);
create index if not exists acesso_area_pend_status on pinguim.acesso_area_pendencia (status);
create index if not exists acesso_area_pend_cliente on pinguim.acesso_area_pendencia (cliente_id);
alter table pinguim.acesso_area_pendencia enable row level security;

create table if not exists pinguim.acesso_area_config (
  id                 int primary key default 1 check (id = 1),
  ativo              boolean not null default false,
  modo_teste         boolean not null default true,     -- true = tudo vai para o privado do Codina
  desde              timestamptz not null default '2026-11-01T03:00:00Z',
  canal_alerta_id    text,                              -- canal de liberação de acesso (André cria)
  canal_vendas_id    text not null default '1372556339578011701', -- #novo-grupo-pinguim (onde o comercial anuncia Pix)
  discord_ultimo_id  text,                              -- última mensagem já lida do canal de vendas
  marcar             text[] not null default array['1083728715726463068','1083731934238228590'], -- Rafa, Jairo
  copia              text[] not null default array['1084804999151878206'],                        -- Luiz Guilherme
  dm_teste           text not null default '1077338884981133413',                                -- Codina
  modelo_extracao    text not null default 'gpt-5.5',
  produtos_hotmart   jsonb not null default '{"8289053":["Taurus Low Ticket",["proalt"]],"8103827":["Taurus Low Ticket",["proalt"]],"8300294":["Taurus Master",["proalt","elo"]],"2605400":["Taurus Mentoring",["proalt","elo"]],"2634662":["Mastermind Orion",["proalt","elo"]],"8294498":["Mastermind Orion",["proalt","elo"]],"4044671":["Lyra",["elo"]],"4139144":["Lyra",["elo"]],"8300861":["Lyra",["elo"]]}'
);
alter table pinguim.acesso_area_config enable row level security;
insert into pinguim.acesso_area_config (id) values (1) on conflict do nothing;

-- PRODUÇÃO desde 12/11/2026 (aval do André e da Fernanda/Ingrid): ativo=true, modo_teste=false, canal #liberacao-de-acessos
-- update pinguim.acesso_area_config set ativo=true, modo_teste=false, canal_alerta_id='1570505108461199461' where id=1;
select cron.schedule('acesso-areas-worker', '*/10 * * * *', $$select pinguim.disparar_edge_function('acesso-areas-worker')$$);
-- diário 8h SP = 11h UTC: o worker sabe que é a rodada diária pelo horário (8h00–8h09 SP)
