#!/bin/bash
# V2.14 D Categoria L — Posta mensagem em canal Discord (cross-canal)
# Uso:
#   bash scripts/discord-postar.sh "<canal_id_ou_nome>" "<texto>"
#   bash scripts/discord-postar.sh "suporte" "Olha esse caso aqui pessoal"
#   bash scripts/discord-postar.sh "1234567890" "<@123> pode revisar isso?"

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

CANAL="$1"
TEXTO="$2"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$CANAL" ] || [ -z "$TEXTO" ]; then
  echo "Uso: bash scripts/discord-postar.sh \"<canal_id_ou_nome>\" \"<texto>\"" >&2
  exit 1
fi

# Detecta se eh ID numerico (snowflake Discord) ou nome
BODY=$(CANAL="$CANAL" TEXTO="$TEXTO" python -c "
import json, os
c = os.environ.get('CANAL','')
b = {'texto': os.environ.get('TEXTO','')}
# Snowflake Discord eh sempre numero longo (15-20 digitos)
if c.isdigit() and len(c) >= 15:
    b['canal_id'] = c
else:
    b['canal_nome'] = c
print(json.dumps(b, ensure_ascii=False))
")

echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/discord/postar" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @- | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print(f'ERRO: resposta invalida: {e}'); sys.exit(1)
if d.get('bloqueado_duplicata'):
    print(f'[BLOQUEADO] Mensagem identica postada no mesmo canal recentemente. Use forcar=true se quiser reenviar.')
    sys.exit(0)
if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\", \"desconhecido\")}')
    sys.exit(1)
canal = d.get('canal_nome') or d.get('canal_id')
print(f'[OK] Postado em #{canal} (id={d.get(\"canal_id\")})')
"
