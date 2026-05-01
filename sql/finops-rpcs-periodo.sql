-- =====================================================================
-- FinOps — RPCs aceitando periodo (data_inicio, data_fim)
-- =====================================================================
-- Criadas pra suportar seletor de periodo no painel /finops.
-- As RPCs antigas (custo_mes_corrente, custos_30_dias, tokens_ia_mes)
-- continuam existindo pra nao quebrar nada que use.
--
-- Padrao: data_inicio e data_fim INCLUSIVOS.
-- =====================================================================

-- ---------- 1. custo_periodo: agregado pra cards da Visao geral ----------
CREATE OR REPLACE FUNCTION pinguim.custo_periodo(
  p_inicio date,
  p_fim date
)
RETURNS TABLE(
  total_usd numeric,
  por_provedor jsonb,
  por_operacao jsonb,
  dias_periodo integer,
  dias_com_dado integer,
  media_dia_usd numeric,
  projecao_30_dias_usd numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pinguim', 'pg_catalog', 'pg_temp'
AS $$
declare
  v_total numeric;
  v_dias integer;
  v_dias_com_dado integer;
  v_media numeric;
begin
  v_dias := greatest(1, (p_fim - p_inicio) + 1);

  select coalesce(sum(custo_usd), 0) into v_total
  from pinguim.custos_diarios
  where dia between p_inicio and p_fim;

  select count(distinct dia) into v_dias_com_dado
  from pinguim.custos_diarios
  where dia between p_inicio and p_fim;

  v_media := case when v_dias > 0 then v_total / v_dias else 0 end;

  return query
  select
    v_total as total_usd,
    coalesce((select jsonb_object_agg(provedor, total)
      from (select provedor, sum(custo_usd) as total
            from pinguim.custos_diarios
            where dia between p_inicio and p_fim
            group by provedor) p), '{}'::jsonb) as por_provedor,
    coalesce((select jsonb_object_agg(operacao, total)
      from (select operacao, sum(custo_usd) as total
            from pinguim.custos_diarios
            where dia between p_inicio and p_fim
            group by operacao) o), '{}'::jsonb) as por_operacao,
    v_dias as dias_periodo,
    v_dias_com_dado as dias_com_dado,
    round(v_media, 6) as media_dia_usd,
    round(v_media * 30, 4) as projecao_30_dias_usd;
end;
$$;

GRANT EXECUTE ON FUNCTION pinguim.custo_periodo(date, date) TO authenticated;

-- ---------- 2. custos_serie: serie diaria pro grafico ----------
CREATE OR REPLACE FUNCTION pinguim.custos_serie(
  p_inicio date,
  p_fim date
)
RETURNS TABLE(
  dia date,
  total_usd numeric,
  por_provedor jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pinguim', 'pg_catalog', 'pg_temp'
AS $$
begin
  return query
  select
    d.dia::date as dia,
    coalesce(sum(c.custo_usd), 0) as total_usd,
    coalesce(jsonb_object_agg(c.provedor, c.custo_usd) filter (where c.provedor is not null), '{}'::jsonb) as por_provedor
  from generate_series(p_inicio, p_fim, '1 day'::interval) as d(dia)
  left join pinguim.custos_diarios c on c.dia = d.dia::date
  group by d.dia
  order by d.dia;
end;
$$;

GRANT EXECUTE ON FUNCTION pinguim.custos_serie(date, date) TO authenticated;

-- ---------- 3. tokens_ia_periodo: detalhamento OpenAI/Anthropic ----------
CREATE OR REPLACE FUNCTION pinguim.tokens_ia_periodo(
  p_inicio date,
  p_fim date
)
RETURNS TABLE(
  operacao text,
  total_usd numeric,
  qtd_eventos integer,
  pct_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pinguim', 'pg_catalog', 'pg_temp'
AS $$
declare
  v_total numeric;
begin
  select coalesce(sum(custo_usd), 0) into v_total
  from pinguim.custos_diarios
  where dia between p_inicio and p_fim
    and provedor in ('OpenAI', 'Anthropic');

  return query
  select
    c.operacao,
    sum(c.custo_usd) as total_usd,
    sum(c.qtd_eventos)::integer as qtd_eventos,
    case when v_total > 0 then round((sum(c.custo_usd) / v_total) * 100, 2) else 0 end as pct_total
  from pinguim.custos_diarios c
  where c.dia between p_inicio and p_fim
    and c.provedor in ('OpenAI', 'Anthropic')
  group by c.operacao
  order by total_usd desc;
end;
$$;

GRANT EXECUTE ON FUNCTION pinguim.tokens_ia_periodo(date, date) TO authenticated;
