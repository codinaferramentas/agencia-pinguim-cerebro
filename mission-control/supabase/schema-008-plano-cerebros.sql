-- ============================================================
-- schema-008-plano-cerebros.sql
-- ============================================================
-- Plano de Atualizacao de Cerebros (V2.16 Onda 3)
--
-- Tabelas:
-- - pinguim.cerebro_fontes_planejadas: fontes que socio mapeou na reuniao mas
--   ainda nao tem automacao rodando. "Vou pegar do WhatsApp dos alunos do Elo
--   semanalmente" — vai aqui.
-- - pinguim.integracoes_catalogo: cardapio de integracoes disponiveis (Meta,
--   Hotmart, Discord, Drive, Tally, etc) com flag se ja esta ativa.
-- ============================================================

-- ============================================================
-- Tabela: pinguim.cerebro_fontes_planejadas
-- ============================================================
-- Cada linha = uma fonte planejada (talvez ja existe manual, talvez nem isso).
-- Quando vira automacao, marca automacao_id e cria entry em relatorios_config.

CREATE TABLE IF NOT EXISTS pinguim.cerebro_fontes_planejadas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id    uuid REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  produto_id    uuid REFERENCES pinguim.produtos(id), -- atalho (denormalizado)

  -- Identificacao da fonte
  integracao_slug text,           -- slug da integracao no catalogo (ex: 'meta-ads', 'whatsapp-evolution')
  tipo_fonte    text NOT NULL,    -- 'manual' | 'sugerida' | 'aprovada' | 'automatizada'
  titulo        text NOT NULL,    -- "Grupo WhatsApp Alunos Elo"
  descricao     text,             -- contexto humano
  url_origem    text,             -- URL/identificador externo

  -- Estado do planejamento
  status        text NOT NULL DEFAULT 'mapeada', -- mapeada | em_construcao | rodando | pausada
  prioridade    integer DEFAULT 0,
  proposta_cron text,                            -- ex: "0 3 * * *" — sugestao do socio na reuniao
  cron_descricao text,                           -- "todo dia 03h BRT"

  -- Quando vira automacao, aponta pro registro real
  relatorio_config_id uuid REFERENCES pinguim.relatorios_config(id) ON DELETE SET NULL,

  -- Auditoria
  observacoes   text,                            -- "decidido na reuniao 2026-06-16"
  cliente_id    uuid,                            -- quem cadastrou
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fontes_planejadas_cerebro
  ON pinguim.cerebro_fontes_planejadas (cerebro_id, status);
CREATE INDEX IF NOT EXISTS idx_fontes_planejadas_produto
  ON pinguim.cerebro_fontes_planejadas (produto_id, status);

COMMENT ON TABLE pinguim.cerebro_fontes_planejadas IS
  'V2.16 Onda 3 — Fontes planejadas pra alimentar cerebros (mapeadas em reuniao). Difere de cerebro_fontes (que sao chunks ja vetorizados). Aqui eh INTENCAO de alimentacao recorrente.';

-- ============================================================
-- Tabela: pinguim.integracoes_catalogo
-- ============================================================
-- Lista de integracoes disponiveis no sistema. Lida pra mostrar como cardapio
-- na pagina Plano de Cerebros — sócio escolhe qual quer plugar em qual cerebro.

CREATE TABLE IF NOT EXISTS pinguim.integracoes_catalogo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  nome          text NOT NULL,
  descricao     text,
  categoria     text,            -- 'vendas'|'redes-sociais'|'mensageria'|'docs'|'analytics'|'crm'|'pesquisa'
  emoji         text,
  ativa         boolean NOT NULL DEFAULT true,
  tipo_dado     text,            -- 'estruturado'|'texto'|'midia' — o que ela gera
  exemplo_uso   text,            -- "Pega vendas Hotmart D-1 e injeta como contexto"
  cobertura_cerebros text,       -- 'todos'|'por-produto'|'manual' — sinaliza escopo
  cofre_chaves  text[],          -- chaves no cofre necessarias
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Popular catalogo com integracoes existentes
-- ============================================================

