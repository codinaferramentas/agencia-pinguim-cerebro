#!/bin/bash
# V2.13 — Modifica label de email (ler/nao-lido/star/arquivar/spam/lixo).
# IMPORTANTE: arquivar/spam/lixo sao destrutivos — Atendente DEVE pedir
# confirmacao no chat antes de rodar.
#
# Uso: bash scripts/gmail-modificar.sh <messageId> <op>
# ops: lido | nao-lido | starred | unstarred | arquivar | spam | lixo
#
# Ex:  bash scripts/gmail-modificar.sh 18a3b2c1 lido        # marca como lido
#      bash scripts/gmail-modificar.sh 18a3b2c1 arquivar    # tira da inbox
#      bash scripts/gmail-modificar.sh 18a3b2c1 starred     # marca com estrela

set -e

MESSAGE_ID="$1"
OP="$2"

if [ -z "$MESSAGE_ID" ] || [ -z "$OP" ]; then
  echo "ERRO: Uso: bash scripts/gmail-modificar.sh <messageId> <op>" >&2
  echo "  ops validas: lido | nao-lido | starred | unstarred | arquivar | spam | lixo" >&2
  exit 1
fi

PORT="${PINGUIM_PORT:-3737}"

BODY=$(python -c "import json,sys; print(json.dumps({'messageId': sys.argv[1], 'op': sys.argv[2]}))" "$MESSAGE_ID" "$OP")

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/gmail/modificar" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "$RESPONSE" | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print(f'ERRO: resposta invalida: {e}')
    sys.exit(1)

if not d.get('ok'):
    print(f'ERRO Gmail API: {d.get(\"error\", \"?\")}')
    sys.exit(1)

print(f'[OK] Email modificado.')
print(f'  ID: {d.get(\"id\", \"?\")}')
print(f'  Op aplicada: {d.get(\"op_aplicada\", \"?\")}')
labels = d.get('label_ids', [])
if labels:
    print(f'  Labels atuais: {\", \".join(labels)}')
print(f'  Latencia: {d.get(\"latencia_ms\", 0)}ms')
"
