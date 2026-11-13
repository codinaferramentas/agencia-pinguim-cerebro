-- Liberação automática de APP (ProAlt / Elo / Sirius) pedida no Discord #liberacao-de-acessos (André 13/11/2026).
-- Edge acesso-apps-worker lê o canal a cada 10 min, libera nos apps e responde marcando quem pediu.
-- Hotmart e Escola NÃO entram aqui (são do Rafa e do Jairo).

create table if not exists pinguim.acesso_app_pedido (
  id uuid primary key default gen_random_uuid(),
  discord_msg_id text not null unique,
  autor_id text,
  autor_nome text,
  texto text,
  produtos text[] not null default '{}',
  pessoas jsonb not null default '[]',
  resultado jsonb,
  status text not null check (status in ('liberado', 'parcial', 'falhou', 'ignorado')),
  resposta_msg_id text,
  criado_em timestamptz not null default now()
);
alter table pinguim.acesso_app_pedido enable row level security;
-- sem policy: só service_role (edge) lê e escreve

alter table pinguim.acesso_area_config
  add column if not exists apps_ativo boolean not null default false,
  add column if not exists apps_ultimo_id text,
  add column if not exists apps_canal_id text not null default '1570505108461199461';

-- começa depois da resposta do caso da Fernanda (Patrícia + Jean, resolvido à mão em 13/11)
update pinguim.acesso_area_config set apps_ativo = true, apps_ultimo_id = '1570807471616950376' where id = 1;

insert into pinguim.acesso_app_pedido (discord_msg_id, autor_id, autor_nome, produtos, pessoas, status, resposta_msg_id, resultado)
values ('1570804217063411835', '1210285892489449603', 'Fernanda Lisboa', '{proalt}',
  '[{"nome":"Patrícia Silva","email":"patriciapaula.psi@gmail.com"},{"nome":"Jean Carlo Silva","email":"jeancarlo.pj@gmail.com"}]',
  'liberado', '1570807471616950376',
  '{"obs":"1º caso, resolvido à mão: Patrícia estava em Sem acesso → Full; Jean conta criada no Full"}')
on conflict (discord_msg_id) do nothing;

-- cron a cada 10 min (mesmo padrão dos outros workers)
select cron.unschedule(jobid) from cron.job where jobname = 'acesso-apps-worker';
select cron.schedule('acesso-apps-worker', '*/10 * * * *', $$select pinguim.disparar_edge_function('acesso-apps-worker')$$);
