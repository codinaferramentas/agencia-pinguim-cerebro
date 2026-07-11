-- ============================================================
-- schema-034-vendas-eventos.sql
-- ============================================================
-- Gestão de Vendas de Evento (aplicações high-ticket captadas ao vivo).
--
-- Schema PRÓPRIO e ISOLADO: vendas_eventos (NÃO polui pinguim, NÃO toca public).
-- NÃO exposto no PostgREST — acesso SÓ via Edge Function com service_role.
-- Isso garante que a anon key (visível na página pública do consultor) não
-- enxerga nem escreve nada aqui. RLS fechado por cima como segunda barreira.
--
-- Genérico desde o dia 1: cada evento é UMA LINHA em vendas_eventos.eventos.
-- Não é "um evento" — é gestão de N eventos.
--
-- Modelo:
--   eventos        (1) — o evento em si (nome, data, produtos Hotmart vinculados)
--   aplicacoes     (N) — cada aplicação = 1 dossiê (1 ou 2 cadeiras)
--   pessoas        (N) — cadeiras da aplicação (máx 2 = regra da Edge, não CHECK)
--   hotmart_cache  (N) — compradores pré-importados do banco Dashboard
--   consultores    (N) — quem atende no evento (combo box, sem senha)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS vendas_eventos;

-- ------------------------------------------------------------
-- eventos — cada linha é um evento
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas_eventos.eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,                 -- 'imersao-jul-2026'
  nome          text NOT NULL,                        -- 'Imersão Julho 2026'
  data_evento   date,
  local         text,
  product_ids   bigint[] NOT NULL DEFAULT '{}',       -- {8103827, 2605400} — produtos Hotmart do evento
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- consultores — quem atende no evento (login por combo box, sem senha)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas_eventos.consultores (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      text NOT NULL,
  whatsapp  text,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- aplicacoes — a aplicação (1 dossiê, 1 ou 2 cadeiras)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas_eventos.aplicacoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id          uuid NOT NULL REFERENCES vendas_eventos.eventos(id) ON DELETE RESTRICT,
  origem             text NOT NULL DEFAULT 'manual'
                       CHECK (origem IN ('hotmart','pix','manual')),
  product_id         bigint,                          -- 8103827 | 2605400 | null (pix)
  nome_empresa       text,
  faturar_em         text CHECK (faturar_em IN ('pf','pj')),
  cnpj               text,
  razao_social       text,
  valor_pago         numeric,                         -- valor REAL (upsell/desconto de palco)
  forma_pagamento    text,                            -- hotmart_cartao | hotmart_boleto | pix | transferencia
  comprovante_ref    text,                            -- id transação / últimos dígitos / link (Pix)
  consultor_nome     text NOT NULL,                   -- quem atendeu (do combo box)
  consultor_whatsapp text,
  observacao         text,                            -- CAMPO OURO
  consentimento_at   timestamptz,                     -- base legal LGPD
  status             text NOT NULL DEFAULT 'captado'
                       CHECK (status IN ('captado','contrato_enviado','assinado','cancelado')),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ve_aplic_evento ON vendas_eventos.aplicacoes(evento_id);
CREATE INDEX IF NOT EXISTS idx_ve_aplic_status ON vendas_eventos.aplicacoes(status);

-- ------------------------------------------------------------
-- pessoas — cadeiras (1 ou 2 por aplicação)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas_eventos.pessoas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicacao_id              uuid NOT NULL REFERENCES vendas_eventos.aplicacoes(id) ON DELETE CASCADE,
  is_responsavel_financeiro boolean NOT NULL DEFAULT false,
  origem_pessoa             text CHECK (origem_pessoa IN ('hotmart','manual')),
  nome                      text NOT NULL,
  nome_guerra               text,
  cpf                       text,
  email_compra              text,                     -- email usado na compra (pode ser da esposa)
  email_contato             text,                     -- email que a pessoa REALMENTE lê
  telefone                  text,
  whatsapp                  text,
  data_nascimento           date,
  cep                       text,
  rua                       text,
  numero                    text,
  complemento               text,
  bairro                    text,
  cidade                    text,
  uf                        text,
  hotmart_transaction       text,
  criado_em                 timestamptz NOT NULL DEFAULT now(),
  atualizado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ve_pes_aplic ON vendas_eventos.pessoas(aplicacao_id);
CREATE INDEX IF NOT EXISTS idx_ve_pes_cpf   ON vendas_eventos.pessoas(cpf);
CREATE INDEX IF NOT EXISTS idx_ve_pes_email ON vendas_eventos.pessoas(lower(email_compra));
CREATE INDEX IF NOT EXISTS idx_ve_pes_emailc ON vendas_eventos.pessoas(lower(email_contato));
CREATE INDEX IF NOT EXISTS idx_ve_pes_tel   ON vendas_eventos.pessoas(telefone);
CREATE INDEX IF NOT EXISTS idx_ve_pes_nome  ON vendas_eventos.pessoas(lower(nome));

-- REGRA DE OURO: exatamente 1 responsável financeiro por aplicação.
-- Índice único parcial — o banco garante que não há 2 responsáveis.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ve_resp_financeiro
  ON vendas_eventos.pessoas(aplicacao_id)
  WHERE is_responsavel_financeiro = true;

-- ------------------------------------------------------------
-- hotmart_cache — compradores pré-importados do banco Dashboard
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas_eventos.hotmart_cache (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id        uuid REFERENCES vendas_eventos.eventos(id) ON DELETE CASCADE,
  product_id       bigint NOT NULL,
  produto_nome     text,
  transaction_code text NOT NULL,
  status           text,
  nome             text,
  email            text,
  cpf              text,
  telefone         text,
  valor            numeric,
  data_compra      timestamptz,
  importado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_code)                            -- re-sync via UPSERT, não duplica
);

