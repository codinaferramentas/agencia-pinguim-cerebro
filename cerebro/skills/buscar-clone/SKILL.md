---
name: buscar-clone
description: Carrega o SOUL e método de um Clone (pessoa real clonada como fonte de voz) quando o agente precisa aplicar voz, método ou opinião específica. Skill universal.
metadata:
  pinguim:
    familia: meta
    formato: tool-helper
    clones: []
---

# Buscar Clone

## Quando aplicar

- Skill referenciou Clone via `clones: [...]` e o agente precisa carregar o conteúdo
- Cliente perguntou explicitamente "o que Hormozi diria sobre X?"
- Briefing pede aplicação de método específico de pessoa nominada (ex: "monta no estilo Halbert")

NÃO use quando:
- Cliente perguntou sobre o produto Pinguim (use `buscar-cerebro`)
- Cliente perguntou sobre persona do comprador (use `buscar-persona`)
- Cliente quer só fato genérico (use conhecimento próprio do LLM)

## Receita

1. **Identifica os Clones a carregar.** Vem da Skill em uso (`metadata.pinguim.clones`) OU do briefing humano. Se múltiplos, carrega todos.

2. **Carrega SOUL.md de cada Clone** via `pinguim.produtos` + `cerebro_fontes_chunks` (Cérebro do Clone). SOUL contém: tom de voz, método central, frases típicas, anti-padrões.

3. **Distribui papel se múltiplos Clones.** Cada Clone tem função específica na entrega — Skill define isso. Ex: Halbert no opening, Hormozi na oferta, Bencivenga nos bullets.

4. **Mantém vozes separadas no output.** Quando trabalho final tem trechos de Clones diferentes, identifica internamente quem escreveu o quê (Chief consolida depois).

5. **Cita Clone na resposta interna ao Chief** (não pro cliente). Ex: "[Hormozi: stack de bônus] [Halbert: opening] [Bencivenga: bullets]".

## O que NÃO fazer

- Misturar vozes sem propósito. Halbert + Hormozi no mesmo parágrafo sem distinção vira ruído.
- Carregar Clone sem que Skill ou briefing tenha pedido. Custo de contexto sem benefício.
- Tratar Clone como agente. Clone é fonte de voz — não tem missão única, não dá feedback, não roda EPP próprio.
- Inventar método quando SOUL do Clone for fraco. Se SOUL é raso, declarar "Clone X tem material limitado, output será genérico" — não compensar inventando.

## Clones a invocar

Skill universal — não invoca Clone (ela carrega Clones).

## Exemplo aplicado

**Skill em uso:** `anatomia-pagina-vendas-longa` (referencia 6 Clones)

**Buscar-clone executa:**
1. Carrega SOUL de Halbert, Bencivenga, Schwartz, Hormozi, Kennedy, Benson
2. Distribui papéis conforme Skill: Halbert→opening+P.S., Hormozi→oferta, etc
3. Passa pacote ao Chief que delega trecho por trecho
