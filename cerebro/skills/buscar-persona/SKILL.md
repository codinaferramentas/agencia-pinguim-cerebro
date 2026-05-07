---
name: buscar-persona
description: Carrega o dossiê 11 blocos da Persona vinculada ao Cérebro do produto quando o agente precisa saber com quem está falando. Skill universal — Atendente Pinguim usa antes de delegar trabalho criativo.
metadata:
  pinguim:
    familia: meta
    formato: tool-helper
    clones: []
---

# Buscar Persona

## Quando aplicar

- Atendente identificou produto, vai delegar trabalho criativo (página, VSL, email, anúncio) e precisa saber quem é o comprador
- Cliente pediu copy/conteúdo direcionado e Persona existe pro produto
- Skill em uso referencia Persona indiretamente (todas as Skills criativas precisam)

NÃO use quando:
- Pedido é puramente conversacional ou factual sobre produto
- Cliente perguntou sobre voz/método de mestre (use `buscar-clone`)

## Receita

1. **Mapeia produto → Persona.** Persona vincula ao Cérebro do produto via `pinguim.personas.cerebro_id`. Identifica `cerebro_id` pelo `produto_slug` reconhecido.

2. **Verifica se existe.** Se não existe Persona pra esse produto: declara explicitamente no briefing "sem Persona definida — output será mais genérico, recomenda popular Persona antes de venda real".

3. **Carrega 11 blocos JSONB** da Persona:
   - `identidade` — quem é (idade, gênero, profissão, renda)
   - `rotina` — como vive o dia a dia
   - `nivel_consciencia` — Schwartz 1-5 dominante
   - `jobs_to_be_done` — o que tenta resolver
   - `vozes_cabeca` — diálogos internos
   - `desejos_reais` — o que de fato quer
   - `crencas_limitantes` — o que trava
   - `dores_latentes` — o que sente sem nomear
   - `objecoes_compra` — o que diz pra não comprar
   - `vocabulario` — gírias, jargão, formalidade
   - `onde_vive` — canais, redes, mídias

4. **Resume em 4-5 linhas** pro briefing — Chief não precisa do dossiê inteiro, precisa do essencial pra calibrar voz e estágio Schwartz.

5. **Inclui vocabulário literal** no briefing. Mestre precisa ver as palavras que a Persona usa, não paráfrase.

## O que NÃO fazer

- Resumir Persona em "homem 30 anos quer ganhar dinheiro". Resumo raso = output raso.
- Esconder gaps. Persona com 3 dos 11 blocos preenchidos é melhor que ausência declarada como "tem Persona" — declara o que tá vazio.
- Inferir Persona quando ela não existe. Inferência sem dado = chute. Mestre precisa saber quando tá operando com chute.
- Misturar Persona de produtos diferentes. Persona Elo ≠ Persona ProAlt.

## Clones a invocar

Skill universal — não invoca Clone.

## Exemplo aplicado

**Pedido:** "copy pra página de venda do Elo"

**Buscar-persona retorna ao briefing:**

```
Persona Elo (definida, 11/11 blocos):
- Identidade: 22-32 anos, criador iniciante, trabalha em outra coisa (CLT 
  ou autônomo de outro nicho), renda 3-8k/mês
- Schwartz dominante: 2 (Problem Aware) em tráfego frio
- Vocabulário literal: "travado", "engajamento baixo", "não sei sobre o 
  que postar", "perdi a vontade de gravar", "só amigo curtindo"
- Dor latente: "tenho coisa pra dizer mas ninguém vê"
- Desejo real: "viver de criador" (não "ficar famoso")
- Objeção principal: "será que funciona pra quem ainda não tem nicho 
  definido?"
- Onde vive: Reels, TikTok, comunidades de Discord de criadores
```
