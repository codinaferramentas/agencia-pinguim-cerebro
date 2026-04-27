---
name: buscar-cerebro
description: Use sempre que o agente precisar consultar conhecimento curado do
  Pinguim sobre um Cérebro específico (produto interno, concorrente, metodologia
  ou clone). Retorna trechos relevantes com fonte citada. NÃO use pra fato
  genérico (clima, dados em tempo real, conhecimento geral).
---

# Skill: buscar-cerebro

## Quando usar

Use esta skill quando:

- Aluno fez pergunta sobre produto Pinguim → busque no Cérebro daquele produto
- Sócio pediu material/argumento de uma metodologia (SPIN, Sandler, Challenger, MEDDIC, Voss) → busque no Cérebro da metodologia
- Agente comercial precisa lembrar como funciona um produto antes de vender
- Auto-pergunta interna: "será que tem algo curado sobre isso no Pinguim?"

NÃO use quando:

- Pergunta é sobre fato genérico (capital de país, clima, hora atual) — use seu próprio conhecimento de LLM
- Dado é em tempo real (vendas de hoje, status de pedido) — use a skill `consultar-dashboard` (futura)
- Pergunta é sobre operação interna do Pinguim (squads, equipe, workflows) — use Cérebros internos específicos

## Como executar

### Passo 1: Identificar o Cérebro alvo

Mapeie a pergunta pra um `cerebro_slug`:

| Sinal na pergunta | cerebro_slug |
|---|---|
| Menciona "Elo" ou "programa Elo" ou "Ciclo" | `elo` |
| Menciona "ProAlt" ou "ProAlt Vision" | `proalt` |
| Menciona "Lyra" | `lyra` |
| Menciona "Taurus" | `taurus` |
| Menciona "Orion" | `orion` |
| Menciona "Mentoria Express" | `mentoria-express` |
| Menciona "Análise de Perfil" | `analise-de-perfil` |
| Menciona "Lo-fi Desafio" | `lo-fi-desafio` |
| Menciona "Low Ticket Desafio" | `low-ticket-desafio` |
| Menciona "SPIN Selling" ou "perguntas SPIN" | `spin-selling` |
| Menciona "Sandler" | `sandler` |
| Menciona "Challenger" ou "Vendendo Desafio" | `challenger-sale` |
| Menciona "Tactical Empathy" ou "Chris Voss" | `tactical-empathy` |
| Menciona "MEDDIC" | `meddic` |
| Não está claro qual Cérebro | **PERGUNTE** ao usuário antes de buscar |

### Passo 2: Chamar a busca

Use a tool `pinguim_buscar` com:

```json
{
  "cerebro_slug": "<slug_identificado>",
  "pergunta": "<reformulação clara da dúvida>",
  "top_k": 5
}
```

A tool retorna lista de chunks com:

- `texto`: trecho do Cérebro
- `score`: similaridade semântica (0 a 1)
- `fonte`: nome da peça de origem (ex: "Aula 12 — Módulo 3")
- `fonte_url`: link pra fonte original (se houver)

### Passo 3: Avaliar relevância

- **score ≥ 0.70** → use o trecho como base da resposta. Forte sinal.
- **0.50 ≤ score < 0.70** → use com cautela, mencione que é parcialmente relevante.
- **score < 0.50** → NÃO use. Diga: "Não tenho informação suficiente sobre isso no Cérebro [X]" e ofereça escalar pro humano.

Se TODOS os 5 trechos vierem com score < 0.50, isso é um **gap do Cérebro** — registre o gap automaticamente (skill futura: `registrar-gap-cerebro`) e responda escalando.

### Passo 4: Citar a fonte (sempre)

Toda resposta baseada em busca em Cérebro DEVE citar a fonte. Formato:

> Resposta em prosa natural, integrando o conhecimento. _(fonte: Aula 12 — Módulo 3)_

Múltiplas fontes:

> Resposta consolidada de várias peças. _(fontes: Aula 12 — Módulo 3; Página de Vendas v3)_

### Passo 5: Não inventar

Se a resposta não está clara nos chunks retornados, **não complete o raciocínio com seu próprio palpite**. Diga explicitamente: "Os trechos do Cérebro mencionam X mas não detalham Y — recomendo escalar pro time."

## Limites

- **Nunca** retorne trecho com score < 0.50 como verdade.
- **Nunca** misture conhecimento do LLM com chunks do Cérebro sem deixar claro o que veio de onde.
- **Nunca** use isso pra responder pergunta sobre fato em tempo real ou operação atual (vendas hoje, lead aberto agora) — pra isso vai ter outra skill.

## Critério de qualidade

Uma execução boa desta skill produz:

1. Resposta direta à pergunta do usuário
2. Pelo menos 1 fonte citada
3. Tom alinhado à persona do Cérebro consultado
4. Recusa explícita quando o Cérebro não cobre o assunto

## Métricas que importam

- **Taxa de citação**: % de respostas que citam fonte (alvo: 100%)
- **Score médio dos chunks usados**: deve ficar > 0.65
- **Taxa de "gap detectado"**: % de buscas em que todos os scores < 0.50 (alta = Cérebro precisa de mais conteúdo)

## Aprendizados acumulados

_Esta seção é alimentada pelo loop EPP (Evolução Permanente). Cada vez que um humano corrige uma execução desta skill, registra-se aqui o aprendizado._

(vazio — skill ainda em construção)

---

**Versão:** v1.0  
**Status:** em construção  
**Padrão:** Anthropic Agent Skills Spec (Dez/2025)
