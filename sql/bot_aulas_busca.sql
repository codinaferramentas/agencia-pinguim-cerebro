-- ============================================================
-- Busca de aulas pelo bot (André 22/10): o aluno descreve a aula, o bot procura no catálogo da
-- área de membros (Hotmart Club) e devolve até 3 aulas com o link. Sem IA: busca por palavras + sinônimos.
-- Área certa = pela COMPRA do email (club_area_produto). Todas as compras (antigas e novas)
-- vão pras áreas NOVAS da conta instituto. Recorrentes = só forma de pagamento.
-- Link: https://hotmart.com/pt-BR/club/{area_slug}/products/{produto_hotmart_id}/content/{page_id}
-- ============================================================

create table if not exists pinguim.club_area (
  id text primary key,                         -- 'elo' | 'proalt'
  nome text not null,                          -- como o aluno chama ("Elo", "ProAlt")
  conta text not null check (conta in ('pinguim', 'instituto')),
  subdomain text not null,                     -- subdomínio técnico da API (Configurações → Integrações)
  area_slug text not null,                     -- pedaço do link (micha-menezes-oficial…)
  produto_hotmart_id bigint not null,          -- produto que tem as aulas
  ativo boolean not null default true,         -- false = bot não usa (ex.: link ainda não confirmado)
  observacao text,
  sincronizado_em timestamptz,
  total_aulas int,
  erro_sync text,
  criado_em timestamptz not null default now()
);

create table if not exists pinguim.club_area_produto (
  area_id text not null references pinguim.club_area(id) on delete cascade,
  produto_id uuid not null,                    -- crm_compra.produto_id (id do produto no Dash)
  produto_nome text,
  primary key (area_id, produto_id)
);

create table if not exists pinguim.club_aula (
  area_id text not null references pinguim.club_area(id) on delete cascade,
  page_id text not null,
  modulo text,
  modulo_ordem int,
  aula text not null,
  aula_ordem int,
  publicada boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (area_id, page_id)
);

alter table pinguim.club_area enable row level security;
alter table pinguim.club_area_produto enable row level security;
alter table pinguim.club_aula enable row level security;

insert into pinguim.club_area (id, nome, conta, subdomain, area_slug, produto_hotmart_id, ativo, observacao) values
  ('elo', 'Elo', 'instituto', 'comunidadeelocriadoresdeconteu', 'micha-menezes-oficial', 8269933, true,
   'Link conferido 22/10 com o exemplo do André (aula Z72dRpP64N).'),
  ('proalt', 'ProAlt', 'instituto', 'proaltprogramaaceleracaolowtic', 'pedro-aredes-oficial', 8293613, false,
   'Subdomínio confirmado pela API (110 aulas). Área do link (pedro-aredes-oficial) AINDA NÃO CONFIRMADA: ligar depois que alguém com acesso abrir um link de teste.')
on conflict (id) do nothing;

-- quem comprou estes produtos tem direito à área (antigos e novos; recorrente e combos incluídos)
insert into pinguim.club_area_produto (area_id, produto_id, produto_nome) values
  ('elo', 'c9de0ad1-f87d-41f4-aa26-89bf822a4895', 'ELO'),
  ('elo', 'b4eb2eb0-3cac-467e-8edc-a6eaaf24a771', 'ELO RECORRENTE'),
  ('elo', 'c3605d2d-391c-4b46-b38e-9cacd8766268', 'Comunidade ELO - Criadores de Conteúdo Lo-fi'),
  ('elo', 'cbe402ef-2371-4d01-9f7b-22d33ada79a1', 'ELO - Recorrente'),
  ('elo', 'f9f89118-ae21-4ac8-b1dc-61dfaede56c1', 'ProAlt + Ciclo'),
  ('elo', '07857dc6-a6e3-4687-9db7-ce6cb62750ba', 'Oferta Black Absurda'),
  ('proalt', '322fed48-c776-4f06-80e1-97e26c2789a2', 'ProAlt - Low Ticket'),
  ('proalt', '77d082ab-ef7a-469a-9b68-25e2744ae924', 'ProAlt - Low Ticket - Recorrente'),
  ('proalt', '509fd975-cd71-4e39-8097-7ee7586f4772', 'ProAlt - Programa Aceleração Low Ticket'),
  ('proalt', '41bd669b-2d18-4092-8230-cd6eb471b1c4', 'Proalt - Recorrente'),
  ('proalt', 'f9f89118-ae21-4ac8-b1dc-61dfaede56c1', 'ProAlt + Ciclo'),
  ('proalt', 'a632d947-6294-460f-82c7-e4007b51b9d7', 'ProAlt | VITALÍCIO'),
  ('proalt', '07857dc6-a6e3-4687-9db7-ce6cb62750ba', 'Oferta Black Absurda')
