-- ============================================================
-- schema-034b-vendas-eventos-rpcs.sql
-- ============================================================
-- RPCs SECURITY DEFINER em pinguim que operam sobre vendas_eventos.
--
-- Por quê: vendas_eventos NÃO é exposto no PostgREST (segurança — a anon key
-- da página pública não deve enxergar essas tabelas). O supabase-js só fala
-- com schemas expostos. Solução canônica do projeto (igual schema-033): a
-- Edge Function (service_role) chama estas RPCs no schema pinguim, e elas
-- rodam a lógica dentro de vendas_eventos.
--
-- GRANT só pra service_role — nunca anon/authenticated. Segunda barreira
-- além da RLS.
-- ============================================================

-- ------------------------------------------------------------
-- ve_listar_eventos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_listar_eventos()
RETURNS SETOF vendas_eventos.eventos
LANGUAGE sql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$ SELECT * FROM vendas_eventos.eventos WHERE ativo = true ORDER BY criado_em DESC $$;

-- ------------------------------------------------------------
-- ve_criar_evento
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_criar_evento(
  p_slug text, p_nome text, p_data_evento date DEFAULT NULL,
  p_local text DEFAULT NULL, p_product_ids bigint[] DEFAULT '{}'
)
RETURNS vendas_eventos.eventos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
DECLARE r vendas_eventos.eventos;
BEGIN
  INSERT INTO vendas_eventos.eventos (slug, nome, data_evento, local, product_ids)
  VALUES (p_slug, p_nome, p_data_evento, p_local, COALESCE(p_product_ids, '{}'))
  RETURNING * INTO r;
  RETURN r;
END $$;

-- ------------------------------------------------------------
-- ve_listar_consultores
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_listar_consultores()
RETURNS TABLE (id uuid, nome text, whatsapp text)
LANGUAGE sql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$ SELECT id, nome, whatsapp FROM vendas_eventos.consultores WHERE ativo = true ORDER BY nome $$;

