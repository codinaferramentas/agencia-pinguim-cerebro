-- ========================================================================
-- schema-041-monitor-grupos-v2.sql
-- ========================================================================
-- Duas regras novas no monitor de grupos (pedido do Andre, 26/08/2026):
--
--  R1 — "?" sem direção: mensagem de aluno com interrogação que NÃO é
--       resposta a ninguém e NÃO marca ninguém → pedido_ajuda.
--       (URLs são removidas antes do teste — todo link tem "?".)
--  R2 — resposta ao ADM: aluno (não-ADM) respondendo mensagem de um ADM
--       do grupo → categoria nova 'resposta_adm', sempre alerta.
--
-- Ordem de decisão na edge: padrões de conteúdo > R2 > R1.
-- Volume medido no histórico real (146 dias): R1 ~1,5/dia, R2 ~1,3/dia.
-- ========================================================================

-- categoria nova
alter table pinguim.monitor_grupos_mensagens
  drop constraint if exists monitor_grupos_mensagens_categoria_check;
alter table pinguim.monitor_grupos_mensagens
  add constraint monitor_grupos_mensagens_categoria_check
  check (categoria in ('pedido_ajuda','reclamacao','chateado_risco','resposta_adm'));

-- contexto da conversa (pra análise futura e pras regras)
alter table pinguim.monitor_grupos_mensagens
  add column if not exists respondeu_jid text;          -- autor da msg citada (null = não é resposta)
alter table pinguim.monitor_grupos_mensagens
  add column if not exists mencionados jsonb not null default '[]';

comment on column pinguim.monitor_grupos_mensagens.respondeu_jid is
  'JID do autor da mensagem citada (reply). Se for ADM do grupo → categoria resposta_adm.';
