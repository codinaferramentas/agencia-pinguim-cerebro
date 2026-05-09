# Racional dos Dashboards Pinguim Ads — fonte canônica para a squad data

> **Para quem está lendo isto:** você é (ou serve) um agente de IA que precisa ler o banco Supabase de produção (`lkrehtmdqkgkyyotvjpz.supabase.co`) e responder no WhatsApp com os mesmos números que aparecem nos dashboards. Toda fórmula aqui foi **validada por consulta direta ao banco em 2026-05-09** e bate com os screenshots do dashboard do André.
>
> **Regra de ouro:** se o número que você mandar no WhatsApp não bater com o painel quando o cliente abrir, há bug em **um** dos dois lados. Antes de reportar, releia §6 (checklist anti-divergência).
>
> **Origem:** documento entregue pelo André em 2026-05-09, fruto de validação direta no projeto do dashboard. Salvo aqui como **fonte canônica** da squad data — qualquer Skill que toque dado financeiro deve seguir EXATAMENTE este racional. Princípio 11.

---

## 1. Conceitos transversais

### 1.1 Timezone — Brasília (BRT, UTC-3)

Todas as colunas `*_date` em `hotmart_transactions` (`purchase_date`, `approved_date`, `refund_date`, `warranty_expire_date`, `created_at`, `updated_at`) são `timestamp with time zone`, gravadas em **UTC**.

O usuário pensa em **dia BRT**. Para casar:

- "Dia X em BRT" = `[X T03:00:00 UTC, (X+1) T03:00:00 UTC)` (intervalo aberto à direita, fechado à esquerda).
- Exemplo: período "1 a 9 de mai de 2026" =
  ```
  purchase_date >= '2026-05-01T03:00:00'
  purchase_date  < '2026-05-10T03:00:00'
  ```
- A coluna `data` em `metricas_diarias` é `date` puro (sem hora) e já representa o dia BRT — **não converter**.

> **Validado:** com a janela acima, vendas BRL approved+completed = 112 — bate exato com card "Vendas" do screenshot do TV Dash Produto.

### 1.2 Os 11 status reais de `hotmart_transactions`

(Contagem total no banco em 2026-05-09)

| Status | Volume | Significado | Conta como… |
|---|---:|---|---|
| `completed` | 20.565 | Venda fora da janela de garantia | ✅ Venda |
| `delayed` | 4.122 | Pagamento atrasado (boleto/PIX vencidos sem pagar) | ❌ Não conta |
| `canceled` | 2.200 | Cancelado antes do pagamento | ❌ Não conta |
| `expired` | 1.907 | Boleto/PIX expirados | ❌ Não conta |
| `refunded` | 1.236 | Reembolsado | ⚠️ Apenas no card "Reembolsos" |
| `waiting_payment` | 268 | Aguardando pagamento (PIX gerado, etc.) | ❌ Não conta (pode entrar em "Pendente") |
| `approved` | 260 | Aprovado, dentro da janela de garantia | ✅ Venda |
| `billet_printed` | 195 | Boleto emitido, ainda não pago | ❌ Não conta (pode entrar em "Pendente") |
| `chargeback` | 20 | Disputa ganha pelo comprador | ❌ Não conta |
| `dispute` | 9 | Disputa em aberto | ❌ Não conta |
| `started` | 1 | Início de checkout | ❌ Não conta |

**Regra de receita:** `status IN ('approved', 'completed')`. **Sempre.** Tanto no TV Dash Produto quanto no Hotmart.

### 1.3 Moeda

`price_currency` na `hotmart_transactions`. Valores reais no banco: `BRL` (982 das últimas 1000 amostras), `USD` (8), `EUR` (7), `GBP` (1), `AUD` (1), `UYU` (1). Em todo o histórico há também `MXN`, `PEN`, `COP`.

Os dashboards têm **3 modos**:

- `BRL` (default) — `price_currency = 'BRL'`
- `USD` — `price_currency = 'USD'`
- `EUR` — `price_currency = 'EUR'`
- `Todas` — **sem filtro** de currency (soma BRL+USD+EUR+...)

> **ATENÇÃO do agente IA:** modo "Todas" mistura moedas em uma única soma — número fica numericamente errado. **Para reportar receita, sempre fixe a moeda** (default BRL).

### 1.4 Receita = `my_commission` (não `price_value`)

| Coluna | O que é | Quando usar |
|---|---|---|
| `price_value` | Preço cheio pago pelo cliente | **NÃO usar** para receita |
| `commission_value` | Comissão Hotmart antes da configuração da conta | Auditoria |
| `my_commission` | **Quanto a Pinguim recebe** (já descontado split, taxa Hotmart) | ✅ **Receita real** |
| `my_commission_usd` | Mesmo valor convertido para USD | Card "Receita Líquida USD" |

> **Validado:** receita Hotmart 30d BRL = `SUM(my_commission) WHERE status IN (approved,completed) AND price_currency='BRL'` = R$ 204.532,24 (screenshot mostra R$ 204.653,65; diferença 0,06%, dentro da margem de evolução do banco entre screenshot e consulta).

### 1.5 Filtros do TV Dash Produto

| Filtro | Default | Aplicação |
|---|---|---|
| **Período** (`from`, `to`) | Início do mês até hoje | `hotmart_transactions.purchase_date` (em BRT) **e** `metricas_diarias.data` |
| **Produto** (`product_ids[]`) | Todos | Hotmart: `product_id IN (...)` direto. Meta Ads: filtra por `entity_name LIKE '%[KEYWORD]%'` (ver §3.7) |
| **Moeda** (`currency`) | `BRL` | Apenas Hotmart (`price_currency`). Meta Ads é sempre BRL nos dados. |

