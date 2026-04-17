# TOOLS.md — Agente do Luiz

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Google Calendar API
- **Pra que serve:** Agenda do Luiz, reunioes
- **Credenciais:** OAuth2 Google Workspace
- **Custo:** Gratis

### 2. Discord API
- **Pra que serve:** Canal principal de comunicacao
- **Credenciais:** Bot Token
- **Custo:** Gratis

### 3. Hotmart API
- **Pra que serve:** Acesso TOTAL aos dados de vendas de todos os produtos
- **Credenciais:** OAuth Hotmart (conta Pinguim)
- **Custo:** Gratis pra Pro+

### 4. Meta Ads API
- **Pra que serve:** Luiz acompanha ROAS e CAC — precisa consulta direta
- **Integracao:** Graph API + Business Manager
- **Credenciais:** Long-lived token + Business ID
- **Custo:** Gratis

### 5. OpenAI API
- **Pra que serve:** LLM base
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 6. Telegram Bot API
- **Pra que serve:** Canal mobile
- **Custo:** Gratis

### 7. Dashboard interno (TV Dash)
- **Pra que serve:** Luiz olha dashboards em tempo real — agente precisa consultar mesmos dados
- **Integracao:** API do dashboard ou leitura direta do banco
- **A confirmar:** Qual stack do dashboard atual?

### 8. Google Sheets API
- **Pra que serve:** Luiz costuma trabalhar com planilhas (metricas, forecast)
- **Integracao:** OAuth2
- **Custo:** Gratis

## Observacoes

- Luiz tem **acesso total** ao ecossistema — agente reflete isso com permissoes amplas
- Priorizar velocidade de resposta (Luiz nao gosta de gordura)
- Tabelas e dados estruturados > texto corrido (preferencia dele)
- Chaves no .env
