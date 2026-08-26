-- ========================================================================
-- schema-040-monitor-grupos.sql
-- ========================================================================
-- Monitor de sentimento nos grupos de WhatsApp dos alunos (instância
-- elo_1775155882289 / Ingrid é membro dos grupos).
--
-- Fluxo (edge monitor-grupos-webhook):
--   Evolution (webhook MESSAGES_UPSERT) → edge recebe cada mensagem
--     1. valida token do webhook (header x-monitor-token, chave no cofre
--        MONITOR_GRUPOS_WEBHOOK_TOKEN — inserida à parte, NUNCA commitada)
--     2. descarta: grupo não monitorado, fromMe, mensagem sem texto
--     3. classifica com os padrões desta base (regex sobre texto normalizado
--        minúsculas/sem acento; peso >= 3 dispara sozinho, limiar = 3)
--     4. grava TODA mensagem em monitor_grupos_mensagens (flagada ou não —
--        as não-flagadas são o corpus pra melhorar os padrões depois)
--     5. flagou e autor NÃO é admin do grupo → DM no Discord (Codina+Ingrid)
--        · admins ficam em cache jsonb em monitor_grupos (refresh 6h, lazy)
--        · debounce: mesmo autor+grupo já alertado nos últimos 5 min → grava
--          mas não repete a DM (a GS já vai abrir o grupo)
--
-- Padrões calibrados contra 2.634 mensagens reais dos 10 grupos (26/08/2026):
-- 10 capturas, todas legítimas, zero falso positivo no corpus.
-- Sem cron: é webhook, tempo real. A queda da instância já é monitorada
-- pelo alertas-grupos-worker.
-- ========================================================================