### 1.6 Order Bump, Upsell, Downsell — fonte da verdade

A tabela `tv_launch_configs` tem **3 colunas de array de UUIDs** + 1 de produto presencial:

```
orderbump_product_ids   jsonb (uuid[])
upsell_product_ids      jsonb (uuid[])
downsell_product_ids    jsonb (uuid[])
presencial_product_id   uuid
```

**Hoje (2026-05-09) há 4 lançamentos `is_active=true`**: 365, Desafio Lo-Fi ABRIL, Desafio Low Ticket, Protocolo Venda Viral.

**Regra de categorização** (use exclusivamente esta tabela — **NÃO** confie no flag `is_order_bump`, ele está sempre `false` em períodos recentes):

```python
def categorizar_transacao(transacao, configs_ativos):
    pid = transacao.product_id
    for config in configs_ativos:
        if pid == config.main_product_id or pid == config.principal_product_id:
            return ('main', config)
        if pid in config.orderbump_product_ids:
            return ('bump', config)
        if pid in config.upsell_product_ids:
            return ('upsell', config)
        if pid in config.downsell_product_ids:
            return ('downsell', config)
        if pid == config.presencial_product_id:
            return ('presencial', config)
    return ('other', None)
```

> **Detalhe:** `tv_launch_configs` tem **duas** colunas de produto principal: `main_product_id` e `principal_product_id`. A primeira é o produto-chave do lançamento (ex.: para o config "Desafio Lo-Fi ABRIL", `main_product_id` = id do "Desafio Conteúdo Lo-Fi"). A segunda é um produto correlato (no mesmo config, `principal_product_id` = id do ELO). Para o agente, **somar ambos como `main`**.

### 1.7 Receita Total vs Receita Produto

> 🎯 **CORREÇÃO 2026-05-09 (descoberta lendo `dashboard/src/lib/produto-queries.ts`):**
> A fórmula original do MD inicial estava incompleta. **Bump/Upsell/Downsell têm filtro de `buyer_id`** — só contam quando comprados pelo MESMO comprador que levou um produto principal (semântica real de bump/upsell). Smoke test 08/05 fechou no centavo após esta correção.

```
Passo 1 — Identificar mainBuyerIds:
  rows_main = SELECT my_commission, buyer_id
              FROM hotmart_transactions
              WHERE status IN ('approved','completed')
                AND price_currency = X
                AND purchase_date in BRT range
                [AND product_id IN [filtro] se aplicável; sem filtro = TODOS]

  Receita_Produto = SUM(rows_main.my_commission)
  Vendas          = COUNT(rows_main)
  mainBuyerIds    = SET(rows_main.buyer_id)  ← chave da regra

Passo 2 — Bump/Upsell/Downsell filtrados por buyer:
  Receita_Bump     = SUM(my_commission) WHERE
                     product_id IN bump_ids
                     AND buyer_id IN mainBuyerIds  ← REGRA CRÍTICA
                     AND mesmo status/currency/range
  Receita_Upsell   = idem com upsell_ids
  Receita_Downsell = idem com downsell_ids

Passo 3 — Total:
  Receita_Total    = Receita_Produto + Receita_Bump + Receita_Upsell + Receita_Downsell
```

**Por que o filtro de buyer:** "bump" é semântico — o cliente comprou o produto principal **e levou o bump junto** no mesmo checkout. Vendas isoladas do produto-bump (alguém comprou só o bump, sem o principal) NÃO contam como bump nesse contexto, são produto standalone.

**Implicação:** quando filtro de produto = "Todos", `mainBuyerIds` = TODOS os buyers do dia → bump praticamente sempre cai em alguém que também tem main → bump efetivo bate com a soma simples. Quando filtro = produto específico, `mainBuyerIds` = só buyers daquele produto → bump filtra mais.

| KPI | Numerador |
|---|---|
| Card "Receita" (TV Dash Produto) | **Receita_Total** (validado pelo screenshot) |
| ROAS, Lucro | Receita_Total |
| **Ticket Médio** | **Receita_Total ÷ Vendas** (decisão validada com André) |
| Vendas | `COUNT(*)` apenas das transações **main** (não somar bump/upsell/downsell como vendas separadas — eles são complementos da venda principal) |

> ⚠️ **Override do código do dashboard:** o arquivo `src/lib/queries.ts:235` no projeto dashboard calcula `ticketMedio = receita_produto / vendas` (só produto). O **André confirmou**: a regra correta é `Receita_Total / Vendas`. **Use sempre Receita_Total.** Quando o código do dashboard for atualizado, este documento permanece a referência.

---

## 2. Tabelas Supabase — schema validado

Schema confirmado em **2026-05-09** consultando a API REST de produção. Apenas as tabelas relevantes aos 3 dashboards são listadas.

### 2.1 `hotmart_transactions` (vendas, reembolsos)

