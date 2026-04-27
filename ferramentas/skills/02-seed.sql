-- ============================================================================
-- Seed inicial do catalogo de Skills
-- ============================================================================
-- Estrategia: cataloga as Skills planejadas pra que o painel mostre algo logo
-- ja com cards "em construcao" (alinhado com feedback "marcar explicitamente
-- o que e em construcao"). Apenas 'buscar-cerebro' tem conteudo real e fica
-- 'em_construcao' (SKILL.md em disco existe). O resto fica 'planejada'.

INSERT INTO pinguim.skills (slug, nome, categoria, area, status, descricao, quando_usar, universal, versao)
VALUES
  -- UNIVERSAIS — qualquer agente pode usar
  ('buscar-cerebro', 'Buscar conhecimento em Cérebro',
   'universal', 'rag', 'em_construcao',
   'Consulta semântica em qualquer Cérebro do Pinguim. Retorna trechos relevantes com fonte citada.',
   'Sempre que o agente precisar consultar conhecimento curado do Pinguim sobre um produto, metodologia ou clone. Não usar pra fato genérico ou dado em tempo real.',
   true, 'v1.0'),

  ('google-drive-ler', 'Ler arquivo do Google Drive',
   'universal', 'integracoes', 'planejada',
   'Autentica e lê conteúdo de arquivo/pasta no Google Drive da equipe.',
   'Quando o agente precisar acessar documento, planilha ou pasta compartilhada da equipe.',
   true, 'v1.0'),

  ('google-calendar-criar-evento', 'Criar evento no Google Calendar',
   'universal', 'integracoes', 'planejada',
   'Cria evento no calendário e manda convite pros participantes.',
   'Quando o agente precisar agendar reunião, call de vendas, sessão de coaching, etc.',
   true, 'v1.0'),

  ('scraping-pagina-publica', 'Scraping de página pública',
   'universal', 'integracoes', 'planejada',
   'Pega HTML/texto de URL pública. Já existe ferramenta em ferramentas/scrap-pagina/.',
   'Quando precisar extrair texto de página de venda, blog, artigo, post de Instagram público.',
   true, 'v1.0'),

  ('enviar-mensagem-discord', 'Enviar mensagem no Discord',
   'universal', 'integracoes', 'planejada',
   'Posta mensagem em canal específico do Discord da Pinguim.',
   'Quando o agente precisar avisar a equipe, reportar tarefa, escalar pra humano.',
   true, 'v1.0'),

  ('enviar-email', 'Enviar email transacional',
   'universal', 'integracoes', 'planejada',
   'Envia email via Resend/SendGrid. Templates parametrizáveis.',
   'Quando precisar comunicar com aluno/cliente fora do Discord.',
   true, 'v1.0'),

  ('gerar-imagem', 'Gerar imagem com IA',
   'universal', 'conteudo', 'planejada',
   'Cria imagem via DALL-E/Flux a partir de prompt + identidade visual Pinguim.',
   'Quando o agente precisar de capa de carrossel, thumbnail de Reels, imagem pra anúncio.',
   true, 'v1.0'),

  -- POR ÁREA — família de agentes da mesma especialidade
  ('gerar-roteiro-reels-30s', 'Gerar roteiro de Reels (30s)',
   'por_area', 'marketing', 'planejada',
   'Roteiro completo (gancho + desenvolvimento + CTA) seguindo padrão Micha.',
   'Quando agente de conteúdo precisar produzir Reels lo-fi.',
   false, 'v1.0'),

  ('qualificar-lead-bant', 'Qualificar lead com BANT',
   'por_area', 'comercial', 'planejada',
   'Avalia Budget/Authority/Need/Timeline a partir de conversa do lead.',
   'Quando SDR ou agente comercial recebe lead novo.',
   false, 'v1.0'),

  ('classificar-ticket-suporte', 'Classificar ticket de suporte',
   'por_area', 'cs', 'planejada',
   'Categoriza dúvida (técnica/comercial/conteúdo) e prioridade.',
   'Quando agente de suporte recebe mensagem nova de aluno.',
   false, 'v1.0'),

  ('briefing-pre-call', 'Briefing pré-call',
   'por_area', 'comercial', 'planejada',
   'Compila histórico do lead + Cérebro do produto em briefing pro closer.',
   'Antes de toda reunião comercial, automaticamente.',
   false, 'v1.0'),

  ('relatorio-vendas-diario', 'Relatório diário de vendas',
   'por_area', 'dados', 'planejada',
   'Compila vendas do dia + comparativo + tendência.',
   'Cron 8h da manhã, posta no Discord da equipe.',
   false, 'v1.0')
ON CONFLICT (slug) DO NOTHING;
