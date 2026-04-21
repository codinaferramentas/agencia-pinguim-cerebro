-- ========================================================================
-- DEBUG: estado do lote travado + limpeza
-- Rodar no SQL Editor do Supabase
-- ========================================================================

-- 1) Ver o lote mais recente e seu estado real
select
  id,
  status,
  arquivos_totais,
  fontes_criadas,
  chunks_criados,
  em_quarentena,
  erro_detalhes,
  criado_em,
  (now() - criado_em) as tempo_decorrido
from pinguim.ingest_lotes
order by criado_em desc
limit 3;

-- 2) Ver quantos chunks realmente entraram no banco pro lote
select
  l.id as lote_id,
  l.status,
  l.fontes_criadas as dito_no_lote,
  count(distinct f.id) as fontes_reais,
  count(c.id) as chunks_reais
from pinguim.ingest_lotes l
left join pinguim.cerebro_fontes f on f.ingest_lote_id = l.id
left join pinguim.cerebro_fontes_chunks c on c.fonte_id = f.id
group by l.id, l.status, l.fontes_criadas
order by l.criado_em desc
limit 3;

-- 3) Ver fontes que ficaram em "processando" (não terminaram vetorização)
select
  f.id,
  f.titulo,
  f.ingest_status,
  count(c.id) as chunks_vetorizados
from pinguim.cerebro_fontes f
left join pinguim.cerebro_fontes_chunks c on c.fonte_id = f.id
where f.ingest_status = 'processando'
group by f.id, f.titulo, f.ingest_status
order by f.id desc
limit 20;

-- ========================================================================
-- LIMPEZA (só rodar DEPOIS de confirmar o diagnóstico acima)
-- Apaga o último lote e tudo que ele criou, pra testar de novo do zero
-- ========================================================================

-- DESCOMENTE as linhas abaixo pra rodar a limpeza:

-- with ultimo as (select id from pinguim.ingest_lotes order by criado_em desc limit 1)
-- delete from pinguim.cerebro_fontes_chunks
-- where fonte_id in (select id from pinguim.cerebro_fontes where ingest_lote_id in (select id from ultimo));

-- with ultimo as (select id from pinguim.ingest_lotes order by criado_em desc limit 1)
-- delete from pinguim.cerebro_fontes where ingest_lote_id in (select id from ultimo);

-- with ultimo as (select id from pinguim.ingest_lotes order by criado_em desc limit 1)
-- delete from pinguim.ingest_arquivos where lote_id in (select id from ultimo);

-- delete from pinguim.ingest_lotes
-- where id = (select id from pinguim.ingest_lotes order by criado_em desc limit 1);
