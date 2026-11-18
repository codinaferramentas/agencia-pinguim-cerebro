-- ============================================================
-- Nome do cliente: o nome padrão é o do comprador na Hotmart.
-- ============================================================
-- Problema (18/11/2026): a ficha nascia com o nome do perfil do app/Instagram
-- («Natalia Pamela | Especialista em Viagens🌍») e a venda da Hotmart nunca
-- corrigia, porque só gravava o nome quando o cliente era inédito.
--
--  nome          → nome padrão (o da Hotmart, quando há compra)
--  nome_hotmart  → nome do comprador na última compra lida da Hotmart
--  nome_perfil   → nome que veio do perfil do app/Instagram (ou o nome antigo)
--  nome_origem   → 'hotmart' | 'manual' | 'perfil' | null (carga antiga/cadastro)
--
-- Regra: nome editado à mão ('manual') nunca é trocado. Nome estranho (emoji,
-- «|», e-mail, números) ou com o mesmo primeiro nome → vira o da Hotmart e o
-- antigo fica em nome_perfil. Primeiro nome diferente (compra no nome de outra
-- pessoa ou de empresa) → mantém o nome e guarda o da Hotmart em nome_hotmart.
-- ============================================================

alter table pinguim.crm_cliente
  add column if not exists nome_perfil text,
  add column if not exists nome_hotmart text,
  add column if not exists nome_origem text;

create or replace function pinguim.nome_norm(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(regexp_replace(
    translate(lower(coalesce(t,'')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function pinguim.crm_cliente_nome_hotmart(p_cliente uuid, p_nome text) returns text
language plpgsql security definer set search_path to 'pinguim', 'extensions', 'public' as $$
declare
  v_h text := trim(regexp_replace(coalesce(p_nome,''), '\s+', ' ', 'g'));
  v_nome text; v_origem text; v_estranho boolean;
begin
  -- nome da Hotmart que não serve de nome: vazio, e-mail ou sem letra
  if length(v_h) < 2 or v_h like '%@%' or v_h !~ '[[:alpha:]]' then return 'ignorado'; end if;
  select nome, nome_origem into v_nome, v_origem from pinguim.crm_cliente where cliente_id = p_cliente for update;
  if not found then return 'sem_cliente'; end if;

  update pinguim.crm_cliente set nome_hotmart = v_h where cliente_id = p_cliente and nome_hotmart is distinct from v_h;
  if v_origem = 'manual' then return 'manual'; end if;

  if pinguim.nome_norm(v_nome) = pinguim.nome_norm(v_h) then
    update pinguim.crm_cliente set nome_origem = 'hotmart' where cliente_id = p_cliente and nome_origem is distinct from 'hotmart';
    return 'igual';
  end if;

  v_estranho := pinguim.nome_norm(v_nome) = '' or v_nome ~ '[|@•·]' or v_nome ~ '\d{3,}' or v_nome ~ '[☀-➿\U0001F000-\U0001FFFF]';
  if v_estranho or split_part(pinguim.nome_norm(v_nome), ' ', 1) = split_part(pinguim.nome_norm(v_h), ' ', 1) then
    update pinguim.crm_cliente
      set nome = v_h, nome_origem = 'hotmart',
          nome_perfil = coalesce(nome_perfil, nullif(trim(coalesce(v_nome,'')), ''))
      where cliente_id = p_cliente;
    return 'trocado';
  end if;
  return 'divergente';
end;
$$;
revoke all on function pinguim.crm_cliente_nome_hotmart(uuid, text) from public, anon, authenticated;
grant execute on function pinguim.crm_cliente_nome_hotmart(uuid, text) to service_role;

-- Busca: acha o cliente também pelo nome do perfil e pelo nome na Hotmart.
create or replace function pinguim.crm_buscar(p_q text, p_limit integer default 25)
 returns table(cliente_id uuid, nome text, email_canon text, tel_canon text, n_apps bigint, atencao text)
 language sql stable set search_path to 'pinguim', 'extensions', 'public'
as $function$
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
  -- os três nomes do cliente: o padrão, o do perfil e o da Hotmart
  nomes as (
    select c.cliente_id, n.nm
    from pinguim.crm_cliente c cross join lateral (values (c.nome), (c.nome_perfil), (c.nome_hotmart)) n(nm)
    where n.nm is not null
  ),
  por_nome as (
    select n.cliente_id,
      case
        when lower(n.nm) like t.ql||'%' then 1
        when lower(n.nm) ~ ('(^|\s)'||t.ql||'($|\s)') then 2
        when lower(n.nm) ~ ('(^|\s)'||t.ql) then 3
        else 4 end rank,
      extensions.similarity(lower(n.nm), t.ql) sim
    from nomes n, t
    where length(t.q)>=2 and n.nm ilike '%'||t.q||'%'
  ),
  palavras as (
    select array_agg(w) ws, (array_agg(w order by length(w) desc))[1] maior
    from t, unnest(string_to_array(regexp_replace(t.ql, '[^[:alnum:][:space:]]', ' ', 'g'), ' ')) w
    where length(w) >= 2
  ),
  por_palavras as (
    select n.cliente_id, 5 rank, extensions.similarity(lower(n.nm), t.ql) sim
    from nomes n, t, palavras p
    where cardinality(p.ws) >= 2 and t.ql !~ '@' and length(t.dig) < 8
      and n.nm ilike '%'||p.maior||'%'
      and not exists (select 1 from unnest(p.ws) w where lower(n.nm) !~ ('(^|\s)'||w))
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
