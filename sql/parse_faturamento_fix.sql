-- parse_faturamento quebrava com milhar no formato americano ("1,760,000" virava "1.760.000" → erro de numeric),
-- derrubando o cálculo de faturamento da ficha e de qualquer lista (achado no mapa comercial do Micha, 11/11/2026).
-- Agora: "1,760,000" = 1.760.000; e qualquer pedaço que ainda não converta é ignorado em vez de dar erro.
CREATE OR REPLACE FUNCTION pinguim.parse_faturamento(txt text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare t text; nums numeric[]; n numeric; m text;
begin
  if txt is null then return null; end if;
  t := lower(trim(txt));
  -- ignora URLs/links de upload (yayforms prints) e textos sem digito
  if t ~ 'http|www\.|cdn\.|\.com|\.link|\.png|\.jpg|responses/' then return null; end if;
  if t = '' or t = '0' or t ~ 'não|nao tive|nunca|zero|nenhum' then return 0; end if;
  nums := array[]::numeric[];
  for m in select (regexp_matches(t, '[0-9][0-9\.\,]*', 'g'))[1] loop
    m := rtrim(m, '.,');
    begin
      if m ~ '^[0-9]{1,3}(,[0-9]{3})+$' then
        n := replace(m, ',', '')::numeric;                       -- 1,760,000 (milhar americano)
      elsif m ~ '^[0-9]{1,3}(\.[0-9]{3})+\.[0-9]{2}$' then
        n := (replace(left(m, length(m) - 3), '.', '') || '.' || right(m, 2))::numeric; -- 500.000.00 = 500 mil com centavos
      else
        n := replace(replace(m, '.', ''), ',', '.')::numeric;   -- 1.760.000 / 10.000,50 (padrão BR)
      end if;
      nums := array_append(nums, n);
    exception when others then
      null; -- pedaço que não vira número: ignora
    end;
  end loop;
  if array_length(nums,1) is null then return null; end if;
  n := (select max(x) from unnest(nums) x);
  -- "mm"/"kk" só como unidade colada no número (antes "Gamma" contava como milhões: "500k (Gamma)" virava 500)
  if t ~ 'milh|[0-9] *(mm|kk)(\y|$)' then if n < 100 then n := n * 1000000; end if;
  -- "15k" = 15.000. (Antes era 'k\b': no Postgres \b NÃO é fim de palavra, então "15k" ficava 15.)
  elsif t ~ 'mil|[0-9] *k(\y|$)' then if n < 1000 then n := n * 1000; end if; end if;
  -- teto realista de faturamento MENSAL declarado: 50 milhões. Acima = erro de digitação.
  if n > 50000000 then return null; end if;
  return n;
end $function$;
