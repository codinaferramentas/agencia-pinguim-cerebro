-- ========================================================================
-- SCHEMA 003 — PERSONAS + AGENTE_EXECUCOES
-- ========================================================================
-- Parte 1: tabela `personas` — cada versão de persona gerada por um Cérebro.
-- Parte 2: tabela `agente_execucoes` — log operacional compartilhado por
--          TODOS os agentes (custo, tokens, latência). Zero tabela por agente.
--
-- Rodar no SQL Editor do Supabase. Idempotente — pode rodar várias vezes.
-- ========================================================================

-- ========================================================================
-- PARTE 1: personas
-- ========================================================================

create table if not exists pinguim.personas (
  id                  uuid primary key default gen_random_uuid(),
  cerebro_id          uuid not null references pinguim.cerebros(id) on delete cascade,

  versao              integer not null,                -- v1, v2, v3... por cérebro
  gerada_em           timestamptz not null default now(),
  gerada_por          text not null,                   -- 'agente:persona-pinguim' | 'humano:edicao-manual'
  motivo              text,                            -- 'geracao_inicial' | 'regeracao_manual' | 'pos_upload'

  -- Blocos estruturais da persona (JSONB pra evoluir schema sem migration)
  dados_basicos       jsonb not null default '{}'::jsonb,      -- {nome_ficticio, idade, profissao, momento_de_vida}
  rotina              jsonb not null default '{}'::jsonb,      -- {como_e_o_dia, desafios_diarios}
  vozes_cabeca        jsonb not null default '[]'::jsonb,      -- 10 strings, primeira pessoa
  desejos_reprimidos  jsonb not null default '[]'::jsonb,      -- 10 strings
  crencas_limitantes  jsonb not null default '[]'::jsonb,      -- 10 strings
  dores_latentes      jsonb not null default '[]'::jsonb,      -- 10 strings
  objecoes_compra     jsonb not null default '[]'::jsonb,      -- 5-10 strings
  palavras_utilizadas jsonb not null default '[]'::jsonb,      -- [{palavra, justificativa}]x10
  nivel_consciencia   text,                                    -- unaware|problem-aware|solution-aware|product-aware|most-aware

  -- Rastreabilidade: quais chunks fundamentaram essa versão
  chunks_usados       jsonb not null default '[]'::jsonb,      -- [uuid, uuid, ...]

  -- Relacionamento com a execução que gerou (pra ver custo/tokens dessa versão)
  execucao_id         uuid,                            -- FK soft pra agente_execucoes.id

  -- Constraint: (cerebro_id, versao) é único
  constraint personas_cerebro_versao_unico unique (cerebro_id, versao)
);

create index if not exists personas_cerebro_idx       on pinguim.personas(cerebro_id);
create index if not exists personas_cerebro_versao_idx on pinguim.personas(cerebro_id, versao desc);
create index if not exists personas_gerada_em_idx     on pinguim.personas(gerada_em desc);

comment on table pinguim.personas is
  'Cada versão de persona gerada por um Cérebro. Versionamento natural por (cerebro_id, versao). Nova versão = nova linha, nunca UPDATE em linha existente.';

-- ========================================================================
-- PARTE 2: agente_execucoes — log compartilhado
-- ========================================================================

create table if not exists pinguim.agente_execucoes (
  id                  uuid primary key default gen_random_uuid(),
  agente_slug         text not null,                   -- 'persona-pinguim' | 'copy-elo' | etc (string livre, sem enum)
  cerebro_id          uuid references pinguim.cerebros(id) on delete set null,

  input               jsonb not null default '{}'::jsonb,   -- o que foi passado ao agente
  output              jsonb,                                 -- o que ele gerou (pode ser null se erro)
  chunks_usados       jsonb not null default '[]'::jsonb,   -- chunks consultados via RAG

  modelo              text,                             -- 'gpt-4o-mini', 'text-embedding-3-small', etc
  tokens_in           integer default 0,
  tokens_out          integer default 0,
  custo_usd           numeric(10,6) default 0,
  latencia_ms         integer,

  status              text not null default 'ok',       -- 'ok' | 'erro'
  error               text,

  parent_run_id       uuid,                             -- self-FK pra futuros traces multi-step
  criado_em           timestamptz not null default now()
);

