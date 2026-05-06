# Bloco 0.5 — Conselho Final do Chief

**Data:** 2026-05-05
**Status:** 8 conselheiros revisaram desenho fechado. **9 ajustes identificados** antes de partir pra implementação.

---

## Como o conselho funcionou

8 conselheiros revisitaram o desenho do Chief com as 8 decisões fechadas (orquestração híbrida, gpt-5, memória individual ativa desde v1, conversas+entregaveis centralizados, aprovação humana, identificação de solicitante, EPP 3 leis, top-down). **Não revisitaram decisão fechada** — só apontaram furos e refinamentos dentro delas.

**Quem opinou:**
- Estratégia: Dalio, Munger, Naval
- Time/execução: Lencioni, Sinek
- Construtor de agentes: Alan Nicolas, Pedro Valerio, Thiago Finch

---

## 9 furos identificados (e o ajuste pra cada um)

### 1. Sem Lei 0 — "erro vira princípio anti-repetição"
**Quem viu:** Dalio + Munger.
**Furo:** EPP tem 3 leis sobre output **positivo** (captação, output aprovado, feedback). **Zero sobre erro.** Quando Chief monta squad errada ou Worker entrega errado, o aprendizado some.
**Ajuste:** Adicionar **4ª seção fixa no template de APRENDIZADOS.md** de todo agente: "Erros & Princípios Anti-repetição". Reprovação humana detecta, agente propõe princípio, humano aprova.

### 2. Tier de aprendizado sem regra de promoção
**Quem viu:** Munger.
**Furo:** Sem regra clara, agente joga tudo em `APRENDIZADOS.md` (geral) "pra facilitar". Em 3 meses, princípios universais ficam misturados com coisas específicas do Luiz. **Risco:** vazamento entre clientes futuros.
**Ajuste:** Default = `perfis/<cliente>.md` (específico). Promoção pra `APRENDIZADOS.md` (geral) **exige aparecer em 3+ clientes em 30 dias**. Cron destila com regra dura.

### 3. Identificação do solicitante por mensagem é fricção
**Quem viu:** Naval.
**Furo:** Confirmar identidade toda mensagem é ritual sem alavanca. 95% das conversas vão ser do André ou Luiz logado.
**Ajuste:** Identificação **por sessão**. Login do painel já identifica. Chief assume usuário logado. Só pergunta em: (a) primeira mensagem do dia, (b) tom muda drasticamente, (c) usuário fala explicitamente "aqui é a Maria do Luiz".

### 4. Workers sem `proposito` declarado
**Quem viu:** Sinek.
**Furo:** Memória individual nos Workers é DNA. Mas se Worker não declara um Why, ele vira chatbot mesmo com memória. *"Existo pra gerar copy"* não basta.
**Ajuste:** Campo `proposito` **obrigatório no AGENT-CARD** de todo Worker. 1 frase: *"Existo pra [verbo + objeto + cliente] e meu sucesso se mede em [métrica]."* Se não couber em 1 frase, Worker não nasce.

### 5. Dissenso Worker × Chief sem protocolo
**Quem viu:** Lencioni + Munger + Dalio.
**Furo:** Caso 4 (Worker vê contradição entre briefing do Chief e seu APRENDIZADOS) **não tem protocolo**. Sem isso, Worker vira yes-man (silencia) ou deadlock (recusa). Munger: *"Dissenso silencioso = pior modo de falha possível."*
**Ajuste:** **Protocolo de Dissenso formal.** Worker detectou contradição → **pausa execução** → devolve `nota_de_dissenso` pro Chief com 3 campos:
- O que foi pedido
- O que aprendizado dele diz
- Recomendação concreta

Chief decide. Decisão registra em `conversas` como evento `dissenso_resolvido`. Resultado alimenta APRENDIZADOS do Chief (Lei 0 ativa aqui).

### 6. Multi-tenant não desenhado
**Quem viu:** Alan Nicolas.
**Furo:** Hoje só tem Pinguim. Mas framework é vendável (`{Cliente} OS`). Quando entrar cliente número 2, **`pinguim.conversas` vaza histórico do Pinguim** se não tiver isolamento.
**Ajuste:** Toda tabela nova (`conversas`, `entregaveis`, `aprendizados_cliente_agente`) **nasce com coluna `tenant_id`** + RLS. Custo agora: 5 minutos. Custo depois: refactor doloroso.

### 7. Catálogo de 227 agentes sem RAG por capability
**Quem viu:** Pedro Valerio.
**Furo:** Chief vai estourar contexto se ler 227 AGENT-CARDs em todo turno. gpt-5 ia gastar 50k tokens só descobrindo o time dele.
**Ajuste:** Tabela `pinguim.agentes` ganha JSON `capabilities` + tags. Chief faz **RAG sobre capabilities** (igual ao RAG do Cérebro), recebe top N agentes relevantes pro briefing. Reusa infra existente.

