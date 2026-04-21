-- ========================================================================
-- MISSION CONTROL — SCHEMA PINGUIM (consolidado, idempotente)
-- ========================================================================
-- Cria schema `pinguim` isolado do `public` (onde vive o app comercial).
-- Aplicar no SQL Editor do Supabase. Pode rodar múltiplas vezes sem quebrar.
--
-- Pré-requisito (fora deste arquivo):
--   - extensão `vector` habilitada (schema extensions) — já ok
--   - extensão `pg_cron` habilitada — já ok
-- ========================================================================

create schema if not exists pinguim;

comment on schema pinguim is
  'Mission Control — Pinguim. Isolado do schema public (app comercial). '
  'Nunca tocar em tabelas fora deste schema.';

set search_path = pinguim, public, extensions;

-- ========================================================================
-- ENUMS (qualificados com o schema)
-- ========================================================================

do $$ begin
  create type pinguim.produto_status as enum ('ativo', 'em_construcao', 'rascunho', 'arquivado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.cerebro_peca_origem as enum ('upload', 'lote', 'discord', 'whatsapp', 'telegram', 'expert', 'externo', 'csv', 'sistema');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.cerebro_peca_status as enum ('aprovado', 'pendente', 'ruido', 'duplicado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.agente_status as enum ('planejado', 'em_criacao', 'em_teste', 'em_producao', 'pausado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.task_status as enum ('inbox', 'assigned', 'in_progress', 'review', 'aguardando_aprovacao', 'done', 'travado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.squad_status as enum ('planejado', 'em_criacao', 'em_teste', 'em_producao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.canal_tipo as enum ('discord', 'whatsapp', 'telegram', 'instagram', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.ingest_status as enum ('pendente', 'processando', 'ok', 'quarentena', 'erro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.lote_tipo as enum ('pacote_zip', 'upload_manual', 'cron');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pinguim.lote_status as enum ('recebido', 'extraindo', 'classificando', 'vetorizando', 'concluido', 'falhou');
exception when duplicate_object then null; end $$;

-- ========================================================================
-- PRODUTOS
-- ========================================================================

create table if not exists pinguim.produtos (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  nome            text not null,
  emoji           text default '📦',
  descricao       text,
  status          pinguim.produto_status not null default 'em_construcao',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- ========================================================================
-- CÉREBROS (1:1 com produto)
-- ========================================================================

create table if not exists pinguim.cerebros (
  id                  uuid primary key default gen_random_uuid(),
  produto_id          uuid unique not null references pinguim.produtos(id) on delete cascade,
  mapa_md             text,
  ultima_alimentacao  timestamptz,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index if not exists cerebros_produto_idx on pinguim.cerebros(produto_id);

-- ========================================================================
-- FONTES (o que humanos veem)
-- ========================================================================

create table if not exists pinguim.cerebro_fontes (
  id              uuid primary key default gen_random_uuid(),
  cerebro_id      uuid not null references pinguim.cerebros(id) on delete cascade,

  tipo            text not null,        -- aula, pagina_venda, depoimento, objecao, sacada, etc (livre)
  titulo          text not null,
  conteudo_md     text,
  origem          text not null,        -- upload, lote, discord, whatsapp, expert, scrap, etc
  autor           text,
  url             text,

  tamanho_bytes   integer,
  arquivo_nome    text,
  mime            text,

  metadata        jsonb not null default '{}'::jsonb,

  ingest_status   pinguim.ingest_status not null default 'pendente',
  ingest_lote_id  uuid,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists cerebro_fontes_cerebro_idx   on pinguim.cerebro_fontes(cerebro_id);
create index if not exists cerebro_fontes_tipo_idx      on pinguim.cerebro_fontes(tipo);
create index if not exists cerebro_fontes_status_idx    on pinguim.cerebro_fontes(ingest_status);
create index if not exists cerebro_fontes_lote_idx      on pinguim.cerebro_fontes(ingest_lote_id);
create index if not exists cerebro_fontes_criado_em_idx on pinguim.cerebro_fontes(criado_em desc);

-- ========================================================================
-- CHUNKS vetorizados (o que agente lê via RAG)
-- ========================================================================

create table if not exists pinguim.cerebro_fontes_chunks (
  id              uuid primary key default gen_random_uuid(),
  fonte_id        uuid not null references pinguim.cerebro_fontes(id) on delete cascade,
  cerebro_id      uuid not null references pinguim.cerebros(id) on delete cascade,

  chunk_index     integer not null,
  conteudo        text not null,
  token_count     integer,

  embedding       extensions.vector(1536),
  embedding_model text default 'text-embedding-3-small',

  criado_em       timestamptz not null default now()
);

-- IVF index pra busca semântica rápida (cosine distance)
create index if not exists cerebro_fontes_chunks_embedding_idx
  on pinguim.cerebro_fontes_chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

create index if not exists cerebro_fontes_chunks_fonte_idx    on pinguim.cerebro_fontes_chunks(fonte_id);
create index if not exists cerebro_fontes_chunks_cerebro_idx on pinguim.cerebro_fontes_chunks(cerebro_id);

-- ========================================================================
-- INGEST: lotes (cada .zip/pacote vira 1 lote)
-- ========================================================================

create table if not exists pinguim.ingest_lotes (
  id              uuid primary key default gen_random_uuid(),
  cerebro_id      uuid not null references pinguim.cerebros(id) on delete cascade,

  tipo            pinguim.lote_tipo not null default 'pacote_zip',
  status          pinguim.lote_status not null default 'recebido',

  nome_arquivo    text,
  tamanho_bytes   bigint,

  disparado_por   text,
  disparado_via   text,

  arquivos_totais integer default 0,
  fontes_criadas  integer default 0,
  chunks_criados  integer default 0,
  em_quarentena   integer default 0,

  custo_usd       numeric(10,6) default 0,
  duracao_ms      integer,

  log_md          text,
  erro_detalhes   text,

  criado_em       timestamptz not null default now(),
  finalizado_em   timestamptz
);

create index if not exists ingest_lotes_cerebro_idx  on pinguim.ingest_lotes(cerebro_id);
create index if not exists ingest_lotes_status_idx   on pinguim.ingest_lotes(status);
create index if not exists ingest_lotes_criado_idx   on pinguim.ingest_lotes(criado_em desc);

-- ========================================================================
-- INGEST: arquivos (log fino por arquivo do pacote)
-- ========================================================================

create table if not exists pinguim.ingest_arquivos (
  id                 uuid primary key default gen_random_uuid(),
  lote_id            uuid not null references pinguim.ingest_lotes(id) on delete cascade,
  cerebro_id         uuid not null references pinguim.cerebros(id) on delete cascade,
  fonte_id           uuid references pinguim.cerebro_fontes(id) on delete set null,

  nome_original      text not null,
  caminho            text,
  mime               text,
  tamanho_bytes      integer,
  sha256             text,

  tipo_sugerido      text,
  tipo_confianca     numeric(3,2),
  tipo_justificativa text,
  classificado_por   text,

  status             pinguim.ingest_status not null default 'pendente',
  motivo_erro        text,

  criado_em          timestamptz not null default now(),
  processado_em      timestamptz
);

create index if not exists ingest_arquivos_lote_idx    on pinguim.ingest_arquivos(lote_id);
create index if not exists ingest_arquivos_status_idx  on pinguim.ingest_arquivos(status);
create index if not exists ingest_arquivos_sha_idx     on pinguim.ingest_arquivos(sha256);

-- ========================================================================
-- PERFIS (extensão do auth.users — referenciamos, não duplicamos)
-- ========================================================================

create table if not exists pinguim.perfis (
  id                    uuid primary key references auth.users(id) on delete cascade,
  nome                  text,
  cargo                 text,                          -- socio, designer, analista, etc
  role                  text not null default 'analista',  -- admin, editor, analista, visitante
  cerebros_permitidos   text[] default array['*']::text[], -- ['elo','proalt'] ou ['*']
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- ========================================================================
-- AGENTES (prep pra V1)
-- ========================================================================

create table if not exists pinguim.squads (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  nome          text not null,
  emoji         text default '🤖',
  caso_de_uso   text,
  status        pinguim.squad_status not null default 'planejado',
  prioridade    smallint default 99,
  objetivo      text,
  dependencias  text[],
  criado_em     timestamptz not null default now()
);

create table if not exists pinguim.agentes (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text unique not null,
  squad_id               uuid references pinguim.squads(id) on delete set null,
  cerebro_id             uuid references pinguim.cerebros(id) on delete set null,
  nome                   text not null,
  avatar                 text,
  cor                    text default '#E85C00',
  status                 pinguim.agente_status not null default 'planejado',
  missao                 text,
  entrada                text,
  saida_esperada         text,
  limites                text,
  handoff                text,
  criterio_qualidade     text,
  metrica_sucesso        text,
  modelo                 text default 'gpt-4o-mini',
  modelo_fallback        text,
  retrieval_k            integer not null default 8,
  temperatura            numeric(3,2) default 0.7,
  system_prompt          text,
  custo_estimado_exec    numeric(10,4) default 0,
  limite_execucoes_dia   integer default 200,
  kill_switch_ativo      boolean not null default true,
  canais                 text[] default array[]::text[],
  ferramentas            text[] default array[]::text[],
  criado_em              timestamptz not null default now()
);

create index if not exists agentes_squad_idx    on pinguim.agentes(squad_id);
create index if not exists agentes_cerebro_idx  on pinguim.agentes(cerebro_id);
create index if not exists agentes_status_idx   on pinguim.agentes(status);

-- ========================================================================
-- TASKS
-- ========================================================================

create table if not exists pinguim.tasks (
  id                    uuid primary key default gen_random_uuid(),
  squad_id              uuid references pinguim.squads(id) on delete set null,
  agente_id             uuid references pinguim.agentes(id) on delete set null,
  titulo                text not null,
  descricao             text,
  status                pinguim.task_status not null default 'inbox',
  prioridade            text default 'normal',
  requester             text,
  canal                 text,
  tags                  text[] default array[]::text[],
  alerta                boolean not null default false,
  aguardando_aprovacao  boolean not null default false,
  latencia_ms           integer,
  custo_usd             numeric(10,4),
  modelo_usado          text,
  output_md             text,
  chunks_usados         uuid[] default array[]::uuid[],  -- audit trail RAG
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists tasks_status_idx  on pinguim.tasks(status);
create index if not exists tasks_squad_idx   on pinguim.tasks(squad_id);
create index if not exists tasks_agente_idx  on pinguim.tasks(agente_id);

-- ========================================================================
-- SKILLS
-- ========================================================================

create table if not exists pinguim.skills (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  nome           text not null,
  categoria      text,
  descricao      text,
  conteudo_md    text,
  universal      boolean not null default false,
  cerebro_id     uuid references pinguim.cerebros(id) on delete cascade,
  agente_id      uuid references pinguim.agentes(id) on delete cascade,
  versao         text default 'v1.0',
  criado_em      timestamptz not null default now()
);

create index if not exists skills_cerebro_idx on pinguim.skills(cerebro_id);
create index if not exists skills_agente_idx  on pinguim.skills(agente_id);

-- ========================================================================
-- CRONS (metadados — usa pg_cron real em public.cron quando for a vez)
-- ========================================================================

create table if not exists pinguim.crons (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,
  nome                 text not null,
  descricao            text,
  schedule_expression  text not null,
  alvo                 text,
  cerebro_id           uuid references pinguim.cerebros(id) on delete set null,
  ativo                boolean not null default true,
  ultima_execucao      timestamptz,
  proxima_execucao     timestamptz,
  sucesso_ultima       boolean,
  mensagem_ultima      text,
  criado_em            timestamptz not null default now()
);

-- ========================================================================
-- VIEWS
-- ========================================================================

create or replace view pinguim.vw_cerebros_catalogo as
select
  c.id                            as cerebro_id,
  p.id                            as produto_id,
  p.slug                          as slug,
  p.nome                          as nome,
  p.emoji                         as emoji,
  p.descricao                     as descricao,
  p.status                        as status,
  c.ultima_alimentacao            as ultima_alimentacao,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.ingest_status = 'ok'),
    0
  )                               as total_fontes,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'aula' and f.ingest_status = 'ok'),
    0
  )                               as total_aulas,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'pagina_venda' and f.ingest_status = 'ok'),
    0
  )                               as total_paginas,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'depoimento' and f.ingest_status = 'ok'),
    0
  )                               as total_depoimentos,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'objecao' and f.ingest_status = 'ok'),
    0
  )                               as total_objecoes,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'sacada' and f.ingest_status = 'ok'),
    0
  )                               as total_sacadas,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.criado_em > now() - interval '7 days'),
    0
  )                               as fontes_ultima_semana
