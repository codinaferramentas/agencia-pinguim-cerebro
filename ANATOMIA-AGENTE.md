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

E contém **6 arquivos MD obrigatórios** + **1 arquivo vivo de aprendizado**:

| Arquivo | O que é |
|---|---|
| `IDENTITY.md` | Nome, emoji, resumo de 1 parágrafo. Cartão de visita. |
| `SOUL.md` | Personalidade, tom de voz, valores, limites de linguagem. É a alma — não confundir com regras operacionais. |
| `AGENTS.md` | Regras operacionais: o que pode/não pode fazer, escopo, permissões. |
| `TOOLS.md` | Ferramentas e APIs conectadas ao agente (lista com link/endpoint/auth). |
| `SYSTEM-PROMPT.md` | Prompt final que vai pro LLM como `role: system`. Consolida o que está nos outros MDs em texto corrido. |
| `AGENT-CARD.md` | Contrato operacional de 7 campos (ver seção 3). |
| `APRENDIZADOS.md` | Arquivo vivo — cada feedback recebido vira uma linha aqui. Lido em toda execução. |

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

### Mecanismo concreto

O feedback vive como **arquivo MD dentro do próprio agente**, não como linha em tabela:

- `APRENDIZADOS.md` no diretório do agente.
- Cada feedback vira uma linha no formato:
  > *"Em [data] o usuário editou [trecho X] para [Y] porque [motivo]. Aplicar padrão similar em [contexto futuro]."*
- **Antes de cada execução**, o agente lê o próprio `APRENDIZADOS.md` e injeta no prompt como "aprendizados anteriores".
- Versionamento vem de graça via git — cada commit no MD é uma versão do agente (v1.0, v1.1, v1.2...).
- **Zero tabela nova** pra feedback. Escala pra centenas de agentes — são só pastas com um MD a mais.

### O que fica no banco vs no MD

| Tipo de dado | Onde |
|---|---|
| Log de execução (custo, latência, tokens) | Banco — `agente_execucoes` |
| Feedback qualitativo (o que melhorar) | MD — `APRENDIZADOS.md` |
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
- ❌ Misturar `SOUL.md` (personalidade) com `AGENTS.md` (regras operacionais) — são coisas diferentes
- ❌ AGENT-CARD com menos de 7 campos preenchidos
- ❌ Agente sem `handoff` definido — vai travar e ninguém sabe pra onde escalar
- ❌ Agente sem `métrica_sucesso` numérica — não dá pra saber se está funcionando
- ❌ Propor "arquitetura nova" sem ler este MD primeiro
