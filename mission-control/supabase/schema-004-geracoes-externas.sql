-- SCHEMA 004: GERACOES_EXTERNAS (projeto externo de variacoes de anuncio)
-- Idempotente. Rodar no SQL Editor do Supabase.

create table if not exists pinguim.geracoes_externas (
  id                    uuid primary key default gen_random_uuid(),
  origem                text not null default 'projeto-externo-criativos',
  token_usado_hash      text,
  produto_slug          text not null,
  produto_id            uuid references pinguim.produtos(id) on delete set null,
  cerebro_id            uuid references pinguim.cerebros(id) on delete set null,
  persona_id            uuid references pinguim.personas(id) on delete set null,
  persona_versao        int,
  anuncio_referencia    text not null,
  clone_slugs           text[] not null,
  modo                  text not null check (modo in ('unico','paralelo','consenso')),
  briefing              text not null,
  formato_alvo          text not null default 'anuncio_meta',
  metadata_externa      jsonb default '{}'::jsonb,
  status                text not null default 'processando' check (status in ('processando','concluido','falhou')),
  iniciado_em           timestamptz not null default now(),
  concluido_em          timestamptz,
  erro_codigo           text,
  erro_mensagem         text,
  outputs               jsonb,
  cerebro_chunks_consultados int,
  skills_aplicadas      text[],
  modelo_principal      text,
  custo_total_usd       numeric(10,6) default 0,
  latencia_ms           int,
  tokens_in             int default 0,
  tokens_out            int default 0,
  execucoes_internas    uuid[] default array[]::uuid[],
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists geracoes_externas_status_idx    on pinguim.geracoes_externas(status, criado_em desc);
create index if not exists geracoes_externas_produto_idx   on pinguim.geracoes_externas(produto_slug, criado_em desc);
create index if not exists geracoes_externas_origem_idx    on pinguim.geracoes_externas(origem, criado_em desc);

comment on table pinguim.geracoes_externas is
  'Solicitacoes vindas do projeto externo (gerador de variacoes de anuncio). Modelo assincrono: dispara, retorna id, polling ate concluir.';


create table if not exists pinguim.feedback_externo (
  id                    uuid primary key default gen_random_uuid(),
  origem                text not null default 'projeto-externo-criativos',
  geracao_id            uuid references pinguim.geracoes_externas(id) on delete set null,
  execucao_id           uuid,
  tipo                  text not null check (tipo in ('skill_insight','clone_insight','anatomia_insight','outro')),
  alvo_slug             text not null,
  observacao            text not null,
  evidencias            jsonb default '[]'::jsonb,
  autor_externo         text,
  status_review         text not null default 'pendente' check (status_review in ('pendente','aprovado','rejeitado','convertido')),
  aprendizado_id        uuid,
  revisado_por          text,
  revisado_em           timestamptz,
  nota_revisor          text,
  criado_em             timestamptz not null default now()
);

create index if not exists feedback_externo_status_idx on pinguim.feedback_externo(status_review, criado_em desc);
create index if not exists feedback_externo_alvo_idx   on pinguim.feedback_externo(alvo_slug, tipo);

comment on table pinguim.feedback_externo is
  'Insights de skill/clone enviados pelo projeto externo. Passam por review humano antes de virar aprendizado_agente. Rate limit: 10/dia por origem.';


create or replace function pinguim.fn_trg_geracoes_atualizado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists trg_geracoes_externas_atualizado on pinguim.geracoes_externas;
create trigger trg_geracoes_externas_atualizado
  before update on pinguim.geracoes_externas
  for each row execute function pinguim.fn_trg_geracoes_atualizado();


grant all on pinguim.geracoes_externas to service_role;
grant all on pinguim.feedback_externo  to service_role;


create or replace view pinguim.vw_geracoes_externas_recentes as
select
  g.id,
  g.origem,
  g.produto_slug,
  p.nome as produto_nome,
  g.clone_slugs,
  g.modo,
  g.status,
  g.iniciado_em,
  g.concluido_em,
  case when g.concluido_em is not null
       then extract(epoch from (g.concluido_em - g.iniciado_em))::int
       else extract(epoch from (now() - g.iniciado_em))::int
  end as duracao_segundos,
  g.custo_total_usd,
  g.erro_codigo,
  array_length(g.execucoes_internas, 1) as agentes_invocados,
  jsonb_array_length(coalesce(g.outputs, '[]'::jsonb)) as outputs_gerados
from pinguim.geracoes_externas g
left join pinguim.produtos p on p.slug = g.produto_slug
order by g.criado_em desc;

grant select on pinguim.vw_geracoes_externas_recentes to service_role, authenticated;

comment on view pinguim.vw_geracoes_externas_recentes is
  'Dashboard interno: o que o projeto externo esta/esteve solicitando, custo, tempo, status.';
