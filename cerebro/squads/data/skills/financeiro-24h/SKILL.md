---
name: financeiro-24h
description: Resumo financeiro do último dia (24h) — vendas, faturamento (Receita_Total), reembolsos, gasto Ads, ROAS, top produtos. Lê 2º Supabase (lkrehtmdqkgkyyotvjpz) via lib/db-dashboard.js. SEGUE EXATAMENTE o racional canônico em cerebro/squads/data/contexto/racional-dashboard-vendas.md (validado contra screenshots do TV Dash Produto). Squad data — V2.14.
---

# Skill: financeiro-24h

## Quando usar

- Cron diário 8h dispara como módulo do executivo-diario
- Sócio pede "como foi as vendas ontem", "fechamento financeiro de ontem", "ROAS de ontem"
- Outro relatório executivo precisa do bloco financeiro (composição modular V2.14)

## Quando NÃO usar

- Pedido de relatório financeiro **semanal/mensal** — usa Skill diferente (a criar)
- Pedido de breakdown por produto específico — usa drill-down via SQL direto
- Pedido de Discord/Email/Agenda — usa as Skills correspondentes

## REGRA ZERO — fonte da verdade

**TODA fórmula desta Skill vem de `cerebro/squads/data/contexto/racional-dashboard-vendas.md`**, entregue pelo André em 2026-05-09 e validado contra screenshots do TV Dash Produto.

Nunca improvisar fórmula. Se algo parece incompleto, ler o racional. Se ainda assim não bater, alertar o André no relatório (Verifier reporta divergência).

## Como executar

### Passo 1 — Coleta via wrapper

```js
const dash = require('./lib/db-dashboard');
const r = await dash.resumo_dia(); // ontem BRT default, moeda BRL
```

`r` retorna objeto com:

```
{
  dia: '2026-05-08',
  moeda: 'BRL',
  janela_utc: { from, to },

  // KPIs
  investimento, receita_total, receita_produto, receita_bump, receita_upsell, receita_downsell,
  roas, lucro, vendas, cpa, ticket_medio, frequencia,

  // Reembolsos
  reembolsos_qtd, reembolsos_brl, taxa_reembolso_pct,

  // Funil Pixel (atribuição Meta — NÃO bate com Hotmart, é OK)
  funil: { impressoes, cliques, lpv, checkouts, purchases_pixel, cpm, ctr_pct },

  // Top 5 produtos
  top_produtos: [{ produto, qtd, receita }],

  // Auditoria
  audit: { configs_ativos, configs_nomes, qtd_main_ids, qtd_bump_ids, ... }
}
```

### Passo 2 — Composição do bloco markdown

Estrutura fixa (compactabilidade pra entrar no Executivo Diário):

```
## 💰 Financeiro — <data BRT formatada>

**Receita_Total: R$ <total>** · **<vendas>** vendas · ROAS **<roas>x** · Lucro R$ <lucro>

| Categoria | Receita | % |
|---|---:|---:|
| Produto    | R$ <pp> | <%> |
| Bump       | R$ <bb> | <%> |
| Upsell     | R$ <uu> | <%> |
| Downsell   | R$ <dd> | <%> |
| **Total**  | **R$ <total>** | **100%** |

**Top 5 produtos:**
1. <nome> — <qtd> vendas · R$ <receita>
2. ...

**Investimento Ads:** R$ <inv> · CPA R$ <cpa> · Ticket Médio R$ <tm> · Frequência <freq>x

**Funil Pixel (atribuição Meta — referência):**
- <impr> impressões → <clicks> cliques (CTR <ctr>%) → <lpv> LPV → <checkouts> checkouts → <purch> compras Pixel
- ⚠ Compras Pixel ≠ Vendas Hotmart (Pixel só atribui campanhas Meta — o resto vem de orgânico)

**Reembolsos:** <qtd> · R$ <perda> · Taxa <tx>%

---

<RODAPÉ>
Fonte: 2º Supabase (lkrehtmdqkgkyyotvjpz) · janela BRT [<from> → <to>]
Configs ativos: <N> (<nome1>, <nome2>...)
```

### Passo 3 — Verifier de relatório financeiro (Munger reforço)

Antes de devolver o output, rodar checks cruzados:

1. **Soma bate?** `Receita_Total = Produto + Bump + Upsell + Downsell` (até 1 centavo de tolerância arredondamento)
2. **Vendas > 0 mas Receita_Total = 0?** → bug (provavelmente `my_commission` null)
3. **ROAS > 100 ou < 0?** → bug (divisão errada ou investimento muito baixo)
4. **Reembolsos > Vendas?** → bug ou dia atípico — alerta o André
5. **Top 5 soma > Receita_Total?** → bug (top deve ser subset)

Se algum check falhar:
- Adiciona bloco no fim do output: `⚠ ALERTA Verifier: <descrição>`
- Marca `status='reprovado'` em `pinguim.relatorios_config.ultimo_status`
- Retorna `{ ok: false, motivo: '...', conteudo_md: '<output com alerta>' }`

Se tudo OK: `{ ok: true, conteudo_md: '<output limpo>' }`

### Passo 4 — Cruzamento com outros módulos (quando rodar como parte do executivo-diario)

Se a Skill `compor-executivo-diario` está orquestrando, **passar dados estruturados** (`r` completo) pra ela cruzar com triagem-email + agenda + discord.

Exemplos de cruzamentos que o sintetizador faz:
- "Reembolso do Lyra crescente" + "email Lyra reclamando" = ação alta prioridade
- "Anúncios DCL parados" + "vendas Lo-Fi caindo" = problema na conta Meta
- "ROAS muito alto" + "agenda lotada" = momento de escalar Ads

## Anti-padrões proibidos

- ❌ **Usar `price_value` em vez de `my_commission`** (racional §1.4 — receita real é my_commission)
- ❌ **Confiar em `is_order_bump`** (racional §1.6 — sempre `false`, usar `tv_launch_configs`)
- ❌ **Filtrar reembolso por `refund_date`** (racional §5.2.2 — usar `purchase_date` em BRT range)
- ❌ **Misturar moedas** (racional §1.3 — fixar BRL default)
- ❌ **Reportar Pixel purchases como Vendas** (racional §3.3 — fontes diferentes)
- ❌ **Inventar número quando wrapper retorna null** — declarar honesto: "dado indisponível pra dia X"

## Padrão de qualidade

- **NUNCA inventar** — todo número vem do `dash.resumo_dia()`
- **SEMPRE rodar Verifier** antes de devolver
- **SEMPRE incluir audit no rodapé** (configs ativos, janela BRT) — sócio audita visualmente
- **DECLARAR limites** quando dado parcial (ex: "08/05 ainda não tem `completed`, mostro `approved` que pode virar reembolso")

## Pendências conhecidas (registrar no output)

- **Categoria "Produto" pode divergir do dashboard em ~20-30%** quando há recorrências (ELO RECORRENTE, ProAlt Recorrente) ou produtos antigos (Escola do Perpétuo) NÃO mapeados em `tv_launch_configs`. Smoke test 08/05 mostrou: Skill calcula R$ 1.197, dashboard mostra R$ 1.700. Diferença: produtos sem config caem em "Produto" no dashboard mas Skill descontou bump/upsell/downsell apenas. Solução: alinhar com André quais produtos sem config devem entrar.
- **`completed` só aparece após janela de garantia** (7-30 dias). Pra ontem/anteontem, vendas estarão majoritariamente em `approved` (ainda em risco de reembolso). Output deve esclarecer: "X aprovadas (em garantia) + Y completadas (definitivas)".
