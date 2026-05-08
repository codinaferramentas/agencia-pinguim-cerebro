---
name: escrever-quadro-decisao
description: Estrutura quadro de decisão (perdas e ganhos, comparativo X vs Y, tradeoff matrix, scorecard) em tabela markdown bem-formatada quando o pedido pede análise estruturada multi-dimensão. Usada por advisory-board, finops e qualquer squad que entregue framework de decisão visual. Garante que o output renderize como tabela em HTML, não como prosa ilegível.
metadata:
  pinguim:
    familia: advisory
    formato: tabela-markdown
    clones: [charlie-munger, ray-dalio, naval-ravikant]
---

# Escrever Quadro de Decisão

## Quando aplicar

Pedido do cliente envolve **múltiplas dimensões comparadas** que precisam ser olhadas lado a lado. Sinais no pedido:

- "quadro de perdas e ganhos"
- "comparativo entre X e Y"
- "tradeoff matrix"
- "framework de decisão"
- "tabela de prós e contras"
- "scorecard"
- "matriz de avaliação"
- "devo X ou Y?" com análise estruturada esperada
- "compare A com B em [dimensões]"

NÃO use esta Skill quando:
- A decisão é linear simples (A é melhor que B sem nuance) — use lista normal
- O pedido é narrativo/conselho ("o que você acha?") — sem estrutura tabular
- Tem só 1 dimensão pra avaliar — vira parágrafo, não tabela

## Por que isso importa (regra dura)

O entregável vai virar HTML formatado em `/entregavel/<id>` (V2.10). O parser de markdown do template só renderiza tabela quando vem **markdown table válido em GFM**. Se o mestre escreve quadro como prosa com travessões ou listas aninhadas, vira ilegível no HTML — sócios não conseguem ler, decisão não fica clara visualmente.

**A tabela é o entregável.** Sem ela, o quadro perdeu a função.

## Receita — anatomia da tabela

### Estrutura mínima exigida

```markdown
| <Dimensão> | <Cenário 1> | <Cenário 2> | <Cenário N> |
|---|---|---|---|
| Linha 1 | célula | célula | célula |
| Linha 2 | célula | célula | célula |
```

**3 partes obrigatórias:**
1. **Linha cabeçalho** — primeira coluna é a **dimensão de análise** (Skill técnico, Custo real, Leverage, etc), demais colunas são **cenários/opções comparadas**
2. **Linha separador** — `|---|---|---|` com tantos `---` quanto colunas. Sem isso o parser não reconhece como tabela
3. **Linhas de dados** — cada linha = uma dimensão avaliada. Célula vazia vira `—` (travessão), nunca em branco

### Padrões por tipo de quadro

#### Quadro de perdas e ganhos (decisão binária)

3 colunas além da dimensão: GANHO se sim, PERDA se sim, PERDA se não. Não usar "GANHO se não" — gera redundância.

```markdown
| Dimensão | 🟢 GANHO se contratar | 🔴 PERDA se contratar | 🔴 PERDA se NÃO contratar |
|---|---|---|---|
| Skill técnico | O que essa pessoa faz que ninguém faz hoje | Que lacuna técnica permanece | Que gargalo continua aberto |
| Custo real | — | Salário + encargos + onboarding | Custo de oportunidade |
```

#### Comparativo X vs Y (escolha entre opções)

2 colunas (uma por opção) + coluna final "Vencedor" ou "Peso" se quiser ranquear.

```markdown
| Critério | Opção A | Opção B | Peso |
|---|---|---|---|
| Custo inicial | R$ 5k | R$ 12k | A |
| Retorno em 12 meses | R$ 30k | R$ 80k | B |
```

#### Tradeoff matrix (multi-dimensão sem vencedor único)

Sem coluna de vencedor — cada cenário tem força em dimensão diferente. Decisão é qualitativa.

```markdown
| Dimensão | Cenário Conservador | Cenário Moderado | Cenário Agressivo |
|---|---|---|---|
| Risco de perda | Baixo | Médio | Alto |
| Upside potencial | 1.5x | 3x | 8x |
| Reversibilidade | Alta | Média | Baixa |
```

#### Scorecard (notas por dimensão)

Cada linha tem nota numérica (1-5 ou 1-10) por cenário. Última linha é soma.

```markdown
| Critério | Opção A | Opção B |
|---|---|---|
| Aderência ao plano | 8 | 5 |
| Custo de execução | 6 | 9 |
| Risco regulatório | 7 | 4 |
| **Total** | **21** | **18** |
```

## Regras de formatação rígidas

