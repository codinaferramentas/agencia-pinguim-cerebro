# TOOLS.md — Dr Orchestrator

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Acesso ao cerebro
- **Pra que serve:** Ler SOULs dos 10 especialistas + contexto da Pinguim + decisoes passadas
- **Integracao:** Filesystem direto

### 2. Web Search API (SerpAPI ou similar)
- **Pra que serve:** Buscar papers, meta-analises, revisoes sistematicas
- **Credenciais:** API key SerpAPI ou equivalente
- **Custo:** SerpAPI tem plano gratuito pequeno

### 3. OpenAI API
- **Pra que serve:** LLM base — modelo TOP (GPT-5 full) pra analise rigorosa
- **Custo:** Pay-per-use

### 4. Discord API
- **Pra que serve:** Canal de interacao com socios
- **Custo:** Gratis

## Ferramentas ideais (Fase 5+)

### 5. Google Scholar API / Semantic Scholar
- **Pra que serve:** Buscar artigos academicos com mais precisao
- **Custo:** Gratis (com rate limit)

### 6. Banco de evidencias (no cerebro)
- **Pra que serve:** Historico de evidencias consultadas vira base auditavel
- **Integracao:** Markdown estruturado

## Observacoes

- Modelo TOP justificado: decisoes informadas por ciencia tem alto ROI
- Read-only em fontes externas
- Escreve analises no cerebro (audit trail)
- NAO substitui dados da Pinguim (use Data Chief) nem decisao de negocio (use Board Chair)
