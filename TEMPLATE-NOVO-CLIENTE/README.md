# TEMPLATE NOVO CLIENTE — Squad de Agentes IA Dolphin

> Template replicavel pra aplicar em qualquer cliente novo da Dolphin.
> Baseado no case Pinguim (primeiro cliente a rodar esse framework).

---

## Como usar este template

1. **Copie esta pasta** pra um novo repositorio GitHub privado do cliente
2. **Renomeie** arquivos e pastas substituindo `[exemplo-*]` pelos nomes reais
3. **Preencha os contextos** com informacoes reais do cliente (empresa/contexto/)
4. **Defina squads** conforme a estrategia do cliente (desafio / low ticket / high ticket / suporte)
5. **Crie os agentes** seguindo o padrao de arquivos (IDENTITY, SOUL, SYSTEM-PROMPT, TOOLS, AGENTS)
6. **Siga o FRAMEWORK-IMPLEMENTACAO.md** fase por fase

## Estrutura padrao

```
cerebro/
├── empresa/
│   └── contexto/          # Contexto global do cliente
│       ├── geral.md        # O que a empresa faz, produtos, ferramentas
│       ├── people.md       # Equipe, socios, organograma
│       ├── metricas.md     # KPIs principais
│       ├── decisions.md    # Decisoes estrategicas
│       └── lessons.md      # Aprendizados ao longo do tempo
│
├── agentes/
│   ├── pessoais/          # Um por socio/lider
│   │   └── [nome-socio]/
│   └── suporte/           # Por produto
│       ├── roteador/
│       └── [nome-produto]/
│
├── squads/                # Mini-agencias especializadas
│   └── [tipo-estrategia]/
│       └── agentes/
│
└── seguranca/
    └── permissoes.md      # Quem acessa o que
```

## Arquivos por agente (SEMPRE cria os 5)

Cada agente tem 5 arquivos:

| Arquivo | O que contem |
|---------|--------------|
| **IDENTITY.md** | Nome, emoji, escopo (1-linha) |
| **SOUL.md** | Personalidade, como opera, tom, limites |
| **SYSTEM-PROMPT.md** | Prompt OpenAI pronto pra produzir |
| **TOOLS.md** | Ferramentas e APIs que usa |
| **AGENTS.md** | Com quem se conecta (outros agentes) |

## Squads padrao (adaptar por cliente)

Nem todo cliente precisa de todas. Analise o modelo de negocio e escolha:

| Squad | Quando usar |
|-------|-------------|
| **Lancamento Pago** | Cliente roda desafios/masterclasses/workshops pagos (front-end) |
| **Low Ticket Perpetuo** | Cliente tem produto de R$27-97 rodando 24/7 com trafego |
| **High Ticket** | Cliente vende mentoria/consultoria por closer humano |
| **Suporte aos Alunos** | Cliente tem produtos educacionais com comunidade |
| **Copy + Storytelling** | Clones especialistas (usado transversalmente) |
| **Agencia Operacional** | Chief, comercial, CS, financeiro, juridico, etc. |

## Regras importantes (principios do framework)

### 1. Nao prometa o que OpenClaw nao entrega
- NAO cria agente de video editor, designer, etc.
- So cria agente se OpenClaw + LLM + APIs disponiveis conseguem executar
- Humano continua fazendo o que humano faz (arte, edicao, vendas de high ticket)

### 2. Especialista na HABILIDADE, nao no produto
- Copy nao e de 1 produto — e de 1 tipo de estrategia (lancamento/LT/HT)
- Mesmo agente serve pra produtos diferentes da mesma categoria

### 3. Executor, nao conselheiro
- Agente entrega o trabalho, nao sugere "voce poderia fazer X"
- Exemplo: Copy entrega 5 opcoes de headline, nao "a headline poderia ser melhor"

### 4. Menos agentes bem feitos > muitos agentes vazios
- Melhor 20 agentes operacionais do que 300 vazios
- Cria agente novo apenas quando ha demanda real

## Timeline de implementacao

Baseado no case Pinguim:

| Fase | Tempo | Depende de |
|------|-------|-----------|
| 1. Estrutura | 1-2 dias | Nada |
| 2. Alimentar | 1 agente/dia | Material do cliente |
| 3. System Prompts | 3-5 agentes/dia | Estrutura pronta |
| 4. Infra (OpenClaw + APIs) | 2-3 dias | Cliente providencia servidor e APIs |
| 5. Deploy | 1-2 agentes/dia | Fase 4 completa |
| 6. Evolucao | Continuo | Feedback do cliente |

**Nunca prometer em horas/minutos.** Sempre "1 agente/dia" ou "2-3 dias de infra".

## Proximos passos apos copiar este template

1. Ler GUIA-IMPLEMENTACAO.md (nesta pasta)
2. Ler FRAMEWORK-IMPLEMENTACAO.md (na raiz do projeto)
3. Preencher `cerebro/empresa/contexto/*.md` com infos do cliente
4. Decidir quais squads fazem sentido
5. Seguir fase por fase
