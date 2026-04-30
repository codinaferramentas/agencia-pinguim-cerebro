-- =====================================================================
-- Pre-popular o cofre com inventario das chaves conhecidas do sistema
-- Sem valor (so registro). Andre completa os valores no painel quando quiser.
-- =====================================================================

insert into pinguim.cofre_chaves (nome, provedor, escopo, onde_vive, descricao, observacoes, ativo) values
  ('OPENAI_API_KEY', 'OpenAI', 'secret', 'supabase-secret',
    'Modelo gpt-4o-mini (classificador) + text-embedding-3-small (vetorizacao) + Whisper (audio).',
    'Usada por 5 Edge Functions: buscar-cerebro, gerar-persona, ingest-pacote, ingest-url, revetorizar-fonte. Tambem usada pelo ingest-engine local via .env.local.',
    true),
  ('SUPABASE_URL', 'Supabase', 'public', 'vercel-env',
    'URL base do projeto Supabase. Front + Edge Functions.',
    'Auto-populada nas Edge Functions pelo Supabase. Manual na Vercel pra build do front.',
    true),
  ('SUPABASE_ANON_KEY', 'Supabase', 'public', 'vercel-env',
    'Chave publica do Supabase. Front usa pra autenticar usuarios.',
    'Pode aparecer no front (publica por design). RLS protege.',
    true),
  ('SUPABASE_SERVICE_ROLE_KEY', 'Supabase', 'admin', 'supabase-secret',
    'Chave admin do Supabase. Bypass RLS. So Edge Functions internas usam.',
    'NUNCA expor no front. Auto-populada nas Edge Functions. Tambem em .env.local pra scripts admin (vetorizar-pendentes, importar-clones, etc).',
    true),
  ('SUPABASE_ACCESS_TOKEN', 'Supabase', 'admin', '.env.local',
    'Token de Management API do Supabase. Usado pra deploy de Edge Functions e queries SQL admin.',
    'So vive em .env.local local. Nunca no Vercel/Edge.',
    true),
  ('VERCEL_TOKEN', 'Vercel', 'admin', 'supabase-secret',
    'Personal Access Token Vercel com escopo Team. Lista projetos do team.',
    'Edge vercel-env-vars usa pra inventario. Plano Hobby nao retorna env vars (limitacao de plano).',
    true),
  ('VERCEL_PROJECT_ID', 'Vercel', 'public', 'supabase-secret',
    'ID do projeto mission-control na Vercel.',
    'prj_GAreWjlOQHdwuLSWBnGTaOHvNJl1',
    true),
  ('VERCEL_TEAM_ID', 'Vercel', 'public', 'supabase-secret',
    'ID do team ferramenta-3635s-projects na Vercel.',
    'team_QOOeek5szxfetXNzf3r7aRXQ',
    true)
on conflict (nome) do update set
  provedor = excluded.provedor,
  escopo = excluded.escopo,
  onde_vive = excluded.onde_vive,
  descricao = excluded.descricao,
  observacoes = excluded.observacoes,
  atualizado_em = now();
