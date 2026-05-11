#!/bin/bash
# V2.14 D — Apaga mensagem do BOT no Discord (só apaga próprias mensagens — segurança)
# Uso:
#   bash scripts/discord-apagar.sh ultima                              # apaga ultima do bot em qualquer canal
#   bash scripts/discord-apagar.sh ultima <canal_id>                   # apaga ultima do bot num canal especifico
#   bash scripts/discord-apagar.sh <canal_id> <message_id>             # apaga mensagem especifica

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

ARG1="$1"
ARG2="$2"
PORT="${PINGUIM_PORT:-3737}"

if [ "$ARG1" = "ultima" ]; then
  # Resolve a ultima do bot
  BODY='{}'
  if [ -n "$ARG2" ]; then BODY="{\"canal_id\":\"$ARG2\"}"; fi

  RESULT=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/discord/ultimas-do-bot" \
    -H "Content-Type: application/json" --data-binary @-)

  CANAL_ID=$(echo "$RESULT" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'): print(''); sys.exit(0)
m = d.get('ultima') or (d.get('mensagens') and d['mensagens'][0])
if not m: print(''); sys.exit(0)
print(m.get('canal_id',''))
")
  MSG_ID=$(echo "$RESULT" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
m = d.get('ultima') or (d.get('mensagens') and d['mensagens'][0])
if not m: print(''); sys.exit(0)
print(m.get('message_id',''))
")

  if [ -z "$CANAL_ID" ] || [ -z "$MSG_ID" ]; then
    echo "ERRO: nao encontrei ultima mensagem do bot" >&2
    exit 1
  fi
else
  CANAL_ID="$ARG1"
  MSG_ID="$ARG2"
fi

if [ -z "$CANAL_ID" ] || [ -z "$MSG_ID" ]; then
  echo "Uso: bash scripts/discord-apagar.sh ultima [canal_id]  OU  <canal_id> <message_id>" >&2
  exit 1
fi

BODY="{\"canal_id\":\"$CANAL_ID\",\"message_id\":\"$MSG_ID\"}"
echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/discord/apagar" \
  -H "Content-Type: application/json" --data-binary @- | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print(f'[OK] Mensagem apagada (canal={d.get(\"canal_id\")}, message_id={d.get(\"message_id\")})')
"
