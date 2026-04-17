# TOOLS.md — Agente do Codina

## Ferramentas essenciais (Fase 4 — MVP)

### 1. GitHub API
- **Pra que serve:** Acesso ao repositorio agencia-pinguim-cerebro pra ler/editar cerebro, fazer commits, ver historico
- **Integracao:** Personal Access Token (PAT) do Andre
- **Credenciais:** ghp_... (no .env)
- **Custo:** Gratis pra repos privados com plano gratuito do GitHub

### 2. Discord API
- **Pra que serve:** Canal de comunicacao com Andre
- **Credenciais:** Bot Token
- **Custo:** Gratis

### 3. OpenAI API
- **Pra que serve:** LLM base
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 4. Google Calendar API
- **Pra que serve:** Agenda do Andre (reunioes com socios)
- **Custo:** Gratis

### 5. Sistema de memoria do projeto
- **Pra que serve:** Ler/escrever nos arquivos de memoria
- **Integracao:** Filesystem direto

## Ferramentas futuras

### 6. Hotmart + Meta Ads (leitura)
- **Pra que serve:** Andre precisa saber numeros da Pinguim pra dar suporte ao projeto
- **Observacao:** Mesma credencial dos outros agentes, mas acesso read-only

### 7. Vercel/Deploy API
- **Pra que serve:** Deploy do painel e outros sites Pinguim
- **Custo:** Gratis (plano hobby)

## Observacoes importantes

- **Agente da Dolphin, nao da Pinguim** — deve ter separacao clara de dados
- Pode ler o cerebro Pinguim mas nao compartilha com clientes da Dolphin sem permissao
- Foco em **replicabilidade** — tudo que faz pra Pinguim deve virar template pra outros clientes
- Chaves sempre no .env
