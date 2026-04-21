-- ========================================================================
-- Storage bucket pra uploads de pacotes (zips com material pros Cérebros)
-- ========================================================================
-- Rodar no SQL Editor do Supabase, DEPOIS do schema-pinguim.sql
-- ========================================================================

-- Bucket privado (arquivos não são públicos na internet)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pinguim-uploads',
  'pinguim-uploads',
  false,                                    -- privado
  104857600,                                -- 100MB máximo por arquivo
  array['application/zip', 'application/x-zip-compressed']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Permissão: só service_role escreve/lê (usuários acessam via Edge Function)
-- Política mais restritiva: depois a gente abre pra authenticated se precisar.

create policy "Service role full access pinguim-uploads"
on storage.objects for all
using (bucket_id = 'pinguim-uploads' and auth.role() = 'service_role')
with check (bucket_id = 'pinguim-uploads' and auth.role() = 'service_role');

-- Fim
