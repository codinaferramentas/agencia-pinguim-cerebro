# Bloco 0 — Pesquisa de Orquestração de Agentes

> Documento de referência arquitetural pro Chief / Orquestrador. Saída de 4 subagentes que pesquisaram em paralelo o estado da arte em mai/2026: Anthropic, OpenClaw, CrewAI/LangGraph, AutoGen + síntese.

**Data:** 2026-05-04
**Objetivo:** decidir o padrão de orquestração que vai pro AGENTS.md do Chief, antes de escrever uma linha de código.

---

## TL;DR — decisão arquitetural

**Padrão escolhido:** **Híbrido — Supervisor (LangGraph-style) + Orchestrator-Workers (Anthropic) na decomposição.**

**Stack:** **Implementação in-house em Edge Functions Deno/TS + Supabase Postgres + painel vanilla.** Não importar CrewAI (Python-only) nem LangGraph (carrega LangChain, fricção em Edge Deno). Usar como **referência viva**, não como dependência.

**Modelo do Chief:** `openai:gpt-5` (chave atual permite). Fallback: `openai:o3` pra raciocínio profundo. Infra agnóstica via prefixo `provedor:modelo` na coluna `pinguim.agentes.modelo`. Trocar pra `anthropic:claude-opus-4-7` é uma rotação de chave no cofre, sem deploy.

**EPP é diferencial real, não reinvenção** — duas das três leis (output aprovado vira referência, feedback humano vira contexto) são gaps reais que nem CrewAI/LangGraph/AutoGen resolvem. Validação acadêmica (Bedrock AgentCore, MIRIX, paper +8.1pp).

---

## 1. Anthropic — "Building Effective Agents" (dez/2024)

Cinco patterns publicados pela própria Anthropic. O nosso caso é literalmente o **#4: Orchestrator-Workers**.

| # | Pattern | Quando usar | Aplicação ao Chief |
|---|---|---|---|
| 1 | Prompt Chaining | Sequência fixa de subtasks | NÃO (workflow conhecido — usa rota) |
| 2 | Routing | Classificador → handler | **Sim** — quando caso recai em categoria mapeada, Chief roteia em vez de orquestrar |
| 3 | Parallelization | Sectioning ou Voting | **Sim** — workers do Chief rodam em paralelo |
| 4 | **Orchestrator-Workers** | Estrutura imprevisível | **Caso canônico do Chief** |
| 5 | Evaluator-Optimizer | Iteração com critério claro | Opcional — curador da squad pode ser evaluator |

Citação chave do paper:
> *"The key difference from parallelization is its flexibility — subtasks aren't pre-defined, but determined by the orchestrator based on the specific input."*

E o aviso que vai pro AGENTS.md do Chief:
> *"Find the simplest solution possible, and only increase complexity when needed."*

→ **Chief só orquestra quando o caso não cabe em workflow pré-existente.**

### Claude Agent SDK (relevante mesmo se não adotarmos)

A Anthropic já documenta primitivas que confirmam nossa anatomia:

- **AgentDefinition** com `description`, `prompt`, `tools`, `model`, `skills`, `memory`, `maxTurns` — bate quase 1:1 com nossos 7 MDs.
- **`memory: 'project' | 'user' | 'local'`** — pasta persistente que injeta `MEMORY.md` no system prompt. **Validação independente de que nosso EPP via APRENDIZADOS.md é o caminho.**
- **Subagents não aninham** (regra dura): hierarquia de 2 níveis. Chief → workers, workers não delegam. **Adotar mesma regra.**
- **Description é produto** — string que faz o orquestrador escolher certo. Tratamos como copy comercial.
- **Hooks** (`PreToolUse`, `SubagentStop`) — nosso ponto de aprovação humana e validação Cyber.

---

## 2. OpenClaw (encontrado — André tinha razão)

Framework open-source do Peter Steinberger, lançado 26/jan/2026. Repo `openclaw/openclaw`, MIT, ~368k stars. **Validação independente da nossa arquitetura:**

- **Memória em Markdown plain text** (`SOUL.md`, `MEMORY.md`, `AGENTS.md`, `TOOLS.md`) → mesmos arquivos que já adotamos.
- **Workspace isolado por agente** → mesma pasta `cerebro/squads/<squad>/agentes/<slug>/` que já temos.
- **Padrão Orquestrador + Workers** ("Opus Orchestrator with Codex Workers") → blueprint direto pro Chief.
- **Gateway como single source of truth** → nosso Supabase + Edge Functions já cumpre esse papel.
- **MCP como tool protocol** → considerar pra padronizar tools depois (não bloqueia hoje).
- **Command Queue serial por sessão** → evita race condition em tools paralelas.

**Não modelar:**
- Stack Node/TS local-first → não bate com nossa stack Edge Deno + multi-cliente.
- "Claw" como unidade → manter "Agente Pinguim".

