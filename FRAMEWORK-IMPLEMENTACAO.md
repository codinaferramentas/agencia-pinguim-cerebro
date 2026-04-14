# Framework de Implementação de Squad de Agentes

> Este documento é o framework replicável. Serve pra Pinguim e pra qualquer cliente futuro.
> Quando iniciar um novo projeto, comece por aqui.

---

## FASE 1 — Coleta (o que pedir pro cliente)

### Checklist de coleta

- [ ] **Organograma da empresa** — quem são as pessoas, cargos, áreas
- [ ] **Produtos/serviços** — o que vendem, como vendem, preços, funis
- [ ] **Ferramentas que usam** — CRM, plataforma de cursos, email, ads, grupos, pagamento
- [ ] **Canais de comunicação** — onde a equipe fala (Discord, Slack), onde o cliente fala (WhatsApp, Telegram)
- [ ] **Rotinas existentes** — lançamentos, relatórios, follow-up, suporte, renovações
- [ ] **Materiais** — aulas, copies, páginas de venda, scripts de venda
- [ ] **Dores** — o que mais consome tempo, o que mais gera erro, o que mais gostariam de automatizar
- [ ] **Prioridades** — o que querem resolver primeiro (o que dá dinheiro > o que economiza tempo > o que organiza)

### O que precisa do cliente pra começar a desenvolver

| Item | Quem fornece | Bloqueia desenvolvimento? |
|------|-------------|--------------------------|
| API Key da Anthropic | Cliente (cartão de crédito) | **SIM** — precisa pra testar agentes |
| Servidor (Hostinger/Hetzner) | Cliente | NÃO — desenvolve local, sobe depois |
| Organograma | Cliente | NÃO — mas ajuda a definir agentes |
| Material dos produtos (aulas, copies) | Cliente | NÃO — mas precisa pra treinar suporte/estrategista |
| Acesso às ferramentas (Hotmart, etc.) | Cliente | NÃO — integra depois |
| Clone/perfil dos sócios | Cada sócio | NÃO — cada um alimenta no seu tempo |

### O que pode fazer SEM esperar o cliente

| Tarefa | Depende de quê |
|--------|---------------|
| Criar repositório no GitHub | Nada |
| Montar estrutura do cérebro (pastas, templates) | Nada |
| Criar arquivos base dos agentes (SOUL, AGENTS, IDENTITY, TOOLS) | Organograma (já temos da Pinguim) |
| Transcrever aulas/vídeos | Acesso ao material (link do Drive/YouTube) |
| Analisar páginas de venda | Link da página |
| Documentar o framework | Nada |
| Preparar scripts de integração | Documentação das APIs |

---

## FASE 2 — Estrutura (o que criar)

### 2.1 Repositório no GitHub

```
nome-do-cliente/
├── cerebro/
│   ├── MAPA.md
│   ├── empresa/
│   │   ├── contexto/
│   │   │   ├── geral.md
│   │   │   ├── people.md
│   │   │   ├── metricas.md
│   │   │   ├── decisions.md
│   │   │   └── lessons.md
│   │   ├── skills/
│   │   ├── rotinas/
│   │   └── projetos/
│   ├── areas/
│   │   ├── [area-1]/
│   │   │   ├── MAPA.md
│   │   │   ├── contexto/
│   │   │   ├── skills/
│   │   │   ├── rotinas/
│   │   │   └── projetos/
│   │   └── [area-N]/
│   ├── agentes/
│   │   ├── [agente-1]/
│   │   │   ├── SOUL.md
│   │   │   ├── AGENTS.md
│   │   │   ├── IDENTITY.md
│   │   │   └── TOOLS.md
│   │   └── [agente-N]/
│   └── seguranca/
│       └── permissoes.md
├── onboarding/
│   └── SETUP.md
└── README.md
```

### 2.2 Tipos de agente (catálogo padrão)

Todo projeto pode ter estes tipos. O cliente escolhe quais precisa:

