drop function if exists pinguim.crm_renovacao_kanban(text);
create function pinguim.crm_renovacao_kanban(p_mentoria text default null, p_produto_padrao text default null)
returns table(cliente_id uuid, nome text, email text, telefone text, estagio text, ordem integer, mentoria text, motivo_perda text, produtos_vencidos text, n_followups bigint, proximo_followup timestamptz)
language sql stable as $fn$
  with
  -- vencidos por produto (assinatura nao-ativa), com o nome do produto.
  -- Se p_produto_padrao vier (filtro por mentoria), SO entram quem tem compra desse produto.
  vencidos as (
    select distinct ce.cliente_id, a.plan_name produto
    from pinguim.crm_assinatura a
    join (select distinct cliente_id,
                 substring(id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') buyer
          from pinguim.crm_compra) ce on ce.buyer = a.buyer_id
    where a.status in ('CANCELED','EXPIRED','PAST_DUE')
      and (p_produto_padrao is null or exists (
            select 1 from pinguim.crm_compra cc
            where cc.cliente_id = ce.cliente_id and cc.produto_nome ilike p_produto_padrao
          ))
  ),
  venc_cli as (
    select cliente_id, string_agg(distinct produto, ', ') produtos
    from vencidos group by cliente_id
  ),
  cards as (
    select r.cliente_id, r.estagio, r.ordem, r.mentoria, r.motivo_perda
    from pinguim.crm_renovacao r
    where (p_mentoria is null or r.mentoria is not distinct from p_mentoria)
  ),
  -- vencidos que AINDA nao tem card entram como 'vencido'.
  -- Com filtro de mentoria: entram com mentoria=p_mentoria (ficam presos aquele quadro).
  novos as (
    select vc.cliente_id, 'vencido'::text estagio, 0 ordem, p_mentoria::text mentoria, null::text motivo_perda, vc.produtos
    from venc_cli vc
    where not exists (
      select 1 from pinguim.crm_renovacao r
      where r.cliente_id = vc.cliente_id and (p_mentoria is null or r.mentoria is not distinct from p_mentoria)
    )
  ),
  todos as (
    select c.cliente_id, c.estagio, c.ordem, c.mentoria, c.motivo_perda, vc.produtos
    from cards c left join venc_cli vc on vc.cliente_id = c.cliente_id
    union all
    select cliente_id, estagio, ordem, mentoria, motivo_perda, produtos from novos
  )
  select t.cliente_id, cl.nome, cl.email_canon, cl.tel_canon,
    t.estagio, t.ordem, t.mentoria, t.motivo_perda,
    t.produtos produtos_vencidos,
    (select count(*) from pinguim.crm_anotacao an where an.cliente_id=t.cliente_id and an.lembrete_em is not null and an.feito=false) n_followups,
    (select min(an.lembrete_em) from pinguim.crm_anotacao an where an.cliente_id=t.cliente_id and an.lembrete_em is not null and an.feito=false) proximo_followup
  from todos t join pinguim.crm_cliente cl on cl.cliente_id = t.cliente_id
  order by t.estagio, t.ordem, cl.nome;
$fn$;