**Conclusão:** OpenClaw confirma que a arquitetura do Pinguim está alinhada com estado da arte mundial. **Não copiar código, copiar a confiança no padrão.**

---

## 3. CrewAI vs LangGraph

**Veredito: nem um nem outro como dependência. Inspiração arquitetural.**

| Critério | CrewAI | LangGraph | Decisão Pinguim |
|---|---|---|---|
| Linguagem | Python only | Python + TS | TS (Deno) |
| Cabe em Edge Deno? | Não | Tecnicamente sim, com fricção | Não importar |
| HITL nativo | Em Flows | `interrupt()` + `Command(resume=)` | **Modelo a copiar** |
| Memória persistente | LanceDB local | PostgresSaver + thread_id | **PostgresSaver inspira nossa tabela `chief_execucoes`** |
| Padrão de orquestração | Hierarchical Manager | Supervisor (tool-handoff) | **Supervisor é mais previsível** |

### O que copiamos (conceito, não lib):

1. **Supervisor pattern via tool-handoff** (LangGraph)
   - Chief expõe cada specialist como tool OpenAI: `transfer_to_clone_x`, `transfer_to_copy`, etc.
   - LLM do Chief só roteia. Specialist node executa, retorna ao Chief.
   - Implementável em ~150 linhas de TS.

2. **State + checkpointing em Supabase** (PostgresSaver inspirado)
   - Tabela `pinguim.chief_execucoes (run_id, thread_id, state jsonb, status, updated_at)`.
   - Cada step grava snapshot. Resume = ler `state` por `thread_id`.

3. **`interrupt()` como pattern de HITL** (LangGraph)
   - Node grava `status='awaiting_approval'` + payload, Edge retorna 202.
   - Painel mostra modal. Aprovação humana grava resposta. Cron/webhook retoma.

4. **Manager backstory** (CrewAI)
   - Chief tem **SOUL próprio** (não é "função invisível"). Personalidade, valores, tom de voz definem como ele decide.

---

## 4. AutoGen + estado da arte 2026

**AutoGen está em maintenance mode** (Microsoft empurrando pro novo Agent Framework). Não adotar.

### Consenso de produção em 2026:

> "Hierarchical wins over swarm in production almost every time. The supervisor anchors goal alignment; swarms drift without it."

**Tradução:** Chief = supervisor único, hierarquia de 2 níveis, sem swarm peer-to-peer.

### Gaps que NINGUÉM resolve bem (oportunidades nossas):

1. **Aprendizado entre execuções** — frameworks tratam memória como (a) histórico da conversa atual e (b) RAG sobre docs. **Nenhum** tem loop "feedback humano da execução N → contexto da execução N+1". → **Nossa Lei 3 do EPP.**
2. **Memória episódica vs semântica separadas** — todos misturam num vector store só. Pesquisa 2026 (paper +8.1pp) mostra ganho real em separar.
3. **Voz própria persistente** — frameworks confundem persona com tom no prompt. **Nosso Clone como fonte de voz separada do agente é arquitetura única.**
4. **Curadoria humana no loop** — output aprovado/reprovado raramente vira artefato persistente. RLHF é pra treinar modelo, não pra evoluir agente. → **Nossa Lei 2 do EPP.**
5. **Multi-fonte estruturada** — Cérebro / Persona / Skill / Clone / Funil como objetos separados versionáveis. Frameworks só têm "tools" + "memory" + system prompt.

---

## 5. Stack final do Chief — proposta consolidada

```
[Painel /agentes vanilla JS]
   ↓ POST caso
[Edge: chief-orquestrar]
   ↓ 1. monta-contexto-Chief (7 MDs + 5 fontes vivas resolvidas em runtime + EPP semântica)
   ↓ 2. chama-llm gpt-5 → recebe plano (squad proposta + justificativa)
   ↓ 3. grava em pinguim.chief_execucoes (status='awaiting_approval')
   ↓ 4. retorna 202 ao painel
[Painel mostra plano + botão Aprovar / Refinar]
   ↓ humano aprova
[Edge: chief-executar (resume)]
   ↓ pra cada subtarefa em paralelo:
        [Edge: agente-executar(slug, briefing)]
            ↓ monta-contexto-agente (7 MDs + 5 fontes do agente especialista)
            ↓ chama-llm (modelo do agente)
            ↓ valida-voz-clone (embedding similarity vs Clone configurado)
            ↓ grava step em pinguim.chief_steps
   ↓ sintetiza outputs → resultado final
   ↓ marca aguardando-feedback
[Humano dá 👍/👎 + comentário no painel]
   ↓ [Edge: epp-registrar]
        ↓ grava episódio em pinguim.epp_episodios
[Cron diário: epp-destilar]
   ↓ pega episódios novos → destila lições → grava em pinguim.epp_aprendizados
   ↓ próxima execução do Chief lê epp_aprendizados como contexto
```

### Componentes a construir do zero

