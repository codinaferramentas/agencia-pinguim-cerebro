drop function if exists pinguim.crm_cliente_vigencia(uuid);
create function pinguim.crm_cliente_vigencia(p_cliente uuid)
returns table(
  produto_nome text, situacao text, status_assinatura text, plano text,
  desde timestamptz, ultima_compra timestamptz,
  vence_em date, dias_para_vencer integer, periodicidade text
)
language sql stable as $fn$
  with compras as (
    select c.produto_id, c.produto_nome,
           substring(c.id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') as buyer_id,
           max(c.data_compra) as ultima_compra
    from pinguim.crm_compra c
    where c.cliente_id = p_cliente
      and c.status in ('approved','completed','complete')
      and c.produto_nome is not null
    group by c.produto_id, c.produto_nome, substring(c.id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
  ),
  com_ass as (
    select cp.*, a.status as ass_status, a.plan_name, a.started_at, a.canceled_at
    from compras cp
    left join pinguim.crm_assinatura a
      on a.buyer_id = cp.buyer_id and a.product_id = cp.produto_id
  ),
  calc as (
    select *,
      case
        when produto_nome ilike '%vitalíci%' or produto_nome ilike '%vitalici%' then 'vitalicio'
        when ass_status is null then 'unica'
        when plan_name ilike '%anual%' or plan_name ilike '%365%' or plan_name ilike '%12x%' then 'anual'
        else 'mensal'
      end as periodicidade,
      coalesce(started_at, ultima_compra)::date as ancora  -- Hotmart nao manda started_at; ancora = data da compra
    from com_ass
  ),
  venc as (
    select *,
      -- VENCE_EM so p/ assinatura ATIVA que vence (mensal/anual). Vitalicio/unica/nao-ativa = null
      case
        when ass_status not in ('ACTIVE','STARTED') then null
        when periodicidade in ('vitalicio','unica') then null
        when periodicidade = 'anual' then (ancora + interval '12 months')::date
        -- mensal: proxima cobranca = ancora + N meses, menor N que caia em >= hoje.
        -- N = meses-cheios decorridos + 1 (conta por ano*12+mes p/ nao errar em bissexto/fim de mes).
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
      when ass_status is null then 'Ativo'
      when ass_status in ('ACTIVE','STARTED') then 'Ativo'
      when ass_status = 'PAST_DUE' then 'Em atraso'
      when ass_status in ('CANCELED','EXPIRED') then 'Vencido'
      else 'Ativo'
    end as situacao,
    ass_status as status_assinatura,
    plan_name as plano,
    started_at as desde,
    ultima_compra,
    vence_em_calc as vence_em,
    case when vence_em_calc is null then null else (vence_em_calc - current_date) end as dias_para_vencer,
    periodicidade
  from venc
  order by ultima_compra desc;
$fn$;
