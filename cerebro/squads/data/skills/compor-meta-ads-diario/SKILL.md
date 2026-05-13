---
name: compor-meta-ads-diario
description: Sintetizador do Relatório Meta Ads Diário (book diário com plano de ação). Recebe KPIs Meta + ROAS Hotmart cruzado + pareceres da Squad Traffic Masters (5 mestres + Chief) e compõe markdown enxuto (template HTML cuida da matriz visual + cards de pareceres colapsáveis + gráficos ApexCharts). Squad data — V2.15.2 redesign 2026-05-13.
---

# Skill: compor-meta-ads-diario

## Quando usar

Use esta skill quando:

- Cron diário 8h dispara o worker pro relatório `meta-ads-diario` em `pinguim.relatorios_config` (sintetizador='compor-meta-ads-diario')
- Sócio pede no chat: "manda meu relatório de Meta Ads agora", "como tá performando o tráfego?"
- Codina dispara on-demand via `POST /api/relatorio/meta-ads`

NÃO use quando:

- Sócio quer ver UMA campanha específica (use Categoria H3 do agente — `meta-insights-campanha`)
- Pedido é FECHAR CONTA financeira (use Relatório Financeiro consolidado, não Meta Ads)

## Anatomia do entregável (V2.15.2 redesign 2026-05-13)

**SEPARAÇÃO DE RESPONSABILIDADES:**

| O que o sintetizador (Skill) faz | O que o template HTML faz |
|---|---|
| Headline + TL;DR + SNAPSHOT bullet + PLANO + ALERTAS + BREAKDOWN bullet + TOP CAMPANHAS | Cards Snapshot (hero) · Gráficos ApexCharts · Matriz Conta×Mestre · Cards de pareceres colapsáveis · Cards por conta |
| Markdown puro enxuto, leitura em <30s | Camada visual completa (cores, gradients, glow, animação) |

**Sintetizador NÃO inclui** Análise Detalhada / Pareceres dos Mestres — template HTML renderiza isso a partir do conteudo_estruturado.pareceres (com resumo curto visível + parecer completo colapsado).

Layout fixo. Markdown enxuto. HTML renderer dedicado (`lib/template-relatorio-meta-ads.js`) adiciona a camada rica.

### 1. Saudação (1 linha, topo)

```
☀️ Bom dia, Codina · Meta Ads · quarta-feira 14 de maio · *dados de 13 de maio*
```

Cuidado canonical: data da saudação = HOJE (`dataHojeBrt`/`diaSemanaHoje`). Data dos DADOS = ontem em itálico ("dados de DD de maio").

### 2. TL;DR (1 parágrafo de 2-3 linhas)

Sintetiza ROAS de ontem + tendência 7d + qual conta puxou + 1 frase sobre o que importa hoje.

NÃO repetir o plano de ação (vem depois).

### 3. 📊 SNAPSHOT (3 mini-cards em bullet)

```
**Ontem (24h)** · Gasto R$ X · Receita R$ Y · ROAS Zx · +X% vs anteontem
**7 dias rolling** · Gasto R$ X · Receita R$ Y · ROAS Zx
**30 dias rolling** · Gasto R$ X · Receita R$ Y · ROAS Zx
```

### 4. 🎯 PLANO DE AÇÃO HOJE

Lista numerada (3-5 itens) JÁ CONSOLIDADA pelo Traffic Chief.

Formato:
```
1. **Ação clara** (Conta afetada)
   *Por quê:* motivo + métrica específica
   *Fundamentou:* 📈 Pedro Sobral
```

Copia INTEGRAL o que o Chief consolidou — não reformula nem resume.

### 5. 🚨 ALERTAS (opcional, máximo 3)

Só se houver alerta REAL:
- Conta com ROAS < 1.0 (queimando dinheiro)
- Frequência > 3 (fadiga clara)
- CTR < 0.8% (criativo morrendo)
- Queda > 30% vs ontem em conta principal

Se 0 alertas, omita a seção inteira.

### 6. 🏦 POR CONTA — ONTEM

Lista bullet por conta, ordem desc por gasto:
```
- **[MM] Crescimento de Base** — R$ 1.234 (28% do total) · ROAS 1.4x · Freq 1.2 · CTR 2.1% · 3 campanhas · 8 purchases Pixel
```

Total no final somando gastos.

### 7. 🎬 TOP CAMPANHAS — ONTEM

Top 5 campanhas por gasto. Lista bullet.

### 8. (NÃO incluir pareceres no markdown — template HTML cuida)

**REMOVIDO no redesign 2026-05-13.** Template renderiza:
- Bloco "🗂 Matriz · Conta × Análise" — tabela visual com células coloridas (good/warn/bad/mute)
- Bloco "🧠 Análise dos Mestres" — cards de pareceres com resumo SEMPRE visível + `<details>` colapsável com parecer completo

Mestres da squad `traffic-masters` (referência pro Chief gerar resumos+matriz):
- 📈 **Pedro Sobral** — ESCALA (escalar/pausar)
- 🎨 **Felipe Mello** — CRIATIVO (fadiga, heróis)
- 📊 **Andre Vaz** — DATA/ROAS (lucro real)
- 🧭 **Tatiana Pizzato** — ESTRATÉGIA (estrutura funil)
- ⚙️ **Tiago Tessmann** — TÉCNICA (CBO, audiência, segmentação)

### 9. Rodapé

```
---
*Dados: dashboard Pinguim Ads (Supabase compartilhado) · Hotmart receita + Meta gasto. ROAS por conta é ESTIMATIVA (share-of-spend × receita total) pois não temos UTM cross-source.*
```

## Regras de formato (DURAS)

- **NUNCA tabela GFM** (`| col |`) — renderer HTML não suporta
- **SEMPRE lista bullet** com bold no rótulo
- BRL com R$ + separador BR: `R$ 1.234,56`
- Percentual: 1 casa decimal, sinal: `+12.3%` ou `-5.0%`
- ROAS: 2 casas + `x`: `2.45x`
- Frequência: 2 casas: `1.23`
- CTR: 2 casas + `%`: `2.45%`

## Regras de conteúdo (DURAS)

- **NUNCA inventar número** que não está no briefing factual
- **NUNCA escalar conta** com ROAS < 1.0 (Pedro Sobral é dura nisso)
- **NUNCA pausar criativo** sem confirmação dupla: CTR caindo E frequência subindo
- **NÃO opinar** fora do papel (Felipe não fala de estrutura, Tatiana não fala de criativo)
- **NÃO repetir** entre TL;DR, Plano e Pareceres — cada seção tem função diferente

## Diferença vs executivo diário

| Característica | Executivo | Meta Ads (este) |
|---|---|---|
| Escopo | Multi-módulo (financeiro+agenda+email+discord) | Só Meta Ads |
| Janela | 24h | 24h + 7d + 30d (3 cards) |
| Squad | advisory-board (Munger/Dalio/Naval/Thiel) | traffic-masters (Pedro Sobral/Felipe/Andre Vaz/Tatiana/Tiago) |
| Foco | Foto do dia + síntese estratégica | Book operacional + plano de ação executável |
| Frequência | Diário 8h | Diário 8h |
| Universal | Por sócio | Universal (mesmo pra todos) |
| Quem decide | Sócio | Sócio passa pro gestor de tráfego |

## Latência esperada

- Coleta de dados (db-dashboard 24h+7d+30d+por conta+top campanhas+séries): ~3-5s
- Squad 5 mestres em paralelo via Claude CLI: ~30-60s
- Chief consolida plano: ~15-30s
- Sintetizador final: ~30-60s
- **Total: 1-2 minutos por geração**
