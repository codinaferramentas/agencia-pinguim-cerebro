-- ========================================================================
-- schema-044-bonus-blackfriday.sql
-- ========================================================================
-- Combo Black (Hotmart produto 8729703): cada venda aprovada do combo libera,
-- de presente, acesso em TRÊS programas:
--   1. Escola do Perpétuo (Curseduca turma 74)  → validade 10 anos
--   2. Sirius (Supabase ryyingyyzgzsbnkugfpa)   → plano CICLO + 12 flags, 2 anos
--   3. Elo    (Supabase hqyyxtyvfjnkpjtcydgj)   → plano Elo, vigência 2 anos
--
-- Por que NÃO é webhook: a Hotmart não deixa cadastrar webhook pra combo (os
-- webhooks são por produto isolado). Mas o Dash já recebe TODA venda Hotmart
-- da conta em tempo real (hotmart_transactions). Então a edge
-- bonus-blackfriday-worker roda a cada 1 min, lê do Dash as vendas aprovadas
-- do combo desde a última marca d'água e libera.
--
-- Fluxo (a cada minuto):
--   1. lê bonus_bf_estado.ultima_marca
--   2. busca no Dash: produto do combo + status approved/completed +
--      updated_at >= marca - 15 min (sobreposição: venda gravada atrasada não escapa)
--   3. INSERT na outbox (on conflict transacao do nothing) — NADA se perde
--   4. avança a marca
--   5. pra cada linha pendente: claim atômico → libera os 3 destinos →
--      status 'concluido' (fica como auditoria) ou 'erro' (próximo minuto refaz
--      só o destino que faltou)
--
-- Regra de ouro: NUNCA encurtar validade nem rebaixar plano de quem já é aluno.
-- ========================================================================

create table if not exists pinguim.bonus_bf_outbox (
  id               uuid primary key default gen_random_uuid(),

  -- venda (vem do Dash)
  transacao        text not null unique,      -- transaction_code Hotmart (HP...)
  produto_hotmart  bigint,                    -- hotmart_product_id que casou
  oferta_id        text,
  dash_status      text,                      -- approved / completed
  data_compra      timestamptz,
  comprador_nome   text,
  comprador_email  text,
  comprador_tel    text,
  comprador_doc    text,
  payload          jsonb not null,            -- linha crua do Dash (auditoria/reprocesso)

  -- pendente=nova | processando=claim em voo | concluido=3 destinos ok |
  -- erro=falta destino (reprocessa) | dead=estourou tentativas (fora do retry)
  status           text not null default 'pendente'
                   check (status in ('pendente', 'processando', 'concluido', 'erro', 'dead')),
  ultimo_erro      text,
  tentativas       int not null default 0,

  -- rastreio SEPARADO por destino: o retry só refaz o que está false.
  -- *_resultado: criado | adicionado | estendido | mantido (já tinha ≥ o bônus)
  perpetuo_ok        boolean not null default false,
  perpetuo_member_id text,
  perpetuo_resultado text,
  perpetuo_erro      text,

  sirius_ok          boolean not null default false,
  sirius_user_id     text,
  sirius_resultado   text,
  sirius_erro        text,

  elo_ok             boolean not null default false,
  elo_user_id        text,
  elo_resultado      text,
  elo_erro           text,

  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on table pinguim.bonus_bf_outbox is
  'Combo Black (Hotmart 8729703): venda aprovada lida do Dash → acesso Escola 10a + Sirius 2a + Elo 2a. '
  'Outbox + auditoria permanente. Edge: bonus-blackfriday-worker (cron 1 min).';

create index if not exists idx_bonus_bf_pendente
  on pinguim.bonus_bf_outbox (status, criado_em)
  where status in ('pendente', 'erro', 'processando');

create index if not exists idx_bonus_bf_email
  on pinguim.bonus_bf_outbox (comprador_email);

-- Squad Cyber: RLS ligada, sem policies — só service_role acessa.
alter table pinguim.bonus_bf_outbox enable row level security;

-- ------------------------------------------------------------------------
-- Marca d'água da leitura do Dash (1 linha só).
-- ------------------------------------------------------------------------
create table if not exists pinguim.bonus_bf_estado (
  id             int primary key default 1 check (id = 1),
  ultima_marca   timestamptz not null default '2026-10-01T00:00:00Z',
  ultima_rodada  timestamptz,
  itens_ultima   int,
  atualizado_em  timestamptz not null default now()
);
insert into pinguim.bonus_bf_estado (id) values (1) on conflict (id) do nothing;
alter table pinguim.bonus_bf_estado enable row level security;

-- ------------------------------------------------------------------------
-- CLAIM ATÔMICO — dois ticks do cron (ou um tick lento) nunca processam a
-- mesma linha ao mesmo tempo. O UPDATE condicional é atômico: só um caller
-- casa o WHERE e recebe a linha. Linha presa em 'processando' há mais de
-- p_stale_seg volta a ser reivindicável (processo morreu no meio).
-- ------------------------------------------------------------------------
create or replace function pinguim.bonus_bf_claim(p_id uuid, p_stale_seg int default 180)
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

-- ------------------------------------------------------------------------
-- Cron: a cada 1 min (mesma cadência do crm-sync-vendas, que lê o mesmo Dash).
-- cron.schedule com o mesmo nome substitui o job (re-rodar este arquivo é seguro).
-- ------------------------------------------------------------------------
select cron.schedule(
  'bonus-bf-combo',
  '* * * * *',
  $$select pinguim.disparar_edge_function('bonus-blackfriday-worker')$$
);

-- ------------------------------------------------------------------------
-- Entrada 2 (2026-10-15): webhook da Hotmart. A Hotmart confirmou que dá pra
-- cadastrar webhook no combo. O webhook libera na hora; a leitura do Dash
-- continua como rede de segurança. As duas entradas caem na MESMA outbox
-- (transacao única) → nunca libera em dobro.
--
-- Log de TODA chamada recebida (diagnóstico): mostra como a Hotmart manda o
-- combo (id do combo vs produtos de dentro) e guarda o hottok recebido até
-- ele ser gravado no cofre como HOTMART_HOTTOK_COMBO_BF. Só service_role lê.
-- ------------------------------------------------------------------------
create table if not exists pinguim.bonus_bf_webhook_log (
  id              uuid primary key default gen_random_uuid(),
  recebido_em     timestamptz not null default now(),
  evento          text,
  produto_id      bigint,
  produto_nome    text,
  oferta          text,
  transacao       text,
  comprador_email text,
  hottok_ok       boolean,          -- null = cofre ainda sem hottok (modo captura)
  hottok_recebido text,             -- guardado só enquanto o cofre não tem o hottok
  acao            text,             -- enfileirado | ignorado:<motivo> | captura | recusado
  payload         jsonb not null
);
create index if not exists idx_bonus_bf_webhook_log_recebido on pinguim.bonus_bf_webhook_log (recebido_em desc);
alter table pinguim.bonus_bf_webhook_log enable row level security;
