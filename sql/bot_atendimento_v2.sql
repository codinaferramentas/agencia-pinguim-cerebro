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

-- 21/10: Escola do Perpétuo sai de "apps" e vai pra "área de membros" (automática, senha padrão Escola@10);
-- ProAlt/Elo na Hotmart = chamado. Textos com artigo certo ({{ao_app}}/{{do_app}}). Liberado Hotmart = senha da Hotmart.
update pinguim.bot_template set atualizado_em = now(), corpo = 'Vamos resolver seu acesso{{nome}}. É acesso a qual?

1 - Um dos nossos apps (ProAlt, Elo, Sirius)
2 - Área de membros (Escola do Perpétuo, ProAlt ou Elo)
0 - Falar com uma pessoa

Responda só com o número.' where slug = 'acesso_tipo';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Qual app?

1 - ProAlt
2 - Elo
3 - Sirius
0 - Falar com uma pessoa

Responda só com o número.' where slug = 'acesso_app';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Qual área de membros?

1 - Escola do Perpétuo
2 - ProAlt
3 - Elo
0 - Falar com uma pessoa

Responda só com o número.' where slug = 'hotmart_area';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Para liberar seu acesso {{ao_app}}, envie em uma mensagem o email que você usou na compra.' where slug = 'pede_email_acesso';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Pronto! Sua senha {{do_app}} voltou para a senha padrão.

Login: {{email}}
Senha: {{senha}}

Entre e troque a senha no seu perfil. Se precisar de ajuda, é só responder aqui.' where slug = 'acesso_resetado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Pronto! Criei seu acesso {{ao_app}}.

Login: {{email}}
Senha: {{senha}}

Entre e troque a senha no seu perfil. Se precisar de ajuda, é só responder aqui.' where slug = 'acesso_criado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não consegui liberar seu acesso {{ao_app}} automaticamente. Já abri um chamado para a nossa equipe ({{responsavel}}) resolver, e você vai ser avisado aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'acesso_sem_conta';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Oi{{nome}}! Seu acesso à área de membros do {{area}} foi liberado.

Para entrar, use o email da compra ({{email}}) e a mesma senha que você cadastrou na Hotmart quando fez a compra. Se não lembrar a senha, use a opção "Esqueci minha senha" na tela de login da Hotmart.

Se tiver qualquer dificuldade, é só responder aqui. Protocolo #{{protocolo}}.' where slug = 'resolvido_acesso_hotmart';

