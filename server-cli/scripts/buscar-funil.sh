#!/bin/bash
# Carrega etapas do funil ativo do produto.
# Uso: bash scripts/buscar-funil.sh <produto_slug>
# Ex:  bash scripts/buscar-funil.sh elo

set -e

PRODUTO_SLUG="$1"

if [ -z "$PRODUTO_SLUG" ]; then
  echo "ERRO: faltou produto_slug. Uso: bash scripts/buscar-funil.sh <slug>" >&2
  exit 1
fi

ENV_FILE="$(dirname "$0")/../../.env.local"
set -a
source "$ENV_FILE"
set +a

SQL=$(cat <<EOF
SELECT p.nome AS produto_nome,
  fe.id, fe.nome, fe.ordem, fe.descricao, fe.copy_alvo
FROM pinguim.produtos p
LEFT JOIN pinguim.funil_etapas fe ON fe.produto_id = p.id
WHERE p.slug = '$PRODUTO_SLUG'
ORDER BY fe.ordem ASC NULLS LAST;
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
    print('ERRO: produto $PRODUTO_SLUG nao encontrado')
    sys.exit(1)

produto_nome = d[0].get('produto_nome', '$PRODUTO_SLUG')
etapas = [r for r in d if r.get('id')]

if not etapas:
    print(f'FUNIL NAO MAPEADO pra {produto_nome} (0 etapas).')
    print('Mestre assume etapa neutra OU produz versao dupla (frio + quente).')
    sys.exit(0)

print(f'=== FUNIL: {produto_nome} ({len(etapas)} etapas) ===')
print()
for e in etapas:
    print(f'## Etapa {e.get(\"ordem\", \"?\")}: {e.get(\"nome\", \"?\")}')
    if e.get('descricao'):
        print(f'  {e[\"descricao\"]}')
    if e.get('copy_alvo'):
        print(f'  Copy alvo: {e[\"copy_alvo\"]}')
    print()
"
