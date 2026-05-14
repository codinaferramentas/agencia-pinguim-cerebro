# Plano V2 — Relatório de Triagem de Emails (refatoração total)

**Data:** 2026-05-13 noite
**Versão atual no banco:** V1 (id `999d009d-94ab-4848-80aa-e11ab609555a`)
**Decisão do Codina:** V1 ficou ruim, importou estrutura do Meta Ads onde não cabia. Refatorar do zero pra parecer **nota de chief of staff / secretária executiva**, não dashboard de marketing.

---

## 1) Diagnóstico do V1 (o que está errado e VAI SAIR)

| Bloco V1 | Problema | Decisão |
|---|---|---|
| **Matriz Categoria × Mestre** (4×6) | Veio do Meta Ads, não agrega nada em email. Categoria de inbox não precisa de visão multi-perspectiva. | **REMOVER 100%** |
| **Análise dos Mestres (drill-down 6 cards)** | Não faz sentido ter "Kaushik analisando seu reembolso". Email é decisão pessoal, não funil de marketing. | **REMOVER 100%** |
| **6 mestres assinando cada ação do Plano** | Teatro. Improvável os 6 terem o mesmo insight. Gera ruído. | **REMOVER atribuição por mestre** |
| **3 gráficos ApexCharts (volume 30d / donut categorias / barras remetentes)** | Vanity metrics. Não pauta nenhuma decisão hoje. | **REMOVER** todos os 3 |
| **Hero cards 24h/7d/30d com "SINAL %"** | Métrica vaidosa. Não muda decisão. | **REMOVER** o card "% sinal". Manter só contagem simples (e em 1 linha, não card grande). |
| **Bug "7 dias = 30 dias = 201 emails"** | `total_estimado` da Gmail API bate no teto. | Resolver: ou some os contadores corretos, ou some o bloco se não conseguir contagem real. |
| **"🔴 CRÍTICOS — RESPONDA HOJE"** | Label errado. Recibo da Meta não é "responda", é "investigar". | **Trocar nome dos baldes** (ver §3). |
| **"🟡 OPORTUNIDADES: Nenhuma identificada"** | Bloco vazio ocupando espaço. | Omitir bloco quando 0. |
| **Top Remetentes (5 com 1 email cada)** | Não é "top", é só lista. | **REMOVER** (ou só aparecer se algum remetente ≥3 emails). |
| **Categoria "informativo" virou item do plano** ("arquivar batch AppSumo+Gamma") | Ação de baixo-impacto misturada com risco real. | Itens do plano ≤3, todos de alto impacto. Arquivar entra no balde "Já cuidei / Pode arquivar". |

---

## 2) Diretrizes consolidadas do conselho (Mann, Allen, Ferriss, Newport, HBR, EAs)

**Princípio central:** o relatório é uma **nota de chief of staff**, não um dashboard. Tom de secretária executiva. Forward-looking ("o que fazer hoje"), não retrospectivo ("estatística do mês").

**Regras duras:**

- **Máximo 3 prioridades hoje.** Forçar 3 obriga priorização real. Se vier 6 emails críticos, escolher os 3 que SÓ o sócio resolve.
- **Narrativa curta** (300-500 palavras totais), primeira pessoa, conversacional.
- **Frases curtas, verbo imperativo no início:** "Responder Acme até 16h", "Aprovar reembolso João", "Pagar boleto Vivo amanhã".
- **Mostrar o "já cuidei"** — não esconder, cria confiança. Hoje o agente não responde sozinho, mas pode mostrar "5 newsletters arquivadas automaticamente, 3 confirmações sem ação".
- **Palavras-âncora bem-vindas:** "hoje", "amanhã", "até [dia]", "vence", "esperando você", "já cuidei", "pode arquivar sem ler", "sugiro responder assim:".
- **Palavras proibidas:** "análise", "matriz", "score", "engajamento", "mestre", "categoria", "performance", "insights", "drill-down", "% sinal", "ROAS".

**Fundamentação acadêmica (rodapé do HTML pode citar):**
- Merlin Mann — Inbox Zero (43folders.com, Google Tech Talk 2007)
- David Allen — GTD: Do/Delegate/Defer/Delete
- Tim Ferriss — 4HWW: batching + low-information diet
- Cal Newport — A World Without Email: "attention capital"
- HBR Nov/2020 — How to Brief a Senior Executive

---

## 3) Os 6 baldes canônicos da nova triagem

Síntese 4D (Allen) + 3 pastas EA (Superhuman) + tipos brasileiros:

| # | Balde | Sinônimo do Allen | O que entra | Ícone |
|---|---|---|---|---|
| 1 | **Responder hoje** (você é o único) | Do | Pergunta direta de cliente/parceiro, reclamação séria, proposta com prazo, jurídico/fiscal | 🔴 |
| 2 | **Decidir/Aprovar** (waiting on you) | Do | Funcionário pede OK, parceiro pede assinatura, contrato pra revisar | ✋ |
| 3 | **Pagar/Financeiro** | Do | Boleto, fatura, NF, reembolso a aprovar, cobrança | 💸 |
| 4 | **Delegar** (X resolve) | Delegate | Tarefa operacional, suporte ao cliente, agendar reunião | 🤝 |
| 5 | **Acompanhar** (esperando 3º) | Defer | Você está esperando alguém responder. Lembrete pra cobrar se passou X dias. | ⏳ |
| 6 | **Ler depois / Arquivar** | Defer/Delete | Newsletter relevante, CC informativo, confirmação automática | 📦 |

