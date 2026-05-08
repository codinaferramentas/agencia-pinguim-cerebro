#!/bin/bash
# V2.13 — Lista emails do socio conectado.
# Uso: bash scripts/gmail-listar.sh ["query"] [pageSize]
# Ex:  bash scripts/gmail-listar.sh                          # default: in:inbox, 10 itens
#      bash scripts/gmail-listar.sh "is:unread" 5            # nao-lidos, 5 itens
#      bash scripts/gmail-listar.sh "from:fulano@x.com"      # de fulano
#      bash scripts/gmail-listar.sh "newer_than:3d" 20       # ultimos 3 dias

set -e

QUERY="${1:-in:inbox}"
PAGE_SIZE="${2:-10}"

PORT="${PINGUIM_PORT:-3737}"

BODY=$(python -c "import json,sys; print(json.dumps({'query': sys.argv[1], 'pageSize': int(sys.argv[2])}))" "$QUERY" "$PAGE_SIZE")

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/gmail/listar" \
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
    if 'Refresh token' in err or 'nao conectado' in err.lower() or 'CLIENT_ID' in err:
        print('GAP: Google nao conectado pra esse socio. Acessar http://localhost:3737/conectar-google primeiro.')
        print(f'Detalhe: {err}')
    elif 'gmail' in err.lower() and 'insufficient' in err.lower():
        print('GAP: escopo Gmail nao autorizado. Reconectar em /conectar-google pra autorizar gmail.modify.')
        print(f'Detalhe: {err}')
    else:
        print(f'ERRO Gmail API: {err}')
    sys.exit(0)

emails = d.get('emails', [])
total_retornado = d.get('total_retornado', 0)
total_estimado = d.get('total_estimado', 0)
latencia = d.get('latencia_ms', 0)

if total_retornado == 0:
    print(f'Nenhum email encontrado pra query: \"$QUERY\"')
    sys.exit(0)

print(f'=== {total_retornado} email(s) | estimativa total: {total_estimado} | query: $QUERY | {latencia}ms ===')
print()
for i, e in enumerate(emails, 1):
    de = e.get('de', '?')[:60]
    assunto = e.get('assunto', '(sem assunto)')[:80]
    data = e.get('data', '')[:30]
    snippet = e.get('snippet', '')[:120]
    lido = '[OK]' if e.get('lido') else '[--]'
    starred = '*' if e.get('starred') else ' '
    msg_id = e.get('id', '')[:16]
    print(f'{i}. {lido}{starred} **{assunto}**')
    print(f'   De: {de}')
    print(f'   {data}')
    if snippet:
        print(f'   {snippet}')
    print(f'   id: {msg_id}...  (use bash scripts/gmail-ler.sh {e.get(\"id\")} pra ler completo)')
    print()
"
