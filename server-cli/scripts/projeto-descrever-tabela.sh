#!/bin/bash
# V2.14.6 — Descreve colunas de uma tabela num projeto externo
# Uso: bash scripts/projeto-descrever-tabela.sh <projeto> <tabela>

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

PROJETO="$1"
TABELA="$2"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$PROJETO" ] || [ -z "$TABELA" ]; then
  echo "Uso: bash scripts/projeto-descrever-tabela.sh <projeto> <tabela>" >&2
  exit 1
fi

BODY=$(PROJETO="$PROJETO" TABELA="$TABELA" python -c "
import json, os
print(json.dumps({'projeto': os.environ['PROJETO'], 'tabela': os.environ['TABELA']}, ensure_ascii=False))
")

echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/projeto-externo/descrever-tabela" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @- | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print(f'[OK] {d[\"projeto\"]}/{d[\"tabela\"]}: {d[\"total_colunas\"]} colunas')
for c in d.get('colunas', []):
    desc = f' — {c[\"descricao\"]}' if c.get('descricao') else ''
    print(f'  {c[\"nome\"]:<30} {c[\"tipo\"]:<15}{desc}')
"
