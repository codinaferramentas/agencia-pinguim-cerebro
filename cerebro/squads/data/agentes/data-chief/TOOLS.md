# TOOLS.md — Data Chief

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Hotmart API (leitura)
- **Pra que serve:** Vendas, churn, reembolsos — dados de receita e retencao
- **Custo:** Gratis

### 2. Meta Ads API (leitura)
- **Pra que serve:** CPA, ROAS, performance de campanhas
- **Custo:** Gratis

### 3. Sendflow API (leitura)
- **Pra que serve:** Engajamento em grupos WhatsApp (proxy de ativacao)

### 4. Acesso ao cerebro
- **Pra que serve:** Historico de analises anteriores, frameworks dos 6 especialistas
- **Integracao:** Filesystem direto

### 5. OpenAI API
- **Pra que serve:** LLM base (analise estrategica precisa modelo TOP — GPT-5 full)
- **Custo:** Pay-per-use (alto ROI)

## Ferramentas ideais (Fase 5+)

### 6. Google Sheets API
- **Pra que serve:** Exportar relatorios em planilha pra Luiz ver
- **Custo:** Gratis

### 7. Banco de dados central (BigQuery / Postgres)
- **Pra que serve:** Consultas complexas sobre cohorts, LTV, retention
- **A construir:** Precisa de ETL antes (fora do escopo imediato)

### 8. Amplitude / Mixpanel (se Pinguim usar)
- **A confirmar:** Pinguim usa alguma ferramenta de product analytics?

## Observacoes

- Read-only em todas as fontes
- Escreve relatorios no cerebro (pra auditar analises passadas)
- Modelo TOP justificado pelo ROI (decisoes estrategicas caras)
- Nao executa — recomenda com framework