on conflict do nothing;

-- sinônimos da busca (editáveis em Atendimento → Configurações): palavra que o aluno usa → palavras dos títulos
insert into pinguim.bot_config (chave, valor) values ('aulas_sinonimos', '{
  "precificacao": ["preco", "valor"],
  "preco": ["precificacao", "valor"],
  "rastreamento": ["pixel", "traqueamento", "tracking"],
  "traqueamento": ["pixel", "rastreamento", "tracking"],
  "pagina": ["landing", "site"],
  "anuncio": ["trafego", "campanha", "ads"],
  "trafego": ["anuncio", "campanha", "ads"],
  "reels": ["video", "formato", "roteiro"],
  "hotmart": ["plataforma"]
}'::jsonb) on conflict (chave) do nothing;

-- textos da busca de aulas (sem gíria)
insert into pinguim.bot_template (slug, descricao, corpo) values
  ('pede_email_aula_busca', 'Busca de aula: pede o email da compra (é por ele que o bot sabe as áreas do aluno)',
   'Para procurar a aula na sua área de membros, envie em uma mensagem o email que você usou na compra.'),
  ('aulas_busca_pede', 'Busca de aula: pede o tema',
   'Qual aula você está procurando? Escreva em poucas palavras o tema (por exemplo: como criar a página de vendas).'),
  ('aulas_resultado', 'Busca de aula: aulas encontradas ({{lista}} = até 3 aulas com módulo e link)',
   'Encontrei estas aulas:

{{lista}}

Se não for nenhuma delas, responda NÃO ou escreva o tema com outras palavras.'),
  ('aulas_busca_nada', 'Busca de aula: nada encontrado na 1ª tentativa',
   'Não encontrei uma aula com essas palavras. Tente escrever o tema de outro jeito (por exemplo: "página de vendas" ou "cadastrar produto").'),
  ('aulas_busca_video', 'Busca de aula: não encontrou, antes do vídeo de como procurar',
   'Não encontrei essa aula pela busca. Veja abaixo como procurar direto na área de membros:'),
  ('aulas_sem_compra', 'Busca de aula: email sem compra daquela área ({{area}}, {{email}})',
   'Não encontrei uma compra do {{area}} no email {{email}}. Abri um chamado para a nossa equipe ({{responsavel}}) verificar e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();

-- "aula"/"aulas" sozinho abre a trilha de aulas (cancelamento vem antes: "cancelar a aula" segue pro cancelamento)
insert into pinguim.bot_gatilho (trilha, expressao)
select 'aulas', 'aula' where not exists (select 1 from pinguim.bot_gatilho where trilha = 'aulas' and expressao = 'aula');

-- atualização diária do catálogo: 6h SP (9h UTC). O token é lido do banco na hora (não fica no texto do job).
select cron.schedule('bot-aulas-sync', '0 9 * * *', $$
  select net.http_get(
    url := 'https://crm-pinguim.vercel.app/api/bot/aulas-sync?t=' || (select valor#>>'{}' from pinguim.bot_config where chave = 'webhook_token'),
    timeout_milliseconds := 300000);
$$);

-- 22/10: link do ProAlt confirmado pelo André (aula R4jAb5adOa = "2-O que NÃO é Low Ticket") → área ligada
update pinguim.club_area set ativo = true, observacao = 'Link conferido 22/10 com o exemplo do André (aula R4jAb5adOa).' where id = 'proalt';
