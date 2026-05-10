#!/bin/bash
# V2.14 D — G8 Notificar suporte interno: acesso pendente Princípia Pay
# (ou outra origem de pagamento que não libera acesso automático na Hotmart)
#
# Cria registro em pinguim.acessos_pendentes pra suporte humano cadastrar
# manualmente o aluno na área de membros. Quando V2.15 hybrid-ops-squad
# rodar, vai notificar Discord automaticamente.
#
# Uso:
#   bash scripts/hotmart-acesso-pendente.sh <email> <nome_aluno> <produto_nome> [origem_pagamento]

set -e
export PYTHONIOENCODING=utf-8

EMAIL="$1"; NOME="$2"; PRODUTO="$3"; ORIGEM="${4:-principia-pay}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$EMAIL" ] || [ -z "$PRODUTO" ]; then
  echo "ERRO: bash scripts/hotmart-acesso-pendente.sh <email> <nome_aluno> <produto_nome> [origem_pagamento]" >&2
  exit 1
fi

BODY=$(EMAIL="$EMAIL" NOME="$NOME" PRODUTO="$PRODUTO" ORIGEM="$ORIGEM" python -c "
import json, os
print(json.dumps({
    'email_aluno': os.environ['EMAIL'],
    'nome_aluno': os.environ.get('NOME', ''),
    'produto_hotmart_nome': os.environ['PRODUTO'],
    'origem_pagamento': os.environ['ORIGEM'],
}, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/notificar-acesso-pendente" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if d.get('bloqueado_duplicata'):
    print(f'[BLOQUEADO] Acesso pendente ja registrado ha {d.get(\"minutos_atras\", \"?\")}min pra esse aluno+produto.'); sys.exit(2)
if not d.get('ok'): print(f'ERRO: {d.get(\"error\")}'); sys.exit(1)
print(f'[OK] Acesso pendente registrado.')
print(f'  ID: {d.get(\"id\")}')
print(f'  Status: {d.get(\"status\")}')
if d.get('aviso'):
    print(f'  Aviso: {d[\"aviso\"]}')
"
