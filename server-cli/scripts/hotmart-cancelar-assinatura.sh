#!/bin/bash
# V2.14 D — G6 Cancelar assinatura Hotmart (ESCRITA + Camada B)
#
# Uso: bash scripts/hotmart-cancelar-assinatura.sh <subscriber_code> [send_mail=true|false] [forcar]

set -e
export PYTHONIOENCODING=utf-8

CODE="$1"; SEND_MAIL="${2:-true}"; FORCAR="${3:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$CODE" ]; then
  echo "ERRO: bash scripts/hotmart-cancelar-assinatura.sh <subscriber_code> [send_mail=true|false] [forcar]" >&2
  exit 1
fi

BODY=$(CODE="$CODE" SEND_MAIL="$SEND_MAIL" FORCAR="$FORCAR" python -c "
import json, os
data = {'subscriber_code': os.environ['CODE'], 'send_mail': os.environ.get('SEND_MAIL', 'true').lower() != 'false'}
forcar = os.environ.get('FORCAR', '')
if forcar and forcar.lower() in ('forcar', 'force', 'true', '1', 'sim'):
    data['forcar'] = True
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/cancelar-assinatura" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if d.get('bloqueado_duplicata'):
    print(f'[BLOQUEADO] Cancelamento dessa assinatura foi tentado ha {d.get(\"minutos_atras\", \"?\")}min.'); sys.exit(2)
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print('[OK] Cancelamento processado.')
"
