-- ========================================================================
-- SEED INICIAL — 6 produtos + respectivos Cérebros
-- ========================================================================
-- Executar após aplicar o schema.sql.
-- Idempotente: usa upsert (on conflict do nothing) pra poder rodar 2x.
-- ========================================================================

-- Produtos
insert into produtos (slug, nome, emoji, descricao, status) values
  ('pinguim', 'Pinguim (Empresa)', '🐧', 'Cérebro global da agência — contexto que vale pra tudo.', 'ativo'),
  ('elo',     'Elo',                '🔗', 'Programa de aceleração — ticket médio, desafio LoFi como front.', 'ativo'),
  ('proalt',  'ProAlt',             '⚡', 'Programa Alta Performance — ticket alto, Desafio LT como front.', 'ativo'),
  ('taurus',  'Taurus',             '🐂', 'High ticket — mentoria premium.', 'em_construcao'),
  ('lira',    'Lira',               '🎵', 'High ticket — mentoria premium.', 'em_construcao'),
  ('orion',   'Orion',              '✨', 'High ticket — mentoria premium.', 'em_construcao')
on conflict (slug) do nothing;

-- Cérebros (1:1 com produto)
insert into cerebros (produto_id, preenchimento_pct, mapa_md)
select p.id, 0, '# Cérebro ' || p.nome || E'\n\nCérebro inicial. Preencher conforme material é adicionado.'
from produtos p
where not exists (select 1 from cerebros c where c.produto_id = p.id);

-- Squads iniciais
insert into squads (slug, nome, emoji, caso_de_uso, status, prioridade, objetivo) values
  ('suporte-operacional', 'Suporte Operacional Pinguim', '🛟',
   'Backoffice da equipe Pinguim — checar acesso, validar compra, cadastrar liberação, escalar.',
   'em_teste', 1,
   'Reduzir em 80% o tempo gasto em pedidos repetitivos.'),
  ('low-ticket', 'Low Ticket Perpétuo', '🎯',
   'Rodar campanhas perpétuas de produtos low ticket — da estratégia à análise.',
   'planejado', 2,
   'Manter funil low ticket rodando 24/7 sem intervenção humana diária.'),
  ('high-ticket', 'High Ticket', '💎',
   'Funil de aplicação, qualificação, VSL e CS para produtos premium.',
   'planejado', 3,
   'Operar funil high ticket end-to-end com IA + humano no closing.'),
  ('lancamento-pago', 'Lançamento Pago (Desafio)', '🚀',
   'Mini-agência completa pra rodar qualquer desafio — copy, tráfego, gestão, análise.',
   'planejado', 4,
   'Rodar desafio inteiro (37 dias) com squad autônomo.')
on conflict (slug) do nothing;

-- Agentes do squad Suporte Operacional
insert into agentes (
  slug, squad_id, nome, avatar, cor, status, missao, entrada, saida_esperada,
  limites, handoff, criterio_qualidade, metrica_sucesso, modelo, modelo_fallback,
  custo_estimado_exec, canais, ferramentas
)
select
  'roteador',
  (select id from squads where slug = 'suporte-operacional'),
  'Roteador', 'RO', '#E85C00', 'em_teste',
  'Receber pedido bruto do canal, identificar produto e aluno, direcionar pro agente certo.',
  'Mensagem livre do canal (Discord/Telegram/WhatsApp) vinda da equipe Pinguim.',
  'JSON estruturado { tipo_pedido, aluno_id, produto, canal_resposta, prioridade }.',
  'Não consulta sistema, não resolve. Só triagem.',
  'Consultor Hotmart se precisa confirmar compra. Consultor Supabase se pedido é sobre acesso.',
  'Classifica corretamente em <2s. Nunca inventa aluno — se ambíguo, pede esclarecimento.',
  '95% de roteamento correto em 100 casos de eval.',
  'gpt-4o-mini', 'gpt-4o', 0.001,
  array['discord','telegram','whatsapp'], array['canal-reader']
where not exists (select 1 from agentes where slug = 'roteador');

insert into agentes (
  slug, squad_id, nome, avatar, cor, status, missao, entrada, saida_esperada,
  limites, handoff, criterio_qualidade, metrica_sucesso, modelo, modelo_fallback,
  custo_estimado_exec, canais, ferramentas
)
select
  'consultor-hotmart',
  (select id from squads where slug = 'suporte-operacional'),
  'Consultor Hotmart', 'CH', '#FB923C', 'planejado',
  'Confirmar compra de um aluno específico em um produto específico via Hotmart API.',
  'CPF ou e-mail do aluno + nome do produto.',
  'JSON { comprou, data_compra, produto_variacao, ordem_id }.',
  'Só leitura na Hotmart. Não cadastra, não edita.',
  'Consultor Supabase Pinguim quando compra confirmada. Humano se Hotmart falhar 3x.',
  'Responde em <5s. Nunca inventa. Se não achou, diz não_encontrado e escala.',
  '99% de acerto em 100 casos.',
  'gpt-4o-mini', 'gpt-4o', 0.002,
  array['discord'], array['hotmart-api-read']
where not exists (select 1 from agentes where slug = 'consultor-hotmart');

insert into agentes (
  slug, squad_id, nome, avatar, cor, status, missao, entrada, saida_esperada,
  limites, handoff, criterio_qualidade, metrica_sucesso, modelo, modelo_fallback,
  custo_estimado_exec, canais, ferramentas
)
select
  'consultor-supabase',
  (select id from squads where slug = 'suporte-operacional'),
  'Consultor Supabase Pinguim', 'CS', '#FDBA74', 'planejado',
  'Verificar no sistema interno da Pinguim se o acesso do aluno está liberado ao produto.',
  'aluno_id + produto_id.',
  'JSON { tem_acesso, data_expiracao, observacoes }.',
  'Só leitura. Não cadastra.',
  'Propositor se acesso faltando. Humano em erro de API.',
  'Resposta em <3s. JSON válido.',
  'Taxa de resposta correta ≥ 98%.',
  'gpt-4o-mini', 'gpt-4o', 0.001,
  array['discord'], array['supabase-pinguim-read']
