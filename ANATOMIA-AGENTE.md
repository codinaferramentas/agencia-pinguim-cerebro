# Anatomia do Agente

> Estrutura padrão para criação de agentes de IA.
> Este MD é a **fonte única da verdade** sobre como um agente é construído.
> Leia antes de criar qualquer agente novo — nunca propor arquitetura diferente, sempre reutilizar esta.

---

## 1. Onde vive um agente

Um agente tem duas metades: **identidade em disco** (arquivos MD versionados em git) e **metadados em banco** (o que muda em runtime).

### 1.1. Em disco — a identidade

Cada agente mora no próprio diretório:

```
/agentes/<categoria>/<slug-do-agente>/
```

E contém **6 arquivos MD obrigatórios** + **2 estruturas vivas de memória individual**:

| Arquivo / Pasta | O que é |
|---|---|
| `IDENTITY.md` | Nome, emoji, resumo de 1 parágrafo. Cartão de visita. |
| `SOUL.md` | Personalidade, tom de voz, valores, limites de linguagem. É a alma — não confundir com regras operacionais. |
| `AGENTS.md` | Regras operacionais: o que pode/não pode fazer, escopo, permissões. |
| `TOOLS.md` | Ferramentas e APIs conectadas ao agente (lista com link/endpoint/auth). |
| `SYSTEM-PROMPT.md` | Prompt final que vai pro LLM como `role: system`. Consolida o que está nos outros MDs em texto corrido. |
| `AGENT-CARD.md` | Contrato operacional de 7 campos (ver seção 3). |
| `APRENDIZADOS.md` | **Memória individual ATIVA desde v1.** Aprendizados gerais do agente, agregados entre clientes. Lido em toda execução. Crescido por destilação automática (cron) quando padrão se repete entre 3+ clientes. |
| `perfis/<cliente_slug>.md` | **Memória individual por cliente.** Pasta criada on-demand. Cada cliente que o agente atende gera 1 arquivo. O que esse cliente já me ensinou (ex: "prefere copy curta sem exclamação"). Lido em toda execução cujo `cliente` casar. |

**Regra dura:** memória individual nasce ATIVA na v1 do agente. Não é "implementa depois quando der dor". Sem `APRENDIZADOS.md` + `perfis/` vivos, o agente não cumpre EPP — vira chatbot caro. Ver memória `project_memoria_individual_dna_agente.md` (2026-05-05) pra contexto da decisão.

**Por que MD em disco e não tudo em banco?**
- Versionamento grátis via git (cada commit = uma "versão" do agente).
- Diff visual de mudança de personalidade ao longo do tempo.
- Portável: clonar o repo = clonar os agentes.
- Zero overhead de banco pra identidade estável.

### 1.2. No banco — os metadados operacionais

Uma tabela `agentes` com uma row por agente. Guarda **só o que muda em runtime**, nunca duplica o conteúdo dos MDs:

```sql
create table agentes (
  id uuid primary key,
  slug text unique not null,          -- casa com o diretório em disco
  status text not null,                -- planejado | em_criacao | em_teste | em_producao | pausado
  modelo text not null,                -- modelo LLM atual
  modelo_fallback text,
  canais text[],                       -- onde o agente é acionado
  limite_execucoes_dia int,
  kill_switch bool default false,
  cerebro_id uuid,                     -- referência ao contexto/base de conhecimento
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
```

E **uma** tabela genérica de execuções, que serve pra todos os agentes:

```sql
create table agente_execucoes (
  id uuid primary key,
  agente_id uuid references agentes(id),
  input jsonb,
  output jsonb,
  contexto_usado jsonb,                -- chunks consultados, ferramentas chamadas
  custo_usd numeric,
  latencia_ms int,
  tokens_entrada int,
  tokens_saida int,
  executado_em timestamptz default now()
);
```

**Regra de ouro do banco:** uma tabela de agentes, uma tabela de execuções. Não criar tabela nova por tipo de agente. Escala pra centenas de agentes sem mexer em schema.

### 1.3. Tabelas de memória conversacional (orquestrador + entregáveis)

Além das duas tabelas acima, o sistema tem mais 3 tabelas genéricas que servem **toda a frota de agentes**, não uma por agente:

