#!/bin/bash
# Busca voz/metodo de um Clone (mestre clonado: Hormozi, Halbert, Schwartz, etc)
# Uso: bash scripts/buscar-clone.sh <clone_slug> "<query>" [top_k]
# Ex:  bash scripts/buscar-clone.sh clone-alex-hormozi "como montar oferta" 4

set -e

CLONE_SLUG="$1"
QUERY="$2"
TOP_K="${3:-4}"

if [ -z "$CLONE_SLUG" ] || [ -z "$QUERY" ]; then
  echo "ERRO: faltou parametro. Uso: bash scripts/buscar-clone.sh <slug> \"<query>\" [top_k]" >&2
  exit 1
fi

# Normaliza prefixo clone-
case "$CLONE_SLUG" in
  clone-*) ;;
  *) CLONE_SLUG="clone-$CLONE_SLUG" ;;
esac

ENV_FILE="$(dirname "$0")/../../.env.local"
set -a
source "$ENV_FILE"
set +a

# Resolve clone -> cerebro_id
RESOLVE_SQL=$(cat <<EOF
SELECT c.id FROM pinguim.cerebros c
JOIN pinguim.produtos p ON p.id = c.produto_id
WHERE p.slug = '$CLONE_SLUG' AND p.categoria = 'clone'
LIMIT 1;
EOF
)

QUERY_JSON=$(printf '%s' "$RESOLVE_SQL" | python -c "import sys, json; print(json.dumps({'query': sys.stdin.read()}))")

CEREBRO_ID=$(curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$QUERY_JSON" \
  | python -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d and len(d)>0 else '')")

if [ -z "$CEREBRO_ID" ]; then
  echo "ERRO: Clone '$CLONE_SLUG' nao encontrado. Use slug com prefixo 'clone-' (ex.: clone-alex-hormozi)." >&2
  exit 1
fi

RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/buscar-cerebro" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(python -c "import json,sys; print(json.dumps({'cerebro_id': '$CEREBRO_ID', 'query': sys.argv[1], 'top_k': $TOP_K}))" "$QUERY")")

echo "$RESPONSE" | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except:
    print('ERRO: resposta invalida')
    sys.exit(1)

print(f'=== Clone: $CLONE_SLUG | Query: \"$QUERY\" ===')
print(f'Total chunks: {d.get(\"total\", 0)}')
print()
for i, r in enumerate(d.get('resultados', [])[:$TOP_K], 1):
    sim = r.get('similarity', 0)
    titulo = r.get('titulo', '?')
    voz = (r.get('conteudo') or '')[:500]
    print(f'--- Voz {i} (score {sim:.3f}) ---')
    print(f'Fonte: {titulo}')
    print(voz)
    print()
"