1. **Sempre incluir o separador** `|---|---|...|`. Sem ele, o parser GFM não reconhece como tabela. Erro mais comum.
2. **Mesmo número de colunas em toda linha.** 4 colunas no header → 4 em todas. Pipe extra ou faltando quebra a tabela.
3. **Célula vazia = `—`** (travessão U+2014), nunca em branco. Branco quebra contagem de colunas em alguns parsers.
4. **Bold dentro de célula com `**texto**`** — funciona, parser preserva.
5. **Sem quebras de linha dentro de célula.** Cada célula é uma linha lógica. Use frases curtas. Se precisar de detalhe, ponto-e-vírgula como separador.
6. **Headers em CAIXA ALTA opcional** mas dá hierarquia visual no HTML renderizado (CSS aplica `text-transform: uppercase` em `<th>`).
7. **Emoji no header de coluna** funciona e dá clareza visual (🟢 ganho, 🔴 perda, 🟡 neutro). Use com parcimônia — 1 emoji por coluna é elegante, 3 vira ruído.
8. **Antes da tabela, 1-2 linhas de contexto.** "A coluna de PERDAS pesa 2x", "Preencham para X e para Y", etc. Dá instrução de leitura.
9. **Depois da tabela, 1-2 linhas de síntese.** "Conclusão: vencedor é A em 4 de 6 critérios" ou "Recomendação: cenário Moderado." Não deixa o leitor sem amarração.

## O que NÃO fazer

- **Quadro como prosa com travessões.** "Skill técnico — ganho é X, perda é Y..." Vira parágrafo ilegível, perde função. Sempre tabela.
- **Lista aninhada como substituto de tabela.** "Skill técnico:\n  - Ganho: X\n  - Perda: Y". Funciona em terminal mas vira bagunça em HTML formatado.
- **Tabela com 1 coluna.** Vira lista. Use lista markdown.
- **Mais de 6 colunas.** Vira ilegível. Quebra em 2 tabelas temáticas.
- **Mais de 10 linhas sem agrupamento.** Quebra em sub-tabelas com `### Sub-categoria` antes de cada.
- **Tabela sem linha separador `|---|---|`.** Não renderiza. Erro #1.
- **Misturar colunas de natureza diferente** (1 numérica, 1 textual, 1 booleana) sem indicação visual. Confunde leitura.

## Clones a invocar

- **Charlie Munger** — Inversion + Worldly Wisdom. Mestre de quadros de "como isso pode dar errado". Coluna de PERDAS pesa 2x na visão dele.
- **Ray Dalio** — 3 cenários (best/base/worst). Mestre de tradeoff matrix com probabilidade.
- **Naval Ravikant** — leverage e long-term thinking. Mestre de scorecard com peso assimétrico (uma coluna pesa 10x outra).

Quando há quadro complexo, distribuir: Munger avalia o lado das perdas (inversion), Dalio estrutura cenários (probabilidade), Naval avalia leverage (alavancagem). Cada um pode escrever 1 tabela complementar.

## Exemplo aplicado

**Pedido:** "quero um quadro de perdas e ganho pra decidir se contrato funcionário X ou Y"

**Saída esperada:**

```markdown
### QUADRO DE PERDAS E GANHOS — Framework de Decisão

Preencham cada célula para X e para Y. **A coluna de PERDAS pesa 2x**
(Munger: "evitar estupidez é mais rentável que buscar brilhantismo").

| Dimensão | 🟢 GANHO se contratar | 🔴 PERDA se contratar | 🔴 PERDA se NÃO contratar |
|---|---|---|---|
| **Skill técnico** | O que essa pessoa faz que ninguém na equipe faz hoje | Que lacuna técnica permanece mesmo contratando | Que gargalo operacional continua aberto |
| **Custo real** (não só salário) | — | Salário + encargos + onboarding + gestão + custo de erro nos primeiros 90 dias | Custo de oportunidade de não ter a posição preenchida |
| **Leverage** (Naval) | Essa pessoa cria ativos que escalam sem ela? (código, processos, conteúdo) | Cria dependência — só ela sabe fazer, só ela opera | Quantas horas/semana sócios gastam fazendo o que essa pessoa faria |
| **Incentivos** (Munger) | Incentivos dela alinhados com os da empresa | Onde os incentivos divergem (CLT estável vs vocês precisam de guerra) | — |

**Recomendação:** preencham as 4 dimensões. Se 3+ linhas mostram que a PERDA-se-contratar pesa mais que GANHO-se-contratar, a contratação está errada — não importa quão técnico é o candidato.
```

**Por que essa saída funciona:**
- Tabela markdown válida (header + separador + 4 linhas de dados, mesmo número de pipes)
- Bold dentro de célula preserva no HTML
- Emojis no header dão clareza visual sem virar ruído
- Célula vazia usa `—` (travessão), não em branco
- Contexto antes (instrução de leitura) e síntese depois (recomendação)
- Vai renderizar como `<table>` no HTML do entregável V2.10

## Auto-checagem antes de entregar

Antes de devolver o output:

1. ✓ Tem linha separador `|---|---|...|` com tantos hifens quanto colunas?
2. ✓ Toda linha tem mesmo número de pipes que o header?
3. ✓ Células vazias estão como `—`, não em branco?
4. ✓ Tem 1-2 linhas de contexto ANTES da tabela?
5. ✓ Tem 1-2 linhas de síntese DEPOIS da tabela?
6. ✓ Tem entre 2-6 colunas e 2-10 linhas (range legível)?

Se algum falhou, refaz antes de entregar. Tabela quebrada = entregável quebrado.
