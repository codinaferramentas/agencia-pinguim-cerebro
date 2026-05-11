#!/bin/bash
# V2.14.6 — Consulta tabela num projeto externo (READ-ONLY)
# Uso:
#   bash scripts/projeto-consultar.sh <projeto> <tabela> [select] [ordem] [limite]
# Ex:
#   bash scripts/projeto-consultar.sh proalt profiles '*' 'created_at.desc' 10
#   bash scripts/projeto-consultar.sh elo user_progress 'user_id,progress,updated_at' 'updated_at.desc' 20

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

PROJETO="$1"
TABELA="$2"
SELECT="${3:-*}"
ORDEM="${4:-}"
LIMITE="${5:-10}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$PROJETO" ] || [ -z "$TABELA" ]; then
  echo "Uso: bash scripts/projeto-consultar.sh <projeto> <tabela> [select] [ordem] [limite]" >&2
  exit 1
fi

BODY=$(PROJETO="$PROJETO" TABELA="$TABELA" SELECT="$SELECT" ORDEM="$ORDEM" LIMITE="$LIMITE" python -c "
import json, os
b = {
  'projeto': os.environ['PROJETO'],
  'tabela': os.environ['TABELA'],
  'select': os.environ.get('SELECT', '*'),
  'limite': int(os.environ.get('LIMITE', '10')),
}
ordem = os.environ.get('ORDEM', '')
if ordem: b['ordem'] = ordem
print(json.dumps(b, ensure_ascii=False))
")

echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/projeto-externo/consultar" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @- | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print(f'[OK] {d[\"projeto\"]}/{d[\"tabela\"]}: {d[\"total\"]} linhas')
for i, row in enumerate(d.get('dados', [])[:20]):
    print(f'  [{i+1}] {json.dumps(row, ensure_ascii=False)[:200]}')
if d['total'] > 20: print(f'  ... +{d[\"total\"]-20} mais')
"
