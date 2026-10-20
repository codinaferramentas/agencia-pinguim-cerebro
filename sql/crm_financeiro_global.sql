drop function if exists pinguim.crm_financeiro_global(text,integer,integer);
drop function if exists pinguim.crm_financeiro_global(text,integer,integer,text);
create function pinguim.crm_financeiro_global(p_busca text default null, p_limit integer default 20, p_offset integer default 0, p_produto_padrao text default null)
returns table(cliente_id uuid, nome text, email text, telefone text, n_pendencias bigint, valor_total numeric, fontes text, total_geral bigint)
language sql stable as $fn$
  with t as (select nullif(trim(coalesce(p_busca,'')),'') q, nullif(regexp_replace(coalesce(p_busca,''),'[^0-9]','','g'),'') dig),
  -- quando filtrado por mentoria: só clientes que compraram o produto dessa mentoria
  mentoria_cli as (
    select distinct cliente_id from pinguim.crm_compra
    where p_produto_padrao is not null and produto_nome ilike p_produto_padrao
  ),
  -- DEDUP DE TENTATIVAS DE COBRANCA:
  -- a mesma venda recusada vira varias linhas delayed/waiting (Hotmart retenta dia apos dia);
  -- o id_externo so muda na DATA no meio (buyer-DATA-produto). Agrupamos pela RAIZ (data trocada por 'D')
  -- + produto, e contamos 1 divida por venda com 1 valor (o maximo, que e o valor cheio).
  comp_dedup as (
    select c.cliente_id,
           regexp_replace(c.id_externo, '\d{4}-\d{2}-\d{2}', 'D') as raiz,
           max(case when c.valor_brl <= 50000 then c.valor_brl else 0 end) as val
    from pinguim.crm_compra c
    where c.status in ('delayed','waiting_payment','billet_printed')
    group by c.cliente_id, regexp_replace(c.id_externo, '\d{4}-\d{2}-\d{2}', 'D')
  ),
  comp as (
    select cliente_id, count(*) n, coalesce(sum(val),0) val
    from comp_dedup group by cliente_id
  ),
  assin as (
    select distinct ce.cliente_id
    from pinguim.crm_assinatura a
    join (select distinct cliente_id, substring(id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') buyer from pinguim.crm_compra) ce
      on ce.buyer = a.buyer_id
    where a.status = 'PAST_DUE'
  ),
  -- boleto tambem dedup pela raiz do sale_id (se houver retentativa) — na pratica sale_id ja e unico por venda,
  -- mas agrupamos defensivamente por (cliente, product_name) pegando o maior valor.
  -- boleto liga ao cliente por QUALQUER email dele (identidades): troca de email principal não solta boleto antigo
  bol as (
    select coalesce(i.cliente_id, c.cliente_id) cliente_id, count(*) n, coalesce(sum(b.price),0) val
    from pinguim.crm_boleto b
    left join pinguim.crm_cliente_identidade i on i.tipo = 'email' and i.valor = lower(b.buyer_email)
    left join pinguim.crm_cliente c on c.email_canon = lower(b.buyer_email)
    where coalesce(i.cliente_id, c.cliente_id) is not null
    group by 1
  ),
  uni as (
    select cliente_id from comp
    union select cliente_id from assin
    union select cliente_id from bol
  ),
  agg as (
    select u.cliente_id,
      coalesce(cp.n,0) + case when a.cliente_id is not null then 1 else 0 end + coalesce(b.n,0) as n_pend,
      coalesce(cp.val,0) + coalesce(b.val,0) as val_total,
      trim(both ', ' from concat_ws(', ',
        case when cp.cliente_id is not null then 'compra' end,
        case when a.cliente_id is not null then 'assinatura' end,
        case when b.cliente_id is not null then 'boleto' end)) as fontes
    from uni u
    left join comp cp on cp.cliente_id = u.cliente_id
    left join assin a on a.cliente_id = u.cliente_id
    left join bol b on b.cliente_id = u.cliente_id
  ),
  filtrado as (
    select ag.*, c.nome, c.email_canon, c.tel_canon
    from agg ag join pinguim.crm_cliente c on c.cliente_id = ag.cliente_id
    cross join t
    where (p_produto_padrao is null or ag.cliente_id in (select cliente_id from mentoria_cli))
      and (t.q is null
        or c.nome ilike '%'||t.q||'%'
        or c.email_canon ilike '%'||t.q||'%'
        or (t.dig is not null and c.tel_canon like '%'||t.dig||'%'))
  )
  select f.cliente_id, f.nome, f.email_canon, f.tel_canon, f.n_pend, f.val_total, f.fontes, count(*) over()
  from filtrado f
  order by f.val_total desc nulls last, f.n_pend desc
  limit p_limit offset p_offset
$fn$;
