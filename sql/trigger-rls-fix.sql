-- =====================================================================
-- Fix: trigger trg_check_rls_ativo gerava falsos positivos
-- =====================================================================
-- Problema: o trigger dispara em ddl_command_end de CREATE TABLE,
-- ANTES do ALTER TABLE ENABLE RLS que vem na linha seguinte do mesmo
-- arquivo SQL. Resultado: todo CREATE TABLE com RLS habilitado depois
-- gera incidente crítico falso positivo.
--
-- Solucao: trocar pra checagem batch — funcao que percorre todas as
-- tabelas do schema pinguim e abre incidentes (ou resolve existentes)
-- baseado no estado ATUAL. Roda via cron diario ou sob demanda.
-- =====================================================================

-- 1. Marca incidentes existentes de 'rls_off_em_tabela_nova' como
-- resolvidos quando a tabela apontada tem RLS ativo agora.
update pinguim.seguranca_incidentes inc
set resolvido = true,
    detalhes = coalesce(inc.detalhes, '{}'::jsonb) || jsonb_build_object(
      'auto_resolvido_em', now(),
      'motivo', 'auditoria automatica detectou RLS ativo'
    )
where inc.tipo = 'rls_off_em_tabela_nova'
  and inc.resolvido = false
  and exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'pinguim'
      and (n.nspname || '.' || c.relname) = inc.recurso
      and c.relrowsecurity = true
  );

-- 2. Remove o trigger antigo (era barulhento)
drop event trigger if exists trg_check_rls_ativo;
drop function if exists pinguim.fn_check_rls_ativo();

-- 3. Funcao de auditoria batch — chamada pela Edge Function
-- auditar-seguranca. Abre incidente novo se tabela aparecer sem RLS,
-- e resolve incidente aberto se a tabela ja tem RLS ativo.
create or replace function pinguim.reconciliar_incidentes_rls()
returns table(acao text, tabela text)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
declare
  r record;
begin
  -- 1. Abre incidente pra tabela sem RLS sem incidente aberto
  for r in
    select c.relname::text as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'pinguim'
      and c.relkind = 'r'
      and c.relrowsecurity = false
      and not exists (
        select 1 from pinguim.seguranca_incidentes inc
        where inc.recurso = 'pinguim.' || c.relname
          and inc.tipo = 'rls_off_em_tabela_nova'
          and inc.resolvido = false
      )
  loop
    insert into pinguim.seguranca_incidentes (tipo, severidade, recurso, payload_md, acao_tomada, detalhes)
    values (
      'rls_off_em_tabela_nova',
      'critico',
      'pinguim.' || r.tabela,
      format('Tabela pinguim.%s nao tem RLS ativo. Pinguim OS exige RLS em toda tabela do schema pinguim.', r.tabela),
      'logado',
      jsonb_build_object('detectado_em', now(), 'origem', 'reconciliar_incidentes_rls')
    );
    acao := 'aberto';
    tabela := 'pinguim.' || r.tabela;
    return next;
  end loop;

  -- 2. Resolve incidente aberto cuja tabela agora tem RLS ativo
  for r in
    update pinguim.seguranca_incidentes inc
    set resolvido = true,
        detalhes = coalesce(inc.detalhes, '{}'::jsonb) || jsonb_build_object(
          'auto_resolvido_em', now(),
          'motivo', 'reconciliar detectou RLS ativo'
        )
    where inc.tipo = 'rls_off_em_tabela_nova'
      and inc.resolvido = false
      and exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'pinguim'
          and (n.nspname || '.' || c.relname) = inc.recurso
          and c.relrowsecurity = true
      )
    returning inc.recurso
  loop
    acao := 'resolvido';
    tabela := r.recurso;
    return next;
  end loop;
end;
$$;
grant execute on function pinguim.reconciliar_incidentes_rls() to authenticated, service_role;
