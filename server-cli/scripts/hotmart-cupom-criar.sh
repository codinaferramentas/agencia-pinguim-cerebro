#!/bin/bash
# V2.14 D — G7 Criar cupom Hotmart (ESCRITA + Camada B)
#
# Uso: bash scripts/hotmart-cupom-criar.sh <product_id> <code> <discount_decimal> [start_date] [end_date] [max_uses] [forcar]
# Exemplo: bash scripts/hotmart-cupom-criar.sh 1234567 BLACK10 0.10 2026-11-25 2026-11-30 100
# IMPORTANTE: discount é DECIMAL 0-1 (0.10 = 10%, NÃO 10)

set -e
export PYTHONIOENCODING=utf-8

PRODUCT="$1"; CODE="$2"; DISCOUNT="$3"
START="${4:-}"; END="${5:-}"; MAX_USES="${6:-}"; FORCAR="${7:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$PRODUCT" ] || [ -z "$CODE" ] || [ -z "$DISCOUNT" ]; then
  echo "ERRO: bash scripts/hotmart-cupom-criar.sh <product_id> <code> <discount_0-1> [start] [end] [max_uses] [forcar]" >&2
  echo "  discount = decimal 0-1 (ex: 0.10 = 10%)" >&2
  exit 1
fi

BODY=$(PRODUCT="$PRODUCT" CODE="$CODE" DISCOUNT="$DISCOUNT" START="$START" END="$END" MAX_USES="$MAX_USES" FORCAR="$FORCAR" python -c "
import json, os
data = {'product_id': os.environ['PRODUCT'], 'code': os.environ['CODE'], 'discount': float(os.environ['DISCOUNT'])}
if os.environ.get('START'): data['start_date'] = os.environ['START']
if os.environ.get('END'): data['end_date'] = os.environ['END']
if os.environ.get('MAX_USES'): data['max_uses'] = int(os.environ['MAX_USES'])
forcar = os.environ.get('FORCAR', '')
if forcar and forcar.lower() in ('forcar', 'force', 'true', '1', 'sim'):
    data['forcar'] = True
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/cupom-criar" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if d.get('bloqueado_duplicata'):
    print(f'[BLOQUEADO] Cupom identico foi criado ha {d.get(\"minutos_atras\", \"?\")}min.'); sys.exit(2)
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print(f'[OK] Cupom {d.get(\"code\") or \"?\"} criado.')
print(f'  ID: {d.get(\"id\") or \"?\"}')
"