```
id                         uuid           PK
transaction_code           text           ex.: "HP4172837046" — id Hotmart, único
buyer_id                   uuid           FK hotmart_buyers
product_id                 uuid           FK hotmart_products → usar para categorizar
offer_id                   uuid           FK hotmart_offers
status                     text           1 dos 11 valores listados em §1.2
payment_type               text           CREDIT_CARD, BILLET, PIX, ...
payment_installments       int
price_value                numeric        preço pago pelo cliente
price_currency             text           BRL, USD, EUR, etc.
commission_value           numeric        comissão raw Hotmart
commission_currency        text
commission_source          text           'PRODUCER' ou outro
is_order_bump              boolean        ⚠️ NÃO confiável (sempre false em períodos recentes)
parent_transaction_code    text           ⚠️ NÃO populado nos dados recentes
warranty_expire_date       timestamptz    data fim da garantia
hotmart_fee                numeric        taxa cobrada pela Hotmart
src                        text           UTM bruto
sck                        text
purchase_date              timestamptz    UTC — base para filtros de período
approved_date              timestamptz    UTC — quando saiu de pending para approved
refund_date                timestamptz    UTC — quando virou refunded (NULL se não foi)
created_at                 timestamptz
updated_at                 timestamptz
my_commission              numeric        ← RECEITA REAL Pinguim (na moeda original)
exchange_rate_usd          numeric
my_commission_usd          numeric        ← Receita Pinguim em USD
```

### 2.2 `hotmart_products` (catálogo)

```
id                         uuid           PK — usado em FKs e em tv_launch_configs
hotmart_product_id         bigint         id numérico da Hotmart
name                       text           nome de exibição
is_active                  boolean
created_at, updated_at     timestamptz
```

**57 produtos cadastrados.** Lista completa em §8.1.

### 2.3 `tv_launch_configs` (configuração de lançamentos)

```
id                         uuid           PK
name                       text           nome do lançamento, ex.: "Desafio Lo-Fi ABRIL"
start_date                 date
end_date                   date
main_product_id            uuid           produto principal do lançamento
principal_product_id       uuid           produto correlato (somar com main)
orderbump_product_ids      jsonb (uuid[]) bumps
upsell_product_ids         jsonb (uuid[]) upsells
downsell_product_ids       jsonb (uuid[]) downsells
presencial_product_id      uuid           opcional, se há evento presencial relacionado
campaign_name_contains     text           substring do entity_name no Meta para identificar campanhas (ex.: "DCL", "DLT", "365", "PVV")
goal_qty                   int            meta de vendas
goal_revenue               numeric        meta de receita
is_active                  boolean        FILTRAR is_active=true
created_at, updated_at     timestamptz
```

> **Importante:** ao agregar bumps/upsells/downsells "de todos os produtos" no modo filtro=Todos do dashboard, **somar os IDs de todos os configs ativos**, sem repetir.

### 2.4 `metricas_diarias` (Meta Ads)

```
id                         uuid           PK
conta_id                   uuid           FK contas
data                       date           dia BRT (não converter timezone)
nivel                      text           account | campaign | adset | ad
entity_id                  text           id no Meta da entidade
entity_name                text           nome no Meta — base para mapear ao produto Hotmart
parent_id                  text           id da entidade pai
spend                      numeric        custo na moeda da conta (sempre BRL)
impressions                int
clicks                     int            link clicks
ctr, cpc, cpm              numeric        métricas pré-calculadas pela API Meta
actions                    jsonb          array [{action_type, value}] — ver §2.4.1
action_values              jsonb          array [{action_type, value}] em valor monetário
reach                      int
frequency                  numeric
unique_clicks              int
unique_ctr                 numeric
purchase_roas              numeric        ROAS do Pixel
... (várias outras de vídeo, ranking, etc — não usadas nos dashboards principais)
```

**6 contas Meta ativas** (`contas` table): ver §8.3.

#### 2.4.1 Estrutura de `actions` (jsonb)

Array de objetos `{action_type: string, value: string}`. `value` vem como **string**, converter para `int`. Exemplos relevantes:

| `action_type` | O que é |
|---|---|
| `landing_page_view` | Page views (LPVs) |
| `initiate_checkout` | Inícios de checkout |
| `purchase` | Compras (atribuição Pixel — **não bate** com Hotmart) |
| `link_click` | Cliques em link (também já vem em `clicks`) |
| `omni_*` | Variações que somam web + app + offline |
| `offsite_conversion.fb_pixel_*` | Eventos do Pixel especificamente |
| `onsite_*`, `onsite_conversion.*` | Eventos no Facebook/Instagram nativos |

> **NÃO somar variações ao mesmo tempo!** O Pixel envia o mesmo evento sob vários nomes. Os dashboards usam apenas: `landing_page_view`, `initiate_checkout`, `purchase` (sem prefixo). Validado pelo screenshot.

### 2.5 `boleto_transactions` (boletos via SkinPeds/eNotas)

Origem diferente da Hotmart. Inclui financiamento em parcelas. **Hoje os dashboards não usam.** Existe para tracking separado de Sirius/SkinPeds.

### 2.6 `hotmart_subscriptions` / `hotmart_cart_abandonment`

Usadas pelas sub-abas `Assinaturas` e `Abandonos` do dashboard Hotmart (ver §5.4).

### 2.7 Como Hotmart se conecta ao Meta Ads

NÃO há FK. A relação é por **string match no `entity_name`** usando `tv_launch_configs.campaign_name_contains`:

| Lançamento (`name`) | `campaign_name_contains` |
|---|---|
| 365 | `365` |
| Desafio Lo-Fi ABRIL | `DCL` |
| Desafio Low Ticket | `DLT` |
| Protocolo Venda Viral | `PVV` |

**Regra:** quando o usuário filtra "Produto = Desafio Lo-Fi" no dashboard, o agente busca todos os `tv_launch_configs` em que esse produto está em `main_product_id` ou `principal_product_id` ou `orderbump_product_ids` ou..., coleta todos os `campaign_name_contains` desses configs, e filtra `metricas_diarias.entity_name` por `LIKE %{keyword}%` (qualquer uma das keywords).

⚠️ **Campanhas sem keyword no nome somem do filtro.** Sempre nomear campanha Meta com a keyword do lançamento.

