-- ============================================================
-- schema-022 — Tabela dedicada pra perfis extraídos de pesquisas (2026-06-18)
-- ============================================================
-- Antes o extrator-perfis-pesquisa salvava em pinguim.perfis_alunos_chat,
-- que foi desenhada pra contexto de chat WhatsApp/Discord (colunas total_msgs,
-- eh_admin, primeira_mencao_em). Só 4 dos 18 campos extraídos pelo LLM
-- caíam — o resto (idade, gênero, renda, escolaridade, profissão, etc.) era
-- descartado. Tabela nova comporta tudo.
-- ============================================================

CREATE TABLE IF NOT EXISTS pinguim.perfis_pesquisa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  cerebro_fonte_id uuid NOT NULL REFERENCES pinguim.cerebro_fontes(id) ON DELETE CASCADE,

  -- Identidade
  nome_completo text,
  nome_curto text,
  email text,
  whatsapp text,
  instagram text,
  seguidores_instagram integer,

  -- Demografia
  idade_faixa text,
  genero text,
  estado_civil text,
  renda_faixa text,
  escolaridade text,
  cidade text,
  estado_uf text,

  -- Atuação
  nicho text,
  profissao text,
  vende text,

  -- Voz do aluno
  dor_principal text,
  expectativa text,
  objecao text,

  -- Auditoria
  extraido_via text DEFAULT 'llm-pesquisa' NOT NULL,
  extraido_em timestamptz DEFAULT now() NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL,

  -- 1 perfil por fonte (cada resposta de pesquisa = 1 respondente)
  UNIQUE (cerebro_fonte_id)
);

CREATE INDEX IF NOT EXISTS idx_perfis_pesquisa_cerebro ON pinguim.perfis_pesquisa(cerebro_id);
CREATE INDEX IF NOT EXISTS idx_perfis_pesquisa_email ON pinguim.perfis_pesquisa(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfis_pesquisa_instagram ON pinguim.perfis_pesquisa(lower(instagram)) WHERE instagram IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfis_pesquisa_nicho ON pinguim.perfis_pesquisa(lower(nicho)) WHERE nicho IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfis_pesquisa_genero ON pinguim.perfis_pesquisa(genero) WHERE genero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfis_pesquisa_idade ON pinguim.perfis_pesquisa(idade_faixa) WHERE idade_faixa IS NOT NULL;
