# TOOLS.md — Board Chair

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Acesso ao cerebro
- **Pra que serve:** Ler perfis dos 10 conselheiros (cada um tem SOUL especifico) + historico de deliberacoes anteriores
- **Integracao:** Filesystem direto

### 2. Sistema de acionamento interno
- **Pra que serve:** Quando escolhe um conselheiro, aciona o "modo" daquele conselheiro (via prompt dinamico ou sub-agente)
- **Integracao:** Mensageria interna OpenClaw

### 3. OpenAI API
- **Pra que serve:** LLM base — precisa modelo TOP (GPT-5 full) porque e analise estrategica
- **Custo:** Pay-per-use (dilemas criticos merecem investimento)

### 4. Discord API
- **Pra que serve:** Canal de interacao com os socios — reunioes do board viram mensagens no Discord
- **Credenciais:** Bot Token
- **Custo:** Gratis

## Ferramentas ideais (Fase 5+)

### 5. Banco de deliberacoes (no cerebro)
- **Pra que serve:** Historico auditavel de todas as deliberacoes passadas — aprende com padroes
- **Integracao:** Filesystem + markdown estruturado

### 6. Integracao com Hotmart / Meta Ads (leitura)
- **Pra que serve:** Ter contexto de dados quando dilemas envolvem numeros
- **Opcional:** Muitas deliberacoes sao sobre cultura/pessoas, nao precisam

## Observacoes

- Board Chair so e acionado em decisoes CRITICAS
- Cada deliberacao fica registrada no cerebro (auditoria + aprendizado)
- Custo por sessao e alto (modelo TOP), mas ROI tambem — e pra decisoes grandes
- Se o dilema e operacional, NAO e pro Board — redirecionar pra squad certa
