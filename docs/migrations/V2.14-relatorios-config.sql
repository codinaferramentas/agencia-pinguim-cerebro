-- ============================================================
-- V2.14 — Schema flexível de Relatórios (Princípio 11 + 12)
-- ============================================================
-- Permite ao sócio criar relatórios novos via chat sem mexer em código.
-- Naval: "relatório vira dado, não código".
--
-- Padrão de uso:
--   1. Atendente (via chat) detecta "a partir de amanhã quero relatório X"
--   2. INSERT em pinguim.relatorios_config (nome, secoes, cron, destinatarios)
--   3. RPC pinguim.agendar_cron_relatorio() cria pg_cron job dinâmico
--   4. Edge Function 'gerar-relatorio' lê config + executa módulos + sintetiza
-- ============================================================

-- ============================================================
-- TABELA principal — pinguim.relatorios_config
-- ============================================================

CREATE TABLE IF NOT EXISTS pinguim.relatorios_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  cliente_id      uuid NOT NULL,                                    -- dono do relatório (sócio)

  slug            text NOT NULL,                                    -- 'executivo-diario', 'diagnostico-email-3d', etc
  nome            text NOT NULL,                                    -- 'Relatório Executivo Diário'
  descricao       text,                                             -- "Resumo de vendas, agenda, email e Discord das últimas 24h"

  -- Composição: lista de módulos a executar (ordem importa pro sintetizador)
  -- Cada módulo é um slug de Skill em cerebro/squads/data/skills/
  -- Ex: ['financeiro-24h', 'agenda-hoje', 'triagem-emails-24h', 'discord-24h']
  modulos         text[] NOT NULL DEFAULT '{}',

  -- Sintetizador final (Skill que junta os módulos + faz TL;DR)
  -- Ex: 'compor-executivo-diario'
  sintetizador    text,

  -- Frequência:
  -- cron_expr: cron POSIX (ex: '0 11 * * *' = 8h BRT diário, '0 11 * * 1,3,5' = seg/qua/sex 8h)
  -- timezone: pra anotação, pg_cron sempre roda em UTC
  cron_expr       text NOT NULL,                                    -- '0 11 * * *'
  cron_descricao  text,                                             -- 'todo dia 8h BRT'
  cron_job_id     bigint,                                           -- ID do job em cron.job (se ja agendado)

  -- Destino:
  -- canais: ['whatsapp', 'gmail', 'pinguim-os'] — pra onde mandar quando pronto
  -- whatsapp_numero: telefone destino (vai pra tabela telegram_chats / whatsapp_destinatarios depois)
  canais          text[] NOT NULL DEFAULT '{whatsapp}',
  whatsapp_numero text,                                             -- '5511999...' formato Evolution
  email_destino   text,                                             -- 'fulano@x.com' (se canal inclui gmail)

  -- Estado
  ativo           boolean NOT NULL DEFAULT true,
  ultima_execucao timestamptz,
  ultimo_status   text,                                             -- 'sucesso', 'falha', 'em_curso'
  ultimo_entregavel_id uuid REFERENCES pinguim.entregaveis(id) ON DELETE SET NULL,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),

  -- Por sócio, slug é único (Codina pode ter 'executivo-diario' E Luiz ter 'executivo-diario' próprio)
  UNIQUE (cliente_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_config_cliente ON pinguim.relatorios_config(cliente_id, ativo);
CREATE INDEX IF NOT EXISTS idx_relatorios_config_ativo ON pinguim.relatorios_config(ativo) WHERE ativo = true;

COMMENT ON TABLE pinguim.relatorios_config IS 'V2.14 — Relatórios viram dado. Sócio cria via chat → INSERT → cron agendado dinâmico.';

-- ============================================================
-- RLS — sócio só vê os seus
-- ============================================================
ALTER TABLE pinguim.relatorios_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relatorios_config_select_proprio ON pinguim.relatorios_config;
CREATE POLICY relatorios_config_select_proprio ON pinguim.relatorios_config
  FOR SELECT
  USING (true);  -- TODO V3: amarra cliente_id ao usuário logado

DROP POLICY IF EXISTS relatorios_config_insert_proprio ON pinguim.relatorios_config;
CREATE POLICY relatorios_config_insert_proprio ON pinguim.relatorios_config
  FOR INSERT
  WITH CHECK (true);  -- idem

DROP POLICY IF EXISTS relatorios_config_update_proprio ON pinguim.relatorios_config;
CREATE POLICY relatorios_config_update_proprio ON pinguim.relatorios_config
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS relatorios_config_delete_proprio ON pinguim.relatorios_config;
CREATE POLICY relatorios_config_delete_proprio ON pinguim.relatorios_config
  FOR DELETE
  USING (true);

-- ============================================================
-- TABELA — pinguim.relatorios_modulos (catálogo de módulos disponíveis)
-- ============================================================
-- Lista todos os módulos que podem ser usados em relatorios_config.modulos[].
-- Cada módulo = 1 Skill em cerebro/squads/data/skills/<slug>/SKILL.md
-- Sócio vê esse catálogo quando vai criar relatório novo.

CREATE TABLE IF NOT EXISTS pinguim.relatorios_modulos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,                             -- 'financeiro-24h', 'triagem-emails-24h', etc
  nome            text NOT NULL,                                    -- 'Resumo financeiro 24h'
  descricao       text,                                             -- "Vendas, faturamento, ROAS, reembolsos do dia anterior"
  fonte           text,                                             -- '2º Supabase Dashboard', 'Gmail', 'Calendar', 'Discord', etc
  skill_path      text,                                             -- 'cerebro/squads/data/skills/financeiro-24h/SKILL.md'
  status          text NOT NULL DEFAULT 'ativo',                    -- 'ativo', 'em_construcao', 'bloqueado'
  bloqueio_motivo text,                                             -- 'aguardando 2º Supabase do André' (quando status='bloqueado')
  ordem_default   smallint,                                         -- ordem sugerida no relatório executivo (1=topo, etc)
  criado_em       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pinguim.relatorios_modulos IS 'V2.14 — Catálogo de módulos disponíveis. Cada um = 1 Skill da squad data.';

-- Popular com os módulos planejados
INSERT INTO pinguim.relatorios_modulos (slug, nome, descricao, fonte, skill_path, status, bloqueio_motivo, ordem_default) VALUES
  ('financeiro-24h', 'Resumo financeiro 24h',
   'Vendas, faturamento, reembolsos, gasto Ads, ROAS, comparação D-1.',
   '2º Supabase (dashboard de vendas)',
   'cerebro/squads/data/skills/financeiro-24h/SKILL.md',
   'em_construcao', 'Aguardando credenciais do 2º Supabase do dashboard', 2),

  ('agenda-hoje', 'Agenda do dia',
   'Reuniões de hoje + preview de amanhã. Pega via Google Calendar.',
   'Google Calendar',
   'cerebro/squads/data/skills/agenda-hoje/SKILL.md',
   'em_construcao', 'Aguardando Fase 3 Calendar (lib/google-calendar.js)', 3),

  ('triagem-emails-24h', 'Triagem de emails 24h',
   'Categoriza emails das últimas 24h em crítico/oportunidade/informativo/ruído + sugestão de ação.',
   'Gmail',
   'cerebro/squads/data/skills/triagem-emails-24h/SKILL.md',
   'ativo', NULL, 4),

  ('diagnostico-inbox-3dias', 'Diagnóstico inbox 3 dias',
   'Análise profunda + score de saúde + ações em batch (limpar spam, arquivar newsletters, etc).',
   'Gmail',
   'cerebro/squads/data/skills/diagnostico-inbox-3dias/SKILL.md',
   'ativo', NULL, NULL),

  ('discord-24h', 'Discord do time 24h',
   'Mensagens críticas no Discord da Pinguim nas últimas 24h (alunos pedindo, oportunidades, decisões).',
   'Discord (via pinguim.provas_sociais)',
   'cerebro/squads/data/skills/discord-24h/SKILL.md',
   'em_construcao', 'Skill ainda não criada — investigar pipeline de ingest', 5)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  fonte = EXCLUDED.fonte,
  skill_path = EXCLUDED.skill_path,
  status = EXCLUDED.status,
  bloqueio_motivo = EXCLUDED.bloqueio_motivo,
  ordem_default = EXCLUDED.ordem_default;

-- ============================================================
-- RPC — pinguim.criar_relatorio
-- ============================================================
-- Atendente chama via PostgREST quando sócio pede no chat.
-- Valida módulos contra catálogo, agenda cron, retorna o registro.

CREATE OR REPLACE FUNCTION pinguim.criar_relatorio(
  p_cliente_id      uuid,
  p_slug            text,
  p_nome            text,
  p_descricao       text,
  p_modulos         text[],
  p_sintetizador    text DEFAULT 'compor-executivo-diario',
  p_cron_expr       text DEFAULT '0 11 * * *',                 -- 8h BRT padrão
  p_cron_descricao  text DEFAULT 'todo dia 8h BRT',
  p_canais          text[] DEFAULT '{whatsapp}',
  p_whatsapp_numero text DEFAULT NULL,
  p_email_destino   text DEFAULT NULL
)
RETURNS pinguim.relatorios_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public
AS $$
DECLARE
  v_modulos_invalidos text[];
  v_id uuid;
  v_resultado pinguim.relatorios_config;
BEGIN
  -- Valida módulos contra catálogo
  SELECT array_agg(m) INTO v_modulos_invalidos
  FROM unnest(p_modulos) AS m
  WHERE NOT EXISTS (SELECT 1 FROM pinguim.relatorios_modulos WHERE slug = m);

  IF v_modulos_invalidos IS NOT NULL AND array_length(v_modulos_invalidos, 1) > 0 THEN
    RAISE EXCEPTION 'Módulos inválidos: %. Use SELECT slug FROM pinguim.relatorios_modulos pra ver disponíveis.', v_modulos_invalidos;
  END IF;

  -- Valida cron_expr (sintaxe básica — 5 campos)
  IF array_length(string_to_array(trim(p_cron_expr), ' '), 1) != 5 THEN
    RAISE EXCEPTION 'cron_expr deve ter 5 campos POSIX. Recebido: %', p_cron_expr;
  END IF;

  -- INSERT (ON CONFLICT atualiza)
  INSERT INTO pinguim.relatorios_config (
    cliente_id, slug, nome, descricao, modulos, sintetizador,
    cron_expr, cron_descricao, canais, whatsapp_numero, email_destino,
    ativo
  ) VALUES (
    p_cliente_id, p_slug, p_nome, p_descricao, p_modulos, p_sintetizador,
    p_cron_expr, p_cron_descricao, p_canais, p_whatsapp_numero, p_email_destino,
    true
  )
  ON CONFLICT (cliente_id, slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao,
    modulos = EXCLUDED.modulos,
    sintetizador = EXCLUDED.sintetizador,
    cron_expr = EXCLUDED.cron_expr,
    cron_descricao = EXCLUDED.cron_descricao,
    canais = EXCLUDED.canais,
    whatsapp_numero = EXCLUDED.whatsapp_numero,
    email_destino = EXCLUDED.email_destino,
    ativo = true,
    atualizado_em = now()
  RETURNING id INTO v_id;

  -- Agenda cron (atualiza cron_job_id na tabela)
  PERFORM pinguim.agendar_cron_relatorio(v_id);

  -- Re-busca pra retornar com cron_job_id já preenchido
  SELECT * INTO v_resultado FROM pinguim.relatorios_config WHERE id = v_id;
  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION pinguim.criar_relatorio IS 'V2.14 — Cria/atualiza relatório custom + agenda cron. Atendente Pinguim chama via Categoria F4.';

-- ============================================================
-- RPC — pinguim.agendar_cron_relatorio
-- ============================================================
-- Agenda (ou re-agenda) o pg_cron job pra um relatório.
-- Convenção do nome do job: 'pinguim-relatorio-<slug>-<cliente_id_short>'
-- Comando: SELECT pinguim.disparar_edge_function('gerar-relatorio') passando relatorio_id

CREATE OR REPLACE FUNCTION pinguim.agendar_cron_relatorio(
  p_relatorio_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public, cron
AS $$
DECLARE
  v_config pinguim.relatorios_config;
  v_job_name text;
  v_command text;
  v_existing_job_id bigint;
  v_new_job_id bigint;
BEGIN
  SELECT * INTO v_config FROM pinguim.relatorios_config WHERE id = p_relatorio_id;
  IF v_config IS NULL THEN
    RAISE EXCEPTION 'Relatório % não encontrado', p_relatorio_id;
  END IF;

  v_job_name := 'pinguim-relatorio-' || v_config.slug || '-' || left(v_config.cliente_id::text, 8);

  -- Se já tem job_id no config, desagenda primeiro (cron.unschedule é idempotente — não falha se não existe)
  IF v_config.cron_job_id IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(v_config.cron_job_id);
    EXCEPTION WHEN OTHERS THEN
      -- Job pode ter sido deletado por fora — ignora
      NULL;
    END;
  END IF;

  -- Comando que o cron vai rodar: chama Edge Function gerar-relatorio passando relatorio_id
  -- Usa pinguim.disparar_edge_function (já existe — convenção do FinOps + Squad Cyber)
  -- Se não existir ainda, fallback pra notificação simples
  BEGIN
    v_command := format(
      'SELECT pinguim.disparar_edge_function(%L, %L::jsonb);',
      'gerar-relatorio',
      jsonb_build_object('relatorio_id', p_relatorio_id)::text
    );
  EXCEPTION WHEN OTHERS THEN
    v_command := format(
      'SELECT 1 -- TODO: implementar disparar_edge_function ou Edge gerar-relatorio. Relatório: %s',
      p_relatorio_id
    );
  END;

  -- Agenda novo job
  v_new_job_id := cron.schedule(v_job_name, v_config.cron_expr, v_command);

  -- Salva o job_id no config pra futura referência
  UPDATE pinguim.relatorios_config
  SET cron_job_id = v_new_job_id, atualizado_em = now()
  WHERE id = p_relatorio_id;

  RETURN v_new_job_id;
END;
$$;

COMMENT ON FUNCTION pinguim.agendar_cron_relatorio IS 'V2.14 — Agenda pg_cron pro relatório. Idempotente — re-agenda se já existir.';

-- ============================================================
-- RPC — pinguim.desativar_relatorio (sócio diz "para de me mandar X")
-- ============================================================

CREATE OR REPLACE FUNCTION pinguim.desativar_relatorio(p_relatorio_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pinguim, public, cron
AS $$
DECLARE
  v_config pinguim.relatorios_config;
BEGIN
  SELECT * INTO v_config FROM pinguim.relatorios_config WHERE id = p_relatorio_id;
  IF v_config IS NULL THEN RETURN false; END IF;

  IF v_config.cron_job_id IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(v_config.cron_job_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  UPDATE pinguim.relatorios_config
  SET ativo = false, cron_job_id = NULL, atualizado_em = now()
  WHERE id = p_relatorio_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION pinguim.desativar_relatorio IS 'V2.14 — Desativa relatório + remove cron. Não deleta — preserva histórico.';

-- ============================================================
-- RPC — pinguim.listar_modulos_disponiveis (Atendente lista pro sócio)
-- ============================================================

CREATE OR REPLACE FUNCTION pinguim.listar_modulos_disponiveis()
RETURNS TABLE (
  slug text,
  nome text,
  descricao text,
  fonte text,
  status text,
  bloqueio_motivo text,
  ordem_default smallint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pinguim, public
AS $$
  SELECT slug, nome, descricao, fonte, status, bloqueio_motivo, ordem_default
  FROM pinguim.relatorios_modulos
  ORDER BY status DESC, ordem_default NULLS LAST, nome;
$$;

COMMENT ON FUNCTION pinguim.listar_modulos_disponiveis IS 'V2.14 — Lista catálogo de módulos pro Atendente sugerir ao sócio na hora de criar relatório custom.';

-- ============================================================
-- TRIGGER — atualizado_em automatico
-- ============================================================

CREATE OR REPLACE FUNCTION pinguim.tg_relatorios_config_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_relatorios_config_atualizado_em ON pinguim.relatorios_config;
CREATE TRIGGER tg_relatorios_config_atualizado_em
  BEFORE UPDATE ON pinguim.relatorios_config
  FOR EACH ROW
  EXECUTE FUNCTION pinguim.tg_relatorios_config_atualizado_em();

-- ============================================================
-- FIM
-- ============================================================
