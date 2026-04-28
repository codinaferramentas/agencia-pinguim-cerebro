-- Pilar Funis — 5º pilar do Pinguim OS (2026-04-28)
-- Construtor visual de funis de venda.
-- N funis simultâneos, mesmo produto pode ter papéis diferentes em funis diferentes.
-- Chave de habilitação por agente.

-- ===========================================================================
-- Tabela: funis
-- Cada linha é um funil (campanha, lançamento, estratégia).
-- ===========================================================================
create table if not exists pinguim.funis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'arquivado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists funis_status_idx on pinguim.funis(status);
create index if not exists funis_nome_idx on pinguim.funis(nome);

-- ===========================================================================
-- Tabela: funil_etapas
-- Cada nó do canvas. Posição x/y persistida pra reconstruir o desenho.
-- Papel define o tipo da etapa no funil.
-- ===========================================================================
create table if not exists pinguim.funil_etapas (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references pinguim.funis(id) on delete cascade,
  produto_id uuid not null references pinguim.produtos(id) on delete cascade,
  papel text not null check (papel in ('entrada', 'order_bump', 'upsell', 'downsell', 'cross_sell')),
  posicao_x double precision not null default 0,
  posicao_y double precision not null default 0,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists funil_etapas_funil_idx on pinguim.funil_etapas(funil_id);
create index if not exists funil_etapas_produto_idx on pinguim.funil_etapas(produto_id);

-- ===========================================================================
-- Tabela: funil_conexoes
-- Setas entre etapas (nó-origem → nó-destino).
-- ===========================================================================
create table if not exists pinguim.funil_conexoes (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references pinguim.funis(id) on delete cascade,
  etapa_origem_id uuid not null references pinguim.funil_etapas(id) on delete cascade,
  etapa_destino_id uuid not null references pinguim.funil_etapas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  constraint conexao_diferente check (etapa_origem_id <> etapa_destino_id),
  constraint conexao_unica unique (etapa_origem_id, etapa_destino_id)
);

create index if not exists funil_conexoes_funil_idx on pinguim.funil_conexoes(funil_id);
create index if not exists funil_conexoes_origem_idx on pinguim.funil_conexoes(etapa_origem_id);
create index if not exists funil_conexoes_destino_idx on pinguim.funil_conexoes(etapa_destino_id);

-- ===========================================================================
-- Tabela: funil_agentes
-- Chave de habilitação: quais agentes podem ler esse funil.
-- ===========================================================================
create table if not exists pinguim.funil_agentes (
  funil_id uuid not null references pinguim.funis(id) on delete cascade,
  agente_id uuid not null references pinguim.agentes(id) on delete cascade,
  habilitado_em timestamptz not null default now(),
  primary key (funil_id, agente_id)
);

-- ===========================================================================
-- View: vw_funis_catalogo
-- Lista de funis com contagem de etapas e conexões pra UI.
-- ===========================================================================
create or replace view pinguim.vw_funis_catalogo as
select
  f.id,
  f.nome,
  f.descricao,
  f.status,
  f.criado_em,
  f.atualizado_em,
  coalesce((select count(*) from pinguim.funil_etapas e where e.funil_id = f.id), 0) as total_etapas,
  coalesce((select count(*) from pinguim.funil_conexoes c where c.funil_id = f.id), 0) as total_conexoes,
  coalesce((select count(*) from pinguim.funil_agentes a where a.funil_id = f.id), 0) as total_agentes
from pinguim.funis f
order by f.atualizado_em desc;

-- ===========================================================================
-- RLS — política Pinguim padrão (autenticado lê e escreve)
-- ===========================================================================
alter table pinguim.funis enable row level security;
alter table pinguim.funil_etapas enable row level security;
alter table pinguim.funil_conexoes enable row level security;
alter table pinguim.funil_agentes enable row level security;

drop policy if exists "auth_full" on pinguim.funis;
create policy "auth_full" on pinguim.funis for all to authenticated using (true) with check (true);

drop policy if exists "auth_full" on pinguim.funil_etapas;
create policy "auth_full" on pinguim.funil_etapas for all to authenticated using (true) with check (true);

drop policy if exists "auth_full" on pinguim.funil_conexoes;
create policy "auth_full" on pinguim.funil_conexoes for all to authenticated using (true) with check (true);

drop policy if exists "auth_full" on pinguim.funil_agentes;
create policy "auth_full" on pinguim.funil_agentes for all to authenticated using (true) with check (true);

-- ===========================================================================
-- Trigger: atualizado_em
-- ===========================================================================
create or replace function pinguim.tg_funis_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists tg_funis_atualizado_em on pinguim.funis;
create trigger tg_funis_atualizado_em
  before update on pinguim.funis
  for each row execute function pinguim.tg_funis_atualizado_em();

-- Quando uma etapa ou conexão muda, atualiza o atualizado_em do funil pai.
create or replace function pinguim.tg_funil_filho_touch()
returns trigger language plpgsql as $$
declare
  v_funil_id uuid;
begin
  v_funil_id = coalesce(new.funil_id, old.funil_id);
  update pinguim.funis set atualizado_em = now() where id = v_funil_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tg_etapas_touch on pinguim.funil_etapas;
create trigger tg_etapas_touch
  after insert or update or delete on pinguim.funil_etapas
  for each row execute function pinguim.tg_funil_filho_touch();

drop trigger if exists tg_conexoes_touch on pinguim.funil_conexoes;
create trigger tg_conexoes_touch
  after insert or update or delete on pinguim.funil_conexoes
  for each row execute function pinguim.tg_funil_filho_touch();

-- ===========================================================================
-- Pronto.
-- ===========================================================================
