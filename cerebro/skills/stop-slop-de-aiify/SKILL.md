---
name: stop-slop-de-aiify
description: Identifica e marca padrões de escrita que parecem geradas por IA (frases-genéricas, listas-de-3, sufixos previsíveis, abertura "como [profissão]", etc) para que o mestre humanize. Skill universal de polish.
metadata:
  pinguim:
    familia: edicao
    formato: auditoria
    clones: [gary-halbert]
---

# Stop Slop / De-AI-ify

## Quando aplicar

Sempre depois de output gerado por LLM (todos os agentes Pinguim), antes de entregar. Mata padrões que entregam "isso é IA" mesmo quando texto é correto.

Sinais:
- Output usa "como [profissão] de marketing, posso..."
- Listas-de-3 sequenciais sem motivo
- Sufixos típicos de LLM ("vamos explorar", "aqui estão", "em conclusão")
- Abertura/fechamento que repete a pergunta

NÃO use quando:
- Output é planilha estruturada (lista é o formato)
- Output é puramente técnico (documentação)

## Receita

12 padrões a caçar e sinalizar:

### 1. Abertura "como X, posso..."
- "Como copywriter, posso te dizer que..." → APAGAR. Mestre humano não faz isso.

### 2. Listas-de-3 sequenciais
- "É rápido, eficiente e poderoso" — tudo em 3.
- "Você precisa de X, Y e Z" — tudo em 3.
- LLM ama 3. Variar pra 2, 4, ou frase corrida quando faz sentido.

### 3. "É importante notar que / vale ressaltar que"
- Padding de LLM. APAGAR e ir direto ao ponto.

### 4. "Em conclusão / em resumo / para finalizar"
- Sinaliza redação escolar. Tirar — quando texto acaba, acaba.

### 5. "Vamos explorar / vamos mergulhar"
- Linguagem de TED Talk de LLM. Substituir por verbo direto.

### 6. Sufixos genéricos
- "...de forma estratégica" → estratégica como?
- "...de maneira eficaz" → eficaz como?
- "...que entrega resultados" → quais?
- Cortar ou especificar.

### 7. Substantivos abstratos empilhados
- "A implementação da estratégia através da otimização do processo" — caixa-preta.
- Reescrever com verbos concretos.

### 8. "Não apenas X, mas também Y"
- Construção previsível. Reescrever direto.

### 9. Adjetivos vazios
- "Incrível", "fantástico", "sensacional", "extraordinário"
- Em copy: cliente não acredita. Substituir por dado concreto.

### 10. Reformulação da pergunta no início
- Cliente pediu "copy pra X" — output abre com "Para criar copy para X, primeiro precisamos..."
- Cortar a abertura, ir pro conteúdo.

### 11. Closing exagerado de prestatividade
- "Espero que tenha ajudado!" / "Estou aqui pra mais perguntas!" / "Sucesso!"
- Mestre humano não faz isso. Cortar.

### 12. Hífen em vez de travessão / aspas curvas erradas
- "—" em vez de "-" pra incidental
- "Aspas" em vez de "Aspas" sem curva
- Detalhe de tipografia que sinaliza "humano cuidadoso"

## O que NÃO fazer

- Reescrever no lugar do mestre. Skill **anota** — mestre revisa.
- Caçar padrão por estética sem prejuízo de leitura. Lista-de-3 pode ser ótima quando enumera 3 itens reais.
- Aplicar em texto que precisa ser estruturado (planilha, documentação).
- Sobre-humanizar até virar irreconhecível. Mestre Hormozi tem padrão "lista de 3" característico — é dele, deixa.

## Clones a invocar

- **Gary Halbert** — voz humana sem filtro, melhor referência de "não-IA". *Boron Letters* é exemplo canônico.

## Exemplo aplicado

**Texto recebido (gerado por LLM):**
> "Como especialista em marketing digital, posso te ajudar a entender que criar uma página de vendas eficaz envolve estratégia, técnica e copywriting. É importante notar que cada um desses elementos desempenha um papel fundamental. Vamos explorar como você pode implementar isso de forma estratégica para entregar resultados consistentes."

**Saída esperada (10 anotações):**

```
[1] "Como especialista em marketing digital" — abertura LLM clássica. CORTAR.
[2] "estratégia, técnica e copywriting" — lista-de-3 genérica. ESPECIFICAR.
[3] "É importante notar que" — padding. CORTAR.
[4] "papel fundamental" — vazio. ESPECIFICAR.
[5] "Vamos explorar" — TED Talk. SUBSTITUIR.
[6] "implementar isso" — pronome vago. NOMEAR.
[7] "de forma estratégica" — sufixo genérico. CORTAR ou especificar.
[8] "resultados consistentes" — vazio. ESPECIFICAR.
[9] Reformula a pergunta no início — REESCREVER
[10] Texto inteiro tem 0 dado, 0 nome, 0 verbo concreto

VEREDICTO: refazer. Texto é "shape" de copy, não copy.
```
