-- ============================================================
-- Bot: "5 - Serviços que comprei" (23/10, André). Cadastro de serviços: produto(s) da compra → como entregar.
--   tipo 'analise_ig' = o bot entrega sozinho (pede o @, dispara a análise do Sirius, manda o PDF quando fica pronto)
--   tipo 'chamado'    = abre chamado pro responsável (rota bot_rota 'servico')
-- Regra: só quem tem compra APROVADA do produto. WhatsApp = 1 análise por compra; outra → pessoa. CRM = sem limite.
-- ============================================================
create table if not exists pinguim.bot_servico (
  id text primary key,
  nome text not null,                 -- como aparece no menu
  produto_ids uuid[] not null,        -- crm_compra.produto_id (id do produto no Dash) que dão direito
  tipo text not null check (tipo in ('analise_ig', 'chamado')),
  prazo text,                         -- texto livre pro aluno ("até 5 dias úteis")
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table pinguim.bot_servico enable row level security;
insert into pinguim.bot_servico (id, nome, produto_ids, tipo, ordem) values
  ('analise_ig', 'Análise de perfil do Instagram',
   array['46818775-916f-4b0a-a961-15723c73ee69', '76e87219-5304-4be4-b654-0e8a07a3767c']::uuid[], 'analise_ig', 1)
on conflict (id) do nothing;

-- análise pedida pelo bot: guarda a conversa pra mandar o PDF quando ficar pronto
alter table pinguim.crm_analise_ig add column if not exists instancia text;
alter table pinguim.crm_analise_ig add column if not exists contato text;
alter table pinguim.crm_analise_ig add column if not exists nome_contato text;
alter table pinguim.crm_analise_ig add column if not exists avisado_em timestamptz;
alter table pinguim.crm_analise_ig add column if not exists simulado boolean not null default false;

-- quem recebe chamado de serviço (mesmo time de aulas por enquanto: Rafa e Jairo)
insert into pinguim.bot_rota (tipo, descricao, responsavel_nome, usuarios)
select 'servico', 'Serviços comprados (análise de perfil e outros)', r.responsavel_nome, r.usuarios from pinguim.bot_rota r where r.tipo = 'aulas'
on conflict (tipo) do nothing;

-- expressões que levam direto pros serviços
alter table pinguim.bot_gatilho drop constraint if exists bot_gatilho_trilha_check;
alter table pinguim.bot_gatilho add constraint bot_gatilho_trilha_check
  check (trilha in ('acesso','cancelamento','aulas','humano','negacao','saudacao','servicos'));
insert into pinguim.bot_gatilho (trilha, expressao)
select 'servicos', e from (values ('analise de perfil'), ('analise do perfil'), ('analise do instagram'), ('analise do meu perfil'),
  ('minha analise'), ('servico que comprei'), ('servicos que comprei')) v(e)
where not exists (select 1 from pinguim.bot_gatilho g where g.trilha = 'servicos' and g.expressao = v.e);

-- menu principal ganha a opção 5
update pinguim.bot_template set atualizado_em = now(), corpo = replace(corpo, '4 - Falar com uma pessoa', '4 - Falar com uma pessoa
5 - Serviços que comprei (análise de perfil e outros)')
 where slug = 'menu_principal' and corpo not like '%5 - Serviços%';

insert into pinguim.bot_template (slug, descricao, corpo) values
  ('pede_email_servico', 'Serviços: pede o email da compra',
   'Para localizar o serviço que você comprou, envie em uma mensagem o email que você usou na compra.'),
  ('servico_sem_compra', 'Serviços: email sem compra de serviço ({{email}})',
   'Não encontrei a compra de um serviço no email {{email}}. Se você usou outro email na compra, envie aqui. Se preferir, responda 0 para falar com uma pessoa da nossa equipe.'),
  ('servico_sem_compra_humano', 'Serviços: 2ª tentativa sem compra → chamado',
   'Também não encontrei a compra com esse email. Abri um chamado para a nossa equipe ({{responsavel}}) verificar e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}'),
  ('servico_lista', 'Serviços: vários serviços comprados ({{lista}})',
   'Encontrei estes serviços na sua compra:

{{lista}}
0 - Falar com uma pessoa

Responda só com o número.'),
  ('servico_chamado', 'Serviço entregue pela equipe: chamado aberto ({{servico}}, {{prazo}})',
   'Recebi seu pedido sobre {{servico}}. A nossa equipe ({{responsavel}}) vai verificar e responder você aqui mesmo, nesta conversa.{{prazo}}

Protocolo: #{{protocolo}}'),
  ('analise_pede_handle', 'Análise de perfil: pede o @',
   'Vamos fazer a sua análise de perfil{{nome}}! Envie o @ do Instagram que você quer analisar (por exemplo: @seuperfil).'),
  ('analise_handle_invalido', 'Análise de perfil: @ inválido',
   'Não consegui entender o @. Envie só o @ do perfil, sem espaços (por exemplo: @seuperfil). Se preferir, responda 0 para falar com uma pessoa.'),
  ('analise_confirma', 'Análise de perfil: confirma o @ ({{handle}})',
   'Confirma a análise do perfil {{handle}}?

1 - Sim, pode fazer
2 - Não, quero corrigir o @
0 - Falar com uma pessoa

Responda só com o número.'),
  ('analise_pedida', 'Análise de perfil: pedido enviado ({{handle}})',
   'Pedido recebido! A análise do perfil {{handle}} já está sendo feita. Assim que ficar pronta, envio o link do PDF aqui mesmo, nesta conversa. Costuma levar alguns minutos.'),
  ('analise_ja_existe_recente', 'Análise de perfil: já existe análise recente desse @ ({{handle}}, {{data}}, {{link}})',
   'Encontrei uma análise do perfil {{handle}} feita em {{data}}. Aqui está o PDF:
{{link}}

Se precisar de mais alguma coisa, é só responder aqui.'),
  ('analise_pronta', 'Análise de perfil: ficou pronta (aviso automático; {{handle}}, {{link}})',
   'Oi{{nome}}! A análise do perfil {{handle}} ficou pronta. Aqui está o PDF:
{{link}}

Se tiver qualquer dúvida, é só responder aqui.'),
  ('analise_andamento', 'Análise de perfil: já pedida e ainda em andamento ({{handle}}, {{data}})',
   'A análise do perfil {{handle}} que você pediu em {{data}} ainda está sendo feita. Assim que ficar pronta, envio o link aqui.

1 - Quero pedir outra análise
0 - Falar com uma pessoa'),
  ('analise_ja_feita', 'Análise de perfil: já entregue ({{handle}}, {{data}}, {{link}})',
   'Você já recebeu a análise do perfil {{handle}} (pedida em {{data}}). Aqui está o PDF de novo:
{{link}}

1 - Quero pedir outra análise
0 - Falar com uma pessoa'),
  ('analise_outra', 'Análise de perfil: quer outra além das compradas → chamado',
   'Certo{{nome}}. Abri um chamado para a nossa equipe ({{responsavel}}) ver o seu pedido de uma nova análise e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}'),
  ('analise_falhou', 'Análise de perfil: não deu pra iniciar ou deu erro → chamado ({{handle}})',
   'Tivemos um problema com a análise do perfil {{handle}}. Abri um chamado para a nossa equipe ({{responsavel}}) resolver e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();

-- aviso automático do PDF da análise pedida pelo bot: a cada 2 min (token lido do banco na hora)
select cron.schedule('bot-analise-avisar', '*/2 * * * *', $$
  select net.http_get(
    url := 'https://crm-pinguim.vercel.app/api/bot/analise-avisar?t=' || (select valor#>>'{}' from pinguim.bot_config where chave = 'webhook_token'),
    timeout_milliseconds := 60000);
$$);
