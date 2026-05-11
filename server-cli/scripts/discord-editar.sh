#!/bin/bash
# V2.14 D — Edita mensagem do BOT no Discord (só própria mensagem)
# Uso:
#   bash scripts/discord-editar.sh ultima "<novo texto>"
#   bash scripts/discord-editar.sh <canal_id> <message_id> "<novo texto>"

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

PORT="${PINGUIM_PORT:-3737}"

if [ "$1" = "ultima" ]; then
  NOVO_TEXTO="$2"
  RESULT=$(curl -s -X POST "http://localhost:${PORT}/api/discord/ultimas-do-bot" -H "Content-Type: application/json" -d '{}')
  CANAL_ID=$(echo "$RESULT" | python -c "import sys,json; d=json.loads(sys.stdin.read()); m=(d.get('mensagens') or [{}])[0]; print(m.get('canal_id',''))")
  MSG_ID=$(echo "$RESULT" | python -c "import sys,json; d=json.loads(sys.stdin.read()); m=(d.get('mensagens') or [{}])[0]; print(m.get('message_id',''))")
else
  CANAL_ID="$1"
  MSG_ID="$2"
  NOVO_TEXTO="$3"
fi

if [ -z "$CANAL_ID" ] || [ -z "$MSG_ID" ] || [ -z "$NOVO_TEXTO" ]; then
  echo "Uso: bash scripts/discord-editar.sh ultima \"<texto>\"  OU  <canal_id> <message_id> \"<texto>\"" >&2
  exit 1
fi

BODY=$(NOVO_TEXTO="$NOVO_TEXTO" CANAL_ID="$CANAL_ID" MSG_ID="$MSG_ID" python -c "
import json, os
print(json.dumps({'canal_id': os.environ['CANAL_ID'], 'message_id': os.environ['MSG_ID'], 'texto': os.environ['NOVO_TEXTO']}, ensure_ascii=False))
")

echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/discord/editar" -H "Content-Type: application/json" --data-binary @- | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print(f'[OK] Mensagem editada')
"
