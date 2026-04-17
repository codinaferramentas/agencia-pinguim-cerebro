# TOOLS.md — Agente do Pedro

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Google Calendar API
- **Pra que serve:** Ler agenda do Pedro, criar eventos, alertar sobre compromissos
- **Integracao:** OAuth2 Google Workspace
- **Credenciais:** Client ID + Client Secret + token do usuario Pedro
- **Custo:** Gratis (dentro do limite padrao)

### 2. Discord API (ler/enviar mensagens)
- **Pra que serve:** Canal principal de comunicacao do Pedro com o agente
- **Integracao:** Discord Bot Token + permissoes no servidor
- **Credenciais:** Bot token + IDs dos canais autorizados
- **Custo:** Gratis

### 3. Hotmart API
- **Pra que serve:** Consultar alunos do ProAlt, vendas do Desafio LT, DM do Instagram → pipeline
- **Integracao:** OAuth Hotmart Developer
- **Credenciais:** Client ID + Client Secret da conta Pinguim
- **Custo:** Gratis pra Hotmart Pro+

### 4. OpenAI API (LLM base)
- **Pra que serve:** Base do agente (GPT-5 ou GPT-5 Mini)
- **Integracao:** API key
- **Credenciais:** sk-... (Andre tem, nao sobe pro GitHub — .env)
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 5. Telegram Bot API
- **Pra que serve:** Canal alternativo (quando Pedro ta no celular)
- **Integracao:** Bot Token via @BotFather
- **Credenciais:** Bot token
- **Custo:** Gratis

### 6. WhatsApp (via Sendflow ou WhatsApp Business API)
- **Pra que serve:** Notificacoes urgentes, interacao com leads que vem do Instagram
- **Integracao:** Sendflow API ou Meta Cloud API
- **Credenciais:** API keys + numero verificado
- **Custo:** Sendflow tem plano pago / Meta tem custo por mensagem
- **Nota:** Pedro responde leads via DM do IG — talvez precise integracao com Instagram Graph API tambem

## Ferramentas futuras (quando fizer sentido)

### 7. Notion/Google Docs (se Pedro usa)
- **Pra que serve:** Registrar notas, ideias, briefings
- **A confirmar:** Pedro usa Notion, Google Docs ou outro?

### 8. Meta Ads API (leitura de conta do Pedro)
- **Pra que serve:** Pedro perguntar "como tao minhas campanhas?" direto pro agente
- **Integracao:** Graph API + Business Manager access
- **Credenciais:** Long-lived token do Pedro
- **Custo:** Gratis

## Observacoes

- Chaves de API NUNCA vao pro GitHub — sempre em .env no servidor
- Acesso do agente ao cerebro: leitura direta dos arquivos no servidor (nao precisa API)
- Permissoes: agente pessoal pode ler qualquer area do cerebro, mas so escreve na pasta dele (memoria propria)
