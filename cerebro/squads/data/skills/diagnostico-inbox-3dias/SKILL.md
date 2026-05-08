---
name: diagnostico-inbox-3dias
description: Análise profunda da inbox dos últimos 3 dias — detecta padrões (newsletters arquiváveis, clientes sem resposta, fontes repetitivas), calcula score de saúde, sugere ações em batch (limpar spam, arquivar X, marcar prioridade). Usar quando sócio pede "diagnóstico da inbox", "como tá meu email", "tem coisa pendente?" OU quando cron seg/qua/sex 8h dispara automaticamente. Squad data — Sub-fase 1B.2 do plano V2.14.
---

# Skill: diagnostico-inbox-3dias

## Quando usar

Use esta skill quando:

- Sócio pede no chat: "diagnóstico da minha inbox", "como tá meu email", "tem muita coisa pendente?", "limpa minha caixa", "tô atrasado em alguma resposta?"
- Cron 3x/semana (seg/qua/sex 8h BRT) dispara automaticamente
- Sócio pergunta sobre **padrões** ou **histórico** da inbox (não sobre 1 email específico)

NÃO use quando:

- Sócio quer só ver os emails de hoje → usa `triagem-emails-24h` (mais rápido, escopo menor)
- Sócio quer ler/responder email específico → V2.13 E5/E6 direto
- Sócio quer relatório FINANCEIRO (de vendas) → outro caminho (Skill `gerar-relatorio-financeiro`, lê 2º Supabase, não Gmail)

**Frequência decidida com André 2026-05-08:** semanal demora demais (CEO recebe muito email), diário vira ruído. **3x/semana (seg/qua/sex)** é o ponto certo.

## Como executar

### Passo 1 — Coletar inbox dos últimos 3 dias

```bash
bash scripts/gmail-listar.sh "newer_than:3d" 200
```

Limite 200 — diagnóstico precisa visão ampla. Se sócio recebe muito (>200), aumentar pra 500 (custo aceitável — diagnóstico é a cada 3 dias, não diário).

### Passo 2 — Análise de padrões (5 dimensões)

Pra cada email da lista, extrair: remetente, assunto, data, lido?, label.

#### Dimensão A — Padrões de fonte

Agrupar por `remetente` ou domínio. Sinais a procurar:

- **Newsletters em massa** — mesma fonte enviando >3x/3dias e nunca lida → candidata a unsubscribe
- **Notificações automáticas repetitivas** — Google Drive "alguém logou", LinkedIn "X jobs" → arquivar batch
- **Cliente sem resposta** — domínio externo (não Pinguim, não fornecedor conhecido) escreveu mas não foi respondido há 3+ dias → flag de churn

#### Dimensão B — Padrões temporais (Wes Kao)

- Qual dia/hora chegam mais emails críticos?
- Sócio responde mais rápido em qual período? (sugere "agendar resposta pra esse horário")

#### Dimensão C — Padrões de conteúdo

- Quantas vezes "reembolso" aparece nos últimos 3 dias? Se > 3, **alerta de problema sistêmico em produto** (cruzar com produto Pinguim mencionado)
- Quantas vezes "boleto vencendo" aparece? Se > 2, sugere "automatizar pagamento" ou "centralizar em 1 dia/mês"
- Padrão de palavras genéricas → spam ("ganhe", "limited time", "urgent")

#### Dimensão D — Score de saúde (Avinash Kaushik)

Cálculo:

```
score = (
  (% críticos respondidos no SLA esperado) * 0.40 +
  (% oportunidades respondidas em 48h) * 0.30 +
  (1 - % ruído na inbox) * 0.20 +
  (% emails lidos vs total) * 0.10
) * 100
```

Faixa:
- **80-100** 💚 saudável
- **60-79** 💛 atenção (algo deslizando)
- **<60** 🔴 crítico (inbox descontrolada)

#### Dimensão E — Risco churn (Nick Mehta)

Pra cada cliente identificado (cruza com Cérebro Pinguim quando email menciona produto):

- Última interação > 3 dias E mensagem com tom negativo → 🔴 risco alto
- Última interação > 7 dias mesmo neutra → 🟡 monitorar
- Resposta nossa > 48h depois da pergunta dele → 🟡 atrito acumulando

### Passo 3 — Compor ações sugeridas (em batch, com 1 clique)

Cada ação vira **bloco com botão** (link clicável que abre chat com prompt pronto):

```
🧹 LIMPAR SPAM/RUÍDO (47 emails)
   Domínios: udemy.com (12), linkedin (18), promo-stripe (17)
   [Arquivar todos] → executa via gmail-modificar.sh com confirmação E6

📦 ARQUIVAR NEWSLETTERS LIDAS (23 emails)
   Greg Isenberg (5), Sahil Bloom (4), HBR (8), outros (6)
   [Arquivar todos] → idem

⚠️ MARCAR CRÍTICOS NÃO-RESPONDIDOS (5 emails)
   Cliente Lyra Reembolso · 3 dias sem resposta
   Hotmart Boleto Vencendo · vence amanhã
   ...
   [Marcar como STAR pra responder hoje] → gmail-modificar.sh op=star
```

Footer com **pergunta clara**: "Quer que eu execute alguma dessas ações? [sim, todas / só X / não, eu vejo depois]"

### Passo 4 — Salvar em pinguim.entregaveis

```js
db.salvarEntregavel({
  tipo: 'diagnostico-inbox-3dias',
  titulo: `Diagnóstico inbox — ${dataBRT}`,
  conteudo_md: htmlGerado,
  conteudo_estruturado: {
    score_saude: 67,
    qtd_emails_3d: 187,
    padroes_detectados: [...],
    riscos_churn: [{cliente: 'X', dias_sem_resposta: 4}, ...],
    acoes_sugeridas: [
      { tipo: 'arquivar', categoria: 'spam', qtd: 47, dominios: [...] },
      { tipo: 'arquivar', categoria: 'newsletter_lida', qtd: 23 },
      { tipo: 'star', emails: [...] }
    ],
    produtos_mencionados: ['elo', 'lyra', 'proalt'],
  }
})
```

## Padrão de qualidade

- **Score de saúde NUNCA é palpite** — sempre calcula com fórmula explícita acima
- **Risco churn NUNCA é hipótese** — exige evidência concreta (data + tom + sem resposta)
- **Ações em batch SEMPRE pedem confirmação NO CHAT** — diagnóstico é input, sócio é quem decide
- **Footer SEMPRE inclui** opção "não, eu vejo depois" — sócio nem sempre quer agir agora

## Mestres da squad data — pipeline completo

Esta skill é candidata natural pra rodar com pipeline criativo (igual advisory-board):

| Mestre | Contribuição específica |
|---|---|
| **Avinash Kaushik** | Score de saúde + KPIs de inbox (taxa lida, taxa respondida, tempo médio) |
| **Peter Fader** | Peso por valor do cliente (cliente alto LTV merece prioridade independente do tom) |
| **Sean Ellis** | Oportunidades de conversão escondidas (lead engajado sem follow-up) |
| **Nick Mehta** | Risco churn (cliente reclamando + sem resposta) |
| **David Spinks** | Qualidade de comunicação (tom relacional vs transacional, padrões que constroem relacionamento) |
| **Wes Kao** | Padrões temporais (qual dia/hora gerou mais email crítico) |
| **Data Chief** | Síntese final em narrativa única + recomendação acionável |

**Mestres rodam em paralelo (Promise.all igual advisory-board), Chief vem em série depois com pareceres dos 6 como contexto.**
