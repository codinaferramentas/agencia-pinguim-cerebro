-- ============================================================
-- schema-028 — Detector de proxima edicao + alertas (2026-06-18 noite)
-- ============================================================
-- Goal: pra cada produto com pagina de venda, detectar data do proximo
-- evento (desafio, lancamento) via LLM. Quando a data passa e a aula
-- ainda nao foi subida, dispara alerta vermelho no painel + WhatsApp.
--
-- Reutilizavel pra Lo-fi, Low Ticket, ProAlt, qualquer produto com pagina
-- de venda + categorias aulas/transcricoes_aula_ao_vivo.
-- ============================================================

-- 1) Tabela proximas_edicoes
CREATE TABLE IF NOT EXISTS pinguim.proximas_edicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES pinguim.produtos(id) ON DELETE CASCADE,
  data_evento date NOT NULL,
  fonte_url text,                    -- URL da pagina de onde extraiu
  fonte_id uuid REFERENCES pinguim.cerebro_fontes(id) ON DELETE SET NULL,
  confianca numeric(3,2),            -- 0.00 - 1.00 do LLM
  status text NOT NULL DEFAULT 'futuro',
    -- 'futuro'      = falta mais de 2 dias
    -- 'pre_aviso'   = falta 2 dias ou menos (amarelo)
    -- 'atrasado'    = passou 1+ dia da data e nao tem aula (vermelho)
    -- 'resolvido'   = aula/transcricao foi subida >= data_evento
    -- 'ignorado'    = Andre clicou em "ja cuidei"
  resolvido_em timestamptz,
  resolvido_por text,                -- 'auto'|'manual'
  resolvido_fonte_id uuid REFERENCES pinguim.cerebro_fontes(id) ON DELETE SET NULL,
  extraido_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_proximas_edicoes_produto ON pinguim.proximas_edicoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_proximas_edicoes_status ON pinguim.proximas_edicoes(status);
CREATE INDEX IF NOT EXISTS idx_proximas_edicoes_data ON pinguim.proximas_edicoes(data_evento);

-- Unique: 1 edicao em aberto por produto+data (evita duplicata se LLM rodar 2x)
CREATE UNIQUE INDEX IF NOT EXISTS uq_proximas_edicoes_aberto
  ON pinguim.proximas_edicoes(produto_id, data_evento)
  WHERE status IN ('futuro','pre_aviso','atrasado');

COMMENT ON TABLE pinguim.proximas_edicoes IS
  'Eventos futuros (desafios, lancamentos) detectados via LLM nas paginas de venda. Auto-resolve quando aula chega >= data_evento.';

-- 2) Enricher novo: extrator-data-proxima-edicao
INSERT INTO pinguim.enriquecedores_catalogo (slug, nome, descricao, tipo_fonte_aceito, modelo_llm, prompt_template, output_tabela, ativo, ordem)
VALUES (
  'extrator-data-proxima-edicao',
  'Extrator de data do proximo evento (desafio/lancamento)',
  'Le conteudo de pagina de venda e extrai data do proximo desafio/lancamento. Se nao mencionar data futura, retorna null. Roda 1x por dia pra cada produto, pegando a pagina_venda mais recente.',
  'pagina_venda',
  'openai:gpt-4o-mini',
  E'Voce esta lendo o conteudo de uma pagina de venda de um curso/desafio/lancamento.\n\nSua tarefa: extrair a DATA do PROXIMO EVENTO mencionado (data do desafio, data do lancamento, data da turma, "comeca dia X").\n\nRegras:\n- So data FUTURA (depois de hoje, considerando hoje={data_hoje}).\n- Formato ISO: "YYYY-MM-DD".\n- Se a pagina nao menciona data futura clara, retorne {"data_evento": null, "confianca": 0, "motivo": "nao mencionou data futura"}.\n- Se menciona varias datas, pegue a mais proxima futura.\n- Confianca 0.0-1.0: 1.0 se data esta explicita ("Desafio comeca dia 22 de junho"), 0.5 se inferida ("proxima turma em junho"), 0.0 se nao tem.\n\nOutput: JSON puro sem markdown.\n\nConteudo da pagina:\n{conteudo}',
  'pinguim.proximas_edicoes',
  true,
  30
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prompt_template = EXCLUDED.prompt_template,
  atualizado_em = now();

-- 3) RPC: alertas abertos pro painel
CREATE OR REPLACE FUNCTION pinguim.painel_alertas_edicoes()
RETURNS TABLE (
  produto_id uuid,
  produto_nome text,
  produto_emoji text,
  edicao_id uuid,
  data_evento date,
  dias_para_evento int,        -- negativo = atrasado
  status text,                   -- pre_aviso | atrasado
  fonte_url text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pinguim, public AS $$
  SELECT
    p.id AS produto_id,
    p.nome AS produto_nome,
    p.emoji AS produto_emoji,
    pe.id AS edicao_id,
    pe.data_evento,
    (pe.data_evento - CURRENT_DATE)::int AS dias_para_evento,
    pe.status,
    pe.fonte_url
  FROM pinguim.proximas_edicoes pe
  JOIN pinguim.produtos p ON p.id = pe.produto_id
  WHERE pe.status IN ('pre_aviso','atrasado')
  ORDER BY pe.data_evento ASC;
$$;
GRANT EXECUTE ON FUNCTION pinguim.painel_alertas_edicoes() TO anon, authenticated;

-- 4) RPC: marcar como ignorado (botao "ja cuidei")
CREATE OR REPLACE FUNCTION pinguim.proxima_edicao_marcar_resolvida(p_edicao_id uuid, p_por text DEFAULT 'manual')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
BEGIN
  UPDATE pinguim.proximas_edicoes
     SET status = CASE WHEN p_por = 'auto' THEN 'resolvido' ELSE 'ignorado' END,
         resolvido_em = now(),
         resolvido_por = p_por,
         atualizado_em = now()
   WHERE id = p_edicao_id;