INSERT INTO pinguim.integracoes_catalogo (slug, nome, descricao, categoria, emoji, ativa, tipo_dado, exemplo_uso, cobertura_cerebros, cofre_chaves) VALUES
  ('hotmart-api',         'Hotmart (API oficial)',     'Vendas, reembolsos, assinaturas, Members Area (Club)', 'vendas',           '💰', true,  'estruturado', 'Pega vendas D-1 do produto e injeta como contexto: tickets, formas pagamento, comportamento aluno', 'por-produto', ARRAY['HOTMART_CLIENT_ID','HOTMART_CLIENT_SECRET','HOTMART_BASIC_TOKEN']::text[]),
  ('hotmart-dashboard',   'Hotmart (Dashboard Pedro)', 'Receita canonica via webhook (mais rapido que API)', 'vendas',           '📊', true,  'estruturado', 'Le snapshot diario de vendas/reembolsos do 2o Supabase', 'por-produto', ARRAY['DASHBOARD_URL','DASHBOARD_SERVICE_ROLE_KEY']::text[]),
  ('meta-ads',            'Meta Ads (Graph API)',      'Campanhas, criativos, custos, alcance', 'analytics',        '📘', true,  'estruturado', 'Pega gasto+ROAS por campanha vinculada ao produto, injeta como contexto comercial', 'por-produto', ARRAY['META_ACCESS_TOKEN','META_APP_ID']::text[]),
  ('discord-bot',         'Discord Bot (canais)',      'Le mensagens de canais do servidor', 'mensageria',       '💬', true,  'texto',       'Le canal de suporte do produto X nas ultimas 24h, classifica reclamacoes', 'por-produto', ARRAY['DISCORD_BOT_TOKEN','DISCORD_GUILD_ID']::text[]),
  ('whatsapp-evolution',  'WhatsApp Evolution',        'Le grupos onde a instancia esta participando', 'mensageria',       '📱', true,  'texto',       'Le grupo "Alunos Elo" diariamente e extrai duvidas frequentes', 'por-produto', ARRAY['EVOLUTION_API_KEY','EVOLUTION_API_URL']::text[]),
  ('google-drive',        'Google Drive',              'Documentos, planilhas, transcripts', 'docs',             '📂', true,  'texto',       'Monitora pasta "Material X" e ingere arquivos novos', 'manual', ARRAY['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_REFRESH_TOKEN']::text[]),
  ('google-gmail',        'Gmail',                     'Mensagens com clientes ou fornecedores', 'mensageria',       '📧', true,  'texto',       'Le emails com tag "Aluno Elo" e extrai feedback', 'por-produto', ARRAY['GOOGLE_OAUTH_REFRESH_TOKEN']::text[]),
  ('youtube',             'YouTube',                   'Transcricoes + comentarios de videos', 'redes-sociais',    '📺', true,  'texto',       'Monitora canal X e ingere vídeos novos + comentários', 'por-produto', ARRAY['YOUTUBE_API_KEY']::text[]),
  ('apify-instagram',     'Apify Instagram',           'Posts, stories, comentarios', 'redes-sociais',    '📷', true,  'texto',       'Raspa posts que mencionam o produto', 'por-produto', ARRAY['APIFY_TOKEN']::text[]),
  ('apify-tiktok',        'Apify TikTok',              'Videos, comentarios', 'redes-sociais',    '🎵', true,  'midia',       'Raspa videos relacionados ao produto', 'por-produto', ARRAY['APIFY_TOKEN']::text[]),
  ('apify-paginas',       'Apify (paginas)',           'Clona pagina de venda do produto', 'docs',             '🌐', true,  'texto',       'Pega versao atual da pagina de venda e atualiza fonte', 'por-produto', ARRAY['APIFY_TOKEN']::text[]),
  ('supabase-proalt',     'Supabase ProAlt',           'DB interno do produto ProAlt (behavior aluno)', 'analytics',        '🟦', true,  'estruturado', 'Le profile + progress do aluno ProAlt', 'manual', ARRAY['PROALT_SUPABASE_URL','PROALT_SERVICE_ROLE_KEY']::text[]),
  ('supabase-elo',        'Supabase Elo',              'DB interno do produto Elo', 'analytics',        '🟨', true,  'estruturado', 'Le profile + progresso + bookings do aluno Elo', 'manual', ARRAY['ELO_SUPABASE_URL','ELO_SERVICE_ROLE_KEY']::text[]),
  ('supabase-sirius',     'Supabase Sirius',           'DB interno do produto Sirius', 'analytics',        '🟪', true,  'estruturado', 'Le challenges, profiles, broadcasts do Sirius', 'manual', ARRAY['SIRIUS_SUPABASE_URL','SIRIUS_SERVICE_ROLE_KEY']::text[]),
  ('clint-crm',           'Clint CRM',                 'Leads, deals, conversas comerciais', 'crm',              '🤝', true,  'estruturado', 'Le leads do produto e classifica intencao de compra', 'por-produto', ARRAY['CLINT_API_TOKEN']::text[]),
  ('tally-forms',         'Tally (Formularios)',       'Respostas de pesquisa de aluno (a integrar)', 'pesquisa',         '📝', false, 'estruturado', 'Recebe respostas de pesquisa pos-aula e classifica feedback', 'por-produto', ARRAY['TALLY_API_KEY']::text[]),
  ('openai-embedding',    'OpenAI Embeddings',         'Vetoriza textos pra busca semantica', 'analytics',        '🤖', true,  'estruturado', 'Vetoriza chunks novos pra busca RAG funcionar', 'todos', ARRAY['OPENAI_API_KEY']::text[]),
  ('manual',              'Cadastro manual',           'Sócio cola material direto (texto, link, PDF)', 'docs',             '✍️', true,  'texto',       'Cola texto/link de qualquer fonte que nao tem integracao', 'todos', ARRAY[]::text[])
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  emoji = EXCLUDED.emoji,
  ativa = EXCLUDED.ativa,
  tipo_dado = EXCLUDED.tipo_dado,
  exemplo_uso = EXCLUDED.exemplo_uso,
  cobertura_cerebros = EXCLUDED.cobertura_cerebros,
  cofre_chaves = EXCLUDED.cofre_chaves;

