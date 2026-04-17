# TOOLS.md — FinOps Chief

## Ferramentas essenciais (Fase 4 — MVP)

### 1. OpenAI Usage API
- **Pra que serve:** Monitorar consumo de tokens por agente/periodo
- **Credenciais:** Mesma API key
- **Custo:** Gratis (parte da conta OpenAI)

### 2. Acesso ao cerebro
- **Pra que serve:** Historico de custos, projecoes, otimizacoes
- **Integracao:** Filesystem

### 3. Discord API
- **Pra que serve:** Alertas de spike de custo pra socios
- **Custo:** Gratis

### 4. OpenAI API (como LLM base)
- **Pra que serve:** LLM do proprio agente (ironicamente monitora proprio custo)
- **Custo:** Pay-per-use — usar modelo mini (analise numerica simples)

## Ferramentas ideais (Fase 5+)

### 5. Cloud provider APIs (Hetzner/Hostinger billing)
- **Pra que serve:** Monitorar custos de servidor
- **Custo:** Gratis (parte do provedor)

### 6. Google Sheets API
- **Pra que serve:** Dashboards de custo mensais
- **Custo:** Gratis

## Observacoes

- Read-only em APIs de billing
- Escreve alertas e projecoes no cerebro
- Alerta IMEDIATO se custo diario sobe +50% da media