### 8. Falta artefato visual do plano no painel
**Quem viu:** Thiago Finch.
**Furo:** Se cliente vê só chat textual, perdeu a peça de venda. Pinguim OS é diferenciado pelo **visual**.
**Ajuste:** Toda execução do Chief gera **Card "Plano da Missão"** no painel com 3 zonas:
- **Diagnóstico** (o que entendi)
- **Squad montada** (avatares dos workers)
- **Próximos passos**

Botão único Aprovar/Ajustar. Quando squad executa: **animação Squad pixel-art** (já existe — `squad-animation.js`) mostra workers andando entre departamentos.

### 9. Entregáveis sem schema estruturado
**Quem viu:** Pedro Valerio.
**Furo:** "Melhora item 3" só funciona se VSL foi gerado com **estrutura indexável** (lista numerada, JSON), não blob de texto. Sem schema, refinamento vira impossível.
**Ajuste:** **Schema de saída obrigatório** pros Workers desde dia 1. Não pode entregar texto cru — tem que entregar estrutura (markdown com headers numerados ou JSON tipado).

---

## Estresse — 4 casos reais (resumo)

### Caso 1 — VSL pro ProAlt (simples)
Chief carrega memória → Cérebro do ProAlt → monta plano (Copywriter + Storyteller + Revisor + Designer) → mostra Card → Luiz aprova → workers executam paralelo onde dá → Chief consolida → entrega versão 1 em `entregaveis`.

### Caso 2 — "melhora item 3"
Chief busca último entregável tipo VSL desse cliente. **Funciona só se** VSL foi gerada com estrutura indexável (Furo 9). UX: Chief mostra "estou usando a VSL de [data]. É essa?" — confirma sem chutar.

### Caso 3 — "preciso aumentar conversão"
Não é tarefa, é dor. Chief não joga pro Copywriter direto. **Diagnostica.** Propõe 3 hipóteses baseadas em Cérebro + APRENDIZADOS. Luiz escolhe ou redireciona. Padrão entra como playbook em APRENDIZADOS do Chief (Furo 1 ativo).

### Caso 4 — Conflito Worker × Chief
Copywriter vê Briefing pediu 5000 palavras + APRENDIZADOS_LUIZ.md diz que ele prefere 1000. **Pausa, devolve nota_de_dissenso** com 3 campos. Chief decide. Decisão alimenta APRENDIZADOS do Chief: se aprovou redução, princípio "Worker pode reduzir escopo se aprendizado justifica". Se manteve as 5000, princípio "instrução explícita do cliente sobrescreve aprendizado tácito".

---

## O que está bem e não precisa mexer

- Padrão híbrido Supervisor+Workers — acertado.
- Não importar framework (CrewAI/LangGraph) — acertado.
- OpenAI gpt-5 + fallback + prefixo `provedor:modelo` — resolve agnosticismo.
- **Memória individual ativa desde v1 — decisão que separa Pinguim OS de chatbot. Não recuar.**
- Versionamento `parent_id + versao` em entregáveis — correto.
- Aprovação humana entre plano e execução — lei dura, manter.
- Top-down a partir do Chief — ordem certa.

---

## Recomendação coletiva final

> "Pode partir pra implementação **com 9 ajustes incorporados antes de escrever a primeira linha de código** — todos cabem dentro das decisões fechadas, nenhum exige refazer arquitetura. Os mais críticos são (a) protocolo de dissenso Worker×Chief, (b) `tenant_id` desde já, (c) RAG sobre capabilities dos 227 agentes, e (d) card visual do plano no painel. Sem esses 4, o Chief funciona pro Pinguim mas trava no cliente número 2 ou no agente 50. Com eles, o desenho é vendável e escalável."

---

## O que muda na implementação dos próximos blocos

### Bloco 1 — 7 MDs do Chief (modificado)
- AGENT-CARD do Chief inclui `proposito` + `protocolo_dissenso`
- Template de `APRENDIZADOS.md` ganha 4ª seção "Erros & Princípios Anti-repetição"
- Cria `perfis/luiz.md` + `perfis/micha.md` + `perfis/pedro.md` + `perfis/andre-codina.md` (todos vazios mas estruturados)

### Bloco 2 — Banco (modificado)
- Toda tabela nova nasce com `tenant_id`
- `pinguim.agentes` ganha JSON `capabilities`
- Tabela `pinguim.dissensos` (registro de eventos Worker×Chief)
- RLS por tenant em tudo

### Bloco 3 — Loader (modificado)
- Identificação por sessão (não por mensagem)
- RAG sobre capabilities pra montar briefing do Chief
- Cron diário pra promoção tier 2 → tier 1 com regra dura

### Bloco 4 — Painel (modificado)
- Card "Plano da Missão" com 3 zonas
- Reusa `squad-animation.js` durante execução
- Botão único Aprovar/Ajustar

### Bloco 5 — Validação
- Casos de teste 1-4 dos conselheiros viram **suite de validação obrigatória**

---

## Próximo passo

Bloco 1: auditar e completar os 7 MDs do Chief com tudo isso incorporado. Vou começar.