-- 21/10: trilha de CANCELAMENTO (regra André): sempre pede o email da compra → mostra a(s) compra(s)
-- (produto, valor, data, transação) → aluno confirma → até 7 dias = na garantia; mais de 7 = mensagem
-- amigável + análise interna. Nos dois casos abre chamado pro Luiz Guilherme (quem reembolsa é ele, pelo CRM).
insert into pinguim.bot_template (slug, descricao, corpo) values
  ('pede_email_cancel', 'Cancelamento: pede o email da compra',
   'Para localizar a sua compra, envie em uma mensagem o email que você usou na compra.'),
  ('cancel_confirma', 'Cancelamento: 1 compra encontrada, pede confirmação ({{compra}})',
   'Encontrei esta compra no seu email:

{{compra}}

É desta compra que você quer o cancelamento?

1 - Sim
2 - Não, é outra compra
0 - Falar com uma pessoa

Responda só com o número.'),
  ('cancel_lista', 'Cancelamento: várias compras, escolher ({{lista}})',
   'Encontrei estas compras no seu email:

{{lista}}

Qual delas você quer cancelar? Responda só com o número.
Se não for nenhuma delas, responda 0 para falar com uma pessoa.'),
  ('cancel_dentro', 'Cancelamento dentro dos 7 dias de garantia',
   'Recebi seu pedido de cancelamento{{nome}}.

{{compra}}

A compra foi feita em {{data_compra}}, dentro do prazo de garantia de 7 dias. A nossa equipe ({{responsavel}}) vai dar andamento ao seu pedido e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}'),
  ('cancel_fora', 'Cancelamento depois dos 7 dias de garantia (mensagem amigável + análise interna)',
   'Recebi seu pedido de cancelamento{{nome}}.

{{compra}}

O prazo de garantia para reembolso é de 7 dias a partir da data da compra. A sua compra foi feita em {{data_compra}} e hoje é {{hoje}}: já se passaram {{dias}} dias.

Mesmo assim, encaminhei o seu pedido para uma análise interna da nossa equipe ({{responsavel}}). Seu chamado foi aberto e você vai receber mais informações aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}'),
  ('cancel_outra', 'Cancelamento: aluno disse que não é a compra encontrada / nenhuma compra no email',
   'Certo{{nome}}. Abri um chamado para a nossa equipe ({{responsavel}}) localizar a sua compra e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();

-- 21/10 (André): dentro dos 7 dias o BOT reembolsa, depois da confirmação do aluno
-- (só quando o número do WhatsApp é um telefone do cadastro dono da compra; senão vai pro Luiz).
insert into pinguim.bot_template (slug, descricao, corpo) values
  ('cancel_reemb_confirma', 'Cancelamento na garantia: confirmação final antes do bot reembolsar',
   'A sua compra está dentro do prazo de garantia de 7 dias, então você tem direito ao reembolso.

{{compra}}

Atenção: depois de confirmado, o reembolso não pode ser desfeito.

1 - Sim, quero o reembolso
2 - Prefiro falar com um atendente antes

Responda só com o número.'),
  ('cancel_reembolsado', 'Cancelamento: bot solicitou o reembolso na Hotmart',
   'Pronto{{nome}}. O reembolso da compra {{produto}} ({{valor}}) foi solicitado à Hotmart.

O valor volta pela mesma forma de pagamento usada na compra. O prazo para aparecer depende do meio de pagamento e é definido pela Hotmart.

Se precisar de mais alguma coisa, é só responder aqui. Protocolo: #{{protocolo}}'),
  ('cancel_reemb_falhou', 'Cancelamento: reembolso automático falhou, chamado aberto',
   'Não consegui concluir o reembolso automaticamente. Já abri um chamado para a nossa equipe ({{responsavel}}) concluir o seu pedido e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();

-- 21/10 (André): cancelar VÁRIAS compras de uma vez ("1, 3" ou "TODAS"), ex.: produto + order bumps (HP…C1/C2/C3).
-- Textos neutros para 1 ou várias; {{compra}} = bloco (várias = lista + total); {{frase_prazo}} e {{aviso_fora}} montados no código.
update pinguim.bot_template set atualizado_em = now(), corpo = 'Encontrei estas compras no seu email:

{{lista}}

Qual delas você quer cancelar? Responda com o número.
Se forem várias, envie os números separados por vírgula (exemplo: 1, 3) ou escreva TODAS.
Se não for nenhuma delas, responda 0 para falar com uma pessoa.' where slug = 'cancel_lista';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Recebi seu pedido de cancelamento{{nome}}.

{{compra}}

O pedido está dentro do prazo de garantia de 7 dias. A nossa equipe ({{responsavel}}) vai dar andamento e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'cancel_dentro';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Recebi seu pedido de cancelamento{{nome}}.

{{compra}}

O prazo de garantia para reembolso é de 7 dias a partir da data da compra. {{frase_prazo}}

Mesmo assim, encaminhei o seu pedido para uma análise interna da nossa equipe ({{responsavel}}). Seu chamado foi aberto e você vai receber mais informações aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'cancel_fora';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Dentro do prazo de garantia de 7 dias, você tem direito ao reembolso de:

{{compra}}{{aviso_fora}}

Atenção: depois de confirmado, o reembolso não pode ser desfeito.

1 - Sim, quero o reembolso
2 - Prefiro falar com um atendente antes

Responda só com o número.' where slug = 'cancel_reemb_confirma';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Pronto{{nome}}. O reembolso foi solicitado à Hotmart:

{{compra}}

O valor volta pela mesma forma de pagamento usada na compra. O prazo para aparecer depende do meio de pagamento e é definido pela Hotmart.

Se precisar de mais alguma coisa, é só responder aqui. Protocolo: #{{protocolo}}' where slug = 'cancel_reembolsado';
update pinguim.bot_template set atualizado_em = now(), corpo = 'Não consegui concluir o reembolso automaticamente de:

{{compra}}

Já abri um chamado para a nossa equipe ({{responsavel}}) concluir o seu pedido e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}' where slug = 'cancel_reemb_falhou';

-- 21/10 (André): trilha de AULAS. Menu por conteúdo → gravação (prazo de 3 dias; Mentoria → Escola, resto → Hotmart)
-- ou "como achar a aula" (vídeo da Fernanda por área: cole o link no texto aulas_video_*; sem link o bot pergunta e abre chamado)
-- ou aula por tema (chamado Rafa e Jairo com os produtos do aluno + dica da Escola). "ATENDENTE" chama uma pessoa a qualquer hora.
insert into pinguim.bot_template (slug, descricao, corpo) values
  ('aulas_area', 'Aulas: qual conteúdo',
   'Sobre qual conteúdo é a sua dúvida?

1 - ProAlt
2 - Elo
3 - Escola do Perpétuo
4 - Mentoria (Taurus, Lyra, Orion)
5 - Desafio ou imersão
6 - Procuro uma aula sobre um tema e não sei onde está
0 - Falar com uma pessoa

Responda só com o número.'),
  ('aulas_tipo', 'Aulas ProAlt/Elo: gravação ou aula da área de membros ({{area}})',
   'É sobre:

1 - A gravação de um encontro ao vivo (aula com convidado ou encontro da turma)
2 - Encontrar uma aula na área de membros do {{area}}
0 - Falar com uma pessoa

Responda só com o número.'),
  ('aulas_grav_quando', 'Gravação: já passaram 3 dias do encontro?',
   'O encontro ao vivo aconteceu há mais de 3 dias?

1 - Sim, já passaram 3 dias
2 - Não, foi há menos de 3 dias
0 - Falar com uma pessoa

Responda só com o número.'),
  ('aulas_grav_aguarde', 'Gravação: menos de 3 dias, aguardar ({{local}})',
   'As gravações são publicadas em até 3 dias depois do encontro, {{local}}. Por favor, aguarde esse prazo e confira lá.

Se depois disso a gravação ainda não estiver disponível, escreva ATENDENTE aqui que a nossa equipe vai ajudar você.'),
  ('aulas_grav_passou', 'Gravação: já passaram 3 dias, conferir na área de membros ({{local}})',
   'A gravação já deve estar disponível {{local}}. Dê uma olhada por lá.

Se não encontrar, escreva ATENDENTE aqui que a nossa equipe vai ajudar você.'),
  ('aulas_qual', 'Aulas: sem vídeo de ajuda cadastrado, pergunta qual aula',
   'Me conte em uma mensagem qual aula você está procurando.'),
  ('aulas_tema', 'Aulas: procura por tema',
   'Me conte em uma mensagem o tema da aula que você procura (por exemplo: rastreamento de anúncios).'),
  ('pede_email_aulas', 'Aulas: número não identificado, pede o email',
   'Para a nossa equipe localizar a aula certa para você, envie em uma mensagem o email que você usou na compra.'),
  ('aulas_video_proalt', 'Vídeo "como encontrar uma aula" no ProAlt. Troque COLE_O_LINK_AQUI pelo link (sem link, o bot pergunta qual aula e abre chamado)',
   'Gravamos um vídeo curto mostrando como encontrar uma aula na área de membros do ProAlt: COLE_O_LINK_AQUI

Se mesmo assim não encontrar, escreva ATENDENTE aqui.'),
  ('aulas_video_elo', 'Vídeo "como encontrar uma aula" no Elo. Troque COLE_O_LINK_AQUI pelo link (sem link, o bot pergunta qual aula e abre chamado)',
   'Gravamos um vídeo curto mostrando como encontrar uma aula na área de membros do Elo: COLE_O_LINK_AQUI

Se mesmo assim não encontrar, escreva ATENDENTE aqui.'),
  ('aulas_video_perpetuo', 'Vídeo "como encontrar uma aula" na Escola do Perpétuo. Troque COLE_O_LINK_AQUI pelo link (também vai como dica na aula por tema)',
   'Gravamos um vídeo curto mostrando como encontrar uma aula na Escola do Perpétuo: COLE_O_LINK_AQUI

Se mesmo assim não encontrar, escreva ATENDENTE aqui.')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();
update pinguim.bot_template set atualizado_em = now(), corpo = 'Anotado! A nossa equipe ({{responsavel}}) vai localizar a aula e responder você aqui mesmo, nesta conversa.{{dica}}

Protocolo: #{{protocolo}}' where slug = 'aulas_aberto';
insert into pinguim.bot_gatilho (trilha, expressao)
select t, e from (values ('humano','atendente'),
  ('aulas','gravacao'),('aulas','link da aula'),('aulas','cade a aula'),('aulas','onde fica a aula'),
  ('aulas','onde encontro a aula'),('aulas','nao achei a aula'),('aulas','procurando uma aula'),('aulas','procurando a aula')) v(t, e)
where not exists (select 1 from pinguim.bot_gatilho g where g.trilha = v.t and g.expressao = v.e);

-- 21/10 (André): "boa noite" caía na trava de 12h do menu e o bot ficava calado. Saudação/pedido de ajuda
-- agora SEMPRE recebe o menu (máx 1 a cada 30 min) e o menu abre com Bom dia/Boa tarde/Boa noite (fuso SP).
alter table pinguim.bot_gatilho drop constraint if exists bot_gatilho_trilha_check;
alter table pinguim.bot_gatilho add constraint bot_gatilho_trilha_check
  check (trilha in ('acesso','cancelamento','aulas','humano','negacao','saudacao'));
insert into pinguim.bot_gatilho (trilha, expressao)
select 'saudacao', e from (values ('oi'),('oii'),('ola'),('opa'),('bom dia'),('boa tarde'),('boa noite'),('ajuda'),('preciso de ajuda'),
  ('quero ajuda'),('me ajuda'),('suporte'),('alguem pode me ajudar'),('tem alguem ai')) v(e)
where not exists (select 1 from pinguim.bot_gatilho g where g.trilha = 'saudacao' and g.expressao = v.e);
update pinguim.bot_config set valor = valor || '{"menu_saudacao_min": 30}'::jsonb where chave = 'regras';
update pinguim.bot_template set atualizado_em = now(), corpo = regexp_replace(corpo, '^Oi\{\{nome\}\}!', '{{saudacao}}{{nome}}!')
 where slug = 'menu_principal';

-- 22/10: "tarde"/"noite" sozinhos também são saudação (André mandou "tarde" e o bot calou)
insert into pinguim.bot_gatilho (trilha, expressao)
select 'saudacao', e from (values ('tarde'), ('noite')) v(e)
where not exists (select 1 from pinguim.bot_gatilho g where g.trilha = 'saudacao' and g.expressao = v.e);
