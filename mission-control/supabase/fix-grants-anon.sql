-- ========================================================================
-- FIX: Grants pra anon/authenticated lerem schema pinguim
-- Aplicar no SQL Editor do Supabase
-- ========================================================================

-- Usage (conectar no schema)
grant usage on schema pinguim to anon, authenticated;

-- SELECT em todas as tabelas existentes
grant select on all tables in schema pinguim to anon, authenticated;

-- INSERT/UPDATE nas tabelas de ingest (painel precisa disparar carga)
grant insert, update on pinguim.ingest_lotes to anon, authenticated;
grant insert, update on pinguim.ingest_arquivos to anon, authenticated;

-- Sequences (caso algo use)
grant usage, select on all sequences in schema pinguim to anon, authenticated;

-- Execute RPCs
grant execute on all functions in schema pinguim to anon, authenticated;

-- Default privileges pra tabelas novas
alter default privileges in schema pinguim
  grant select on tables to anon, authenticated;
alter default privileges in schema pinguim
  grant insert, update on tables to authenticated;
alter default privileges in schema pinguim
  grant execute on functions to anon, authenticated;

-- RLS: desabilitar em todas as tabelas do pinguim (V0 sem autenticação real)
alter table pinguim.produtos disable row level security;
alter table pinguim.cerebros disable row level security;
alter table pinguim.cerebro_fontes disable row level security;
alter table pinguim.cerebro_fontes_chunks disable row level security;
alter table pinguim.ingest_lotes disable row level security;
alter table pinguim.ingest_arquivos disable row level security;
alter table pinguim.perfis disable row level security;
alter table pinguim.squads disable row level security;
alter table pinguim.agentes disable row level security;
alter table pinguim.tasks disable row level security;
alter table pinguim.skills disable row level security;
alter table pinguim.crons disable row level security;

-- Bucket policy: deixar authenticated subir no pinguim-uploads (painel usa anon key agora — ajustar se precisar)
drop policy if exists "pinguim-uploads authenticated upload" on storage.objects;
create policy "pinguim-uploads authenticated upload"
on storage.objects for insert
to authenticated, anon
with check (bucket_id = 'pinguim-uploads');

drop policy if exists "pinguim-uploads authenticated read" on storage.objects;
create policy "pinguim-uploads authenticated read"
on storage.objects for select
to authenticated, anon
using (bucket_id = 'pinguim-uploads');

-- FIM
