-- ========================================================================
-- schema-037-hotmart-curseduca.sql
-- ========================================================================
-- Etapa 2: além de escrever a venda na planilha, liberar acesso de bônus
-- na Escola do Perpétuo (Curseduca grupo 74) pra TODA venda (ProAlt/Elo).
--
-- A venda agora tem DOIS destinos independentes:
--   1. planilha Google  (Etapa 1, já no ar)
--   2. Curseduca        (Etapa 2, esta)
-- Cada um pode falhar sozinho (ex.: token Curseduca expira mas o Sheets ok).
-- Por isso a outbox ganha rastreio SEPARADO por destino: assim o retry
-- refaz só o que faltou, sem duplicar o que já deu certo.
-- ========================================================================

alter table pinguim.hotmart_planilha_outbox
  -- destino planilha: null=pendente, true=feito. (retro-compat: linhas
  -- antigas somem no sucesso, então o default false só afeta novas.)
  add column if not exists planilha_ok    boolean not null default false,
  -- destino curseduca: idem
  add column if not exists curseduca_ok    boolean not null default false,
  -- id do membro criado no curseduca (pra auditoria/idempotência)
  add column if not exists curseduca_member_id  text,
  -- último erro específico do curseduca (separado do ultimo_erro geral)
  add column if not exists curseduca_erro  text;

comment on column pinguim.hotmart_planilha_outbox.planilha_ok is
  'Etapa 1 concluída (linha na planilha). Retry não reescreve se true.';
comment on column pinguim.hotmart_planilha_outbox.curseduca_ok is
  'Etapa 2 concluída (acesso liberado no Curseduca grupo 74). Retry não recria se true.';

-- A linha só é APAGADA da outbox quando planilha_ok AND curseduca_ok.
-- Enquanto um dos dois faltar, o cron */5 reprocessa só o pendente.
