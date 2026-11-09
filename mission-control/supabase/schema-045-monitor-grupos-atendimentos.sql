-- ========================================================================
-- schema-045-monitor-grupos-atendimentos.sql
-- ========================================================================
-- Atendimento das perguntas dos grupos (pedido do Andre, 09/11/2026).
-- O alerta por produto (schema-043) continua igual. Em paralelo:
--
--   1. pergunta de aluno flagada (pedido_ajuda / reclamacao / chateado_risco,
--      ou resposta_adm com "?") abre um ATENDIMENTO. Mensagens seguidas do
--      mesmo aluno no mesmo grupo em até 30 min entram no mesmo atendimento.
--   2. ADM responde → atendimento fecha. "Responder" = ADM dá reply citando
--      mensagem do aluno OU marca o aluno com @. (Medido em 30 dias: mensagem
--      de ADM sem reply/@ quase nunca é resposta àquela pergunta — não conta.)
--      Mensagens do próprio número da instância (fromMe) contam como ADM.
--   3. fechou → posta pergunta + resposta + tempo no destino de atendimento
--      (matéria-prima da base de FAQ / bot futuro).
--   4. resumo diário (edge monitor-atendimento-resumo, 8h BRT): perguntas do
--      dia anterior, respondidas, pendentes (lista), tempo médio/mediano.
--
-- Destino: monitor_atendimento_config. canal_id NULL = DM pros dm_user_ids
-- (fase de teste: só Codina). Trocar pra tag = UPDATE, sem deploy.
-- ========================================================================

-- id da mensagem citada (reply) — liga a resposta do ADM à pergunta exata
alter table pinguim.monitor_grupos_mensagens
  add column if not exists respondeu_msg_id text;

create table if not exists pinguim.monitor_atendimentos (
  id                 uuid primary key default gen_random_uuid(),
  grupo_jid          text not null,
  grupo_nome         text,
  aluno_jid          text not null,
  aluno_nome         text,
  aluno_telefone     text,
  categoria          text not null,
  pergunta_texto     text not null,               -- msgs do aluno concatenadas
  pergunta_msg_ids   jsonb not null default '[]', -- message_id de cada msg do atendimento
  perguntado_em      timestamptz not null,        -- 1ª msg
  ultima_msg_em      timestamptz not null,
  status             text not null default 'pendente' check (status in ('pendente','respondida')),
  adm_jid            text,
  adm_nome           text,
  resposta_texto     text,
  resposta_msg_id    text,
  respondido_em      timestamptz,
  tempo_resposta_seg int,
  como_respondeu     text check (como_respondeu in ('reply','mencao')),
  postado_em         timestamptz,                 -- Q&A enviado ao Discord
  postar_erro        text,
  criado_em          timestamptz not null default now()
);
comment on table pinguim.monitor_atendimentos is
  'Perguntas de alunos nos grupos e a resposta do ADM (reply/@). Base do resumo diário e da futura FAQ. Edge: monitor-grupos-webhook + monitor-atendimento-resumo.';
create index if not exists idx_monitor_atend_aberto
  on pinguim.monitor_atendimentos (grupo_jid, aluno_jid, ultima_msg_em desc) where status = 'pendente';
create index if not exists idx_monitor_atend_data
  on pinguim.monitor_atendimentos (perguntado_em desc);
create index if not exists idx_monitor_atend_msgids
  on pinguim.monitor_atendimentos using gin (pergunta_msg_ids);
alter table pinguim.monitor_atendimentos enable row level security;

create table if not exists pinguim.monitor_atendimento_config (
  id          int primary key default 1 check (id = 1),
  ativo       boolean not null default true,
  canal_id    text,                                         -- tag do Discord; NULL = DM
  dm_user_ids text[] not null default '{1077338884981133413}', -- Codina (teste)
  resumo_ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
comment on table pinguim.monitor_atendimento_config is
  'Destino do Q&A respondido e do resumo diário. Virar tag = update set canal_id = ''<id>''.';
alter table pinguim.monitor_atendimento_config enable row level security;
insert into pinguim.monitor_atendimento_config (id) values (1) on conflict do nothing;

-- resumo diário 8h BRT (11h UTC)
select cron.schedule('monitor-atendimento-resumo', '0 11 * * *',
  $$select pinguim.disparar_edge_function('monitor-atendimento-resumo')$$);
