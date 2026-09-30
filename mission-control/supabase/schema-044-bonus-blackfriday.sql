-- ========================================================================
-- schema-044-bonus-blackfriday.sql
-- ========================================================================
-- Operação Black Friday: UMA venda Hotmart numa oferta-bônus libera acesso,
-- de presente, em QUATRO programas nossos:
--   1. ProAlt      (Supabase vdrlvflludyqkyhfoiwb)  → plano "Completo"
--   2. Elo         (Supabase hqyyxtyvfjnkpjtcydgj)  → role "aluno", plano "Elo"
--   3. Sirius      (Supabase ryyingyyzgzsbnkugfpa)  → plano cheio + 10 flags access_*
--   4. Perpétuo    (Curseduca grupo 74)             → membro POST /members
--
-- Mesma arquitetura, testada, do hotmart-planilha-worker (schema-036/037):
-- OUTBOX EFÊMERO + rastreio SEPARADO por destino + cron de retry */5.
--
-- Fluxo (edge bonus-blackfriday-worker):
--   Hotmart dispara webhook → edge recebe
--     1. (opcional) valida hottok
--     2. INSERT nesta tabela (status 'pendente') — NADA se perde a partir daqui
--     3. tenta liberar nos 4 destinos (caminho feliz). Cada destino idempotente
--        por email (reenvio de webhook / retry NÃO duplica). Cada um marca seu
--        próprio flag *_ok antes de tentar o próximo.
--     4. todos os 4 ok → status 'concluido' (NÃO apaga — vira auditoria).
--        Faltou algum → status 'erro', fica pro cron reprocessar só o que faltou.
--
-- Diferente do planilha-outbox, esta tabela é AUDITORIA PERMANENTE além de
-- outbox: mesmo depois de tudo liberado a linha PERMANECE (status 'concluido')
-- pra você ver no CRM "quem ganhou o quê". Só linhas 100% concluídas param de
-- ser reprocessadas; nada é apagado. (Decisão André 2026-09-29: registrar tudo.)
-- ========================================================================

