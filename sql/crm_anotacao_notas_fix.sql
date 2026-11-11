-- Notas e follow-ups do aluno nunca gravavam (André 11/11/2026: "a Fernanda foi criar uma nota e deu erro").
-- A API (app/api/cliente/[id]/notas) grava tipo='nota' e origem='crm', mas a tabela só aceitava
-- tipo insight/nps/alerta/livre e origem carga_inicial/painel.
-- A tabela estava vazia (nenhuma nota salva até hoje), então nada se perde.

alter table pinguim.crm_anotacao drop constraint if exists crm_anotacao_tipo_check;
alter table pinguim.crm_anotacao add constraint crm_anotacao_tipo_check check (tipo = any (array['nota', 'insight', 'nps', 'alerta', 'livre']));

alter table pinguim.crm_anotacao drop constraint if exists crm_anotacao_origem_check;
alter table pinguim.crm_anotacao add constraint crm_anotacao_origem_check check (origem = any (array['crm', 'painel', 'carga_inicial']));
