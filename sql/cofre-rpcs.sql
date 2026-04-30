-- =====================================================================
-- Cofre como fonte canônica de chaves
-- =====================================================================
-- Adiciona:
--   1. Tabela chave_uso — auditoria viva (quem leu qual chave quando)
--   2. RPC get_chave — usado pelas Edge Functions e ingest-engine
--   3. RPC listar_chaves_em_uso — dashboard de auditoria
-- =====================================================================

-- 1. Tabela de auditoria de uso
create table if not exists pinguim.chave_uso (
  id bigserial primary key,
  chave_nome text not null,
  consumidor text not null,            -- nome da função/script que leu (ex.: 'buscar-cerebro', 'ingest-engine-local')
  origem text,                         -- 'edge-function' | 'local' | 'painel'
  sucesso boolean not null default true,
  motivo_falha text,
  criado_em timestamptz not null default now()
);
create index if not exists chave_uso_idx on pinguim.chave_uso(chave_nome, criado_em desc);
create index if not exists chave_uso_consumidor_idx on pinguim.chave_uso(consumidor, criado_em desc);

alter table pinguim.chave_uso enable row level security;
drop policy if exists chave_uso_select on pinguim.chave_uso;
create policy chave_uso_select on pinguim.chave_uso
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists chave_uso_insert on pinguim.chave_uso;
create policy chave_uso_insert on pinguim.chave_uso
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- 2. RPC get_chave — retorna o valor de uma chave + audita uso
create or replace function pinguim.get_chave(
  p_nome text,
  p_consumidor text default 'desconhecido',
  p_origem text default 'edge-function'
)
returns text
language plpgsql
security definer
set search_path = pinguim, pg_temp
as $$
declare
  valor text;
  ativa boolean;
begin
  select valor_completo, ativo into valor, ativa
  from pinguim.cofre_chaves
  where nome = p_nome
  limit 1;

  if valor is null or not ativa then
    insert into pinguim.chave_uso (chave_nome, consumidor, origem, sucesso, motivo_falha)
    values (p_nome, p_consumidor, p_origem, false,
            case when valor is null then 'chave nao cadastrada ou sem valor'
                 else 'chave inativa' end);
    return null;
  end if;

  insert into pinguim.chave_uso (chave_nome, consumidor, origem, sucesso)
  values (p_nome, p_consumidor, p_origem, true);
  return valor;
end;
$$;
grant execute on function pinguim.get_chave(text, text, text) to authenticated, service_role;

-- 3. RPC listar_chaves_em_uso — pra dashboard
create or replace function pinguim.listar_chaves_em_uso(
  p_horas integer default 24
)
returns table(
  chave_nome text,
  total_leituras bigint,
  total_falhas bigint,
  ultima_leitura timestamptz,
  consumidores text[]
)
language plpgsql
security definer
set search_path = pinguim, pg_temp
as $$
begin
  return query
  select
    u.chave_nome::text,
    count(*)::bigint as total_leituras,
    count(*) filter (where not u.sucesso)::bigint as total_falhas,
    max(u.criado_em) as ultima_leitura,
    array_agg(distinct u.consumidor) as consumidores
  from pinguim.chave_uso u
  where u.criado_em >= now() - (p_horas || ' hours')::interval
  group by u.chave_nome
  order by total_leituras desc;
end;
$$;
grant execute on function pinguim.listar_chaves_em_uso(integer) to authenticated, service_role;
