#!/bin/bash
# V2.12 Fase 4 — Edita conteudo de planilha Google.
#
# IMPORTANTE: confirmacao humana JA DEVE TER SIDO DADA antes de chamar este
# script. O Atendente Pinguim mostra plano + pede 'sim/nao' pro socio
# antes de bater aqui. Este script nao confirma nada — so executa.
#
# Uso:
#   bash scripts/editar-drive.sh celula <fileId> "Aba" "B7" "novo valor"
#   bash scripts/editar-drive.sh celula <fileId> "" "B7" "novo valor"          # primeira aba
#   bash scripts/editar-drive.sh range  <fileId> "Aba" "A1:B2" '[["x","y"],["a","b"]]'
#   bash scripts/editar-drive.sh append <fileId> "Aba" '[["nova linha"]]'
#
# Retorna markdown com antes/depois + link.

set -e

OPERACAO="$1"
FILE_ID="$2"
ABA="$3"

if [ -z "$OPERACAO" ] || [ -z "$FILE_ID" ]; then
  echo "ERRO: faltam argumentos." >&2
  echo "Uso: bash scripts/editar-drive.sh <operacao> <fileId> <aba> <args...>" >&2
  echo "  operacao = celula | range | append" >&2
  exit 1
fi

PORT="${PINGUIM_PORT:-3737}"

case "$OPERACAO" in
  celula)
    CELULA="$4"
    VALOR="$5"
    if [ -z "$CELULA" ]; then
      echo "ERRO: faltou celula. Uso: ... celula <fileId> <aba> <celula> <valor>" >&2
      exit 1
    fi
    BODY=$(python -c "
import json,sys
b = {'fileId': sys.argv[1], 'operacao': 'celula', 'celula': sys.argv[3], 'valor': sys.argv[4]}
if sys.argv[2]:
    b['aba'] = sys.argv[2]
print(json.dumps(b))
" "$FILE_ID" "$ABA" "$CELULA" "$VALOR")
    ;;
  range)
    RANGE="$4"
    VALORES_JSON="$5"
    if [ -z "$RANGE" ] || [ -z "$VALORES_JSON" ]; then
      echo "ERRO: faltou range ou valores. Uso: ... range <fileId> <aba> <range> <valores-json>" >&2
      exit 1
    fi
    BODY=$(python -c "
import json,sys
b = {'fileId': sys.argv[1], 'operacao': 'range', 'range': sys.argv[3], 'valores': json.loads(sys.argv[4])}
if sys.argv[2]:
    b['aba'] = sys.argv[2]
print(json.dumps(b))
" "$FILE_ID" "$ABA" "$RANGE" "$VALORES_JSON")
    ;;
  append)
    VALORES_JSON="$4"
    if [ -z "$VALORES_JSON" ]; then
      echo "ERRO: faltou valores. Uso: ... append <fileId> <aba> <valores-json>" >&2
      exit 1
    fi
    BODY=$(python -c "
import json,sys
b = {'fileId': sys.argv[1], 'operacao': 'append', 'valores': json.loads(sys.argv[3])}
if sys.argv[2]:
    b['aba'] = sys.argv[2]
print(json.dumps(b))
" "$FILE_ID" "$ABA" "$VALORES_JSON")
    ;;
  *)
    echo "ERRO: operacao invalida '$OPERACAO'. Use celula | range | append" >&2
    exit 1
    ;;
esac

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/drive/editar" \
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
    if 'nao encontrado' in err.lower() or 'nao cadastr' in err.lower() or 'conectar' in err.lower():
        print('GAP: Google nao conectado. http://localhost:3737/conectar-google')
    else:
        print(f'ERRO: {err}')
    sys.exit(1)

nome = d.get('nome', 'planilha')
aba = d.get('aba', '?')
link = d.get('link', '')
latencia = d.get('latencia_ms', 0)

if 'celula' in d:
    print(f'OK: alteracao feita em **{nome}** ({latencia}ms)')
    print(f'Aba: {aba} | Celula: {d[\"celula\"]}')
    print(f'Antes:  {d.get(\"antes\")!r}')
    print(f'Depois: {d.get(\"depois\")!r}')
elif 'linhas_adicionadas' in d:
    print(f'OK: {d[\"linhas_adicionadas\"]} linha(s) adicionada(s) em **{nome}** ({latencia}ms)')
    print(f'Aba: {aba} | Range efetivo: {d.get(\"range_efetivo\")}')
    print(f'Celulas alteradas: {d.get(\"celulas_alteradas\")}')
else:
    print(f'OK: range alterado em **{nome}** ({latencia}ms)')
    print(f'Aba: {aba} | Range efetivo: {d.get(\"range_efetivo\")}')
    print(f'Linhas: {d.get(\"linhas_alteradas\")} | Colunas: {d.get(\"colunas_alteradas\")} | Celulas: {d.get(\"celulas_alteradas\")}')

print(f'Link: {link}')
"
