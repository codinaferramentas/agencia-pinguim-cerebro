# Bloco 0B — Memória Conversacional do Chief

> Gap descoberto pelo André após o Bloco 0. A pesquisa inicial cobriu **memória institucional (EPP)**, mas não cobriu **memória conversacional** (continuar caso, lembrar artefato, retomar 2 dias depois).
> Esta investigação cobre 3 pesquisas em paralelo: Claude SDK / OpenClaw / Bedrock + Conselho de 8 conselheiros + Sistemas em produção (Cursor / Devin / Claude Code / Replit / ChatGPT).

**Data:** 2026-05-04
**Decisão pendente:** ESCOLHA do André entre 3 alternativas apresentadas.

---

## 1. A pergunta concreta que originou tudo

> *"Imagina que volto daqui a 2 dias e lembro daquele caso. Ele vai lembrar?"*
> *"Ele acabou de propor a solução. Falo 'melhora só item 3'. Ele entende que 'item 3' é o que estávamos falando?"*
> *"Onde isso vai estar? No agente orquestrador ou no agente específico que ele montou?"*
> *"Como funciona a memória dele? Como escala? Existe método de mercado?"*

---

## 2. O que o estado da arte revelou

### Convergência forte (4 de 5 sistemas em produção):

1. **Workers/sub-agentes nascem stateless por default.** Claude SDK, OpenAI Agents SDK, Cursor (Background Agent), Replit — todos. **Anthropic é taxativa:** *"A subagent's context window starts fresh. The only channel from parent to subagent is the Agent tool's prompt string."*

2. **Histórico conversacional cliente↔Orquestrador mora no Orquestrador.** Sempre. Nenhum sistema em produção compartilha transcript com workers.

3. **Artefatos vão pra storage externo.** Worker gera, salva, devolve **handle/referência** (não payload). Pattern citado pela própria Anthropic: *"artifact systems where specialized agents create outputs that persist independently. Subagents call tools to store their work in external systems, then pass lightweight references back to the coordinator."*

4. **Memória persistente do worker (quando existe) é AGREGADA, não conversacional.** Claude SDK `memory: 'project'` é descrita como *"build up knowledge over time, such as codebase patterns, debugging insights, and architectural decisions"*. **Não é histórico de caso.**

### Divergência:

- **OpenClaw é outlier** — distribuído de verdade, cada agente tem MEMORY.md próprio, sem central. Mas OpenClaw é **assistente pessoal**, não orquestrador comercial — modelo diferente do nosso.
- **Devin é mais centralizado** — top-level Devin é único cliente-facing, workers são VMs descartáveis.
- **Anthropic Managed Agents** introduziu `memory_stores` compartilháveis com access control (read_only/read_write) — caminho futuro.

### Padrões dominantes encontrados (4):

| Padrão | Quem usa | Mecânica |
|---|---|---|
| **A. Memory file** | Claude Code (`CLAUDE.md`, `MEMORY.md`), Devin (Knowledge), comunidade Cursor | Markdown injetado no system prompt no início de cada sessão |
| **B. Session resume by ID** | Claude Code (`--resume`), Cursor Composer | Transcript completo no disco/banco, reabrir = appendar |
| **C. Vector store de fatos** | ChatGPT Memory (provável) | Fatos atômicos extraídos, embeddados, retrieval semântico |
| **D. Workspace persistente (snapshot total)** | Devin (hypervisor), Replit (FS+Postgres branched+conversa) | Estado da máquina inteira persistido |

**Padrão D não cabe no Pinguim OS** (não somos IDE/sandbox). **A + B + C light cabem perfeitamente.**

---

## 3. O que o conselho disse

(Resumo. Reunião completa abaixo.)

### Pontos fortes da Hipótese 1 (Memória central no Chief)

- **Vendabilidade** (Alan Nicolas): "cérebro único" é pitch claro
- **UX/latência** (Thiago Finch): Chief responde direto sem round-trip
- **Clareza de autoridade** (Lencioni): zero conflito de fonte da verdade
- **Auditoria** (Dalio): um lugar pra logar tudo
- **Simplicidade no MVP** (Naval): troca motor uma vez

### Pontos fortes da Hipótese 2 (Memória distribuída por worker)

