-- Vigência por produto do cliente (ficha do CRM, bloco "Vigência dos acessos").
-- 27/11/2026 (caso Marcio Fabiane): plano parcelado com todas as parcelas pagas vem da Hotmart como EXPIRED
-- e aparecia como "Vencido" em vermelho, parecendo dívida. Agora:
--   EXPIRED  → 'Concluído' (todas as parcelas do plano pagas) ou 'Encerrado' (a Hotmart fechou antes; observação mostra quantas) · CANCELED → 'Cancelado'
--   ACTIVE parada há mais de 45 dias porque o cliente passou para outro produto da mesma mentoria → 'Migrou'
--   uma linha por produto (antes saía duplicado quando parte das compras não tinha o buyer no id_externo)
--   observacao: "3 de 3 parcelas pagas" / "migrou para Mentoria Taurus Master em 18/08/2026"
drop function if exists pinguim.crm_cliente_vigencia(uuid);
create function pinguim.crm_cliente_vigencia(p_cliente uuid)
returns table(
  produto_nome text, situacao text, status_assinatura text, plano text,
  desde timestamptz, ultima_compra timestamptz,
  vence_em date, dias_para_vencer integer, periodicidade text, observacao text
)
language sql stable as $fn$
  with base as (
    select c.produto_id, c.produto_nome, c.data_compra,
           substring(c.id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') as buyer_id
    from pinguim.crm_compra c
    where c.cliente_id = p_cliente
      and c.status in ('approved','completed','complete')
      and c.produto_nome is not null
  ),
  compras as (
    select produto_nome,
           array_agg(distinct produto_id) filter (where produto_id is not null) as produto_ids,
           array_agg(distinct buyer_id) filter (where buyer_id is not null) as buyer_ids,
           max(data_compra) as ultima_compra,
           count(distinct date_trunc('month', data_compra)) as n_pagas,  -- por mês: a Hotmart repete a parcela a cada tentativa
           -- família da mentoria (para achar a migração entre produtos)
           case when produto_nome ~* 'taurus' then 'taurus' when produto_nome ~* 'orion|mastermind' then 'orion'
                when produto_nome ~* 'lyra|lira' then 'lyra' else null end as familia
    from base group by produto_nome
  ),
  com_ass as (
    select cp.*, a.status as ass_status, a.plan_name, a.started_at, a.canceled_at
    from compras cp
    left join lateral (
      select a.* from pinguim.crm_assinatura a
      where a.buyer_id = any(cp.buyer_ids) and a.product_id = any(cp.produto_ids)
      order by (a.status in ('ACTIVE','STARTED')) desc, (a.status = 'PAST_DUE') desc, a.started_at desc nulls last
      limit 1
    ) a on true
  ),
  calc as (
    select ca.*,
      case
        when produto_nome ilike '%vitalíci%' or produto_nome ilike '%vitalici%' then 'vitalicio'
        when ass_status is null then 'unica'
        when plan_name ilike '%anual%' or plan_name ilike '%365%' or plan_name ilike '%12x%' then 'anual'
        else 'mensal'
      end as periodicidade,
      coalesce(started_at, ultima_compra)::date as ancora,  -- Hotmart nao manda started_at; ancora = data da compra
      nullif(substring(plan_name from '^\s*(\d+)\s*x'), '')::int as n_plano,
      -- assinatura ativa parada (> 45 dias sem cobrança) e cliente comprou outro produto da mesma mentoria depois
      (select o.produto_nome || ' em ' || to_char(min(b2.data_compra) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
         from compras o join base b2 on b2.produto_nome = o.produto_nome
        where ca.familia is not null and o.familia = ca.familia and o.produto_nome <> ca.produto_nome
          and b2.data_compra > ca.ultima_compra
        group by o.produto_nome order by min(b2.data_compra) limit 1) as migrou_para
    from com_ass ca
  ),
  venc as (
    select *,
      (ass_status in ('ACTIVE','STARTED') and migrou_para is not null and ultima_compra < now() - interval '45 days') as migrou,
      -- VENCE_EM so p/ assinatura ATIVA que vence (mensal/anual). Vitalicio/unica/nao-ativa = null
      case
        when ass_status not in ('ACTIVE','STARTED') then null
        when periodicidade in ('vitalicio','unica') then null
        when periodicidade = 'anual' then (ancora + interval '12 months')::date
        -- mensal: proxima cobranca = ancora + N meses, menor N que caia em >= hoje.
        when periodicidade = 'mensal' then (
          ancora + make_interval(months =>
            greatest(1,
              ((extract(year from current_date)*12 + extract(month from current_date))
               - (extract(year from ancora)*12 + extract(month from ancora)))::int
              + case when extract(day from current_date) >= extract(day from ancora) then 1 else 0 end
            )
          )
        )::date
        else null
      end as vence_em_calc
    from calc
  )
  select
    produto_nome,
    case
      when periodicidade = 'vitalicio' then 'Vitalício'
      when migrou then 'Migrou'
      when ass_status is null then 'Ativo'
      when ass_status in ('ACTIVE','STARTED') then 'Ativo'
      when ass_status = 'PAST_DUE' then 'Em atraso'
      when ass_status = 'EXPIRED' and (n_plano is null or n_pagas >= n_plano) then 'Concluído'
      when ass_status = 'EXPIRED' then 'Encerrado'
      when ass_status = 'CANCELED' then 'Cancelado'
      else 'Ativo'
    end as situacao,
    ass_status as status_assinatura,
    plan_name as plano,
    started_at as desde,
    ultima_compra,
    case when migrou then null else vence_em_calc end as vence_em,
    case when migrou or vence_em_calc is null then null else (vence_em_calc - current_date) end as dias_para_vencer,
    periodicidade,
    case
      when migrou then 'migrou para ' || migrou_para || ' · ' || n_pagas || coalesce(' de ' || n_plano, '') || case when n_pagas = 1 and n_plano is null then ' parcela paga' else ' parcelas pagas' end || ' aqui'
      when ass_status = 'EXPIRED' then n_pagas || coalesce(' de ' || n_plano, '') || case when n_pagas = 1 and n_plano is null then ' parcela paga' else ' parcelas pagas' end || ' · plano encerrado na Hotmart'
      when ass_status in ('ACTIVE','STARTED','PAST_DUE') and n_plano is not null then n_pagas || ' de ' || n_plano || ' parcelas pagas'
      else null
    end as observacao
  from venc
  order by ultima_compra desc;
$fn$;
grant execute on function pinguim.crm_cliente_vigencia(uuid) to service_role, authenticated;
revoke execute on function pinguim.crm_cliente_vigencia(uuid) from public, anon;