CREATE INDEX IF NOT EXISTS idx_ve_cache_email ON vendas_eventos.hotmart_cache(lower(email));
CREATE INDEX IF NOT EXISTS idx_ve_cache_cpf   ON vendas_eventos.hotmart_cache(cpf);
CREATE INDEX IF NOT EXISTS idx_ve_cache_tel   ON vendas_eventos.hotmart_cache(telefone);
CREATE INDEX IF NOT EXISTS idx_ve_cache_nome  ON vendas_eventos.hotmart_cache(lower(nome));
CREATE INDEX IF NOT EXISTS idx_ve_cache_evt   ON vendas_eventos.hotmart_cache(evento_id);

-- ------------------------------------------------------------
-- RLS — fecha tudo. Só service_role (via Edge Function) passa.
-- Zero policy pra anon/authenticated: mesmo com a anon key da página
-- pública, ninguém lê nem escreve aqui direto.
-- ------------------------------------------------------------
ALTER TABLE vendas_eventos.eventos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_eventos.consultores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_eventos.aplicacoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_eventos.pessoas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_eventos.hotmart_cache ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- trigger de atualizado_em
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION vendas_eventos.tg_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS touch_eventos    ON vendas_eventos.eventos;
DROP TRIGGER IF EXISTS touch_aplicacoes ON vendas_eventos.aplicacoes;
DROP TRIGGER IF EXISTS touch_pessoas    ON vendas_eventos.pessoas;
CREATE TRIGGER touch_eventos    BEFORE UPDATE ON vendas_eventos.eventos    FOR EACH ROW EXECUTE FUNCTION vendas_eventos.tg_touch();
CREATE TRIGGER touch_aplicacoes BEFORE UPDATE ON vendas_eventos.aplicacoes FOR EACH ROW EXECUTE FUNCTION vendas_eventos.tg_touch();
CREATE TRIGGER touch_pessoas    BEFORE UPDATE ON vendas_eventos.pessoas    FOR EACH ROW EXECUTE FUNCTION vendas_eventos.tg_touch();

-- ------------------------------------------------------------
-- grants — service_role opera tudo (Edge Function). anon/authenticated NADA.
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA vendas_eventos TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA vendas_eventos TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA vendas_eventos TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA vendas_eventos GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA vendas_eventos GRANT ALL ON SEQUENCES TO service_role;
