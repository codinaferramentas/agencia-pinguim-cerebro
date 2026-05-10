#!/bin/bash
# V2.14 D — G2 Listar vendas Hotmart por período BRT
#
# Uso:
#   bash scripts/hotmart-listar-vendas.sh "<start_YYYY-MM-DD>" "<end_YYYY-MM-DD>" [produto_id] [status] [moeda]
# Exemplos:
#   bash scripts/hotmart-listar-vendas.sh 2026-05-01 2026-05-09
#   bash scripts/hotmart-listar-vendas.sh 2026-05-01 2026-05-09 "" "approved,completed" BRL

set -e
export PYTHONIOENCODING=utf-8

START="$1"; END="$2"; PRODUTO="${3:-}"; STATUS="${4:-}"; MOEDA="${5:-BRL}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$START" ] || [ -z "$END" ]; then
  echo "ERRO: bash scripts/hotmart-listar-vendas.sh <start> <end> [produto] [status] [moeda]" >&2
  exit 1
fi

BODY=$(START="$START" END="$END" PRODUTO="$PRODUTO" STATUS="$STATUS" MOEDA="$MOEDA" python -c "
import json, os
data = {'start_date_brt': os.environ['START'], 'end_date_brt': os.environ['END'], 'moeda': os.environ['MOEDA']}
if os.environ.get('PRODUTO'): data['produto_id'] = os.environ['PRODUTO']
if os.environ.get('STATUS'): data['status'] = os.environ['STATUS']
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/listar-vendas" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)

print(f'[OK] {d[\"total\"]} vendas | Receita total: R\$ {d.get(\"receita_total\", 0):.2f} | fonte: {d.get(\"fonte\")}')
for v in d.get('vendas', [])[:30]:
    data = (v.get('data_compra') or '')[:10]
    print(f'  - {data} | {v.get(\"produto\") or \"?\"} | {v.get(\"buyer_email\") or \"?\"} | status={v.get(\"status\")} | R\$ {v.get(\"valor\", 0):.2f} (com R\$ {v.get(\"comissao\", 0):.2f}) | {v.get(\"transaction_code\")}')
if d['total'] > 30:
    print(f'  ... +{d[\"total\"] - 30} mais')
"
