-- Pedidos de reembolso feitos PELO CRM (gestor/suporte) via API Hotmart.
-- Cada clique em "Solicitar reembolso" vira 1 linha: quem pediu, motivo, o que a Hotmart respondeu.
-- O status da compra em crm_compra vira 'refunded' sozinho pelo crm-sync-vendas (~1min) quando a Hotmart efetiva.
create table if not exists pinguim.crm_reembolso_pedido (
  id bigint generated always as identity primary key,
  cliente_id uuid references pinguim.crm_cliente(cliente_id),
  transaction_code text not null,
  produto text,
  valor numeric,
  motivo text not null,
  solicitado_por uuid,
  solicitado_por_nome text,
  status text not null default 'enviado' check (status in ('enviado','falhou')),
  http_status int,
  resposta jsonb,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists crm_reembolso_pedido_cliente_idx on pinguim.crm_reembolso_pedido(cliente_id);
create index if not exists crm_reembolso_pedido_tx_idx on pinguim.crm_reembolso_pedido(transaction_code);
create index if not exists crm_reembolso_pedido_criado_idx on pinguim.crm_reembolso_pedido(criado_em desc);

-- RLS ligado e sem policy: só o service role (API do CRM) lê/escreve. Front nunca acessa direto.
alter table pinguim.crm_reembolso_pedido enable row level security;
