---
name: aprender-com-feedback
description: Recebe feedback humano (👍 / 👎 / ✏️ edição) e atualiza APRENDIZADOS.md do agente para que próximas execuções incorporem a correção. Skill universal — núcleo do EPP.
metadata:
  pinguim:
    familia: meta
    formato: playbook
    clones: []
---

# Aprender com Feedback

## Quando aplicar

Sempre que humano dá feedback explícito numa execução do agente:
- 👍 → registra padrão validado
- 👎 → registra padrão a evitar
- ✏️ edição → registra delta entre output original e versão final aprovada

Esta Skill é o pilar EPP (Evolução Permanente Pinguim) Camada 3 — feedback humano. Sem ela, agente não aprende e fica estagnado.

## Receita

1. **Captura evento** via `feedback-pinguim` Edge Function. Payload:
   - `agente_slug`
   - `cliente_slug` (perfil específico)
   - `tipo`: like | dislike | edit
   - `output_original`
   - `output_corrigido` (se edit)
   - `comentario_humano` (se houver)
   - `timestamp`

2. **Persiste** em `pinguim.aprendizados_cliente_agente` (tabela existente).

3. **Atualiza APRENDIZADOS.md** do agente:
   - 👍 vai pra seção "Padrões validados"
   - 👎 vai pra seção "Padrões a evitar"
   - ✏️ vai pra seção "Correções específicas" com diff resumido

4. **Em próxima execução**, agente lê APRENDIZADOS.md (geral + perfil-cliente) ANTES de gerar output. Aprendizado entra como contexto, não regra dura.

5. **Compressão periódica.** Quando APRENDIZADOS.md passa de 200 linhas, agrupar correções similares em padrões consolidados (manual ou via gpt-4o-mini).

## O que NÃO fazer

- Tratar feedback como regra. Aprendizado entra como **contexto** ("em interações passadas, humano X preferiu Y") — não vira if/else.
- Ignorar comentário literal. Quando humano comenta com palavras dele, salvar literalmente — vocabulário humano = vocabulário do agente.
- Misturar aprendizado de clientes diferentes. Persona Elo e Persona ProAlt podem querer coisas opostas.
- Tornar APRENDIZADOS.md infinito. Compressão é parte da skill.

## Clones a invocar

Skill universal — não invoca Clone.

## Exemplo aplicado

**Feedback humano:** ✏️ edit em copy de email

**Output original:** "Você sabe aquele momento em que o engajamento despenca?"
**Output corrigido pelo humano:** "Você sabe aquela hora que ninguém vê seu post?"
**Comentário:** "menos formal, fala como criador fala"

**Aprendizado registrado em APRENDIZADOS.md (perfil cliente Elo):**

```
## Correções específicas — voz da Persona Elo

[2026-05-07] Em copy de email pro Elo, humano corrigiu:
- Original: "Você sabe aquele momento em que o engajamento despenca?"
- Final: "Você sabe aquela hora que ninguém vê seu post?"
- Comentário literal: "menos formal, fala como criador fala"
- Padrão: usar "ninguém vê" em vez de "engajamento despenca". 
  Vocabulário Persona Elo é mais direto que técnico.
```

Próxima execução pro Elo: agente lê esse aprendizado e prefere "ninguém vê" a "engajamento despenca".
