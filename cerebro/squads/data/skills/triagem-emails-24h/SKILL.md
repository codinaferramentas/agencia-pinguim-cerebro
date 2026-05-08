---
name: triagem-emails-24h
description: Categoriza e prioriza emails recebidos nas últimas 24h em 4 níveis (crítico/oportunidade/informativo/ruído) com sugestão de ação por email crítico/oportunidade. Usar quando sócio pede "triagem dos meus emails", "o que tem de importante hoje", "vi algo no email" OU quando cron diário 8h dispara automaticamente. Squad data — Sub-fase 1B.1 do plano V2.14.
---

# Skill: triagem-emails-24h

## Quando usar

Use esta skill quando:

- Sócio pede no chat: "triagem dos meus emails", "o que tem de importante hoje no email", "olha minha caixa"
- Cron diário 8h dispara automaticamente (squad data → Edge Function `gerar-relatorios-diarios`)
- Sócio pergunta "tem algo urgente?" e contexto sugere email

NÃO use quando:

- Sócio pede pra LER um email específico → usa `bash scripts/gmail-ler.sh <messageId>` (V2.13 E5)
- Sócio pede pra RESPONDER um email → usa `bash scripts/gmail-responder.sh ...` (V2.13 E6 com confirmação inteligente)
- Sócio pede DIAGNÓSTICO da inbox (análise de padrões, score de saúde) → usa `diagnostico-inbox-3dias` em vez

## Como executar

### Passo 1 — Coletar emails das últimas 24h

```bash
bash scripts/gmail-listar.sh "newer_than:1d" 50
```

Retorna lista markdown com headers (de, assunto, data BRT, snippet). Limite 50 — suficiente pra dia normal.

Se sócio recebe muito (>50), usar `gmail-listar.sh "newer_than:1d in:inbox" 100`.

### Passo 2 — Classificar cada email em 4 categorias

Pra cada email da lista, ler **headers + snippet** (não corpo inteiro — economiza tempo) e atribuir:

| Categoria | Sinais |
|---|---|
| 🔴 **Crítico/Urgente** | Cliente Pinguim reclamando (cita produto Elo/Lyra/ProAlt + tom negativo "reembolso", "cancelar", "não funcionou"). Pagamento pendente Hotmart/Stripe ("pagamento aguardando", "boleto vencendo", "fatura"). Prazo vencendo ("até hoje", "amanhã", "urgente"). Email de sócio interno (Luiz/Micha/Pedro). |
| 🟡 **Oportunidade** | Lead novo demonstrando interesse ("quero saber mais", "como funciona", "quanto custa"). Parceria proposta. Cobrança pra fechar venda em pipeline ativo. Convite pra evento/podcast/entrevista relevante. |
| 🟢 **Informativo** | Newsletter útil (Greg Isenberg, Sahil Bloom, etc — autores de método). Atualização de plataforma usada (Vercel, Supabase, Hotmart). Notificação de tool em uso (cron rodou OK, deploy passou). |
| ⚫ **Ruído** | Spam óbvio. Promo de serviço não usado. Notificação automática repetitiva (Google "alguém logou no seu Drive" pela 50ª vez). LinkedIn jobs/InMail. |

**Cérebro Pinguim entra:** Se email menciona produto Pinguim conhecido (Elo, Lyra, ProAlt, Taurus, Orion), anotar `produto: <slug>` no item — vira contexto pra Atendente cruzar com relatório financeiro depois (Fase 4 do plano).

### Passo 3 — Sugerir ação por email Crítico ou Oportunidade

Pra cada 🔴 ou 🟡, gerar bloco:

```
- **<Assunto>** ([abrir](link-gmail))
  De: <Remetente> · <data BRT>
  Categoria: 🔴 Crítico (cliente Lyra reclamando reembolso)
  Sugestão: responder com tom de cuidado + oferecer reembolso processado em 48h + opção de migração pro Elo (caso de cliente que pode estar mal-assentado)
  Preview de resposta:
  > "Olá X, lamentamos a frustração. Iniciamos o processo de reembolso — vai cair em 48h úteis. Antes de fechar, posso te apresentar uma alternativa que pode encaixar melhor com seu momento atual?..."
  [Confirmar envio? Sócio responde "sim, envia" no chat → V2.13 E6 dispara]
```

