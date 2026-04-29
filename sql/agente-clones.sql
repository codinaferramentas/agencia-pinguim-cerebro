-- Relacao N:N entre agentes e clones (qual agente consulta qual SOUL).
-- Vai virar a fonte da diretiva `clones_consultados` no AGENT-CARD em runtime.

create table if not exists pinguim.agente_clones (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references pinguim.agentes(id) on delete cascade,
  clone_produto_id uuid not null references pinguim.produtos(id) on delete cascade,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique(agente_id, clone_produto_id)
);

create index if not exists agente_clones_agente_idx
  on pinguim.agente_clones(agente_id, ordem);
create index if not exists agente_clones_clone_idx
  on pinguim.agente_clones(clone_produto_id);

-- RLS
alter table pinguim.agente_clones enable row level security;

drop policy if exists agente_clones_select on pinguim.agente_clones;
create policy agente_clones_select on pinguim.agente_clones
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists agente_clones_modify on pinguim.agente_clones;
create policy agente_clones_modify on pinguim.agente_clones
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
            with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
