-- ========================================================================
-- LIMPEZA: apaga o último lote e tudo que ele criou
-- Rodar no SQL Editor do Supabase (seleciona tudo e executa)
-- ========================================================================

-- 1) Apaga chunks das fontes do último lote
with ultimo as (select id from pinguim.ingest_lotes order by criado_em desc limit 1)
delete from pinguim.cerebro_fontes_chunks
where fonte_id in (
  select id from pinguim.cerebro_fontes
  where ingest_lote_id in (select id from ultimo)
);

-- 2) Apaga as fontes do último lote
with ultimo as (select id from pinguim.ingest_lotes order by criado_em desc limit 1)
delete from pinguim.cerebro_fontes
where ingest_lote_id in (select id from ultimo);

-- 3) Apaga os registros de ingest_arquivos do último lote
with ultimo as (select id from pinguim.ingest_lotes order by criado_em desc limit 1)
delete from pinguim.ingest_arquivos
where lote_id in (select id from ultimo);

-- 4) Apaga o próprio lote
delete from pinguim.ingest_lotes
where id = (select id from pinguim.ingest_lotes order by criado_em desc limit 1);

-- 5) Confere que zerou
select
  (select count(*) from pinguim.ingest_lotes) as lotes_restantes,
  (select count(*) from pinguim.ingest_arquivos) as arquivos_restantes,
  (select count(*) from pinguim.cerebro_fontes where ingest_lote_id is not null) as fontes_de_lote_restantes,
  (select count(*) from pinguim.cerebro_fontes_chunks) as chunks_restantes;
