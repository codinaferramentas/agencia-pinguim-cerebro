# Monitor de Sentimento — Grupos de WhatsApp dos Alunos

> **NO AR desde 26/08/2026.** Zero LLM, zero token de IA, zero cron — tempo real via webhook.

## O que faz

A instância Evolution `elo_1775155882289` (número da Ingrid, membro dos 10 grupos de alunos) manda **cada mensagem nova** via webhook pra edge `monitor-grupos-webhook` (Supabase Pinguim). A edge:

1. Descarta o que não interessa (grupo não monitorado, mensagem nossa, sem texto).
2. Classifica com **regex determinística** (66 padrões calibrados em corpus real de 2.634 mensagens) em 3 categorias:
   - 🆘 `pedido_ajuda` — "não recebi acesso", "não consigo entrar", "cadê o link", "deu erro"…
   - 📣 `reclamacao` — "ninguém responde", "estou decepcionado", "esperando desde…"…
   - 🚨 `chateado_risco` — "quero cancelar", "reembolso", "me arrependi", "desisto"…
3. Grava **toda** mensagem em `pinguim.monitor_grupos_mensagens` (as não-flagadas são o corpus pra evoluir os padrões e a futura base de conhecimento de falhas de processo).
4. Se flagou **e o autor não é ADM do grupo** → DM no Discord pro Codina e pra Ingrid (fallback: canal #novo-grupo-pinguim marcando os dois).

## Regras anti-ruído

- **ADM do grupo nunca gera alerta** (chacoalhada de admin é gestão, não reclamação). Lista de admins fica em cache jsonb em `monitor_grupos.admins`, refresh lazy a cada 6h via Evolution (funciona com o formato novo `@lid`).
- **Debounce 5 min**: mesmo autor + mesmo grupo já alertado → grava mas não repete a DM (a GS já vai abrir o grupo e ver a sequência inteira).
- **Dedup**: unique `(grupo_jid, message_id)` — reentrega do webhook não duplica nem re-alerta.
- **Peso/limiar**: padrão com peso ≥3 dispara sozinho; pesos 1–2 só disparam somando. Limiar = 3. Empate: maior score vence (`chateado_risco` > `reclamacao` > `pedido_ajuda` como desempate).

## Onde mexer (sem redeploy!)

| Quero… | Onde |
|---|---|
| Adicionar/remover grupo | `pinguim.monitor_grupos` (insert/`ativo=false`). JID = resolver pelo link de convite via `/group/inviteInfo` |
| Melhorar/criar padrão | `pinguim.monitor_grupos_padroes` (regex sobre texto **normalizado**: minúsculas, sem acento). Cache de 2 min na edge |
| Desativar padrão ruim | `ativo=false` na linha do padrão |
| Ver o que foi flagado | `pinguim.monitor_grupos_mensagens where categoria is not null` |
| Caçar falso negativo | mensagens com `categoria is null` (corpus completo está lá) |

## Segurança

- Webhook exige token (`MONITOR_GRUPOS_WEBHOOK_TOKEN`, secret da edge function): aceito via header `x-monitor-token` **ou** query `?t=` (a Evolution manda os dois). Sem token = 401.
- Tabelas com RLS ligada, sem policies — só `service_role` (padrão Squad Cyber).
- Chaves Discord/Evolution vêm do cofre (`getChave`).

## Testar

```bash
curl -X POST https://wmelierxzpjamiofeemh.supabase.co/functions/v1/monitor-grupos-webhook \
  -H "Content-Type: application/json" -H "x-monitor-token: <token>" \
  -d '{"teste_classificar": "paguei e nao recebi o acesso"}'
# → {"ok":true,"categoria":"pedido_ajuda","score":...}
```

Modo teste só classifica — não grava, não alerta.

## Arquivos

- Edge: `mission-control/supabase/functions/monitor-grupos-webhook/index.ts`
- Schema + seed: `mission-control/supabase/schema-040-monitor-grupos.sql`
- Monitor de queda da instância: já coberto pelo `alertas-grupos-worker` (DM com QR de reconexão)

## Grupos monitorados (26/08/2026)

Mentoria Lyra · TAURUS MASTER · TAURUS MASTER | AVISOS · TAURUS LT · TAURUS LT | AVISOS · MASTERMIND ORION · ProAlt Low Ticket · AVISOS | ProAlt Low Ticket · CANCELAMENTO COLETIVO | ELO · AVISOS | ELO

## Futuro (não construído)

- Aba no Mission Control com as flagadas + botão "falso positivo" (vira `ativo=false`/ajuste de peso).
- LLM **só** nas mensagens de score ambíguo (1–2), padrão enriquecedor plugável.
- Relatório semanal por categoria/grupo → detectar falha de processo recorrente.