#### Agentes Pessoais
- 1 por sócio/líder
- Canivete suíço — habilidades que o dono ensinar
- Canal: Discord / Telegram / WhatsApp (a definir)

#### Agente Orquestrador (interno)
- Serve a equipe inteira
- Recebe pedido, identifica a área, direciona pro agente certo
- Canal: Discord

#### Agentes de Área (departamentos)
| Agente | Função |
|--------|--------|
| Comercial | Vendas, pipeline, upsell |
| Financeiro | DRE, fluxo de caixa, margens |
| Jurídico | Contratos, compliance |
| Tributário | Impostos, planejamento fiscal |
| CS | Customer success, retenção |
| Produtos | Gestão de produtos/cursos |
| Dados | Analytics, relatórios |
| RH | Pessoas, contratação, clima |

#### Agentes de Marketing (especialistas)
| Agente | Função |
|--------|--------|
| Estrategista | Estratégia de marketing geral |
| Copy | Copywriting (headlines, páginas, emails) |
| Designer | Design gráfico/visual |
| Social Media | Redes sociais, calendário |
| Tráfego | Tráfego pago, campanhas, métricas |
| Vídeo | Produção de vídeo |
| Automações | Automação de marketing |
| Gestor de Projetos | Gestão de projetos |

#### Agente de YouTube
| Agente | Função |
|--------|--------|
| YouTube | Canal, SEO, thumbnails, roteiros |

#### Agentes de Suporte (por produto)
- 1 roteador na frente
- 1 agente especialista por produto/mentoria
- Canal: WhatsApp / Telegram (privado + grupo)

#### Estrategistas (por produto)
- 1 por produto principal
- Conhece o produto, o funil, a campanha de venda
- Aciona especialistas (copy, oferta, tráfego) quando precisa

---

## FASE 3 — Desenvolvimento (framework por agente)

### Para cada agente, aplicar:

```
1. COLETAR — entender o que esse agente precisa saber e fazer
2. CRIAR   — montar SOUL.md, AGENTS.md, IDENTITY.md, TOOLS.md
3. CONECTAR — colocar no canal certo, testar
4. ENTREGAR — agente no ar com conhecimento mínimo
5. EVOLUIR  — aprende com uso, feedback, correções
```

**Estimativa: 1 agente por dia.**

### Template de SOUL.md

```markdown
# SOUL.md — [Nome do Agente]

## Quem eu sou
[Descrição em 2-3 frases]

## Como eu opero
[Regras de comportamento — proativo? reativo? direto? detalhado?]

## Meu tom
[Como se comunica — formal? informal? bullet points? detalhado?]

## Meus valores
[O que prioriza — velocidade? qualidade? dados?]

## O que NUNCA fazer
[Lista de proibições]

## O que SEMPRE fazer
[Lista de obrigações]

## Limites de escopo
[O que está fora da minha área — redirecionar pra quem]
```

### Template de AGENTS.md

```markdown
# AGENTS.md — [Nome do Agente]

## Escopo de acesso
[Quais pastas do cérebro pode ler/escrever]

## Skills disponíveis
[Lista de habilidades]

## Rotinas ativas
[Crons configurados]

## O que pode fazer sozinho
[Lista]

## O que precisa pedir permissão
[Lista]
```

---

## FASE 4 — Entrega e Evolução

- Agente entregue com conhecimento mínimo
- Responsável começa a usar e dar feedback
- Agente aprende com cada interação
- A cada semana: revisar o que aprendeu, ajustar se necessário
- Documentar tudo (lições, decisões, skills criadas)

---

## FASE 5 — Documentação (vira produto)

- Cada etapa documentada enquanto é feita
- Template limpo pro próximo cliente
- Métricas de resultado (tempo economizado, custo evitado)
- Case de sucesso formatado

---

*Framework vivo — atualizar conforme aprendemos com cada implementação.*