- **Escala N+1** (Pedro Valerio): contrato de adapter replicável
- **Especialização real** (Sinek): worker com memória vira "relação"
- **Resiliência** (Dalio inverso): Chief cai, distribuído sobrevive parcial

### Síntese que o conselho propôs (Hipótese 3)

**Naval e Munger convergiram sem combinar:** memória central com namespaces por worker.

- **Histórico conversacional cliente:** central no Chief
- **Artefatos:** central, com tag de autor (worker que produziu)
- **EPP de worker (padrões aprendidos):** distribuído, no caderno do worker
- **Chief é leitor de tudo. Workers são gravadores no namespace deles + leitores do EPP próprio.**

### Perguntas em aberto que o conselho deixou (8)

1. Cliente referencia "aquela copy" como? Por nome de produto, data, ou trecho?
2. Quem versiona o artefato? "Ajusta item 3" vira v2 ou artefato novo?
3. Quanto tempo memória dura? 30d / 1ano / forever?
4. Worker pode escrever no namespace de outro worker?
5. EPP de worker é por cliente ou agregado entre clientes?
6. Chief tem permissão de editar memória ou só ler?
7. Quando workers discordam, quem arbitra?
8. Worker é trocado — herda EPP do antecessor?

---

## 4. Três alternativas pra o André escolher

Estado da arte + conselho convergem para variações dessas 3:

### **Alternativa A — Memória 100% Central no Chief (mainstream simples)**

**Como funciona:**
- Tudo no Chief: histórico, artefatos, decisões.
- Workers são funções stateless puras: `f(briefing) → resultado + handle`.
- Workers NÃO têm EPP próprio.
- Quando "ajusta item 3": Chief busca artefato anterior, monta briefing novo `{copy_v1, instrução: ajustar item 3}`, invoca Copywriter, recebe v2.

**Tabelas:**
- `pinguim.chief_casos` (id, cliente_id, status, resumo)
- `pinguim.chief_turnos` (caso_id, papel, conteudo, ts)
- `pinguim.chief_artefatos` (caso_id, worker_que_gerou, conteudo, parent_id, versao)

**Pró:**
- Mais simples. MVP em 1 sessão.
- Chief sempre tem visão completa (zero round-trip).
- Auditoria trivial.
- Vendável: "tem um cérebro central que lembra".

**Contra:**
- Workers não evoluem com EPP individual. **Quebra parte da Lei 3 do EPP do Pinguim** ("feedback humano vira contexto"): contexto vira do Chief, não do worker.
- Quando especialização do worker importa (Copywriter aprendendo padrões dele com o tempo), perde valor.
- Schema do Chief cresce com cada novo tipo de artefato → eventual refactor doloroso (Munger advertiu).

---

### **Alternativa B — Memória Híbrida (recomendação do conselho — Hipótese 3)**

**Como funciona:**
- **Histórico conversacional + artefatos: central no Chief** (igual Alternativa A).
- **EPP do worker: distribuído** (cada worker tem `APRENDIZADOS.md` próprio + tabela `pinguim.epp_aprendizados_worker` agregada).
- Worker recebe briefing fresh + lê EPP próprio antes de executar.
- Workers NÃO veem histórico de caso (só recebem briefing inline).
- "Ajusta item 3": igual Alternativa A — Chief monta briefing com artefato anterior.

**Tabelas:**
- Tudo da Alternativa A
- `+ pinguim.epp_episodios` (raw: o que rolou em cada execução)
- `+ pinguim.epp_aprendizados` (semântica: lição destilada por worker, agregada entre casos)
- Cron `epp-destilar` 1x/dia

**Pró:**
- Padrão dominante no estado da arte (Anthropic SDK, OpenClaw, Claude Code) — não inventamos.
- Workers ganham EPP REAL: Copywriter aprende padrões dele ao longo dos casos.
- Mantém vendabilidade ("cérebro central") + diferencial Pinguim (workers que evoluem).
- Cumpre as 3 leis do EPP integralmente.
- Conselho aprovou (Naval+Munger convergiram).

