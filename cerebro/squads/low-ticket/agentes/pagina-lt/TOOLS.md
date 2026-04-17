# TOOLS.md — Pagina Low Ticket

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Hotmart API (escrita)
- **Pra que serve:** Criar produto, configurar preco, orderbumps, upsell, downsell
- **Credenciais:** OAuth Hotmart (conta master)
- **Permissoes:** produtos, ofertas, checkout

### 2. WordPress/Elementor API ou FTP
- **Pra que serve:** Publicar/atualizar pagina de vendas
- **Credenciais:** WordPress application password OU SFTP
- **A confirmar:** Pinguim usa WordPress? Elementor? Outra plataforma?

### 3. Meta Pixel API
- **Pra que serve:** Configurar pixel e conversoes na pagina
- **Credenciais:** Via Meta Business Manager
- **Custo:** Gratis

### 4. Browser automation (Playwright)
- **Pra que serve:** Testar jornada completa da pagina
- **Custo:** Gratis

### 5. OpenAI API
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 6. Sistema de email transacional
- **Pra que serve:** Configurar emails pos-compra, boas-vindas
- **Custo:** SendGrid tem plano gratuito pequeno

### 7. Google Tag Manager API
- **Pra que serve:** Gerenciar tags e pixels centralizado

## Observacoes

- Agente com **escrita em Hotmart** — risco alto, precisa LOG
- Teste de jornada OBRIGATORIO antes de liberar trafego
- Primeira instalacao do pixel pode precisar humano (configuracao inicial)
