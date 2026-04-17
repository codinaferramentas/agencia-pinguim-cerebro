# TOOLS.md — Suporte Elo

## Ferramentas essenciais (Fase 4 — MVP)

### 1. WhatsApp API (via Sendflow)
- **Pra que serve:** Canal principal de atendimento
- **Credenciais:** Sendflow API key
- **Custo:** Sendflow plano pago

### 2. Telegram Bot API
- **Pra que serve:** Canal alternativo (Elo usa Telegram com frequencia)
- **Credenciais:** Bot token
- **Custo:** Gratis

### 3. Base de conhecimento Elo (leitura)
- **Pra que serve:** Acesso as 21 aulas transcritas + protocolos + PDF de vendas + produto-elo.md
- **Integracao:** Filesystem direto no servidor
- **Sem custo adicional**

### 4. Hotmart API
- **Pra que serve:** Confirmar se o aluno tem acesso ativo ao Elo
- **Credenciais:** OAuth Hotmart
- **Custo:** Gratis pra Pro+

### 5. OpenAI API
- **Pra que serve:** LLM base (GPT-5 com contexto grande por causa das 21 aulas)
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 6. Sirius API (se existir)
- **Pra que serve:** Suporte de duvidas sobre o app Sirius dos alunos
- **A confirmar:** Sirius tem API? Ou suporte vai pelo humano?

### 7. Sistema de tickets/escalacao
- **Pra que serve:** Quando o agente nao sabe, abrir ticket pro humano
- **Integracao:** Email ou canal Discord dedicado

## Observacoes

- Agente precisa de **contexto grande** (21 aulas + protocolos = muito token)
- Considerar usar RAG (Retrieval Augmented Generation) pra buscar so o trecho relevante em vez de mandar tudo
- Escalacao: se nao tem resposta na base, vai pro humano