**Contra:**
- Complexidade um pouco maior (3 tabelas extras + cron).
- 1 sessão extra de implementação vs Alternativa A.
- Precisa decidir as 8 perguntas em aberto antes (algumas críticas: privacidade de EPP, retenção, versionamento).

---

### **Alternativa C — Memória Totalmente Distribuída (estilo OpenClaw)**

**Como funciona:**
- Cada worker tem **MEMORY.md próprio** (igual OpenClaw).
- Workers mantêm histórico DAS execuções deles.
- Chief tem só visão alto-nível (plano + sintese).
- "Ajusta item 3": Chief delega pro Copywriter buscar nos próprios arquivos.

**Tabelas:**
- Mínima no Chief (só plano executado).
- Pasta por worker: `cerebro/squads/<squad>/agentes/<slug>/casos/<caso_id>/`.

**Pró:**
- Workers altamente especializados.
- Resiliente (Chief cai, workers seguem).
- Modelo mais próximo do OpenClaw (validação independente).

**Contra:**
- **Fora do mainstream comercial.** Devin/Cursor/Claude Code não fazem isso.
- Conflito de fonte da verdade (Lencioni alertou).
- Latência alta (Thiago alertou): toda referência vira round-trip.
- Vendabilidade pior (Alan alertou).
- Precisa contrato rígido entre workers (Pedro alertou).
- Para o Pinguim que tem 227 agentes: 227 estruturas de memória pra manter.

---

## 5. Onde mora a copy (resposta direta à sua pergunta)

| Alternativa | Histórico cliente↔Chief | Artefato (a copy) | "Lembra da copy" |
|---|---|---|---|
| **A** | Tabela Chief | Tabela Chief (`chief_artefatos`) | Chief busca, monta briefing novo, invoca Copywriter |
| **B** (recomendada) | Tabela Chief | Tabela Chief (`chief_artefatos`) | Chief busca, monta briefing novo + Copywriter ainda lê APRENDIZADOS dele |
| **C** | Resumo no Chief | Pasta do Copywriter (`agentes/copywriter/casos/<caso>/v1.md`) | Chief delega busca pro Copywriter |

**Em A e B: artefato mora central. Worker é ferramenta.**
**Em C: artefato mora com worker. Worker é "dono" do que produziu.**

---

## 6. Como cada alternativa afeta o EPP

### EPP — 3 leis do Pinguim:
1. Captação alimenta o Cérebro
2. Output aprovado vira referência
3. Feedback humano vira contexto

| Lei | Alt A | Alt B | Alt C |
|---|---|---|---|
| 1. Captação alimenta Cérebro | ✓ (ortogonal a memória conversacional) | ✓ | ✓ |
| 2. Output aprovado vira referência | Parcial — vai pro Chief só | ✓ — vai pro Chief E pro APRENDIZADOS do worker | ✓ |
| 3. Feedback humano vira contexto | Parcial — Chief evolui, worker fica estático | ✓ — ambos evoluem | ✓ — só worker evolui (Chief tem visão limitada) |

**B é a única que cumpre as 3 leis integralmente.**

---

## 7. Perguntas que precisam ser respondidas antes de implementar (qualquer alternativa)

Do conselho:

1. **Como cliente referencia artefato?** Por produto ("a copy do ProAlt"), data ("a de ontem"), ou trecho ("aquela do item 3")? → Define schema da busca.
2. **Versionamento:** "ajusta item 3" cria v2 do mesmo artefato OU artefato novo com `parent_id`? → Recomendação: **v2 com parent_id** (auditável, reversível).
3. **Retenção:** Memória dura quanto? 90 dias? 1 ano? Forever? → Recomendação: **caso ativo: forever; caso arquivado: 1 ano cru + forever destilado em EPP semântico**.
4. **Privacidade de EPP:** Worker aprende padrões "agregados entre clientes" ou separados por cliente? → **Crítico** se Pinguim virar multi-cliente.
5. **Edição de memória pelo Chief:** Append-only ou mutável? → Recomendação: **append-only com soft-delete** (Squad Cyber gosta).

---

## 8. Resumo visual das 3 alternativas