---

## 3. Dashboard: TV Dash Produto

> Layout: header (filtros) → KPI bar (8 cards) → barra de breakdown de receita → funil + tabela diária + gráfico → cards de produto + donut.

Validações abaixo usam **período "1 a 9 de mai de 2026"**, filtro produto = Todos, moeda = BRL (default do screenshot).

### 3.1 KPI Bar (8 cards)

Todos os KPIs respeitam: período BRT, filtro de produto (via `product_id` direto + keyword no `entity_name`), filtro de moeda (Hotmart only).

| KPI | Cálculo |
|---|---|
| **Investimento** | `SUM(spend) FROM metricas_diarias WHERE nivel='campaign' AND data BETWEEN from AND to AND (entity_name matches keywords if filtro produto)` |
| **Receita** | `Receita_Total = Produto + Bump + Upsell + Downsell` (ver §1.7) |
| **ROAS** | `Receita_Total / Investimento` (2 casas) |
| **Lucro** | `Receita_Total − Investimento` |
| **Vendas** | `COUNT(*)` apenas main: `WHERE status IN ('approved','completed') AND product_id IN main_ids AND price_currency=currency AND purchase_date in BRT range` |
| **CPA** | `Investimento / Vendas` |
| **Ticket Médio** | `Receita_Total / Vendas` |
| **Frequência** | **Média simples** dos `frequency` das linhas com `frequency > 0` (nivel=campaign) |

> **Sobre o `is_order_bump`:** validei que o flag está `false` em **todas as 112 transações** do período. **NÃO** use esse campo para categorizar bump. Use `tv_launch_configs.orderbump_product_ids`.

### 3.2 Revenue Breakdown Bar (abaixo dos KPIs)

Stacked bar com 4 segmentos (orange / amber / purple / cyan).

```
Produto    SUM(my_commission) onde product_id ∈ main_ids
Bump       SUM(my_commission) onde product_id ∈ bump_ids
Upsell     SUM(my_commission) onde product_id ∈ upsell_ids
Downsell   SUM(my_commission) onde product_id ∈ downsell_ids
Total      Produto + Bump + Upsell + Downsell
```

- **Vendas por categoria** = `COUNT(*)` com mesmos filtros (status + período + moeda + produto).
- **% na barra** = `(categoria / total) × 100`, arredondado a inteiro.

### 3.3 Funil (lateral esquerda)

Funil **do Meta Ads** (Pixel), não do Hotmart. 5 etapas + 3 métricas no rodapé.

Fonte: `metricas_diarias` com `nivel='campaign'`, mesmo filtro de período + keywords.

| Etapa | Numerador | Métrica direita | Fórmula |
|---|---|---|---|
| **Impressões** | `SUM(impressions)` | **CPM** | `SUM(spend) × 1000 / SUM(impressions)` |
| **Cliques** | `SUM(clicks)` | **CTR** | `SUM(clicks) × 100 / SUM(impressions)` (%) |
| **Visualizações da Página** | `SUM(action.value)` para `action_type='landing_page_view'` | **Connect** | `pageViews × 100 / clicks` |
| **Inicie Checkout** | `SUM(action.value)` para `action_type='initiate_checkout'` | **Ida ao Check** | `checkouts × 100 / pageViews` |
| **Compras** | `SUM(action.value)` para `action_type='purchase'` | **CV CHECK** | `purchases_pixel × 100 / checkouts` |

Rodapé do funil:

| Métrica | Fórmula |
|---|---|
| **TM** | `Receita_Total_Hotmart / Vendas_Hotmart` |
| **PI%** | `purchases_pixel × 100 / impressions` (4 casas) |
| **CV PÁGINA** | `purchases_pixel × 100 / pageViews` |

> **Sobre `purchases_pixel` (Compras=8) vs Vendas Hotmart (112):** são fontes **completamente diferentes**. O Pixel só atribui compras com cookie de origem em campanhas Meta. **Nunca** reporte "Vendas=8" baseado no funil. Use o KPI Vendas Hotmart.

### 3.4 Tabela diária (centro)

Uma linha por dia BRT no período, ordenada **descendente**. Combina Hotmart + Meta Ads.

| Coluna | Origem | Fórmula |
|---|---|---|
| **DATA** | — | dia BRT formatado `DD/MM/YYYY` |
| **VENDAS** | Hotmart | `COUNT(*)` agrupado por dia BRT (status approved/completed, filtros aplicados) |
| **CPA** | calc | `spend_dia / vendas_dia`. Se spend=0, mostra `-`. |
| **INVEST.** | Meta | `SUM(spend)` do dia (`metricas_diarias.data`) |
| **TOTAL** | Hotmart | `Receita_Total` do dia (Produto+Bump+Upsell+Downsell) |
| **PRODUTO** | Hotmart | `SUM(my_commission)` do dia, apenas main_ids |
| **BUMP** | Hotmart | idem para bump_ids |
| **UPSELL** | Hotmart | idem para upsell_ids |
| **DOWNSELL** | Hotmart | idem para downsell_ids |
| **ROAS** | calc | `Receita_Total_dia / Spend_dia` |
| **TICKET M.** | calc | `Receita_Total_dia / Vendas_dia` |
| **CPM** | Meta | **média simples** dos `cpm` das linhas do dia (filtra cpm>0) |
| **CTR** | Meta | média simples dos `ctr` (filtra ctr>0) |
| **FREQ.** | Meta | média simples dos `frequency` (filtra frequency>0) |

### 3.5 Gráfico "Vendas por período" (área)

Linha de área com `COUNT(*)` Hotmart por dia BRT (filtros aplicados). Apenas dias com ≥1 venda.

