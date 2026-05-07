#!/bin/bash
# Carrega Persona (dossie 11 blocos) vinculada ao Cerebro do produto.
# Uso: bash scripts/buscar-persona.sh <produto_slug>
# Ex:  bash scripts/buscar-persona.sh elo

set -e

PRODUTO_SLUG="$1"

if [ -z "$PRODUTO_SLUG" ]; then
  echo "ERRO: faltou produto_slug. Uso: bash scripts/buscar-persona.sh <slug>" >&2
  exit 1
fi

ENV_FILE="$(dirname "$0")/../../.env.local"
set -a
source "$ENV_FILE"
set +a

SQL=$(cat <<EOF
SELECT p.nome AS produto_nome,
  pe.identidade, pe.rotina, pe.nivel_consciencia,
  pe.jobs_to_be_done, pe.vozes_cabeca, pe.desejos_reais,
  pe.crencas_limitantes, pe.dores_latentes, pe.objecoes_compra,
  pe.vocabulario, pe.onde_vive, pe.versao
FROM pinguim.produtos p
JOIN pinguim.cerebros c ON c.produto_id = p.id
LEFT JOIN pinguim.personas pe ON pe.cerebro_id = c.id
WHERE p.slug = '$PRODUTO_SLUG';
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

if not d or len(d) == 0 or not d[0].get('produto_nome'):
    print('ERRO: produto $PRODUTO_SLUG nao encontrado')
    sys.exit(1)

p = d[0]
if not p.get('identidade'):
    print(f'PERSONA NAO EXISTE pra {p[\"produto_nome\"]}.')
    print('Output sera mais generico — recomenda popular Persona antes de venda real.')
    sys.exit(0)

blocos = ['identidade', 'rotina', 'nivel_consciencia', 'jobs_to_be_done', 'vozes_cabeca', 'desejos_reais', 'crencas_limitantes', 'dores_latentes', 'objecoes_compra', 'vocabulario', 'onde_vive']
preenchidos = sum(1 for b in blocos if p.get(b))

print(f'=== PERSONA: {p[\"produto_nome\"]} (versao {p.get(\"versao\", 1)}) ===')
print(f'Blocos preenchidos: {preenchidos}/11')
print()

for b in blocos:
    if p.get(b):
        print(f'## {b}')
        print(json.dumps(p[b], ensure_ascii=False, indent=2)[:800])
        print()
"
