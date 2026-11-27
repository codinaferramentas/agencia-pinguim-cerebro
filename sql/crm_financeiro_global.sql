-- Financeiro global do CRM (/financeiro).
-- 27/11/2026 (André): "onde aparece valor tem que estar conciliado" — a pendência com valor é SÓ a dívida que a Cobrança
-- conferiu na Hotmart (crm_cobranca hot_status='confirmada', já conciliada por contrato no cobranca-worker). É o mesmo número da
-- ficha (crm_cliente_financeiro), da tela de Cobrança e do Mapa. Compras com boleto/Pix gerado e não pago, atraso que a Hotmart
-- não confirmou e financiamentos Principia não entram aqui (aparecem na ficha como "não conferido", fora do total).
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
  agg as (
    select cb.cliente_id, sum(cb.hot_parcelas)::bigint n_pend, sum(cb.hot_valor) val_total,
           'Cobrança conferida na Hotmart: ' || string_agg(distinct cb.produto_nome, ', ') fontes
    from pinguim.crm_cobranca cb
    where cb.fechado_em is null and cb.hot_status = 'confirmada'
    group by cb.cliente_id
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
grant execute on function pinguim.crm_financeiro_global(text,integer,integer,text) to service_role, authenticated;
revoke execute on function pinguim.crm_financeiro_global(text,integer,integer,text) from public, anon;
