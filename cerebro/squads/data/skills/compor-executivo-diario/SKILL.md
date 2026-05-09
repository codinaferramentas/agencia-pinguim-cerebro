---
name: compor-executivo-diario
description: Sintetizador final do Relatório Executivo Diário. Recebe outputs de N módulos (financeiro/agenda/triagem-email/discord/etc) e compõe HTML único com TL;DR no topo (5 linhas que respondem "preciso fazer alguma coisa agora?") + seções colapsáveis abaixo. Saudação personalizada ("Bom dia, Luiz · Quinta · 09 mai"). Design Sirius-grade (IBM Plex Sans+Mono, paleta dark, kickers monospace caps, callouts good/warn). Squad data — V2.14.
---

# Skill: compor-executivo-diario

## Quando usar

Use esta skill quando:

- Cron diário 8h dispara a Edge Function `gerar-relatorio` pra um relatório que tem `sintetizador='compor-executivo-diario'` na tabela `pinguim.relatorios_config`
- Sócio pede no chat: "monta meu executivo diário", "me dá um overview do dia"
- Atendente está compondo um relatório custom criado via Categoria F4 que usa este sintetizador

NÃO use quando:

- Relatório é solo (1 módulo só, sem TL;DR cruzado) — usa o output direto da Skill módulo
- Cliente quer relatório técnico/longo sem síntese — usa Skill específica do módulo

## Anatomia do entregável

Layout fixo, ordem fixa, design Sirius-grade. Referência visual: `docs/exemplos/estudo-precificacao-sirius.html`.

### 1. Saudação (sempre no topo)

```
═════════════════════════════════════════
☀️ Bom dia, <NOME_DO_SOCIO> · <DIA_DA_SEMANA> · <DATA_BRT>
```

`<NOME_DO_SOCIO>` vem de `pinguim.socios.nome` resolvido via `cliente_id` do destinatário. `<DIA_DA_SEMANA>` em PT-BR (Segunda/Terça/...). `<DATA_BRT>` formato curto "09 mai".

### 2. TL;DR — AÇÃO NECESSÁRIA HOJE (Dalio)

Bloco que responde **"preciso fazer alguma coisa agora?"** em 3-7 linhas. Cruza módulos pra extrair o que é **acionável hoje**:

```
⚡ AÇÃO NECESSÁRIA HOJE (3)
  1. Conta Meta desativada — anúncios DCL+MM parados desde 06h
  2. Cliente Lyra pediu reembolso — 3 dias sem resposta
  3. Reunião 14h com fornecedor X — pauta no email não-aberto
```

**Critério pra entrar em "Ação necessária":**
- Email crítico (🔴 do triagem) com prazo hoje/amanhã
- Reunião do dia + algo pendente do email/discord relacionado
- Risco de perda financeira (anúncio parado, reembolso sem resposta, churn iminente)
- Decisão pendente do Discord que bloqueia o time

**Se NÃO há ação necessária**, escreve: `✅ NADA URGENTE HOJE — relaxa, lê o resto se quiser.` (Dalio: best case do relatório é o sócio fechar em 30 segundos.)

### 3. Bloco NÚMEROS (resumo financeiro 1 linha cada)

```
📊 NÚMEROS
  Vendas ontem: R$ 47.832 (32 pedidos · ↑12% vs D-1)
  Reembolsos: 3 do Lyra (atenção)
  Gasto Ads: R$ 187,95 · ROAS 5.2x
```

Vem do output do módulo `financeiro-24h`. Se módulo bloqueado/falhou, mostra `📊 NÚMEROS — financeiro indisponível (motivo: <X>)`. **NUNCA inventar número.**

### 4. Bloco HOJE (agenda)

```
📅 HOJE
  4 reuniões · próxima 10h com Pedro
  Amanhã: 3 reuniões + lançamento do ProAlt
```

Vem do módulo `agenda-hoje`. Se módulo não rodou, omite o bloco (não escreve "agenda indisponível" — não polui se não tem).

### 5. Linha divisória + nudge pra fechar

```
═════════════════════════════════════════
[Detalhes abaixo se quiser ler. Senão, fecha aí, tá tudo no caminho.]
```

**Esse nudge é importante** (Dalio worst case): autoriza explicitamente o sócio a fechar agora se quiser. Sem culpa.

### 6. SEÇÕES DETALHADAS (colapsáveis)

Cada módulo entrega seu output completo numa seção. Ordem padrão (sobrescrevível por `relatorios_modulos.ordem_default`):

