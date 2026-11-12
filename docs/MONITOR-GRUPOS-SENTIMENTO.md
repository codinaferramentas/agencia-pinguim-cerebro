# Monitor de Sentimento — Grupos de WhatsApp dos Alunos

> **NO AR desde 26/08/2026.** Zero LLM, zero token de IA, zero cron — tempo real via webhook.

## O que faz

A instância Evolution `elo_1775155882289` (número da Ingrid, membro dos 10 grupos de alunos) manda **cada mensagem nova** via webhook pra edge `monitor-grupos-webhook` (Supabase Pinguim). A edge:

1. Descarta o que não interessa (grupo não monitorado, mensagem nossa, sem texto).
2. Classifica com **regex determinística** (66 padrões calibrados em corpus real de 2.634 mensagens) em 4 categorias:
   - 🆘 `pedido_ajuda` — "não recebi acesso", "não consigo entrar", "cadê o link", "deu erro"…
   - 📣 `reclamacao` — "ninguém responde", "estou decepcionado", "esperando desde…"…
   - 🚨 `chateado_risco` — "quero cancelar", "reembolso", "me arrependi", "desisto"…
   - 💬 `resposta_adm` — aluno respondeu (reply) uma mensagem de ADM do grupo, qualquer conteúdo. O alerta inclui o trecho da msg do ADM respondida.

   Regras estruturais (v2, 26/08/2026 tarde — ordem: padrões de conteúdo > resposta_adm > interrogação):
   - **"?" sem direção** → `pedido_ajuda`: mensagem com interrogação que não é reply e não marca ninguém (pergunta jogada no grupo). URLs são removidas antes do teste (todo link tem `?`); reply a outro aluno ou mensagem com `@fulano` não alerta (é conversa entre alunos / já tem destinatário).
   - Volume medido no histórico: ~1,5/dia ("?") + ~1,3/dia (resposta ao ADM).
3. Grava **toda** mensagem em `pinguim.monitor_grupos_mensagens` (as não-flagadas são o corpus pra evoluir os padrões e a futura base de conhecimento de falhas de processo).
4. Se flagou **e o autor não é ADM do grupo** → posta no **canal do Discord do produto** (v3, 02/09/2026): #proalt, #taurus-lt, #taurus-master, #cancelamento-elo, #mentoria-lyra, #orion-mastermind. Grupo de produto e seu AVISOS dividem o mesmo canal; ⚠️ AVISOS | ELO está provisoriamente no #cancelamento-elo (não tem canal próprio). Mapeamento na coluna `monitor_grupos.discord_canal_id` — trocar canal = UPDATE no banco, sem deploy. **Fallback:** grupo sem canal ou post falhou → DM pra Codina, Ingrid e Fernanda Lisboa (e, se todas as DMs falharem, canal #novo-grupo-pinguim marcando todos).

O alerta mostra **nome + número real do WhatsApp** de quem mandou (e do ADM respondido, na categoria `resposta_adm`). O WhatsApp identifica membros por LID (`...@lid`, id interno inútil pro consultor); o de-para LID→número vem do `/group/participants` (campo `phoneNumber`) e fica em cache no jsonb `monitor_grupos.participantes` (refresh 6h, ou forçado se aparecer membro novo fora do cache). O número resolvido também é gravado em `monitor_grupos_mensagens.remetente_telefone`.

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

## Atendimento: pergunta → resposta do ADM (schema-045, 09/11/2026)

Roda em paralelo ao alerta por produto (que não mudou).