Spam puro (phishing, promoção) **NÃO entra no relatório** — pula direto.

### Heurística de classificação (palavras-gatilho por balde)

**Balde 1 — Responder hoje:**
- Subject contém: "urgente", "preciso de retorno", "podemos conversar?", "proposta", "lead", "interesse", "demo", "reunião"
- Sender = pessoa física (não automatizado), domínio empresa-alvo
- Reclamação: "absurdo", "decepcionado", "vou processar", "cancelar contrato"
- Jurídico/fiscal: `.gov.br`, `.jus.br`, `procon`, "intimação", "notificação", "auto de infração"

**Balde 2 — Decidir/Aprovar:**
- Subject/corpo contém: "aprovar?", "ok pra seguir?", "pode autorizar?", "preciso da sua assinatura", "validação"
- Sender = funcionário cadastrado / sócio
- Anexo: contrato, proposta, documento pra revisar

**Balde 3 — Pagar/Financeiro:**
- Subject: "boleto", "fatura", "2ª via", "pagamento pendente", "vencimento", "NF", "nota fiscal", "reembolso"
- Anexo PDF com nome de fatura/recibo
- Sender termina em domínio de banco, gateway, contabilidade

**Balde 4 — Delegar:**
- Cliente pedindo cadastro / acesso (vai pro suporte)
- Agendamento de reunião (vai pra assistente/Calendar)
- Dúvida operacional sobre produto (vai pro suporte/CS)
- Email que pode ser respondido com template

**Balde 5 — Acompanhar:**
- Você foi o último a responder na thread + esperando confirmação
- Pedido enviado ao contador/jurídico/parceiro sem retorno há >3 dias
- Threads onde você marcou "aguardando"

**Balde 6 — Ler depois / Arquivar:**
- Newsletter (substack, medium, blog)
- Confirmação automática (compra confirmada, login detectado)
- CC informativo (você foi copiado mas não é dono)
- Notificação de plataforma (Slack, GitHub, Drive)

### Diferença vs V1

| V1 (errado) | V2 (correto) |
|---|---|
| 🔴 Crítico / 🟡 Oportunidade / 🟢 Informativo / ⚫ Ruído | 🔴 Responder / ✋ Decidir / 💸 Pagar / 🤝 Delegar / ⏳ Acompanhar / 📦 Arquivar |
| Categorias de **natureza do conteúdo** | Categorias de **ação executiva** |
| 4 baldes genéricos vindos do Meta Ads | 6 baldes vindos da literatura de gestão executiva |

---

## 4) Anatomia do novo relatório (HTML + markdown)

### Estrutura visual (HTML)

```
┌─────────────────────────────────────────┐
│ [Header com nome do sócio + data BRT]   │
│ "Bom dia, André. 47 emails desde ontem."│
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🎯 SUAS 3 PRIORIDADES HOJE              │
│                                          │
│ 1. **Responder Acme até 16h**           │
│    Pediram contrato fechado hoje.       │
│    [abrir email]                         │
│                                          │
│ 2. **Aprovar reembolso João — R$ 497**  │
│    Cliente do ProAlt, 30 dias.          │
│    [abrir email]                         │
│                                          │
│ 3. **Pagar boleto Vivo R$ 1.842**       │
│    Vence amanhã.                         │
│    [abrir email]                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ✋ Esperando sua decisão (4)            │
│ - Pedro: OK fornecedor X                 │
│ - ...                                    │
│ 💸 Financeiro (3)                       │
│ - ...                                    │
│ 🤝 Pode delegar (5)                     │
│ - ...                                    │
│ ⏳ Aguardando resposta de terceiros (3) │
│ - ...                                    │
│ 📦 Pode arquivar sem ler (12)           │
│ - newsletters, confirmações, CCs        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📋 Diagnóstico técnico (colapsado)       │
│ - Janela, fonte, performance            │
└─────────────────────────────────────────┘
```

### Estrutura do markdown (o que o sintetizador produz)

```markdown
📧 Bom dia, André · Triagem · quarta 13/05

Chegaram 47 emails desde ontem. 3 precisam de você hoje.

## 🎯 Hoje (3)

1. **Responder Acme até 16h** — pediram contrato fechado. [abrir]
2. **Aprovar reembolso do João (R$ 497)** — cliente ProAlt 30 dias. [abrir]
3. **Pagar boleto Vivo (R$ 1.842)** — vence amanhã. [abrir]

## ✋ Esperando você decidir (4)

- **Pedro Aredes** — OK pra fechar fornecedor X
- **Micha** — aprovar arte do criativo Reels
- ...

## 💸 Financeiro (3)

- Boleto Vivo R$ 1.842 (vence 14/05)
- NF Contador maio (anexo)
- Reembolso parcial Hotmart

## 🤝 Pode delegar (5)

- Cadastro Princípia Pay — Rafa
- Dúvida produto — suporte
- ...

## ⏳ Aguardando resposta (3)

- Contador (DRE) — 4 dias
- Cliente Y (contrato) — 2 dias
- ...

## 📦 Pode arquivar sem ler (12)

12 newsletters/confirmações/CCs. Já reconhecido como ruído estrutural.

---
*Fonte: Gmail API · janela 12/05 BRT · classificação heurística + LLM-classifier (sem squad data).*
```

