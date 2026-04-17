# TOOLS.md — Estrategista de Lancamento

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Hotmart API
- **Pra que serve:** Consultar metricas de desafios anteriores (vendas, order bumps, upsell)
- **Credenciais:** OAuth Hotmart
- **Custo:** Gratis pra Pro+

### 2. Meta Ads API
- **Pra que serve:** Dados de campanhas anteriores (CPA, ROAS, publicos que funcionaram)
- **Credenciais:** Graph API + Business Manager
- **Custo:** Gratis

### 3. Acesso ao cerebro (leitura)
- **Pra que serve:** Ler relatorios do Analista de Lancamento, historico de briefings
- **Integracao:** Filesystem direto

### 4. OpenAI API
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 5. Google Sheets API
- **Pra que serve:** Exportar briefing em planilha pra equipe visualizar
- **Credenciais:** OAuth2
- **Custo:** Gratis

### 6. Google Calendar API
- **Pra que serve:** Criar timeline do desafio no calendario da equipe
- **Custo:** Gratis

## Observacoes

- Agente estrategico — nao executa copy/trafego/operacional
- Acesso read-only a Hotmart e Meta Ads (so consulta)
- Escrita apenas no cerebro (briefings e relatorios)