Pra 🟢 e ⚫, bloco mais curto (1 linha cada):

```
🟢 Newsletter Sahil Bloom · ler quando tiver tempo
⚫ Promo Udemy · pode arquivar
```

### Passo 4 — Verifier de classificação (Munger reforço)

Antes de salvar, pra cada email marcado ⚫ **ruído**, re-checar contra palavras-gatilho:

```
GATILHOS_FALSO_NEGATIVO = ['urgente', 'fatura', 'vencimento', 'reembolso', 'reclamação', 'cancela', 'pagamento']
```

Se algum gatilho aparece em assunto/snippet de email marcado ⚫, **re-classifica pra 🟡 oportunidade ou 🔴 crítico** e marca com flag "[reclassificado por gatilho]" pro sócio saber que a primeira leitura errou.

Falsos negativos saem caros — vale o overhead.

### Passo 5 — Compor HTML usando template canônico

Estrutura do entregável (template Pinguim, igual `lib/template-html.js` V2.10):

```
# Triagem de Emails — <data BRT>

**Resumo:** <N> emails nas últimas 24h. <X> críticos, <Y> oportunidades, <Z> informativos, <W> ruído.

## 🔴 Críticos (<X>)
[blocos detalhados, cada um com sugestão + preview de resposta]

## 🟡 Oportunidades (<Y>)
[blocos detalhados]

## 🟢 Informativos (<Z>)
[lista 1 linha por email]

## ⚫ Ruído (<W>)
[lista 1 linha por email + sugestão "arquivar todos" se W > 5]

---

**Footer:**
- Dados puxados de: Gmail do sócio (last refresh: <timestamp>)
- Discrepância? Avisa o Codina.
```

### Passo 6 — Salvar em pinguim.entregaveis

```js
db.salvarEntregavel({
  tipo: 'triagem-emails-24h',
  titulo: `Triagem de emails — ${dataBRT}`,
  conteudo_md: htmlGerado,
  conteudo_estruturado: {
    qtd_total: N,
    qtd_critico: X,
    qtd_oportunidade: Y,
    qtd_informativo: Z,
    qtd_ruido: W,
    reclassificados_por_gatilho: <lista>,
    produtos_mencionados: ['elo', 'lyra', ...],
  }
})
```

URL `/entregavel/<UUID>` é estável — sócio acessa via WhatsApp na Fase 3.

## Padrão de qualidade

- **NUNCA inventar** classificação. Se snippet ambíguo, marcar 🟡 conservador (re-checagem pelo sócio é 30s, vs perder cliente é caro)
- **NUNCA executar ação** (responder, arquivar, deletar) sem confirmação explícita do sócio no chat
- **NUNCA ignorar gatilhos** (urgente, fatura, vencimento, etc)
- **SEMPRE incluir preview de resposta** pra críticos/oportunidades — sócio aprova com 1 clique

## Mestres da squad data que contribuem

Quando esta skill roda via pipeline criativo (não modo "rascunho rápido"), os 6 mestres + Data Chief contribuem em paralelo:

- **Avinash Kaushik** — score de saúde (% crítico vs ruído, taxa esperada de resposta)
- **Peter Fader** — peso por valor do cliente (cliente alto LTV merece prioridade independente do tom)
- **Sean Ellis** — flag de oportunidade de conversão escondida (lead engajado sem follow-up)
- **Nick Mehta** — flag de risco churn (cliente reclamando + sem resposta há N dias)
- **David Spinks** — qualidade da resposta sugerida (tom relacional vs transacional)
- **Wes Kao** — padrão temporal (qual horário sócio responde melhor — sugere agendar resposta)
- **Data Chief** — sintetiza os 6 numa narrativa única + decisão acionável
