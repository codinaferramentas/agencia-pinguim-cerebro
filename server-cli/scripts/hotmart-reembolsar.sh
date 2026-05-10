#!/bin/bash
# V2.14 D — G5 Aprovar reembolso de venda Hotmart (ESCRITA)
# IRREVERSÍVEL. Atendente DEVE pedir confirmação no chat antes.
# Camada B anti-duplicação: janela 60min (refund acidental é catastrófico).
#
# Uso:
#   bash scripts/hotmart-reembolsar.sh <transaction> [forcar]

set -e
export PYTHONIOENCODING=utf-8

TRANSACTION="$1"; FORCAR="${2:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$TRANSACTION" ]; then
  echo "ERRO: bash scripts/hotmart-reembolsar.sh <transaction> [forcar]" >&2
  exit 1
fi

BODY=$(TX="$TRANSACTION" FORCAR="$FORCAR" python -c "
import json, os
data = {'transaction': os.environ['TX']}
forcar = os.environ.get('FORCAR', '')
if forcar and forcar.lower() in ('forcar', 'force', 'true', '1', 'sim'):
    data['forcar'] = True
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/reembolsar" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())

if d.get('bloqueado_duplicata'):
    minutos = d.get('minutos_atras', '?')
    print(f'[BLOQUEADO duplicata] Refund foi tentado ha {minutos}min nessa mesma transaction.')
    print('Pra forcar mesmo assim, rode passando \"forcar\" como segundo arg.')
    sys.exit(2)

if not d.get('ok'):
    print(f'ERRO Hotmart: {d.get(\"error\", \"desconhecido\")}'); sys.exit(1)

print(f'[OK] Refund processado.')
if d.get('forcado'):
    print(f'  ⚠ FORCADO (bypass anti-duplicacao)')
print(f'  Transaction: {d.get(\"transaction\") or sys.argv[1] if len(sys.argv) > 1 else \"?\"}')
print(f'  Latencia: {d.get(\"latencia_ms\", 0)}ms')
"