```sql
-- Histórico cliente↔Chief (uma linha por mensagem)
create table conversas (
  id uuid primary key,
  cliente_id uuid not null,
  agente_id uuid references agentes(id),     -- normalmente o Chief
  papel text not null,                        -- 'humano' | 'chief' | 'sistema'
  conteudo text not null,
  artefatos jsonb,                            -- estruturas embutidas (planos, refs)
  criado_em timestamptz default now()
);

-- Entregáveis versionados (a copy, a página, o relatório, etc)
create table entregaveis (
  id uuid primary key,
  cliente_id uuid not null,
  agente_que_fez uuid references agentes(id), -- worker que produziu
  tipo text not null,                         -- 'copy' | 'pagina' | 'relatorio' | ...
  titulo text,
  conteudo text not null,
  versao int not null default 1,
  parent_id uuid references entregaveis(id),  -- versão anterior (se for revisão)
  criado_em timestamptz default now()
);

-- Memória individual por cliente (espelho banco do `perfis/<cliente>.md`)
create table aprendizados_cliente_agente (
  agente_id uuid references agentes(id),
  cliente_id uuid not null,
  conteudo_md text not null,                  -- mesmo texto do perfis/<cliente>.md
  versao int not null default 1,
  atualizado_em timestamptz default now(),
  primary key (agente_id, cliente_id)
);
```

`APRENDIZADOS.md` (geral, agregado entre clientes) também tem espelho no banco — `aprendizados_agente`. **Banco é fonte da verdade. Disco (`.md`) é espelho versionado em git** — auditável e legível por humano. Sync banco→disco roda 1x/dia ou on-demand pelo painel.

---

## 2. Framework de criação — 5 fases

Todo agente passa por essas 5 fases, nesta ordem:

1. **COLETAR** — entender a necessidade real. Que dor resolve? Quem aciona? Qual o output útil? Conversa com o stakeholder, não chutar.
2. **CRIAR** — montar os 6 MDs do diretório + preencher o AGENT-CARD. Este é o trabalho de design do agente.
3. **CONECTAR** — integrar ao canal de acionamento (painel, Discord, Telegram, WhatsApp, API, etc) e às ferramentas que ele precisa usar.
4. **ENTREGAR** — colocar no ar com `status = em_producao`. Começar com volume baixo e `limite_execucoes_dia` conservador.
5. **EVOLUIR** — coletar feedback, atualizar `APRENDIZADOS.md`, ajustar SYSTEM-PROMPT quando necessário. Nunca termina.

**Velocidade-alvo:** 1 agente por dia. Se está levando semana, o escopo está grande demais — quebrar em agentes menores.

---

## 3. AGENT-CARD — o contrato de 7 campos

Todo agente tem um `AGENT-CARD.md` que responde 7 perguntas. Se você não consegue responder as 7, o agente ainda não está pronto pra ser construído.

```markdown
---
nome: <Nome curto do agente>
squad: <grupo ao qual pertence>
status: <planejado | em_criacao | em_teste | em_producao | pausado>
modelo: <ex: gpt-4o-mini>
modelo_fallback: <ex: gpt-4o>
---

## 1. missão
O que este agente resolve no mundo, em UMA frase.
Ex: "Confirmar se um cliente específico tem acesso liberado a um produto específico."

## 2. entrada
O que o agente precisa receber pra operar.
Ex: "CPF ou e-mail do cliente + nome do produto + canal de origem."

## 3. saída_esperada
Formato EXATO do output (JSON com schema, ou MD com estrutura definida, ou texto com formato).
Ex: "JSON { cliente_id, produto_id, tem_acesso: bool, expira_em: string|null, obs: string }"

## 4. limites
O que o agente NÃO faz (escala pro humano ou passa pra outro agente).
Ex: "Não cadastra acesso novo. Não responde ao cliente. Não confirma pagamento."

## 5. handoff
Pra quem passa quando termina ou trava.
Ex: "Pro agente Propositor quando confirmar ausência. Pra humano se API retornar erro."

## 6. critério_qualidade
Como saber se o output está bom, em termos verificáveis.
Ex: "Responde em <3s. JSON válido. Nunca inventa — se incerto, marca obs=ambiguo e escala."

## 7. métrica_sucesso
O NÚMERO que prova que o agente funciona.
Ex: "Taxa de resposta correta ≥98% em 50 casos de eval."

## campos operacionais
canais: [painel, discord]
ferramentas: [<tool-1>, <tool-2>]
limite_execucoes_dia: 200
custo_estimado_exec: 0.002
```

---

## 4. Evolução Permanente (EPP) — obrigatório

**Premissa dura, não opcional:** todo agente tem que melhorar com feedback. Agente estático não é agente — é prompt.

Se ao desenhar um agente você não consegue responder essas 3 perguntas, **ele não está pronto**:

1. **Como cada execução é logada?** (linha em `agente_execucoes`)
2. **Como o agente recebe feedback?** (👍/👎/edit/comentário do usuário)
3. **Como o feedback afeta execuções futuras?** (aparece como contexto na próxima chamada)