1. **Financeiro completo** — tabela de vendas por produto, breakdown ROAS por campanha, comparativos D-1/D-7/D-30
2. **Agenda completa** — todas as reuniões do dia + descrição + link de vídeo se tem + amanhã
3. **Triagem email completa** — tabelas de 🔴/🟡/🟢/⚫ com sugestão de ação por crítico/oportunidade (igual Skill `triagem-emails-24h`)
4. **Discord completo** — mensagens críticas/importantes + métricas de engajamento

Cada seção tem cabeçalho próprio em estilo "kicker monospace caps":

```
01 · FINANCEIRO

[conteúdo do módulo]
```

### 7. Footer

```
═════════════════════════════════════════
Pinguim OS · Relatório executivo diário · gerado <timestamp BRT>
Módulos rodados: 4/4 · Verifier: ✓ todos passaram
Discrepância? Avisa o Codina.
```

Se algum módulo falhou: `Módulos rodados: 3/4 · ⚠ discord falhou (motivo)`.

## Verifier por módulo (Munger — falhas isoladas)

Esta skill ASSUME que cada módulo já passou pelo Verifier próprio antes de chegar aqui. **Não re-valida números** — confia nos módulos.

Mas faz **sanity check final**:
- TL;DR não pode ter número que não aparece em nenhuma seção (ação 1 cita "Meta desativada" → seção financeiro deve ter "anúncio Meta parado" OU seção triagem-email deve ter o email da Meta sobre desativação)
- Bloco NÚMEROS bate com seção FINANCEIRO completa
- Saudação tem o nome certo do destinatário (cliente_id → pinguim.socios.nome)

Se sanity check falha, marca `ultimo_status='reprovado'` em `relatorios_config`, alerta o Codina, **NÃO ENVIA** ao destinatário.

## Design — referência fixa

**Layout:** `docs/exemplos/estudo-precificacao-sirius.html` (estudo de precificação Sirius — André validou). Características:

- Fundo `#0A0A0A` (André pediu fundo bem preto; usar `#0A0A0A` ou `#000` se preferir mais radical)
- Cards: `#121212` background, `#1F1F1F` border, border-radius 12-16px
- Fonte: IBM Plex Sans (corpo) + IBM Plex Mono (kickers, números)
- Cor destaque: laranja Pinguim `#E85C00`
- Kickers em monospace caps: `01 · FINANCEIRO`
- Métricas em cards com barra superior 3px laranja
- Callouts: good (`#6CC287`), warn (`#E6A85C`), bad (`#D87070`), note (cinza)
- Tabelas com `row-highlight` em laranja claro pras linhas importantes

Reusa CSS canônico do `lib/template-html.js` (V2.10) **mas com variant `executivo-sirius`** que ajusta paleta/tipografia. NÃO criar template paralelo — estende o existente.

## Como funciona em runtime

1. Edge Function `gerar-relatorio` recebe `relatorio_id` do cron
2. Lê `pinguim.relatorios_config` → pega `modulos[]` + `cliente_id` + `sintetizador`
3. Pra cada módulo em `modulos[]`, chama Skill correspondente em paralelo (Promise.all). Cada Skill devolve `{ok, conteudo_md, conteudo_estruturado, status}`
4. Se algum módulo falhou (`ok=false`), marca no footer mas continua (Munger)
5. Chama esta Skill `compor-executivo-diario` com:
   - `socio_nome` (resolvido de `pinguim.socios`)
   - `outputs_modulos` (array de outputs)
   - `data_brt`, `dia_semana`
6. Skill compõe HTML conforme estrutura acima
7. Roda sanity check
8. Se passa: `db.salvarEntregavel({tipo: 'relatorio-executivo-diario', cliente_id, conteudo_md, conteudo_estruturado: {modulos_rodados, alertas}, ...})`
9. Edge dispara WhatsApp via `lib/evolution.js` (Fase 3) com link `/entregavel/<UUID>`

## Padrão de qualidade

- **NUNCA inventar** número, prazo, nome de cliente
- **SEMPRE** colocar TL;DR no topo (Dalio worst case = sócio só lê o topo)
- **SEMPRE** autorizar fechar (nudge "fecha aí, tá tudo no caminho")
- **SEMPRE** declarar quando módulo falhou (Munger — transparência)
- Saudação personalizada NÃO genérica ("Bom dia, Luiz" não "Bom dia, sócio")
- Design Sirius-grade — não economizar nas 8h de polimento (Thiel)
