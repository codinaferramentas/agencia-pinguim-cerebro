-- =====================================================================
-- Customer Profile — 5a familia conceitual de Cerebro
-- =====================================================================
-- Estrutura normalizada em 3 tabelas pra suportar:
--   - 1 cliente com N compras (Elo + ProAlt + Lira)
--   - 1 cliente com N eventos comportamentais (onboarding, modulo, etc)
--   - Update sem duplicar (chave: email de compra)
--   - Escala estimada: 250/dia, 91k/ano, ~1GB/ano
--
-- Origem primaria de dados: Clint via webhook (decidido brainstorm 2026-05-02)
-- =====================================================================

-- ---------- 1. customer_profiles ----------
CREATE TABLE IF NOT EXISTS pinguim.customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,                    -- chave decisoria (decisao Andre)
  nome text,
  telefone text,
  status text NOT NULL DEFAULT 'lead',           -- lead | cliente | ex-cliente
  primeira_compra_em timestamptz,                -- preenchido na 1a compra
  ultima_atividade_em timestamptz NOT NULL DEFAULT now(),
  ltv_total_brl numeric(12, 2) NOT NULL DEFAULT 0,  -- soma de customer_compras pagas
  health_score integer,                          -- 0-100, calculado pelo Health Score Agent (Growth Squad)
  origem text,                                   -- de onde veio (clint, hotmart, manual)
  metadata jsonb DEFAULT '{}'::jsonb,            -- campos extras flexiveis
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON pinguim.customer_profiles(email);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_status ON pinguim.customer_profiles(status);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_atividade ON pinguim.customer_profiles(ultima_atividade_em DESC);

-- ---------- 2. customer_compras ----------
-- 1:N com customer_profiles. Cada compra = 1 linha. NUNCA atualiza profile.
CREATE TABLE IF NOT EXISTS pinguim.customer_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES pinguim.customer_profiles(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES pinguim.produtos(id),  -- linka com Cerebro de produto se existir
  produto_nome text NOT NULL,                       -- snapshot pra historico (caso produto seja deletado)
  valor_brl numeric(12, 2) NOT NULL,
  status text NOT NULL DEFAULT 'paga',              -- paga | reembolsada | chargeback | pendente
  gateway text NOT NULL DEFAULT 'clint',            -- clint | hotmart | manual
  gateway_id text,                                  -- id externo da venda (idempotencia)
  comprado_em timestamptz NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(gateway, gateway_id)                       -- evita duplicar mesma venda do gateway
);

CREATE INDEX IF NOT EXISTS idx_customer_compras_customer ON pinguim.customer_compras(customer_id, comprado_em DESC);
CREATE INDEX IF NOT EXISTS idx_customer_compras_produto ON pinguim.customer_compras(produto_id);