### 3.6 Cards de produto (rodapé esquerdo)

Lista ordenada por receita decrescente. Por produto:

```sql
SELECT hotmart_products.name,
       SUM(my_commission) AS receita,
       COUNT(*) AS vendas
FROM hotmart_transactions
JOIN hotmart_products ON product_id = id
WHERE status IN ('approved','completed')
  AND purchase_date in BRT range
  AND price_currency = currency
  -- AND product_id IN selecionados (se filtro)
GROUP BY name
ORDER BY receita DESC
```

| Coluna | Fórmula |
|---|---|
| Nome | `hotmart_products.name` |
| Receita | `SUM(my_commission)` |
| Ticket Médio | `Receita_produto / Vendas_produto` |
| **PI%** | `Vendas_produto × 100 / Total_de_vendas_no_período` |
| Vendas | `COUNT(*)` |

### 3.7 Donut de tráfego

Distribuição de spend por **adset** (`nivel='adset'` em `metricas_diarias`).

```sql
SELECT entity_name AS adset_name, SUM(spend)
FROM metricas_diarias
WHERE nivel = 'adset'
  AND data BETWEEN from AND to
  -- AND entity_name matches keywords se filtro produto
GROUP BY entity_name
ORDER BY SUM(spend) DESC
LIMIT 9  -- top 9 + "Outros"
```

Cada fatia: `(spend_adset / spend_total) × 100`, 1 casa decimal.

### 3.8 Filtragem Meta Ads por produto (regra crítica)

Como não há FK, é string match em `entity_name`. Pseudocódigo:

```python
def keywords_dos_produtos_selecionados(product_ids, configs):
    kws = set()
    for cfg in configs:  # is_active=true
        if cfg.main_product_id in product_ids \
           or cfg.principal_product_id in product_ids \
           or any(p in product_ids for p in (cfg.orderbump_product_ids or [])) \
           or any(p in product_ids for p in (cfg.upsell_product_ids or [])) \
           or any(p in product_ids for p in (cfg.downsell_product_ids or [])):
            if cfg.campaign_name_contains:
                kws.add(cfg.campaign_name_contains)
    return list(kws)
```

Selecionar um produto do filtro **arrasta o lançamento inteiro** (todas as campanhas que mencionam o `campaign_name_contains` daquele lançamento).

### 3.9 Por que `nivel='campaign'` em quase tudo

Validado em 2026-05-08: rows em `ad`, `adset`, `campaign` somam **mesmo `spend` e `impressions`**. Sem filtrar nível, o total fica ×3 ou ×4 (double counting).

| Visualização | Nível |
|---|---|
| KPIs, funil, tabela diária | `campaign` |
| Donut de tráfego | `adset` |
| Drill-down por anúncio | `ad` |

**Nunca** somar sem filtrar nível.

---

## 4. Dashboard: Meta Ads

Visão genérica de todas as campanhas Meta. **Sem filtro de produto.**

### 4.1 Filtros

- **Período:** `Hoje | Ontem | 7 dias | 14 dias | 30 dias | Custom`. Default 7 dias.
- **Sem filtro de produto, sem filtro de moeda.**

### 4.2 KPIs

> Validado para "7 dias" (04-09 mai 2026) com `nivel='campaign'`:

| KPI | Cálculo |
|---|---|
| Gasto Total | `SUM(spend)` |
| Faturamento | `SUM(action_values.value)` para `action_type='purchase'` (em R$) |
| Compras | `SUM(action.value)` para `action_type='purchase'` |
| CPA Médio | `Gasto / Compras` |
| ROAS | `Faturamento / Gasto` |
| Alcance Total | `SUM(reach)` |
| Impressões | `SUM(impressions)` |
| Cliques Únicos | `SUM(unique_clicks)` |
| CPM Médio | **Média ponderada:** `SUM(spend)*1000/SUM(impressions)` |
| Frequência | `SUM(impressions)/SUM(reach)` |

> ⚠️ **Faturamento ≠ Receita Hotmart.** Aqui é a atribuição do Pixel. Para receita real → Hotmart. Diferença pode ser **20–60%**.

### 4.3 Gráfico Gasto vs Faturamento

Duas linhas no período:

- 🔴 Gasto: `SUM(spend)` por `data`
- 🟢 Faturamento: `SUM` dos `action_values.value` onde `action_type='purchase'` por `data`

---

## 5. Dashboard: Hotmart

Visão de vendas, assinaturas, abandonos e **reembolsos**. É a única tela que mostra reembolsos.

### 5.1 Filtros

- **Período:** `Hoje | Ontem | 7 dias | 14 dias | 30 dias | Custom`.
- **Sem filtro de produto/moeda no topo.**

### 5.2 KPIs

> Validado para "30 dias" (10/abr-09/mai BRT):

| KPI | Cálculo |
|---|---|
| **Receita Líquida** | `SUM(my_commission) WHERE status IN ('approved','completed') AND price_currency='BRL' AND purchase_date in BRT range` |
| **Receita Líquida USD** | `SUM(my_commission_usd)` para transações **non-BRL** com mesmo filtro |
| **Aprovadas (Pendente)** | `SUM(my_commission) WHERE status='approved' AND price_currency='BRL' AND purchase_date in BRT range` — vendas aprovadas que ainda **não viraram completed** (dentro da janela de garantia) |
| **Vendas** | `COUNT(*) WHERE status IN ('approved','completed') AND price_currency='BRL' AND purchase_date in BRT range` |
| **Ticket Médio** | `Receita_Líquida / Vendas` |
| **Reembolsos** | `COUNT(*) WHERE status='refunded' AND price_currency='BRL' AND purchase_date in BRT range` |
| **Taxa Reembolso** | `Reembolsos × 100 / (Vendas + Reembolsos)` |