from pinguim.cerebros c
join pinguim.produtos p on p.id = c.produto_id;


create or replace view pinguim.vw_ingest_quarentena as
select
  a.id              as arquivo_id,
  a.lote_id         as lote_id,
  a.cerebro_id      as cerebro_id,
  a.nome_original   as nome,
  a.tipo_sugerido   as tipo_sugerido,
  a.tipo_confianca  as confianca,
  a.tipo_justificativa as justificativa,
  a.mime            as mime,
  a.tamanho_bytes   as tamanho,
  a.motivo_erro     as motivo_erro,
  a.criado_em       as criado_em,
  l.nome_arquivo    as lote_nome,
  p.nome            as cerebro_nome
from pinguim.ingest_arquivos a
join pinguim.ingest_lotes l on l.id = a.lote_id
join pinguim.cerebros c on c.id = a.cerebro_id
join pinguim.produtos p on p.id = c.produto_id
where a.status = 'quarentena'
order by a.criado_em desc;

-- ========================================================================
-- RPC pra busca semântica (usada pelos agentes)
-- ========================================================================

create or replace function pinguim.buscar_chunks_semantico(
  query_embedding extensions.vector(1536),
  target_cerebro_id uuid,
  top_k integer default 8,
  min_similarity numeric default 0.5
)
returns table (
  chunk_id     uuid,
  fonte_id     uuid,
  tipo         text,
  titulo       text,
  conteudo     text,
  similarity   numeric
)
language sql stable as $$
  select
    c.id               as chunk_id,
    c.fonte_id         as fonte_id,
    f.tipo             as tipo,
    f.titulo           as titulo,
    c.conteudo         as conteudo,
    (1 - (c.embedding <=> query_embedding))::numeric as similarity
  from pinguim.cerebro_fontes_chunks c
  join pinguim.cerebro_fontes f on f.id = c.fonte_id
  where c.cerebro_id = target_cerebro_id
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit top_k;
$$;

