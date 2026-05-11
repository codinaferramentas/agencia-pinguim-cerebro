#!/bin/bash
# V2.14.6 — Lista tabelas disponíveis num projeto externo (proalt | elo | sirius)
# Uso: bash scripts/projeto-listar-tabelas.sh <projeto>

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

PROJETO="$1"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$PROJETO" ]; then
  echo "Uso: bash scripts/projeto-listar-tabelas.sh <proalt|elo|sirius>" >&2
  exit 1
fi

BODY=$(PROJETO="$PROJETO" python -c "
import json, os
print(json.dumps({'projeto': os.environ.get('PROJETO','')}, ensure_ascii=False))
")

echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/projeto-externo/listar-tabelas" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @- | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print(f'[OK] {d[\"projeto\"]}: {d[\"total\"]} tabelas')
for t in d.get('tabelas', []): print(f'  - {t}')
"
