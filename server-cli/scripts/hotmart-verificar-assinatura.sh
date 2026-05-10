#!/bin/bash
# V2.14 D — G4 Verificar assinatura ativa Hotmart por email
#
# Uso: bash scripts/hotmart-verificar-assinatura.sh <email> [produto_id]

set -e
export PYTHONIOENCODING=utf-8

EMAIL="$1"; PRODUTO="${2:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$EMAIL" ]; then
  echo "ERRO: bash scripts/hotmart-verificar-assinatura.sh <email> [produto_id]" >&2
  exit 1
fi

BODY=$(EMAIL="$EMAIL" PRODUTO="$PRODUTO" python -c "
import json, os
data = {'email': os.environ['EMAIL']}
if os.environ.get('PRODUTO'): data['produto_id'] = os.environ['PRODUTO']
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/verificar-assinatura" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)

if not d.get('ativa'):
    print(f'[OK] Sem assinatura ativa.')
    sys.exit(0)
print(f'[OK] {d[\"total_ativas\"]} assinatura(s) ativa(s):')
for s in d.get('assinaturas', []):
    print(f'  - {s.get(\"produto\") or \"?\"} ({s.get(\"plano\") or \"plano default\"}) | proxima cobranca: {s.get(\"proxima_cobranca\") or \"?\"} | code: {s.get(\"subscriber_code\")}')
"
