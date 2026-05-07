---
name: buscar-funil
description: Carrega etapas do funil ativo do produto e identifica em qual etapa o output entra quando o agente precisa calibrar copy para tráfego frio vs lista quente, pré vs pós-decisão. Skill universal.
metadata:
  pinguim:
    familia: meta
    formato: tool-helper
    clones: []
---

# Buscar Funil

## Quando aplicar

- Atendente vai delegar trabalho criativo e o produto tem funil mapeado
- Briefing humano declarou tráfego ("vamos rodar Meta frio", "lista quente da casa")
- Skill em uso é sensível à etapa do funil (toda skill de copy de venda é)

NÃO use quando:
- Produto não tem Funil mapeado (declara gap no briefing)
- Pedido é genérico institucional (sem etapa de funil definida)
- Pedido é interno operacional (não tem funil)

## Receita

1. **Identifica funil ativo.** `pinguim.funil_etapas` tem `produto_id`. Pega etapas ordenadas.

2. **Diagnostica etapa do output.** Pelo briefing:
   - Tráfego frio Meta/Google → topo (consciência ou problema)
   - Lista quente, recompradores → fundo (decisão ou pós-venda)
   - Indicação/orgânico → meio (consideração)
   - Recompra → pós-venda

3. **Cruza com Schwartz.** Funil ≠ nível de consciência, mas se relacionam:
   - Topo + Schwartz 1-2 → trabalha consciência
   - Meio + Schwartz 3-4 → trabalha diferenciação
   - Fundo + Schwartz 4-5 → trabalha urgência/oferta

4. **Declara a etapa no briefing** + tráfego de origem + relação cruzada com Schwartz.

5. **Se Funil não existe:** declara "sem Funil mapeado, mestre assume etapa neutra ou produz versão dupla (frio + quente)".

## O que NÃO fazer

- Confundir Funil com Schwartz. Funil é onde a pessoa está no fluxo. Schwartz é o que ela sabe. Pessoa pode estar em "decisão" do funil mas em "Stage 2" Schwartz mentalmente.
- Assumir que "tem funil" significa "todos os outputs já têm etapa definida". Cliente pede output, briefing precisa diagnosticar etapa específica daquele output.
- Inferir tráfego sem o cliente declarar. Se não declarou, perguntar ou produzir versão dupla.

## Clones a invocar

Skill universal — não invoca Clone.

## Exemplo aplicado

**Pedido:** "copy pra página de venda do Elo, pra meu lançamento"

**Buscar-funil retorna:**

```
Funil Elo (não mapeado em pinguim.funil_etapas — 0 etapas)
Tráfego declarado: "lançamento" (ambíguo — pode ser frio Meta + lista 
quente combinados)
Recomendação ao mestre: produzir 2 versões da headline e first-fold
  - Versão frio (Schwartz 2, topo): foco em problema + categoria de solução  
  - Versão quente (Schwartz 4, fundo): foco em oferta + escassez
Restante da página pode ser comum (depois do first-fold convergem)
```
