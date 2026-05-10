#!/bin/bash
# V2.14 D — Envia mensagem WhatsApp via instância Evolution.
# IMPORTANTE: Atendente Pinguim DEVE pedir confirmacao no chat antes de
# rodar esse script (mostra plano: para/preview do texto).
#
# Trata 409 bloqueio_duplicata da Camada B anti-duplicacao (igual Gmail).
#
# Uso:
#   bash scripts/whatsapp-enviar.sh "<numero>" "<texto>" [forcar]
#
# Numero pode vir com ou sem formatacao (5511984290116, +55 11 98429-0116, etc).
# Script normaliza pra digits-only antes de enviar.
#
# Force reenvio (bypass anti-duplicata) — usar APENAS quando socio confirmou:
#   bash scripts/whatsapp-enviar.sh "<numero>" "<texto>" forcar

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

NUMERO="$1"
TEXTO="$2"
FORCAR="${3:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$NUMERO" ] || [ -z "$TEXTO" ]; then
  echo "ERRO: faltou numero ou texto. Uso:" >&2
  echo "  bash scripts/whatsapp-enviar.sh \"<numero>\" \"<texto>\" [forcar]" >&2
  exit 1
fi

# Monta JSON via Python (preserva UTF-8 melhor que via $@)
BODY=$(NUMERO="$NUMERO" TEXTO="$TEXTO" FORCAR="$FORCAR" python -c "
import json, os
data = {
    'numero': os.environ.get('NUMERO', ''),
    'texto': os.environ.get('TEXTO', ''),
    'origem_canal': 'chat-web',
}
forcar = os.environ.get('FORCAR', '')
if forcar and forcar.lower() in ('forcar', 'force', 'true', '1', 'sim'):
    data['forcar'] = True
print(json.dumps(data, ensure_ascii=False))
")

# Envia com curl (--data-binary preserva UTF-8 melhor que -d)
RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/whatsapp/enviar" \
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
    print(f'[BLOQUEADO duplicata] Mensagem identica enviada ha {minutos} min pro mesmo numero.')
    print(f'Pra reenviar mesmo assim, rode novamente passando \"forcar\" no ultimo argumento.')
    sys.exit(2)

if not d.get('ok'):
    err = d.get('error', 'desconhecido')
    print(f'ERRO Evolution API: {err}')
    sys.exit(1)

print(f'[OK] WhatsApp enviado.')
print(f'  Para: {d.get(\"para_jid\", \"?\")}')
print(f'  ID: {d.get(\"id\", \"?\")}')
print(f'  Instancia: {d.get(\"instancia\", \"?\")}')
print(f'  Latencia: {d.get(\"latencia_ms\", 0)}ms')
if d.get('forcado'):
    print(f'  ⚠ FORCADO (bypass anti-duplicacao)')
"
