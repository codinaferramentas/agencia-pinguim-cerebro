# Cérebro — Agência Pinguim

## Estrutura

```
cerebro/
├── MAPA.md                          ← Este arquivo
├── empresa/                         ← Contexto global da empresa
│   ├── contexto/                    ← Quem somos, equipe, métricas, decisões, lições
│   ├── skills/                      ← Skills cross-área
│   ├── rotinas/                     ← Rotinas automáticas
│   └── projetos/                    ← Projetos em andamento
│
├── areas/                           ← Áreas da empresa
│   ├── comercial/
│   ├── financeiro/
│   ├── juridico/
│   ├── tributario/
│   ├── cs/
│   ├── produtos/
│   ├── dados/
│   ├── rh/
│   ├── marketing/
│   └── youtube/
│
├── agentes/                         ← Configuração de cada agente
│   ├── chief/                       ← Orquestrador (Pinguim)
│   ├── comercial/                   ← Agente de vendas
│   ├── financeiro/                  ← Agente financeiro
│   ├── juridico/                    ← Agente jurídico
│   ├── tributario/                  ← Agente tributário
│   ├── cs/                          ← Agente CS
│   ├── produtos/                    ← Agente de produtos
│   ├── dados/                       ← Agente de dados
│   ├── rh/                          ← Agente de RH
│   ├── marketing/                   ← Especialistas de marketing
│   │   ├── estrategista/
│   │   ├── copy/
│   │   ├── designer/
│   │   ├── social-media/
│   │   ├── trafego/
│   │   ├── video/
│   │   ├── automacoes/
│   │   └── gestor-projetos/
│   ├── youtube/                     ← Agente YouTube
│   ├── pessoais/                    ← Agentes pessoais
│   │   ├── pedro/
│   │   ├── micha/
│   │   ├── luiz/
│   │   └── codina/
│   ├── suporte/                     ← Suporte ao aluno
│   │   ├── roteador/
│   │   ├── lira/
│   │   ├── taurus/
│   │   ├── proalt/
│   │   └── elo/
│   └── estrategistas/               ← Estrategistas por produto
│       ├── elo/
│       └── proalt/
│
└── seguranca/                       ← Permissões e políticas
    └── permissoes.md
```

## Padrão de navegação

Toda área segue a mesma estrutura:

```
qualquer-area/
├── MAPA.md         ← Onde estou, o que tem aqui
├── contexto/       ← O que o agente precisa saber
├── skills/         ← O que o agente pode fazer
├── rotinas/        ← O que roda automaticamente
└── projetos/       ← O que está em andamento
```

Todo agente segue a mesma estrutura:

```
qualquer-agente/
├── SOUL.md         ← Personalidade, tom, valores
├── AGENTS.md       ← Regras operacionais, permissões
├── IDENTITY.md     ← Nome, emoji, escopo
└── TOOLS.md        ← Ferramentas conectadas
```
