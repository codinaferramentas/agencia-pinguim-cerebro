#!/bin/bash
# V2.13/V2.14 — Envia email (responder thread ou novo).
# IMPORTANTE: Atendente Pinguim DEVE pedir confirmacao no chat antes de
# rodar esse script (mostra plano: para/assunto/preview do corpo).
#
# V2.14 fix: usa stdin pra passar argumentos UTF-8 (evita mojibake do bash
# Windows). Tambem trata 409 bloqueio_duplicata da Camada B anti-duplicacao.
#
# Uso (responder):
#   bash scripts/gmail-responder.sh reply <messageId> "<corpo>" [cc] [forcar]
#
# Uso (novo email):
#   bash scripts/gmail-responder.sh novo "<para>" "<assunto>" "<corpo>" [cc] [forcar]
#
# Force reenvio (bypass anti-duplicata):
#   bash scripts/gmail-responder.sh novo "<para>" "<assunto>" "<corpo>" "" forcar

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

MODO="$1"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$MODO" ]; then
  echo "ERRO: faltou modo. Uso:" >&2
  echo "  reply <messageId> \"<corpo>\" [cc] [forcar]" >&2
  echo "  novo  \"<para>\" \"<assunto>\" \"<corpo>\" [cc] [forcar]" >&2
  exit 1
fi

# Helper Python que recebe args via env vars (preserva UTF-8 melhor que via $@)
montar_body_novo() {
  PARA="$1" ASSUNTO="$2" CORPO="$3" CC="$4" FORCAR="$5" python -c "
import json, os
data = {
    'para': os.environ.get('PARA', ''),
    'assunto': os.environ.get('ASSUNTO', ''),
    'corpo': os.environ.get('CORPO', ''),
    'origem_canal': 'chat-web',
}
cc = os.environ.get('CC', '')
if cc and cc != '':
    data['cc'] = cc
forcar = os.environ.get('FORCAR', '')
if forcar and forcar.lower() in ('forcar', 'force', 'true', '1', 'sim'):
    data['forcar'] = True
print(json.dumps(data, ensure_ascii=False))
"
}

montar_body_reply() {
  PARA="$1" ASSUNTO="$2" CORPO="$3" MSGID="$4" CC="$5" FORCAR="$6" python -c "
import json, os
data = {
    'para': os.environ.get('PARA', ''),
    'assunto': os.environ.get('ASSUNTO', ''),
    'corpo': os.environ.get('CORPO', ''),
    'reply_to_message_id': os.environ.get('MSGID', ''),
    'origem_canal': 'chat-web',
}
cc = os.environ.get('CC', '')
if cc and cc != '':
    data['cc'] = cc
forcar = os.environ.get('FORCAR', '')
if forcar and forcar.lower() in ('forcar', 'force', 'true', '1', 'sim'):
    data['forcar'] = True
print(json.dumps(data, ensure_ascii=False))
"
}

if [ "$MODO" = "reply" ]; then
  MESSAGE_ID="$2"
  CORPO="$3"
  CC="${4:-}"
  FORCAR="${5:-}"

  if [ -z "$MESSAGE_ID" ] || [ -z "$CORPO" ]; then
    echo "ERRO: reply exige <messageId> \"<corpo>\"" >&2
    exit 1
  fi

  # Busca dados do email original
  ORIG_BODY=$(MSGID="$MESSAGE_ID" python -c "
import json, os
print(json.dumps({'messageId': os.environ.get('MSGID')}))
")
  ORIG=$(curl -s -X POST "http://localhost:${PORT}/api/gmail/ler" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d "$ORIG_BODY")

  PARA_ASSUNTO=$(echo "$ORIG" | python -c "
import sys, json, re
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print('ERRO:'+d.get('error', '?'))
    sys.exit(1)
de = d.get('de', '')
m = re.search(r'<([^>]+)>', de)
email = m.group(1) if m else de
assunto = d.get('assunto', '(sem assunto)')
if not assunto.lower().startswith('re:'):
    assunto = f'Re: {assunto}'
print(email + chr(31) + assunto)
")
  if [[ "$PARA_ASSUNTO" == ERRO:* ]]; then
    echo "$PARA_ASSUNTO"
    exit 1
  fi
  PARA=$(echo "$PARA_ASSUNTO" | python -c "import sys; print(sys.stdin.read().split(chr(31))[0])")
  ASSUNTO=$(echo "$PARA_ASSUNTO" | python -c "import sys; print(sys.stdin.read().split(chr(31))[1].strip())")

  BODY=$(montar_body_reply "$PARA" "$ASSUNTO" "$CORPO" "$MESSAGE_ID" "$CC" "$FORCAR")

elif [ "$MODO" = "novo" ]; then
  PARA="$2"
  ASSUNTO="$3"
  CORPO="$4"
  CC="${5:-}"
  FORCAR="${6:-}"

  if [ -z "$PARA" ] || [ -z "$ASSUNTO" ] || [ -z "$CORPO" ]; then
    echo "ERRO: novo exige \"<para>\" \"<assunto>\" \"<corpo>\"" >&2
    exit 1
  fi

  BODY=$(montar_body_novo "$PARA" "$ASSUNTO" "$CORPO" "$CC" "$FORCAR")

else
  echo "ERRO: modo invalido: $MODO. Use 'reply' ou 'novo'." >&2
  exit 1
fi

# Envia com curl (--data-binary preserva UTF-8 melhor que -d)
RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/gmail/responder" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print(f'ERRO: resposta invalida: {e}')
    sys.exit(1)

# Caso especial: 409 anti-duplicacao
if d.get('bloqueado_duplicata'):
    minutos = d.get('minutos_atras', '?')
    print(f'[BLOQUEADO duplicata] Email identico foi enviado ha {minutos} min.')
    print(f'Pra reenviar mesmo assim, rode novamente passando \"forcar\" no ultimo argumento.')
    print(f'Detalhe: acao_anterior_id = {d.get(\"acao_anterior_id\")}')
    sys.exit(2)

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
