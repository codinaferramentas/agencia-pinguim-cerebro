#!/bin/bash
# V2.14 D — Cadastrar Club Hotmart (subdomain → produto) em pinguim.hotmart_clubs
# Valida o subdomain via API antes de gravar.
#
# Como descobrir o subdomain do produto:
#   URL https://hotmart.com/pt-br/club/SLUG/products/<id>  → subdomain = SLUG (ou versão sem hífen)
#   Ex: ProAlt URL = .../club/proalt/products/6811692 → subdomain = "proalt"
#   Ex: Elo URL = .../club/turbo-x/... → subdomain = "turbox" (sem hífen) ou "turbo-x" (com)
#
# Uso:
#   bash scripts/hotmart-cadastrar-club.sh "<subdomain>" ["<produto_nome>"] ["<produto_id>"]
# Exemplo:
#   bash scripts/hotmart-cadastrar-club.sh "proalt" "ProAlt - Low Ticket" 6811692

set -e
export PYTHONIOENCODING=utf-8

SUB="$1"; NOME="${2:-}"; PRODUTO_ID="${3:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$SUB" ]; then
  echo "ERRO: bash scripts/hotmart-cadastrar-club.sh <subdomain> [produto_nome] [produto_id]" >&2
  exit 1
fi

BODY=$(SUB="$SUB" NOME="$NOME" PID="$PRODUTO_ID" python -c "
import json, os
data = {'subdomain': os.environ['SUB']}
if os.environ.get('NOME'): data['produto_nome'] = os.environ['NOME']
if os.environ.get('PID'): data['produto_id'] = int(os.environ['PID'])
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/cadastrar-club" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\", \"desconhecido\")}')
    if d.get('detalhe'): print(f'  Detalhe: {d[\"detalhe\"]}')
    sys.exit(1)
print(f'[OK] Club cadastrado/atualizado:')
print(f'  Subdomain: {d.get(\"subdomain\")}')
print(f'  Produto: {d.get(\"produto_nome\") or \"(sem nome cadastrado)\"}')
print(f'  Modulos validados: {d.get(\"total_modulos\", 0)}')
"
