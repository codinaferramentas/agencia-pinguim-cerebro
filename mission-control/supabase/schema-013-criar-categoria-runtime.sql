-- ============================================================
-- schema-013-criar-categoria-runtime.sql
-- ============================================================
-- 2026-06-16: criar categoria nova no meio da reuniao
--
-- 1) RPC pra criar categoria + auto-popular plano em todos os cerebros
-- 2) Slug gerado a partir do nome (lowercase, sem acento, _ separador)
-- ============================================================

CREATE OR REPLACE FUNCTION pinguim.cerebro_categoria_criar(
  p_nome text,
  p_emoji text DEFAULT '📦',
  p_descricao text DEFAULT NULL,
  p_tipos_fonte text[] DEFAULT ARRAY[]::text[]
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slug text;
  v_ordem integer;
  v_cer record;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'nome obrigatorio';
  END IF;

  -- Gera slug: lowercase, espacos -> _, remove acento basico
  v_slug := lower(trim(p_nome));
  v_slug := translate(v_slug, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '_', 'g');
  v_slug := trim(both '_' from v_slug);
  IF length(v_slug) = 0 THEN v_slug := 'categoria_' || extract(epoch FROM now())::bigint::text; END IF;

  -- Insere antes de 'outros' (ordem 98) pra ficar agrupado com as canonicas
  SELECT COALESCE(max(ordem), 0) + 1 INTO v_ordem
    FROM pinguim.cerebro_categorias_catalogo WHERE ordem < 99;

  INSERT INTO pinguim.cerebro_categorias_catalogo (slug, nome, emoji, descricao, tipos_fonte, ordem)
  VALUES (v_slug, trim(p_nome), COALESCE(p_emoji, '📦'), p_descricao, COALESCE(p_tipos_fonte, ARRAY[]::text[]), v_ordem)
  ON CONFLICT (slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    emoji = EXCLUDED.emoji,
    descricao = COALESCE(EXCLUDED.descricao, pinguim.cerebro_categorias_catalogo.descricao),
    tipos_fonte = EXCLUDED.tipos_fonte;

  -- Auto-popula em todos os cerebros (categoria nova = global)
  FOR v_cer IN SELECT id FROM pinguim.cerebros LOOP
    INSERT INTO pinguim.cerebro_plano_categoria (cerebro_id, categoria_slug, status_automacao)
    VALUES (v_cer.id, v_slug, 'sem_coleta')
    ON CONFLICT (cerebro_id, categoria_slug) DO NOTHING;
  END LOOP;

  RETURN v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION pinguim.cerebro_categoria_criar TO service_role;
