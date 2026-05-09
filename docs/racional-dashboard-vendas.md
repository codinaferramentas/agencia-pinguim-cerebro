# Racional do Dashboard de Vendas — V2.14 RASCUNHO PRO ANDRÉ CORRIGIR

**Status:** RASCUNHO inferido por leitura do schema (2026-05-09).
**Pra fechar:** André confirma/corrige o que tá errado, vira oficial em `cerebro/squads/data/contexto/`.

> Por que esse arquivo existe: Skills da squad data NÃO podem inferir cálculo
> sozinhas. André explicou — código tem o "como", mas só humano sabe o "porquê"
> (ex: "venda só conta com `status='completed'`" pode parecer óbvio mas
> existe motivo de negócio pra incluir/excluir cada caso). Sem racional escrito,
> Skill alucina e Verifier não tem como validar.

---

## 1. Conexão

- **Projeto Supabase:** `lkrehtmdqkgkyyotvjpz` (separado do Pinguim OS)
- **URL:** `https://lkrehtmdqkgkyyotvjpz.supabase.co`
- **Acesso:** Management API token (cofre `pinguim.cofre_chaves` chave `DASHBOARD_ACCESS_TOKEN`)
- **Wrapper:** `server-cli/lib/db-dashboard.js` — read-only, bloqueia INSERT/UPDATE/DELETE por defesa em profundidade

## 2. Tabelas relevantes (mapeadas em 2026-05-09)

| Tabela | Linhas (em 09/05) | Pra quê |
|---|---:|---|
| `hotmart_transactions` | 30.773 | **Vendas, faturamento, reembolsos.** Tabela principal. |
| `hotmart_products` | ~50 | Map UUID `product_id` → nome humano ("ELO", "Desafio Lo-Fi", etc) |
| `hotmart_buyers` | ? | Comprador (nome, email) — JOIN se quiser segmentar por cliente |
| `hotmart_offers` | ? | Variações de oferta dentro de um produto |
| `hotmart_subscriptions` | ? | Recorrências (ELO RECORRENTE, ProAlt Recorrente) |
| `hotmart_cart_abandonment` | ? | Quem entrou no checkout mas não comprou |
| `hotmart_transaction_history` | ? | Eventos por transação (criado, aprovado, reembolsado) |
| `hotmart_transaction_affiliates` | ? | Comissão por afiliado |
| `hotmart_webhook_logs` | ? | Log dos webhooks recebidos do Hotmart |
| `metricas_diarias` | 12.837 | **Métricas de Ads Meta diárias por entity (ad/adset/campaign).** 50 colunas. |
| `contas` | ~5 | Contas Meta Ads ([MM] Crescimento, [Low-Ticket] Conta Oficial, etc) |
| `criativos_info` | ? | Detalhes dos criativos de Ads |
| `posts` | ? | Posts orgânicos do Instagram |
| `post_metrics` | ? | Métricas dos posts |
| `instagram_accounts` | ? | Contas IG monitoradas |
| `boleto_transactions` | ? | Transações via boleto (pagamento alternativo) |
| `competitors` | ? | Concorrentes monitorados |
| `competitor_snapshots` | ? | Snapshots periódicos dos concorrentes |
| `funnel_monitors` / `funnel_checks` | ? | Monitoramento de funis |
| `account_metrics` | ? | Métricas agregadas por conta? |
| `tv_dashboard_funnels` / `tv_launch_configs` | ? | Configuração do dashboard TV |
| `chat_threads` / `chat_messages` | ? | Chat interno do dashboard |
| `alertas` | ? | Alertas configurados |
| `sync_log` | ? | Log de sincronização |
| `content_analysis_queue` | ? | Fila de análise de conteúdo |

**Pendências do André:** quais dessas tabelas o relatório financeiro deve cruzar? Hoje rascunhei só `hotmart_transactions` + `hotmart_products` + `metricas_diarias` + `contas`.

---

## 3. Definições críticas (André valida cada uma)

### 3.1 — O que é "venda real"?

**Hipótese atual:** `status IN ('completed', 'approved')`.

