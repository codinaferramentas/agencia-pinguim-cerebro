# TOOLS.md — Gestor de Lancamento

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Hotmart API (escrita)
- **Pra que serve:** Criar produto, configurar lotes, order bumps, mudar precos
- **Credenciais:** OAuth Hotmart (conta master)
- **Custo:** Gratis
- **Permissoes:** produtos, ofertas, checkout

### 2. Sendflow API
- **Pra que serve:** Criar e gerenciar grupos WhatsApp do desafio
- **Credenciais:** Sendflow API
- **Custo:** Sendflow plano pago

### 3. WhatsApp API
- **Pra que serve:** Enviar mensagens nos grupos durante o desafio
- **Credenciais:** Via Sendflow

### 4. Discord API
- **Pra que serve:** Reportar status do checklist pra equipe
- **Credenciais:** Bot Token
- **Custo:** Gratis

### 5. OpenAI API
- **Custo:** Pay-per-use (pode ser modelo mini)

## Ferramentas ideais (Fase 5+)

### 6. Google Calendar API
- **Pra que serve:** Criar eventos no calendario pra datas criticas
- **Custo:** Gratis

### 7. Browser automation (Playwright)
- **Pra que serve:** Testar jornada completa da pagina de vendas
- **Custo:** Gratis

## Observacoes

- Agente com **permissoes de escrita no Hotmart** — risco alto
- Toda acao de mudar preco ou fechar carrinho precisa LOG
- Mudancas de lote deveriam ter dupla confirmacao em producao
- Se Hotmart API falhar, escalar pro humano imediatamente
