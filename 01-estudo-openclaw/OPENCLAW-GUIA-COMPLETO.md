# OpenClaw — Guia Completo para o Projeto Squad

## O Que é OpenClaw?

OpenClaw é um **assistente de IA pessoal open-source** que roda na sua máquina (ou na nuvem) e executa tarefas reais no seu computador, navegador e aplicativos. É descrito como "a IA que realmente faz coisas".

> Diferente de chatbots que apenas respondem, o OpenClaw **age**: clica botões, digita comandos, envia emails, gerencia arquivos, navega sites.

### História

- **Nov/2025**: Criado por Peter Steinberger (dev austríaco) com o nome "Clawdbot"
- **Jan/2026**: Renomeado para "Moltbot" (reclamação de trademark da Anthropic)
- **Jan/2026**: Renomeado para "OpenClaw" (nome final)
- **Fev/2026**: Steinberger anuncia entrada na OpenAI; projeto passa para fundação sem fins lucrativos
- **Mar/2026**: 247.000+ stars no GitHub, 47.700+ forks

### Números

- Um dos projetos open-source de crescimento mais rápido da história
- 135.000+ instâncias ativas online (dados de fev/2026)
- Comparado ao impacto do lançamento do ChatGPT

---

## Como Funciona — Arquitetura

```
[Usuário] → [WhatsApp/Telegram/Slack/Discord] → [OpenClaw Gateway] → [LLM (Claude/GPT/Local)]
                                                        ↓
                                              [Skills/Ferramentas]
                                                        ↓
                                          [Navegador | Sistema | APIs | Email]
```

### Loop Agêntico

1. **Perceber** — recebe comando via chat ou evento
2. **Planejar** — LLM formula estratégia
3. **Agir** — executa usando skills disponíveis
4. **Observar** — registra resultados
5. **Comunicar** — reporta ao usuário

### Memória Persistente

O OpenClaw mantém memória de contexto e tarefas anteriores, permitindo:
- Acompanhamento de tarefas de longo prazo
- Comportamento contextual (lembra preferências)
- Vigilância contínua (ex: verificar status a cada 5 min)

---

## Requisitos Técnicos

| Requisito | Especificação |
|-----------|---------------|
| **Runtime** | Node.js v22+ |
| **Package Manager** | npm ou pnpm (recomendado) |
| **RAM** | 8GB mínimo (16GB recomendado para multi-agent) |
| **Disco** | 10GB livre |
| **API Keys** | OpenAI, Anthropic Claude, ou modelo local |
| **Sistema** | Mac, Windows, Linux |

---

## Instalação — 3 Opções

### Opção 1: One-liner (mais rápida)
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

### Opção 2: Via npm
```bash
npm i -g openclaw
openclaw onboard
```

### Opção 3: Do código-fonte (hackable)
```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw && pnpm install && pnpm run build
```

### Passos pós-instalação
1. Configurar API keys (Claude, GPT, ou modelo local)
2. Vincular canais (WhatsApp via QR, Slack com token, Telegram, etc.)
3. Revisar permissões do sistema
4. Iniciar gateway e testar

---

## Custos

| Item | Custo |
|------|-------|
| **OpenClaw** | GRATUITO (open-source, licença MIT) |
| **Cloud VM** | $5-10/mês (AWS gratuito 1 ano) |
| **APIs de IA** | Variável — alguns dólares/dia com uso intenso de GPT-4/Claude |
| **Serverless** | Potencialmente $0 com Cloudflare Workers |
| **Serviços auxiliares** | APIs de terceiros (geralmente baixo custo) |

> **Para o projeto Squad**: O custo principal será de APIs de IA. Estimativa: $50-200/mês dependendo do volume de uso dos agentes.

---

## Integrações (50+)

### Comunicação (canais de entrada)
- WhatsApp
- Telegram
- Discord
- Slack
- Signal
- iMessage

### Serviços que pode controlar
- Gmail / Google Calendar
- Spotify
- GitHub
- Twitter/X
- Obsidian
- E muitos outros via skills customizados

### Modelos de IA compatíveis
- Claude (Anthropic)
- GPT (OpenAI)
- Modelos locais (Ollama, MiniMax, etc.)

---

## Skills — O Coração do OpenClaw

Skills são módulos que habilitam ações específicas:

### Skills Nativos
- Execução de comandos shell
- Gerenciamento de arquivos
- Automação de navegador (headless Chrome)
- Email/SMTP
- Integração com calendários
- Chamadas de APIs externas

### ClawHub — Marketplace de Skills
Registro comunitário onde agentes podem descobrir e baixar extensões sob demanda.

### Skills Customizados
Você pode criar seus próprios skills para necessidades específicas da agência.

---

## Multi-Agent — Como Criar um Squad

### Abordagem 1: Múltiplas Instâncias Coordenadas
- Um agente "orquestrador" principal
- Agentes especializados sob supervisão (escritor, pesquisador, executor)
- Delegação de subtarefas

