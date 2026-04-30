-- =====================================================================
-- Pilar FinOps Pinguim OS
-- =====================================================================
-- Squad: JR Storment (FinOps Foundation), Corey Quinn (waste detection),
-- Eli Mansoor (cloud optimization), Mike Fuller (cost-per-workload).
--
-- Princípio: cliente Pinguim OS abre o painel e VÊ quanto está gastando.
-- Sem surpresa de fim de mês, sem teatro.
-- =====================================================================

-- 1. custos_diarios — snapshot agregado por dia/provedor/operacao
create table if not exists pinguim.custos_diarios (
  id bigserial primary key,
  dia date not null,
  provedor text not null,                  -- 'OpenAI' | 'Supabase' | 'Vercel' | 'Apify' | 'Anthropic'
  operacao text not null,                  -- 'embedding' | 'gpt-4o-mini' | 'whisper' | 'vision' | 'banco' | 'edge-functions' | 'storage' | 'bandwidth'
  custo_usd numeric(12, 6) not null default 0,
  qtd_eventos integer not null default 0,
  metadata jsonb default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  unique (dia, provedor, operacao)
);
create index if not exists custos_diarios_dia_idx on pinguim.custos_diarios(dia desc);
create index if not exists custos_diarios_provedor_idx on pinguim.custos_diarios(provedor, dia desc);

-- 2. custos_alertas — regras configuradas pelo Andre
create table if not exists pinguim.custos_alertas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titulo text not null,
  descricao text,
  tipo text not null,                      -- 'mensal_total' | 'mensal_provedor' | 'banco_pct_plano' | 'crescimento_pct'
  alvo text,                               -- nome do provedor/operacao quando relevante
  limite_valor numeric(12, 4),             -- ex: 50.00 (US$ 50)
  limite_pct integer,                      -- ex: 80 (80% do plano)
  ativo boolean not null default true,
  ultimo_disparo timestamptz,
  criado_em timestamptz not null default now()
);

-- 3. RLS
alter table pinguim.custos_diarios enable row level security;
alter table pinguim.custos_alertas enable row level security;

drop policy if exists custos_diarios_select on pinguim.custos_diarios;
create policy custos_diarios_select on pinguim.custos_diarios
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists custos_diarios_modify on pinguim.custos_diarios;
create policy custos_diarios_modify on pinguim.custos_diarios
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists custos_alertas_select on pinguim.custos_alertas;
create policy custos_alertas_select on pinguim.custos_alertas
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists custos_alertas_modify on pinguim.custos_alertas;
create policy custos_alertas_modify on pinguim.custos_alertas
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
            with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- 4. RPCs de agregacao

-- Custo do mes corrente (todos os provedores agregados)
create or replace function pinguim.custo_mes_corrente()
returns table(
  total_usd numeric,
  por_provedor jsonb,
  por_operacao jsonb,
  dias_no_mes integer,
  dias_corridos integer,
  projecao_fim_mes_usd numeric
)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
declare
  v_inicio_mes date := date_trunc('month', current_date)::date;
  v_fim_mes date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_total numeric;
  v_dias_corridos integer;
  v_dias_no_mes integer;
  v_projecao numeric;
begin
  v_dias_no_mes := extract(day from v_fim_mes);
  v_dias_corridos := greatest(1, current_date - v_inicio_mes + 1);

  select coalesce(sum(custo_usd), 0) into v_total
  from pinguim.custos_diarios
  where dia >= v_inicio_mes;

  v_projecao := case when v_dias_corridos > 0
    then (v_total / v_dias_corridos) * v_dias_no_mes
    else 0
  end;

  return query
  select
    v_total as total_usd,
    coalesce((select jsonb_object_agg(provedor, total)
      from (select provedor, sum(custo_usd) as total
            from pinguim.custos_diarios
            where dia >= v_inicio_mes
            group by provedor) p), '{}'::jsonb) as por_provedor,
    coalesce((select jsonb_object_agg(operacao, total)
      from (select operacao, sum(custo_usd) as total
            from pinguim.custos_diarios
            where dia >= v_inicio_mes
            group by operacao) o), '{}'::jsonb) as por_operacao,
    v_dias_no_mes as dias_no_mes,
    v_dias_corridos as dias_corridos,
    round(v_projecao, 4) as projecao_fim_mes_usd;
end;
$$;
grant execute on function pinguim.custo_mes_corrente() to authenticated, service_role;

-- Serie temporal de 30 dias (pra grafico)
create or replace function pinguim.custos_30_dias()
returns table(
  dia date,
  total_usd numeric,
  por_provedor jsonb
)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
begin
  return query
  select
    d.dia::date as dia,
    coalesce(sum(c.custo_usd), 0) as total_usd,
    coalesce(jsonb_object_agg(c.provedor, c.custo_usd) filter (where c.provedor is not null), '{}'::jsonb) as por_provedor
  from generate_series(current_date - 29, current_date, '1 day'::interval) as d(dia)
  left join pinguim.custos_diarios c on c.dia = d.dia::date
  group by d.dia
  order by d.dia;
end;
$$;
grant execute on function pinguim.custos_30_dias() to authenticated, service_role;

-- Tokens IA: detalhamento OpenAI/Anthropic do mes
create or replace function pinguim.tokens_ia_mes()
returns table(
  operacao text,
  total_usd numeric,
  qtd_eventos integer,
  pct_total numeric
)
language plpgsql
security definer
set search_path = pinguim, pg_catalog, pg_temp
as $$
declare
  v_total numeric;
  v_inicio_mes date := date_trunc('month', current_date)::date;
begin
  select coalesce(sum(custo_usd), 0) into v_total
  from pinguim.custos_diarios
  where dia >= v_inicio_mes
    and provedor in ('OpenAI', 'Anthropic');

  return query
  select
    c.operacao,
    sum(c.custo_usd) as total_usd,
    sum(c.qtd_eventos)::integer as qtd_eventos,
    case when v_total > 0 then round((sum(c.custo_usd) / v_total) * 100, 2) else 0 end as pct_total
  from pinguim.custos_diarios c
  where c.dia >= v_inicio_mes
    and c.provedor in ('OpenAI', 'Anthropic')
  group by c.operacao
  order by total_usd desc;
end;
$$;
grant execute on function pinguim.tokens_ia_mes() to authenticated, service_role;

-- 5. Pre-popular alertas padrao
insert into pinguim.custos_alertas (slug, titulo, descricao, tipo, alvo, limite_valor, ativo, criado_em) values
  ('openai-mensal', 'OpenAI mensal alto', 'Avisa quando OpenAI passar US$ 50 no mes',
    'mensal_provedor', 'OpenAI', 50.00, true, now()),
  ('total-mensal', 'Total mensal alto', 'Avisa quando total mensal de todos os provedores passar US$ 100',
    'mensal_total', null, 100.00, true, now()),
  ('banco-80pct', 'Banco perto do limite', 'Avisa quando banco passar 80% do plano Supabase',
    'banco_pct_plano', null, null, true, now())
on conflict (slug) do nothing;

update pinguim.custos_alertas set limite_pct = 80 where slug = 'banco-80pct' and limite_pct is null;
