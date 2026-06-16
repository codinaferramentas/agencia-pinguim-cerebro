-- ============================================================
-- schema-014-fix-rpcs-so-internos.sql
-- ============================================================
-- 2026-06-16: bug de escopo descoberto durante smoke
-- RPCs cerebro_plano_garantir e cerebro_categoria_criar populavam plano
-- pra TODOS os 119 cerebros (incluindo externos/clones/metodologias).
-- Pagina so mostra os 10 internos, mas banco ficava inflado.
-- Fix: filtrar por produtos.categoria='interno' em ambas RPCs.
-- ============================================================

-- Cleanup: remove planos de cerebros nao-internos
DELETE FROM pinguim.cerebro_plano_categoria
 WHERE cerebro_id NOT IN (
   SELECT c.id FROM pinguim.cerebros c
   JOIN pinguim.produtos p ON p.id = c.produto_id
   WHERE p.categoria = 'interno'
 );

-- RPC garantir: NOOP se cerebro nao for interno
CREATE OR REPLACE FUNCTION pinguim.cerebro_plano_garantir(p_cerebro_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cat record;
  v_eh_interno boolean;
BEGIN
  SELECT (p.categoria = 'interno') INTO v_eh_interno
    FROM pinguim.cerebros c
    JOIN pinguim.produtos p ON p.id = c.produto_id
   WHERE c.id = p_cerebro_id;

  IF NOT COALESCE(v_eh_interno, false) THEN RETURN; END IF;

  FOR v_cat IN SELECT slug FROM pinguim.cerebro_categorias_catalogo WHERE ativa = true LOOP
    INSERT INTO pinguim.cerebro_plano_categoria (cerebro_id, categoria_slug, status_automacao)
    VALUES (p_cerebro_id, v_cat.slug, 'sem_coleta')
    ON CONFLICT (cerebro_id, categoria_slug) DO NOTHING;
  END LOOP;
END;
$$;

-- RPC criar categoria: so popula em cerebros internos
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

  v_slug := lower(trim(p_nome));
  v_slug := translate(v_slug, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '_', 'g');
  v_slug := trim(both '_' from v_slug);
  IF length(v_slug) = 0 THEN
    v_slug := 'categoria_' || extract(epoch FROM now())::bigint::text;
  END IF;

  SELECT COALESCE(max(ordem), 0) + 1 INTO v_ordem
    FROM pinguim.cerebro_categorias_catalogo WHERE ordem < 99;

  INSERT INTO pinguim.cerebro_categorias_catalogo (slug, nome, emoji, descricao, tipos_fonte, ordem)
  VALUES (v_slug, trim(p_nome), COALESCE(p_emoji, '📦'), p_descricao, COALESCE(p_tipos_fonte, ARRAY[]::text[]), v_ordem)
  ON CONFLICT (slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    emoji = EXCLUDED.emoji,
    descricao = COALESCE(EXCLUDED.descricao, pinguim.cerebro_categorias_catalogo.descricao),
    tipos_fonte = EXCLUDED.tipos_fonte;

  -- So cerebros internos
  FOR v_cer IN
    SELECT c.id FROM pinguim.cerebros c
    JOIN pinguim.produtos p ON p.id = c.produto_id
    WHERE p.categoria = 'interno'
  LOOP
    INSERT INTO pinguim.cerebro_plano_categoria (cerebro_id, categoria_slug, status_automacao)
    VALUES (v_cer.id, v_slug, 'sem_coleta')
    ON CONFLICT (cerebro_id, categoria_slug) DO NOTHING;
  END LOOP;

  RETURN v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION pinguim.cerebro_categoria_criar TO service_role;