-- Índice composto pro query pattern de 90% dos casos:
-- "últimas execuções do agente X no cérebro Y"
create index if not exists agente_exec_pattern_idx
  on pinguim.agente_execucoes(agente_slug, cerebro_id, criado_em desc);

create index if not exists agente_exec_criado_idx
  on pinguim.agente_execucoes(criado_em desc);

create index if not exists agente_exec_status_idx
  on pinguim.agente_execucoes(status)
  where status != 'ok';   -- índice parcial, só erros

comment on table pinguim.agente_execucoes is
  'Log operacional de TODAS as execuções de QUALQUER agente. Genérica, escala pra 300 agentes sem migration. Use pra dashboard de custo/latência/erro.';

-- ========================================================================
-- GRANTS (alinhar com fix-grants-anon/fix-grants-delete)
-- ========================================================================

grant select, insert on pinguim.personas              to anon, authenticated;
grant select, insert on pinguim.agente_execucoes      to anon, authenticated;
grant delete         on pinguim.personas              to anon, authenticated;  -- pra "zerar persona" se precisar
grant update         on pinguim.personas              to anon, authenticated;  -- pra edição manual de blocos

-- ========================================================================
-- VIEW conveniente: última versão da persona por cérebro
-- ========================================================================

create or replace view pinguim.vw_personas_atuais as
select distinct on (cerebro_id)
  p.id,
  p.cerebro_id,
  p.versao,
  p.gerada_em,
  p.gerada_por,
  p.motivo,
  p.dados_basicos,
  p.rotina,
  p.vozes_cabeca,
  p.desejos_reprimidos,
  p.crencas_limitantes,
  p.dores_latentes,
  p.objecoes_compra,
  p.palavras_utilizadas,
  p.nivel_consciencia,
  p.chunks_usados,
  p.execucao_id
from pinguim.personas p
order by cerebro_id, versao desc;

comment on view pinguim.vw_personas_atuais is
  'Snapshot da última versão da persona de cada Cérebro. Use pra listar "persona atual" sem precisar de subquery de max(versao).';

grant select on pinguim.vw_personas_atuais to anon, authenticated;

-- ========================================================================
-- VIEW: status da persona (tem? está atualizada?)
-- ========================================================================

create or replace view pinguim.vw_persona_status as
select
  c.id as cerebro_id,
  p.nome as cerebro_nome,
  p.slug as cerebro_slug,

  -- Última persona
  (select max(versao) from pinguim.personas where cerebro_id = c.id) as versao_atual,
  (select max(gerada_em) from pinguim.personas where cerebro_id = c.id) as persona_gerada_em,

  -- Fontes adicionadas depois da última persona
  (select count(*) from pinguim.cerebro_fontes f
    where f.cerebro_id = c.id
      and f.ingest_status = 'ok'
      and (
        (select max(gerada_em) from pinguim.personas where cerebro_id = c.id) is null
        or f.criado_em > (select max(gerada_em) from pinguim.personas where cerebro_id = c.id)
      )
  ) as fontes_novas_desde_persona,

  -- Flag de desatualização
  case
    when (select count(*) from pinguim.personas where cerebro_id = c.id) = 0 then 'sem_persona'
    when (select count(*) from pinguim.cerebro_fontes f
          where f.cerebro_id = c.id
            and f.ingest_status = 'ok'
            and f.criado_em > (select max(gerada_em) from pinguim.personas where cerebro_id = c.id)) > 0 then 'desatualizada'
    else 'atualizada'
  end as status_persona
from pinguim.cerebros c
join pinguim.produtos p on p.id = c.produto_id;

comment on view pinguim.vw_persona_status is
  'Status da persona de cada Cérebro: sem_persona | desatualizada | atualizada, e quantas fontes novas entraram desde a última versão.';

grant select on pinguim.vw_persona_status to anon, authenticated;

-- ========================================================================
-- FIM
-- ========================================================================
