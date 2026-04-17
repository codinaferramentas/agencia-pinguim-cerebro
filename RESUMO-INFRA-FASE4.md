# RESUMO DE INFRA — FASE 4 (Pedro)

> Documento consolidado do que precisa estar pronto pra ligar os agentes.
> Todos os agentes ja tem TOOLS.md individual com detalhes especificos.

---

## 1. Servidor + OpenClaw

### Servidor
- [ ] **Decisao:** Hostinger vs Hetzner (aguardando Pedro)
- [ ] **Specs minimas sugeridas:** 4 vCPU, 8GB RAM, 80GB SSD
- [ ] **OS:** Linux (Ubuntu 22.04 LTS)
- [ ] **Custo estimado:** R$ 50-150/mes

### OpenClaw
- [ ] Instalar OpenClaw no servidor (doc oficial do Peter Steinberger)
- [ ] Configurar .env (todas as chaves ficam aqui, NAO no GitHub)
- [ ] Configurar leitura do cerebro (filesystem direto)
- [ ] Provider default: **OpenAI** (GPT-5 / GPT-5 Mini conforme agente)

---

## 2. Chaves de API que precisam ser providenciadas

### Essenciais (MVP — Fase 4)

| API | Quem providencia | Onde conseguir | Custo |
|-----|------------------|----------------|-------|
| **OpenAI API Key** | Andre ja tem | platform.openai.com | Pay-per-use |
| **Hotmart API** | Pedro | Hotmart Developer | Gratis pra Pro+ |
| **Meta Ads API** | Pedro/Luiz | Meta Business Manager | Gratis |
| **Meta Pixel** | Pedro/Luiz | Meta Business Manager | Gratis |
| **Sendflow API** | Equipe | Painel Sendflow | Pago (plano atual) |
| **WhatsApp Business** | Pedro | Via Sendflow ou Meta Cloud | Varia |
| **Google Cloud (Workspace + Calendar + Docs + Sheets)** | Pedro | Google Cloud Console | Gratis (dentro dos limites) |
| **GitHub PAT** | Andre | Settings do Andre | Gratis |
| **Discord Bot Token** | Andre ou Pedro | Discord Developer Portal | Gratis |
| **Telegram Bot Token** | Andre ou Pedro | @BotFather | Gratis |

### Opcionais (Fase 5+)

| API | Quando | Custo |
|-----|--------|-------|
| **YouTube Data API** | Quando ativar agente YouTube | Gratis |
| **Instagram Graph API** | Quando ativar agentes Social Media | Gratis |
| **TikTok Marketing API** | Quando expandir trafego | Gratis |
| **SendGrid/email** | Quando automacoes de email forem ativas | Tem plano gratuito |
| **SerpAPI** | Quando precisar de trending data | Plano gratuito pequeno |

---

## 3. Ferramentas/Servicos que equipe PRECISA confirmar

Lista de perguntas que preciso responder pra fechar a lista:

- [ ] **CRM comercial:** Pinguim usa qual? (HubSpot, Pipedrive, RD Station...)
- [ ] **Plataforma de agenda:** Google Calendar? Outra?
- [ ] **Ferramenta de agendamento de call:** Calendly? Cal.com?
- [ ] **Formulario de aplicacao HT:** Typeform, Tally, Google Forms?
- [ ] **Ferramenta de email:** Hotmart propria? MailerLite? Outra?
- [ ] **Dashboard interno (TV Dash):** Stack/tecnologia?
- [ ] **Plataforma da pagina de vendas:** WordPress + Elementor? Outra?
- [ ] **Sirius (app LoFi):** Tem API publica ou acesso via painel web?
- [ ] **APP ProAlt:** Mesma pergunta — API? painel?
- [ ] **Ferramenta de agendamento de posts:** Buffer/Hootsuite ou manual?
- [ ] **Ferramenta de gestao de projetos:** Trello/Notion/Asana?

---

## 4. Chips / Numeros

- [ ] **Chip WhatsApp dedicado pro bot de suporte** (decisao do Luiz)
- [ ] **Numero Telegram** (gratis, so configurar @BotFather)
- [ ] **Bot do Discord** no servidor interno da Pinguim

---

## 5. Permissoes e Seguranca

### Acesso ao cerebro
- Agentes **leem** o cerebro via filesystem
- Agentes **escrevem** apenas na propria pasta (memoria propria + relatorios)
- Socios podem ler tudo

### .env (chaves secretas)
- Arquivo fica no servidor, **NUNCA** no GitHub
- .gitignore ja tem `.env` bloqueado
- Acesso via OpenClaw (todas as chaves em variaveis de ambiente)

### Permissoes por agente
Exemplos criticos:
- **Gestor de Lancamento:** escrita em Hotmart (precisa LOG de toda acao)
- **Trafego (Lancamento/LT):** escrita em Meta Ads (budget > limite pede aprovacao)
- **CS:** reembolso dentro da politica (fora exige aprovacao humana)

---

## 6. Custos mensais estimados (MVP)

| Item | Custo estimado/mes |
|------|--------------------|
| Servidor VPS | R$ 50-150 |
| OpenAI API (agentes ativos) | R$ 300-1.000 |
| Sendflow | Ja paga pela equipe |
| Hotmart | Ja paga pela equipe |
| Meta Ads API | R$ 0 |
| Google Cloud | R$ 0 (dentro dos limites) |
| **Total adicional (comeco)** | **R$ 350-1.150/mes** |

> Comparativo: 1 assistente humano = R$ 2.500-5.000/mes + encargos.

---

## 7. Ordem de ativacao sugerida

### Fase 4.1 — Infra basica
1. Servidor + OpenClaw rodando
2. Chave OpenAI configurada
3. Discord bot conectado
4. Acesso ao cerebro (filesystem) testado

### Fase 4.2 — Primeiro agente ativo
1. **Pinguim (orquestrador)** — roda no Discord, sem APIs externas
2. Testa conversacao, acionamento simulado

### Fase 4.3 — Agentes pessoais
1. **Agente do Luiz** primeiro (ele tem visao total, bom pra validar)
2. Google Calendar API
3. Hotmart + Meta Ads (leitura)
4. Depois agentes de Pedro, Micha, Andre

### Fase 4.4 — Suporte aos alunos
1. **Roteador** (mais simples)
2. **Suporte Elo** (21 aulas transcritas = base pronta)
3. **Suporte ProAlt** (pitch deck = base pronta)
4. WhatsApp via Sendflow

### Fase 4.5 — Squads especializadas
Ativar por ordem de prioridade/ROI:
1. Squad Lancamento Pago (proximo desafio)
2. Squad Low Ticket (produto perpetuo existente)
3. High Ticket (apoio interno)
4. Agencia Pinguim (operacional)

---

## 8. Proximos passos imediatos

1. **Pedro decide servidor** (Hostinger ou Hetzner)
2. **Andre ativa OpenClaw** no servidor escolhido
3. **Pedro/Luiz autorizam APIs:** Hotmart Developer + Meta Business Manager + Google Cloud
4. **Equipe responde** as perguntas da secao 3 (pra fechar a lista de ferramentas)
5. **Andre testa** primeiro agente (Pinguim) e valida com Luiz
6. A partir dai, deploy incremental por squad

---

**Nota:** Cada agente tem um TOOLS.md individual no cerebro detalhando suas ferramentas especificas. Este documento e o **resumo consolidado** pra reuniao com Pedro e equipe tecnica.
