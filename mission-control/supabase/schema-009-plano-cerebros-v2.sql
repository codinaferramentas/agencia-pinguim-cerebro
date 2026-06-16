-- ============================================================
-- schema-009-plano-cerebros-v2.sql
-- ============================================================
-- Plano de Cerebros v2 (2026-06-15) — layout Kanban
--
-- Mudancas:
-- 1. integracoes_catalogo.descricao_equipe — descricao livre que equipe edita
--    na reuniao (separada da descricao tecnica fixa)
-- 2. cerebro_fontes_planejadas.documentacao_automacao — JSONB com detalhes
--    da rotina automatizada (ferramenta, cron, horario, ultima_execucao)
-- 3. RPC cerebro_fonte_planejada_editar — editar titulo/desc/integracao/doc
-- 4. RPC integracao_atualizar_descricao_equipe — equipe preenche na reuniao
-- 5. Limpar catalogo: Apify Instagram + Apify TikTok viram UM unico 'apify'.
--    Tally vira 'yaforms' (Andre usa YA Forms).
-- ============================================================

-- ============================================================
-- 1. Colunas novas
-- ============================================================
ALTER TABLE pinguim.integracoes_catalogo
  ADD COLUMN IF NOT EXISTS descricao_equipe text,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE pinguim.cerebro_fontes_planejadas
  ADD COLUMN IF NOT EXISTS documentacao_automacao jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN pinguim.integracoes_catalogo.descricao_equipe IS
  'Descricao editada pela equipe na reuniao (pra que serve, contexto real). Separado de descricao (tecnica). Vazio ate equipe preencher.';
COMMENT ON COLUMN pinguim.cerebro_fontes_planejadas.documentacao_automacao IS
  'Detalhes da rotina automatica: { ferramenta, cron_expr, horario, ultima_execucao, status_detalhado, notas }';

-- ============================================================
-- 2. Consolidar Apify (era 3 slugs, vira 1)
-- ============================================================
-- Mover fontes planejadas antes de deletar
UPDATE pinguim.cerebro_fontes_planejadas
   SET integracao_slug = 'apify'
 WHERE integracao_slug IN ('apify-instagram', 'apify-tiktok', 'apify-paginas');

-- Criar/atualizar slug 'apify' unico
INSERT INTO pinguim.integracoes_catalogo (slug, nome, descricao, categoria, emoji, ativa, tipo_dado, exemplo_uso, cobertura_cerebros, cofre_chaves) VALUES
  ('apify', 'Apify (scrapers)', 'Plataforma de scraping com N atores: Instagram, TikTok, paginas de venda, YouTube transcript', 'redes-sociais', '🕷️', true, 'texto', 'Raspa posts/videos/paginas via atores configurados no Apify', 'por-produto', ARRAY['APIFY_TOKEN']::text[])
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  emoji = EXCLUDED.emoji,
  ativa = EXCLUDED.ativa,
  tipo_dado = EXCLUDED.tipo_dado,
  exemplo_uso = EXCLUDED.exemplo_uso,
  cobertura_cerebros = EXCLUDED.cobertura_cerebros,
  cofre_chaves = EXCLUDED.cofre_chaves;

DELETE FROM pinguim.integracoes_catalogo WHERE slug IN ('apify-instagram', 'apify-tiktok', 'apify-paginas');

-- ============================================================
-- 3. Tally -> YA Forms
-- ============================================================
UPDATE pinguim.cerebro_fontes_planejadas
   SET integracao_slug = 'yaforms'
 WHERE integracao_slug = 'tally-forms';

INSERT INTO pinguim.integracoes_catalogo (slug, nome, descricao, categoria, emoji, ativa, tipo_dado, exemplo_uso, cobertura_cerebros, cofre_chaves) VALUES
  ('yaforms', 'YA Forms (Formularios)', 'Plataforma de formularios usada pelo Andre (yayforms.com)', 'pesquisa', '📝', false, 'estruturado', 'Recebe respostas de pesquisa/formulario de aluno', 'por-produto', ARRAY['YAFORMS_API_KEY']::text[])
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  emoji = EXCLUDED.emoji,
  ativa = EXCLUDED.ativa,
  tipo_dado = EXCLUDED.tipo_dado,
  exemplo_uso = EXCLUDED.exemplo_uso,
  cobertura_cerebros = EXCLUDED.cobertura_cerebros,
  cofre_chaves = EXCLUDED.cofre_chaves;

DELETE FROM pinguim.integracoes_catalogo WHERE slug = 'tally-forms';

-- ============================================================
-- 4. RPC: editar fonte planejada (titulo/desc/integracao/documentacao)
-- ============================================================
CREATE OR REPLACE FUNCTION pinguim.cerebro_fonte_planejada_editar(
  p_id uuid,
  p_titulo text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_integracao_slug text DEFAULT NULL,
  p_url_origem text DEFAULT NULL,
  p_documentacao_automacao jsonb DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pinguim.cerebro_fontes_planejadas SET
    titulo = COALESCE(p_titulo, titulo),
    descricao = COALESCE(p_descricao, descricao),
    integracao_slug = COALESCE(p_integracao_slug, integracao_slug),
    url_origem = COALESCE(p_url_origem, url_origem),
    documentacao_automacao = COALESCE(p_documentacao_automacao, documentacao_automacao),
    status = COALESCE(p_status, status),
    atualizado_em = now()
  WHERE id = p_id;
END;
$$;

-- ============================================================
-- 5. RPC: equipe edita descricao da integracao
-- ============================================================
CREATE OR REPLACE FUNCTION pinguim.integracao_atualizar_descricao_equipe(
  p_slug text,
  p_descricao_equipe text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pinguim.integracoes_catalogo SET
    descricao_equipe = p_descricao_equipe,
    atualizado_em = now()
  WHERE slug = p_slug;
END;
$$;

-- ============================================================
-- 6. Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION pinguim.cerebro_fonte_planejada_editar TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.integracao_atualizar_descricao_equipe TO service_role;
