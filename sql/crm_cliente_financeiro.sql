create or replace function pinguim.crm_cliente_financeiro(p_cliente uuid)
returns table(fonte text, produto text, situacao text, valor numeric, vencimento date, parcelas integer, link text, quando timestamptz)
language sql stable as $fn$
  with cli as (
    select email_canon, (select valor from pinguim.crm_cliente_identidade i where i.cliente_id=p_cliente and i.tipo='cpf' limit 1) cpf
    from pinguim.crm_cliente where cliente_id = p_cliente
  ),
  -- DEDUP tentativas de cobranca: mesma venda recusada vira varias linhas (id_externo so muda na DATA).
  -- 1 linha por venda (raiz = data trocada por 'D'), valor = o cheio (max).
  compras_dedup as (
    select regexp_replace(c.id_externo, '\d{4}-\d{2}-\d{2}', 'D') raiz,
           c.produto_nome, c.status,
           max(c.valor_brl) valor, max(c.data_compra) quando, count(*) tentativas
    from pinguim.crm_compra c
    where c.cliente_id = p_cliente and c.status in ('delayed','waiting_payment','billet_printed')
    group by regexp_replace(c.id_externo, '\d{4}-\d{2}-\d{2}', 'D'), c.produto_nome, c.status
  ),
  -- agora consolida por produto+situacao (vendas DISTINTAS do mesmo produto somam; tentativas nao)
  compras as (
    select 'Compra'::text fonte, cd.produto_nome produto,
      case cd.status when 'delayed' then 'Em atraso' when 'waiting_payment' then 'Aguardando pagamento'
        when 'billet_printed' then 'Boleto gerado' else cd.status end situacao,
      sum(cd.valor) valor, null::date vencimento, count(*)::int parcelas, null::text link, max(cd.quando) quando
    from compras_dedup cd
    group by cd.produto_nome, cd.status
  ),
  assin as (
    select 'Assinatura'::text fonte, a.plan_name produto, 'Mensalidade em atraso'::text situacao,
      null::numeric valor, null::date vencimento, null::int parcelas, null::text link, a.started_at quando
    from pinguim.crm_assinatura a
    where a.status = 'PAST_DUE'
      and a.buyer_id in (
        select distinct substring(c.id_externo from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
        from pinguim.crm_compra c where c.cliente_id = p_cliente
      )
  ),
  boletos as (
    select 'Financiamento'::text fonte, b.product_name produto,
      coalesce(b.current_step, b.status) situacao, b.price valor, b.payment_due_date vencimento,
      b.installments parcelas, b.payment_url link, b.made_effective_at quando
    from pinguim.crm_boleto b, cli
    where (cli.email_canon is not null and lower(b.buyer_email) = cli.email_canon)
       or (cli.cpf is not null and regexp_replace(coalesce(b.buyer_document,''),'[^0-9]','','g') = cli.cpf)
  )
  select * from compras
  union all select * from assin
  union all select * from boletos
  order by quando desc nulls last;
$fn$;