-- ---------- grupos monitorados ----------
create table if not exists pinguim.monitor_grupos (
  id                    uuid primary key default gen_random_uuid(),
  jid                   text not null unique,      -- 1203...@g.us
  nome                  text not null,
  link_convite          text,
  ativo                 boolean not null default true,
  -- cache dos participantes admins (jids), pra não bater na Evolution a cada msg
  admins                jsonb not null default '[]',
  admins_atualizado_em  timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
comment on table pinguim.monitor_grupos is
  'Grupos de alunos monitorados pelo monitor de sentimento. Edge: monitor-grupos-webhook.';
alter table pinguim.monitor_grupos enable row level security;

-- ---------- padrões do classificador (determinístico, zero token) ----------
create table if not exists pinguim.monitor_grupos_padroes (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null check (categoria in ('pedido_ajuda','reclamacao','chateado_risco')),
  expressao  text not null,            -- regex aplicada ao texto NORMALIZADO
  peso       int  not null default 3,  -- >=3 dispara sozinho; 1-2 só somando
  descricao  text,
  ativo      boolean not null default true,
  origem     text not null default 'seed-v1',
  criado_em  timestamptz not null default now()
);
comment on table pinguim.monitor_grupos_padroes is
  'Regras regex do classificador de mensagens dos grupos. Editar aqui = muda o monitor sem redeploy (cache 2 min na edge).';
alter table pinguim.monitor_grupos_padroes enable row level security;

-- ---------- mensagens capturadas ----------
create table if not exists pinguim.monitor_grupos_mensagens (
  id               uuid primary key default gen_random_uuid(),
  grupo_jid        text not null,
  grupo_nome       text,
  message_id       text not null,
  remetente_jid    text,              -- participant do payload
  remetente_nome   text,              -- pushName
  eh_admin         boolean not null default false,
  texto            text not null,
  categoria        text check (categoria in ('pedido_ajuda','reclamacao','chateado_risco')),
  score            int not null default 0,
  padroes          jsonb not null default '[]',  -- descrições das regras que bateram
  msg_timestamp    timestamptz,
  alertado_em      timestamptz,       -- quando a DM Discord saiu
  alerta_suprimido text,              -- 'admin' | 'debounce' | erro do Discord
  criado_em        timestamptz not null default now(),
  unique (grupo_jid, message_id)
);
comment on table pinguim.monitor_grupos_mensagens is
  'Toda mensagem de texto dos grupos monitorados. categoria NULL = não flagada (corpus pra evoluir padrões / base de conhecimento de processos).';
create index if not exists idx_monitor_msgs_grupo_data
  on pinguim.monitor_grupos_mensagens (grupo_jid, criado_em desc);
create index if not exists idx_monitor_msgs_flag
  on pinguim.monitor_grupos_mensagens (categoria, criado_em desc)
  where categoria is not null;
-- debounce: última DM por autor+grupo
create index if not exists idx_monitor_msgs_debounce
  on pinguim.monitor_grupos_mensagens (grupo_jid, remetente_jid, alertado_em desc)
  where alertado_em is not null;
alter table pinguim.monitor_grupos_mensagens enable row level security;

-- ---------- seed: 10 grupos (JIDs resolvidos pelos links de convite 26/08/2026) ----------
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363280109272973@g.us', 'Mentoria Lyra', 'https://chat.whatsapp.com/FFLAUxbsryR1kRKMm1lK3d') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363047914232526@g.us', 'TAURUS MASTER', 'https://chat.whatsapp.com/FI6ipGtl8DFFgOtdO3BPvw') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363234409119884@g.us', 'TAURUS MASTER | AVISOS', 'https://chat.whatsapp.com/Jvgr9WsjriyK04XWW4gYpV') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363428096569113@g.us', 'TAURUS LT', 'https://chat.whatsapp.com/FGDlTlupeGx8oluJlqlyWD') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363410414674397@g.us', 'TAURUS LT | AVISOS', 'https://chat.whatsapp.com/IXgt18rrdE21xwyiKIjA3k') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363023412559361@g.us', 'MASTERMIND ORION', 'https://chat.whatsapp.com/J98UeBUVP3B0GpOpKETIIr') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363404699753723@g.us', 'ProAlt Low Ticket', 'https://chat.whatsapp.com/Gw037dAGxniKlDxuNTYgLx') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363422978864965@g.us', 'AVISOS | ProAlt Low Ticket', 'https://chat.whatsapp.com/DuMbV5jUSf1IocubPReY5a') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363422749349891@g.us', 'CANCELAMENTO COLETIVO | ELO', 'https://chat.whatsapp.com/IkWBfkc53kpASCWH3zOaMo') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;
insert into pinguim.monitor_grupos (jid, nome, link_convite) values ('120363407812977432@g.us', 'AVISOS | ELO', 'https://chat.whatsapp.com/HuvniuOWeLQ6TV9BpL0bnK') on conflict (jid) do update set nome = excluded.nome, link_convite = excluded.link_convite, ativo = true;

-- ---------- seed: padrões v1 (calibrados no corpus real) ----------
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bnao (recebi|chegou|veio|caiu) (o |a |os |as |meu |minha |nenhum )?(acesso|link|email|e-mail|senha|convite|certificado|material|bonus|gravacao|aula|login|confirmacao)', 3, 'não recebi acesso/link/email...');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(comprei|paguei|assinei) e nao (recebi|chegou|veio) nada\b', 3, 'comprei e não recebi nada');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(meu|o) acesso (nao|ainda nao|nunca) (chegou|veio|liberou|caiu|funciona)', 3, 'meu acesso não chegou');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bsem acesso\b', 3, 'sem acesso');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bnao (consigo|consegui|to conseguindo|estou conseguindo) (acessar|entrar|logar|abrir|assistir|baixar|fazer login|ver a aula|acesso)', 3, 'não consigo acessar/entrar/logar');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bnao (liberou|liberaram|foi liberad)', 3, 'não liberou/liberaram');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\baula (nao|ainda nao) (liberou|foi liberada|caiu|apareceu|subiu|esta disponivel|ta disponivel)', 3, 'aula não liberada');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(cade|kd) (o |a |meu |minha )?(link|acesso|aula|grupo|senha|email|e-mail|certificado|gravacao|bonus|material)', 3, 'cadê o link/acesso/aula');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(link|pagina|site|plataforma|area de membros|app|sistema|portal) (nao|n|nunca) (abre|funciona|carrega|entra)', 3, 'plataforma/link não abre');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\blink (quebrado|invalido|errado|expirado|expirou)\b', 3, 'link quebrado/expirado');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(dando|deu|da|apresentou) erro\b', 3, 'deu/dando erro');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\berro (ao|na|no|de) (logar|entrar|acessar|login|pagamento|compra|checkout)', 3, 'erro ao logar/pagar');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(esqueci|perdi|nao lembro) (a |minha )?senha\b', 3, 'esqueci a senha');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bsenha (nao funciona|invalida|errada|incorreta)\b', 3, 'senha não funciona');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bperdi o acesso\b|\bacesso expirou\b|\bmeu acesso sumiu\b', 3, 'perdi o acesso');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(plataforma|site|area de membros|app|sistema|portal) .{0,20}fora do ar\b', 3, 'plataforma fora do ar');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(email|e-mail) (nao|nunca|ainda nao) (chegou|veio|recebi)\b', 3, 'email não chegou');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(paguei|comprei|efetuei o pagamento|fiz o pix|fiz a compra|assinei)\b.{0,60}\b(nao (recebi|chegou|veio|caiu|liberou|tenho acesso|consigo acessar)|sem acesso|cade|ate agora nada)\b', 3, 'paguei e não recebi');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(ate agora|ainda) (nao (chegou|veio|recebi|liberou|caiu|deu certo)|nada)\b', 3, 'até agora nada');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bfora do ar\b', 2, 'fora do ar (genérico)');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(alguem|algm) (pode |consegue )?(me )?ajudar?\b|\bme ajuda\b|\bpreciso de ajuda\b|\bsocorro\b', 2, 'pedido de ajuda genérico');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\b(tentei|chamei|acionei|mandei (mensagem|msg) (pro|para o)) (falar com o )?suporte\b|\bsuporte (nao|nunca) (responde|respondeu|retornou|me atendeu)\b', 3, 'buscando suporte (1ª pessoa)');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bsuporte\b', 2, 'menção a suporte');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\btravou\b|\btravando\b|\bbugou\b|\bbugado\b|\bcom bug\b', 2, 'travou/bugou');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bnao (recebi|chegou|veio|caiu)\b', 2, 'não recebi (genérico)');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bnao (achei|acho|encontrei|encontro|localizei) (a aula|o link|o acesso|o email|o e-mail|a senha|o material|a gravacao|o bonus|o grupo)', 3, 'não achei a aula/link');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bquando (libera|vai liberar|vao liberar|sai a aula|abre o acesso)\b', 2, 'quando libera');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bnao (funciona|funcionou|abre|abriu|carrega|carregou)\b', 1, 'não funciona (genérico)');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('pedido_ajuda', '\bnao consigo\b', 1, 'não consigo (genérico)');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\b(que|um|e um|isso e um) absurdo\b', 2, 'que absurdo');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bdescaso\b|\bfalta de (respeito|consideracao|organizacao|profissionalismo|comprometimento)\b', 3, 'descaso / falta de respeito');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bpalhacada\b|\bque vergonha\b|\bvergonhoso\b|\bpouca vergonha\b', 3, 'palhaçada/vergonha');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bpior (curso|mentoria|suporte|atendimento|experiencia|compra)\b', 3, 'pior curso/suporte');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\binadmissivel\b|\binaceitavel\b|\brevoltante\b|\bindignad|\brevoltad', 3, 'inadmissível/revoltado');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bninguem (responde|me responde|respondeu|me respondeu|retorna|retornou|da atencao|resolve|resolveu|ajuda|ajudou)\b', 3, 'ninguém responde');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bnao (respondem|me respondem|atendem|me atenderam|dao suporte|resolvem|resolveram)\b', 3, 'não respondem/resolvem');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bsem (resposta|retorno|posicao|posicionamento) (do suporte|da equipe|de ninguem|ate agora)\b', 3, 'sem resposta do suporte');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\b(to|tou|estou|sigo|continuo) esperando\b.{0,60}\b(dias|semanas|horas|muito tempo|ate agora|resposta|retorno)\b', 3, 'esperando há dias');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\b(ja )?faz \d+ (dias|semanas|horas)\b.{0,60}\b(nao|sem|nada|esperando|aguardando)\b', 3, 'faz X dias e nada');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\baguardando (resposta|retorno|posicionamento|solucao) (ha|a|faz|desde)\b', 3, 'aguardando desde');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\b(de novo|dnv|novamente|mais uma vez) (isso|esse (erro|problema)|o mesmo (erro|problema))\b', 3, 'de novo esse erro');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bsempre a mesma coisa\b|\btoda vez (isso|a mesma|da (erro|problema))\b', 3, 'sempre a mesma coisa');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\b(to|tou|estou|fiquei|muito|super|bem) (decepcionad|frustrad|chatead|insatisfeit)', 3, 'estou decepcionado/frustrado');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bque decepcao\b|\bdecepcionante\b|\bfrustrante\b', 3, 'que decepção/frustrante');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bpropaganda enganosa\b|\benganacao\b|\bme enganaram\b|\bfui enganad|\bme sentindo enganad|\bfui lesad|\bme sinto lesad', 3, 'enganação');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\b(nao|n) (cumpriram|cumpriu|foi cumprido)\b|\bnao era o (combinado|prometido)\b|\bprometeram e\b', 3, 'não cumpriram o prometido');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bprocon\b|\breclame aqui\b', 3, 'procon/reclame aqui');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\b(quero|vou) (fazer uma |registrar uma |deixar uma )?reclamacao\b|\bvim reclamar\b', 3, 'quero reclamar');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bpessimo\b|\bhorrivel\b|\bridiculo\b', 2, 'péssimo/horrível (genérico)');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('reclamacao', '\bque (bagunca|desorganizacao|confusao)\b', 2, 'que bagunça');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\b(quero|vou|como faco pra|como posso|como faz pra|preciso|pensando em|pensando seriamente em) cancelar\b', 3, 'quero/vou cancelar');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bcancelar (minha|meu|a minha|o meu) (assinatura|inscricao|matricula|compra|mentoria|plano|acesso)\b', 3, 'cancelar minha assinatura');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bcomo (cancelo|cancela)\b', 3, 'como cancelo');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\b(quero|pedir|solicitar|solicito|vou pedir|como pecar|como peco|preciso do|exijo) (o |um |meu )?(reembolso|estorno)\b', 3, 'quero reembolso');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bmeu (reembolso|estorno|dinheiro de volta)\b|\bquero meu dinheiro\b|\bdevolvam? (o )?meu dinheiro\b|\bdinheiro de volta\b', 3, 'meu dinheiro de volta');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bdesisto\b|\bvou desistir\b|\bdesistindo (da|do|de)\b|\bto desistindo\b', 3, 'desisto');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\b(vou|quero|to saindo|estou saindo|pensando em) sair (do|da|dessa|desse) (grupo|mentoria|curso|comunidade|programa)\b', 3, 'vou sair da mentoria');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bme arrependi\b|\barrependid(o|a) de ter (comprado|entrado|assinado|pago)\b', 3, 'me arrependi');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bnao vale o que paguei\b|\bnao valeu o investimento\b|\bnao compensa o valor\b', 3, 'não vale o que paguei');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bjoguei dinheiro fora\b|\bdinheiro jogado fora\b|\bperdi meu dinheiro\b', 3, 'dinheiro fora');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bvou (processar|acionar (a justica|juridicamente|meu advogado)|denunciar)\b|\bmedidas (legais|judiciais|cabiveis)\b|\bjudicialmente\b', 3, 'vou processar');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bisso e golpe\b|\bparece golpe\b|\bcai num golpe\b', 3, 'isso é golpe');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bnao aguento mais\b', 2, 'não aguento mais');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\b(cansei|cansad(o|a)) de (esperar|aguardar|cobrar|pedir|reclamar)\b', 3, 'cansei de esperar');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bultima (vez|chance) que (compro|assino|confio|entro)\b', 3, 'última vez que compro');
insert into pinguim.monitor_grupos_padroes (categoria, expressao, peso, descricao) values ('chateado_risco', '\bnao vale a pena\b|\bperda de (tempo|dinheiro)\b', 1, 'não vale a pena (genérico)');
