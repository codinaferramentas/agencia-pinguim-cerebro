# Brief original do Mission Control

> **Contexto histórico.** Este é o brief que originou a direção "Mission Control" do projeto Pinguim em 2026-04-20.
> Foi entregue por um consultor externo como avaliação pontual.
> A partir desta data, os conceitos aqui descritos passaram a ser decisões nossas — os termos "padrão Ravi", "governança Ravi" etc. não existem mais: virou "card do agente", "governança Pinguim", etc.
>
> Mantido no repositório como referência de origem. Não é documento vivo.

---

## 1. Mudança de direção do projeto

A Pinguim não deve seguir como uma estrutura solta, difícil de controlar, nem como um monte de agentes desconectados.

A nova direção é:

### A Pinguim deve ser construída como um sistema chamado:
### **Mission Control Pinguim**

Ou seja:
- um painel central de operação
- com mini-squads por caso de uso
- com agentes governados
- com visibilidade de tarefas, gargalos, evolução e backlog
- com capacidade de expansão gradual

**Não estamos construindo "um monte de agentes" — estamos construindo um modelo operacional controlável.**

---

## 2. Princípio central do projeto

A pergunta certa não é "quantos agentes vamos criar?" — é **"como o CEO vai entender, controlar, priorizar e evoluir essa operação?"**

O sistema precisa nascer com: visão executiva, visão operacional, backlog priorizável, evolução por etapas, governança na criação de agentes.

---

## 3. O que o produto precisa ser

Quando o CEO entrar no Mission Control, ele precisa conseguir responder rapidamente:

1. **O que está acontecendo agora?** — quais tasks entram, quais squads operam, o que está em andamento, o que travou
2. **O que já existe de verdade?** — quais agentes/squads já estão em produção, o que ainda é só mapa
3. **O que vem depois?** — capacidades priorizadas, próxima fase, mapa estratégico virando backlog
4. **Onde está a perda de eficiência?** — retrabalho, gargalos, falhas recorrentes, tasks que voltam demais
5. **Como novos agentes entram no sistema?** — forma controlada, com critério, com checklist, com governança

---

## 4. Arquitetura — mini-squads por caso de uso

A unidade certa de implantação é **mini-squads por caso de uso**.

Primeiros mini-squads do V1:

### 1. Squad Operacional (Suporte Operacional Pinguim)
- suporte operacional
- consulta de dados
- checagem de status
- validação de cadastro
- liberação de acesso
- tratamento de demandas repetitivas de operação

### 2. Squad Low Ticket
- estruturação de campanha
- aquecimento de grupo
- copy do fluxo
- roteiro das aulas/lives
- construção de CTA
- apoio à conversão

---

## 5. Como pensar os agentes

Cada agente deve existir dentro de um squad, com função clara. Mínimo obrigatório por agente:

- **missão**
- **entrada**
- **saída esperada**
- **limites**
- **handoff**
- **critério de qualidade**
- **métrica de sucesso**

**Regra importante:** não criar um padrão paralelo ao framework estrutural que já existe. Manter a espinha dorsal, reaproveitar a base validada, acoplar a camada funcional acima dela.

Ou seja: **não substituir a estrutura já existente — organizar melhor a função de cada agente dentro dela.**

---

## 6. Tratamento de "mentes" ou referências

Conselheiros, clones ou cérebros de apoio **não viram agente novo para cada referência**. A separação correta é:

- **agente** = função operacional
- **mente de referência** = apoio de raciocínio/repertório

Referências podem entrar como `cerebro/conselheiros/<nome>.md` ou similares, mas não explodem a quantidade de agentes.

---

## 7. As 6 telas do Mission Control

1. **Operação** — aba viva: entrada → triagem → execução → revisão → conclusão → gargalos
2. **Squads** — squads ativos, objetivo, agentes, status/maturidade, dependências
3. **Roadmap** — capacidades do mapa estratégico, o que está priorizado, fases de expansão
4. **Evolução** — o que está planejado, em criação, em teste, em produção
5. **Logs / Qualidade** — falhas recorrentes, retrabalho, gargalos, top performers
6. **Factory de Agentes** — como novas capacidades viram agentes, checklist, governança, publicação em teste/produção

---

## 8. Como o mapa estratégico deve ser tratado

O HTML/mapa da Pinguim **não é backlog executável bruto** — é **mapa estratégico de capacidades**.

Ele orienta o universo da Pinguim, ajuda a visualizar expansão, serve para priorização. Não se confunde com lista direta de implementação. O projeto precisa ter uma camada que transforma o mapa em backlog priorizável, fases, capacidades em teste, capacidades ativas.

---

## 9. Governança na criação de agentes

### V1
Criação controlada, não livre dentro do painel. Foco em operar, priorizar, acompanhar, medir, evoluir o que existe. Criação guiada e validada.

### V2
Pode existir criação mais guiada dentro do painel, com fluxo assistido. Mas no V1 o foco não é liberdade total — é governança operacional.

---

## 10. Stack recomendado

- **Supabase** — persistência, logs, entidades, histórico, squads, agentes, eventos
- **Painel próprio** — visão do CEO, visão operacional, backlog, evolução, qualidade
- **OpenClaw** — orquestração de agentes, conversação operacional, rotinas, coordenação assistida

---

## 11. Regras de implementação

1. Replicabilidade acima de tudo
2. Estrutura acima de improviso
3. Velocidade acima de perfeição
4. Governança acima de liberdade total
5. Caso de uso real antes de escala
6. Menos "cardápio de ideias", mais direção

---

## 12. Resumo executivo

**A Pinguim não deve ser construída como um amontoado de agentes.
Ela deve ser construída como um Mission Control com squads, governança, backlog, operação e evolução visível.**
