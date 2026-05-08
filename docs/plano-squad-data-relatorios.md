# V2.14 — Squad Data + Relatórios proativos diários

**Data do plano:** 2026-05-08 noite finalíssima
**Status:** Plano APROVADO. Fase 0 FEITA (Evolution no cofre). Aguardando 2º Supabase pra Fase 1A.

## Visão

Todo dia 8h BRT, cada sócio recebe **2 relatórios** no WhatsApp (Pinguim Bot via Evolution API):

1. **Relatório financeiro** — vendas, faturamento, ROAS, gasto Ads, reembolsos. Dados vêm do **2º Supabase** (banco do dashboard de vendas, separado do Pinguim OS).
2. **Relatório social** — síntese dos emails das últimas 24h: "vi 5 emails — 2 são pagamento Hotmart pendente, 1 cliente reclamando reembolso, 2 spam". Dados vêm do **Gmail do sócio** (já temos via tools V2.13).

Entrega: HTML formatado igual entregável criativo (V2.10 template), salvo em `pinguim.entregaveis` com URL estável `/entregavel/<UUID>`. WhatsApp leva preview + link clicável.

## Cenário emblemático

> Sócio acorda 8h, abre WhatsApp Pinguim Bot. Vê 2 mensagens.
>
> **Relatório financeiro:** "ontem 32 vendas Elo, R$ 47k, mas 3 reembolsos do Lyra"
> **Relatório social:** "5 emails — 2 pagamento Hotmart pendente, 1 cliente do Lyra pedindo reembolso (relacionado!), 2 spam"
>
> Sócio entra no chat web do Pinguim OS:
> *"responde aquele email do cliente do Lyra que pediu reembolso, e oferece migração pro Elo"*
>
> Agente cruza relatório financeiro (Lyra com reembolso) + relatório social (email específico já identificado), gera resposta com tom certo, mostra preview, sócio aprova com "sim", agente envia via Gmail (V2.13 E6 com confirmação inteligente).

## Decisões arquiteturais

### 1. Squad CANÔNICA `data` (Princípio 11 — não inventar)

**NÃO criar squad nova "Reports".** A squad `data` (Data & Analytics) já está no `ecossistema-mapeamento.json` com 7 mestres exatamente pra interpretar dados de venda/marketing:

| Mestre | Função |
|---|---|
| **Data Chief** | Orquestrador (sintetiza, igual Board Chair no advisory-board) |
| Avinash Kaushik | Web Analytics |
| Peter Fader | CLV / Customer Centricity |
| Sean Ellis | Growth / Conversão |
| Nick Mehta | Customer Success |
| David Spinks | Community Metrics |
| Wes Kao | Cohort / Retention |

Esqueleto já no repo: `cerebro/squads/data/agentes/`. Falta popular MDs + cadastrar em `pinguim.agentes`.

### 2. WhatsApp Evolution único canal (sem Telegram, sem híbrido)

**Decisão do André:** *"se for híbrido, o cara em mastermind vai falar 'mas isso é Telegram?' fica confuso. Vamos atacar um canal só. Quando vendermos pro mercado, todo mundo quer WhatsApp."*

**Modelo de instâncias Evolution:**

| Instância | Pra quê | Quando |
|---|---|---|
| **Pinguim Bot** (1 instância) | Disparador (manda relatório DELE pra cada sócio) | Fase 3 (agora) |
| **Sócio X** (1 por sócio) | Leitor (agente lê WhatsApp do dono, filtra spam, manda resumo) | Fase 5 (futuro) |

**Risco:** WhatsApp pode banir número que dispara em massa. Pra uso interno (4 sócios, 1-2 mensagens/dia) baixo. Pra venda futura (50+/dia/cliente) médio-alto. Dívida técnica registrada.

**Número usado pra disparo agora:** "número parado" do André. Quando sócio CEO confirmar, troca pro chip oficial.

### 3. Verifier de Relatório OBRIGATÓRIO

**André matou o ponto:** *"se o relatório vier errado e eu mando pro CEO 8h, eu queimo. Tem que ter dupla checagem."*

Antes de salvar/enviar:
1. Roda **queries de checagem cruzada** no banco do dashboard (total no relatório vs `SELECT SUM`)
2. Se TODAS passarem → salva + envia
3. Se ALGUMA divergir → NÃO ENVIA, salva como `status='reprovado'`, alerta no WhatsApp do André

Custo: +30s por relatório. Vale 100x.

### 4. 2 relatórios SEPARADOS (não fundir)

| Relatório | Fonte | Tipo no banco |
|---|---|---|
| Financeiro | 2º Supabase | `relatorio-financeiro` |
| Social | Gmail | `relatorio-social` |

Conviem na mesma conversa via `gmail_contexto` (estende `drive_contexto` V2.12 Fix 2 — Princípio 11).

## Fases

| Fase | Entrega | Tempo | Pré-req |
|---|---|---|---|
| **0** | Cofre Evolution + 2º Supabase | 5min | — |
| **1A** | Squad `data` populada + Skill `gerar-relatorio-financeiro` | 3h | 2º Supabase |
| **1B** | Skill `gerar-relatorio-social` (lê Gmail) | 1.5h | nenhum (paralelo) |
| **1.5** | Verifier de relatório (queries cruzadas) | 1h | Fase 1A |
| **2** | Cron 8h + persistência + URL `/entregavel/<UUID>` | 1.5h | Fase 1 completa |
| **3** | `lib/evolution.js` + tabela `whatsapp_destinatarios` + envio | 3h | Evolution + Fase 2 |
| **4** | Atendente proativo cruza relatórios na conversa | 2h | Fase 1B + V2.12 Fix 2 estendido |

**Total Fases 0-4: ~12h em 3-4 sessões.**

### Fase 5 (futuro grande, ~6-8h)

Leitura inbox WhatsApp do sócio. Instância Evolution dedicada por sócio + filtro/triagem + agente posta resumo via Pinguim Bot. Aguarda chip dedicado.

## Status atual (2026-05-08 noite)

- ✅ Plano aprovado pelo André
- ✅ Fase 0 — Evolution URL+key gravados em `pinguim.cofre_chaves` (chaves `EVOLUTION_API_URL` + `EVOLUTION_API_KEY`)
- ⏳ Aguardando André passar `DASHBOARD_PROJECT_REF` + `DASHBOARD_ACCESS_TOKEN` (2º Supabase) pra começar Fase 1A
- ✅ Fase 1B (relatório social) pode começar SEM bloqueio (Gmail já conectado)

## Princípios reforçados

- **P11 (não inventar 2ª solução):** squad `data` JÁ existe canônica, esqueleto no repo
- **P12 (funciona no V3):** tudo persistido em `pinguim.*`, cron pg_cron já instalado, Evolution via cofre
- **`feedback_clones_so_do_html_canonico`:** 7 mestres são exatamente os do `ecossistema-mapeamento.json`
- **`project_cofre_fonte_canonica`:** Evolution URL+key vivem no cofre, não no `.env.local`
- **`project_finops_pilar`:** padrão Edge Function + pg_cron + RPC já validado
- **`project_versionamento_entregavel`:** relatórios são `pinguim.entregaveis` com tipo dedicado
