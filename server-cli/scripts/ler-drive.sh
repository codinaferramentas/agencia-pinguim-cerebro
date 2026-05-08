#!/bin/bash
# V2.12 Fase 2 — Le conteudo de arquivo do Google Drive (Doc, Sheet, PDF, texto).
# Uso:
#   bash scripts/ler-drive.sh <fileId>                       # auto-detecta tipo
#   bash scripts/ler-drive.sh <fileId> abas                  # lista abas (planilha)
#   bash scripts/ler-drive.sh <fileId> "Aba 1"               # le aba especifica
#   bash scripts/ler-drive.sh <fileId> "Aba 1" "A1:D20"      # le range especifico
#
# Retorna markdown legivel:
#   - Doc/texto: titulo + conteudo (truncado em 4000 chars)
#   - Planilha:  cabecalho com abas + tabela markdown da aba lida
#   - PDF:       metadata + aviso (parser PDF nao implementado V1)
#
# Pre-requisito: socio precisa ter conectado Google em /conectar-google.

set -e

FILE_ID="$1"
ARG2="$2"
ARG3="$3"

if [ -z "$FILE_ID" ]; then
  echo "ERRO: faltou fileId. Uso: bash scripts/ler-drive.sh <fileId> [aba|abas] [range]" >&2
  exit 1
fi

PORT="${PINGUIM_PORT:-3737}"

# Modo "abas" — so lista abas da planilha
if [ "$ARG2" = "abas" ]; then
  BODY=$(python -c "import json,sys; print(json.dumps({'fileId': sys.argv[1], 'tipo': 'abas'}))" "$FILE_ID")
else
  # Modo normal — auto-detecta tipo, opcionalmente com aba/range
  BODY=$(python -c "
import json,sys
b = {'fileId': sys.argv[1], 'tipo': 'auto'}
if len(sys.argv) > 2 and sys.argv[2]:
    b['aba'] = sys.argv[2]
if len(sys.argv) > 3 and sys.argv[3]:
    b['range'] = sys.argv[3]
print(json.dumps(b))
" "$FILE_ID" "$ARG2" "$ARG3")
fi

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/drive/ler" \
  -H "Content-Type: application/json" \
  -d "$BODY")

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

tipo = d.get('tipo')
nome = d.get('nome', 'sem-nome')
link = d.get('link', '')
latencia = d.get('latencia_ms', 0)

# Modo lista de abas (sem 'tipo')
if 'abas' in d and not tipo:
    abas = d['abas']
    print(f'=== {len(abas)} aba(s) ({latencia}ms) ===')
    for a in abas:
        print(f\"- {a['titulo']}  ({a.get('linhas','?')} linhas x {a.get('colunas','?')} colunas)\")
    sys.exit(0)

if tipo == 'doc' or tipo == 'texto':
    texto = d.get('texto', '') or ''
    chars = d.get('tamanho_chars', len(texto))
    print(f'=== {tipo.upper()}: **{nome}** ({chars} chars, {latencia}ms) ===')
    print(f'Link: {link}')
    print()
    if chars > 4000:
        print(texto[:4000])
        print()
        print(f'... [TRUNCADO - {chars - 4000} chars adicionais]')
    else:
        print(texto)
    sys.exit(0)

if tipo == 'planilha':
    abas = d.get('abas', [])
    aba_lida = d.get('aba_lida')
    valores = d.get('valores', [])
    total_linhas = d.get('total_linhas', len(valores))
    truncado = d.get('truncado', False)

    print(f'=== PLANILHA: **{nome}** ({latencia}ms) ===')
    print(f'Link: {link}')
    print(f'Abas disponiveis: {\", \".join(a[\"titulo\"] for a in abas)}')
    print(f'Lendo aba: **{aba_lida}** | range: {d.get(\"range_efetivo\", \"?\")} | linhas retornadas: {len(valores)}/{total_linhas}')
    if truncado:
        print(f'AVISO: planilha truncada em {d.get(\"limite_aplicado\")} linhas (passa range especifico pra ler mais)')
    print()

    if not valores:
        print('(planilha vazia)')
        sys.exit(0)

    # Renderiza primeiras N linhas como tabela markdown
    LIMITE_VISUAL = 30
    visual = valores[:LIMITE_VISUAL]

    # Normaliza: todas as linhas com mesmo num colunas (preenche com vazio)
    max_cols = max((len(linha) for linha in visual), default=0)
    norm = [[(linha[i] if i < len(linha) else '') for i in range(max_cols)] for linha in visual]

    # Header (linha 1) + separador
    if max_cols > 0:
        head = norm[0] if norm else []
        # Numera coluna pra agente saber qual letra (A, B, C...)
        letras = []
        for i in range(max_cols):
            n = i
            s = ''
            while True:
                s = chr(65 + n % 26) + s
                n = n // 26 - 1
                if n < 0: break
            letras.append(s)
        print('| # | ' + ' | '.join(letras) + ' |')
        print('|---|' + '|'.join(['---'] * max_cols) + '|')
        for idx, linha in enumerate(norm, 1):
            celulas = [str(c).replace('|', '\\\\|').replace('\\n', ' ') for c in linha]
            print(f'| {idx} | ' + ' | '.join(celulas) + ' |')

    if len(valores) > LIMITE_VISUAL:
        print()
        print(f'... [{len(valores) - LIMITE_VISUAL} linhas adicionais omitidas — passa range A1:Z{LIMITE_VISUAL+50} pra ver mais]')
    sys.exit(0)

if tipo == 'pdf':
    print(f'=== PDF: **{nome}** ({d.get(\"tamanho_bytes\", 0)} bytes, {latencia}ms) ===')
    print(f'Link: {link}')
    print()
    print('AVISO: parser de texto do PDF nao implementado nesta versao.')
    print('Abre o link pra visualizar, ou pede pra eu baixar e analisar separado.')
    sys.exit(0)

if tipo == 'desconhecido':
    print(f'=== {nome} ===')
    print(f'Tipo: {d.get(\"mimeType\", \"?\")}')
    print(f'Link: {link}')
    print()
    print(d.get('aviso', 'Tipo nao tem leitor estruturado.'))
    sys.exit(0)

print(f'AVISO: tipo nao reconhecido na resposta: {tipo}')
print(json.dumps(d, indent=2)[:500])
"
