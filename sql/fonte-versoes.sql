-- Versionamento de cerebro_fontes (usado primariamente pra SOUL de Clones,
-- mas funciona pra qualquer fonte editavel manualmente).
--
-- Cria snapshot toda vez que conteudo_md muda significativamente (>50 chars
-- diff). Mantem historico ordenado por versao.

create table if not exists pinguim.cerebro_fonte_versoes (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references pinguim.cerebro_fontes(id) on delete cascade,
  versao integer not null,
  conteudo_md text not null,
  tamanho_bytes integer,
  metadata jsonb default '{}'::jsonb,
  motivo text,                   -- 'edicao_guiada' | 'edicao_livre' | 'enriquecimento_llm' | 'restauracao'
  criado_em timestamptz not null default now(),
  unique(fonte_id, versao)
);

create index if not exists cerebro_fonte_versoes_fonte_idx
  on pinguim.cerebro_fonte_versoes(fonte_id, versao desc);

-- Coluna versao na tabela principal (versao atual)
alter table pinguim.cerebro_fontes
  add column if not exists versao integer not null default 1;

-- RLS: mesmo padrao que cerebro_fontes (authenticated only)
alter table pinguim.cerebro_fonte_versoes enable row level security;

drop policy if exists fonte_versoes_select on pinguim.cerebro_fonte_versoes;
create policy fonte_versoes_select on pinguim.cerebro_fonte_versoes
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists fonte_versoes_insert on pinguim.cerebro_fonte_versoes;
create policy fonte_versoes_insert on pinguim.cerebro_fonte_versoes
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists fonte_versoes_delete on pinguim.cerebro_fonte_versoes;
create policy fonte_versoes_delete on pinguim.cerebro_fonte_versoes
  for delete using (auth.role() = 'authenticated' or auth.role() = 'service_role');
