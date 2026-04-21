-- ========================================================================
-- MISSION CONTROL — MIGRATION 002: RAG + INGESTÃO EM MASSA
-- ========================================================================
-- Aplica SOBRE schema.sql (001). Aditivo, não destrói tabelas existentes.
-- Depende de: pgvector (habilitar via dashboard Supabase > Database > Extensions)
-- ========================================================================

create extension if not exists vector;

-- ========================================================================
-- FONTES (substitui cerebro_pecas conceitualmente — fica em paralelo)
-- ========================================================================
-- Uma linha = uma "fonte" (aula, depoimento, página, etc). Humanos veem isso.
-- Os chunks vetorizados ficam em cerebro_fontes_chunks (próxima tabela).
-- ========================================================================

create type ingest_status as enum ('pendente', 'processando', 'ok', 'quarentena', 'erro');

create table if not exists cerebro_fontes (
  id              uuid primary key default gen_random_uuid(),
  cerebro_id      uuid not null references cerebros(id) on delete cascade,

  tipo            text not null,        -- livre: aula, pagina_venda, depoimento, objecao, sacada, etc
  titulo          text not null,
  conteudo_md     text,                 -- markdown normalizado (fonte única)
  origem          text not null,        -- upload, lote, discord, whatsapp, expert, scrap, etc
  autor           text,
  url             text,

  tamanho_bytes   integer,
  arquivo_nome    text,                 -- nome original do arquivo (se veio de upload/lote)
  mime            text,

  metadata        jsonb not null default '{}'::jsonb,
                                        -- duração (áudio/vídeo), tags, data gravação,
                                        -- página origem, classificação LLM, confiança, etc

  ingest_status   ingest_status not null default 'pendente',
  ingest_lote_id  uuid,                 -- pra agrupar fontes que vieram do mesmo zip

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists cerebro_fontes_cerebro_idx       on cerebro_fontes(cerebro_id);
create index if not exists cerebro_fontes_tipo_idx          on cerebro_fontes(tipo);
create index if not exists cerebro_fontes_status_idx        on cerebro_fontes(ingest_status);
create index if not exists cerebro_fontes_lote_idx          on cerebro_fontes(ingest_lote_id);
create index if not exists cerebro_fontes_criado_em_idx     on cerebro_fontes(criado_em desc);

-- ========================================================================
-- CHUNKS vetorizados (o que o agente realmente lê via RAG)
-- ========================================================================

create table if not exists cerebro_fontes_chunks (
  id           uuid primary key default gen_random_uuid(),
  fonte_id     uuid not null references cerebro_fontes(id) on delete cascade,
  cerebro_id   uuid not null references cerebros(id) on delete cascade,
                                                  -- denormalizado pra filtrar rápido

  chunk_index  integer not null,                  -- posição na fonte (0, 1, 2…)
  conteudo     text not null,                     -- ~500 tokens de texto
  token_count  integer,

  embedding    vector(1536),                      -- OpenAI text-embedding-3-small
  embedding_model text default 'text-embedding-3-small',

  criado_em    timestamptz not null default now()
);

-- ANN index pra busca semântica rápida (cosine distance)
create index if not exists cerebro_fontes_chunks_embedding_idx
  on cerebro_fontes_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists cerebro_fontes_chunks_fonte_idx    on cerebro_fontes_chunks(fonte_id);
create index if not exists cerebro_fontes_chunks_cerebro_idx  on cerebro_fontes_chunks(cerebro_id);

-- ========================================================================
-- LOTES DE INGESTÃO (cada zip/pacote que entra vira 1 lote)
-- ========================================================================

create type lote_tipo as enum ('pacote_zip', 'upload_manual', 'cron');
create type lote_status as enum ('recebido', 'extraindo', 'classificando', 'vetorizando', 'concluido', 'falhou');

create table if not exists ingest_lotes (
  id                  uuid primary key default gen_random_uuid(),
  cerebro_id          uuid not null references cerebros(id) on delete cascade,

  tipo                lote_tipo not null default 'pacote_zip',
  status              lote_status not null default 'recebido',

  nome_arquivo        text,                       -- ex: "elo-drive-abril.zip"
  tamanho_bytes       bigint,

  disparado_por       text,                       -- andré / luiz / cron-discord
  disparado_via       text,                       -- painel / cli / webhook

  -- stats
  arquivos_totais     integer default 0,
  fontes_criadas      integer default 0,
  chunks_criados      integer default 0,
  em_quarentena       integer default 0,

  custo_usd           numeric(10,6) default 0,    -- embedding + classificador + whisper
  duracao_ms          integer,

  log_md              text,                       -- relatório textual final
  erro_detalhes       text,

  criado_em           timestamptz not null default now(),
  finalizado_em       timestamptz
);

create index if not exists ingest_lotes_cerebro_idx  on ingest_lotes(cerebro_id);
create index if not exists ingest_lotes_status_idx   on ingest_lotes(status);
create index if not exists ingest_lotes_criado_idx   on ingest_lotes(criado_em desc);

-- ========================================================================
-- LOG por arquivo (auditoria fina — o que aconteceu com cada arquivo do zip)
-- ========================================================================

create table if not exists ingest_arquivos (
  id              uuid primary key default gen_random_uuid(),
  lote_id         uuid not null references ingest_lotes(id) on delete cascade,
  cerebro_id      uuid not null references cerebros(id) on delete cascade,
  fonte_id        uuid references cerebro_fontes(id) on delete set null,

  nome_original   text not null,                  -- "Aula 04 - Protocolo 2.pdf"
  caminho         text,                           -- path dentro do zip
  mime            text,
  tamanho_bytes   integer,
  sha256          text,                           -- evita duplicar ingestão

  -- classificação automática
  tipo_sugerido   text,
  tipo_confianca  numeric(3,2),                   -- 0.00 a 1.00
  tipo_justificativa text,
  classificado_por text,                          -- gpt-4o-mini / heuristica / manual

  -- status de execução
  status          ingest_status not null default 'pendente',
  motivo_erro     text,

  criado_em       timestamptz not null default now(),
  processado_em   timestamptz
);

create index if not exists ingest_arquivos_lote_idx     on ingest_arquivos(lote_id);
create index if not exists ingest_arquivos_status_idx   on ingest_arquivos(status);
create index if not exists ingest_arquivos_sha_idx      on ingest_arquivos(sha256);

-- ========================================================================
-- RPC: busca semântica (usada pelos agentes)
-- ========================================================================

create or replace function buscar_chunks_semantico(
  query_embedding vector(1536),
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
  from cerebro_fontes_chunks c
  join cerebro_fontes f on f.id = c.fonte_id
  where c.cerebro_id = target_cerebro_id
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit top_k;
$$;

-- ========================================================================
-- VIEW: últimas ingestões (tela de Triagem)
-- ========================================================================

create or replace view vw_ingest_quarentena as
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
from ingest_arquivos a
join ingest_lotes l on l.id = a.lote_id
join cerebros c on c.id = a.cerebro_id
join produtos p on p.id = c.produto_id
where a.status = 'quarentena'
order by a.criado_em desc;

-- ========================================================================
-- RLS off por enquanto (V0)
-- ========================================================================

alter table cerebro_fontes disable row level security;
alter table cerebro_fontes_chunks disable row level security;
alter table ingest_lotes disable row level security;
alter table ingest_arquivos disable row level security;

-- FIM DA MIGRATION 002
