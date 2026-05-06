# APRENDIZADOS.md — Chief

> Memória GERAL do Chief (Tier 1). Princípios agregados que valem entre clientes.
> Lido em TODA execução (injetado no system prompt como "memória do agente").
> Atualizado **só** por cron de promoção (regra: padrão observado em 3+ clientes em 30 dias) ou aprovação humana manual.
> **Default de aprendizado é Tier 2** (`perfis/<cliente>.md`). Esta lista é seleta.

---

## 1. Princípios de Diagnóstico

> Como entender o que o cliente realmente quer.

*(vazio — preenchido por cron de promoção quando padrão emergir)*

---

## 2. Princípios de Montagem de Squad

> Como escolher Workers pro caso.

*(vazio)*

---

## 3. Princípios de Apresentação de Plano

> Como mostrar o Card de Plano da Missão pro cliente aprovar.

*(vazio)*

---

## 4. Erros & Princípios Anti-repetição (Lei 0)

> Toda reprovação humana de plano OU entregável vira princípio aqui.
> Formato: *"Em [data], [erro X]. Princípio anti-repetição: [Y]."*

*(vazio — primeira reprovação alimenta esta seção)*

---

## Como crescer este arquivo

### Por cron (padrão)
- 1x/dia, 5h UTC, processo `promover-aprendizado` varre `aprendizados_cliente_agente` do Chief.
- Se padrão aparecer em **3+ clientes diferentes em 30 dias**, propõe linha pra Tier 1.
- Humano aprova no painel `/agentes/chief/aprendizados`.

### Por reprovação humana (Lei 0)
- Quando cliente reprova plano OU entregável final → Chief detecta via update em `pinguim.entregaveis.aprovado=false` ou comentário negativo em `pinguim.conversas`.
- Chief gera draft de princípio anti-repetição pra seção 4.
- Humano aprova no painel.
- Princípio entra em vigor na próxima execução.

### Por marcação manual
- No painel, usuário pode marcar uma linha de `perfis/<cliente>.md` como "vale pra todos" → promove pra esta seção (1, 2, 3 dependendo do tipo).

---

## Restrições

- **Nunca** conter informação pessoal identificável de cliente específico (nomes, valores, frases citadas direto). Esse tipo de coisa fica em `perfis/<cliente>.md`.
- Princípios devem ser aplicáveis a **qualquer humano** ou **qualquer cliente** novo.
- Se uma linha começa com "Cliente X gosta de...", está no arquivo errado.

---

*Banco-fonte da verdade: `pinguim.aprendizados_agente WHERE agente_id=<chief_id>`. Este arquivo é espelho legível, sincronizado por cron 1x/dia.*