-- ------------------------------------------------------------
-- ve_upsert_cache — usada pela importação Hotmart (array de jsonb)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_upsert_cache(p_registros jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
DECLARE n integer;
BEGIN
  INSERT INTO vendas_eventos.hotmart_cache
    (evento_id, product_id, produto_nome, transaction_code, status, nome, email, cpf, telefone, valor, data_compra)
  SELECT
    NULLIF(x->>'evento_id','')::uuid, (x->>'product_id')::bigint, x->>'produto_nome',
    x->>'transaction_code', x->>'status', x->>'nome', x->>'email', x->>'cpf',
    x->>'telefone', NULLIF(x->>'valor','')::numeric, NULLIF(x->>'data_compra','')::timestamptz
  FROM jsonb_array_elements(p_registros) AS x
  ON CONFLICT (transaction_code) DO UPDATE SET
    status = EXCLUDED.status, nome = EXCLUDED.nome, email = EXCLUDED.email,
    cpf = EXCLUDED.cpf, telefone = EXCLUDED.telefone, valor = EXCLUDED.valor,
    produto_nome = EXCLUDED.produto_nome, evento_id = COALESCE(EXCLUDED.evento_id, vendas_eventos.hotmart_cache.evento_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ------------------------------------------------------------
-- ve_buscar_cache — busca por nome/email/cpf/telefone (CPF mascarado no app)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_buscar_cache(p_evento_id uuid, p_termo text, p_dig text)
RETURNS TABLE (
  id uuid, product_id bigint, produto_nome text, transaction_code text,
  nome text, email text, cpf text, telefone text, valor numeric, data_compra timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
  SELECT id, product_id, produto_nome, transaction_code, nome, email, cpf, telefone, valor, data_compra
  FROM vendas_eventos.hotmart_cache
  WHERE (p_evento_id IS NULL OR evento_id = p_evento_id)
    AND (
      nome ILIKE '%'||p_termo||'%'
      OR email ILIKE '%'||p_termo||'%'
      OR (length(p_dig) >= 3 AND (regexp_replace(coalesce(cpf,''),'\D','','g') ILIKE '%'||p_dig||'%'
                                  OR regexp_replace(coalesce(telefone,''),'\D','','g') ILIKE '%'||p_dig||'%'))
    )
  LIMIT 20
$$;

-- ------------------------------------------------------------
-- ve_criar_aplicacao — cria aplicação + pessoas atômico. Valida 1 responsável.
-- p_aplicacao jsonb, p_pessoas jsonb[]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_criar_aplicacao(
  p_evento_id uuid, p_aplicacao jsonb, p_pessoas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
DECLARE
  v_aplic vendas_eventos.aplicacoes;
  v_qtd_resp int;
  v_qtd_pes int;
  x jsonb;
  v_pessoas jsonb := '[]'::jsonb;
  v_row vendas_eventos.pessoas;
BEGIN
  v_qtd_pes := jsonb_array_length(p_pessoas);
  IF v_qtd_pes < 1 OR v_qtd_pes > 2 THEN RAISE EXCEPTION 'aplicacao precisa de 1 ou 2 cadeiras'; END IF;

  SELECT count(*) INTO v_qtd_resp FROM jsonb_array_elements(p_pessoas) e
    WHERE (e->>'is_responsavel_financeiro')::boolean IS TRUE;
  IF v_qtd_resp <> 1 THEN RAISE EXCEPTION 'marque exatamente 1 responsavel financeiro'; END IF;

  INSERT INTO vendas_eventos.aplicacoes (
    evento_id, origem, product_id, nome_empresa, faturar_em, cnpj, razao_social,
    valor_pago, forma_pagamento, comprovante_ref, consultor_nome, consultor_whatsapp,
    observacao, consentimento_at, status
  ) VALUES (
    p_evento_id,
    COALESCE(p_aplicacao->>'origem','manual'),
    NULLIF(p_aplicacao->>'product_id','')::bigint,
    p_aplicacao->>'nome_empresa', p_aplicacao->>'faturar_em', p_aplicacao->>'cnpj',
    p_aplicacao->>'razao_social', NULLIF(p_aplicacao->>'valor_pago','')::numeric,
    p_aplicacao->>'forma_pagamento', p_aplicacao->>'comprovante_ref',
    p_aplicacao->>'consultor_nome', p_aplicacao->>'consultor_whatsapp',
    p_aplicacao->>'observacao',
    COALESCE(NULLIF(p_aplicacao->>'consentimento_at','')::timestamptz, now()),
    COALESCE(p_aplicacao->>'status','captado')
  ) RETURNING * INTO v_aplic;

  FOR x IN SELECT * FROM jsonb_array_elements(p_pessoas) LOOP
    INSERT INTO vendas_eventos.pessoas (
      aplicacao_id, is_responsavel_financeiro, origem_pessoa, nome, nome_guerra, cpf,
      email_compra, email_contato, telefone, whatsapp, data_nascimento,
      cep, rua, numero, complemento, bairro, cidade, uf, hotmart_transaction
    ) VALUES (
      v_aplic.id,
      COALESCE((x->>'is_responsavel_financeiro')::boolean, false),
      x->>'origem_pessoa', x->>'nome', x->>'nome_guerra', x->>'cpf',
      x->>'email_compra', x->>'email_contato', x->>'telefone', x->>'whatsapp',
      NULLIF(x->>'data_nascimento','')::date,
      x->>'cep', x->>'rua', x->>'numero', x->>'complemento', x->>'bairro',
      x->>'cidade', x->>'uf', x->>'hotmart_transaction'
    ) RETURNING * INTO v_row;
    v_pessoas := v_pessoas || to_jsonb(v_row);
  END LOOP;

  RETURN jsonb_build_object('aplicacao', to_jsonb(v_aplic), 'pessoas', v_pessoas);
END $$;

-- ------------------------------------------------------------
-- ve_checar_duplicata — soft-warning por CPF
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_checar_duplicata(p_cpfs text[])
RETURNS TABLE (nome text, cpf text, aplicacao_id uuid, criado_em timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
  SELECT nome, cpf, aplicacao_id, criado_em FROM vendas_eventos.pessoas
  WHERE regexp_replace(coalesce(cpf,''),'\D','','g') = ANY(p_cpfs) LIMIT 3
$$;

-- ------------------------------------------------------------
-- ve_atualizar_aplicacao
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_atualizar_aplicacao(p_id uuid, p_campos jsonb)
RETURNS vendas_eventos.aplicacoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
DECLARE r vendas_eventos.aplicacoes;
BEGIN
  UPDATE vendas_eventos.aplicacoes SET
    nome_empresa    = COALESCE(p_campos->>'nome_empresa', nome_empresa),
    faturar_em      = COALESCE(p_campos->>'faturar_em', faturar_em),
    cnpj            = COALESCE(p_campos->>'cnpj', cnpj),
    razao_social    = COALESCE(p_campos->>'razao_social', razao_social),
    valor_pago      = COALESCE(NULLIF(p_campos->>'valor_pago','')::numeric, valor_pago),
    forma_pagamento = COALESCE(p_campos->>'forma_pagamento', forma_pagamento),
    comprovante_ref = COALESCE(p_campos->>'comprovante_ref', comprovante_ref),
    observacao      = COALESCE(p_campos->>'observacao', observacao),
    status          = COALESCE(p_campos->>'status', status)
  WHERE id = p_id RETURNING * INTO r;
  RETURN r;
END $$;

-- ------------------------------------------------------------
-- ve_adicionar_pessoa — 2ª cadeira (máx 2)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_adicionar_pessoa(p_aplicacao_id uuid, p_pessoa jsonb)
RETURNS vendas_eventos.pessoas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
DECLARE r vendas_eventos.pessoas; n int;
BEGIN
  SELECT count(*) INTO n FROM vendas_eventos.pessoas WHERE aplicacao_id = p_aplicacao_id;
  IF n >= 2 THEN RAISE EXCEPTION 'maximo 2 cadeiras por aplicacao'; END IF;
  INSERT INTO vendas_eventos.pessoas (
    aplicacao_id, is_responsavel_financeiro, origem_pessoa, nome, nome_guerra, cpf,
    email_compra, email_contato, telefone, whatsapp, data_nascimento,
    cep, rua, numero, complemento, bairro, cidade, uf, hotmart_transaction
  ) VALUES (
    p_aplicacao_id, COALESCE((p_pessoa->>'is_responsavel_financeiro')::boolean,false),
    p_pessoa->>'origem_pessoa', p_pessoa->>'nome', p_pessoa->>'nome_guerra', p_pessoa->>'cpf',
    p_pessoa->>'email_compra', p_pessoa->>'email_contato', p_pessoa->>'telefone', p_pessoa->>'whatsapp',
    NULLIF(p_pessoa->>'data_nascimento','')::date,
    p_pessoa->>'cep', p_pessoa->>'rua', p_pessoa->>'numero', p_pessoa->>'complemento',
    p_pessoa->>'bairro', p_pessoa->>'cidade', p_pessoa->>'uf', p_pessoa->>'hotmart_transaction'
  ) RETURNING * INTO r;
  RETURN r;
END $$;

-- ------------------------------------------------------------
-- ve_listar_aplicacoes — gestão/export (com pessoas aninhadas)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pinguim.ve_listar_aplicacoes(p_evento_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = vendas_eventos, pinguim, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.criado_em DESC), '[]'::jsonb) FROM (
    SELECT a.*, COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM vendas_eventos.pessoas p WHERE p.aplicacao_id = a.id), '[]'::jsonb) AS pessoas
    FROM vendas_eventos.aplicacoes a
    WHERE (p_evento_id IS NULL OR a.evento_id = p_evento_id)
  ) t
$$;

-- ------------------------------------------------------------
-- grants — SÓ service_role
-- ------------------------------------------------------------
DO $$ DECLARE f text;
BEGIN
  FOR f IN
    SELECT 'pinguim.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pinguim' AND p.proname LIKE 've\_%'
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f||' FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f||' TO service_role';
  END LOOP;
END $$;
