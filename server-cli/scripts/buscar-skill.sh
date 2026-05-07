#!/bin/bash
# Busca Skills no banco por keyword. Retorna receita + Clones recomendados.
# Uso: bash scripts/buscar-skill.sh "<query>" [familia]
# Ex:  bash scripts/buscar-skill.sh "pagina de venda"
# Ex:  bash scripts/buscar-skill.sh "headline" copywriting

set -e

QUERY="$1"
FAMILIA="$2"

if [ -z "$QUERY" ]; then
  echo "ERRO: faltou query. Uso: bash scripts/buscar-skill.sh \"<query>\" [familia]" >&2
  exit 1
fi

if [ -z "$SUPABASE_PROJECT_REF" ] || [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  if [ -f "/c/Squad/.env.local" ]; then
    set -a
    . "/c/Squad/.env.local"
    set +a
  fi
fi
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  echo "ERRO: SUPABASE_PROJECT_REF nao definido." >&2
  exit 1
fi

# Match SQL com ranking simples
FAMILIA_FILTER=""
if [ -n "$FAMILIA" ]; then
  FAMILIA_FILTER="AND familia = '$FAMILIA'"
fi

SQL=$(cat <<EOF
SELECT slug, nome, descricao, conteudo_md, familia, formato, clones,
  (CASE WHEN slug ILIKE '%$QUERY%' THEN 3 ELSE 0 END) +
  (CASE WHEN descricao ILIKE '%$QUERY%' THEN 2 ELSE 0 END) +
  (CASE WHEN familia ILIKE '%$QUERY%' THEN 1 ELSE 0 END) AS score
FROM pinguim.skills
WHERE status = 'em_construcao'
  $FAMILIA_FILTER
  AND ((slug ILIKE '%$QUERY%') OR (descricao ILIKE '%$QUERY%') OR (familia ILIKE '%$QUERY%'))
ORDER BY score DESC, formato DESC NULLS LAST
LIMIT 5;
EOF
)

QUERY_JSON=$(printf '%s' "$SQL" | python -c "import sys, json; print(json.dumps({'query': sys.stdin.read()}))")

RESPONSE=$(curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$QUERY_JSON")

echo "$RESPONSE" | python -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
except:
    print('ERRO: resposta invalida')
    sys.exit(1)

if not d or len(d) == 0:
    print('Nenhuma Skill encontrada pra \"$QUERY\". Catalogo tem 46 skills — tenta sinonimo.')
    sys.exit(0)

print(f'=== {len(d)} SKILLS ENCONTRADAS pra \"$QUERY\" ===')
print()
for s in d:
    print(f'## {s[\"slug\"]}')
    print(f'**Nome:** {s.get(\"nome\", \"?\")}')
    print(f'**Familia:** {s.get(\"familia\", \"?\")} | **Formato:** {s.get(\"formato\", \"?\")} | **Score:** {s.get(\"score\", 0)}')
    print(f'**Descricao:** {s.get(\"descricao\", \"\")}')
    clones = s.get('clones') or []
    if clones:
        print(f'**Clones recomendados:** {\", \".join(clones)}')
    print()
    print('### Receita (SKILL.md):')
    md = s.get('conteudo_md') or ''
    print(md[:3000])
    print()
    print('---')
    print()
"
