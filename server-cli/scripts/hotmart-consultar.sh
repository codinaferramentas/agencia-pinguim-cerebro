#!/bin/bash
# V2.14 D — G1 Consultar comprador Hotmart por email (histórico completo)
# Tenta 2º Supabase primeiro (rápido), fallback API direta Hotmart.
#
# Uso:
#   bash scripts/hotmart-consultar.sh "<email>"

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

EMAIL="$1"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$EMAIL" ]; then
  echo "ERRO: faltou email. Uso: bash scripts/hotmart-consultar.sh \"<email>\"" >&2
  exit 1
fi

BODY=$(EMAIL="$EMAIL" python -c "
import json, os
print(json.dumps({'email': os.environ.get('EMAIL', '')}, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/consultar-comprador" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print(f'ERRO: resposta invalida: {e}'); sys.exit(1)

if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\", \"desconhecido\")}'); sys.exit(1)

c = d.get('comprador')
if not c:
    print(f'[NAO ENCONTRADO] Email \"{sys.argv[1] if len(sys.argv) > 1 else \"?\"}\" sem compras na Hotmart.')
    if d.get('motivo'):
        print(f'Motivo: {d[\"motivo\"]}')
    sys.exit(0)

print(f'[OK] Comprador encontrado (fonte: {d.get(\"fonte\")})')
print(f'Nome: {c.get(\"nome\") or \"-\"}')
print(f'Email: {c.get(\"email\")}')
if c.get('documento'): print(f'CPF/CNPJ: {c[\"documento\"]}')
if c.get('telefone'): print(f'Telefone: {c[\"telefone\"]}')
if c.get('primeira_compra'): print(f'Primeira compra: {c[\"primeira_compra\"]}')

vendas = d.get('vendas', [])
print(f'\nTotal de transacoes: {d.get(\"total_vendas\", 0)}')
for v in vendas[:20]:
    data = v.get('data_compra', '')[:10] if v.get('data_compra') else '?'
    print(f'  - {data} | {v.get(\"produto\") or \"?\"} | status={v.get(\"status\")} | R\$ {v.get(\"valor\", 0)} | {v.get(\"transaction_code\")}')
if len(vendas) > 20:
    print(f'  ... +{len(vendas) - 20} mais (cap em 20 pra display)')
print(f'\nLatencia: {d.get(\"latencia_ms\", 0)}ms')
"