1. **Loader dos 7 MDs + 5 fontes** — Edge `montar-contexto-agente(slug)` busca tudo, monta system prompt versionado. Cache 5min.
2. **EPP loop persistente** — duas tabelas:
   - `pinguim.epp_episodios` (episódica: o que rolou, raw)
   - `pinguim.epp_aprendizados` (semântica: lição destilada, dedupe via embedding)
   - Cron `epp-destilar` roda 1x/dia, transforma episódios em aprendizados.
3. **Chief Orquestrador** — Edge `chief-orquestrar` com state machine: `planejado → aguardando-aprovacao → executando → aguardando-feedback → done`.
4. **Validador de voz via Clone** — antes de output sair, comparar embedding contra Clone selecionado. Se similaridade < threshold, regerar.
5. **Painel `/agentes`** — live view + aprovação/feedback + dispara EPP.

### Componentes a reaproveitar (conceito, não código)

- **Supervisor pattern** do LangGraph (lógica de roteamento via tool-handoff).
- **Orchestrator-Workers** do Anthropic cookbook (decomposição dinâmica).
- **Manager backstory** do CrewAI (Chief tem SOUL próprio).
- **Episodic + semantic split** dos papers 2026 (Bedrock AgentCore, MIRIX).
- **MCP como protocolo de tool** (OpenClaw) — adotar quando estabilizar.
- **`memory: 'project'` do Claude Agent SDK** — confirma que `APRENDIZADOS.md` no disco é caminho certo.

### Adaptações necessárias pro nosso stack

- **Sem Python.** Tudo Edge Deno/TS.
- **Estado em Supabase Postgres**, não em PostgresSaver/SQLite local.
- **LLM via fetch direto**, não via SDK LangChain.
- **Painel HTML/JS vanilla**, sem React.
- **Hierarquia de 2 níveis estrita** — Chief delega, workers não delegam (regra Anthropic).

---

## 6. Regras duras que vão pro AGENTS.md do Chief

1. **Pattern declarado:** Orchestrator-Workers (Anthropic, dez/2024) com Supervisor routing (LangGraph).
2. **Anti-pattern:** orquestrar caso conhecido. Se cair em categoria mapeada, **rotear** pro workflow.
3. **Plano antes de executar:** Chief sempre devolve squad proposta + justificativa antes de invocar workers. **Aprovação humana é lei dura, não opcional.**
4. **Sem aninhamento:** Chief delega para workers; workers não delegam. Quem precisa de ajuda recebe skill ou tool extra, não subagente.
5. **Briefing completo:** Chief monta pacote (caso + Cérebro relevante + Persona + Funil + restrições) e injeta inline ao worker. Nunca contar com herança de contexto.
6. **EPP via APRENDIZADOS.md + epp_episodios + epp_aprendizados.** Lei dura. Sem isso, não é Agente Pinguim.
7. **Tool restrictions por worker:** copywriter só lê (`Read, Grep, Glob`), executor de campanha tem `Bash`/MCP. Princípio de menor privilégio (Squad Cyber concorda).
8. **Modelo por worker:**
   - Chief: `openai:gpt-5` (raciocínio estratégico) — fallback `openai:o3`.
   - Workers de execução: `openai:gpt-4o` ou `openai:gpt-5-mini` (custo/velocidade).
   - Workers de roteamento/triagem: `openai:gpt-5-mini` ou `openai:gpt-4o-mini`.
9. **Description é produto.** A string `description` de cada worker é o que faz o Chief escolher certo. Tratar como copy comercial — específica, com gatilhos ("Use for…", "Use proactively when…").
10. **Identificação do solicitante:** Chief sempre confirma no início se quem fala é o usuário logado ou outra pessoa (sócio Pinguim → consulta Clone correspondente).
11. **Voz validada por Clone** antes de output final sair (embedding similarity).
12. **LLM agnóstico via prefixo** `provedor:modelo`. Chave no cofre. Trocar = rotação, não deploy.

---

## 7. Próximos passos

- [ ] **Bloco 0.5** — trazer falas dos conselheiros (Dalio, Lencioni, Munger, Naval, Sinek, Alan Nicolas, Pedro Valerio, Thiago Finch) questionando esse desenho, ajustar onde necessário.
- [ ] **Bloco 1** — auditar e completar os 7 MDs do Chief com tudo isso incorporado. AGENT-CARD + APRENDIZADOS criados do zero. Outros 5 reescritos onde precisar.
- [ ] **Bloco 2** — registro do Chief no banco (`pinguim.agentes`) + criar tabelas `chief_execucoes`, `chief_steps`, `epp_episodios`, `epp_aprendizados`.
- [ ] **Bloco 3** — Edge Function `chief-orquestrar` (state machine, sem código de delegação real ainda).
- [ ] **Bloco 4** — painel `/agentes` mínimo (lista, detalhe, botão "Testar Chief").
- [ ] **Bloco 5** — validar com André via caso real ("resolve suporte do ProAlt que reclama de cobrança antes do acesso"). Se redondo: **modelo aprovado**, replicar.
