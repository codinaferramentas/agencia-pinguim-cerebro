# TOOLS.md — Trafego de Lancamento

## Ferramentas essenciais (Fase 4 — MVP)

### 1. Meta Ads API (leitura + escrita)
- **Pra que serve:** Montar campanhas, consultar CPA/ROAS, pausar/escalar publicos
- **Credenciais:** Long-lived token + Business ID + Ad Account ID
- **Custo:** Gratis
- **Permissoes:** ads_management, ads_read

### 2. Hotmart API (leitura)
- **Pra que serve:** Cruzar dados de vendas com campanhas pra calcular ROAS real
- **Custo:** Gratis

### 3. Acesso ao cerebro
- **Pra que serve:** Briefing do Estrategista + publicos que funcionaram
- **Integracao:** Filesystem direto

### 4. OpenAI API
- **Custo:** Pay-per-use

## Ferramentas ideais (Fase 5+)

### 5. TikTok Ads API
- **Pra que serve:** Expandir trafego alem de Meta
### 6. Google Ads API
- **Pra que serve:** Campanhas de busca

## Observacoes

- **CRITICO:** Pixel Meta configurado ANTES de rodar campanha
- Acoes de escalar/pausar devem ter LOG e confirmar em valores altos
- Budget diario acima de limite precisa aprovacao humana
