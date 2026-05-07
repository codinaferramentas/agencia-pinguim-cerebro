---
name: portuguesar-br
description: Adapta copy estrangeira (geralmente inglês americano de Hormozi/Brunson/Halbert) para português brasileiro real, preservando o método mas trocando construção sintática, vocabulário e referência cultural. Skill BR universal de edição.
metadata:
  pinguim:
    familia: edicao
    formato: playbook
    clones: [gary-halbert, ben-settle, andre-chaperon]
---

# Portuguesar BR

## Quando aplicar

Mestre americano (Hormozi, Brunson, Halbert, Bencivenga, Schwartz, Kennedy) entregou copy seguindo método dele. Texto sai correto em estrutura mas com sotaque gringo.

Sinais:
- Frases que soam como tradução literal
- Referências culturais americanas ("hot dog stand", "Buick", "$10 bills")
- Construção sintática inglesa ("você consegue ver como isso é diferente?")
- Cifras em USD ou estruturas de "tax bracket" americana

NÃO use quando:
- Mestre é nativo BR (Pedro Sobral, Thiago Finch, Alan Nicolas, Pedro Valerio)
- Cliente pediu manter sotaque gringo proposital (raro, geralmente em produto que se vende como "método americano")

## Receita

7 ajustes sistemáticos:

### 1. Sintaxe — quebrar parataxe estrangeira
- "Você consegue ver como isso é diferente?" → "Tá vendo a diferença?"
- "Eu vou te mostrar exatamente como" → "Vou te mostrar como"
- Sintaxe BR é mais curta, mais oral.

### 2. Pronomes — informalizar
- "Eu vou", "você vai" — em copy BR mais natural usar contração
- "Tu" não — exceto em mercado nordestino específico (cuidado)
- "A gente" no lugar de "nós" em copy informal

### 3. Cifras e referência financeira
- $1,000 → R$ 5.000 (não traduzir 1:1, traduzir AO MERCADO BR equivalente)
- "Six figures" → "R$ 50k/mês" ou "R$ 600k/ano" (referência BR)
- "Seven figures" → "milhão" (referência BR)
- Dolar mensal de assinatura → real mensal contextualizado pro BR

### 4. Referências culturais
- "Hot dog stand" → "carrinho de coxinha"
- "Mom and pop store" → "comércio de bairro"
- "Spring break" → "férias de julho/janeiro"
- "Quarterback" → não tem equivalente direto, troca por imagem BR funcional

### 5. Gírias contextuais
- Linguagem de criador BR: "engajamento", "alcance", "viralizou", "stalkear"
- Evitar gírias gringas traduzidas mal ("FOMO" pode ficar; "literally" não)

### 6. Marca/produto
- Nomes de software: "Excel" tá ok, "Spreadsheet" precisa virar "planilha"
- Referência a marcas — usar marca BR equivalente (Hotmart > ClickFunnels em info-produto)

### 7. Estrutura de página/checkout
- Cartão de crédito americano (sem parcelamento) → BR pede parcelamento visível "12x R$ X"
- "Order Form" → "Finalizar Compra"
- "Shipping" → não aplicável a info-produto BR
- LGPD em vez de "GDPR/CCPA"

## O que NÃO fazer

- Tradução literal palavra-por-palavra. "I want to show you" → "Eu quero te mostrar" → soa robótico. Vai pra "Olha só".
- Sobre-portuguesar até perder o método. Hormozi tem cadência específica — manter. Trocar só sotaque, não estrutura argumentativa.
- Inventar gíria que ninguém usa. Pesquisar vocabulário real da Persona (Cérebro do produto, redes sociais).
- Aplicar gíria SP em mercado de outras regiões (NE, Sul) sem ajustar.
- Esquecer parcelamento. No BR, "12x" é argumento de venda, não detalhe de checkout.

## Clones a invocar

- **Gary Halbert** — voz humana sem filtro, base de copy oral americana — referência do que MANTER
- **Ben Settle** — copy diário em inglês, voz clara sem sintaxe rebuscada — também base do que manter
- **André Chaperon** — gringo que escreve pra mercado de info-produto, conhece sintaxe que viaja — referência de tradução cultural

## Exemplo aplicado

**Input (Hormozi original):**
> "Look, here's the deal. If you're making less than $10K a month, the problem isn't your offer — it's that nobody's seeing your offer. I'm going to show you exactly how to fix that. And I'm not gonna charge you $5,000 for this like the gurus do."

**Output portuguesarado:**
> "Olha só. Se você não tá fazendo R$ 50 mil por mês, o problema não é sua oferta — é que ninguém tá vendo ela. Vou te mostrar exatamente como resolver isso. E não vou cobrar R$ 30 mil por isso, igual os gurus cobram."

**Trocas explícitas:**
- "Look, here's the deal" → "Olha só" (informalidade BR)
- "$10K a month" → "R$ 50 mil por mês" (referência BR)
- "I'm going to show you" → "Vou te mostrar" (contração natural)
- "$5,000... like the gurus do" → "R$ 30 mil... igual os gurus cobram" (referência BR + sintaxe BR)
