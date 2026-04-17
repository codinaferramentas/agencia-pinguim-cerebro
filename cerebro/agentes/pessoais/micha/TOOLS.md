# TOOLS.md — Agente do Micha

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Google Calendar API
- **Pra que serve:** Ler agenda do Micha, criar eventos, alertar compromissos
- **Integracao:** OAuth2
- **Credenciais:** Client ID + Client Secret + token do Micha
- **Custo:** Gratis

### 2. Discord API
- **Pra que serve:** Canal principal de comunicacao com agente
- **Integracao:** Bot Token
- **Credenciais:** Bot token + IDs dos canais
- **Custo:** Gratis

### 3. Hotmart API
- **Pra que serve:** Consultar alunos do Elo, vendas do Desafio LoFi
- **Integracao:** OAuth Hotmart Developer
- **Credenciais:** Client ID + Client Secret
- **Custo:** Gratis pra Hotmart Pro+

### 4. OpenAI API
- **Pra que serve:** LLM base
- **Credenciais:** API key no .env
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 5. Telegram Bot API
- **Pra que serve:** Canal alternativo mobile
- **Custo:** Gratis

### 6. Sirius API (se existir)
- **Pra que serve:** Consultar uso do app Sirius pelos alunos do Elo, gerar insights
- **A confirmar:** Sirius tem API publica ou integracao?
- **Se nao tiver:** consulta via dashboard manual

## Ferramentas futuras

### 7. Instagram Graph API
- **Pra que serve:** Monitorar engajamento do perfil do Micha, identificar comentarios relevantes
- **Integracao:** Via Meta Business
- **Credenciais:** Long-lived token
- **Custo:** Gratis

## Observacoes

- Micha e criador de conteudo — priorizar ferramentas que ajudam na criacao/publicacao
- Chaves no .env, nao no GitHub
- Acesso do agente: leitura do cerebro + escrita na pasta propria
