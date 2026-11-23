-- Reembolso pelo bot: teto por produto, canal de reembolso e textos (André 23/11/2026)
-- A IA reembolsa sozinha dentro da garantia e até R$ 3.500 POR PRODUTO. Acima do teto, fora do prazo ou com falha → chamado
-- para o Luiz Guilherme (faz na Hotmart). Todo pedido confirmado vai para o canal #reembolso: Rafael e Djairo tiram o acesso
-- (o acesso sai já no pedido confirmado), a tutora dona do aluno tira do grupo e acompanha.
insert into pinguim.bot_config (chave, valor) values ('reembolso', '{
  "teto_produto": 3500,
  "discord_canal": "1574456169823609033",
  "discord": { "rafael": "1083728715726463068", "djairo": "1083731934238228590", "ingrid": "1205120597433122846", "fernanda": "1210285892489449603", "luiz": "1084804999151878206" }
}'::jsonb)
on conflict (chave) do update set valor = excluded.valor;

-- confirmação com a IA reembolsando: deixa claro que é definitivo e que o acesso é encerrado
update pinguim.bot_template set corpo = 'Dentro do prazo de garantia de {{prazo}}, você tem direito ao reembolso de:

{{compra}}{{aviso_fora}}

Atenção: o reembolso é definitivo. Depois de confirmado, não há como cancelar o pedido nem desfazer o reembolso, e o seu acesso ao conteúdo é encerrado.

Posso fazer o seu reembolso?

1 - Sim, quero o reembolso
2 - Prefiro falar com um atendente antes

Responda só com o número.', atualizado_em = now() where slug = 'cancel_reemb_confirma';

-- confirmação quando tudo vai para análise (fora do prazo ou acima do teto)
insert into pinguim.bot_template (slug, descricao, corpo) values ('cancel_pedido_confirma', 'Reembolso: confirmação do pedido que vai para análise da equipe (fora do prazo ou acima do teto)', 'Encontrei a compra:

{{compra}}

{{motivo}} Por isso, o seu pedido de reembolso passa por uma análise da nossa equipe.

Atenção: ao confirmar o pedido, o seu acesso ao conteúdo é encerrado e o pedido não pode ser desfeito.

Quer registrar o pedido de reembolso?

1 - Sim, quero registrar o pedido
2 - Prefiro falar com um atendente antes

Responda só com o número.')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();

-- depois do "sim": pedido registrado para análise
insert into pinguim.bot_template (slug, descricao, corpo) values ('cancel_analise', 'Reembolso: pedido confirmado que ficou para a equipe analisar', 'Pedido registrado{{nome}}.

{{compra}}

A nossa equipe ({{responsavel}}) vai analisar e responder você aqui mesmo, nesta conversa.

Protocolo: #{{protocolo}}')
on conflict (slug) do update set corpo = excluded.corpo, descricao = excluded.descricao, atualizado_em = now();
