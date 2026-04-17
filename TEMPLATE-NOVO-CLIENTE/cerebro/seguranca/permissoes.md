# Permissoes do Ecossistema — [Nome da Empresa]

## Principios gerais

1. **Chaves de API NUNCA vao pro GitHub** — sempre em .env no servidor
2. **.env e .gitignore** — bloquear arquivos com credenciais
3. **Acesso ao cerebro:** leitura generalizada, escrita apenas na area propria do agente
4. **Acoes criticas exigem LOG** — toda escrita em Hotmart, Meta Ads, WhatsApp precisa registro

## Permissoes por agente

### Agentes pessoais
- **Leitura:** todo o cerebro
- **Escrita:** apenas na pasta propria (memoria propria)
- **APIs externas:** conforme TOOLS.md de cada um

### Agentes de suporte
- **Leitura:** base de conhecimento do produto que atende
- **Escrita:** registro de duvidas frequentes (no cerebro)
- **APIs externas:** WhatsApp, Telegram, Hotmart (leitura)

### Squads de execucao (lancamento, LT, HT)
- **Leitura:** briefings do Estrategista, historico da squad
- **Escrita:** entregaveis (copy, roteiros, planos)
- **APIs externas:** varia por agente (ver TOOLS.md)

### Squad operacional (agencia/chief)
- **Leitura:** todo o cerebro
- **Escrita:** relatorios, planos, organograma
- **APIs externas:** conforme TOOLS.md

## Acoes que SEMPRE exigem aprovacao humana

- Mudanca de preco de produto
- Fechamento de carrinho fora do planejado
- Budget de trafego acima de [R$ X/dia]
- Reembolso fora da politica
- Envio em massa de mensagens (WhatsApp / email)
- Decisoes financeiras (DRE, fluxo de caixa)
- Contratacao / demissao de pessoal

## .env (modelo)

Arquivo fica **fora** do repositorio, no servidor:

```
# LLM
OPENAI_API_KEY=sk-...

# Hotmart
HOTMART_CLIENT_ID=...
HOTMART_CLIENT_SECRET=...

# Meta
META_ACCESS_TOKEN=...
META_BUSINESS_ID=...
META_AD_ACCOUNT_ID=...

# Comunicacao
DISCORD_BOT_TOKEN=...
TELEGRAM_BOT_TOKEN=...
SENDFLOW_API_KEY=...

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# GitHub
GITHUB_PAT=ghp_...

# Outras (conforme ferramentas do cliente)
# ...
```
