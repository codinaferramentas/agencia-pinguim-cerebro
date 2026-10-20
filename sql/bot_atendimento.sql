-- ============================================================
-- BOT DE ATENDIMENTO (pré-atendimento WhatsApp via Evolution, sem IA)
-- Cérebro único, N instâncias. Regras, textos e roteamento são DADOS (editáveis no CRM, sem deploy).
-- Tudo no schema pinguim. RLS ligado sem policy: só a API do CRM (service role) acessa.
-- ============================================================

-- instâncias cadastradas (instância nova = 1 linha, zero código)
create table if not exists pinguim.bot_instancia (
  nome text primary key,                       -- instanceName exato da Evolution
  dono_nome text,                              -- quem atende nesse número (recebe "falar com humano")
  dono_usuario_id uuid,                        -- login do CRM do dono
  ativa boolean not null default true,         -- false = bot ignora tudo dessa instância
  encaminhar_url text,                         -- "porteiro": repassa o payload pro webhook que já existia (ex: monitor de grupos)
  observacao text,
  criado_em timestamptz not null default now()
);

-- configuração geral (1 linha por chave)
create table if not exists pinguim.bot_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- expressões-chave por trilha. trilha 'negacao' = anula o gatilho ("consegui", "obrigada")
create table if not exists pinguim.bot_gatilho (
  id bigint generated always as identity primary key,
  trilha text not null check (trilha in ('acesso','cancelamento','aulas','humano','negacao')),
  expressao text not null,                     -- comparada sem acento/caixa/pontuação
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (trilha, expressao)
);

-- textos que o bot manda ({{nome}}, {{protocolo}}, {{app}}, {{email}}, {{senha}}, {{lista}}, {{responsavel}})
create table if not exists pinguim.bot_template (
  slug text primary key,
  descricao text,
  corpo text not null,
  atualizado_em timestamptz not null default now()
);

-- pra quem vai cada tipo de chamado ('humano' vai pro dono da instância, ver bot_instancia)
create table if not exists pinguim.bot_rota (
  tipo text primary key,
  descricao text,
  responsavel_nome text not null,              -- exibição no CRM / Discord
  usuarios uuid[] not null default '{}',       -- logins do CRM que veem como "meu"
  discord_canal_id text                        -- canal do Discord do time (null = só CRM)
);

-- estado vivo de cada conversa (telefone + instância)
create table if not exists pinguim.bot_sessao (
  id bigint generated always as identity primary key,
  instancia text not null,
  contato text not null,                       -- jid de resposta (5511...@s.whatsapp.net ou @lid)
  telefone text,                               -- só dígitos com DDI, quando conhecido
  cliente_id uuid,
  nome text,                                   -- pushName do WhatsApp
  etapa text,                                  -- null = ocioso; senão, menu aguardando resposta
  contexto jsonb not null default '{}',
  erros_menu int not null default 0,
  etapa_expira_em timestamptz,
  ultimo_menu_em timestamptz,                  -- trava "1 menu a cada 12h"
  ultimo_humano_em timestamptz,                -- tutora/suporte falou → bot calado por N horas
  pausado_ate timestamptz,                     -- "#bot off"
  atualizado_em timestamptz not null default now(),
  unique (instancia, contato)
);

-- toda mensagem e toda decisão do bot (auditoria + calibração)
create table if not exists pinguim.bot_mensagem (
  id bigint generated always as identity primary key,
  instancia text not null,
  contato text not null,
  message_id text,                             -- id do WhatsApp (dedup do webhook)
  direcao text not null check (direcao in ('aluno','bot','humano')),
  corpo text,
  decisao text,                                -- o que o bot fez (respondeu, calou, abriu_chamado, ignorou...)
  motivo text,                                 -- por quê ("humano falou há 40 min")
  chamado_id bigint,
  simulado boolean not null default false,
  criado_em timestamptz not null default now()
);
create unique index if not exists bot_mensagem_msgid_uk on pinguim.bot_mensagem(instancia, message_id) where message_id is not null;
create index if not exists bot_mensagem_contato_idx on pinguim.bot_mensagem(instancia, contato, criado_em desc);

