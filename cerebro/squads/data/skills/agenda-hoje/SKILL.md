---
name: agenda-hoje
description: Resumo da agenda do sócio — HOJE detalhado (cada compromisso com horário, duração, participantes, link Meet) + AMANHÃ resumido em uma linha (N reuniões, primeira HHh com QUEM). Lê Google Calendar via lib/google-calendar.js. Cada sócio vê APENAS a agenda dele (refresh_token isolado por cliente_id no cofre). Squad data — V2.14 Fase 1.7.
---

# Skill: agenda-hoje

## Quando usar

- Cron diário 8h dispara como módulo do executivo-diario
- Sócio pede "como tá minha agenda hoje", "o que tenho hoje", "quais reuniões hoje"
- Outro relatório executivo precisa do bloco de agenda (composição modular V2.14)

## Quando NÃO usar

- Pedido de "agenda da semana" / "próximos 7 dias" — usa Skill diferente (a criar) ou endpoint `/api/calendar/listar-eventos` direto com janela personalizada
- Pedido de **CRIAR** evento novo — vai pra **`hybrid-ops-squad`** (squad operacional canônica). Esta Skill é READ-only.
- Pedido de **alterar/cancelar** evento — idem, `hybrid-ops-squad`.

## REGRA ZERO — separação canônica de squads

| Tipo de pedido | Squad responsável |
|---|---|
| LER + analisar + reportar agenda | **`data`** (esta Skill) |
| CRIAR / ALTERAR / CANCELAR evento | **`hybrid-ops-squad`** (frente futura V2.15) |

Esta Skill NUNCA escreve no Calendar. Se o sócio pedir criar/alterar evento durante interação que disparou esta Skill, devolver: "Pra criar/alterar evento, peça pro Atendente — vai entrar a squad operacional `hybrid-ops-squad`".

## Como executar

### Passo 1 — Coleta via wrapper (HOJE detalhado + AMANHÃ resumido)

```js
const cal = require('./lib/google-calendar');

const hoje = cal.janelaHojeBRT();
const amanha = cal.janelaAmanhaBRT();

// HOJE: lista completa de eventos
const rHoje = await cal.listarEventos({
  calendarId: 'primary',
  timeMin: hoje.inicio_iso,
  timeMax: hoje.fim_iso,
  maxResults: 50,
});

// AMANHÃ: lista pra contar e pegar o primeiro
const rAmanha = await cal.listarEventos({
  calendarId: 'primary',
  timeMin: amanha.inicio_iso,
  timeMax: amanha.fim_iso,
  maxResults: 50,
});
```

### Passo 2 — Composição do bloco markdown

Estrutura fixa (compactável pra entrar no Executivo Diário):

```
## 📅 Agenda

### HOJE — <dia da semana> <DD/MM>

<se 0 eventos>
Nada na agenda hoje.

<se >0 eventos, lista cronológica>
- **HH:MM → HH:MM** (Nmin) · **<título>** · <N participantes> · <link Meet se houver>
- **HH:MM → HH:MM** (Nmin) · **<título>** · ...

<se algum evento for "dia inteiro">
- **[dia inteiro]** · **<título>**

### AMANHÃ — <dia da semana> <DD/MM>

<se 0 eventos>
Nada amanhã. Dia livre.

<se 1 evento>
1 reunião · **HH:MM** com **<participante principal ou título>**

<se >1 evento>
N reuniões · primeira **HH:MM** com **<participante principal do primeiro ou título>**

---
Fonte: Google Calendar (primary) · janela BRT
```

### Passo 3 — Detecções/flags úteis

Análise leve (Naval — alavanca no que reportar):

1. **Conflitos** — dois eventos sobrepostos no mesmo horário → marca com ⚠
2. **Back-to-back** — 3+ reuniões coladas (intervalo <15min entre fim de uma e início da próxima) → linha extra: "⚠ Back-to-back: HH-HH sem respiro"
3. **Sem participantes** — evento solo na agenda (bloqueio de tempo, focal time) → marca como `[bloqueio]` em vez de listar participantes
4. **Sem título** — evento "(sem título)" → mantém literal mas alerta no rodapé "1 evento sem título — abrir Calendar pra revisar"

