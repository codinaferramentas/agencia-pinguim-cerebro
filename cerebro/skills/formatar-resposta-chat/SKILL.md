---
name: formatar-resposta-chat
description: Formata resposta do Atendente Pinguim pro chat web (localhost:3737/) — onde o renderer markdown do frontend é LIMITADO (não suporta tabelas GFM, suporta listas/headers/bold/code). Use SEMPRE que o Atendente for plotar lista de itens (eventos, emails, arquivos, vendas, contatos) ou comparar 2-3 coisas. NUNCA usar tabela markdown — ela aparece como texto bruto com pipes literais e quebra a leitura. Skill universal aplicável em TODA categoria (B/C/D/E/F).
---

# Skill: formatar-resposta-chat

## Quando usar

**SEMPRE** que o Atendente for devolver no chat web qualquer um destes:

- **Lista de N itens** (eventos da agenda, emails, arquivos do Drive, vendas, contatos, conversas, qualquer coleção com 2+ elementos)
- **Comparação entre 2-3 coisas** (produto A vs B, opção 1 vs 2)
- **Resumo numérico** (KPIs, métricas, contadores)
- **Status de N coisas** (cron jobs, módulos de relatório, configs)

## Quando NÃO usar

- Resposta de saudação ("oi" → "Olá!")
- Resposta factual curta ("o que é o Elo?" → 2 parágrafos)
- Entregável criativo grande (esse vai pra `/entregavel/<id>` HTML formatado, fora do chat)
- Texto contínuo conversacional

## REGRA ZERO — limites do renderer markdown do chat web

