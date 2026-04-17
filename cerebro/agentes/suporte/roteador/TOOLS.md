# TOOLS.md — Roteador de Suporte

## Ferramentas essenciais (Fase 4 — MVP)

### 1. WhatsApp API (via Sendflow ou Meta Cloud)
- **Pra que serve:** Canal principal — maioria dos alunos usa WhatsApp
- **Integracao:** Sendflow API (ja usado pela equipe) OU Meta Cloud API
- **Credenciais:** API key Sendflow + numero verificado
- **Custo:** Sendflow tem plano pago (alinhar com equipe qual plano)
- **Observacao:** Precisa de chip dedicado pro bot (decisao do Luiz)

### 2. Telegram Bot API
- **Pra que serve:** Canal alternativo — alunos do Elo usam muito
- **Integracao:** Bot Token via @BotFather
- **Credenciais:** Bot token
- **Custo:** Gratis

### 3. Hotmart API
- **Pra que serve:** Consultar qual programa o aluno comprou pelo email/nome
- **Integracao:** OAuth Hotmart
- **Credenciais:** Client ID + Secret (conta Pinguim)
- **Custo:** Gratis pra Pro+

### 4. OpenAI API
- **Pra que serve:** LLM base pro roteamento inteligente
- **Custo:** Pay-per-use (modelo pequeno serve — GPT-5 Mini)

### 5. Sistema de acionamento interno
- **Pra que serve:** Direcionar o aluno pro agente correto apos identificar
- **Integracao:** Mensageria interna do OpenClaw

## Ferramentas ideais (Fase 5+)

### 6. Banco de dados de alunos
- **Pra que serve:** Cache de identificacao (evitar consultar Hotmart toda vez)
- **Integracao:** SQLite ou Postgres simples

## Observacoes

- Agente mais "barato" em tokens — so identifica e roteia
- Precisa ser RAPIDO (aluno espera resposta em segundos)
- Sem acesso a Meta Ads, Calendar ou outras APIs — foco unico
