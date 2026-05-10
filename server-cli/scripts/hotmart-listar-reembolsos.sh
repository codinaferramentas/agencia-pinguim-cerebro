#!/bin/bash
# V2.14 D — G3 Listar reembolsos Hotmart por período BRT
#
# Uso: bash scripts/hotmart-listar-reembolsos.sh <start> <end> [moeda]

set -e
export PYTHONIOENCODING=utf-8

START="$1"; END="$2"; MOEDA="${3:-BRL}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$START" ] || [ -z "$END" ]; then
  echo "ERRO: bash scripts/hotmart-listar-reembolsos.sh <start> <end> [moeda]" >&2
  exit 1
fi

BODY=$(START="$START" END="$END" MOEDA="$MOEDA" python -c "
import json, os
print(json.dumps({'start_date_brt': os.environ['START'], 'end_date_brt': os.environ['END'], 'moeda': os.environ['MOEDA']}, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/listar-reembolsos" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)

if d['total'] == 0:
    print('[OK] Nenhum reembolso no periodo.'); sys.exit(0)

print(f'[OK] {d[\"total\"]} reembolso(s) | Receita perdida: R\$ {d.get(\"receita_total\", 0):.2f}')
for v in d.get('vendas', [])[:30]:
    data = (v.get('data_compra') or '')[:10]
    print(f'  - {data} | {v.get(\"produto\") or \"?\"} | {v.get(\"buyer_email\") or \"?\"} | R\$ {v.get(\"valor\", 0):.2f} | {v.get(\"transaction_code\")}')
"
