-- Sessao 1 Clones (2026-04-28) — adiciona subcategoria em produtos
-- e prepara estrutura pros 41 clones (3 socios + 25 copy + 13 storytelling)

alter table pinguim.produtos
  add column if not exists subcategoria text;

create index if not exists produtos_subcategoria_idx
  on pinguim.produtos(subcategoria);

-- Drop e recria view (drop necessario pra mudanca de schema)
drop view if exists pinguim.vw_cerebros_catalogo;

create view pinguim.vw_cerebros_catalogo as
select
  p.id as produto_id,
  p.slug,
  p.nome,
  p.emoji,
  p.icone_url,
  p.descricao,
  p.status,
  p.categoria,
  p.subcategoria,
  c.id as cerebro_id,
  c.ultima_alimentacao,
  coalesce((select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.ingest_status = 'ok'), 0) as total_fontes,
  coalesce((select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.ingest_status = 'ok' and f.criado_em >= now() - interval '7 days'), 0) as fontes_ultima_semana,
  0 as preenchimento_pct
from pinguim.produtos p
left join pinguim.cerebros c on c.produto_id = p.id
order by p.nome;
