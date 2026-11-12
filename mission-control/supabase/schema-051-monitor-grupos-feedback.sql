-- ========================================================================
-- schema-051-monitor-grupos-feedback.sql
-- ========================================================================
-- Feedback dos alunos sobre a EMPRESA nos grupos (pedido Andre 12/11/2026):
-- reclamação, crítica, sugestão, elogio → post na TAG do produto
-- (monitor_grupos.discord_canal_id), com título próprio ("💡 SUGESTÃO DE
-- ALUNO"…), separado do pedido de ajuda. Objetivo: melhorar processo interno.
--
-- Duas etapas (calibrado em 385 msgs reais de 3 dias):
--   1. gpt-5.4-mini em toda msg de aluno (>= 12 caracteres) com contexto
--      (3 msgs anteriores + a quem responde: colega/ADM/ninguém) → candidatos
--   2. gpt-5.5 confirma com checklist (alvo é a empresa? agradecimento? piada?)
--   Resultado: 65 → 23 → 8 confirmados, 8/8 certos. ~3/dia nas tags.
--   Feedback entre colegas (página/copy/criativo do outro), Meta/Instagram/
--   Hotmart do próprio aluno, "top, obrigado" → descartados.
--
-- Msg que já virou alerta (pedido de ajuda/reclamação por regex) não posta de
-- novo; mesmo autor+grupo+tipo em 30 min = 1 post. Tudo fica gravado.
-- Desligar posts: update monitor_atendimento_config set feedback_ativo=false.
-- ========================================================================

alter table pinguim.monitor_grupos_mensagens
  add column if not exists feedback_tipo text check (feedback_tipo in ('reclamacao','critica','sugestao','elogio')),
  add column if not exists feedback_sobre text,
  add column if not exists feedback_resumo text,
  add column if not exists feedback_postado_em timestamptz;

create index if not exists idx_monitor_msgs_feedback
  on pinguim.monitor_grupos_mensagens (feedback_tipo, criado_em desc) where feedback_tipo is not null;

alter table pinguim.monitor_atendimento_config
  add column if not exists feedback_ativo boolean not null default true;