where not exists (select 1 from agentes where slug = 'consultor-supabase');

insert into agentes (
  slug, squad_id, nome, avatar, cor, status, missao, entrada, saida_esperada,
  limites, handoff, criterio_qualidade, metrica_sucesso, modelo, modelo_fallback,
  custo_estimado_exec, canais, ferramentas
)
select
  'propositor',
  (select id from squads where slug = 'suporte-operacional'),
  'Propositor', 'PR', '#FED7AA', 'planejado',
  'Montar ação estruturada (cadastrar acesso, liberar produto, escalar) e aguardar aprovação humana.',
  'Contexto consolidado do Roteador + Consultores.',
  'Task em status aguardando_aprovacao com ação pré-montada.',
  'Nunca executa direto. Só propõe.',
  'Executor após aprovação humana no painel.',
  'Ação clara, reversível, auditada.',
  'Aprovação humana ≥ 95% em 200 casos antes de virar autônomo.',
  'gpt-4o', null, 0.015,
  array['painel'], array['task-writer']
where not exists (select 1 from agentes where slug = 'propositor');

-- Canais integrados (registros pra Discord/WA/Telegram — ainda inativos no V0)
insert into canais_integrados (tipo, identificador, apelido, cerebro_alvo, ativo, config)
values
  ('discord',  'pinguim-depoimentos', 'Discord #depoimentos', null, false,
    '{"modo":"scan_periodico","schedule":"0 */6 * * *","observacao":"multi-produto; curador identifica"}'::jsonb),
  ('whatsapp', 'grupo-elo-alumni',    'WA Elo Alumni',
    (select c.id from cerebros c join produtos p on p.id=c.produto_id where p.slug='elo'), false,
    '{"modo":"scan_diario","schedule":"0 23 * * *"}'::jsonb),
  ('telegram', 'canal-pinguim-geral', 'Telegram Pinguim Geral', null, false,
    '{"modo":"scan_diario"}'::jsonb)
on conflict do nothing;

-- Crons metadata (para exibição na tela Crons; pg_cron real ativa em V1)
insert into crons (slug, nome, descricao, schedule_expression, alvo, ativo) values
  ('varre_discord_depoimentos', 'Varrer Discord #depoimentos', 'Lê mensagens novas, curador classifica e arquiva no Cérebro correto.', '0 */6 * * *', 'canais_integrados', false),
  ('varre_wa_grupos',            'Varrer grupos WhatsApp',      'Scan diário dos grupos — feedback de alunos vira contexto.',         '0 23 * * *', 'canais_integrados', false),
  ('consolida_memoria_noturna',  'Consolidar memória noturna',  'Extrai lições do dia e atualiza os Cérebros.',                       '0 23 * * *', 'cerebros',         false),
  ('relatorio_saude_cerebros',   'Relatório semanal de saúde',   'Segunda 8h, reporta preenchimento e gaps de cada Cérebro.',          '0 8 * * 1',  'cerebros',         false),
  ('alerta_cerebros_estagnados', 'Alerta Cérebros parados',      'Avisa sobre Cérebros sem alimentação há >7 dias.',                   '0 9 * * 1',  'cerebros',         false)
on conflict (slug) do nothing;

-- Skills universais base
insert into skills (slug, nome, categoria, descricao, universal, versao) values
  ('gsd-mode',                   'GSD Mode',                       'operacional', 'Get Shit Done — agente executa direto, sem pedir confirmação pra cada passo.', true, 'v1.0'),
  ('super-powers',               'Super Powers',                   'operacional', 'Pro-atividade + plano de execução em etapas + validação antes de marcar feito.', true, 'v1.0'),
  ('criar-desafio-com-referencia','Criar desafio a partir de referência externa','produto', 'Analisa material de concorrente e propõe desafio equivalente pro produto X.', true, 'v1.0'),
  ('gerar-copy-pagina-de-vendas','Gerar página de vendas',          'copy',        'Cria página 12 dobras a partir do Cérebro do produto + framework Copy Chief.', true, 'v1.0'),
  ('responder-objecao-aluno',    'Responder objeção de aluno',      'suporte',     'Consulta Cérebro, encontra objeção similar, devolve resposta.',                 true, 'v1.0'),
  ('produzir-carrossel',         'Produzir carrossel Instagram',    'conteudo',    'Gera texto e estrutura de carrossel de X slides com base no Cérebro.',          true, 'v1.0'),
  ('briefing-pre-call',          'Briefing pré-call',               'comercial',   'Analisa lead + histórico + gera briefing pro closer antes da call.',            true, 'v1.0'),
  ('transcrever-video-youtube',  'Transcrever vídeo do YouTube',    'ingestao',    'URL do YouTube → transcrição Whisper → salva no Cérebro.',                      true, 'v1.0'),
  ('importar-csv',               'Importar CSV genérico',           'ingestao',    'Sobe CSV, detecta colunas genéricas, cria peças no Cérebro.',                   true, 'v1.0'),
  ('curador-classificar',        'Curador — classificar peça nova', 'curadoria',   'Classifica peça (relevante/ruído/duplicado) + identifica produto.',             true, 'v1.0')
on conflict (slug) do nothing;

-- FIM DO SEED