**Distribuição de status hoje (count):**
| Status | Linhas | Soma BRL | Significado inferido |
|---|---:|---:|---|
| `completed` | 20.564 | R$ 2.165.133 | Venda paga e finalizada |
| `delayed` | 4.115 | R$ 1.339.975 | Boleto/PIX em atraso (ainda pode pagar?) |
| `canceled` | 2.200 | R$ 495.201 | Cancelamento antes de pagar |
| `expired` | 1.907 | R$ 159.394 | Expirou sem pagar |
| `refunded` | 1.236 | R$ 135.459 | **Reembolsada** |
| `waiting_payment` | 269 | R$ 108.410 | Aguardando pagamento (boleto gerado, ainda no prazo) |
| `approved` | 259 | R$ 57.899 | Recém-aprovada (vai virar `completed` em horas?) |
| `billet_printed` | 194 | R$ 83.368 | Boleto impresso, aguardando pagamento |
| `chargeback` | 20 | R$ 7.476 | Estorno via cartão de crédito |
| `dispute` | 8 | R$ 798 | Disputa em curso |
| `started` | 1 | — | Sessão iniciada |

**❓ André precisa confirmar:**
1. **`approved` conta como venda?** Hipótese: SIM (já foi cobrada, vai virar `completed`). Confirma?
2. **`delayed` conta?** Hoje NÃO conto. Mas é R$ 1,3M — talvez seja boleto/PIX que ainda vai pagar. Quer que conte?
3. **`chargeback`+`dispute`** — devo subtrair do faturamento como se fossem reembolso? Hoje só conto `refunded` como reembolso.

### 3.2 — O que é "reembolso"?

**Hipótese atual:** `refund_date IS NOT NULL` OU `status = 'refunded'`.

**Por que 2 critérios:** algumas linhas têm `refund_date` preenchido mas `status != 'refunded'` (provavelmente reembolso parcial?). Outras têm `status='refunded'` sem `refund_date` (provavelmente migração de dados).

**❓ André confirma:** OK usar OR? Ou prefere apenas 1 dos critérios?

### 3.3 — Como tratar moeda

`price_value` vem em **BRL/USD/EUR** (3 moedas detectadas). `price_currency` indica qual.

**Hipótese atual:** quando o relatório fala "faturamento", separa por moeda — não converte automático (taxa de câmbio muda).

```
Faturamento ontem: R$ 3.558 (BRL) + €28 (EUR) = ~R$ 3.730 estimado
```

**❓ André confirma:** quer que converta tudo pra BRL no display? Se sim, qual fonte de câmbio (cofre tem cotacao_atual via memória `project_cotacao_usd_brl_viva.md`)?

**Alternativa:** usar `my_commission_usd` (já normalizado) como métrica única de receita. Mas é só comissão (não faturamento bruto), o que muda a leitura.

### 3.4 — Gasto Ads

**Hipótese atual:** `sum(spend) WHERE nivel = 'campaign' AND data = X`.

Por que `nivel='campaign'` e não `nivel='ad'`:
- `ad`: 1 linha por anúncio individual (mais granular, soma é a mesma)
- `adset`: 1 linha por conjunto de anúncios
- `campaign`: 1 linha por campanha (agrega adsets)
- **NÃO existe `nivel='account'`** no schema atual — agregação por conta = `JOIN contas + group by`

Somando `nivel='campaign'` evita double-count. Somar `ad` ou `adset` daria mesmo resultado mas com mais linhas.

**❓ André confirma:** OK usar `campaign`?

### 3.5 — ROAS

**Hipótese atual:** 2 cálculos disponíveis:
- **`purchase_roas` que vem do Meta** (campo da tabela) — média ponderada por linha. Bom pra benchmark Meta.
- **ROAS calculado:** `faturamento_brl / ads_gasto_brl` no MESMO dia.

**Discrepância vista no smoke test:** 08/05 — Meta diz ROAS 0.81 (ruim), cálculo manual diz 20.0 (excelente). Provavelmente porque vendas vêm de tráfego ORGÂNICO + de outras campanhas que não são desses Ads.

**❓ André confirma:** quer usar qual? Recomendo:
- Mostrar **AMBOS** com legenda explicando ("ROAS Meta = só atribui a essas campanhas; ROAS total = vendas/gasto, inclui orgânico")
- OU mostrar só o calculado se for + intuitivo

### 3.6 — Comparação D-1, D-7, D-30

**Hipótese atual:** sem comparação implementada. **Quero adicionar:**

```
Vendas ontem: 34 (↑6% vs anteontem · ↑12% vs média 7d · ↓5% vs média 30d)
Faturamento BRL ontem: R$ 3.558 (↑15% vs anteontem)
Reembolsos ontem: 0 (média 7d: 3/dia)
Gasto Ads ontem: R$ 177 (média 7d: R$ 200/dia)
```

**❓ André confirma:** comparações que importam? Sugiro D-1 (ontem vs anteontem), Média 7d, Média 30d.

