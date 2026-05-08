#!/bin/bash
# V2.12 Fase 1 — Busca arquivos no Google Drive do socio conectado.
# Uso: bash scripts/buscar-drive.sh "<query>" [pageSize]
# Ex:  bash scripts/buscar-drive.sh "copy do Elo" 10
#
# Retorna lista markdown com arquivos encontrados (link clicavel).
#
# Pre-requisito: socio precisa ter conectado Google em /conectar-google.
# Se ainda nao conectou, retorna mensagem honesta.

set -e

QUERY="$1"
PAGE_SIZE="${2:-10}"

if [ -z "$QUERY" ]; then
  echo "ERRO: faltou query. Uso: bash scripts/buscar-drive.sh \"<query>\" [pageSize]" >&2
  exit 1
fi

# Server-cli precisa estar rodando em localhost:3737
PORT="${PINGUIM_PORT:-3737}"

# Monta JSON do body com Python (evita problemas de quoting)
BODY=$(python -c "import json,sys; print(json.dumps({'query': sys.argv[1], 'pageSize': int(sys.argv[2])}))" "$QUERY" "$PAGE_SIZE")

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/drive/buscar" \
  -H "Content-Type: application/json" \
  -d "$BODY")

# Parser amigavel — retorna markdown legivel pro agente
echo "$RESPONSE" | python -c "
import sys, json

try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print(f'ERRO: resposta invalida do server-cli: {e}')
    sys.exit(1)

if not d.get('ok'):
    err = d.get('error', 'desconhecido')
    if 'nao encontrado' in err.lower() or 'nao cadastr' in err.lower() or 'conectar' in err.lower():
        print('GAP: Google nao conectado pra esse socio. Acessar http://localhost:3737/conectar-google primeiro.')
        print(f'Detalhe: {err}')
    else:
        print(f'ERRO Drive API: {err}')
    sys.exit(0)

arquivos = d.get('arquivos', [])
total = d.get('total_retornado', 0)
latencia = d.get('latencia_ms', 0)

# Mapa amigavel de mimeTypes
MIMES = {
    'application/vnd.google-apps.document':     'Doc',
    'application/vnd.google-apps.spreadsheet':  'Planilha',
    'application/vnd.google-apps.presentation': 'Slides',
    'application/vnd.google-apps.folder':       'Pasta',
    'application/pdf':                           'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       'Excel',
    'image/jpeg':  'JPG', 'image/png': 'PNG',
    'video/mp4':   'MP4', 'audio/mpeg': 'MP3',
}

if total == 0:
    print(f'Nenhum arquivo encontrado pra \"{sys.argv[0] if False else \"\"}\". Drive busca por nome+conteudo.')
    print('Tenta sinonimo ou termo mais especifico.')
    sys.exit(0)

print(f'=== {total} arquivo(s) no Drive ({latencia}ms) ===')
print()
for i, a in enumerate(arquivos, 1):
    rotulo = MIMES.get(a.get('tipo'), (a.get('tipo') or '').split('/')[-1] or 'arquivo')
    nome = a.get('nome', 'sem-nome')
    link = a.get('link', '')
    mod = a.get('modificado_em', '')[:10] if a.get('modificado_em') else 'sem-data'
    donos = ', '.join(a.get('donos', [])[:2]) or 'sem-dono'
    print(f'{i}. [{rotulo}] **{nome}**')
    print(f'   Modificado: {mod} | Dono: {donos}')
    print(f'   Link: {link}')
    print()
"
