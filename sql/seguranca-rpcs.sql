-- =====================================================================
-- RPCs auxiliares pra Edge Function auditar-seguranca
-- =====================================================================

-- 1. Lista todas as tabelas do schema pinguim com flag de RLS
create or replace function pinguim.listar_tabelas_rls()
returns table(tabela text, rls_ativo boolean, total_linhas bigint)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
begin
  return query
  select
    c.relname::text as tabela,
    c.relrowsecurity as rls_ativo,
    coalesce((select reltuples::bigint from pg_class where oid = c.oid), 0) as total_linhas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'pinguim'
    and c.relkind = 'r'
  order by c.relname;
end;
$$;
grant execute on function pinguim.listar_tabelas_rls() to authenticated, service_role;

-- 2. Lista tabelas com contagem de policies
create or replace function pinguim.listar_tabelas_policies()
returns table(tabela text, rls_ativo boolean, total_policies integer)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
begin
  return query
  select
    c.relname::text as tabela,
    c.relrowsecurity as rls_ativo,
    (select count(*)::integer from pg_policies p
       where p.schemaname = 'pinguim' and p.tablename = c.relname) as total_policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'pinguim'
    and c.relkind = 'r'
  order by c.relname;
end;
$$;
grant execute on function pinguim.listar_tabelas_policies() to authenticated, service_role;

-- 3. Lista funcoes SECURITY DEFINER e flag de search_path explicito
create or replace function pinguim.listar_funcoes_security_definer()
returns table(nome text, security_definer boolean, search_path_seguro boolean)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
begin
  return query
  select
    p.proname::text as nome,
    p.prosecdef as security_definer,
    -- search_path seguro = configuracao explicita em proconfig
    (p.proconfig is not null
     and exists (
       select 1 from unnest(p.proconfig) as cfg
       where cfg like 'search_path=%'
     )) as search_path_seguro
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pinguim'
    and p.prokind = 'f'
  order by p.proname;
end;
$$;
grant execute on function pinguim.listar_funcoes_security_definer() to authenticated, service_role;

-- 4. Raio-X do banco: tamanho de cada tabela + total
create or replace function pinguim.raio_x_banco()
returns table(
  tabela text,
  total_linhas bigint,
  tamanho_total_bytes bigint,
  tamanho_dados_bytes bigint,
  tamanho_indices_bytes bigint
)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
begin
  return query
  select
    c.relname::text as tabela,
    (select reltuples::bigint from pg_class where oid = c.oid) as total_linhas,
    pg_total_relation_size(c.oid) as tamanho_total_bytes,
    pg_relation_size(c.oid) as tamanho_dados_bytes,
    pg_indexes_size(c.oid) as tamanho_indices_bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'pinguim'
    and c.relkind = 'r'
  order by pg_total_relation_size(c.oid) desc;
end;
$$;
grant execute on function pinguim.raio_x_banco() to authenticated, service_role;

-- 5. Listar policies de uma tabela (pra UI de detalhe)
create or replace function pinguim.listar_policies(nome_tabela text)
returns table(policy_nome text, comando text, qual_clause text, with_check_clause text)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
begin
  return query
  select
    p.policyname::text,
    p.cmd::text,
    p.qual::text,
    p.with_check::text
  from pg_policies p
  where p.schemaname = 'pinguim' and p.tablename = nome_tabela
  order by p.policyname;
end;
$$;
grant execute on function pinguim.listar_policies(text) to authenticated, service_role;
