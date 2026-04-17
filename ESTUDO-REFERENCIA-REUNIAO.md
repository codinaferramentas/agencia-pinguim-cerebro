# Estudo de Referência — Reunião de Brainstorm

> **Projeto**: Squad de Agentes IA para a Agência Pinguim
> **Data**: 14/04/2026
> **Preparado por**: Estudo baseado em análise do OpenClaw + repositório de referência (imersão)

---

## 1. O QUE É O OPENCLAW (resumo executivo)

**OpenClaw** é um assistente de IA open-source e gratuito que roda no seu computador (ou na nuvem) e **executa tarefas reais**: envia emails, gera relatórios, navega sites, gerencia arquivos, automatiza processos.

- **Gratuito e open-source** (licença MIT)
- **247.000+ stars no GitHub** — crescimento explosivo desde nov/2025
- **Criado por Peter Steinberger** (dev austríaco, agora na OpenAI)
- **Comunica via WhatsApp, Telegram, Slack, Discord** — interface familiar
- **Compatível com Claude, GPT, modelos locais** — não fica preso a nenhum provedor

### Custo real:
| Item | Custo mensal estimado |
|------|----------------------|
| OpenClaw (software) | R$ 0 |
| Servidor cloud (VPS) | R$ 25-50 |
| APIs de IA (Claude/GPT) | R$ 250-1.000 (depende do volume) |
| **Total estimado** | **R$ 300-1.100/mês** |

> Comparar com: salário de 1 assistente = R$ 2.500-5.000/mês + encargos

---

## 2. O QUE O CASO DE REFERÊNCIA NOS ENSINA

Analisei o repositório completo do caso que aparece no vídeo: **"Imersão OpenClaw nos Negócios"** por cpereiraweb (Bruno Okamoto / Pixel Educação).

### O que eles fizeram:

Criaram um conceito chamado **"Cérebro"** — um repositório GitHub que funciona como **memória permanente** dos agentes. É a peça central de tudo.

### Estrutura do "Cérebro":

```
cerebro/
├── empresa/              ← Contexto global (quem somos, equipe, métricas, decisões, lições)
├── areas/                ← Cada área da empresa
│   ├── vendas/           ← Pipeline, leads, follow-up
│   ├── marketing/        ← Campanhas, criativos, tráfego pago
│   ├── atendimento/      ← Suporte, FAQ, bot
│   ├── operacoes/        ← Processos internos, sync
│   ├── governanca/       ← Auditoria de agentes, gestão
│   ├── pessoas/          ← RH: clima, onboarding, contratos
│   └── desenvolvimento/  ← Code review, sprints, testes
├── agentes/              ← Configuração de cada agente
│   ├── assistente/       ← Agente geral (acesso total)
│   ├── marketing/        ← Agente de marketing (acesso restrito)
│   └── bot-suporte/      ← Bot para alunos (acesso mínimo)
└── seguranca/            ← Quem pode acessar o quê
```

### Cada pasta segue o mesmo padrão:
```
qualquer-area/
├── MAPA.md         ← Onde estou, o que tem aqui
├── contexto/       ← O que o agente precisa saber
├── skills/         ← O que o agente pode fazer
├── rotinas/        ← O que roda automaticamente (crons)
└── projetos/       ← O que está em andamento
```

### Agentes que eles criaram:

| Agente | Função | Acesso |
|--------|--------|--------|
| **Assistente Geral** | Braço direito de toda a equipe. Proativo, organiza tudo | Cérebro inteiro |
| **Agente de Marketing** | Especialista em ads, criativos, ROAS. Data-driven | Só empresa/ + marketing/ |
| **Bot de Suporte** | Atende alunos. Consulta FAQ, escala dúvidas | Só atendimento/bot/ |

### Conceitos-chave que funcionam:

1. **"Sem o cérebro, o agente esquece tudo ao fechar a sessão. Com o cérebro, aprende e evolui."**

2. **Skills** = receitas que o agente segue. Exemplos:
   - `relatorio-vendas` — puxa dados, gera relatório, envia no Telegram
   - `follow-up-leads` — identifica leads esfriando, sugere ação
   - `analise-criativos` — analisa performance de ads
   - `criar-skill` — o agente cria novas skills sozinho!

3. **Rotinas (Crons)** = skills que rodam sozinhas:
   - Relatório de vendas todo dia às 8h
   - Análise de ads toda noite
   - Sync com GitHub toda meia-noite
   - Heartbeat (verificação de saúde) às 6h

