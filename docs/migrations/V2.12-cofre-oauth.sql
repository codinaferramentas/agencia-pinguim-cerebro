-- ============================================================
-- V2.12 Fase 0 — Cofre estendido pra OAuth tokens por cliente/socio
-- ============================================================
-- Decisao: NAO criar tabela nova. Estende cofre_chaves com cliente_id
-- opcional. Chaves de sistema (cliente_id=NULL) continuam funcionando
-- igual. Chaves OAuth ganham cliente_id preenchido.

-- 1) Adiciona coluna cliente_id (opcional)
ALTER TABLE pinguim.cofre_chaves
  ADD COLUMN IF NOT EXISTS cliente_id uuid;

-- 2) Indice composto pra busca rapida (provedor + cliente_id)
CREATE INDEX IF NOT EXISTS idx_cofre_chaves_provedor_cliente
  ON pinguim.cofre_chaves (provedor, cliente_id)
  WHERE ativo = true;

-- 3) RPC nova pra ler chave por cliente (Edge Function vai usar)
-- get_chave existente continua funcionando pra chaves de sistema.
CREATE OR REPLACE FUNCTION pinguim.get_chave_por_cliente(
  p_nome text,
  p_cliente_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public
AS $$
DECLARE
  v_valor text;
BEGIN
  SELECT valor_completo INTO v_valor
  FROM pinguim.cofre_chaves
  WHERE nome = p_nome
    AND cliente_id = p_cliente_id
    AND ativo = true
  LIMIT 1;
  RETURN v_valor;
END;
$$;

COMMENT ON FUNCTION pinguim.get_chave_por_cliente IS 'V2.12 — busca chave do cofre por nome + cliente_id. Usado pra OAuth tokens dos socios (Drive, Calendar, etc).';

-- 4) RPC pra revogar (set ativo=false). Painel de seguranca usa.
CREATE OR REPLACE FUNCTION pinguim.revogar_chave_oauth(
  p_nome text,
  p_cliente_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE pinguim.cofre_chaves
  SET ativo = false, atualizado_em = now()
  WHERE nome = p_nome AND cliente_id = p_cliente_id
  RETURNING 1 INTO v_count;
  RETURN v_count IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION pinguim.revogar_chave_oauth IS 'V2.12 — revoga OAuth token (set ativo=false). Painel /seguranca chama quando socio sai ou pede revogacao.';

-- 5) Verifica
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema='pinguim' AND table_name='cofre_chaves'
  AND column_name='cliente_id';
