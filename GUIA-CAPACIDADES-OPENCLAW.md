# Guia de Capacidades do OpenClaw

> O que eu posso oferecer pros clientes. Referência rápida pra usar em pitches e propostas.

---

## ONDE O AGENTE PODE ESCUTAR (canais de entrada)

| Canal | Funciona? | Como | Custo |
|-------|-----------|------|-------|
| **Telegram** | SIM | Cria bot via @BotFather, conecta no OpenClaw | Grátis |
| **WhatsApp** | SIM | QR Code (precisa de chip dedicado) | ~R$15/mês (chip) |
| **Discord** | SIM | Bot no Discord Developer Portal | Grátis |
| **Slack** | SIM | App integration | Grátis |
| **Signal** | SIM | Integração nativa | Grátis |
| **iMessage** | SIM | Só no Mac | Grátis |
| **Google Chat** | SIM | Integration | Grátis |
| **Microsoft Teams** | SIM | Integration | Grátis |
| **Email (Gmail)** | SIM | Pode ler, responder, enviar emails | Grátis (via Google Workspace skill) |
| **Grupo de WhatsApp** | SIM | Escuta e responde no grupo (como admin) | Mesmo chip |
| **Notion** | NÃO nativo | Não tem integração direta. Workaround: via API do Notion com script custom |
| **Instagram DM** | NÃO | Instagram bloqueia bots/automação de DM |
| **Instagram posts** | NÃO | Não publica nem agenda diretamente |

### Vantagens por canal:

- **Telegram**: mais flexível, grátis, bots nativos, melhor pra uso profissional com agentes
- **WhatsApp**: mais familiar pro cliente brasileiro, mas precisa de chip
- **Discord**: ideal pra equipes, canais separados por assunto
- **Email**: pode monitorar inbox e responder automaticamente

---

## O QUE O AGENTE PODE FAZER (skills)

### Comunicação e Mensagens
| Skill | O que faz |
|-------|-----------|
| Responder mensagens | Em qualquer canal conectado (Telegram, WA, Discord, etc.) |
| Enviar mensagens proativas | Crons que mandam mensagens em horários programados |
| Ler e responder emails | Gmail completo — ler, responder, enviar, classificar |
| Escutar em grupos | WhatsApp e Telegram — responde quando mencionado ou detecta pergunta |

### Pesquisa e Web
| Skill | O que faz |
|-------|-----------|
| **Buscar na internet** | Pesquisa Google, encontra artigos, tendências, referências |
| **Navegar sites** | Abre páginas, lê conteúdo, extrai dados, preenche formulários |
| **Tirar screenshots** | Captura tela de qualquer site |
| **Monitorar temas** | Tipo Google Alerts inteligente — busca recorrente sobre um tema |

### Google Workspace (skill GOG)
| Skill | O que faz |
|-------|-----------|
| **Google Calendar** | Ler agenda, criar eventos, verificar conflitos |
| **Google Drive** | Acessar, criar, editar arquivos |
| **Google Docs** | Criar e editar documentos |
| **Google Sheets** | Ler e escrever em planilhas |
| **Google Tasks** | Criar e gerenciar tarefas |
| **Gmail** | Ler, enviar, responder emails |

### Criação de Conteúdo (o agente cria, mas NÃO publica)
| Skill | O que faz |
|-------|-----------|
| Escrever textos | Copy, posts, carrosséis, roteiros, emails, páginas |
| Gerar PDFs | Formata conteúdo e exporta como arquivo |
| Criar briefings | Briefing de design, briefing pro freelancer |
| Planejar conteúdo | Calendário editorial, pautas, sugestões de formato |

### Código e Automação
| Skill | O que faz |
|-------|-----------|
| **Executar código** | Python, JavaScript, bash — roda scripts |
| **Acessar APIs** | Conecta com qualquer serviço que tenha API (Hotmart, Stripe, etc.) |
| **Ler/escrever banco de dados** | PostgreSQL, Supabase, MySQL via scripts |
| **Crons (rotinas agendadas)** | Qualquer tarefa no horário programado |
| **Backups automáticos** | Backup programado com versionamento |

### Integrações Confirmadas
| Serviço | O que faz |
|---------|-----------|
| **GitHub** | Ler/escrever repositórios, commits, PRs |
| **Hotmart** | Consultar vendas, alunos, produtos (via API) |
| **Stripe** | Pagamentos, assinaturas (via API) |
| **Spotify** | Controle de música |
| **Philips Hue** | Luzes inteligentes |
| **ElevenLabs** | Gerar áudio/voz |
| **Whisper** | Transcrever áudio em texto |

### Multi-agente
| Skill | O que faz |
|-------|-----------|
| **Orquestração** | Um agente coordena outros (Lobster engine) |
| **Delegação** | Agente aciona outro agente pra tarefa específica |
| **Memória compartilhada** | Todos acessam o mesmo cérebro (GitHub) |
| **Permissionamento** | Cada agente acessa só o que precisa |

---

## O QUE O AGENTE NÃO PODE FAZER

| Limitação | Detalhe |
|-----------|---------|
| **Publicar no Instagram** | Não agenda nem publica posts. Cria o conteúdo, mas publicar é manual ou via ferramenta externa (mLabs, etc.) |
| **Acessar Instagram DM** | Instagram bloqueia bots |
| **Fazer ligações telefônicas** | Não faz chamadas de voz |
| **Acessar Notion nativamente** | Não tem skill oficial. Workaround via API é possível mas complexo |
| **Editar vídeo** | Não edita vídeo. Cria roteiros e briefings, mas a edição é humana |
| **Criar imagens/design** | Não gera imagens (pode gerar via integração com DALL-E, mas qualidade limitada). Cria briefings de design pro freelancer |

---

## ESCALA DO ECOSSISTEMA

| Métrica | Número |
|---------|--------|
| Skills oficiais | 53 |
| Skills da comunidade (ClawHub) | 13.700+ |
| Canais de comunicação suportados | 50+ |
| Linguagens de código | Python, JavaScript, bash |

---

## COMO USAR ISSO NO PITCH

### Quando o cliente perguntar "mas ele faz X?":

**Se for sobre criar conteúdo:** "Sim, ele cria textos, copies, roteiros, carrosséis, emails, páginas — tudo pronto. A publicação no Instagram é a única parte que fica manual ou via ferramenta de agendamento."

**Se for sobre acessar ferramentas:** "Ele se conecta com mais de 50 canais e milhares de serviços. Gmail, Calendar, Drive, Hotmart, banco de dados — se tem API, ele conecta."

**Se for sobre pesquisa:** "Ele busca na internet, lê artigos, acompanha tendências do nicho e transforma isso em conteúdo pronto pro seu time."

**Se for sobre automação:** "Ele roda rotinas automáticas — relatórios diários, lembretes, backups, alertas. Configura uma vez, roda pra sempre."

**Se for sobre aprender:** "Ele aprende com cada conversa. Corrigiu uma vez? Nunca mais erra. Gostou do formato? Vira padrão. É como um funcionário que tem memória perfeita."

---

*Guia de referência — atualizar conforme descobrir novas capacidades.*
