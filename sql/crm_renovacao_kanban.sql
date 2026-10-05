-- aceita o novo estágio 'vigente'
alter table pinguim.crm_renovacao drop constraint if exists crm_renovacao_estagio_check;
alter table pinguim.crm_renovacao add constraint crm_renovacao_estagio_check
  check (estagio = any (array['vigente','a_vencer','vencido','primeiro_contato','followup','call_agendada','call_realizada','negociacao','renovado','perdido']));

drop function if exists pinguim.crm_renovacao_kanban(text);
drop function if exists pinguim.crm_renovacao_kanban(text,text);
create function pinguim.crm_renovacao_kanban(p_mentoria text default null, p_produto_padrao text default null)
returns table(cliente_id uuid, nome text, email text, telefone text, estagio text, ordem integer, mentoria text, motivo_perda text, produtos_vencidos text, n_followups bigint, proximo_followup timestamptz)
language sql stable as $fn$
  with
  -- assinaturas do recorte (por mentoria via produto), com a periodicidade + âncora (data da compra)
  base as (
    select distinct ce.cliente_id, a.status ass_status, a.plan_name,
           case when a.plan_name ilike '%anual%' or a.plan_name ilike '%365%' or a.plan_name ilike '%12x%' then 'anual' else 'mensal' end per,
           ce.ult::date ancora
    from pinguim.crm_assinatura a
    join (
      select cliente_id,
             substring(id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') buyer,
             produto_id,
             max(data_compra) ult
      from pinguim.crm_compra
      where status in ('approved','completed','complete')
        and (p_produto_padrao is null or produto_nome ilike p_produto_padrao)
      group by cliente_id, substring(id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), produto_id
    ) ce on ce.buyer = a.buyer_id and ce.produto_id = a.product_id
  ),
  -- data de vencimento calculada por assinatura (mesma regra da ficha)
  venc as (
    select *,
      case
        when per='anual' then (ancora + interval '12 months')::date
        else (ancora + make_interval(months =>
          greatest(1, ((extract(year from current_date)*12+extract(month from current_date))
                       - (extract(year from ancora)*12+extract(month from ancora)))::int
                     + case when extract(day from current_date) >= extract(day from ancora) then 1 else 0 end)))::date
      end vd
    from base
  ),
  -- 1 linha por cliente: estágio automático = pior situação dele no recorte
  -- (vencido > a_vencer > vigente), + lista de produtos p/ exibir
  auto as (
    select cliente_id,
      case
        when bool_or(ass_status not in ('ACTIVE','STARTED')) then 'vencido'
        when bool_or((vd - current_date) <= 30) then 'a_vencer'
        else 'vigente'
      end estagio_auto,
      string_agg(distinct plan_name, ', ') produtos,
      min(vd) filter (where ass_status in ('ACTIVE','STARTED')) proxvenc
    from venc group by cliente_id
  ),
  -- cards já movidos manualmente mandam no estágio (não re-classifica)
  cards as (
    select r.cliente_id, r.estagio, r.ordem, r.mentoria, r.motivo_perda
    from pinguim.crm_renovacao r
    where (p_mentoria is null or r.mentoria is not distinct from p_mentoria)
  ),
  todos as (
    -- quem tem card manual: usa o card
    select c.cliente_id, c.estagio, c.ordem, c.mentoria, c.motivo_perda, a.produtos
    from cards c left join auto a on a.cliente_id = c.cliente_id
    union all
    -- quem NÃO tem card: entra no estágio automático (vigente/a_vencer/vencido)
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
