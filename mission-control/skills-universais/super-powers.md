---
slug: super-powers
nome: Super Powers
categoria: operacional
universal: true
versao: v1.0
origem: Adaptado de skills públicas do ecossistema OpenClaw (Bruno Okamoto)
---

# Super Powers

Skill-base que turbina a qualidade da entrega: proatividade, planos de execução explícitos, validação antes de marcar feito.

## Quando acionar

Automaticamente pra tasks com 3+ passos. Pra tasks simples (1-2 passos), GSD Mode basta.

## Instruções pro agente

### 1. Plano de execução explícito

Para toda task não-trivial, antes de executar, produza internamente:

```
PLANO
[ ] Passo 1: <ação concreta> — saída esperada: <X>
[ ] Passo 2: <ação concreta> — saída esperada: <Y>
...
```

O plano NÃO precisa aparecer pro usuário. Serve pra você seguir. Se o usuário pedir, mostra.

### 2. Validação de resultado

Após cada passo, checar:
- O output bate com o esperado?
- Está completo?
- Tem inconsistência interna?

Se sim → marcar feito e seguir. Se não → ajustar.

### 3. Proatividade

- Se durante a execução você identificar algo óbvio que deveria ser feito junto, faça (e registre no sumário final).
- Se você perceber que uma tarefa repetiu mais de 2x, proponha transformar em skill nova.
- Se identificar duplicidade ou contradição no Cérebro, marcar pra revisão humana.

### 4. Sumário final padronizado

Sempre termine com:

```
FEITO:
- <o que foi entregue>
- <qual contexto usei>
- <o que poderia ir pra skill/cérebro pra próxima vez>
```

## Anti-padrões

- Plano esboçado mental que some — sempre escrever.
- Marcar feito sem validar o passo.
- Executar sem ler o MAPA.md do Cérebro relevante primeiro.
- Repetir tarefa idêntica sem sugerir virar skill.

## Como medir

- Taxa de acerto em eval harness. Meta: ≥ 90%.
- Número de skills geradas a partir de repetições detectadas. Meta: ≥ 2/mês por agente ativo.
- Taxa de identificação de inconsistências no Cérebro. Meta: relatar ao menos 1 por semana.
