-- ============================================================
-- schema-019-enriquecedores.sql
-- ============================================================
-- 2026-06-16: camada de ENRIQUECEDORES plugaveis sobre handlers
-- de ingestao. Cada enriquecedor:
--   - eh definido declarativamente no catalogo
--   - eh acionado por tipo_fonte (chat_export, transcricao_midia, etc)
--   - roda DEPOIS que cerebro_fonte foi salvo
--   - extrai dado estruturado via LLM (gpt-4o-mini default — barato)
--   - salva em tabela propria do enriquecedor (declarada no metadata)
--
-- Reusabilidade: 1 enriquecedor cobre N produtos. Novo desafio Lo-fi,
-- novo grupo do ProAlt, novo Elo — todos usam mesmo motor.
-- ============================================================

-- ============================================================
-- 1) Catalogo de enriquecedores
-- ============================================================
CREATE TABLE IF NOT EXISTS pinguim.enriquecedores_catalogo (
  slug              text PRIMARY KEY,
  nome              text NOT NULL,
  descricao         text,
  tipo_fonte_aceito text NOT NULL,     -- 'chat_export', 'transcricao_midia', 'pagina_venda', etc
  modelo_llm        text DEFAULT 'openai:gpt-4o-mini',
  prompt_template   text NOT NULL,     -- prompt com placeholders {texto}, {autor}, etc
  output_tabela     text,              -- nome da tabela que recebe output (ex: 'pinguim.perfis_alunos_chat')
  ativo             boolean DEFAULT true,
  ordem             integer DEFAULT 100,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enriquecedores_tipo_ativo
  ON pinguim.enriquecedores_catalogo (tipo_fonte_aceito, ativo);

COMMENT ON TABLE pinguim.enriquecedores_catalogo IS
  'V3 — Catalogo declarativo de enriquecedores. Cada um eh acionado por tipo_fonte e roda depois da ingestao base, extraindo dado estruturado via LLM.';

GRANT SELECT ON pinguim.enriquecedores_catalogo TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.enriquecedores_catalogo TO service_role;

-- ============================================================
-- 2) Log de execucoes de enriquecedor (auditoria + idempotencia)
-- ============================================================
CREATE TABLE IF NOT EXISTS pinguim.enriquecedores_execucoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enriquecedor_slug text NOT NULL REFERENCES pinguim.enriquecedores_catalogo(slug) ON DELETE CASCADE,
  cerebro_id        uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  cerebro_fonte_id  uuid NOT NULL REFERENCES pinguim.cerebro_fontes(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'pendente',  -- 'pendente' | 'executando' | 'ok' | 'falhou'
  itens_gerados     integer DEFAULT 0,
  custo_usd         numeric(10,6) DEFAULT 0,
  duracao_ms        integer DEFAULT 0,
  erro              text,
  iniciado_em       timestamptz,
  concluido_em      timestamptz,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enriquecedor_slug, cerebro_fonte_id)  -- idempotente: cada (enriquecedor, fonte) so roda 1x
);

CREATE INDEX IF NOT EXISTS idx_enriq_exec_pendentes
  ON pinguim.enriquecedores_execucoes (status, criado_em)
  WHERE status IN ('pendente','executando');

COMMENT ON TABLE pinguim.enriquecedores_execucoes IS
  'V3 — Historico de execucoes de enriquecedor sobre cerebro_fonte. UNIQUE garante idempotencia.';

GRANT SELECT ON pinguim.enriquecedores_execucoes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.enriquecedores_execucoes TO service_role;

