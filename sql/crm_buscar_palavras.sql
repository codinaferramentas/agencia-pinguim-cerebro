-- Busca de clientes: nome com as palavras fora de ordem/abreviadas (André 11/11/2026).
-- Antes só achava o texto emendado: "Carol Gotschalg" não achava "Ana Carolina Gotschalg Oliveira".
-- Novo bloco por_palavras (rank 5, depois de todos os anteriores): cada palavra da busca (2+ letras)
-- tem que ser o COMEÇO de alguma palavra do nome. Só entra com 2+ palavras. Os ranks 0–4 não mudaram.
CREATE OR REPLACE FUNCTION pinguim.crm_buscar(p_q text, p_limit integer DEFAULT 25)
 RETURNS TABLE(cliente_id uuid, nome text, email_canon text, tel_canon text, n_apps bigint, atencao text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pinguim', 'extensions', 'public'
AS $function$
  with t as (select trim(p_q) q, lower(trim(p_q)) ql, regexp_replace(p_q,'\D','','g') dig),
  tel as (select case
      when length(dig) in (12,13) and left(dig,2)='55' then
        case when length(substr(dig,3))=11 and substr(dig,5,1)='9' then substr(dig,3,2)||substr(dig,6)
             else right(substr(dig,3),10) end
      when length(dig)=11 and substr(dig,3,1)='9' then left(dig,2)||substr(dig,4)
      when length(dig)=11 then right(dig,10) else dig end tc from t),
  por_id as (
    select i.cliente_id, 0 rank, 1.0 sim
    from pinguim.crm_cliente_identidade i, t, tel
    where i.valor in (t.ql, t.dig, tel.tc) and (t.ql like '%@%' or length(t.dig)>=8)
  ),
  por_codigo as (
    -- busca por código de transação Hotmart (HP...)
    select c.cliente_id, 0 rank, 1.0 sim
    from pinguim.crm_compra c, t
    where t.q ~* '^hp[0-9]' and upper(c.transaction_code) = upper(t.q) and c.cliente_id is not null
  ),
  por_nome as (
    select c.cliente_id,
      case
        when lower(c.nome) like t.ql||'%' then 1
        when lower(c.nome) ~ ('(^|\s)'||t.ql||'($|\s)') then 2
        when lower(c.nome) ~ ('(^|\s)'||t.ql) then 3
        else 4 end rank,
      extensions.similarity(lower(c.nome), t.ql) sim
    from pinguim.crm_cliente c, t
    where length(t.q)>=2 and c.nome ilike '%'||t.q||'%'
  ),
  palavras as (
    select array_agg(w) ws, (array_agg(w order by length(w) desc))[1] maior
    from t, unnest(string_to_array(regexp_replace(t.ql, '[^[:alnum:][:space:]]', ' ', 'g'), ' ')) w
    where length(w) >= 2
  ),
  por_palavras as (
    select c.cliente_id, 5 rank, extensions.similarity(lower(c.nome), t.ql) sim
    from pinguim.crm_cliente c, t, palavras p
    where cardinality(p.ws) >= 2 and t.ql !~ '@' and length(t.dig) < 8
      and c.nome ilike '%'||p.maior||'%'                       -- usa o índice trigram pela palavra mais longa
      and not exists (select 1 from unnest(p.ws) w where lower(c.nome) !~ ('(^|\s)'||w))
  ),
  todos as (select cliente_id, rank, sim from por_id union all select cliente_id, rank, sim from por_codigo
            union all select cliente_id, rank, sim from por_nome union all select cliente_id, rank, sim from por_palavras),
  melhor as (select cliente_id, min(rank) rank, max(sim) sim from todos group by cliente_id)
  select c.cliente_id, c.nome, c.email_canon, c.tel_canon,
         coalesce((select count(*) from pinguim.crm_acesso_app a where a.cliente_id=c.cliente_id),0),
         (select s.atencao from pinguim.crm_cliente_saude s where s.cliente_id=c.cliente_id)
  from melhor m join pinguim.crm_cliente c on c.cliente_id=m.cliente_id
  order by m.rank, m.sim desc, c.nome limit p_limit;
$function$;
