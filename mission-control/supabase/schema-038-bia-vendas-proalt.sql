-- ========================================================================
-- schema-038-bia-vendas-proalt.sql
-- ========================================================================
-- BIA — agente de vendas ProAlt no WhatsApp (API oficial via Unichat).
-- Doc completo: docs/AGENTE-BIA-VENDAS-PROALT.md
--
-- Fluxo:
--   template Marketing (3 botões) → lead clica "Me conta mais" → fluxo
--   Unichat chama edge bia-vendas-proalt → Bia conversa (memória aqui).
--   Motor de follow-up (edge bia-followup-worker, cron */5): lead sumiu
--   >20min → retomada; sem resposta até dia seguinte → última msg → encerra.
--
-- 4 tabelas, todas no schema pinguim, RLS ligada sem policies
-- (só service_role — padrão Squad Cyber).
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. LEADS — um por telefone. Fonte de verdade do opt-out.
-- ------------------------------------------------------------------------
create table if not exists pinguim.bia_leads (
  id             uuid primary key default gen_random_uuid(),
  telefone       text not null unique,        -- normalizado E.164 (ex.: 5511999998888)
  nome           text,
  email          text,                        -- pro motor de atribuição casar com a venda
                                              -- Hotmart quando o telefone do checkout divergir
  origem         text not null default 'desafio-low-ticket',  -- de onde veio (edição do desafio, grupo)

  -- ciclo de vida do lead na campanha
  estado         text not null default 'novo'
                 check (estado in (
                   'novo',              -- importado, template ainda não enviado
                   'template_enviado',  -- disparo feito, sem clique ainda
                   'conversando',       -- clicou "Me conta mais", Bia atendendo
                   'aguardando_retorno',-- pediu "Me chama mais tarde"
                   'humano',            -- pediu humano — Bia NUNCA mais responde
                   'comprou',           -- venda confirmada nesta campanha
                   'comprou_antes',     -- disse que já era aluno
                   'optout',            -- Parar avisos (botão ou texto livre)
                   'encerrado'          -- follow-ups esgotados sem resposta
                 )),

  optout         boolean not null default false,  -- redundante com estado, mas é o
                                                  -- check barato que TODO envio faz antes
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table pinguim.bia_leads is
  'Leads da campanha Bia/ProAlt (1 por telefone). optout=true bloqueia '
  'qualquer envio, sem exceção. Edge: bia-vendas-proalt.';

create index if not exists idx_bia_leads_estado on pinguim.bia_leads (estado);
alter table pinguim.bia_leads enable row level security;

-- ------------------------------------------------------------------------
-- 2. CONVERSAS — sessão de venda. É o que o motor de follow-up vigia.
-- ------------------------------------------------------------------------
create table if not exists pinguim.bia_conversas (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references pinguim.bia_leads(id) on delete cascade,

  aberta             boolean not null default true,

  -- etapa do funil da Metodologia Bia (o prompt lê e atualiza)
  etapa              text not null default 'reconexao'
                     check (etapa in ('reconexao','diagnostico','oferta',
                                      'prova_social','objecoes','fechamento','pos')),

  -- relógios do motor de follow-up
  ultima_msg_lead_em timestamptz,
  ultima_msg_bia_em  timestamptz,
  followups_enviados int not null default 0,   -- máx 2 (20min + dia seguinte)

  resultado          text
                     check (resultado in ('venda','perdido','humano',
                                          'optout','sem_resposta') or resultado is null),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

comment on table pinguim.bia_conversas is
  'Sessões de venda da Bia. O worker de follow-up varre aberta=true com '
  'ultima_msg_lead_em antiga. followups_enviados trava em 2.';

-- Índice pro worker: conversas abertas ordenadas por silêncio do lead.
create index if not exists idx_bia_conversas_followup
  on pinguim.bia_conversas (ultima_msg_lead_em)
  where aberta = true;

create index if not exists idx_bia_conversas_lead on pinguim.bia_conversas (lead_id);
alter table pinguim.bia_conversas enable row level security;

-- ------------------------------------------------------------------------
-- 3. MENSAGENS — memória bruta. A edge carrega as últimas N pro prompt.
-- ------------------------------------------------------------------------
create table if not exists pinguim.bia_mensagens (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references pinguim.bia_conversas(id) on delete cascade,
  papel        text not null check (papel in ('lead','bia','sistema')),
                 -- 'sistema' = eventos (clicou botão X, follow-up enviado,
                 -- handoff humano) — entram no histórico pro LLM ter contexto
  conteudo     text not null,
  criado_em    timestamptz not null default now()
);

comment on table pinguim.bia_mensagens is
  'Histórico integral das conversas da Bia (memória do agente + auditoria).';

create index if not exists idx_bia_mensagens_conversa
  on pinguim.bia_mensagens (conversa_id, criado_em);
alter table pinguim.bia_mensagens enable row level security;

-- ------------------------------------------------------------------------
-- 4. FOLLOW-UPS — agenda explícita (o "Me chama mais tarde" e a última do
--    dia seguinte). A retomada de 20min o worker detecta direto pelo
--    relógio da conversa, sem precisar de linha aqui.
-- ------------------------------------------------------------------------
create table if not exists pinguim.bia_followups (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references pinguim.bia_leads(id) on delete cascade,
  conversa_id   uuid references pinguim.bia_conversas(id) on delete cascade,
  tipo          text not null
                check (tipo in ('chama_mais_tarde',  -- botão do template (+2~3h)
                                'dia_seguinte')),    -- última tentativa
  agendado_para timestamptz not null,
  status        text not null default 'pendente'
                check (status in ('pendente','enviado','cancelado')),
                -- cancela se o lead voltar a falar antes / optout / humano
  criado_em     timestamptz not null default now(),
  enviado_em    timestamptz
);

comment on table pinguim.bia_followups is
  'Agenda de follow-ups da Bia. Worker cron */5 processa pendente com '
  'agendado_para <= now(), SEMPRE re-checando bia_leads.optout antes.';

create index if not exists idx_bia_followups_pendente
  on pinguim.bia_followups (agendado_para)
  where status = 'pendente';
alter table pinguim.bia_followups enable row level security;

-- ------------------------------------------------------------------------
-- 5. CONFIG DA OFERTA — fatos críticos que a Bia NUNCA busca via RAG.
--    Editável sem redeploy (preço mudou? UPDATE aqui e pronto).
-- ------------------------------------------------------------------------
create table if not exists pinguim.bia_config (
  chave         text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now()
);

comment on table pinguim.bia_config is
  'Fatos da oferta ProAlt que entram FIXOS no prompt da Bia (preço, garantia, '
  'checkout, contatos). Nunca via RAG. Editar aqui reflete na próxima mensagem.';

alter table pinguim.bia_config enable row level security;

insert into pinguim.bia_config (chave, valor) values
  ('preco_avista',      'R$ 2.500'),
  ('preco_parcelado',   '12x de R$ 258 no cartão'),
  ('preco_ancora',      'R$ 6.997'),
  ('garantia_dias',     '7'),
  ('checkout_padrao',   'https://pay.hotmart.com/Y107116867Y?off=xksngssn&sck=bia-agente-ia&src=bia-agente'),
  ('checkout_boleto',   'https://pay.hotmart.com/Y107116867Y?off=g1eac87q&sck=bia-agente&src=bia-agente'),
  ('regra_boleto',      'SO manda o checkout boleto se o cliente PEDIR boleto. O foco é sempre o checkout padrão (cartão/Pix).'),
  ('bonus_lista',       'Bônus #1 Escola do Perpétuo (acesso vitalício, valor de R$ 3.000) · Bônus #2 Funil de Quiz (aula com Micha Menezes) · Bônus #3 Desafio de Conteúdo Lo-Fi (gravação completa) · Bônus iniciante: 5 Estratégias para fazer de 2 a 10 mil em 30 dias · Bônus avançado: Protocolo 500K'),
  ('carta_na_manga',    'Consultoria individual com estrategista do time (plano de execução personalizado). REGRAS: só no fechamento com lead hesitando, 1x por lead, nunca de cara, nunca em lista de bônus, nunca em follow-up frio.'),
  ('janela_condicao',   'PENDENTE'),
  ('contato_karen',     'PENDENTE'),
  ('contato_suporte',   'PENDENTE')
on conflict (chave) do nothing;

-- ------------------------------------------------------------------------
-- Cron do worker de follow-up — APLICAR SÓ DEPOIS do deploy da edge
-- bia-followup-worker (Fase 3), senão o job chama endpoint inexistente.
-- Padrão idêntico aos jobs 40/42. ⚠️ argumento do job SEMPRE entre aspas.
-- ------------------------------------------------------------------------
-- select cron.schedule(
--   'bia-followup-worker',
--   '*/5 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/bia-followup-worker',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select pinguim.get_chave('SERVICE_ROLE_KEY'))
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
