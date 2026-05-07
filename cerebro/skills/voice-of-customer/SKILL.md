---
name: voice-of-customer
description: Extrai voz autêntica do cliente (vocabulário, frases, dores, desejos) de fontes reais (depoimentos, reviews, DMs, Q&A) para alimentar Persona e copy quando o agente precisa de palavras literais que clientes usam.
metadata:
  pinguim:
    familia: persona
    formato: playbook
    clones: []
---

# Voice of Customer (VoC)

## Quando aplicar

- Antes de qualquer copy importante (página, VSL, email)
- Para popular bloco "vocabulario" e "vozes_cabeca" da Persona
- Auditando copy existente que parece "marketing" demais (perdeu voz do cliente)

Joanna Wiebe (Copy Hackers) ensina: **a melhor copy não escreve o copywriter — extrai do cliente.**

## Receita

### Fontes a vasculhar (em ordem de qualidade)

1. **Depoimentos em vídeo/áudio** (transcrever)
   - Aluno gravou Reels/Story celebrando resultado
   - Vídeo enviado pro grupo do produto
   - Áudio de WhatsApp pra atendimento

2. **Mensagens em DM/WhatsApp**
   - Print de aluno em DM (com permissão LGPD)
   - Mensagem em grupo do produto
   - Resposta a Stories

3. **Reviews em plataforma**
   - Comentários em Hotmart/Eduzz (cuidado — geralmente sanitizados)
   - Reddit/Trustpilot quando produto BR aparece
   - Google Reviews

4. **Comentários em Instagram/YouTube**
   - Posts com alta interação ("isso aqui era exatamente o que eu precisava")
   - Comentários longos (geralmente vêm de interesse real)

5. **Pesquisa qualitativa direta**
   - Entrevista 30-45 min com aluno (perguntas abertas)
   - Questionário com 3-5 perguntas dissertativas
   - Q&A em live ou aula (quem pergunta + como pergunta)

### O que extrair de cada fonte

Pra cada fonte, anotar:

- **Frases literais** — citação exata, sem polir
- **Palavras repetidas** — vocabulário que aparece em 3+ fontes
- **Comparação de antes/depois** — como descrevia antes do produto, como descreve agora
- **Objeção declarada** — "eu quase não comprei porque..."
- **Razão de compra** — "o que me convenceu foi..."
- **Recomendação espontânea** — "indiquei pro meu amigo que..."

### Catálogo de saída

Saída fica em `cerebro/produtos/<slug>/voice-of-customer.md` (não no banco). Estrutura:

```markdown
# VoC — <Produto>

## Frases literais (top 30)
"...exatamente como falo com meus amigos" (depoimento Marina, 2026-04-15)
"a sensação foi..." (DM Carlos, 2026-04-22)

## Vocabulário recorrente
- "travado" (usado em 12 fontes)
- "engajamento" (usado em 8 fontes)

## Antes/Depois típicos
ANTES: "postava sem ninguém ver"
DEPOIS: "primeiro Reels com 5k de visualizações"

## Objeções pré-compra
"achei que era pra quem já tinha audiência" (5 fontes)

## Razões de compra
"o método estruturado, não dicas soltas" (8 fontes)
```

## O que NÃO fazer

- Polir vocabulário pra ficar "profissional". Texto polido = perde voz. "Aluna falou 'tava' e não 'estava'" → mantém 'tava'.
- Tirar de uma fonte só. Cliente único = anedota, não padrão. Buscar 10+ fontes pra cada padrão.
- Inventar quando dado falta. "A Persona deve dizer X" baseado em inferência = chute.
- Misturar VoC de produtos diferentes. Cada produto tem voz distinta da Persona.
- Esquecer LGPD. Print/depoimento usado em copy precisa de permissão.

## Clones a invocar

Skill universal — não invoca Clone (VoC é pesquisa, não voz autoral).

## Exemplo aplicado

**Pedido:** "extrai VoC do Elo, vou usar pra reescrever página"

**Fontes vasculhadas:**
- 247 alunos no grupo Discord do Elo
- 18 depoimentos em vídeo enviados pelo grupo
- 312 mensagens em DM ao perfil do criador
- Comentários em 30 Reels com alta interação
- 5 entrevistas qualitativas com alunos

**Saída esperada (recorte):**

```markdown
## Frases literais — top 10 do Elo

"Eu tava travado, sabe? Querendo começar mas sem saber sobre o que" 
(Marina S., depoimento vídeo, 2026-03-12)

"Postava e ninguém via, achava que era ruim. Era só estruturação errada" 
(Carlos M., DM, 2026-04-02)

"O Sistema 3 Pilares mudou minha cabeça — fiz tudo errado por 2 anos" 
(Aluno anônimo, Discord, 2026-04-15)

[mais 7]

## Vocabulário recorrente Elo
- "travado" — 14 menções
- "ninguém vê" — 11 menções
- "estruturação" — 9 menções (curioso, é palavra do método entrando no léxico)
- "comecei errado" — 8 menções

## Antes/Depois típico
ANTES: "postava esporadicamente, ninguém via, achava que minha voz não 
        importava"
DEPOIS: "estrutura semanal, primeiro Reels viral em até 30 dias, primeira 
        venda em 60-90 dias"

## Objeções pré-compra (top 5)
1. "Achei que era pra quem já tinha 10k+" (8 menções)
2. "Tá caro pra quem ainda não fatura" (6 menções)
3. "Já comprei outros cursos e não funcionou" (5 menções)
4. "Não tenho equipamento" (4 menções)
5. "Não sei sobre o que postar" (3 menções)
```

Esse VoC alimenta o bloco `vocabulario` e `vozes_cabeca` da Persona Elo + entra como insumo direto pra mestre escrever copy.