create table if not exists pinguim.bonus_bf_outbox (
  id             uuid primary key default gen_random_uuid(),

  -- identificação da venda (pra auditoria e busca no CRM)
  oferta_id      text,                    -- data.purchase.offer.code do webhook
  transacao      text,                    -- id da transação Hotmart (idempotência de linha)
  comprador_nome text,
  comprador_email text,
  comprador_tel  text,
  comprador_doc  text,

  -- payload cru da Hotmart, pra reprocessar e auditar
  payload        jsonb not null,

  -- pendente=novo | processando=claim em voo | concluido=4 destinos ok |
  -- erro=falha parcial reprocessável | dead=terminal (lixo/captura ou estourou
  -- MAX_TENTATIVAS; fora do índice de retry, não gira mais)
  status         text not null default 'pendente'
                 check (status in ('pendente', 'processando', 'concluido', 'erro', 'dead')),

  ultimo_erro    text,
  tentativas     int not null default 0,

  -- ---- rastreio SEPARADO por destino (o coração do retry parcial) ----
  -- null/false = ainda não feito; true = liberado. O retry só refaz o que
  -- está false. Assim ProAlt já liberado nunca é recriado quando a Sirius cai.
  proalt_ok      boolean not null default false,
  elo_ok         boolean not null default false,
  sirius_ok      boolean not null default false,
  perpetuo_ok    boolean not null default false,

  -- id/erro por destino (auditoria + diagnóstico sem cruzar destinos)
  proalt_user_id   text,
  proalt_erro      text,
  elo_user_id      text,
  elo_erro         text,
  sirius_user_id   text,
  sirius_erro      text,
  perpetuo_member_id text,
  perpetuo_erro    text,

  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table pinguim.bonus_bf_outbox is
  'Bônus Black Friday: 1 venda Hotmart → acesso em ProAlt+Elo+Sirius+Perpétuo. '
  'Outbox + auditoria permanente (linha fica como concluido). '
  'Rastreio por destino: retry refaz só o que falhou. Edge: bonus-blackfriday-worker.';

comment on column pinguim.bonus_bf_outbox.proalt_ok is
  'ProAlt liberado (plano Completo). Retry não recria se true.';
comment on column pinguim.bonus_bf_outbox.elo_ok is
  'Elo liberado (aluno). Retry não recria se true.';
comment on column pinguim.bonus_bf_outbox.sirius_ok is
  'Sirius liberado (plano cheio + flags). Retry não recria se true.';
comment on column pinguim.bonus_bf_outbox.perpetuo_ok is
  'Perpétuo/Curseduca grupo 74 liberado. Retry não recria se true.';

-- Índice pro cron pegar só o que falta (pendente/erro/processando-preso).
-- Linhas 'concluido' (a maioria, no regime normal) ficam fora do índice → barato.
create index if not exists idx_bonus_bf_pendente
  on pinguim.bonus_bf_outbox (status, criado_em)
  where status in ('pendente', 'erro', 'processando');

-- Idempotência de LINHA por transação: reenvio do MESMO webhook não cria
-- 2ª linha (o UPSERT na edge usa isto). transacao pode ser null em testes,
-- por isso índice parcial só onde não-nulo.
create unique index if not exists uq_bonus_bf_transacao
  on pinguim.bonus_bf_outbox (transacao)
  where transacao is not null;

-- Squad Cyber: RLS ligada, sem policies — só service_role acessa.
alter table pinguim.bonus_bf_outbox enable row level security;

-- ------------------------------------------------------------------------
-- CLAIM ATÔMICO — impede que webhook e cron (ou dois ticks do cron) processem
-- a MESMA linha ao mesmo tempo, o que dispararia liberação duplicada nos 4
-- sistemas. Um único caller "ganha" a linha; os outros recebem 0 rows e pulam.
--
-- Reivindica a linha marcando status='processando' SÓ se ela estiver
-- 'pendente'/'erro' OU presa em 'processando' há mais de p_stale_seg (watchdog:
-- se um processo morreu no meio, a linha volta a ser reivindicável). O UPDATE
-- condicional é atômico no Postgres — dois callers concorrentes, só um casa a
-- cláusula WHERE e recebe a linha de volta.
-- ------------------------------------------------------------------------
create or replace function pinguim.bonus_bf_claim(p_id uuid, p_stale_seg int default 120)
returns setof pinguim.bonus_bf_outbox
language sql
as $$
  update pinguim.bonus_bf_outbox
     set status = 'processando', atualizado_em = now()
   where id = p_id
     and (
       status in ('pendente', 'erro')
       or (status = 'processando' and atualizado_em < now() - make_interval(secs => p_stale_seg))
     )
  returning *;
$$;

comment on function pinguim.bonus_bf_claim(uuid, int) is
  'Reivindica atomicamente uma linha da outbox pra processamento (status→processando). '
  'Devolve a linha se ganhou o claim, nada se outro processo já a tem. Watchdog reivindica '
  'linhas presas em processando há mais de p_stale_seg (default 120s).';

-- ------------------------------------------------------------------------
-- Cron de retry: a cada 5 min reprocessa 'pendente'/'erro' que sobraram
-- (algum Supabase fora do ar, token Curseduca expirado, rate limit...).
-- No regime normal a edge já concluiu tudo no webhook → cron não faz nada.
--
-- disparar_edge_function só manda body {} → a edge distingue os modos pelo
-- FORMATO do body (mesma convenção do hotmart-planilha-worker):
--   • body vazio {}                → modo RETRY  (reprocessa a outbox)
--   • body com venda (buyer/...)   → modo WEBHOOK (venda nova)
--   • body não reconhecido         → modo CAPTURA (teste Hotmart, grava cru)
-- ------------------------------------------------------------------------
select cron.schedule(
  'bonus-bf-retry',
  '*/5 * * * *',
  $$select pinguim.disparar_edge_function('bonus-blackfriday-worker')$$
);
