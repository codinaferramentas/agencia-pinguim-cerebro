---
name: enviar-mensagem-discord
description: Use sempre que o agente precisar comunicar com a equipe da Pinguim
  via Discord — reportar tarefa concluída, avisar sobre evento, escalar pra
  humano, postar relatório. NÃO use pra responder dúvida de aluno (pra isso
  use a skill de atendimento direto).
---

# Skill: enviar-mensagem-discord

## Quando usar

Use esta skill quando:

- Tarefa automatizada terminou e a equipe precisa saber (cron de relatório diário, varrida noturna, ingestão concluída)
- Detectou anomalia ou alerta operacional (Cérebro parado, agente errando, custo subindo)
- Precisa **escalar pra humano** porque a skill atual não consegue resolver
- Precisa pedir confirmação humana antes de ação destrutiva (deletar, publicar, enviar email em massa)

NÃO use quando:

- Quer responder direto a um aluno — esse fluxo é de skill de atendimento que já fala no canal de origem
- A mensagem contém dado sensível (senha, token, dado bancário) — escala pra humano por canal seguro
- Vai mandar mais de 1 mensagem em 5 segundos pro mesmo canal — bate rate limit do Discord, vira spam

## Como executar

### Passo 1: Identificar o canal alvo

Mapeie o objetivo da mensagem pra um `canal`:

| Sinal | Canal |
|---|---|
| Aviso operacional rotineiro | `geral` |
| Alerta crítico (algo quebrou) | `alertas` |
| Resumo de vendas | `vendas` |
| Conteúdo / aprovação de copy | `copy` |
| Pedindo decisão de humano | `escalacoes` |

Cada canal está mapeado pra um webhook Discord nas secrets da Edge Function (`DISCORD_WEBHOOK_<NOME>`). Se o canal não estiver cadastrado, a skill retorna erro.

### Passo 2: Preparar o conteúdo

Estrutura recomendada de mensagem:

```
**[Tipo]** Assunto curto

Linha 1 com o fato principal.
Linha 2 com contexto (números, links).

_Origem: <agente/skill> · <horário>_
```

Limites:

- **Máximo 2000 caracteres** (limite hard do Discord)
- Use `**negrito**` pro título; evite emoji excessivo
- Coloque link de detalhe quando possível (Pinguim OS, Cérebro, persona)
- **Nunca @everyone, @here ou @<role>** — `allowed_mentions` está bloqueado por padrão pra não spammar

### Passo 3: Chamar a Edge Function

Use a tool com:

```json
{
  "canal": "<canal_identificado>",
  "conteudo": "<mensagem formatada>",
  "embeds": null
}
```

Ou se quiser embed mais rico:

```json
{
  "canal": "alertas",
  "embeds": [{
    "title": "Custo OpenAI subiu 40%",
    "description": "Hoje: $12.40 · Média 7d: $8.85",
    "color": 15158332
  }]
}
```

### Passo 4: Validar retorno

Resposta de sucesso:

```json
{ "ok": true, "enviado_em": "2026-04-27T15:00:00Z", "tamanho_conteudo": 380, "duracao_ms": 200 }
```

Em caso de erro:

- `Canal não configurado` → cadastra a secret antes de retentar
- `Discord retornou 429` → rate limit, espere 60s e tente de novo
- `Discord retornou 401/404` → webhook inválido, escala pro humano

## Limites

- **Não spammar**: máx 1 mensagem/5s pro mesmo canal
- **Não enviar dados sensíveis** (senha, token, dado bancário) — webhooks Discord ficam logados em servidores fora do nosso controle
- **Não usar pra mensagens longas** (>2000 chars) — quebrar em chunks ou anexar como arquivo (não suportado nessa versão)
- **Não `@everyone`/`@here`** — bloqueado por padrão na Edge Function

## Critério de qualidade

Uma execução boa desta skill produz:

1. Mensagem chega no canal certo
2. Equipe consegue agir em 30s sem precisar abrir nada além do Discord (informação completa na própria mensagem)
3. Tom alinhado ao agente que enviou (cron formal, alerta urgente, escalação pedindo decisão)

## Métricas que importam

- **Taxa de entrega**: % de chamadas com `ok: true` (alvo: >99%)
- **Latência média**: deve ficar <500ms (Discord webhook responde rápido)
- **Taxa de retry**: % de execuções que precisaram retentar (alvo: <2%)

## Aprendizados acumulados

_(vazio — skill recém-criada)_

---

**Versão:** v1.0  
**Status:** em construção  
**Padrão:** Anthropic Agent Skills Spec (Dez/2025)  
**Edge Function:** `enviar-mensagem-discord` (deployada)
