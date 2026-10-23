-- ============================================================
-- Análise de perfil do Instagram no CRM (23/10). Reaproveita o fluxo do SIRIUS ADM sem duplicar nada:
--   pedido e resultado vivem em SIRIUS public.instagram_profile_analysis (projeto ryyingyyzgzsbnkugfpa),
--   o n8n (webhook sirius-adm-analise-ig) gera o PDF e o callback do Sirius grava o link.
-- Aqui fica só a LIGAÇÃO: qual análise é de qual cliente do CRM, quem do time pediu e por onde (crm | bot).
-- ============================================================
create table if not exists pinguim.crm_analise_ig (
  analysis_id uuid primary key,              -- = instagram_profile_analysis.id no Sirius
  cliente_id uuid,                            -- cliente do CRM (pode ser nulo: pedido avulso)
  instagram_handle text not null,
  origem text not null default 'crm' check (origem in ('crm', 'bot')),
  solicitado_por uuid,                        -- usuário do CRM (auth do CRM), nulo quando foi o bot
  solicitado_por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists crm_analise_ig_cliente on pinguim.crm_analise_ig (cliente_id);
alter table pinguim.crm_analise_ig enable row level security;

-- usuário do Sirius que assina os pedidos (requested_by precisa existir em auth.users do Sirius e ser admin)
insert into pinguim.bot_config (chave, valor) values ('analise_ig', '{"sirius_user_id": null}'::jsonb)
on conflict (chave) do nothing;