### 3.7 — "Top produtos" do dia

**Hipótese atual:** TOP 5 por faturamento BRL, ordenado decrescente.

```
Top vendas ontem (BRL):
1. ELO — 3 vendas · R$ 1.418
2. ELO Recorrente — 6 vendas · R$ 633
3. Desafio Lo-Fi — 13 vendas · R$ 615
4. ProAlt Low Ticket Recorrente — 2 vendas · R$ 317
5. Sirius Lab — 2 vendas · R$ 227
```

**❓ André confirma:** ordenar por **faturamento** (R$) ou **quantidade** (qtd vendas)? Pra um dia com 13 vendas Lo-Fi a R$ 47 cada vs 3 vendas ELO a R$ 472 — qual te interessa primeiro?

---

## 4. Métricas que VOU calcular pro relatório executivo diário

| # | Métrica | Fórmula | Fonte |
|---|---|---|---|
| 1 | Vendas ontem (qtd) | `count(*) WHERE status IN ('completed','approved') AND purchase_date::date = ontem` | hotmart_transactions |
| 2 | Faturamento BRL ontem | `sum(price_value) FILTER (price_currency='BRL')` | hotmart_transactions |
| 3 | Faturamento USD/EUR ontem | idem por moeda | hotmart_transactions |
| 4 | Ticket médio BRL | `avg(price_value) FILTER (BRL)` | hotmart_transactions |
| 5 | Reembolsos ontem (qtd) | `count(*) WHERE refund_date::date = ontem` | hotmart_transactions |
| 6 | Reembolsos ontem (R$) | `sum(price_value) WHERE refund_date::date = ontem AND BRL` | hotmart_transactions |
| 7 | Gasto Ads ontem | `sum(spend) WHERE data=ontem AND nivel='campaign'` | metricas_diarias |
| 8 | Cliques Ads | `sum(clicks)` idem | metricas_diarias |
| 9 | ROAS Meta médio | `avg(purchase_roas) WHERE > 0` | metricas_diarias |
| 10 | ROAS calculado | `fat_brl / ads_gasto_brl` | derivado |
| 11 | TOP 5 produtos | `group by product_id order by sum(price_value) desc limit 5` | hotmart_transactions + hotmart_products |
| 12 | Comparação D-1 | métrica ontem / métrica anteontem - 1 | derivado |
| 13 | Comparação 7d média | métrica ontem / avg(7d) - 1 | derivado |

**❓ André adiciona/remove o que faltar?**

---

## 5. Verifier de relatório (queries cruzadas)

Antes de salvar/enviar relatório financeiro, sistema valida:

1. **Soma bate?** — TOP 5 produtos somados = faturamento total declarado no topo?
2. **Reembolsos < vendas?** — reembolso > venda no mesmo dia indica bug ou data limite errada
3. **ROAS sano?** — ROAS > 100 ou < 0.01 = provavelmente erro de divisão
4. **Quantidade bate** — `qtd_vendas = sum(top_5_qtd) + outras` (não pode dar "34 vendas" e top 5 somar 30 se não tem outras)

Se algum check falhar, **NÃO ENVIA**, alerta no WhatsApp do André: "relatório de hoje NÃO foi enviado — divergência X. Investigar."

**❓ André adiciona checks adicionais?**

---

## 6. Pendências bloqueantes

- [ ] André valida cada definição dos itens 3.1 a 3.7
- [ ] André adiciona/remove métricas do item 4
- [ ] André adiciona checks adicionais ao Verifier (item 5)
- [ ] André confirma se quer que o relatório use `my_commission_usd` (receita líquida do produtor) OU `price_value` (faturamento bruto Hotmart)
- [ ] (Opcional) André passa URL do GitHub do projeto do dashboard pra eu cruzar racional com código real

---

## 7. Próximos passos

1. André responde este rascunho com correções
2. Eu atualizo este arquivo + crio Skill `gerar-relatorio-financeiro` em `cerebro/squads/data/skills/financeiro-24h/SKILL.md`
3. Smoke test com dado real (mesma planilha do dashboard atual de André pra comparar)
4. Se números batem → módulo `financeiro-24h` muda status `em_construcao` → `ativo` em `pinguim.relatorios_modulos`
5. Squad data passa a ter os 4 módulos prontos (triagem-email + diagnostico-email + financeiro + falta agenda + discord)
6. Próxima frente: Skill `gerar-relatorio-financeiro` + Verifier financeiro + Edge Function `gerar-relatorio` + cron + WhatsApp Evolution
