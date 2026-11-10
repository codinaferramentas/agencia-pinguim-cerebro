-- ========================================================================
-- schema-050-monitor-grupos-filtro-ia.sql
-- ========================================================================
-- Filtro de IA também nos GRUPOS (Andre aprovou 10/11/2026): pergunta aberta
-- pra turma ("alguém usa...", "vocês conhecem...", feedback de criativo entre
-- colegas) vira status 'descartada' com filtro 'turma' — sai das pendências
-- e do alerta. Se um ADM responder mesmo assim, vira 'respondida' normal.
-- Testado em 23 casos reais de 09/11 (14 equipe / 9 turma).
-- ========================================================================
alter table pinguim.monitor_atendimentos drop constraint if exists monitor_atendimentos_filtro_check;
alter table pinguim.monitor_atendimentos add constraint monitor_atendimentos_filtro_check
  check (filtro in ('pedido','sem_pedido','turma','erro'));
