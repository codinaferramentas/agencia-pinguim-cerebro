# TOOLS.md — Trafego Low Ticket

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Meta Ads API (leitura + escrita)
- **Pra que serve:** Criar/pausar/escalar campanhas perpetuas
- **Credenciais:** Long-lived token + Business ID + Ad Account
- **Custo:** Gratis
- **Permissoes:** ads_management

### 2. Hotmart API (leitura)
- **Pra que serve:** ROAS real cruzando com vendas
- **Custo:** Gratis

### 3. Acesso ao cerebro
- **Pra que serve:** Briefing + publicos que funcionaram + criativos do Roteirista
- **Integracao:** Filesystem direto

### 4. OpenAI API
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 5. TikTok Ads API
- **Pra que serve:** Expandir alem do Meta

### 6. Google Ads API
- **Pra que serve:** Campanhas de busca + YouTube

## Observacoes

- Agente roda **24/7** — precisa estabilidade
- Escala gradual (20% por vez, max)
- Budget acima de limite precisa aprovacao humana
- Monitorar fadiga de criativo semanalmente
