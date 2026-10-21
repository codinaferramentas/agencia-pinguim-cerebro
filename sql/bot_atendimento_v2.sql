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

-- Danubia saiu (20/10)
update pinguim.bot_config set valor = (select to_jsonb(array(select distinct x from jsonb_array_elements_text(valor || '["38d7de34-2426-45b2-a986-322e9be89b2d"]'::jsonb) x))), atualizado_em=now() where chave='equipe_ocultos'; update pinguim.bot_rota set usuarios = array_remove(usuarios, '38d7de34-2426-45b2-a986-322e9be89b2d'::uuid); update pinguim.bot_instancia set dono_usuario_id=null, dono_nome=null where dono_usuario_id='38d7de34-2426-45b2-a986-322e9be89b2d';

-- área de membros (Hotmart): pergunta a área, pede email, abre chamado; aviso ao aluno quando a equipe resolve (21/10)
insert into pinguim.bot_template (slug, descricao, corpo) values
  ('hotmart_area', 'Área de membros: qual?',
   'Qual área de membros?

1 - ProAlt
2 - Elo
0 - Falar com uma pessoa

Responda só com o número.'),
  ('pede_email_hotmart', 'Área de membros: pede o email da compra',
   'Pra liberar seu acesso à área de membros do {{area}}, me manda em uma mensagem o email que você usou na compra.'),
  ('acesso_hotmart_aberto', 'Área de membros: chamado aberto pra equipe',
   'Pronto! Abri um chamado pra nossa equipe liberar seu acesso à área de membros do {{area}} (email {{email}}).

É só aguardar aqui mesmo: assim que liberarmos, a gente te avisa nesta conversa.

Protocolo: #{{protocolo}}'),
  ('resolvido_padrao', 'Aviso quando a equipe fecha o chamado (padrão)',
   'Oi{{nome}}! Seu atendimento #{{protocolo}} foi concluído pela nossa equipe. Se precisar de mais alguma coisa, é só responder aqui.'),
  ('resolvido_acesso_hotmart', 'Aviso quando a equipe libera a área de membros',
   'Oi{{nome}}! Seu acesso à área de membros do {{area}} foi liberado. É só entrar com o email {{email}}.

Se tiver qualquer dificuldade, responda aqui. Protocolo #{{protocolo}}.')
on conflict (slug) do nothing;

-- textos mais humanos (21/10, teste do Andre): erro no passo do email, escalada e lembrete de aguardar
insert into pinguim.bot_template (slug, descricao, corpo) values
  ('invalida_email', 'Pediu email e a mensagem não tem email',
   'Não encontrei um email nessa mensagem. Me manda só o email que você usou na compra (por exemplo: nome@gmail.com).

Se preferir falar com uma pessoa, responda 0.'),
  ('aguarde_chamado', 'Aluno escreveu com chamado aberto e a equipe ainda não respondeu (máx 1 a cada 4h)',
   'Oi{{nome}}! Seu atendimento #{{protocolo}} já está com a nossa equipe. Assim que alguém pegar, vai te responder aqui mesmo, nesta conversa. É só aguardar.')
on conflict (slug) do nothing;
update pinguim.bot_template set corpo = 'Não consegui entender sua mensagem, mas não se preocupe{{nome}}: o pessoal da nossa equipe ({{responsavel}}) vai falar com você aqui mesmo, nesta conversa. É só aguardar.

Protocolo: #{{protocolo}}', atualizado_em = now() where slug = 'nao_classificado';
update pinguim.bot_template set corpo = 'Não entendi. Responda só com o número de uma das opções acima, ou 0 pra falar com uma pessoa.', atualizado_em = now() where slug = 'invalida';

-- textos sem gíria (21/10, pedido do Andre: "pegar", "pra", "a gente" ficam informais demais)
update pinguim.bot_template set atualizado_em = now(), corpo = 'Oi{{nome}}! Seu atendimento #{{protocolo}} já está com a nossa equipe. Assim que ele for finalizado, você vai ser avisado aqui mesmo, nesta conversa. É só aguardar.' where slug = 'aguarde_chamado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Pronto! Abri um chamado para a nossa equipe liberar seu acesso à área de membros do {{area}} (email {{email}}).

É só aguardar: assim que o acesso for liberado, você vai ser avisado aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'acesso_hotmart_aberto';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Pronto! Sua senha do {{app}} voltou para a senha padrão.

Login: {{email}}
Senha: {{senha}}

Entre e troque a senha no seu perfil. Se precisar de ajuda, é só responder aqui.' where slug = 'acesso_resetado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Pronto! Criei seu acesso ao {{app}}.

Login: {{email}}
Senha: {{senha}}

Entre e troque a senha no seu perfil. Se precisar de ajuda, é só responder aqui.' where slug = 'acesso_criado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não consegui liberar seu acesso ao {{app}} automaticamente. Já abri um chamado para a nossa equipe ({{responsavel}}) resolver, e você vai ser avisado aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'acesso_sem_conta';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não entendi. Responda só com o número de uma das opções acima, ou 0 para falar com uma pessoa.' where slug = 'invalida';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não encontrei esse email no nosso cadastro. Já encaminhei seu caso para a nossa equipe ({{responsavel}}), que vai responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'nao_identificado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Para liberar seu acesso ao {{app}}, envie em uma mensagem o email que você usou na compra.' where slug = 'pede_email_acesso';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Para liberar seu acesso à área de membros do {{area}}, envie em uma mensagem o email que você usou na compra.' where slug = 'pede_email_hotmart';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não encontrei seu número no nosso cadastro. Envie em uma mensagem o email que você usou na compra.' where slug = 'pede_email';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não encontrei um email nessa mensagem. Envie só o email que você usou na compra (por exemplo: nome@gmail.com).

Se preferir falar com uma pessoa, responda 0.' where slug = 'invalida_email';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não consegui entender sua mensagem, mas não se preocupe{{nome}}: a nossa equipe ({{responsavel}}) vai falar com você aqui mesmo, nesta conversa. É só aguardar.

Protocolo: #{{protocolo}}' where slug = 'nao_classificado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Me conte em uma mensagem: qual curso e qual aula você não está conseguindo acessar?' where slug = 'aulas_pede';
select slug from pinguim.bot_template where corpo ~* '\m(pra|pegar|a gente|me manda)\M' order by slug;
update pinguim.bot_template set atualizado_em = now(), corpo = 'Anotado! A nossa equipe ({{responsavel}}) vai verificar e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'aulas_aberto';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Recebi seu pedido de cancelamento. A nossa equipe ({{responsavel}}) vai analisar e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'cancel_aberto';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Certo, já chamei a nossa equipe ({{responsavel}}). Em breve alguém vai responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'humano_aberto';
update pinguim.bot_template set corpo = replace(corpo, 'Pra recuperar', 'Para recuperar') where slug = 'acesso_hotmart';

-- aviso quando alguém da equipe assume o chamado (Aberto → Em atendimento), 1 vez por chamado (21/10)
insert into pinguim.bot_template (slug, descricao, corpo) values
  ('em_atendimento', 'Aviso quando alguém da equipe assume o chamado ({{atendente}} = primeiro nome)',
   'Oi{{nome}}! Seu atendimento #{{protocolo}} já está em andamento: {{atendente}}, da nossa equipe, começou a cuidar do seu caso. Assim que ele for finalizado, você vai ser avisado aqui mesmo, nesta conversa.')
on conflict (slug) do nothing;