### Mecanismo concreto — duas camadas de memória individual

O feedback vive como **arquivo MD dentro do próprio agente**, em duas camadas:

**Camada 1 — APRENDIZADOS.md (geral, agregado entre clientes)**
- Lições que valem pra qualquer cliente que esse agente atender.
- Crescido por **destilação automática** (cron 1x/dia): quando padrão se repete em 3+ perfis de cliente diferentes, vira lição agregada.
- Exemplo: *"Padrão observado: copy com bullets curtos converte melhor que parágrafos longos em landing pages."*

**Camada 2 — perfis/<cliente_slug>.md (específico por cliente)**
- O que ESTE cliente já me ensinou, individualmente.
- Crescido em tempo real, a cada execução com feedback humano.
- Exemplo: *"Cliente Luiz prefere copy sem exclamação (corrigiu 4x desde 2026-04-12)."*

**Antes de cada execução**, o agente lê:
1. `APRENDIZADOS.md` próprio (geral)
2. `perfis/<cliente_atual>.md` (específico do cliente do caso, se existir)

Ambos entram no system prompt como "memória do agente".

**Depois de cada execução**, o curador valida output. Se humano dá feedback → agente destila em 1 linha → grava em `perfis/<cliente_atual>.md`. Cron diário promove padrões repetidos pra `APRENDIZADOS.md`.

Versionamento vem de graça via git — cada commit nos MDs é uma versão do agente. **Banco é fonte da verdade** (espelho ativo em `aprendizados_agente` + `aprendizados_cliente_agente`); **disco é espelho legível** sincronizado por cron/painel.

### O que fica no banco vs no MD

| Tipo de dado | Onde |
|---|---|
| Log de execução (custo, latência, tokens) | Banco — `agente_execucoes` |
| Histórico cliente↔Chief | Banco — `conversas` |
| Entregáveis versionados (copy, página, etc) | Banco — `entregaveis` |
| Aprendizado geral do agente (entre clientes) | MD — `APRENDIZADOS.md` (espelho banco em `aprendizados_agente`) |
| Aprendizado específico de cada cliente | MD — `perfis/<cliente>.md` (espelho banco em `aprendizados_cliente_agente`) |
| Identidade (personalidade, escopo) | MD — `SOUL.md`, `AGENTS.md` |
| Estado atual (modelo, status, kill switch) | Banco — `agentes` |

---

## 5. Orquestração vs Classificação — dois papéis distintos

Conforme a squad cresce, aparecem dois tipos de agente-meta que **não devem ser confundidos**:

- **Orquestrador** (tipo "Chief") — recebe uma tarefa complexa e **distribui entre agentes especialistas**. Quem chama quem, em que ordem, junta os outputs.
- **Curador/Classificador** — recebe uma **entrada bruta de canal** (Discord, WhatsApp) e classifica pra qual agente/contexto despachar.

Se você precisar de um terceiro papel — tipo "agente que melhora outros agentes" — crie um agente novo explícito (ex: `Mentor`, `Curador de Prompts`). Não sobrecarregue o Orquestrador ou o Curador com essa função.

---

## 6. Checklist antes de criar qualquer agente novo

Ordem obrigatória:

- [ ] Li este MD inteiro
- [ ] Tenho o AGENT-CARD com os 7 campos respondidos
- [ ] Sei responder as 3 perguntas do EPP
- [ ] Identifiquei a categoria e o slug (`/agentes/<categoria>/<slug>/`)
- [ ] Verifiquei se já não existe agente parecido — reutilizar antes de criar novo
- [ ] Olhei o `SYSTEM-PROMPT.md` de pelo menos um agente existente da mesma categoria como referência

Só depois começar a escrever os MDs.

---

## 7. Anti-padrões (o que NÃO fazer)

- ❌ Criar tabela nova no banco pra cada tipo de agente
- ❌ Guardar personalidade/regras no banco (isso é MD, em git)
- ❌ Fazer agente sem `APRENDIZADOS.md` ("a gente adiciona depois")
- ❌ Fazer agente sem estrutura `perfis/` (memória individual por cliente é DNA, não opcional)
- ❌ Worker stateless puro ("aprende depois quando der dor") — viola EPP, vira chatbot caro
- ❌ Misturar `SOUL.md` (personalidade) com `AGENTS.md` (regras operacionais) — são coisas diferentes
- ❌ AGENT-CARD com menos de 7 campos preenchidos
- ❌ Agente sem `handoff` definido — vai travar e ninguém sabe pra onde escalar
- ❌ Agente sem `métrica_sucesso` numérica — não dá pra saber se está funcionando
- ❌ Propor "arquitetura nova" sem ler este MD primeiro