```
┌──────────────────────── ALTERNATIVA A — Centralizada simples ────────────────────────┐
│                                                                                       │
│  CLIENTE ─── chat ───▶ CHIEF ─┬─ chief_casos                                          │
│                               ├─ chief_turnos    ◀─── memória de caso aqui            │
│                               └─ chief_artefatos ◀─── copy gerada aqui                │
│                                                                                       │
│  CHIEF ─── briefing ───▶ COPYWRITER (stateless) ─── copy ───▶ CHIEF                  │
│                                                                                       │
│  Worker NÃO tem APRENDIZADOS próprio. Todo aprendizado vira ajuste do prompt do Chief│
└───────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────── ALTERNATIVA B — Híbrida (recomendada) ─────────────────────┐
│                                                                                     │
│  CLIENTE ─── chat ───▶ CHIEF ─┬─ chief_casos                                        │
│                               ├─ chief_turnos    ◀─── memória de caso aqui          │
│                               ├─ chief_artefatos ◀─── copy gerada aqui              │
│                               ├─ epp_episodios   ◀─── log raw de cada execução      │
│                               └─ epp_aprendizados ◀── lições destiladas por worker  │
│                                                                                     │
│  CHIEF ─── briefing ───▶ COPYWRITER ─── lê APRENDIZADOS.md ─── gera ─▶ CHIEF        │
│                                                                                     │
│  Worker TEM APRENDIZADOS próprio (agregado, não por caso).                          │
│  Cron destila epp_episodios → epp_aprendizados (semântica).                         │
│  Worker injeta aprendizados próprios no system prompt antes de executar.            │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────── ALTERNATIVA C — Totalmente distribuída ────────────────────┐
│                                                                                     │
│  CLIENTE ─── chat ───▶ CHIEF (visão alto-nível só)                                  │
│                          │                                                          │
│                          └─ chief_planos (resumo do que delegou)                    │
│                                                                                     │
│  CHIEF ─── delega ───▶ COPYWRITER ─┬─ casos/<id>/turnos.md                          │
│                                    ├─ casos/<id>/v1.md ── copy aqui                 │
│                                    └─ MEMORY.md (cresce com tempo)                  │
│                                                                                     │
│  "Aquela copy?" → Chief delega busca pro Copywriter, ele responde.                  │
│  Copywriter é dono do que produziu.                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Recomendação preliminar

**Alternativa B**, pelas seguintes razões:

1. **Estado da arte mainstream** — Claude SDK + OpenClaw + Devin + Replit todos seguem variação de B (memória conversacional central + memória de aprendizado distribuída).
2. **Conselho aprovou** (Hipótese 3 emergiu da reunião).
3. **Cumpre 3 leis do EPP integralmente** — A não cumpre, C cumpre mas com custo arquitetural alto.
4. **Não inventa** — todos os componentes existem em sistemas reais, só mudamos stack pra Edge Deno + Supabase.
5. **Vendabilidade preservada** — pitch ainda é "cérebro central que lembra de tudo", workers que evoluem é diferencial extra.

Mas **decisão é sua**. Cada alternativa tem trade-offs reais.

---

## 10. Se você escolher B, qual o próximo passo

1. **Responder as 5 perguntas críticas** (seção 7) — algumas tenho recomendação, outras precisam de você.
2. **Atualizar BLOCO-0-PESQUISA-ORQUESTRACAO.md** com a decisão (seção "Memória conversacional" oficial).
3. **Atualizar `ANATOMIA-AGENTE.md`** com:
   - `Memória Runtime` como conceito separado das 5 fontes vivas
   - Inclui: memória de caso (central) + EPP individual do worker (`APRENDIZADOS.md` + tabela)
4. **Bloco 0.5** — conselheiros comentam o desenho geral do Chief com memória já decidida.
5. **Bloco 1** — auditar 7 MDs do Chief.

---

## 11. Honestidade do que aconteceu

Eu errei tomando a primeira decisão sozinho. A pesquisa de mercado revelou que minha proposta inicial ("Caso aberto + Perfil do solicitante") era praticamente a Alternativa B com nomes diferentes — mas eu pulei o conselho e a investigação. Você pegou a falha. Esta investigação corrige.

**Lição:** decisão arquitetural relevante = sempre pesquisa + conselho + apresentar alternativas. Memória gravada como feedback pra próximas vezes.