> 🎯 **A taxa usa o denominador `Vendas + Reembolsos` (não só Vendas).** Validado no screenshot. **Não inverta.**

#### 5.2.1 "Aprovadas (Pendente)" em detalhe

É um termo Hotmart específico:

- **`approved`**: pagamento confirmado, mas ainda na janela de garantia (em geral 7–30 dias). Pode virar `completed` ou `refunded`.
- **`completed`**: garantia expirada — venda definitiva.

A coluna mostra `SUM(my_commission)` apenas dos `approved`, **não** somando `completed`. É a **receita ainda em risco de reembolso**.

#### 5.2.2 Filtro de data dos Reembolsos

> Decisão validada com André: o filtro de data dos reembolsos usa o **mesmo critério de filtro do dashboard** (`purchase_date` em BRT range). NÃO usar `refund_date`.

**Implicação prática:** se um cliente comprou em 10/jan e foi reembolsado em 8/fev, ao filtrar "todo fevereiro" essa linha **não aparece** no card de reembolsos (a `purchase_date` é de janeiro). Está alinhado com o comportamento da tela atual.

### 5.3 Gráfico Receita Diária (barras)

Por dia BRT no período, `SUM(my_commission) WHERE status IN ('approved','completed') AND price_currency='BRL'`.

### 5.4 Sub-abas

| Sub-aba | Tabela origem | Notas |
|---|---|---|
| **Vendas** | `hotmart_transactions` (status approved/completed) | Lista detalhada das transações |
| **Produtos** | agregado por `product_id` | Igual ao card de produtos do TV Dash, mas sem filtro de campanha |
| **Abandonos** | `hotmart_cart_abandonment` | Carrinhos abandonados |
| **Assinaturas** | `hotmart_subscriptions` | Recorrências |

### 5.5 Reembolsos — query padrão para o agente IA

```sql
-- "Quantos reembolsos no período X?"
SELECT COUNT(*) AS qtd_reembolsos,
       SUM(my_commission) AS receita_perdida,
       SUM(price_value) AS valor_bruto_perdido
FROM hotmart_transactions
WHERE status = 'refunded'
  AND price_currency = '<BRL|USD|EUR>'
  AND purchase_date >= '<from_BRT> 03:00:00'
  AND purchase_date <  '<to_next_BRT> 03:00:00';

-- Taxa de reembolso:
SELECT
  qty_refund * 100.0 / (qty_sales + qty_refund) AS taxa_reembolso_pct
FROM (
  SELECT
    COUNT(*) FILTER (WHERE status='refunded') AS qty_refund,
    COUNT(*) FILTER (WHERE status IN ('approved','completed')) AS qty_sales
  FROM hotmart_transactions
  WHERE price_currency = 'BRL'
    AND purchase_date >= '<from> 03:00:00'
    AND purchase_date <  '<to+1> 03:00:00'
) t;
```

---

## 6. Como os três dashboards se conversam

### 6.1 O que **deve** bater entre dashboards

| Métrica | TV Dash Produto (sem filtro de produto) | Hotmart | Por quê bate |
|---|---|---|---|
| Vendas | sem filtro produto + BRL = total geral | `SUM(approved+completed BRL)` | Mesma fonte (`hotmart_transactions`), mesmo critério |
| Receita BRL | KPI Receita = Receita_Total | KPI Receita Líquida + soma de bumps/upsells/downsells | TV Dash Produto soma já tudo; Hotmart só mostra Receita Líquida |
| Reembolsos | **Não mostra** | `COUNT WHERE status='refunded'` | Único lugar |

### 6.2 O que **não bate** (e está certo não bater)

| Métrica | TV Dash Produto | Meta Ads | Por quê |
|---|---|---|---|
| Compras | KPI Vendas (Hotmart) = 112 | "Compras" do Pixel = 8 | Fontes diferentes. Hotmart é caixa real; Pixel é atribuição |
| ROAS | Hotmart_Total / Spend | Pixel_Faturamento / Spend | Idem. Hotmart é mais conservador |
| Investimento | Filtra por keyword no entity_name | Soma todas as contas/campanhas | Campanhas sem keyword somem com filtro de produto |

### 6.3 Checklist anti-divergência (ANTES do agente IA disparar mensagem)

Quando o agente for reportar um número, percorrer esta lista:

1. ✅ **Timezone:** "ontem" do usuário = `today - 1d` em BRT. Convertido para `[X T03:00:00 UTC, (X+1) T03:00:00 UTC)`.
2. ✅ **Status:** está usando `IN ('approved','completed')` para receita/vendas? `delayed`/`waiting_payment`/`billet_printed` **não** entram.
3. ✅ **Moeda:** filtrou por `price_currency = 'BRL'` (ou outra)? Sem filtro mistura tudo.
4. ✅ **Campo de receita:** `my_commission` (não `price_value` nem `commission_value`).
5. ✅ **Nível Meta:** `nivel='campaign'` para tudo exceto donut (`adset`). Sem filtro = double-counting.
6. ✅ **Keywords se filtra produto:** todas as campanhas têm a keyword no `entity_name`?
7. ✅ **Bump/Upsell/Downsell:** o KPI Receita do TV Dash é Receita_**Total** (já inclui). Categorização sai da `tv_launch_configs`, **não** do flag `is_order_bump`.
8. ✅ **`purchases` (funil) ≠ `vendas` (KPI):** Pixel ≠ Hotmart.
9. ✅ **Reembolsos:** filtrar por `purchase_date` (não `refund_date`).
10. ✅ **Taxa de reembolso:** denominador é `vendas + reembolsos`.

