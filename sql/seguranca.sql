-- =====================================================================
-- Pilar Segurança — schema base
-- =====================================================================
-- Princípio: defesa em profundidade (Weidman), Zero Trust (Santos),
-- baseline + anomalia (Sanders), threat intel (Carey), Hacker Playbook
-- (Kim), OWASP Top 10 (Manico).

-- 1. Relatorios de auditoria (todo cron de seguranca grava aqui)
create table if not exists pinguim.seguranca_relatorios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                   -- 'rls' | 'segredos' | 'deps' | 'owasp' | 'raio_x_banco' | 'red_team' | 'zero_trust' | 'threat_intel' | 'ids'
  status text not null,                 -- 'ok' | 'warning' | 'critical'
  resumo text,
  detalhes jsonb default '{}'::jsonb,
  total_checks integer default 0,
  total_falhas integer default 0,
  duracao_ms integer,
  criado_em timestamptz not null default now()
);
create index if not exists seguranca_relatorios_tipo_idx on pinguim.seguranca_relatorios(tipo, criado_em desc);
create index if not exists seguranca_relatorios_status_idx on pinguim.seguranca_relatorios(status) where status != 'ok';

-- 2. Metricas do banco no tempo (raio-x serie historica)
create table if not exists pinguim.banco_metricas (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  schema_nome text not null default 'pinguim',
  total_linhas bigint not null,
  tamanho_bytes bigint default 0,
  criado_em timestamptz not null default now()
);
create index if not exists banco_metricas_tabela_idx on pinguim.banco_metricas(tabela, criado_em desc);

-- 3. Politicas de seguranca (Dalio: principios escritos, nunca redecidir)
-- Quando feedback do Andre/cliente vira politica escrita.
create table if not exists pinguim.politicas_seguranca (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titulo text not null,
  descricao text,
  regra_md text not null,               -- markdown da politica
  escopo text not null default 'global', -- 'global' | 'agente' | 'tool' | 'tabela'
  alvo text,                            -- nome do agente/tool/tabela quando escopo != global
  ativo boolean not null default true,
  origem text,                          -- 'feedback_andre' | 'feedback_cliente' | 'auditoria' | 'incidente' | 'manual'
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists politicas_seguranca_escopo_idx on pinguim.politicas_seguranca(escopo, ativo);

-- 4. Incidentes detectados (tentativas de invasao, anomalias do IDS)
create table if not exists pinguim.seguranca_incidentes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                   -- 'auth_falhou' | 'rate_limit' | 'rls_violado' | 'cve_critico' | 'anomalia_trafego' | 'chave_vazou'
  severidade text not null default 'medio', -- 'baixo' | 'medio' | 'alto' | 'critico'
  origem_ip text,
  recurso text,                         -- tabela/funcao/url tentada
  payload_md text,                      -- detalhes (curl, headers etc)
  acao_tomada text,                     -- 'bloqueado' | 'logado' | 'notificado' | 'permitido'
  resolvido boolean default false,
  detalhes jsonb default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists seguranca_incidentes_idx on pinguim.seguranca_incidentes(criado_em desc);
create index if not exists seguranca_incidentes_aberto_idx on pinguim.seguranca_incidentes(severidade, resolvido) where resolvido = false;

-- 5. RLS em tudo
alter table pinguim.seguranca_relatorios enable row level security;
alter table pinguim.banco_metricas enable row level security;
alter table pinguim.politicas_seguranca enable row level security;
alter table pinguim.seguranca_incidentes enable row level security;

drop policy if exists seg_rel_select on pinguim.seguranca_relatorios;
create policy seg_rel_select on pinguim.seguranca_relatorios
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists seg_rel_modify on pinguim.seguranca_relatorios;
create policy seg_rel_modify on pinguim.seguranca_relatorios
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists banco_met_select on pinguim.banco_metricas;
create policy banco_met_select on pinguim.banco_metricas
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists banco_met_modify on pinguim.banco_metricas;
create policy banco_met_modify on pinguim.banco_metricas
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists pol_seg_select on pinguim.politicas_seguranca;
create policy pol_seg_select on pinguim.politicas_seguranca
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists pol_seg_modify on pinguim.politicas_seguranca;
create policy pol_seg_modify on pinguim.politicas_seguranca
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
            with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists seg_inc_select on pinguim.seguranca_incidentes;
create policy seg_inc_select on pinguim.seguranca_incidentes
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists seg_inc_modify on pinguim.seguranca_incidentes;
create policy seg_inc_modify on pinguim.seguranca_incidentes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- =====================================================================
-- 6. Trigger: toda tabela nova em pinguim valida RLS automaticamente
-- =====================================================================
-- Se alguem criar tabela sem RLS, dispara incidente critico.
create or replace function pinguim.fn_check_rls_ativo()
returns event_trigger language plpgsql as $$
declare
  obj record;
  rls_ativo boolean;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
      and schema_name = 'pinguim'
  loop
    select c.relrowsecurity into rls_ativo
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'pinguim' and c.relname = split_part(obj.object_identity, '.', 2);

    if not rls_ativo then
      insert into pinguim.seguranca_incidentes (tipo, severidade, recurso, payload_md, acao_tomada, detalhes)
      values (
        'rls_off_em_tabela_nova',
        'critico',
        obj.object_identity,
        format('Tabela %s foi criada sem RLS. Pinguim OS exige RLS em toda tabela do schema pinguim.', obj.object_identity),
        'logado',
        jsonb_build_object('tabela', obj.object_identity, 'detectado_em', now())
      );
    end if;
  end loop;
end;
$$;

drop event trigger if exists trg_check_rls_ativo;
create event trigger trg_check_rls_ativo
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function pinguim.fn_check_rls_ativo();

-- =====================================================================
-- 7. Funcao publica: contagem REAL (sem limite do PostgREST)
-- =====================================================================
-- Solucao do problema "Supabase limita 500/1000 linhas no select".
-- Frontend chama via RPC, recebe count exato.
create or replace function pinguim.contar_tabela(nome_tabela text)
returns bigint
language plpgsql
security definer
set search_path = pinguim, pg_temp
as $$
declare
  total bigint;
  tabelas_permitidas text[] := array[
    'produtos', 'cerebros', 'cerebro_fontes', 'cerebro_fontes_chunks',
    'personas', 'personas_snapshots',
    'agentes', 'squads', 'agente_clones',
    'funis', 'funil_etapas', 'funil_conexoes', 'funil_agentes',
    'ingest_lotes', 'ingest_arquivos',
    'seguranca_relatorios', 'banco_metricas', 'politicas_seguranca',
    'seguranca_incidentes', 'cerebro_fonte_versoes'
  ];
begin
  if not (nome_tabela = any(tabelas_permitidas)) then
    raise exception 'Tabela nao permitida: %', nome_tabela;
  end if;
  execute format('select count(*) from pinguim.%I', nome_tabela) into total;
  return total;
end;
$$;
grant execute on function pinguim.contar_tabela(text) to authenticated, service_role;
