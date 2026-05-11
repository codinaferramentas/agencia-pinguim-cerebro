#!/bin/bash
# V2.15 — Skill top-engajados (Andre 2026-05-11)
# Gera relatório TOP N alunos engajados em ProAlt + Elo + Sirius
# em UMA chamada agregada (queries paralelas no Node, ~5-10s total).
#
# Uso:
#   bash scripts/relatorio-top-engajados.sh [top_n] [produtos]
#
# Defaults: top_n=15, produtos="proalt,elo,sirius"
#
# Exemplos:
#   bash scripts/relatorio-top-engajados.sh                       # top 15 dos 3 produtos
#   bash scripts/relatorio-top-engajados.sh 10                    # top 10 dos 3 produtos
#   bash scripts/relatorio-top-engajados.sh 20 proalt,elo         # top 20 de ProAlt e Elo
#   bash scripts/relatorio-top-engajados.sh 15 sirius             # top 15 só Sirius

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

TOP_N="${1:-15}"
PRODUTOS="${2:-proalt,elo,sirius}"
PORT="${PINGUIM_PORT:-3737}"

# Converte CSV em JSON array
PRODUTOS_JSON=$(echo "$PRODUTOS" | python -c "
import sys, json
csv = sys.stdin.read().strip()
print(json.dumps([p.strip() for p in csv.split(',') if p.strip()]))
")

BODY=$(TOP_N="$TOP_N" PRODUTOS_JSON="$PRODUTOS_JSON" python -c "
import json, os
b = {
  'top_n': int(os.environ['TOP_N']),
  'produtos': json.loads(os.environ['PRODUTOS_JSON']),
  'formato': 'markdown',
}
print(json.dumps(b, ensure_ascii=False))
")

echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/relatorio/top-engajados" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @- | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\")}')
    sys.exit(1)
print(d.get('md', '(sem markdown)'))
print(f\"\n_latência total: {d.get('latencia_total_ms', '?')}ms_\")
"