---

## 7. Glossário rápido de fórmulas

```
─── Janela BRT → UTC ────────────────────
utcFrom = from_brt + 'T03:00:00'   (UTC)
utcTo   = (to_brt + 1 dia) + 'T03:00:00'   (UTC)
purchase_date >= utcFrom AND purchase_date < utcTo

─── Hotmart venda válida ─────────────────
status IN ('approved','completed')

─── Categorização (precisa de tv_launch_configs ativos) ───
main_ids       = ⋃ {main_product_id, principal_product_id} de todos configs ativos
bump_ids       = ⋃ orderbump_product_ids
upsell_ids     = ⋃ upsell_product_ids
downsell_ids   = ⋃ downsell_product_ids
presencial_ids = ⋃ {presencial_product_id}

─── Receita ──────────────────────────────
Receita_Produto    = SUM(my_commission) WHERE product_id IN main_ids
Receita_Bump       = SUM(my_commission) WHERE product_id IN bump_ids
Receita_Upsell     = SUM(my_commission) WHERE product_id IN upsell_ids
Receita_Downsell   = SUM(my_commission) WHERE product_id IN downsell_ids
Receita_Total      = Produto + Bump + Upsell + Downsell

─── KPIs principais ──────────────────────
Vendas         = COUNT(*) WHERE product_id IN main_ids
Investimento   = SUM(spend) FROM metricas_diarias WHERE nivel='campaign'
                 AND entity_name matches keywords (se filtro produto)
ROAS           = Receita_Total / Investimento
Lucro          = Receita_Total − Investimento
CPA            = Investimento / Vendas
Ticket_Médio   = Receita_Total / Vendas
Frequência     = AVG(frequency) das linhas com frequency>0  (média simples)

─── Funil (Pixel, nivel=campaign) ────────
CPM            = SUM(spend) × 1000 / SUM(impressions)
CTR            = SUM(clicks) × 100 / SUM(impressions)         (%)
PageViews      = SUM(action.value WHERE action_type='landing_page_view')
Checkouts      = SUM(action.value WHERE action_type='initiate_checkout')
Purchases_Pixel= SUM(action.value WHERE action_type='purchase')
Connect        = PageViews × 100 / Cliques
Ida_ao_Check   = Checkouts × 100 / PageViews
CV_CHECK       = Purchases_Pixel × 100 / Checkouts
PI%            = Purchases_Pixel × 100 / Impressões  (4 casas)
CV_PÁGINA      = Purchases_Pixel × 100 / PageViews

─── Reembolso ──────────────────────────
Reembolsos     = COUNT(*) WHERE status='refunded'
                 AND price_currency=currency
                 AND purchase_date in BRT range
Taxa_Reembolso = Reembolsos × 100 / (Vendas + Reembolsos)
```

---

## 8. Apêndice — catálogo de IDs

### 8.1 `hotmart_products` (57 produtos ativos — extrato)

| `id` | Nome | `hotmart_product_id` |
|---|---|---|
| `53421c9e-e570-4a55-b0c8-a331c093f412` | 365 Roteiros Validados | 5984739 |
| `2fa35723-9b5e-41c6-9000-7bcafeb91b41` | Desafio Conteúdo Lo-Fi | 6207337 |
| `d78ba73e-cfd2-44e4-a9df-5f23a817d36a` | Desafio de Low Ticket | 6662699 |
| `69c307ae-8b91-4e87-a41b-2f9f6a364a22` | Protocolo Venda Viral | 7189437 |
| `c9de0ad1-f87d-41f4-aa26-89bf822a4895` | ELO | 6404411 |
| `322fed48-c776-4f06-80e1-97e26c2789a2` | ProAlt - Low Ticket | 6811692 |
| `a836577d-c460-4225-bfad-c04baab34ac6` | [Presencial] Desafio Conteúdo LoFi em BH | 7206247 |
| `1e545449-6e75-496e-b40e-d9f2e12c1d90` | [PRESENCIAL] Desafio Low Ticket - BH | 7322276 |
| `46818775-916f-4b0a-a961-15723c73ee69` | ANÁLISE DE PERFIL DO INSTAGRAM | 5673093 |
| `47783142-5530-46ae-9955-7eb6d38e5b79` | Edição de Conteúdo No Celular | 5984961 |
| `2d9fe3fd-a896-4c08-bb99-62484e1eb7d1` | 120 Sequências de Stories Validadas | 6322358 |
| `cd2279e5-18e5-44b8-9bdd-72b370426e4c` | Super Stories | 2882362 |
| `565e4c71-2a60-4915-aa7f-fb20520ab212` | Gerador de Leads 24 horas | 5501553 |
| `46c894bf-c251-43d1-b786-e5c1043352fe` | Sirius Lab | 5863082 |
| `902d516b-275d-4024-b8e3-4fdd155c8270` | Acesso Gravação Desafio Conteúdo Lo-Fi | 6471958 |
| `2f8e4687-2ff7-457b-b12d-61d40a0bf17d` | Acesso Vitalício Gravação Desafio Low Ticket | 7050023 |

(Lista completa: 57 produtos. Quando precisar de outro `id`, query `SELECT id, name FROM hotmart_products`.)

### 8.2 `tv_launch_configs` ativos (em 2026-05-09)

