-- ============================================================
-- Bot: "6 - Minha agenda" (André 28/10). Lê as 3 agendas de mentoria (só leitura, conta robô ferramenta@):
-- atendimentos individuais (aluno convidado ou nome do cadastro no título) + próximos encontros da turma
-- (pela mentoria comprada). Manda data, hora e link da reunião. Não achou nada futuro → chamado Ingrid e Fernanda.
-- ============================================================
alter table pinguim.bot_gatilho drop constraint if exists bot_gatilho_trilha_check;
alter table pinguim.bot_gatilho add constraint bot_gatilho_trilha_check
  check (trilha in ('acesso','cancelamento','aulas','humano','negacao','saudacao','servicos','agenda'));
insert into pinguim.bot_gatilho (trilha, expressao)
select 'agenda', e from (values ('minha agenda'), ('minha consultoria'), ('minha mentoria individual'), ('meu atendimento'), ('minha call'),
  ('horario da mentoria'), ('horario da consultoria'), ('horario do encontro'), ('quando e minha'), ('meu agendamento'), ('meu encontro individual')) v(e)
where not exists (select 1 from pinguim.bot_gatilho g where g.trilha = 'agenda' and g.expressao = v.e);

insert into pinguim.bot_rota (tipo, descricao, responsavel_nome, usuarios) values
  ('agenda', 'Agenda de consultorias e encontros', 'Ingrid e Fernanda',
   array['827285df-9242-45d9-b2e1-f638b5aed64a', '14a8613d-76f1-47a8-9971-1c4c8f04f720']::uuid[])
on conflict (tipo) do nothing;

update pinguim.bot_template set atualizado_em = now(), corpo = replace(corpo, '5 - Serviços que comprei (análise de perfil e outros)', '5 - Serviços que comprei (análise de perfil e outros)
6 - Minha agenda (consultorias e encontros)')
 where slug = 'menu_principal' and corpo not like '%6 - Minha agenda%';

insert into pinguim.bot_template (slug, descricao, corpo) values
  ('pede_email_agenda', 'Agenda: pede o email da compra',
   'Para localizar a sua agenda, envie em uma mensagem o email que você usou na compra.'),
  ('agenda_proximos', 'Agenda: próximos atendimentos e encontros ({{lista}}, {{opcoes}})',
   'Encontrei a sua agenda{{nome}}:

{{lista}}{{opcoes}}'),
  ('agenda_nao_achou', 'Agenda: nada marcado → chamado (Ingrid e Fernanda)',
   'Não encontrei um atendimento marcado no seu nome. Vou encaminhar o seu caso para a nossa equipe ({{responsavel}}), que vai responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}'),
  ('agenda_anteriores', 'Agenda: atendimentos anteriores ({{lista}})',
   'Seus últimos atendimentos:

{{lista}}

Se precisar de mais alguma coisa, é só responder aqui.')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();
