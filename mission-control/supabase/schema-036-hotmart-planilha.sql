-- ========================================================================
-- schema-036-hotmart-planilha.sql
-- ========================================================================
-- Rotina: venda Hotmart (ProAlt, depois Elo) → linha na planilha Google.
--
-- Fluxo (edge hotmart-planilha-worker):
--   Hotmart dispara webhook  →  edge recebe
--     1. (opcional) valida hottok
--     2. INSERT nesta tabela (outbox) com status 'pendente'
--     3. tenta escrever na planilha:
--          - lê nomes de TODAS as abas
--          - acha a aba cujo nome contém o ID da oferta (após um '-')
--          - achou   → append da linha  → status 'inserido' → DELETE (limpa)
--          - não achou → append na aba INCONSISTENCIA (+ coluna do ID que
--            não bateu) → status 'inserido' → DELETE
--     4. se a escrita falhar → linha FICA aqui como 'pendente'; o cron de
--        retry (a cada 5 min) reprocessa. Nada de venda se perde.
--
-- A tabela é EFÊMERA por design: no regime normal fica vazia. Só tem linha
-- quando algo está em trânsito ou falhou. Auto-limpa no sucesso.
-- ========================================================================

create table if not exists pinguim.hotmart_planilha_outbox (
  id             uuid primary key default gen_random_uuid(),

  -- de qual produto veio (pra escalar ProAlt → Elo sem mexer no código)
  produto        text not null default 'proalt',   -- 'proalt' | 'elo' | ...

  -- ID da oferta que veio no webhook (é o que casa com o final do nome da aba)
  oferta_id      text,

  -- planilha destino (resolvida por produto/oferta na config da edge)
  spreadsheet_id text,

  -- payload cru da Hotmart, pra reprocessar e pra auditoria enquanto pendente
  payload        jsonb not null,

  -- linha já montada pro append (ordem = colunas da planilha). Preenchida
  -- na 1ª tentativa; o retry reusa sem remontar.
  linha          jsonb,

  status         text not null default 'pendente'
                 check (status in ('pendente', 'inserido', 'inconsistencia', 'erro')),

  -- pra debug quando algo falha (última mensagem de erro)
  ultimo_erro    text,
  tentativas     int not null default 0,

  -- se caiu em INCONSISTENCIA, qual aba/ID
  aba_usada      text,

  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table pinguim.hotmart_planilha_outbox is
  'Outbox efêmero: venda Hotmart → linha na planilha. Auto-limpa no sucesso; '
  'retém pendentes/erros pro retry. Edge: hotmart-planilha-worker.';

-- Índice pro cron pegar rapidamente o que falta processar.
create index if not exists idx_hotmart_outbox_pendente
  on pinguim.hotmart_planilha_outbox (status, criado_em)
  where status in ('pendente', 'erro');

-- Squad Cyber: RLS ligada, sem policies — só service_role acessa.
alter table pinguim.hotmart_planilha_outbox enable row level security;

-- ------------------------------------------------------------------------
-- Cron de retry: a cada 5 min reprocessa os 'pendente'/'erro' que sobraram
-- (Google fora do ar no instante do webhook, rate limit, etc). No regime
-- normal não faz nada — a própria edge já limpou tudo na hora do webhook.
--
-- OBS: disparar_edge_function só passa body {} (não repassa argumentos).
-- Por isso a edge distingue os modos pelo FORMATO do body, não por flag:
--   • body vazio / sem campos de venda  → modo RETRY (reprocessa a outbox)
--   • body com payload da Hotmart       → modo WEBHOOK (venda nova)
-- ------------------------------------------------------------------------
select cron.schedule(
  'hotmart-planilha-retry',
  '*/5 * * * *',
  $$select pinguim.disparar_edge_function('hotmart-planilha-worker')$$
);
