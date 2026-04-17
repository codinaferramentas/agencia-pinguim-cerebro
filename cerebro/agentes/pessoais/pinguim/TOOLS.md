# TOOLS.md — Pinguim (Orquestrador)

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Discord API
- **Pra que serve:** Canal principal — Pinguim VIVE no Discord da equipe
- **Integracao:** Bot Token com permissoes amplas (ler mensagens, mandar, mencionar agentes)
- **Credenciais:** Bot token + IDs de todos os canais Pinguim
- **Custo:** Gratis

### 2. OpenAI API
- **Pra que serve:** LLM base
- **Custo:** Pay-per-use

### 3. Sistema de acionamento de agentes (interno)
- **Pra que serve:** Pinguim aciona outros agentes — precisa de protocolo interno
- **Integracao:** Mensageria interna do OpenClaw
- **Observacao:** Isso NAO e uma API externa — e a logica interna do OpenClaw

## Ferramentas ideais (Fase 5+)

### 4. Leitura do cerebro inteiro
- **Pra que serve:** Pinguim conhece mapa completo do ecossistema — precisa ler qualquer parte
- **Integracao:** Filesystem direto (servidor onde roda OpenClaw)
- **Permissao:** Read-only no cerebro

### 5. Log de acionamentos
- **Pra que serve:** Registrar quem pediu o que, pra quem direcionou, resultado
- **Integracao:** Banco de dados simples (SQLite ou mesmo arquivo .md por dia)

## Observacoes

- Pinguim NAO precisa de Hotmart/Meta/Calendar — ele so ROTEIA, nao executa
- Mas precisa conhecer quais agentes existem e o que cada um faz
- Canal unico: **Discord** (nao precisa de Telegram/WhatsApp — e orquestrador interno)
