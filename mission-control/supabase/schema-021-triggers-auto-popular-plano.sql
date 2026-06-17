-- ============================================================
-- schema-021 — Triggers de auto-popular plano de categorias (2026-06-17)
-- ============================================================
-- Antes, quando uma categoria nova era criada no catalogo, ela só aparecia
-- em cérebros NOVOS, não nos antigos. Resultado: cobertura desigual.
-- Aplicação retroativa adicionou anuncios_meta em 9 cérebros que estavam sem.
-- Pra evitar repetir o problema, criamos 2 triggers de auto-popular.
-- ============================================================

-- Trigger 1: quando entra CATEGORIA nova no catálogo (ativa=true),
-- auto-popula em TODOS os cérebros existentes com status sem_coleta.
CREATE OR REPLACE FUNCTION pinguim._auto_popular_categoria_em_cerebros()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ativa = true THEN
    INSERT INTO pinguim.cerebro_plano_categoria
      (cerebro_id, categoria_slug, status_automacao, trigger_tipo)
    SELECT c.id, NEW.slug, 'sem_coleta', 'manual'
    FROM pinguim.cerebros c
    WHERE NOT EXISTS (
      SELECT 1 FROM pinguim.cerebro_plano_categoria cpc
      WHERE cpc.cerebro_id = c.id AND cpc.categoria_slug = NEW.slug
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_popular_categoria ON pinguim.cerebro_categorias_catalogo;
CREATE TRIGGER trg_auto_popular_categoria
AFTER INSERT OR UPDATE OF ativa ON pinguim.cerebro_categorias_catalogo
FOR EACH ROW EXECUTE FUNCTION pinguim._auto_popular_categoria_em_cerebros();

-- Trigger 2: quando entra CÉREBRO novo,
-- auto-popula com TODAS as categorias ativas do catálogo, status sem_coleta.
CREATE OR REPLACE FUNCTION pinguim._auto_popular_plano_em_cerebro_novo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pinguim.cerebro_plano_categoria
    (cerebro_id, categoria_slug, status_automacao, trigger_tipo)
  SELECT NEW.id, cat.slug, 'sem_coleta', 'manual'
  FROM pinguim.cerebro_categorias_catalogo cat
  WHERE cat.ativa = true
    AND NOT EXISTS (
      SELECT 1 FROM pinguim.cerebro_plano_categoria cpc
      WHERE cpc.cerebro_id = NEW.id AND cpc.categoria_slug = cat.slug
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_popular_plano ON pinguim.cerebros;
CREATE TRIGGER trg_auto_popular_plano
AFTER INSERT ON pinguim.cerebros
FOR EACH ROW EXECUTE FUNCTION pinguim._auto_popular_plano_em_cerebro_novo();