-- ============================================================
-- 3) Seed dos 3 primeiros enriquecedores
-- ============================================================
INSERT INTO pinguim.enriquecedores_catalogo (slug, nome, descricao, tipo_fonte_aceito, output_tabela, prompt_template, ordem)
VALUES
  (
    'extrator-perfis-chat',
    'Extrator de perfis de alunos em chat WhatsApp',
    'Le mensagens de cada autor nao-admin nas primeiras X msgs e extrai perfil estruturado: nome, instagram, nicho/profissao, dor declarada. Generico — funciona pra qualquer desafio/grupo.',
    'chat_export',
    'pinguim.perfis_alunos_chat',
    $$Voce esta analisando mensagens de um grupo WhatsApp de desafio/curso. Foi te enviado um conjunto de mensagens de UM AUTOR especifico.

Sua tarefa: decidir se esse autor eh ALUNO se apresentando, e se for, extrair perfil estruturado.

Regras:
- Se as mensagens NAO contem apresentacao pessoal (so duvida tecnica, "bom dia", "obrigada", etc), retorne {"eh_apresentacao": false}.
- Se contem apresentacao (nome, profissao, "trabalho com", "sou", instagram), extraia:
  - nome_curto: primeiro nome ou apelido (string)
  - instagram: @arroba se mencionado, null se nao
  - nicho: profissao/area em PT-BR ate 30 chars ("nutricionista", "advogada", "design grafico", "vendas")
  - dor_principal: o que ele declarou querer resolver (string ate 200 chars, null se nao mencionou)
  - eh_admin: true se nome contem "Adm", "Admin", "Bot", "Suporte"

Output: JSON puro, sem markdown. Apenas o JSON.

Autor: {autor}

Mensagens (em ordem):
{mensagens}$$,
    10
  ),
  (
    'extrator-conceitos-aula',
    'Extrator de conceitos/topicos ensinados em transcricao de aula',
    'Le transcricao de aula e extrai topicos principais ensinados + timestamps aproximados. Permite consulta "em que aula foi ensinado X".',
    'transcricao_midia',
    'pinguim.conceitos_aula',
    $$Voce esta analisando transcricao de aula ao vivo de um desafio/curso.

Sua tarefa: extrair lista de TOPICOS PRINCIPAIS ensinados (3-10 itens), cada um com:
- titulo (frase ate 60 chars)
- descricao_curta (2-3 frases)
- minuto_aproximado (numero, baseado em pistas como "vamos ver agora", mudancas de tema)

Output: JSON {"topicos": [...]}.

Transcricao:
{texto}$$,
    20
  )
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prompt_template = EXCLUDED.prompt_template,
  atualizado_em = now();

-- ============================================================
-- 4) Tabela de output do extrator-conceitos-aula (a perfis_alunos_chat ja existe)
-- ============================================================
CREATE TABLE IF NOT EXISTS pinguim.conceitos_aula (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cerebro_id        uuid NOT NULL REFERENCES pinguim.cerebros(id) ON DELETE CASCADE,
  cerebro_fonte_id  uuid REFERENCES pinguim.cerebro_fontes(id) ON DELETE CASCADE,
  titulo            text NOT NULL,
  descricao_curta   text,
  minuto_aproximado integer,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conceitos_cerebro ON pinguim.conceitos_aula (cerebro_id);
CREATE INDEX IF NOT EXISTS idx_conceitos_fonte   ON pinguim.conceitos_aula (cerebro_fonte_id);

GRANT SELECT ON pinguim.conceitos_aula TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pinguim.conceitos_aula TO service_role;

-- ============================================================
-- 5) Adiciona colunas estendidas em perfis_alunos_chat pra o LLM
-- ============================================================
ALTER TABLE pinguim.perfis_alunos_chat
  ADD COLUMN IF NOT EXISTS nome_curto      text,
  ADD COLUMN IF NOT EXISTS nicho           text,
  ADD COLUMN IF NOT EXISTS dor_principal   text,
  ADD COLUMN IF NOT EXISTS eh_admin        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS extraido_via    text DEFAULT 'regex',  -- 'regex' | 'llm'
  ADD COLUMN IF NOT EXISTS extraido_em     timestamptz;

CREATE INDEX IF NOT EXISTS idx_perfis_nicho ON pinguim.perfis_alunos_chat (nicho) WHERE nicho IS NOT NULL;
