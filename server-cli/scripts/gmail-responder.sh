#!/bin/bash
# V2.13 — Envia email (responder thread ou novo).
# IMPORTANTE: Atendente Pinguim DEVE pedir confirmacao no chat antes de
# rodar esse script (mostra plano: para/assunto/preview do corpo).
#
# Uso (responder):
#   bash scripts/gmail-responder.sh reply <messageId> "<corpo>"
#
# Uso (novo email):
#   bash scripts/gmail-responder.sh novo "<para>" "<assunto>" "<corpo>"
#
# Uso (com CC):
#   bash scripts/gmail-responder.sh reply <messageId> "<corpo>" "<cc>"

set -e

MODO="$1"

if [ -z "$MODO" ]; then
  echo "ERRO: faltou modo. Uso:" >&2
  echo "  reply <messageId> \"<corpo>\" [cc]" >&2
  echo "  novo  \"<para>\" \"<assunto>\" \"<corpo>\" [cc]" >&2
  exit 1
fi

PORT="${PINGUIM_PORT:-3737}"

if [ "$MODO" = "reply" ]; then
  MESSAGE_ID="$2"
  CORPO="$3"
  CC="${4:-}"

  if [ -z "$MESSAGE_ID" ] || [ -z "$CORPO" ]; then
    echo "ERRO: reply exige <messageId> \"<corpo>\"" >&2
    exit 1
  fi

  # Pra reply, precisamos buscar o email original pra extrair assunto+para automatico
  ORIG=$(curl -s -X POST "http://localhost:${PORT}/api/gmail/ler" \
    -H "Content-Type: application/json" \
    -d "$(python -c "import json,sys; print(json.dumps({'messageId': sys.argv[1]}))" "$MESSAGE_ID")")

  # Extrai dados do email original
  PARA_ASSUNTO=$(echo "$ORIG" | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print('ERRO:'+d.get('error', '?'))
    sys.exit(1)
de = d.get('de', '')
# Extrai apenas email do header 'De: Nome <email@x.com>'
import re
m = re.search(r'<([^>]+)>', de)
email = m.group(1) if m else de
assunto = d.get('assunto', '(sem assunto)')
if not assunto.lower().startswith('re:'):
    assunto = f'Re: {assunto}'
print(email + '|||' + assunto + '|||' + d.get('thread_id', ''))
")

  if [[ "$PARA_ASSUNTO" == ERRO:* ]]; then
    echo "$PARA_ASSUNTO"
    exit 1
  fi

  IFS='|||' read -r PARA ASSUNTO THREAD_ID <<< "$PARA_ASSUNTO"

  BODY=$(python -c "
import json, sys
data = {
    'para': sys.argv[1],
    'assunto': sys.argv[2],
    'corpo': sys.argv[3],
    'reply_to_message_id': sys.argv[4],
}
if sys.argv[5] and sys.argv[5] != '':
    data['cc'] = sys.argv[5]
print(json.dumps(data))
" "$PARA" "$ASSUNTO" "$CORPO" "$MESSAGE_ID" "$CC")

elif [ "$MODO" = "novo" ]; then
  PARA="$2"
  ASSUNTO="$3"
  CORPO="$4"
  CC="${5:-}"

  if [ -z "$PARA" ] || [ -z "$ASSUNTO" ] || [ -z "$CORPO" ]; then
    echo "ERRO: novo exige \"<para>\" \"<assunto>\" \"<corpo>\"" >&2
    exit 1
  fi

  BODY=$(python -c "
import json, sys
data = {
    'para': sys.argv[1],
    'assunto': sys.argv[2],
    'corpo': sys.argv[3],
}
if sys.argv[4] and sys.argv[4] != '':
    data['cc'] = sys.argv[4]
print(json.dumps(data))
" "$PARA" "$ASSUNTO" "$CORPO" "$CC")

else
  echo "ERRO: modo invalido: $MODO. Use 'reply' ou 'novo'." >&2
  exit 1
fi

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/gmail/responder" \
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
    print(f'ERRO Gmail API: {err}')
    sys.exit(1)

print(f'[OK] Email enviado.')
print(f'  ID: {d.get(\"id\", \"?\")}')
print(f'  Thread: {d.get(\"thread_id\", \"?\")}')
print(f'  Enviado em: {d.get(\"enviado_em\", \"?\")}')
print(f'  Latencia: {d.get(\"latencia_ms\", 0)}ms')
"
