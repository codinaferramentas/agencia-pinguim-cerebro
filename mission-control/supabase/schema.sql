-- ========================================================================
-- MISSION CONTROL — SCHEMA SUPABASE
-- ========================================================================
-- Aplicar no Supabase via SQL Editor ou psql.
-- Depende de: extensões pgcrypto (uuid) e pg_cron (agendamento)
-- ========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- ========================================================================
-- ENUMS (tipos nomeados)
-- ========================================================================

create type produto_status as enum ('ativo', 'em_construcao', 'rascunho', 'arquivado');
create type cerebro_peca_tipo as enum ('aula', 'pagina_venda', 'persona', 'objecao', 'depoimento', 'sacada', 'externo', 'csv', 'pitch', 'faq', 'outro');
create type cerebro_peca_origem as enum ('upload', 'lote', 'discord', 'whatsapp', 'telegram', 'expert', 'externo', 'csv', 'sistema');
create type cerebro_peca_status as enum ('aprovado', 'pendente', 'ruido', 'duplicado');
create type conexao_tipo as enum ('responde_a', 'comprovada_por', 'alinha_com', 'contradiz', 'mesmo_modulo', 'referenciada_por');
create type agente_status as enum ('planejado', 'em_criacao', 'em_teste', 'em_producao', 'pausado');
create type task_status as enum ('inbox', 'assigned', 'in_progress', 'review', 'aguardando_aprovacao', 'done', 'travado');
create type squad_status as enum ('planejado', 'em_criacao', 'em_teste', 'em_producao');
create type canal_tipo as enum ('discord', 'whatsapp', 'telegram', 'instagram', 'outro');

-- ========================================================================
-- PRODUTOS
-- ========================================================================

