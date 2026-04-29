-- Funis sessao 3 — adicionar tipo (produto/condicional), condicao_texto
-- e remover cross_sell do CHECK de papel.

-- Adicionar coluna tipo
alter table pinguim.funil_etapas
  add column if not exists tipo text not null default 'produto'
  check (tipo in ('produto', 'condicional'));

-- Adicionar coluna condicao_texto (so usado quando tipo=condicional)
alter table pinguim.funil_etapas
  add column if not exists condicao_texto text;

-- Tornar produto_id opcional (condicional nao tem produto)
alter table pinguim.funil_etapas
  alter column produto_id drop not null;

-- Atualizar CHECK constraint do papel pra remover cross_sell
alter table pinguim.funil_etapas drop constraint if exists funil_etapas_papel_check;
alter table pinguim.funil_etapas
  add constraint funil_etapas_papel_check
  check (
    (tipo = 'condicional' and papel = 'condicional')
    or (tipo = 'produto' and papel in ('entrada', 'order_bump', 'upsell', 'downsell'))
  );

-- Permitir 'condicional' como valor de papel (ja coberto pelo CHECK acima)
