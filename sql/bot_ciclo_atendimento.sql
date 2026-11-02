-- ============================================================
-- Ciclo completo também pro bot (André 02/11): aluno começa um assunto → chamado EM ATENDIMENTO com o bot (🤖)
-- → bot resolve = RESOLVIDO · bot passa pra equipe = o MESMO cartão vira ABERTO no nome da pessoa.
-- com_bot = o bot está atendendo (não silencia o bot como um chamado da equipe faria).
-- ============================================================
alter table pinguim.crm_chamado add column if not exists com_bot boolean not null default false;
alter table pinguim.bot_sessao add column if not exists chamado_bot_id bigint;
create index if not exists crm_chamado_com_bot on pinguim.crm_chamado (com_bot) where com_bot;
