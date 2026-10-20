-- Bot v2 (2026-10-20, decisões do André):
-- • acesso SEMPRE pede o email (mesmo com telefone conhecido)
-- • tem conta → senha volta pra PADRÃO do app (não mexe em plano)
-- • não tem conta → bot CRIA (Sirius: aluno Elo = Ciclo 997; demais = "Sirius acesso por bot") e manda pra AUDITORIA
-- • áudio/foto/vídeo nunca acionam o bot

alter table pinguim.crm_chamado
  add column if not exists auditoria_pendente boolean not null default false,
  add column if not exists auditado_por_nome text,
  add column if not exists auditado_em timestamptz;
create index if not exists crm_chamado_auditoria_idx on pinguim.crm_chamado(auditoria_pendente) where auditoria_pendente;

insert into pinguim.bot_config (chave, valor) values
  ('senhas_padrao', '{"proalt": "mudar@1234", "elo": "mudar@1234", "sirius": "mudar@1234"}'),
  ('sirius_planos', '{"aluno_elo": "6c29e3f5-8e66-4324-88dd-39ad1c486a70", "aluno_elo_nome": "Ciclo 997", "padrao": "95630ffa-02b8-4260-87a3-4bec4c265c38", "padrao_nome": "Sirius acesso por bot"}')
on conflict (chave) do nothing;

insert into pinguim.bot_template (slug, descricao, corpo) values
  ('pede_email_acesso', 'Acesso: sempre pede o email da compra',
   'Pra liberar seu acesso ao {{app}}, me manda em uma mensagem o email que você usou na compra.'),
  ('acesso_criado', 'Acesso: conta criada pelo bot',
   'Pronto! Criei seu acesso ao {{app}}.

Login: {{email}}
Senha: {{senha}}

Entre e troque a senha no seu perfil. Qualquer coisa é só responder aqui.')
on conflict (slug) do nothing;

update pinguim.bot_template set corpo = 'Pronto! Sua senha do {{app}} voltou pra senha padrão.

Login: {{email}}
Senha: {{senha}}

Entre e troque a senha no seu perfil. Qualquer coisa é só responder aqui.',
  descricao = 'Acesso: senha resetada pra padrão', atualizado_em = now()
where slug = 'acesso_resetado';

update pinguim.bot_template set corpo = 'Não consegui liberar seu acesso ao {{app}} automaticamente. Já abri um chamado pra equipe ({{responsavel}}) resolver.

Protocolo: #{{protocolo}}', descricao = 'Acesso: bot não conseguiu (vira chamado)', atualizado_em = now()
where slug = 'acesso_sem_conta';

-- v3 (20/10): menu em qualquer horário, humano = opção 4 no menu principal
update pinguim.bot_template set corpo = 'Oi{{nome}}! Sou o assistente da equipe. Posso te ajudar com:

1 - Acesso (app ou área de membros)
2 - Cancelamento
3 - Aulas
4 - Falar com uma pessoa

Responda só com o número.', descricao = 'Menu geral (primeira mensagem do aluno)', atualizado_em = now()
where slug = 'menu_principal';
update pinguim.bot_template set corpo = 'Não entendi. Responda só com o número de uma das opções acima.', atualizado_em = now() where slug = 'invalida';

-- equipe: quem some das listas do CRM (Renata saiu, 20/10)
insert into pinguim.bot_config (chave, valor) values ('equipe_ocultos', '["6737ceeb-b6b4-49c0-a532-4e6f41232e28"]'::jsonb) on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();

-- responsável de cancelamento com nome completo (20/10)
update pinguim.bot_rota set responsavel_nome='Luiz Guilherme Cota' where responsavel_nome='Luiz Guilherme'; update pinguim.crm_chamado set responsavel_nome='Luiz Guilherme Cota' where responsavel_nome='Luiz Guilherme';
