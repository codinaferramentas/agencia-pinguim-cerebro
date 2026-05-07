---
name: buscar-skill
description: Identifica e carrega a Skill (ou conjunto de Skills) que cobre o formato pedido pelo cliente quando o agente precisa decidir como fazer determinado entregável. Meta-skill.
metadata:
  pinguim:
    familia: meta
    formato: tool-helper
    clones: []
---

# Buscar Skill

## Quando aplicar

- Atendente identificou pedido criativo, precisa decidir qual receita aplicar
- Briefing menciona formato concreto (página de venda, VSL, email, anúncio, carrossel, hook, etc)
- Múltiplas Skills podem combinar (ex: `anatomia-pagina-vendas-longa` + `schwartz-5-stages` + `bullets-fascinacao` se compõem)

NÃO use quando:
- Pedido é puramente conversacional
- Pedido é factual com resposta no Cérebro

## Receita

1. **Match por palavra-chave do pedido humano:**
   - "página de venda" → `anatomia-pagina-vendas-longa` (ou `-low-ticket` / `-high-ticket`)
   - "VSL" → `vsl-classico-aida` ou variantes
   - "email pra carrinho aberto" → `abertura-de-carrinho-email`
   - "headline" → `framework-aida` + `caples-headline-formula`
   - "bullets" → `bullets-fascinacao`
   - "oferta" → `hormozi-grand-slam-offer`
   - "lançamento" → `formula-de-lancamento` ou `lancamento-perpetuo-evergreen`

2. **Match por preço/ticket** (quando pedido cita produto):
   - Produto até R$ 297 → família `low-ticket` (anatomia curta)
   - R$ 297 a R$ 2.000 → mid-ticket (anatomia padrão)
   - Acima R$ 2.000 → `high-ticket` (anatomia longa, prova robusta)

3. **Match por canal:**
   - Reels/TikTok → `roteiro-reels-30s` + `hook-*`
   - Stories → `stories-vendedor`
   - Anúncio → família `anuncios-pagos`
   - WhatsApp → `whatsapp-vendas-br`

4. **Compõe Skills.** Skill principal + Skills auxiliares quase sempre. Ex: pra página de venda longa, sempre carrega também `schwartz-5-stages` (pra calibrar nível) e `bullets-fascinacao` (pra blocos de bullets).

5. **Declara Skills carregadas no briefing** + função de cada uma.

## O que NÃO fazer

- Carregar Skill aleatória "porque parece encaixar". Match por palavra-chave + canal + ticket é critério.
- Pular auxiliares. Página de venda sem Schwartz vira página fixa, ignorando consciência da Persona.
- Carregar 6+ Skills num único briefing. Cap razoável: 3-4. Mais que isso, briefing fica confuso.
- Inventar Skill que não existe no catálogo. Se nenhuma cobre exatamente, declara o gap e usa a mais próxima.

## Clones a invocar

Meta-skill — não invoca Clone (ela seleciona quais Skills carregar, e cada Skill aciona seus Clones).

## Exemplo aplicado

**Pedido:** "copy pra página de venda do Elo, vamos rodar Meta frio"

**Buscar-skill retorna:**

```
Skills carregadas:
1. anatomia-pagina-vendas-longa (principal — formato pedido)
2. schwartz-5-stages (auxiliar — calibra nível pelo tráfego frio)  
3. bullets-fascinacao (auxiliar — blocos de bullets da página)
4. hormozi-grand-slam-offer (auxiliar — bloco da oferta)

Outras consideradas e descartadas:
- anatomia-pagina-low-ticket: descartada porque Elo passa de R$ 1k
- vsl-classico-aida: descartada porque pedido é página, não VSL
- formula-de-lancamento: descartada porque pedido é só uma página, 
  não lançamento inteiro
```