create table if not exists produtos (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  nome        text not null,
  emoji       text default '📦',
  descricao   text,
  status      produto_status not null default 'em_construcao',
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ========================================================================
-- CÉREBROS (1:1 com produto)
-- ========================================================================

create table if not exists cerebros (
  id                  uuid primary key default gen_random_uuid(),
  produto_id          uuid unique not null references produtos(id) on delete cascade,
  preenchimento_pct   smallint not null default 0 check (preenchimento_pct between 0 and 100),
  mapa_md             text,
  ultima_alimentacao  timestamptz,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index if not exists cerebros_produto_idx on cerebros(produto_id);

-- ========================================================================
-- PEÇAS DO CÉREBRO (conteúdo)
-- ========================================================================

create table if not exists cerebro_pecas (
  id                uuid primary key default gen_random_uuid(),
  cerebro_id        uuid not null references cerebros(id) on delete cascade,
  tipo              cerebro_peca_tipo not null,
  titulo            text not null,
  conteudo_md       text,
  origem            cerebro_peca_origem not null,
  autor             text,
  fonte_url         text,
  status_curador    cerebro_peca_status not null default 'pendente',
  peso              smallint not null default 5 check (peso between 1 and 10),
  tags              text[] default array[]::text[],
  metadados         jsonb default '{}'::jsonb,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists cerebro_pecas_cerebro_idx on cerebro_pecas(cerebro_id);
create index if not exists cerebro_pecas_tipo_idx on cerebro_pecas(tipo);
create index if not exists cerebro_pecas_status_idx on cerebro_pecas(status_curador);
create index if not exists cerebro_pecas_criado_em_idx on cerebro_pecas(criado_em desc);

-- ========================================================================
-- CONEXÕES (edges do grafo)
-- ========================================================================

create table if not exists cerebro_conexoes (
  id              uuid primary key default gen_random_uuid(),
  peca_a_id       uuid not null references cerebro_pecas(id) on delete cascade,
  peca_b_id       uuid not null references cerebro_pecas(id) on delete cascade,
  tipo            conexao_tipo not null,
  forca           smallint not null default 5 check (forca between 1 and 10),
  criada_por      text,
  criado_em       timestamptz not null default now(),
  check (peca_a_id <> peca_b_id)
);

create index if not exists cerebro_conexoes_peca_a_idx on cerebro_conexoes(peca_a_id);
create index if not exists cerebro_conexoes_peca_b_idx on cerebro_conexoes(peca_b_id);

-- ========================================================================
-- EVENTOS (auditoria)
-- ========================================================================

create table if not exists cerebro_eventos (
  id          uuid primary key default gen_random_uuid(),
  cerebro_id  uuid references cerebros(id) on delete cascade,
  peca_id     uuid references cerebro_pecas(id) on delete set null,
  acao        text not null,
  autor       text,
  detalhes    jsonb default '{}'::jsonb,
  criado_em   timestamptz not null default now()
);

create index if not exists cerebro_eventos_cerebro_idx on cerebro_eventos(cerebro_id);
create index if not exists cerebro_eventos_criado_em_idx on cerebro_eventos(criado_em desc);

-- ========================================================================
-- CANAIS INTEGRADOS (Discord/WA/Telegram)
-- ========================================================================

create table if not exists canais_integrados (
  id            uuid primary key default gen_random_uuid(),
  tipo          canal_tipo not null,
  identificador text not null,
  apelido       text,
  cerebro_alvo  uuid references cerebros(id) on delete set null,
  ativo         boolean not null default true,
  ultimo_scan   timestamptz,
  config        jsonb default '{}'::jsonb,
  criado_em     timestamptz not null default now()
);

-- ========================================================================
-- CURADOR LOGS
-- ========================================================================

create table if not exists curador_logs (
  id             uuid primary key default gen_random_uuid(),
  peca_id        uuid references cerebro_pecas(id) on delete cascade,
  classificacao  cerebro_peca_status not null,
  confianca      numeric(3,2) check (confianca between 0 and 1),
  motivo         text,
  criado_em      timestamptz not null default now()
);

-- ========================================================================
-- AGENTES
-- ========================================================================

create table if not exists squads (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  nome          text not null,
  emoji         text default '🤖',
  caso_de_uso   text,
  status        squad_status not null default 'planejado',
  prioridade    smallint default 99,
  objetivo      text,
  dependencias  text[],
  criado_em     timestamptz not null default now()
);

create table if not exists agentes (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text unique not null,
  squad_id               uuid references squads(id) on delete set null,
  nome                   text not null,
  avatar                 text,
  cor                    text default '#E85C00',
  status                 agente_status not null default 'planejado',
  missao                 text,
  entrada                text,
  saida_esperada         text,
  limites                text,
  handoff                text,
  criterio_qualidade     text,
  metrica_sucesso        text,
  modelo                 text,
  modelo_fallback        text,
  custo_estimado_exec    numeric(10,4) default 0,
  limite_execucoes_dia   integer default 200,
  kill_switch_ativo      boolean not null default true,
  canais                 text[] default array[]::text[],
  ferramentas            text[] default array[]::text[],
  soul_ref               text,
  criado_em              timestamptz not null default now()
);

create index if not exists agentes_squad_idx on agentes(squad_id);
create index if not exists agentes_status_idx on agentes(status);

-- ========================================================================
-- TASKS
-- ========================================================================

create table if not exists tasks (
  id                       uuid primary key default gen_random_uuid(),
  squad_id                 uuid references squads(id) on delete set null,
  agente_id                uuid references agentes(id) on delete set null,
  titulo                   text not null,
  descricao                text,
  status                   task_status not null default 'inbox',
  prioridade               text default 'normal',
  requester                text,
  canal                    text,
  tags                     text[] default array[]::text[],
  alerta                   boolean not null default false,
  aguardando_aprovacao     boolean not null default false,
  latencia_ms              integer,
  custo_usd                numeric(10,4),
  modelo_usado             text,
  output_md                text,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

create index if not exists tasks_status_idx on tasks(status);
create index if not exists tasks_squad_idx on tasks(squad_id);
create index if not exists tasks_agente_idx on tasks(agente_id);

-- ========================================================================
-- SKILLS
-- ========================================================================

create table if not exists skills (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  nome           text not null,
  categoria      text,
  descricao      text,
  conteudo_md    text,
  universal      boolean not null default false,
  cerebro_id     uuid references cerebros(id) on delete cascade,
  agente_id      uuid references agentes(id) on delete cascade,
  versao         text default 'v1.0',
  criado_em      timestamptz not null default now()
);

create index if not exists skills_cerebro_idx on skills(cerebro_id);
create index if not exists skills_agente_idx on skills(agente_id);

-- ========================================================================
-- CRONS (metadados + uso do pg_cron real abaixo)
-- ========================================================================

create table if not exists crons (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text unique not null,
  nome                   text not null,
  descricao              text,
  schedule_expression    text not null,
  alvo                   text,
  ativo                  boolean not null default true,
  ultima_execucao        timestamptz,
  proxima_execucao       timestamptz,
  sucesso_ultima         boolean,
  mensagem_ultima        text,
  criado_em              timestamptz not null default now()
);

-- ========================================================================
-- VIEW: catálogo de cérebros (usado pela tela Cérebros)
-- ========================================================================

create or replace view vw_cerebros_catalogo as
select
  c.id                                                     as cerebro_id,
  p.id                                                     as produto_id,
  p.slug                                                   as slug,
  p.nome                                                   as nome,
  p.emoji                                                  as emoji,
  p.descricao                                              as descricao,
  p.status                                                 as status,
  c.preenchimento_pct                                      as preenchimento_pct,
  c.ultima_alimentacao                                     as ultima_alimentacao,
  coalesce(
    (select count(*) from cerebro_pecas cp where cp.cerebro_id = c.id and cp.status_curador = 'aprovado'),
    0
  )                                                        as total_pecas,
  coalesce(
    (select count(*) from cerebro_pecas cp where cp.cerebro_id = c.id and cp.tipo = 'aula' and cp.status_curador = 'aprovado'),
    0
  )                                                        as total_aulas,
  coalesce(
    (select count(*) from cerebro_pecas cp where cp.cerebro_id = c.id and cp.tipo = 'pagina_venda' and cp.status_curador = 'aprovado'),
    0
  )                                                        as total_paginas,
  coalesce(
    (select count(*) from cerebro_pecas cp where cp.cerebro_id = c.id and cp.tipo = 'objecao' and cp.status_curador = 'aprovado'),
    0
  )                                                        as total_objecoes,
  coalesce(
    (select count(*) from cerebro_pecas cp where cp.cerebro_id = c.id and cp.tipo = 'depoimento' and cp.status_curador = 'aprovado'),
    0
  )                                                        as total_depoimentos,
  coalesce(
    (select count(*) from cerebro_pecas cp where cp.cerebro_id = c.id and cp.tipo = 'sacada' and cp.status_curador = 'aprovado'),
    0
  )                                                        as total_sacadas,
  coalesce(
    (select count(*) from cerebro_pecas cp where cp.cerebro_id = c.id and cp.criado_em > now() - interval '7 days'),
    0
  )                                                        as pecas_ultima_semana
from cerebros c
join produtos p on p.id = c.produto_id;

-- ========================================================================
-- FUNÇÃO: atualizar preenchimento_pct automaticamente
-- ========================================================================

create or replace function fn_atualizar_preenchimento_cerebro(target_cerebro_id uuid)
returns void language plpgsql as $$
declare
  total int;
  pontuacao int := 0;
begin
  select count(*) into total from cerebro_pecas where cerebro_id = target_cerebro_id and status_curador = 'aprovado';
  -- fórmula simples: cada tipo cobre 1 bucket; tamanho do bucket é ponderado
  -- V0: score = min(100, total * 2)  — refinar em V1
  pontuacao := least(100, total * 2);
  update cerebros set preenchimento_pct = pontuacao, atualizado_em = now() where id = target_cerebro_id;
end $$;

create or replace function fn_trg_peca_change()
returns trigger language plpgsql as $$
begin
  perform fn_atualizar_preenchimento_cerebro(coalesce(new.cerebro_id, old.cerebro_id));
  update cerebros
    set ultima_alimentacao = greatest(coalesce(ultima_alimentacao, 'epoch'::timestamptz), coalesce(new.criado_em, now()))
    where id = coalesce(new.cerebro_id, old.cerebro_id);
  return coalesce(new, old);
end $$;

drop trigger if exists trg_peca_change on cerebro_pecas;
create trigger trg_peca_change
  after insert or update or delete on cerebro_pecas
  for each row execute function fn_trg_peca_change();

-- ========================================================================
-- CRONS via pg_cron (placeholders — ativar quando rotinas reais estiverem prontas)
-- ========================================================================
-- Exemplos (comentados — descomentar quando V1 for ativar):
--
-- select cron.schedule(
--   'varre_discord_depoimentos',
--   '0 */6 * * *',
--   $$ select 1 /* chamar edge function ou rpc que varre Discord */ $$
-- );
--
-- select cron.schedule(
--   'consolida_memoria_noturna',
--   '0 23 * * *',
--   $$ select 1 /* consolidar lições do dia nos cérebros */ $$
-- );

-- ========================================================================
-- RLS (Row Level Security) — mínimo pra V0 (desenvolvimento aberto)
-- ========================================================================
-- Em V0 deixamos permissivo. Em V1 endurecer quando OpenClaw + sócios logarem.
-- Habilitar RLS sem políticas = bloqueia tudo, então ou criamos políticas
-- ou deixamos RLS desligado por enquanto.

alter table produtos disable row level security;
alter table cerebros disable row level security;
alter table cerebro_pecas disable row level security;
alter table cerebro_conexoes disable row level security;
alter table cerebro_eventos disable row level security;
alter table canais_integrados disable row level security;
alter table curador_logs disable row level security;
alter table squads disable row level security;
alter table agentes disable row level security;
alter table tasks disable row level security;
alter table skills disable row level security;
alter table crons disable row level security;

-- FIM DO SCHEMA
