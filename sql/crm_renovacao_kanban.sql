drop function if exists pinguim.crm_renovacao_kanban(text,text);
create function pinguim.crm_renovacao_kanban(p_mentoria text default null, p_produto_padrao text default null, p_duracao_meses integer default 12)
returns table(cliente_id uuid, nome text, email text, telefone text, estagio text, ordem integer, mentoria text, motivo_perda text, produtos_vencidos text, n_followups bigint, proximo_followup timestamptz)
language sql stable as $fn$
  with
  -- TODO comprador do produto da mentoria (1 linha por cliente+produto, compra mais recente)
  compradores as (
    select cliente_id,
           substring(id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') buyer,
           produto_id, max(produto_nome) produto_nome, max(data_compra)::date ancora
    from pinguim.crm_compra
    where status in ('approved','completed','complete')
      and (p_produto_padrao is null or produto_nome ilike p_produto_padrao)
    group by cliente_id, substring(id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), produto_id
  ),
  -- casa com assinatura (se existir). SEM assinatura = compra única.
  base as (
    select c.cliente_id, c.produto_nome, c.ancora,
           a.status ass_status, a.plan_name,
           case
             when a.status is null then 'unica'
             when a.plan_name ilike '%anual%' or a.plan_name ilike '%365%' or a.plan_name ilike '%12x%' then 'anual'
             else 'mensal'
           end per
    from compradores c
    left join pinguim.crm_assinatura a on a.buyer_id = c.buyer and a.product_id = c.produto_id
  ),
  venc as (
    select *,
      case
        -- compra única: data da compra + duração da mentoria (padrão 12m)
        when per = 'unica' then (ancora + make_interval(months => p_duracao_meses))::date
        when per = 'anual' then (ancora + interval '12 months')::date
        else (ancora + make_interval(months =>
          greatest(1, ((extract(year from current_date)*12+extract(month from current_date))
                       - (extract(year from ancora)*12+extract(month from ancora)))::int
                     + case when extract(day from current_date) >= extract(day from ancora) then 1 else 0 end)))::date
      end vd,
      -- "ativo" = assinatura ativa OU compra única cuja vigência ainda não acabou
      case
        when ass_status in ('ACTIVE','STARTED') then true
        when per = 'unica' and (ancora + make_interval(months => p_duracao_meses))::date >= current_date then true
        else false
      end ativo
    from base
  ),
  -- 1 linha por cliente: pior situação (vencido > a_vencer > vigente)
  auto as (
    select cliente_id,
      case
        when bool_or(not ativo) then 'vencido'
        when bool_or((vd - current_date) <= 30) then 'a_vencer'
        else 'vigente'
      end estagio_auto,
      string_agg(distinct coalesce(plan_name, produto_nome), ', ') produtos
    from venc group by cliente_id
  ),
  cards as (
    select r.cliente_id, r.estagio, r.ordem, r.mentoria, r.motivo_perda
    from pinguim.crm_renovacao r
    where (p_mentoria is null or r.mentoria is not distinct from p_mentoria)
  ),
  todos as (
    select c.cliente_id, c.estagio, c.ordem, c.mentoria, c.motivo_perda, a.produtos
    from cards c left join auto a on a.cliente_id = c.cliente_id
    union all
    select a.cliente_id, a.estagio_auto, 0, p_mentoria::text, null::text, a.produtos
    from auto a
    where not exists (
      select 1 from pinguim.crm_renovacao r
      where r.cliente_id = a.cliente_id and (p_mentoria is null or r.mentoria is not distinct from p_mentoria)
    )
  )
  select t.cliente_id, cl.nome, cl.email_canon, cl.tel_canon,
    t.estagio, t.ordem, t.mentoria, t.motivo_perda,
    t.produtos produtos_vencidos,
    (select count(*) from pinguim.crm_anotacao an where an.cliente_id=t.cliente_id and an.lembrete_em is not null and an.feito=false) n_followups,
    (select min(an.lembrete_em) from pinguim.crm_anotacao an where an.cliente_id=t.cliente_id and an.lembrete_em is not null and an.feito=false) proximo_followup
  from todos t join pinguim.crm_cliente cl on cl.cliente_id = t.cliente_id
  order by t.estagio, t.ordem, cl.nome;
$fn$;