-- ============================================================
-- View: snapshot pronto pra pagina ler
-- ============================================================

CREATE OR REPLACE VIEW pinguim.vw_plano_cerebros AS
SELECT
  p.id              AS produto_id,
  p.slug            AS produto_slug,
  p.nome            AS produto_nome,
  p.emoji           AS produto_emoji,
  p.icone_url       AS produto_icone,
  p.descricao       AS produto_descricao,
  c.id              AS cerebro_id,
  c.ultima_alimentacao,
  COALESCE(per.versao, 0)         AS persona_versao,
  per.atualizado_em AS persona_atualizado_em,
  (SELECT count(*) FROM pinguim.cerebro_fontes f WHERE f.cerebro_id = c.id) AS total_fontes,
  (SELECT count(*) FROM pinguim.cerebro_fontes f
    WHERE f.cerebro_id = c.id
      AND f.criado_em >= now() - interval '7 days')           AS fontes_ultima_semana,
  (SELECT count(*) FROM pinguim.cerebro_fontes_chunks ch WHERE ch.cerebro_id = c.id) AS total_chunks,
  (SELECT count(*) FROM pinguim.cerebro_fontes_planejadas fp
    WHERE fp.cerebro_id = c.id AND fp.status = 'mapeada')     AS fontes_planejadas_mapeadas,
  (SELECT count(*) FROM pinguim.cerebro_fontes_planejadas fp
    WHERE fp.cerebro_id = c.id AND fp.status = 'rodando')     AS fontes_planejadas_rodando,
  GREATEST(0, EXTRACT(DAY FROM now() - c.ultima_alimentacao)::int) AS dias_sem_atualizar,
  CASE
    WHEN c.ultima_alimentacao IS NULL THEN 'vermelho'
    WHEN c.ultima_alimentacao >= now() - interval '7 days'  THEN 'verde'
    WHEN c.ultima_alimentacao >= now() - interval '30 days' THEN 'amarelo'
    ELSE 'vermelho'
  END                AS status_carga
FROM pinguim.produtos p
LEFT JOIN pinguim.cerebros c ON c.produto_id = p.id
LEFT JOIN pinguim.personas per ON per.cerebro_id = c.id
WHERE p.categoria = 'interno'
ORDER BY p.nome;

-- ============================================================
-- RPCs CRUD pra pagina manipular fontes planejadas
-- ============================================================

CREATE OR REPLACE FUNCTION pinguim.cerebro_fonte_planejada_criar(
  p_cerebro_id    uuid,
  p_titulo        text,
  p_integracao_slug text,
  p_tipo_fonte    text DEFAULT 'mapeada',
  p_descricao     text DEFAULT NULL,
  p_url_origem    text DEFAULT NULL,
  p_proposta_cron text DEFAULT NULL,
  p_cron_descricao text DEFAULT NULL,
  p_prioridade    integer DEFAULT 0,
  p_observacoes   text DEFAULT NULL,
  p_cliente_id    uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_produto_id uuid;
BEGIN
  SELECT produto_id INTO v_produto_id FROM pinguim.cerebros WHERE id = p_cerebro_id;
  INSERT INTO pinguim.cerebro_fontes_planejadas (
    cerebro_id, produto_id, integracao_slug, tipo_fonte, titulo, descricao,
    url_origem, proposta_cron, cron_descricao, prioridade, observacoes, cliente_id
  ) VALUES (
    p_cerebro_id, v_produto_id, p_integracao_slug, p_tipo_fonte, p_titulo, p_descricao,
    p_url_origem, p_proposta_cron, p_cron_descricao, p_prioridade, p_observacoes, p_cliente_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION pinguim.cerebro_fonte_planejada_atualizar_status(
  p_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pinguim.cerebro_fontes_planejadas
    SET status = p_status, atualizado_em = now()
    WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION pinguim.cerebro_fonte_planejada_remover(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM pinguim.cerebro_fontes_planejadas WHERE id = p_id;
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT ON pinguim.vw_plano_cerebros TO service_role, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.cerebro_fontes_planejadas TO service_role;
GRANT SELECT ON pinguim.integracoes_catalogo TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION pinguim.cerebro_fonte_planejada_criar TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.cerebro_fonte_planejada_atualizar_status TO service_role;
GRANT EXECUTE ON FUNCTION pinguim.cerebro_fonte_planejada_remover TO service_role;
