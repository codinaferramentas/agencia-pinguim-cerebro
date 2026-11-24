-- Call de alinhamento semanal da equipe Pinguim (André 24/11/2026): toda segunda 10h, agenda do contato@ com Meet,
-- avisos no Discord «Time - Pedro» às 9h e às 10h. Robô: edge alinhamento-semanal-worker.
create table if not exists pinguim.alinhamento_semanal_config (
  id int primary key default 1,
  ativo boolean not null default false,
  titulo text not null default 'Call de alinhamento semanal · Equipe Pinguim',
  primeira date not null default '2026-11-30',
  hora text not null default '10:00',
  duracao_min int not null default 60,
  canal text not null default '1574839308450267156',      -- Discord: Time - Pedro
  evento_id text,                                           -- evento recorrente na agenda do contato@
  pessoas jsonb not null default '[]'::jsonb                -- [{nome, email, discord}]
);
alter table pinguim.alinhamento_semanal_config enable row level security;
insert into pinguim.alinhamento_semanal_config (id, pessoas) values (1, '[
  {"nome":"Pedro","email":"pedro@agenciapinguim.com","discord":"971749832609898576"},
  {"nome":"Codina","email":"codinaandre@gmail.com","discord":"1077338884981133413"},
  {"nome":"Djairo","email":"jairo.agenciapinguim@gmail.com","discord":"1083731934238228590"},
  {"nome":"Rafael","email":"rafael.agenciapinguim@gmail.com","discord":"1083728715726463068"},
  {"nome":"Ingrid","email":"ingrid.agenciapinguim@gmail.com","discord":"1205120597433122846"},
  {"nome":"Queren","email":null,"discord":"1478086499395174540"}
]'::jsonb) on conflict (id) do nothing;
-- cron (ligar só com OK do André): segunda 9h e 10h de Brasília = 12h e 13h UTC
-- select cron.schedule('alinhamento-semanal-aviso',  '0 12 * * 1', $$select pinguim.disparar_edge_function('alinhamento-semanal-worker', '{"momento":"aviso"}'::jsonb)$$);
-- select cron.schedule('alinhamento-semanal-ao-vivo', '0 13 * * 1', $$select pinguim.disparar_edge_function('alinhamento-semanal-worker', '{"momento":"ao_vivo"}'::jsonb)$$);
