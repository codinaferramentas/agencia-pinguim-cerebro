---
name: tom-de-marca
description: Calibra tom de voz da copy para a marca/criador específico (Pinguim institucional, Micha lo-fi, Luiz mestre, Pedro estratégico) quando o agente entrega texto que vai pra um canal específico do cliente.
metadata:
  pinguim:
    familia: edicao
    formato: auditoria
    clones: [clone-luiz, clone-micha, clone-pedro]
---

# Tom de Marca

## Quando aplicar

Output gerado por mestre (Hormozi, Halbert, etc) precisa virar texto **assinado por uma voz específica** do cliente.

Sinais:
- Cliente é Micha — texto vai pro Reels do Micha (lo-fi, oral, curto)
- Cliente é Luiz — texto vai pra autoridade institucional Pinguim
- Cliente é Pedro — texto vai pra contexto Sobral (gestor de tráfego)
- Pinguim institucional — voz da marca, não de pessoa específica

NÃO use quando:
- Texto é pra Persona genérica de cliente externo (ainda não temos voz definida — usar Skills de copy puro)
- Cliente pediu "manter voz Hormozi" intencionalmente (raro)

## Receita

### Vozes Pinguim mapeadas

#### Voz Pinguim institucional
- Tom: técnico-preciso, didático, sério sem ser pomposo
- Frase: média (15-20 palavras)
- Vocabulário: usa termos técnicos quando faz sentido (Schwartz Stage, EPP, Cérebro)
- Não usa: gíria, primeira pessoa do singular, exclamação
- Sinatura: "construímos um sistema que..."

#### Voz Micha (Instagram/Reels lo-fi)
- Tom: oral, curto, gancho na primeira frase
- Frase: curta (5-12 palavras), muita quebra
- Vocabulário: "Reels", "stories", "audiência", "lo-fi", "produção", gírias atuais
- Usa: primeira pessoa, "olha", "tipo", "sabe quando..."
- Sinatura: "olha o que eu vi essa semana"

#### Voz Luiz (autoridade fundador)
- Tom: maturo, ponderado, autoridade calma
- Frase: média-longa, com nuance
- Vocabulário: termos comerciais BR (lançamento, low-ticket, escala, time)
- Usa: "minha experiência", "o que percebi", "no Pinguim a gente..."
- Sinatura: "depois de X anos rodando isso, percebo que..."

#### Voz Pedro (estratégico operacional)
- Tom: direto, frio, dado-orientado
- Frase: curta
- Vocabulário: ROAS, CPL, CAC, escala, ABO, CBO, criativo, lookalike
- Usa: pouca primeira pessoa, mais "o gestor que faz X" 
- Sinatura: "se sua conta tá em X com Y, faça Z"

### Calibragem em 4 passos

1. **Identifica voz alvo** pelo briefing humano ("vai pro Reels do Micha")
2. **Carrega Clone correspondente** se mapeado (Micha/Luiz/Pedro)
3. **Pega output do mestre + reescreve em camadas:**
   - Camada A: troca pronomes/sintaxe
   - Camada B: troca vocabulário específico do canal
   - Camada C: ajusta cadência (frase curta vs longa)
4. **Valida**: leria essa frase com a voz dele/dela? Se não, refaz.

## O que NÃO fazer

- Mudar substância — só tom. Argumento do mestre fica; jeito de dizer muda.
- Misturar vozes (texto começa Micha, vira Pinguim institucional). Decide voz dominante e mantém.
- Imitar voz sem ter Clone carregado. Imitação ruim = vergonha de marca.
- Usar voz sócio em marketing institucional (post Pinguim assinado por Luiz/Micha/Pedro tem que estar coerente com canal).
- Esquecer que voz tem **registro** (formal/informal/técnico) — mesmo Micha tem voz formal quando fala com mídia.

## Clones a invocar

- **Clone Luiz** — quando texto é assinado por Luiz
- **Clone Micha** — quando texto é Reels/Stories Micha
- **Clone Pedro** — quando texto é mentoria/conteúdo Pedro Sobral

(Se for institucional Pinguim, não invoca Clone — voz é da marca, não pessoa.)

## Exemplo aplicado

**Output mestre Hormozi:**
> "Look, your offer is failing because nobody sees the value. Fix the value perception, not the offer."

**Após `portuguesar-br`:**
> "Olha, sua oferta tá falhando porque ninguém vê o valor. Conserta a percepção de valor, não a oferta."

**Após `tom-de-marca` voz Micha (Reels):**
> "Olha que parada. Sua oferta não tá vendendo? Não é a oferta. É que ninguém tá vendo o valor. Conserta isso primeiro."

**Após `tom-de-marca` voz Luiz (autoridade):**
> "Depois de muitos lançamentos vendo isso acontecer, percebi um padrão: oferta que não converte raramente é problema da oferta. É da percepção de valor — e isso a gente conserta antes."

**Após `tom-de-marca` voz Pedro Sobral (estratégico):**
> "Oferta com conversão abaixo de 1.5% no checkout: 80% das vezes é percepção de valor, não oferta. Conserta a percepção primeiro, mede de novo."