#### 8.2.1 **365**
- `main_product_id` = `53421c9e-e570-4a55-b0c8-a331c093f412` (365 Roteiros Validados)
- `principal_product_id` = `null`
- `orderbump_product_ids` = `[46818775..., 47783142..., 2d9fe3fd...]` (Análise IG, Edição Celular, 120 Sequências)
- `upsell_product_ids` = `[69c307ae... (Protocolo Venda Viral), cd2279e5... (Super Stories)]`
- `downsell_product_ids` = `[565e4c71... (Gerador Leads), 46c894bf... (Sirius Lab)]`
- `campaign_name_contains` = `365`
- Período: 2026-04-01 a 2026-04-30
- Goal: 4.430 vendas / R$ 296.875

#### 8.2.2 **Desafio Lo-Fi ABRIL** (DCL)
- `main_product_id` = `2fa35723...` (Desafio Conteúdo Lo-Fi)
- `principal_product_id` = `c9de0ad1...` (ELO)
- `orderbump_product_ids` = `[902d516b..., 53421c9e..., 46818775...]` (Gravação Lo-Fi, 365 Roteiros, Análise IG)
- `upsell_product_ids` = `[]`
- `downsell_product_ids` = `[]`
- `presencial_product_id` = `a836577d...` (Presencial Lo-Fi BH)
- `campaign_name_contains` = `DCL`
- Período: 2026-03-09 a 2026-04-07

#### 8.2.3 **Desafio Low Ticket** (DLT)
- `main_product_id` = `d78ba73e...` (Desafio de Low Ticket)
- `principal_product_id` = `322fed48...` (ProAlt - Low Ticket)
- `orderbump_product_ids` = `[2f8e4687...]` (Acesso Vitalício DLT)
- `presencial_product_id` = `1e545449...` (Presencial DLT BH)
- `campaign_name_contains` = `DLT`
- Período: 2026-03-14 a 2026-04-28

#### 8.2.4 **Protocolo Venda Viral** (PVV)
- `main_product_id` = `69c307ae...` (Protocolo Venda Viral)
- `principal_product_id` = `null`
- `orderbump_product_ids` = `[]`
- `upsell_product_ids` = `[c9de0ad1...]` (ELO)
- `campaign_name_contains` = `PVV`
- Período: 2026-04-01 a 2026-04-30

### 8.3 Contas Meta Ads (`contas`, 6 ativas)

| Nome | `meta_account_id` |
|---|---|
| [MM] Crescimento de Base | `act_380306702470122` |
| [Low-Ticket] Conta Oficial | `act_257298504837385` |
| [PV] Protocolo Venda Viral | `act_629914404009408` |
| [365] Conta 365 - Trafego Direto | `act_185908458873414` |
| [DCL] Desafio Lofi + Quizz | `act_2157149891230397` |
| [PV] - Protocolo Venda Viral - 2 | `act_2147144898902692` |

---

## 9. Apêndice — Layout de referência (TV Dash Produto)

Estrutura visual do dashboard TV (referência pra sintetizador `compor-executivo-diario` modelar layout do relatório):

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER: [filtros: produto] [moeda: BRL/EUR/USD] [período: from-to] │
├─────────────────────────────────────────────────────────────────────┤
│ KPI BAR (8 cards horizontais):                                      │
│   Investimento | Receita | ROAS | Lucro | Vendas | CPA | TM | Freq │
├─────────────────────────────────────────────────────────────────────┤
│ REVENUE BAR (stacked):                                              │
│   ● Produto R$X (N vendas) ● Bump ● Upsell ● Downsell  Total R$Y   │
├──────────────────────────────────┬──────────────────────────────────┤
│ FUNIL (esquerda):                │ TABELA DIÁRIA (centro):         │
│   65,67 mil Impressões | CPM     │ DATA | VENDAS | CPA | INVEST.   │
│   1,62 mil Cliques | CTR         │      | TOTAL  | PRODUTO | BUMP  │
│   413 LPV | Connect              │      | UPSELL | DOWNSELL | ROAS │
│   67 Checkouts | Ida ao Check    │      | TICKET M. | CPM | CTR    │
│   8 Compras | CV CHECK           │      | FREQ.                    │
│                                  │ ...uma linha por dia BRT...    │
│ Rodapé: TM | PI% | CV PÁGINA     │                                  │
│                                  │ GRÁFICO Vendas/dia (área)       │
├──────────────────────────────────┴──────────────────────────────────┤
│ CARDS DE PRODUTO (rodapé esquerdo) | DONUT TRÁFEGO (rodapé direito) │
│   Produto | Receita | TM | PI%    | top 9 adsets + Outros           │
│   ordenado por receita desc       | spend %                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Cores do dashboard (referência):**
- Fundo principal: dark navy/preto
- Laranja Pinguim para destaque (`#E85C00` aprox)
- Amber para Bump
- Roxo para Upsell
- Cyan para Downsell
- Branco para texto primário

**Para o relatório executivo (que NÃO é dashboard, é highlight):**
- Manter palette do dashboard pra continuidade visual
- Mas estrutura é COMPACTA (não replicar tela inteira) — TL;DR no topo + seções colapsáveis embaixo
- Usar mesma paleta de cores por categoria (Bump=amber, Upsell=roxo, Downsell=cyan)
- Ver Skill `compor-executivo-diario` pra layout final do relatório

---

## Apêndice C — Arquivos de referência

- Queries do dashboard (referência do código original): `src/lib/queries.ts`
- Mapa Hotmart→Meta (DEPRECATED — usar `tv_launch_configs.campaign_name_contains` em vez): `src/lib/campaign-product-map.ts`
- Tipos: `src/lib/types.ts`
- Componente principal: `src/components/Dashboard.tsx`