---

## 5) Arquitetura técnica — o que muda no código

### Arquivos a editar

1. **`server-cli/lib/relatorio-triagem-emails.js`**
   - **REMOVER:** função `analisarDataMasters()` (squad data inteira)
   - **REMOVER:** chamada ao Data Chief consolidador
   - **REESCREVER:** `classificarEmail()` — sair das 4 categorias antigas, entrar nos 6 baldes novos
   - **ADICIONAR:** classificador LLM secundário (Claude CLI 1 chamada só) que recebe TODOS os emails do dia em lote e devolve `{id, balde, justificativa_curta}` em JSON. Substitui o squad. Reduz de 7 chamadas Claude pra **1 chamada**.
   - **REESCREVER:** sintetizador — receber a lista classificada + retornar markdown no formato acima (priorizar 3 do balde 1, agrupar resto)

2. **`server-cli/lib/template-relatorio-triagem-emails.js`**
   - **REMOVER:** todo o bloco da matriz Categoria × Mestre (`matrizHtml`)
   - **REMOVER:** todo o bloco de pareceres drill-down (`pareceresHtml`)
   - **REMOVER:** os 3 gráficos ApexCharts (volume 30d, donut, barras remetentes)
   - **REMOVER:** card "% SINAL" (hero 24h grande)
   - **REMOVER:** dependência de ApexCharts no `<head>`
   - **REESCREVER:** hero principal — header simples com "Bom dia, André · 47 emails · 3 prioridades hoje"
   - **REESCREVER:** seções por balde (6), com lista de emails clicável; balde 1 destacado com card amarelo/laranja
   - **MANTER:** `details.diagnostico` colapsado (técnico, raramente aberto)
   - **MANTER:** estilo dark, IBM Plex, link clicável pro Gmail

3. **`server-cli/index.js`**
   - Nada muda (endpoint já existe, vai chamar o módulo refatorado)

4. **`server-cli/lib/cron-relatorios.js`**
   - Nada muda (dispatch por slug `triagem-emails*` já existe)

### Sem novo schema de banco

- Continua salvando em `pinguim.entregaveis` com `tipo='relatorio-triagem-emails-diario'`
- `conteudo_estruturado` muda formato (novo schema interno) mas o template novo lê esse schema novo. Versionamento via `parent_id` mantém histórico do V1.

---

## 6) Plano de execução (ordem)

**Fase 1 — Backend (relatorio-triagem-emails.js):**
1. Remover `analisarDataMasters()` e import do Chief
2. Substituir `classificarEmail()` heurístico pelos 6 baldes (regex novo)
3. Adicionar `classificarComLLM(emails)` — 1 chamada Claude CLI, JSON `[{id, balde, motivo_curto}]`
4. Adicionar `priorizarTop3(emails_balde1)` — Claude pega top 3 do balde "Responder hoje" e devolve `acao_curta + acao_completa`
5. Reescrever `sintetizarTriagemDiaria()` — markdown no novo formato
6. `gerarRelatorioTriagemEmails()` orquestra: coleta → classificarLLM → priorizarTop3 → sintetizar → salvar

**Fase 2 — Frontend (template-relatorio-triagem-emails.js):**
1. Remover bloco matriz, pareceres, 3 gráficos, hero "% sinal"
2. Remover script ApexCharts do head
3. Adicionar componente "Hero das 3 prioridades" (cards numerados 1/2/3)
4. Adicionar componente "Baldes secundários" (6 seções colapsáveis ou abertas)
5. Cada email vira `<a href="link_gmail">` clicável com assunto + remetente + hora

**Fase 3 — Teste end-to-end:**
1. `curl -X POST /api/relatorio/triagem-emails -d '{}'`
2. Abrir entregável gerado em `http://localhost:3737/entregavel/<id>`
3. Codina valida visual + textualmente
4. Se OK, commitar `feat(triagem V2): refatorada como chief of staff (sem squad, 6 baldes acionáveis)`
5. Se NÃO OK, iterar dentro do mesmo plano (não criar V3 do plano — atualizar este arquivo)

---

## 7) Critério de "ficou bom"

Codina lê o relatório em <30 segundos e:
- Sabe o que **fazer hoje** (3 itens claros)
- Sabe o que pode **delegar/adiar** (resto agrupado)
- **Não** vê gráfico de vanity metric
- **Não** vê "análise dos mestres" nem matriz
- Sente que parece uma **secretária executiva** falando, não BI/dashboard
- Não precisa abrir Gmail pra entender o que tem na inbox