4. **Permissionamento por camadas**:
   - Cada agente só acessa sua área
   - Cada pessoa só interage com agentes permitidos
   - Ações externas (email, post) sempre pedem confirmação

5. **Memória em 2 níveis**:
   - Local (volátil) — notas temporárias
   - Repositório GitHub (permanente) — fonte de verdade

6. **O agente sugere automatizar**: quando detecta tarefas repetitivas, sugere criar uma skill

### Modelo de negócio deles:
- Fizeram uma **imersão de 2 dias** (28-29/mar/2026) para ~300 pessoas
- 100% demo ao vivo — sem slides teóricos
- Criaram um repositório-template que qualquer empresa pode clonar
- Onboarding guiado de 60-90 minutos transforma o template na empresa real
- Vendem mentoria para acompanhamento pós-imersão

---

## 3. COMO ISSO SE APLICA À AGÊNCIA PINGUIM

### A Agência Pinguim tem cursos e mentorias. Áreas prováveis:

| Área | O que o agente faria |
|------|---------------------|
| **Vendas** | Relatórios de vendas, follow-up de leads, pipeline |
| **Marketing** | Análise de campanhas, criativos, métricas de ads |
| **Atendimento** | FAQ de alunos, escalar dúvidas, consolidar base de conhecimento |
| **Operações** | Agenda, tarefas, organização interna |
| **Conteúdo** | Calendário editorial, análise de engajamento |
| **Financeiro** | Relatórios de receita, projeções |

### Agentes possíveis para a Pinguim:

1. **Assistente da Diretoria** — acesso total, braço direito dos 3 sócios
2. **Agente de Marketing/Tráfego** — especialista em ads e criativos
3. **Bot de Atendimento ao Aluno** — FAQ, suporte nível 1
4. **Agente de Vendas** — pipeline, follow-up, relatórios
5. **Agente de Conteúdo** — calendário, análise de performance

---

## 4. PERGUNTAS PARA A REUNIÃO

### Sobre a empresa (precisamos mapear):
- [ ] Quais são as áreas da Agência Pinguim hoje?
- [ ] Quais processos mais consomem tempo?
- [ ] Quais tarefas são feitas de forma repetitiva toda semana?
- [ ] Quantas pessoas trabalham na operação?
- [ ] Quais ferramentas usam (CRM, email, WhatsApp, plataforma de cursos)?
- [ ] Qual o faturamento mensal atual?
- [ ] Quais métricas cada sócio monitora?

### Sobre o projeto:
- [ ] Qual área priorizar primeiro? (recomendo: a que mais dói)
- [ ] Qual o orçamento mensal para APIs de IA?
- [ ] Quem será o "dono técnico" do projeto internamente?
- [ ] Qual canal de comunicação preferido? (Telegram, WhatsApp, Slack)
- [ ] Qual o prazo desejado para o piloto funcionar?

### Sobre o produto replicável:
- [ ] Já têm mentorados pedindo algo assim?
- [ ] Qual seria o formato de venda? (implementação? template? mentoria?)
- [ ] Qual faixa de preço faz sentido para o público deles?

### Decisões técnicas:
- [ ] Hospedar onde? (VPS cloud é o mais prático)
- [ ] Qual modelo de IA usar? (Claude recomendado para qualidade, GPT para custo)
- [ ] GitHub privado ou dentro de uma organização?

---

## 5. PROPOSTA DE FASES

### Fase 0 — Mapeamento (1 semana)
- Mapear todos os processos da Agência Pinguim
- Identificar as 3 tarefas mais repetitivas
- Definir áreas prioritárias
- Escolher canal de comunicação

### Fase 1 — Cérebro + 1º Agente (2 semanas)
- Clonar o template de referência
- Preencher contexto da empresa
- Criar o Assistente da Diretoria
- Primeira skill + primeiro cron funcionando

### Fase 2 — Expandir (2-4 semanas)
- Adicionar agentes por área (marketing, vendas, atendimento)
- Criar skills específicas
- Configurar rotinas automáticas
- Ajustar permissionamento

### Fase 3 — Otimizar + Documentar (2 semanas)
- Medir resultados (tempo economizado, custo evitado)
- Documentar tudo para replicação
- Criar template limpo

### Fase 4 — Produto (ongoing)
- Transformar em oferta para mentorados
- Definir precificação
- Criar processo de onboarding para clientes

