#!/bin/bash
# V2.13 — Le email completo (corpo + headers).
# Uso: bash scripts/gmail-ler.sh <messageId>
# Ex:  bash scripts/gmail-ler.sh 18a3b2c1d4e5f6

set -e

MESSAGE_ID="$1"

if [ -z "$MESSAGE_ID" ]; then
  echo "ERRO: faltou messageId. Uso: bash scripts/gmail-ler.sh <messageId>" >&2
  echo "Pegar messageId via: bash scripts/gmail-listar.sh" >&2
  exit 1
fi

PORT="${PINGUIM_PORT:-3737}"

BODY=$(python -c "import json,sys; print(json.dumps({'messageId': sys.argv[1]}))" "$MESSAGE_ID")

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/gmail/ler" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "$RESPONSE" | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print(f'ERRO: resposta invalida: {e}')
    sys.exit(1)

if not d.get('ok'):
    err = d.get('error', 'desconhecido')
    if 'Refresh token' in err or 'nao conectado' in err.lower():
        print('GAP: Google nao conectado pra esse socio.')
    else:
        print(f'ERRO Gmail API: {err}')
    sys.exit(0)

print(f'### Email')
print(f'**De:** {d.get(\"de\", \"?\")}')
print(f'**Para:** {d.get(\"para\", \"?\")}')
if d.get('cc'): print(f'**CC:** {d.get(\"cc\")}')
print(f'**Assunto:** {d.get(\"assunto\", \"(sem assunto)\")}')
print(f'**Data:** {d.get(\"data\", \"?\")}')
labels = d.get('labels', [])
if labels:
    print(f'**Labels:** {\", \".join(labels)}')
print(f'**ID:** {d.get(\"id\", \"\")}')
print(f'**Thread:** {d.get(\"thread_id\", \"\")}')
print()
print('---')
print()
texto = d.get('texto', '').strip()
if d.get('texto_truncado'):
    print(f'[Email truncado em {len(texto)} chars de {d.get(\"tamanho_chars\", \"?\")} totais]')
    print()
print(texto)
print()
print('---')
print(f'(latencia: {d.get(\"latencia_ms\", 0)}ms)')
"