-- ========================================================================
-- TRIGGER: atualiza ultima_alimentacao do cerebro quando fonte entra
-- ========================================================================

create or replace function pinguim.fn_trg_fonte_change()
returns trigger language plpgsql as $$
begin
  update pinguim.cerebros
    set ultima_alimentacao = greatest(
          coalesce(ultima_alimentacao, 'epoch'::timestamptz),
          coalesce(new.criado_em, now())
        ),
        atualizado_em = now()
    where id = coalesce(new.cerebro_id, old.cerebro_id);
  return coalesce(new, old);
end $$;

drop trigger if exists trg_fonte_change on pinguim.cerebro_fontes;
create trigger trg_fonte_change
  after insert or update on pinguim.cerebro_fontes
  for each row execute function pinguim.fn_trg_fonte_change();

-- ========================================================================
-- GRANTS pro PostgREST / supabase-js acessarem o schema
-- ========================================================================
-- Isso é OBRIGATÓRIO pra lib do supabase conseguir ler/escrever via REST
-- ========================================================================

grant usage on schema pinguim to anon, authenticated, service_role;
grant all on all tables    in schema pinguim to service_role;
grant all on all sequences in schema pinguim to service_role;
grant all on all functions in schema pinguim to service_role;

-- anon e authenticated só leem (ajustamos depois com RLS)
grant select on all tables in schema pinguim to anon, authenticated;

alter default privileges in schema pinguim
  grant all on tables to service_role;
alter default privileges in schema pinguim
  grant all on sequences to service_role;
alter default privileges in schema pinguim
  grant all on functions to service_role;
alter default privileges in schema pinguim
  grant select on tables to anon, authenticated;

-- ========================================================================
-- PGREST: expor schema pinguim na API REST do Supabase
-- ========================================================================
-- Isso precisa ser feito no dashboard: Settings > API > Exposed schemas
-- Adicionar "pinguim" à lista (separado por vírgula do "public" que já tá lá)
-- Sem isso, a lib supabase-js { db: { schema: 'pinguim' } } não funciona.
-- ========================================================================

-- FIM DO SCHEMA PINGUIM
