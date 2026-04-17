# TOOLS.md — Roteador de Suporte

## Ferramentas essenciais (Fase 4 — MVP)

### 1. WhatsApp API (via Sendflow ou Meta Cloud)
- **Pra que serve:** Canal principal
- **Credenciais:** API key
- **Custo:** [depende da ferramenta]

### 2. Telegram Bot API
- **Pra que serve:** Canal alternativo
- **Custo:** Gratis

### 3. [Sistema de vendas] API
- **Pra que serve:** Identificar aluno pelo email
- **Credenciais:** OAuth

### 4. OpenAI API
- **Pra que serve:** LLM base (pode ser modelo mini)
- **Custo:** Pay-per-use (barato — agente simples)

### 5. Sistema de acionamento interno
- **Pra que serve:** Direcionar apos identificar
- **Integracao:** Mensageria interna

## Observacoes

- Agente "barato" em tokens
- Precisa ser RAPIDO (aluno espera segundos)
- Sem acesso a outras APIs — foco unico