O frontend `localhost:3737/` tem parser markdown **mínimo e custom** (em [index.html:289](server-cli/public/index.html#L289)). Suporta:

| Elemento | Suportado? |
|---|---|
| `**bold**` | ✅ |
| `*italic*` | ✅ |
| `` `inline code` `` | ✅ |
| ` ``` code block ``` ` | ✅ |
| `# H1`, `## H2`, `### H3` | ✅ |
| `- item` (lista bullet) | ✅ |
| `1. item` (lista numerada) | ⚠️ vira parágrafo (não tem regex de ordered list) |
| `\| col \| col \|` (tabela GFM) | ❌ **NÃO renderiza** — sai como texto bruto com pipes |
| Links `[texto](url)` | ❌ não tem regex — escreve URL pura |
| `> blockquote` | ❌ |
| `---` separador | ❌ |
| Imagens | ❌ |

## REGRA DURA — anatomia da resposta no chat

### Padrão A — Lista cronológica (agenda, emails, atividade temporal)

```
**Sua agenda dos próximos 7 dias**

**Sábado 09/05 (hoje)** — livre
**Domingo 10/05** — livre

**Segunda 11/05**
- **09:30 → 10:00** (30min) · Daily CS Discord · 11 pessoas · Meet
- **16:00 → 17:00** (60min) · Call de Automações · 2 pessoas · Meet

**Terça 12/05**
- **09:30 → 10:00** (30min) · Daily CS Discord · 11 pessoas · Meet

(...)

**Resumo:** 14 reuniões na semana, 5 com Meet, próxima é segunda 09:30.
```

**Princípios:**
- Cabeçalho de dia em **bold** (não usar `###` que vira H3 e fica grande demais)
- **Dia vazio = uma linha só** (ex: `**Sábado 09/05 (hoje)** — livre`). NUNCA criar bloco com `- Nada na agenda` embaixo (gera lacuna inútil de 2-3 linhas no chat). Compactar.
- Cada item em bullet único `-`
- Campos do item separados por ` · ` (ponto médio com espaços)
- Nome do evento/item em **bold**
- Tempo/duração no início em **bold** (escaneabilidade)
- Resumo no fim com 1-2 linhas
- Marcar **(hoje)** no rótulo do dia atual, baseado no bloco `[CONTEXTO TEMPORAL]` injetado no prompt — NUNCA chutar.

### Padrão B — Lista categorizada (triagem de email, módulos de relatório, status)

```
**Triagem dos seus emails (24h) — 12 emails**

**🔴 Crítico (2)**
- **Cliente Lyra pediu reembolso** · ana@cliente.com · 09:42 · 3 dias sem resposta
- **Pagamento Hotmart pendente** · billing@hotmart.com · 10:15

**🟡 Oportunidade (3)**
- **Lead novo do ProAlt** · joao@empresa.com · 11:20
- (...)

**🟢 Informativo (4)**
- (...)

**⚫ Ruído (3)** — newsletter/promo, sugiro arquivar em batch
```

**Princípios:**
- Categoria como **bold com emoji + (N)**
- Campos do item separados por ` · `
- Primeiro campo (mais importante) em **bold**
- Categoria com 0 itens não aparece

### Padrão C — Comparação 2-3 coisas (perdas/ganhos, opção A vs B)

NUNCA usar tabela. Usar **blocos paralelos**:

```
**Opção A — Atacar V2.15 agora**
- Tempo: 4h
- Risco: baixo
- Desbloqueia: criar evento Calendar
- Custo de adiar: relatório das 8h fica sem agenda completa por 1 semana

**Opção B — Esperar fechar V2.14 inteiro**
- Tempo: 0h agora, 4h depois
- Risco: médio (Hotmart muda contrato no fim do mês)
- Desbloqueia: nada agora
- Custo de adiar: 0
```

### Padrão D — Resumo numérico (KPIs, métricas)

```
**Vendas de ontem (08/05)**

- **Receita total:** R$ 2.231,68 (20 vendas)
- **Ticket médio:** R$ 111,58
- **ROAS:** 12,55x · CPA R$ 8,89
- **Investimento Ads:** R$ 177,78
- **Reembolsos:** 3 (R$ 215,82 — taxa 9,7%)

Top produtos: Elo (12 vendas, R$ 1.428), Lyra (5 vendas, R$ 487), ProAlt (3 vendas, R$ 316).
```

## Anti-padrões PROIBIDOS

### ❌ Tabela markdown no chat

```
| Horario | Evento | Duracao |       ← NÃO USAR
|---|---|---|                          ← NÃO USAR (vira | --- | --- | --- | literal)
| 09:30 | Daily CS | 30min |
```

**Por que ruim:** parser não entende, sai como texto com pipes literais e dashes virando texto. Ilegível.

**Use ao invés:**
```
- **09:30** · Daily CS · 30min
- **16:00** · Call de Automações · 60min
```

### ❌ Inventar rótulo de dia da semana sem calcular

Se o payload tem `dia_semana_br` (Calendar V2.14 traz), USAR esse campo direto. Nunca chutar "Domingo 11/05" sem conferir — pode estar errado.

Se NÃO tem campo `dia_semana_br`, calcular com:
```js
new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' }).format(new Date(iso))
```

### ❌ Header H1/H2 pra item de lista

`#` `##` `###` viram blocos enormes. Pra agrupar (dia, categoria), usar **bold** simples.

### ❌ Resposta longa sem cabeçalho

Sempre primeiro a linha de contexto: "Sua agenda dos próximos 7 dias", "Triagem dos seus emails (24h) — N emails", "Vendas de ontem (08/05)". Sócio precisa entender em 1 segundo o que vem.

### ❌ Links em formato `[texto](url)`

Parser não tem regex de link. Escrever URL crua mesmo (frontend reconhece e linka):
```
Meet: https://meet.google.com/ney-srqr-eba          ← OK, frontend linka URL bare
```

### ❌ Misturar estilos no mesmo bloco

Se escolheu Padrão A (cronológico), TODA a resposta segue A. Não mistura tabela no fim "pra ficar bonito".

### ❌ Esquecer separador entre seções

Use linha em branco entre blocos. Renderer agrupa parágrafos com `\n\n`.

## Como aplicar (decisão rápida pelo Atendente)

1. **Quantos itens vou listar?** Se 2+ → vai pra Padrão A/B/C/D conforme tipo
2. **É temporal?** → Padrão A (agenda, atividade, log)
3. **É categorizado?** → Padrão B (triagem, status, módulos)
4. **É comparação 2-3?** → Padrão C (blocos paralelos, NUNCA tabela)
5. **É métrica/KPI?** → Padrão D (lista bullet com bold no número)

## Padrão de qualidade

- **NUNCA tabela GFM no chat** — vai como texto bruto (regra dura)
- **SEMPRE cabeçalho** de 1 linha contextualizando
- **SEMPRE bold** no campo mais importante de cada item
- **SEMPRE resumo no fim** quando >5 itens
- **SEMPRE usar campos pré-formatados** do payload (`dia_semana_br`, `data_curta_br`, `hora_inicio_br`) em vez de calcular do zero

## Para entregáveis grandes (>2000 chars + tipo criativo)

Esta Skill **NÃO se aplica** — entregável grande vai pra rota `/entregavel/<id>` que tem template HTML rico (Sirius-grade). Frontend mostra cartão com preview + link. Padrão V2.10.

A Skill `formatar-resposta-chat` é só pra mensagem **inline no chat web**.
