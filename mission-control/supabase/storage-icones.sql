-- ========================================================================
-- Storage bucket pra icones de Cerebros (produtos)
-- + coluna icone_url na tabela produtos
-- ========================================================================
-- Rodar no SQL Editor do Supabase, DEPOIS de schema-pinguim.sql
-- ========================================================================

-- 1) Bucket publico (leitura por todo mundo, escrita autenticada)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pinguim-icones',
  'pinguim-icones',
  true,                                       -- publico (URLs acessiveis pro <img>)
  2097152,                                    -- 2MB max por icone
  array['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Policies de acesso
-- Leitura: qualquer um (bucket publico ja resolve, mas explicito eh melhor)
drop policy if exists "Public read pinguim-icones" on storage.objects;
create policy "Public read pinguim-icones"
on storage.objects for select
using (bucket_id = 'pinguim-icones');

-- Escrita: so authenticated (login no painel)
drop policy if exists "Authenticated write pinguim-icones" on storage.objects;
create policy "Authenticated write pinguim-icones"
on storage.objects for insert
to authenticated
with check (bucket_id = 'pinguim-icones');

drop policy if exists "Authenticated update pinguim-icones" on storage.objects;
create policy "Authenticated update pinguim-icones"
on storage.objects for update
to authenticated
using (bucket_id = 'pinguim-icones')
with check (bucket_id = 'pinguim-icones');

drop policy if exists "Authenticated delete pinguim-icones" on storage.objects;
create policy "Authenticated delete pinguim-icones"
on storage.objects for delete
to authenticated
using (bucket_id = 'pinguim-icones');

-- 3) Coluna icone_url na tabela produtos
alter table pinguim.produtos
  add column if not exists icone_url text;

comment on column pinguim.produtos.icone_url is
  'URL publica do icone do produto (Supabase Storage bucket pinguim-icones). Quando preenchido, tem prioridade sobre emoji.';

-- 4) Atualizar view vw_cerebros_catalogo pra expor icone_url
create or replace view pinguim.vw_cerebros_catalogo as
select
  c.id                            as cerebro_id,
  p.id                            as produto_id,
  p.slug                          as slug,
  p.nome                          as nome,
  p.emoji                         as emoji,
  p.icone_url                     as icone_url,
  p.descricao                     as descricao,
  p.status                        as status,
  c.ultima_alimentacao            as ultima_alimentacao,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.ingest_status = 'ok'),
    0
  )                               as total_fontes,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'aula' and f.ingest_status = 'ok'),
    0
  )                               as total_aulas,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'pagina_venda' and f.ingest_status = 'ok'),
    0
  )                               as total_paginas,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'depoimento' and f.ingest_status = 'ok'),
    0
  )                               as total_depoimentos,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'objecao' and f.ingest_status = 'ok'),
    0
  )                               as total_objecoes,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.tipo = 'sacada' and f.ingest_status = 'ok'),
    0
  )                               as total_sacadas,
  coalesce(
    (select count(*) from pinguim.cerebro_fontes f where f.cerebro_id = c.id and f.criado_em > now() - interval '7 days'),
    0
  )                               as fontes_ultima_semana
from pinguim.cerebros c
join pinguim.produtos p on p.id = c.produto_id;

-- Fim
