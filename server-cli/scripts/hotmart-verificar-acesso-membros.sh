#!/bin/bash
# V2.14 D — G4b Verificar ACESSO REAL à área de membros (Hotmart Club)
# IMPORTANTE: Members Area API ainda NÃO está habilitada na credencial.
# Por enquanto retorna gap honesto + sugestão de fluxo manual.
# Quando liberar, este script passa a retornar lista de produtos ativos.
#
# Uso: bash scripts/hotmart-verificar-acesso-membros.sh <email> [produto_id]

set -e
export PYTHONIOENCODING=utf-8

EMAIL="$1"; PRODUTO="${2:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$EMAIL" ]; then
  echo "ERRO: bash scripts/hotmart-verificar-acesso-membros.sh <email> [produto_id]" >&2
  exit 1
fi

BODY=$(EMAIL="$EMAIL" PRODUTO="$PRODUTO" python -c "
import json, os
data = {'email': os.environ['EMAIL']}
if os.environ.get('PRODUTO'): data['produto_id'] = os.environ['PRODUTO']
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/verificar-acesso-membros" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())

if d.get('disponivel') is False:
    print(f'[GAP HONESTO] Members Area API ainda não habilitada na credencial.')
    print(f'  Motivo: {d.get(\"motivo\")}')
    print(f'  Sugestão: {d.get(\"sugestao\")}')
    print(f'  Info disponível AGORA: {d.get(\"info_disponivel\")}')
    sys.exit(0)

# Quando Members Area liberar, este caminho vai retornar a lista real
print(f'[OK] Acesso à Members Area:')
for p in d.get('produtos_com_acesso', []):
    print(f'  - {p.get(\"produto\")} | ultimo_acesso: {p.get(\"ultimo_acesso\") or \"nunca\"}')
"
