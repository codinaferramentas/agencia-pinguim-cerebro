---
name: advisory-completo
description: Skill completa do advisory-board — convoca os 4 conselheiros (Dalio/Munger/Thiel/Naval) cada um aplicando seu framework próprio, e Board Chair consolida com parecer final. Para dilemas estratégicos grandes que merecem 4 perspectivas convergentes.
metadata:
  pinguim:
    familia: advisory
    formato: pipeline-completo
    clones: [board-chair, ray-dalio, charlie-munger, peter-thiel, naval-ravikant]
---

# Advisory Completo — 4 conselheiros + Board Chair

## Quando aplicar

Dilema/decisão estratégica grande que merece **4 perspectivas convergentes** antes de decidir. Não pra qualquer pergunta — só quando o peso é grande (capital, posição competitiva, mudança estrutural, decisão difícil de reverter).

Sinais:
- "Devo entrar em mercado X?"
- "Lançar produto Y agora ou esperar?"
- "Estou em dilema sobre A vs B"
- "Preciso decidir X — me ajuda a pensar"
- Apostas significativas

## Receita — pipeline completo

A Skill orquestra um pipeline de 5 passos:

### 1. **CENARIOS** — Ray Dalio
3 cenários (otimista/central/pessimista) com probabilidades aproximadas. Veredito All Weather: a decisão funciona em qualquer cenário?

### 2. **INVERSION** — Charlie Munger
Reescreva a pergunta: "como essa decisão falha com certeza?" Liste 5-7 caminhos de falha óbvios + antídotos. Verifique incentivos.

### 3. **MONOPOLIO-VS-COMPETICAO** — Peter Thiel
Score 0-10 nas 4 características de monopólio (tecnologia 10x, network effects, escala, branding). Diagnóstico: rota de monopólio ou competição? Recomendação concreta.

### 4. **LEVERAGE** — Naval Ravikant
Esta decisão adiciona leverage permission-less (código + mídia)? Reforça specific knowledge? Ou cria mais dependência de horas humanas?

### 5. **VEREDITO** — Board Chair (consolidação)
Junta os 4 pareceres + roda checklist-pre-decisao (7 perguntas: reversibilidade, custo de errar, quem mais decide, incentivos, diversificação, cenário pessimista, coerência com identidade). Veredito final em 2-3 frases: ir / adiar / reformular.

## Mapeamento bloco → conselheiro (pro AFINIDADE_POR_SQUAD)

| Bloco | Conselheiro |
|---|---|
| CENARIOS | ray-dalio |
| INVERSION | charlie-munger |
| MONOPOLIO-VS-COMPETICAO | peter-thiel |
| LEVERAGE | naval-ravikant |
| VEREDITO | board-chair |

## Output esperado

Markdown com 5 seções (uma por bloco), cada uma com nome do conselheiro + framework aplicado + recomendação concreta. Final: VEREDITO do Board Chair em 2-3 frases.

## O que NÃO fazer

- Convocar os 4 pra decisão tática/operacional pequena (ex: "qual cor de logo?"). Skill `diagnostico-estrategico` filtra esses casos.
- Aceitar pareceres vagos. Cada conselheiro deve aplicar seu framework com nome explícito (Cenário Pessimista, Caminho de Falha #3, Score Monopólio, etc).
- Pular o Board Chair. Sem consolidação, são 4 opiniões soltas — pior que 1 só.