END $$;
GRANT EXECUTE ON FUNCTION pinguim.proxima_edicao_marcar_resolvida(uuid, text) TO anon, authenticated;

-- 5) RPC: recalcular status (rodada pelo scheduler)
-- Logica:
--   - data_evento - hoje > 2 dias → 'futuro'
--   - 0 <= data_evento - hoje <= 2 → 'pre_aviso'
--   - data_evento - hoje < 0 (passou) → 'atrasado'
CREATE OR REPLACE FUNCTION pinguim.proximas_edicoes_recalcular_status()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
BEGIN
  UPDATE pinguim.proximas_edicoes
     SET status = CASE
       WHEN (data_evento - CURRENT_DATE) > 2 THEN 'futuro'
       WHEN (data_evento - CURRENT_DATE) BETWEEN 0 AND 2 THEN 'pre_aviso'
       WHEN (data_evento - CURRENT_DATE) < 0 THEN 'atrasado'
     END,
     atualizado_em = now()
   WHERE status IN ('futuro','pre_aviso','atrasado');
END $$;
GRANT EXECUTE ON FUNCTION pinguim.proximas_edicoes_recalcular_status() TO anon, authenticated;

-- 6) Trigger auto-resolve: quando chega fonte de aulas/transcricoes
-- com criado_em >= data_evento da edicao aberta daquele produto, marca resolvido.
CREATE OR REPLACE FUNCTION pinguim.auto_resolver_edicoes_pendentes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
DECLARE
  v_produto_id uuid;
  v_categoria text;
BEGIN
  -- Pega produto via cerebro
  SELECT c.produto_id INTO v_produto_id
    FROM pinguim.cerebros c WHERE c.id = NEW.cerebro_id;
  IF v_produto_id IS NULL THEN RETURN NEW; END IF;

  -- Categoria: derivar do tipo da fonte
  v_categoria := CASE NEW.tipo
    WHEN 'aula_youtube' THEN 'aulas'
    WHEN 'aula' THEN 'aulas'
    WHEN 'transcricao_aula' THEN 'transcricoes_aula_ao_vivo'
    WHEN 'transcricao_aula_ao_vivo' THEN 'transcricoes_aula_ao_vivo'
    WHEN 'audio' THEN 'transcricoes_aula_ao_vivo'
    WHEN 'video' THEN 'aulas'
    ELSE NULL
  END;
  IF v_categoria IS NULL THEN RETURN NEW; END IF;

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

DROP TRIGGER IF EXISTS trg_auto_resolver_edicoes ON pinguim.cerebro_fontes;
CREATE TRIGGER trg_auto_resolver_edicoes
  AFTER INSERT ON pinguim.cerebro_fontes
  FOR EACH ROW
  EXECUTE FUNCTION pinguim.auto_resolver_edicoes_pendentes();

-- 7) Helper: gravar nova edicao detectada pelo enricher
CREATE OR REPLACE FUNCTION pinguim.proxima_edicao_upsert(
  p_produto_id uuid,
  p_data_evento date,
  p_fonte_url text,
  p_fonte_id uuid,
  p_confianca numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pinguim, public AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Se ja existe edicao aberta pra esse produto+data, atualiza confianca/extracao
  SELECT id INTO v_id FROM pinguim.proximas_edicoes
   WHERE produto_id = p_produto_id
     AND data_evento = p_data_evento
     AND status IN ('futuro','pre_aviso','atrasado')
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE pinguim.proximas_edicoes
       SET fonte_url = COALESCE(p_fonte_url, fonte_url),
           fonte_id = COALESCE(p_fonte_id, fonte_id),
           confianca = GREATEST(confianca, p_confianca),
           extraido_em = now(),
           atualizado_em = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO pinguim.proximas_edicoes (produto_id, data_evento, fonte_url, fonte_id, confianca, status)
  VALUES (p_produto_id, p_data_evento, p_fonte_url, p_fonte_id, p_confianca,
    CASE
      WHEN (p_data_evento - CURRENT_DATE) > 2 THEN 'futuro'
      WHEN (p_data_evento - CURRENT_DATE) BETWEEN 0 AND 2 THEN 'pre_aviso'
      ELSE 'atrasado'
    END)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION pinguim.proxima_edicao_upsert(uuid, date, text, uuid, numeric) TO anon, authenticated, service_role;
