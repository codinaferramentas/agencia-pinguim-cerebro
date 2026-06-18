-- ============================================================
-- schema-028b — Fix trigger auto-resolver (2026-06-18 noite finalissima)
-- ============================================================
-- Bug: trigger nao reconhece tipo='transcricao_midia', que eh o que o
-- sistema usa hoje (Apify YouTube + Whisper Drive). Por isso o Lo-fi
-- ficou atrasado mesmo Andre tendo subido 7 transcricoes em 18/06.
--
-- Fix: trigger reconhece TODOS os tipos compativeis com categoria
-- 'aulas' ou 'transcricoes_aula_ao_vivo' do catalogo.
-- ============================================================

CREATE OR REPLACE FUNCTION pinguim.auto_resolver_edicoes_pendentes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
DECLARE
  v_produto_id uuid;
BEGIN
  -- Pega produto via cerebro
  SELECT c.produto_id INTO v_produto_id
    FROM pinguim.cerebros c WHERE c.id = NEW.cerebro_id;
  IF v_produto_id IS NULL THEN RETURN NEW; END IF;

  -- Tipos que indicam aula nova entrou. Cobre os 2 caminhos atuais:
  -- 1. Apify YouTube -> tipo='transcricao_midia'
  -- 2. Detector Drive -> tipo='transcricao_midia' tambem
  -- 3. Futuros: aula, aula_youtube, transcricao_aula, transcricao_aula_ao_vivo, audio, video
  IF NEW.tipo NOT IN ('transcricao_midia','aula_youtube','aula','transcricao_aula',
                       'transcricao_aula_ao_vivo','audio','video') THEN
    RETURN NEW;
  END IF;

  -- Marca edicoes abertas daquele produto onde data_evento <= hoje como resolvidas
  UPDATE pinguim.proximas_edicoes
     SET status = 'resolvido',
         resolvido_em = now(),
         resolvido_por = 'auto',
         resolvido_fonte_id = NEW.id,
         atualizado_em = now()
   WHERE produto_id = v_produto_id
     AND status IN ('futuro','pre_aviso','atrasado')
     AND data_evento <= CURRENT_DATE;

  RETURN NEW;
END $$;

-- Re-grava trigger
DROP TRIGGER IF EXISTS trg_auto_resolver_edicoes ON pinguim.cerebro_fontes;
CREATE TRIGGER trg_auto_resolver_edicoes
  AFTER INSERT ON pinguim.cerebro_fontes
  FOR EACH ROW
  EXECUTE FUNCTION pinguim.auto_resolver_edicoes_pendentes();

-- ============================================================
-- BACKFILL: aplicar regra retroativamente.
-- Se existe edicao 'atrasado' com fonte de aula posterior a data_evento,
-- marcar como resolvido_por='auto-backfill'.
-- ============================================================
UPDATE pinguim.proximas_edicoes pe
   SET status = 'resolvido',
       resolvido_em = now(),
       resolvido_por = 'auto-backfill',
       resolvido_fonte_id = sub.fonte_id,
       atualizado_em = now()
  FROM (
    SELECT DISTINCT ON (cf.cerebro_id) c.produto_id, cf.id AS fonte_id, cf.criado_em
      FROM pinguim.cerebro_fontes cf
      JOIN pinguim.cerebros c ON c.id = cf.cerebro_id
     WHERE cf.tipo IN ('transcricao_midia','aula_youtube','aula','transcricao_aula',
                        'transcricao_aula_ao_vivo','audio','video')
     ORDER BY cf.cerebro_id, cf.criado_em DESC
  ) sub
 WHERE pe.produto_id = sub.produto_id
   AND pe.status IN ('futuro','pre_aviso','atrasado')
   AND pe.data_evento <= sub.criado_em::date;