### Abordagem 2: OpenClaw-Agents (Recomendado)
Projeto: [github.com/shenhao-stu/openclaw-agents](https://github.com/shenhao-stu/openclaw-agents)

Kit pronto com **9 agentes especializados**:

| # | Agente | Função |
|---|--------|--------|
| 1 | 🐾 OpenClaw (main) | Orquestrador, auditoria, árbitro final |
| 2 | 🧠 Planner | Decomposição de tarefas e coordenação |
| 3 | 💡 Ideator | Geração de ideias e avaliação |
| 4 | 🎯 Critic | Avaliação de qualidade, detecção de anti-padrões |
| 5 | 📚 Surveyor | Pesquisa e identificação de lacunas |
| 6 | 💻 Coder | Implementação e execução |
| 7 | ✍️ Writer | Redação e formatação |
| 8 | 🔍 Reviewer | Revisão e estratégia |
| 9 | 📰 Scout | Monitoramento de tendências |

### Instalação do Multi-Agent
```bash
git clone https://github.com/shenhao-stu/openclaw-agents.git
cd openclaw-agents
chmod +x setup.sh
./setup.sh
```

### Arquitetura de Tensão Produtiva
```
💡 Ideator ↔ 🎯 Critic    (Criatividade vs. Avaliação)
✍️ Writer  ↔ 🔍 Reviewer   (Escrita vs. Revisão)
```

### Fluxo Principal
```
Usuário → 🐾 OpenClaw → 🧠 Planner → [Ideator↔Critic] → [Surveyor, Coder] → Writer → Reviewer
```

---

## Opções de Hospedagem

| Opção | Prós | Contras | Custo |
|-------|------|---------|-------|
| **PC Pessoal** | Simples, rápido | Só funciona ligado | $0 |
| **Mini PC dedicado** | 24/7, controle total | Investimento inicial | $200-500 (hardware) |
| **Cloud VPS** | 24/7, escalável | Custo mensal | $5-10/mês |
| **Serverless** | Sob demanda, barato | Experimental | ~$0 |

> **Recomendação para Agência Pinguim**: Começar com Cloud VPS (AWS/DigitalOcean) para ter disponibilidade 24/7 a custo baixo.

---

## Segurança — Importante!

### Boas Práticas
- Interface de controle: apenas localhost (usar SSH tunnel ou Tailscale para acesso remoto)
- Criar contas secundárias para os agentes (NUNCA usar contas pessoais)
- Começar com poucos skills e ir expandindo
- Ativar logging para monitoramento
- Solicitar confirmação para ações destrutivas

### Alertas
- Pesquisadores já encontraram vulnerabilidades (execução remota de código)
- Centenas de extensões maliciosas de terceiros detectadas
- Palo Alto Networks e Cisco alertaram sobre riscos
- **Mitigação**: usar apenas skills oficiais/verificados, manter atualizado

---

## Comparativo com Alternativas

| Aspecto | OpenClaw | CrewAI | LangChain | O-mega |
|---------|----------|--------|-----------|--------|
| **Tipo** | Agent generalist | Multi-agent framework | Dev framework | Multi-agent managed |
| **Setup** | Manual/código | Código Python | Código | GUI managed |
| **Custo** | Grátis + infra | Grátis + infra | Grátis | Subscription |
| **Flexibilidade** | Alta | Alta | Muito alta | Média |
| **Público** | Tech-savvy | Devs Python | Devs | Business |
| **Open Source** | Sim | Sim | Sim | Não |

---

## Links Importantes

- **Site oficial**: https://openclaw.ai
- **GitHub principal**: https://github.com/openclaw/openclaw
- **GitHub multi-agent**: https://github.com/shenhao-stu/openclaw-agents
- **Organização GitHub**: https://github.com/openclaw (24 repositórios)
- **Wikipedia**: https://en.wikipedia.org/wiki/OpenClaw

---

## O Que Você Precisa Saber para a Reunião

### Em 30 segundos:
"OpenClaw é uma ferramenta open-source e gratuita que permite criar agentes de IA que executam tarefas reais — enviam emails, geram relatórios, automatizam processos. Podemos criar um squad de agentes especializados para a Agência Pinguim, cada um com uma função específica, e tudo isso por um custo de ~$50-200/mês em APIs."

### Pontos-chave:
1. **É gratuito** — só paga APIs de IA e hosting
2. **É open-source** — total controle, sem vendor lock-in
3. **Já tem framework multi-agent** — 9 agentes prontos pra customizar
4. **Comunicação via WhatsApp/Telegram/Slack** — interface familiar
5. **Replicável** — pode ser empacotado como produto para mentorados
6. **Comunidade gigante** — 247k stars, muito suporte

### Riscos a considerar:
1. Curva de aprendizado técnico inicial
2. Segurança precisa ser bem configurada
3. Custos de API podem escalar com uso intenso
4. Projeto recente — pode ter bugs/mudanças frequentes