### Passo 4 — Verifier de agenda (Munger reforço)

Antes de devolver o output, conferir:

1. **Total bate?** Soma dos eventos listados = `r.total` retornado pela API
2. **Janela correta?** `inicio_iso` da janela é início do dia BRT (não UTC) — conferir que primeiro evento não está antes de 00:00 BRT
3. **Recorrentes expandidos?** Se há recorrente listado, deve estar como ocorrência (não evento-mãe) — `singleEvents=true` no wrapper já garante
4. **Cancelados filtrados?** Wrapper filtra `status=cancelled` — se aparecer cancelado, é bug

Se algum check falhar:
- Adiciona bloco no fim do output: `⚠ ALERTA Verifier: <descrição>`
- Marca `status='reprovado'` em `pinguim.relatorios_config.ultimo_status`

### Passo 5 — Cruzamento com outros módulos (executivo-diario)

Quando rodar como parte do executivo-diario, **passar dados estruturados** (objetos `rHoje` e `rAmanha`) pra Skill `compor-executivo-diario` cruzar com financeiro/triagem-email/discord.

Exemplos de cruzamentos que o sintetizador (Data Chief) faz:

- "Agenda lotada hoje" + "ROAS muito alto ontem" = "dia ruim pra escalar Ads, sem janela pra reagir se gastar mais"
- "Reunião 14h com fornecedor X" + "email não-aberto do fornecedor X" = "abrir email antes da call"
- "3 reuniões consecutivas 9-12h" + "1 email crítico do cliente Lyra" = "responder Lyra ANTES das 9h ou DEPOIS das 12h"

## Anti-padrões proibidos

- ❌ **Inventar evento** — se wrapper retorna 0, devolve "Nada na agenda hoje" honesto. Não preencher com placeholder.
- ❌ **Listar amanhã detalhado** — decisão do André 2026-05-09 é **resumo de uma linha** ("N reuniões, primeira HHh com QUEM"). Detalhe amanhã polui TL;DR. Se sócio quiser detalhe, pede no chat.
- ❌ **Usar UTC nas horas exibidas** — wrapper já formata em BRT, mas se você compor manualmente, usar `formatarHoraBR(iso)` do wrapper, NUNCA `new Date(iso).getHours()` (esse usa fuso da máquina).
- ❌ **Misturar calendário primary com secundários sem avisar** — esta Skill default é só `primary`. Se sócio tem 3 calendários e quer todos, é decisão dele explicitar.
- ❌ **Escrever no Calendar** — esta Skill é READ-only. Criar/alterar evento é `hybrid-ops-squad`.
- ❌ **Confundir "dia inteiro" com bloqueio** — eventos `dia_inteiro=true` são feriados/aniversários/marcos, não reuniões. Listar com marca `[dia inteiro]` separada.

## Padrão de qualidade

- **NUNCA inventar** — todo evento vem do `cal.listarEventos()` real
- **SEMPRE rodar Verifier** antes de devolver
- **SEMPRE incluir audit no rodapé** (calendário consultado, janela BRT) — sócio audita visualmente
- **DECLARAR limite** quando dado parcial (ex: "Calendar não conectado pra você — acessar /conectar-google")

## Pendências conhecidas

- **Múltiplos calendários** — esta versão lê só `primary`. Se sócio tem "Reuniões internas" separado, futuramente expandir pra ler todos calendários onde `selecionado=true` (já temos `listarCalendarios()` pronto pra descobrir).
- **Identificação do "participante principal"** — hoje usa primeiro `attendee` que não é o próprio sócio. Em evento 1:1 funciona perfeito; em evento com 5+ pessoas pode pegar nome aleatório. Refinar quando tiver feedback real.
- **Detecção de Meet vs presencial vs telefone** — só detecta Meet (Google). Zoom/Teams ficam como link no `local` ou `descricao`. Aceitável v1.
