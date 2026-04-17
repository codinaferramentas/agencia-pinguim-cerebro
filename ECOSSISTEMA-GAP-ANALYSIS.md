# Gap Analysis — Ecossistema Luiz × Estado Atual

> Comparando o mapa original do Luiz (ecossistema-mapeamento.json, criado com IOX do Halo)
> com o que esta efetivamente construido hoje (2026-04-15).
>
> Fonte da verdade visual: PAINEL-AGENTES.html

---

## Resumo executivo

| Status | Total |
|--------|-------|
| Squads do mapa original | **30** |
| Squads que geram receita direta (core) | **3** (lancamento, low-ticket, high-ticket) — CRIADAS + ADAPTADAS |
| Squads operacionais (Pinguim dia a dia) | **1** (agencia-pinguim) — COMPLETA |
| Squads de especialistas transversais | **2** (copy, storytelling) — CHIEFS PRONTOS, CLONES COM SOUL |
| Agentes suporte (Pinguim) | **5** (roteador + 4 produtos) — 3 PRONTOS |
| Agentes pessoais | **5** (4 socios + Pinguim orquestrador) — TODOS PRONTOS |
| Estrategistas de produto | **2** (Elo + ProAlt) — AMBOS PRONTOS |

**Total de agentes com SYSTEM-PROMPT pronto: 51**

---

## Parte 1 — O que esta COMPLETO (nao precisa tocar)

### Core do negocio Pinguim
- [x] **agencia-pinguim** — 18/18 agentes com prompt
- [x] **lancamento-pago** — 7/7 agentes com prompt
- [x] **low-ticket** — 7/7 agentes com prompt (era 5 no mapa original, expandimos com +2)
- [x] **high-ticket** — 3/3 agentes com prompt (era 4 no mapa, consolidamos porque venda e consultiva)
- [x] **Pessoais** — Pedro, Micha, Luiz, Codina + Pinguim orquestrador
- [x] **Suporte** — Roteador + Elo + ProAlt (faltam Lira/Taurus mas dependem de material)
- [x] **Estrategistas** — Elo + ProAlt

### Orquestradores de clones
- [x] **Copy Chief** — orquestra 25 copywriters
- [x] **Story Chief** — orquestra 13 storytellers

**Diagnostico:** O nucleo de receita direta do Pinguim esta 100% coberto.

---

## Parte 2 — O que falta DENTRO do escopo Pinguim

### Alta prioridade (faz diferenca pro squad Pinguim)

1. **Suporte Lira** — precisa material da mentoria (depende de envio pelo Pedro/equipe)
2. **Suporte Taurus** — precisa material da mentoria (mesmo)
3. **TOOLS.md completos** — alguns ainda estao com placeholder em squads que nao sao core

**Acao sem Pedro:** Criar Suporte Lira/Taurus em formato "generico de mentoria" ate ter material especifico. Assim o agente ja esta estruturado e so precisa alimentar.

### Media prioridade (uteis pra Pinguim mas nao sao receita direta)

4. **data squad** (7 agentes) — Avinash Kaushik, Peter Fader, Sean Ellis, Nick Mehta, etc. UTIL: podia virar time de analise estrategica de cohort/LTV pros produtos Pinguim
5. **traffic-masters** (16 agentes) — Pedro Sobral, Molly Pittman, etc. UTIL: expandir trafego alem do que temos
6. **hr** (8 agentes) — HR Chief, People Ops, etc. UTIL: Pinguim tem equipe que cresce
7. **finops** (5 agentes) — JR Storment, Corey Quinn. UTIL: financeiro avancado

### Baixa prioridade (uteis pra Dolphin replicar, nao prioritarios pra Pinguim)

8. **legal** (15 agentes) — ja temos Juridico generico na squad agencia-pinguim
9. **contabilidade** (14 agentes) — ja temos Tributario generico
10. **design** (9 agentes) — principio OpenClaw: design e humano
11. **cybersecurity** (15 agentes) — Pinguim nao e empresa de seguranca
12. **advisory-board** (11 agentes) — Ray Dalio, Munger. UTIL: consulta estrategica
13. **deep-research** (11 agentes) — Kahneman, Gary Klein. UTIL: pesquisa profunda
14. **translate** (10 agentes) — Pinguim e mercado BR
15. **creator-os** (5 agentes) — Course Architect, Blog Writer
16. **squad-creator-pro** (4 agentes) — Alan Nicolas, Thiago Finch, Pedro Valerio (specialists brasileiros em creator economy)
17. **mmos** (9 agentes) — People & Psychology
18. **innerlens** (4 agentes) — People & Psychology
19. **hybrid-ops-squad** (9 agentes) — Process Architect
20. **tools** (7 agentes) — meta-tooling
21. **books** (1) — Book Summary
22. **hormozi** (2) — ja temos clone Hormozi dentro do squad copy
23. **marketing** (1) — Creative Director
24. **db-sage** (2) — DB queries
25. **ralph** (1) — ?
26. **monitor** (1) — sistema
27. **etl** (0) — vazio
28. **spy** (2) — research concorrentes
29. **multi-lens-framework** (1) — meta
30. **compound** (1) — ?

---

## Parte 3 — Plano de acao sem depender do Pedro

### Bloco 1 — Fechar core Pinguim (prioridade MAXIMA)
- [ ] Criar Suporte Lira (generico, alimentar quando tiver material)
- [ ] Criar Suporte Taurus (generico, alimentar quando tiver material)
- [ ] Atualizar painel com os 2 novos suportes

### Bloco 2 — Data & Analytics (alta utilidade pro Pinguim)
- [ ] Criar prompts da squad **data** (Avinash, Peter Fader, Sean Ellis, etc.) — 7 agentes
- [ ] **Deep-research** (Kahneman, Klein) — 11 agentes — valor alto em brainstorming estrategico

### Bloco 3 — Traffic Masters (expansao de trafego)
- [ ] Criar prompts da squad **traffic-masters** — 16 agentes (cada um = um mestre em Meta Ads/Google Ads)

### Bloco 4 — Advisory Board (consulta estrategica)
- [ ] Criar prompts da **advisory-board** (Dalio, Munger, Thiel, Hoffman, Naval) — 11 agentes

### Bloco 5 — HR + FinOps (operacional avancado)
- [ ] **hr** (8 agentes)
- [ ] **finops** (5 agentes)

### Bloco 6 — Descartar oficialmente (fora do escopo Pinguim)
Criar documento explicando por que nao vamos fazer prompt pra essas squads **no momento** (elas continuam existindo no cerebro, mas sem prompt):
- cybersecurity, translate, design (humano faz), books, hormozi (ja incluso), marketing (ja incluso), db-sage, ralph, monitor, etl, spy, multi-lens-framework, compound, mmos, innerlens, hybrid-ops-squad, tools, creator-os, squad-creator-pro, contabilidade, legal (ja temos Juridico/Tributario enxutos)

---

## Decisao de execucao

**Proxima acao sem depender do Pedro:** Executar Bloco 1 (fechar core) + Bloco 4 (advisory-board — alto valor pra reuniao com socios).

Depois disso, reavaliar com base no painel atualizado.
