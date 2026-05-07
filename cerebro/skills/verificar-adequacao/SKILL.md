---
name: verificar-adequacao
description: Verifier que avalia se o output entregue tem formato e estrutura adequados ao tipo de pedido feito, sem aplicar regra hardcoded. Skill universal — Verifier de adequação no EPP Camada 1.
metadata:
  pinguim:
    familia: meta
    formato: auditoria
    clones: []
---

# Verificar Adequação

## Quando aplicar

EPP Camada 1 — sempre, automaticamente, depois que o Chief consolida output do trabalho criativo. Esta Skill **não usa regra fixa** ("X tem N seções, Y tem Z palavras") — pergunta ao gpt-4o-mini se o output bate com o que normalmente se entrega pra esse pedido.

## Receita

1. **Recebe** o pedido literal do cliente + output gerado.

2. **Monta prompt de verificação** pro gpt-4o-mini:

```
Você é auditor de adequação de output. NÃO julgue qualidade do conteúdo, 
apenas adequação ao formato esperado.

Cliente pediu: <pedido_literal>
Output entregue: <output_consolidado>

Pergunte a si mesmo:
1. O formato do output corresponde ao que normalmente se entrega pra 
   esse tipo de pedido?
2. A estrutura do output cobre os blocos funcionais que o formato 
   requer?
3. Há blocos visivelmente faltando, ou muito subdesenvolvidos?

Não invente regras de quantidade ("deve ter X seções"). Avalie pelo 
sentido geral do que se entrega na indústria.

Retorne JSON:
{
  "adequado": true|false,
  "pontos_fracos": ["..."],
  "blocos_faltando": ["..."],
  "recomendacao": "aprovar" | "refazer com nota"
}
```

3. **Se `adequado: true`** → output aprovado, segue pra entrega.

4. **Se `adequado: false`** → dispara Camada 2 (Reflection loop) com a nota do Verifier. Mestre/Chief refaz UMA vez incorporando os pontos fracos.

5. **Se reflexão também `false`** (cap MAX_REFLECTIONS=1) → entrega o melhor output que tem + flag interno "verificador-rejeitou-2x" pra log.

## O que NÃO fazer

- **Hardcodar regras de quantidade.** "Página de venda tem 12 seções" → ERRADO. Cada Persona/Schwartz/contexto pede ordem diferente. Verifier deduz, não decide por regra.
- Julgar qualidade do conteúdo. "Headline está fraca" não é trabalho desta Skill — é trabalho do Reflection (qualidade subjetiva). Adequação ≠ qualidade.
- Travar execução em loop. Cap rígido: 1 reflexão. Mais que isso, custo/latência explode.
- Reprovar por estilo. Verifier não opina sobre tom. Só sobre se a forma bate com o pedido.

## Clones a invocar

Skill universal — não invoca Clone (Verifier é gpt-4o-mini puro, sem persona).

## Exemplo aplicado

**Pedido:** "copy pra página de venda do Elo"
**Output gerado:** 4 blocos curtos (GANCHO/DESENVOLVIMENTO/VIRADA/CTA)

**Verifier deduz:**

```json
{
  "adequado": false,
  "pontos_fracos": [
    "Output tem estrutura típica de VSL curta ou texto de anúncio, 
     não de página de venda longa",
    "Falta apresentação do produto, prova social, oferta com stack, 
     garantia, FAQ"
  ],
  "blocos_faltando": [
    "above the fold com headline + sub + CTA visível",
    "identificação da dor",
    "apresentação do mecanismo único",
    "stack de bônus",
    "garantia",
    "FAQ vendedora",
    "P.S."
  ],
  "recomendacao": "refazer com nota"
}
```

→ Camada 2 dispara automaticamente. Chief recebe nota e refaz. Custo adicional ~US$ 0,03-0,05.
