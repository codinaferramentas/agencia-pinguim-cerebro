#!/bin/bash
# Busca semantica num Cerebro especifico via Edge Function Supabase.
# Uso: bash scripts/buscar-cerebro.sh <cerebro_slug> "<query>" [top_k]
# Ex:  bash scripts/buscar-cerebro.sh elo "qual a piramide da relevancia" 5

set -e

CEREBRO_SLUG="$1"
QUERY="$2"
TOP_K="${3:-5}"

if [ -z "$CEREBRO_SLUG" ] || [ -z "$QUERY" ]; then
  echo "ERRO: faltou parametro. Uso: bash scripts/buscar-cerebro.sh <slug> \"<query>\" [top_k]" >&2
  exit 1
fi

# Credenciais ja vem do ambiente (Node injeta as vars de .env.local).
# Se rodar standalone, exportar antes: export $(grep -v '^#' /c/Squad/.env.local | xargs)
if [ -z "$SUPABASE_PROJECT_REF" ] || [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  # Fallback: tenta carregar /c/Squad/.env.local diretamente
  if [ -f "/c/Squad/.env.local" ]; then
    set -a
    . "/c/Squad/.env.local"
    set +a
  fi
fi

if [ -z "$SUPABASE_PROJECT_REF" ] || [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "ERRO: SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN nao definidos." >&2
  exit 1
fi

# 1. Resolver cerebro_slug -> cerebro_id via API SQL
RESOLVE_SQL=$(cat <<EOF
SELECT c.id FROM pinguim.cerebros c
JOIN pinguim.produtos p ON p.id = c.produto_id
WHERE p.slug = '$CEREBRO_SLUG'
LIMIT 1;
EOF
)

CEREBRO_ID=$(curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"query": %s}' "$(printf '%s' "$RESOLVE_SQL" | python -c "import sys, json; print(json.dumps(sys.stdin.read()))")")" \
  | python -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d and len(d)>0 else '')")

if [ -z "$CEREBRO_ID" ]; then
  echo "ERRO: Cerebro '$CEREBRO_SLUG' nao encontrado. Slugs validos: elo, proalt, lyra, tuarus, orion, desafio-de-conte-do-lo-fi, mentoria-express, spin-selling, challenger-sale, meddic, sandler-selling, tactical-empathy-voss" >&2
  exit 1
fi

# 2. Chamar Edge Function buscar-cerebro
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/buscar-cerebro" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(python -c "import json,sys; print(json.dumps({'cerebro_id': '$CEREBRO_ID', 'query': sys.argv[1], 'top_k': $TOP_K}))" "$QUERY")")

# 3. Output formatado pro agente ler
echo "$RESPONSE" | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except:
    print('ERRO: resposta invalida da Edge Function')
    sys.exit(1)

print(f'=== Cerebro: $CEREBRO_SLUG | Query: \"$QUERY\" ===')
print(f'Total chunks retornados: {d.get(\"total\", 0)}')
print()
for i, r in enumerate(d.get('resultados', [])[:$TOP_K], 1):
    sim = r.get('similarity', 0)
    titulo = r.get('titulo', '?')
    conteudo = (r.get('conteudo') or '')[:600]
    print(f'--- Chunk {i} (score {sim:.3f}) ---')
    print(f'Fonte: {titulo}')
    print(conteudo)
    print()
"
