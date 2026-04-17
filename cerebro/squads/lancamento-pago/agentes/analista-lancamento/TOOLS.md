# TOOLS.md — Analista de Lancamento

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Hotmart API (leitura)
- **Pra que serve:** Todos os dados de vendas, order bumps, upsell, reembolso
- **Custo:** Gratis

### 2. Meta Ads API (leitura)
- **Pra que serve:** Dados completos de campanha
- **Custo:** Gratis

### 3. Sendflow API (leitura)
- **Pra que serve:** Dados de grupo WhatsApp (tamanho, engajamento, presenca aulas)

### 4. Acesso ao cerebro
- **Pra que serve:** Ler relatorios de desafios anteriores pra comparativo
- **Integracao:** Filesystem direto

### 5. OpenAI API
- **Custo:** Pay-per-use (precisa modelo bom pra analise)

## Ferramentas ideais (Fase 5+)

### 6. Google Sheets API
- **Pra que serve:** Exportar relatorios em planilha pra Luiz ver
- **Custo:** Gratis

### 7. Dashboard interno (TV Dash)
- **Pra que serve:** Integrar dados do desafio no dashboard principal

## Observacoes

- Agente de analise pura — **so leitura**, nunca escreve em Hotmart/Meta
- Relatorios salvos no cerebro em formato padrao (pra comparativo futuro)