---

## 6. O QUE VOCÊ PRECISA SABER SOBRE OPENCLAW PARA A REUNIÃO

### Em 1 minuto:
"OpenClaw é tipo ter um funcionário virtual que nunca dorme. Ele lê mensagens no WhatsApp/Telegram, entende o que precisa fazer, e executa: puxa dados, gera relatórios, responde perguntas, organiza tarefas. É gratuito, open-source, e já tem 247 mil desenvolvedores usando no mundo. O custo é basicamente a API de IA — uns R$300-1000/mês — muito menos que um funcionário. E o melhor: dá pra replicar a mesma estrutura pra qualquer empresa."

### Termos que podem surgir:
- **Skill** = uma tarefa automatizada (receita que o agente segue)
- **Cron** = uma skill que roda sozinha no horário programado
- **Cérebro / Second Brain** = repositório GitHub com todo o contexto da empresa
- **LLM** = modelo de linguagem (Claude, GPT) — o "motor" do agente
- **Gateway** = o OpenClaw em si — ponte entre o LLM e as ferramentas
- **Workspace** = pasta onde o agente guarda suas configurações
- **SOUL.md** = arquivo que define a personalidade e regras do agente

### O que diferencia da concorrência:
- **Open-source** — não fica refém de nenhuma empresa
- **Roda local** — seus dados ficam com você
- **Comunicação via apps que já usa** — não precisa de interface nova
- **Modular** — adiciona capacidades (skills) sob demanda
- **Replicável** — clone o repositório e tenha a mesma estrutura

---

## 7. REFERÊNCIAS

### Repositório analisado:
- `cpereiraweb/imersao-openclaw-negocios` no GitHub
- Criado por Bruno Okamoto / Pixel Educação
- Imersão de 2 dias para ~300 pessoas (28-29/mar/2026)

### Vídeo referência:
- "Como escalamos pra R$ 1.3M/mês em 45 dias com uma empresa gerida por agentes"
- https://www.youtube.com/watch?v=_1hZ3WVqoNw
- Transcrição pendente (recomendo assistir e tomar notas)

### OpenClaw:
- Site: https://openclaw.ai
- GitHub: https://github.com/openclaw/openclaw (247k+ stars)
- Multi-agent kit: https://github.com/shenhao-stu/openclaw-agents

### Artigos úteis:
- [Ultimate Guide to AI Agent Workforce 2026](https://o-mega.ai/articles/openclaw-creating-the-ai-agent-workforce-ultimate-guide-2026)
- [OpenClaw Explained - KDnuggets](https://www.kdnuggets.com/openclaw-explained-the-free-ai-agent-tool-going-viral-already-in-2026)
- [OpenClaw Multi-Agent Mode](https://openclawmcp.com/blog/openclaw-multi-agent-mode)
- [OpenClaw for Teams Setup Guide](https://blink.new/blog/openclaw-for-teams-multi-agent-workspace-2026)

---

## 8. RESUMO VISUAL — A GRANDE IDEIA

```
┌─────────────────────────────────────────────────────────┐
│                    AGÊNCIA PINGUIM                       │
│                                                         │
│   Sócios: Pedro, Michel, Luiz                           │
│   Negócio: Cursos + Mentorias de Marketing              │
│                                                         │
│   ┌─────────────────────────────────────────────┐       │
│   │           CÉREBRO (GitHub)                  │       │
│   │   Contexto + Skills + Rotinas + Memória     │       │
│   └──────────────────┬──────────────────────────┘       │
│                      │                                  │
│          ┌───────────┼───────────┐                      │
│          │           │           │                      │
│    ┌─────▼─────┐ ┌───▼───┐ ┌────▼────┐                 │
│    │Assistente │ │ Mkt   │ │Atendim. │  ...mais agentes │
│    │ Diretoria │ │ Agent │ │  Bot    │                  │
│    └─────┬─────┘ └───┬───┘ └────┬────┘                 │
│          │           │          │                       │
│    ┌─────▼───────────▼──────────▼─────┐                 │
│    │     Telegram / WhatsApp / Slack  │                 │
│    └──────────────────────────────────┘                 │
│                                                         │
│   RESULTADO: Operação enxuta + margem maior             │
│   PRODUTO: Replicável para mentorados                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

*Este estudo é um ponto de partida para discussão, não um plano de execução. As decisões devem vir da reunião com os 3 sócios.*
