-- ============================================================
-- schema-020-depoimentos.sql
-- ============================================================
-- 2026-06-16: motor de depoimentos do canal Discord #depoimentos.
--
-- Padrao real: time posta "Nome - Produto" no canal + anexo (imagem
-- de print WhatsApp/Instagram). Motor le, identifica produto, baixa
-- imagem, usa GPT-4o vision pra extrair texto, salva como cerebro_fonte
-- tipo 'depoimento' no cerebro do produto, vetoriza.
--
-- Quando produto nao reconhecido: vai pra depoimentos_pendentes pra
-- revisao manual (NAO cria cerebro automatico).
-- ============================================================

-- 1) Caixa de pendentes (produto nao reconhecido ou ambiguo)
CREATE TABLE IF NOT EXISTS pinguim.depoimentos_pendentes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        text NOT NULL UNIQUE,
  canal_id          text NOT NULL,
  autor_nome        text,
  conteudo_msg      text,                -- texto da mensagem original
  produto_mencionado text,               -- ex: "CICLO", "Curso Magnetico"
  motivo_pendente   text,                -- 'produto_nao_reconhecido' | 'sem_anexo' | 'multiplas_correspondencias'
  attachments_meta  jsonb DEFAULT '[]'::jsonb,
  postado_em        timestamptz,
  detectado_em      timestamptz NOT NULL DEFAULT now(),
  resolvido_em      timestamptz,
  resolvido_por     text,
  cerebro_destino_id uuid REFERENCES pinguim.cerebros(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_depoimentos_pendentes_ativos
  ON pinguim.depoimentos_pendentes (detectado_em DESC)
  WHERE resolvido_em IS NULL;

COMMENT ON TABLE pinguim.depoimentos_pendentes IS
  'V3 — Depoimentos do Discord que nao puderam ser roteados automatico (produto desconhecido, sem anexo, etc). Revisao manual.';

GRANT SELECT, INSERT, UPDATE ON pinguim.depoimentos_pendentes TO service_role;
GRANT SELECT ON pinguim.depoimentos_pendentes TO anon, authenticated;

-- 2) Mapa de aliases de produto pra resolver "CICLO -> ELO" e similares
CREATE TABLE IF NOT EXISTS pinguim.produto_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias       text NOT NULL,        -- texto literal mencionado, ex: "CICLO", "Ciclo Elo", "Pro Alt"
  produto_id  uuid NOT NULL REFERENCES pinguim.produtos(id) ON DELETE CASCADE,
  fonte       text DEFAULT 'manual', -- 'manual' | 'inferido_llm'
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias)
);

CREATE INDEX IF NOT EXISTS idx_produto_aliases_alias ON pinguim.produto_aliases (lower(alias));

COMMENT ON TABLE pinguim.produto_aliases IS
  'V3 — Aliases/sinonimos de produto pra resolver mencoes em depoimentos (ex: CICLO=Elo, Pro Alt=ProAlt).';

GRANT SELECT, INSERT ON pinguim.produto_aliases TO service_role;
GRANT SELECT ON pinguim.produto_aliases TO anon, authenticated;

-- Seed dos aliases conhecidos (cravado pelo Andre 2026-06-16)
INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'CICLO', id, 'manual' FROM pinguim.produtos WHERE slug = 'elo'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'Ciclo', id, 'manual' FROM pinguim.produtos WHERE slug = 'elo'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'ELO', id, 'manual' FROM pinguim.produtos WHERE slug = 'elo'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'Pro Alt', id, 'manual' FROM pinguim.produtos WHERE slug = 'proalt'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'ProAlt', id, 'manual' FROM pinguim.produtos WHERE slug = 'proalt'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'Taurus', id, 'manual' FROM pinguim.produtos WHERE slug = 'tuarus'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'Tuarus', id, 'manual' FROM pinguim.produtos WHERE slug = 'tuarus'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'Lyra', id, 'manual' FROM pinguim.produtos WHERE slug = 'lyra'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'Orion', id, 'manual' FROM pinguim.produtos WHERE slug = 'orion'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'Lo-fi', id, 'manual' FROM pinguim.produtos WHERE slug = 'desafio-de-conte-do-lo-fi'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO pinguim.produto_aliases (alias, produto_id, fonte)
SELECT 'LoFi', id, 'manual' FROM pinguim.produtos WHERE slug = 'desafio-de-conte-do-lo-fi'
ON CONFLICT (alias) DO NOTHING;

-- 3) Categoria anuncios_meta (V3 2026-06-17)
INSERT INTO pinguim.cerebro_categorias_catalogo (slug, nome, emoji, descricao, tipos_fonte, ordem)
VALUES (
  'anuncios_meta',
  'Anuncios Meta',
  '🎯',
  'Top anuncios da Meta filtrados por keyword no nome (DCL/Lofi/etc), por CPA baixo + maior investimento. Atualizado semanal.',
  ARRAY['anuncio_meta']::text[],
  11
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  emoji = EXCLUDED.emoji,
  descricao = EXCLUDED.descricao,
  tipos_fonte = EXCLUDED.tipos_fonte;
