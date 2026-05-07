---
name: anatomia-pagina-vendas-longa
description: Estrutura completa de página de venda longa para produto de ticket médio/alto, da headline ao P.S., quando o agente precisa entregar copy de página inteira (não VSL, não email, não anúncio).
metadata:
  pinguim:
    familia: pagina-vendas
    formato: template
    clones: [gary-halbert, gary-bencivenga, eugene-schwartz, alex-hormozi, dan-kennedy, jon-benson]
---

# Página de Vendas Longa

## Quando aplicar

Cliente pediu "copy pra página de venda" de um produto cujo preço justifica leitura longa (acima de R$ 297 em low-ticket BR, todo high-ticket). Sinais de que é página longa, não outra coisa:

- Pedido cita "página de vendas", "salesletter", "carta de vendas"
- Produto tem preço acima de R$ 297, ou é high-ticket
- Funil é "lançamento" ou "perpétuo com tráfego frio"
- Persona ainda precisa ser convencida (níveis 3, 4 ou 5 de Schwartz — Solution Aware, Product Aware, Most Aware)

NÃO use esta skill quando:
- Pedido é VSL (use `vsl-classico-aida` ou `vsl-high-ticket-longo`)
- Pedido é low-ticket curto (use `anatomia-pagina-low-ticket`)
- Pedido é email (use família `email-marketing`)
- Pedido é anúncio (use família `anuncios-pagos`)

## Receita

A página longa **não tem número fixo de seções** — tem **blocos funcionais obrigatórios** que aparecem na ordem que faz sentido pro nível de consciência do leitor (consultar Schwartz). Os blocos:

1. **Above the fold** — headline + sub-headline + CTA visível + 1 sinal de prova
2. **Promessa expandida** — o que o leitor vai ter, com especificidade
3. **Identificação da dor / problema** — leitor se reconhece
4. **Por que outras soluções falharam** — dissolve alternativas (concorrentes, soluções caseiras, "fazer sozinho")
5. **Apresentação do mecanismo único** — o "como" diferenciado, nomeável, defensável
6. **Apresentação do produto / método** — entrega do mecanismo encarnado
7. **Para quem é / pra quem NÃO é** — qualificação dupla
8. **Prova social pesada** — depoimentos, números, screenshots, mídia citando
9. **Apresentação do criador** — autoridade + história de transformação
10. **Stack de bônus** — empilhamento de valor com preço atribuído a cada bônus
11. **Oferta principal** — preço, parcelamento, formatos de pagamento
12. **Garantia** — incondicional, condicional, ou super-garantia
13. **FAQ vendedora** — não institucional, mata objeção declarada
14. **CTA repetido** — após cada bloco emocional alto
15. **P.S.** — recap da promessa + último gatilho de urgência

## O que NÃO fazer

- Tratar como template fixo de "12 seções iguais sempre" — Schwartz e Halbert ficariam horrorizados. **A ordem e ênfase mudam pelo nível de consciência da Persona.**
- Escrever institucional ("nós somos uma plataforma que...") — página de venda é carta pra UMA pessoa, voz humana, não corporativa
- Esconder o preço até o fim sem motivo. Se o produto tem preço justificável, mostrar antes diminui ansiedade
- Garantia genérica ("30 dias") sem inversão de risco real. Garantia tem que doer no vendedor, não no cliente
- FAQ institucional ("Como acesso o curso?"). FAQ vendedora é "Vai funcionar pra mim mesmo se eu nunca fiz X antes?"
- Esquecer o P.S. Halbert ensina: P.S. é a segunda coisa mais lida da carta, depois da headline

## Clones a invocar

Skill referencia 6 Clones, cada um com papel específico nessa receita:

- **Gary Halbert** — headline, opening story, P.S., voz pessoal
- **Gary Bencivenga** — bullets de fascinação, prova, "Persuasion Equation"
- **Eugene Schwartz** — nível de consciência (decide ordem dos blocos), mecanismo único
- **Alex Hormozi** — Grand Slam Offer, Value Equation, stack de bônus, garantia
- **Dan Kennedy** — Godfather Offer, risk reversal, urgência genuína
- **Jon Benson** — quando a página tem VSL embedada, estrutura do roteiro

## Exemplo aplicado

**Pedido:** "copy pra página de venda do Elo"

**Briefing rico que o Atendente Pinguim deve passar pro Copy Chief:**
- Cérebro Elo: o que o produto é, depoimentos, transformação prometida
- Persona Elo: criador de conteúdo iniciante, dor de "não sabe começar", desejo de "viver de criador"
- Funil Elo: etapa de decisão (não consciência) — leitor já sabe que precisa, escolhe entre alternativas
- Skill: esta (`anatomia-pagina-vendas-longa`)
- Clones a invocar: os 6 acima

**Distribuição de trabalho entre Clones (Copy Chief decide):**
- Halbert escreve headline + opening + P.S.
- Schwartz decide a ordem dos blocos baseado no nível de consciência da Persona Elo
- Hormozi monta a oferta (preço, bônus, garantia)
- Bencivenga escreve bullets de fascinação e bloco de prova
- Kennedy revisa risk reversal
- Resultado consolidado pelo Copy Chief

**Saída esperada:** página longa, com blocos na ordem que Schwartz definiu, voz Halbert na narrativa, oferta Hormozi, bullets Bencivenga.