- **Abre atendimento**: pergunta de aluno flagada (`pedido_ajuda` / `reclamacao` / `chateado_risco`, ou `resposta_adm` com "?"). Mensagens do mesmo aluno no mesmo grupo em até 30 min = o mesmo atendimento. Tabela `pinguim.monitor_atendimentos`.
- **Fecha**: ADM dá reply citando a mensagem do aluno (ou outra msg dele, até 3 dias) ou marca o aluno com @. Mensagens do próprio número da instância (fromMe) agora contam como ADM. Mensagem de ADM sem reply/@ NÃO fecha (medido: quase nunca é resposta àquela pergunta).
- **Ao fechar**: posta pergunta + resposta + tempo de resposta no destino.
- **Fechamento diário**: edge `monitor-atendimento-resumo`, cron job 58 às 8h BRT, sobre o dia anterior: perguntas, respondidas, pendentes (lista, com "colega respondeu"), tempo médio/mediano/mais lento, por grupo, por ADM. Teste: POST `{dia:'AAAA-MM-DD', dry_run:true}` com service_role.
- **Destino**: `pinguim.monitor_atendimento_config` (`canal_id` NULL = DM pros `dm_user_ids`, hoje só Codina). Virar tag: `update pinguim.monitor_atendimento_config set canal_id = '<id>';`
- Backfill: 14 dias de histórico (186 atendimentos, 38 respondidos), marcados `postar_erro = 'backfill histórico (não postado)'`.

## Painel CS — privado dos números de atendimento (schema-047/048, 09/11/2026)

- Instâncias em `pinguim.monitor_instancias` (Ingrid = elo_1775155882289, Fernanda Lisboa; "Equipe CS" quando conectar). Desligar = `monitora_privado = false`.
- **Só aluno**: `pinguim.monitor_classificar_contato(tel)` → `equipe` (ADM de grupo ou número de CS) | `aluno` (CRM `crm_cliente_identidade` tel ou membro de grupo `crm_grupo_presenca` — pega Pix que só está no grupo) | `desconhecido`. Só `aluno` é gravado e vira atendimento; o resto nem grava.
- Abre quando o aluno escreve algo além de cumprimento/agradecimento ("oi", "bom dia", "obrigado" esperam; o "oi" anterior entra junto quando a dúvida chega). Fecha quando a atendente responde na conversa.
- Grupos lidos só pela instância principal. Post de "respondida" no Discord desligado por padrão (`postar_respondidas`); Q&A fica no banco.
- Painel: SLA 4h úteis (`sla_min`), alerta 13h e 17h dias úteis (cron job 59), fechamento 8h (job 58). Canal `#painel-cs` 1569426033793437808.
- **Filtro de IA no privado (schema-049, 10/11)**: cada msg de aluno sem resposta passa por `gpt-5.4-mini` (OPENAI_API_KEY do cofre) com as últimas 12 msgs da conversa. Sem pedido (confirmação "feito/respondi", agradecimento, papo) → `status='descartada'` (painel só conta "🤖 filtradas"); pedido → `pendente` com `resumo` de 1 frase (é o que o painel mostra). IA falhou → `pendente` (`filtro='erro'`). Contato do privado = telefone (`<tel>@s.whatsapp.net`); msg da atendente grava `respondeu_jid` = contato.
- **Filtro de IA nos grupos (schema-050, 10/11)**: cada pergunta flagada passa por `gpt-5.4-mini` (PROMPT_GRUPO, contexto = 3 msgs anteriores do grupo). Pergunta aberta pra turma → `descartada` / `filtro='turma'` (fora das pendências e do SLA). ADM respondendo (reply/@) fecha mesmo assim e conta como respondida. Reclassificação dos 8 dias anteriores: 88 pendentes → 32 equipe / 56 turma.
- **Feedback de aluno sobre a empresa (schema-051, 12/11)**: toda msg de aluno nos grupos (>= 12 chars) passa por `gpt-5.4-mini` (candidato?) e, se sim, `gpt-5.5` confirma com checklist (alvo é a empresa?). Confirmado → grava `feedback_tipo/sobre/resumo` e posta na tag do produto como 📣 RECLAMAÇÃO / 🗯️ CRÍTICA / 💡 SUGESTÃO / 👏 ELOGIO DE ALUNO. Msg que já virou alerta não posta 2x; mesmo autor+grupo+tipo em 30 min = 1 post. Desligar: `feedback_ativo=false`. Calibração 385 msgs/3 dias: 65 → 23 → 8 (8/8 certos).