-- ---------- 3. customer_events ----------
-- N:1 com customer_profiles. Timeline completa de TUDO que nao e compra.
CREATE TABLE IF NOT EXISTS pinguim.customer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES pinguim.customer_profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL,                               -- onboarding | modulo_completo | abandono_checkout | discord_post | webhook_clint | etc
  origem text NOT NULL,                             -- clint | hotmart | discord | manual | sistema
  titulo text,                                      -- resumo curto pra UI
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,       -- dados completos do evento
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_events_customer ON pinguim.customer_events(customer_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_customer_events_tipo ON pinguim.customer_events(tipo);

-- =====================================================================
-- Triggers — manter agregados do profile sincronizados
-- =====================================================================

-- Atualiza ltv, primeira_compra, status quando compra entra/muda
CREATE OR REPLACE FUNCTION pinguim.atualizar_profile_apos_compra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
declare
  v_ltv numeric(12, 2);
  v_primeira timestamptz;
begin
  -- Recalcula LTV (soma compras pagas)
  select coalesce(sum(valor_brl), 0), min(comprado_em)
    into v_ltv, v_primeira
  from pinguim.customer_compras
  where customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
    and status = 'paga';

  update pinguim.customer_profiles
  set ltv_total_brl = v_ltv,
      primeira_compra_em = v_primeira,
      status = case when v_ltv > 0 then 'cliente' else status end,
      ultima_atividade_em = now(),
      atualizado_em = now()
  where id = COALESCE(NEW.customer_id, OLD.customer_id);

  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_compras_atualiza_profile ON pinguim.customer_compras;
CREATE TRIGGER trg_compras_atualiza_profile
  AFTER INSERT OR UPDATE OR DELETE ON pinguim.customer_compras
  FOR EACH ROW EXECUTE FUNCTION pinguim.atualizar_profile_apos_compra();

-- Atualiza ultima_atividade quando evento entra
CREATE OR REPLACE FUNCTION pinguim.atualizar_profile_apos_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
begin
  update pinguim.customer_profiles
  set ultima_atividade_em = NEW.ocorrido_em,
      atualizado_em = now()
  where id = NEW.customer_id;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_eventos_atualiza_profile ON pinguim.customer_events;
CREATE TRIGGER trg_eventos_atualiza_profile
  AFTER INSERT ON pinguim.customer_events
  FOR EACH ROW EXECUTE FUNCTION pinguim.atualizar_profile_apos_evento();

-- =====================================================================
-- RPCs pro front e pros agentes
-- =====================================================================

-- Lista paginada com busca (decisao: paginacao infinita 50 por vez)
CREATE OR REPLACE FUNCTION pinguim.listar_customer_profiles(
  p_busca text DEFAULT '',
  p_status text DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  email text,
  nome text,
  status text,
  ltv_total_brl numeric,
  primeira_compra_em timestamptz,
  ultima_atividade_em timestamptz,
  qtd_compras bigint,
  qtd_eventos bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  select
    p.id, p.email, p.nome, p.status, p.ltv_total_brl,
    p.primeira_compra_em, p.ultima_atividade_em,
    (select count(*) from pinguim.customer_compras c where c.customer_id = p.id) as qtd_compras,
    (select count(*) from pinguim.customer_events e where e.customer_id = p.id) as qtd_eventos
  from pinguim.customer_profiles p
  where (p_busca = '' or p.email ilike '%' || p_busca || '%' or coalesce(p.nome, '') ilike '%' || p_busca || '%')
    and (p_status is null or p.status = p_status)
  order by p.ultima_atividade_em desc
  limit p_limit offset p_offset;
$$;

GRANT EXECUTE ON FUNCTION pinguim.listar_customer_profiles(text, text, integer, integer) TO authenticated;

-- Conta total (pra UI mostrar "mostrando 50 de X")
CREATE OR REPLACE FUNCTION pinguim.contar_customer_profiles(
  p_busca text DEFAULT '',
  p_status text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  select count(*)
  from pinguim.customer_profiles
  where (p_busca = '' or email ilike '%' || p_busca || '%' or coalesce(nome, '') ilike '%' || p_busca || '%')
    and (p_status is null or status = p_status);
$$;

GRANT EXECUTE ON FUNCTION pinguim.contar_customer_profiles(text, text) TO authenticated;

-- Detalhe completo de 1 cliente (pra tela de perfil expandido E pros agentes)
CREATE OR REPLACE FUNCTION pinguim.get_customer_profile(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
declare
  v_profile pinguim.customer_profiles;
  v_compras jsonb;
  v_eventos jsonb;
begin
  select * into v_profile from pinguim.customer_profiles where email = p_email;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'produto_nome', produto_nome, 'valor_brl', valor_brl,
    'status', status, 'gateway', gateway, 'comprado_em', comprado_em
  ) order by comprado_em desc), '[]'::jsonb)
    into v_compras
  from pinguim.customer_compras where customer_id = v_profile.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'tipo', tipo, 'origem', origem, 'titulo', titulo,
    'payload', payload, 'ocorrido_em', ocorrido_em
  ) order by ocorrido_em desc), '[]'::jsonb)
    into v_eventos
  from pinguim.customer_events where customer_id = v_profile.id limit 100;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'compras', v_compras,
    'eventos', v_eventos
  );
end;
$$;

GRANT EXECUTE ON FUNCTION pinguim.get_customer_profile(text) TO authenticated;

-- Stats agregados pra dashboard / chips
CREATE OR REPLACE FUNCTION pinguim.stats_customer_profiles()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, pg_catalog, pg_temp
AS $$
  select jsonb_build_object(
    'total', (select count(*) from pinguim.customer_profiles),
    'leads', (select count(*) from pinguim.customer_profiles where status = 'lead'),
    'clientes', (select count(*) from pinguim.customer_profiles where status = 'cliente'),
    'ex_clientes', (select count(*) from pinguim.customer_profiles where status = 'ex-cliente'),
    'ltv_total_brl', (select coalesce(sum(ltv_total_brl), 0) from pinguim.customer_profiles)
  );
$$;

GRANT EXECUTE ON FUNCTION pinguim.stats_customer_profiles() TO authenticated;

-- =====================================================================
-- RLS — qualquer authenticated le e escreve (decisao Andre: quem ta no painel ve tudo)
-- =====================================================================

ALTER TABLE pinguim.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.customer_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.customer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_profiles_authenticated ON pinguim.customer_profiles;
CREATE POLICY customer_profiles_authenticated ON pinguim.customer_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS customer_compras_authenticated ON pinguim.customer_compras;
CREATE POLICY customer_compras_authenticated ON pinguim.customer_compras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS customer_events_authenticated ON pinguim.customer_events;
CREATE POLICY customer_events_authenticated ON pinguim.customer_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.customer_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.customer_compras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.customer_events TO authenticated;