-- chamados (fila de atendimento). Bot abre; humano assume e resolve no CRM.
create table if not exists pinguim.crm_chamado (
  id bigint generated always as identity primary key,
  tipo text not null,                          -- acesso_app | acesso_hotmart | cancelamento | aulas | humano | nao_identificado | nao_classificado
  status text not null default 'aberto' check (status in ('aberto','em_atendimento','resolvido')),
  resolvido_pelo_bot boolean not null default false,
  cliente_id uuid references pinguim.crm_cliente(cliente_id) on delete set null,
  instancia text,
  contato text,
  telefone text,
  nome_contato text,
  resumo text not null,                        -- uma linha: o que o aluno precisa
  contexto jsonb not null default '{}',        -- o que o bot coletou (app, email, compra escolhida, texto do aluno)
  responsavel_nome text,
  responsavel_usuarios uuid[] not null default '{}',
  assumido_por uuid,
  assumido_por_nome text,
  nota_resolucao text,
  simulado boolean not null default false,     -- criado pelo simulador (fica fora da fila por padrão)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create index if not exists crm_chamado_status_idx on pinguim.crm_chamado(status, criado_em desc);
create index if not exists crm_chamado_cliente_idx on pinguim.crm_chamado(cliente_id);
create index if not exists crm_chamado_contato_idx on pinguim.crm_chamado(instancia, contato, status);

alter table pinguim.bot_instancia enable row level security;
alter table pinguim.bot_config enable row level security;
alter table pinguim.bot_gatilho enable row level security;
alter table pinguim.bot_template enable row level security;
alter table pinguim.bot_rota enable row level security;
alter table pinguim.bot_sessao enable row level security;
alter table pinguim.bot_mensagem enable row level security;
alter table pinguim.crm_chamado enable row level security;

-- ===================== DADOS INICIAIS =====================

insert into pinguim.bot_config (chave, valor) values
  ('horario', '{"inicio": 8, "fim": 18, "dias_uteis": [1,2,3,4,5], "fuso": "America/Sao_Paulo"}'),
  ('feriados', '["2026-11-02","2026-11-15","2026-11-20","2026-12-25","2027-01-01"]'),
  ('regras', '{"janela_humano_horas": 4, "menu_intervalo_horas": 12, "etapa_expira_min": 30, "max_palavras_gatilho": 12, "max_reset_senha_dia": 3, "atraso_digitando_ms": 1500}'),
  ('webhook_token', to_jsonb(replace(gen_random_uuid()::text, '-', '')))
on conflict (chave) do nothing;

insert into pinguim.bot_rota (tipo, descricao, responsavel_nome, usuarios) values
  ('acesso_app',       'App: aluno sem conta ou reenvio falhou',        'Codina',            array['8a704c33-85e9-40fa-8c7c-331f2f433454']::uuid[]),
  ('acesso_hotmart',   'Área de membros Hotmart (liberação manual)',   'Rafa e Jairo',      array['ecebc300-e690-4e96-8845-72d8f2426c0d','156386a7-5aba-4436-a5d4-d7df45a6105a']::uuid[]),
  ('aulas',            'Acesso/organização de aulas',                  'Rafa e Jairo',      array['ecebc300-e690-4e96-8845-72d8f2426c0d','156386a7-5aba-4436-a5d4-d7df45a6105a']::uuid[]),
  ('cancelamento',     'Cancelamento / reembolso',                     'Luiz Guilherme',    array['690c3c29-5b1f-4de6-9e0e-e75a875a52d0']::uuid[]),
  ('nao_identificado', 'Telefone e email não encontrados na base',     'Rafa e Jairo',      array['ecebc300-e690-4e96-8845-72d8f2426c0d','156386a7-5aba-4436-a5d4-d7df45a6105a']::uuid[]),
  ('nao_classificado', 'Aluno não respondeu o menu direito',           'Rafa e Jairo',      array['ecebc300-e690-4e96-8845-72d8f2426c0d','156386a7-5aba-4436-a5d4-d7df45a6105a']::uuid[]),
  ('humano',           'Falar com humano (vai pro dono da instância; esta linha é o reserva)', 'Rafa e Jairo', array['ecebc300-e690-4e96-8845-72d8f2426c0d','156386a7-5aba-4436-a5d4-d7df45a6105a']::uuid[])
on conflict (tipo) do nothing;

insert into pinguim.bot_gatilho (trilha, expressao) values
  ('acesso','nao consigo acessar'),('acesso','nao consigo entrar'),('acesso','nao consigo logar'),('acesso','sem acesso'),
  ('acesso','esqueci a senha'),('acesso','esqueci minha senha'),('acesso','trocar a senha'),('acesso','trocar minha senha'),
  ('acesso','redefinir senha'),('acesso','recuperar senha'),('acesso','senha errada'),('acesso','senha nao funciona'),
  ('acesso','nao recebi o acesso'),('acesso','nao recebi meu acesso'),('acesso','nao recebi acesso'),('acesso','liberar meu acesso'),
  ('acesso','liberar acesso'),('acesso','perdi o acesso'),('acesso','perdi meu acesso'),('acesso','acesso ao app'),('acesso','problema no acesso'),
  ('cancelamento','quero cancelar'),('cancelamento','cancelar minha compra'),('cancelamento','cancelar a compra'),('cancelamento','cancelar meu plano'),
  ('cancelamento','cancelar a assinatura'),('cancelamento','cancelar minha assinatura'),('cancelamento','cancelamento'),('cancelamento','reembolso'),
  ('cancelamento','quero meu dinheiro'),('cancelamento','devolucao do dinheiro'),('cancelamento','estorno'),('cancelamento','desistir da compra'),
  ('aulas','nao acho a aula'),('aulas','nao encontro a aula'),('aulas','nao consigo ver a aula'),('aulas','aula nao abre'),('aulas','aula nao carrega'),
  ('aulas','aula bloqueada'),('aulas','modulo bloqueado'),('aulas','modulo nao liberado'),('aulas','liberar a aula'),('aulas','acesso as aulas'),('aulas','acesso a aula'),
  ('humano','falar com humano'),('humano','falar com uma pessoa'),('humano','falar com alguem'),('humano','falar com atendente'),
  ('humano','falar com o suporte'),('humano','quero um atendente'),('humano','atendimento humano'),
  ('negacao','consegui'),('negacao','obrigad'),('negacao','deu certo'),('negacao','resolvido'),('negacao','resolveu'),
  ('negacao','ja entrei'),('negacao','valeu'),('negacao','funcionou')
on conflict (trilha, expressao) do nothing;

insert into pinguim.bot_template (slug, descricao, corpo) values
  ('menu_principal', 'Menu geral (fora do horário / "menu")',
   'Oi{{nome}}! Sou o assistente da equipe. Posso te ajudar com:

1 - Acesso (app ou área de membros)
2 - Cancelamento
3 - Aulas
0 - Falar com uma pessoa

Responda só com o número.'),
  ('acesso_tipo', 'Acesso: app ou Hotmart?',
   'Vamos resolver seu acesso{{nome}}. É acesso a qual?

1 - Um dos nossos apps (ProAlt, Elo, Sirius, Escola do Perpétuo)
2 - Área de membros da Hotmart
0 - Falar com uma pessoa

Responda só com o número.'),
  ('acesso_app', 'Qual app?',
   'Qual app?

1 - ProAlt
2 - Elo
3 - Sirius
4 - Escola do Perpétuo
0 - Falar com uma pessoa'),
  ('pede_email', 'Telefone não encontrado: pede o email',
   'Não encontrei seu número no nosso cadastro. Me manda, em uma mensagem, o email que você usou na compra.'),
  ('acesso_resetado', 'Senha do app resetada pelo bot',
   'Pronto! Seu acesso ao {{app}} foi renovado.

Login: {{email}}
Senha: {{senha}}

Entre e, se quiser, troque a senha no seu perfil. Qualquer coisa é só responder aqui.'),
  ('acesso_sem_conta', 'App: não achou conta / não deu pra resetar',
   'Não consegui renovar seu acesso ao {{app}} automaticamente. Já abri um chamado pra equipe ({{responsavel}}) resolver.

Protocolo: #{{protocolo}}'),
  ('acesso_hotmart', 'Área de membros Hotmart: orientação + chamado',
   'A área de membros da Hotmart usa a sua conta na Hotmart. Pra recuperar a senha:

1. Acesse https://sso.hotmart.com/login
2. Clique em "Esqueci minha senha"
3. Use o mesmo email da compra

Se mesmo assim não liberar, a equipe ({{responsavel}}) já foi avisada e vai verificar. Protocolo: #{{protocolo}}'),
  ('cancel_lista', 'Cancelamento: escolher a compra',
   'Qual compra você quer cancelar?

{{lista}}
0 - Falar com uma pessoa

Responda só com o número.'),
  ('cancel_aberto', 'Cancelamento: chamado aberto',
   'Recebi seu pedido de cancelamento. A equipe ({{responsavel}}) vai analisar e te responder por aqui.

Protocolo: #{{protocolo}}'),
  ('aulas_pede', 'Aulas: pede descrição',
   'Me conta em uma mensagem: qual curso e qual aula você não está conseguindo acessar?'),
  ('aulas_aberto', 'Aulas: chamado aberto',
   'Anotado! A equipe ({{responsavel}}) vai verificar e te responder por aqui.

Protocolo: #{{protocolo}}'),
  ('humano_aberto', 'Falar com humano',
   'Certo, já chamei a equipe ({{responsavel}}). Em breve alguém te responde por aqui.

Protocolo: #{{protocolo}}'),
  ('nao_identificado', 'Email também não encontrado',
   'Não encontrei esse email no nosso cadastro. Já passei seu caso pra equipe ({{responsavel}}), que vai te responder por aqui.

Protocolo: #{{protocolo}}'),
  ('invalida', 'Resposta fora do menu (1ª vez)',
   'Não entendi. Responda só com o número de uma das opções acima, ou 0 pra falar com uma pessoa.'),
  ('nao_classificado', 'Resposta fora do menu (2ª vez)',
   'Vou passar sua mensagem pra equipe ({{responsavel}}), que te responde por aqui. Protocolo: #{{protocolo}}'),
  ('fora_horario_sufixo', 'Acrescentado nos chamados abertos fora do horário',
   'Nosso atendimento humano funciona de segunda a sexta, das 8h às 18h.')
on conflict (slug) do nothing;
update pinguim.bot_rota set descricao='App: aluno sem conta (liberar acesso)', responsavel_nome='Rafa e Jairo',
  usuarios=array['ecebc300-e690-4e96-8845-72d8f2426c0d','156386a7-5aba-4436-a5d4-d7df45a6105a']::uuid[] where tipo='acesso_app';
insert into pinguim.bot_rota (tipo, descricao, responsavel_nome, usuarios) values
  ('acesso_app_erro','App: reenvio automático falhou (problema técnico)','Codina', array['8a704c33-85e9-40fa-8c7c-331f2f433454']::uuid[])
on conflict (tipo) do nothing;

-- porteiro: repassa também os headers do webhook anterior (ex: x-monitor-token)
alter table pinguim.bot_instancia add column if not exists encaminhar_headers jsonb not null default '{}'::jsonb, add column if not exists webhook_anterior jsonb;
