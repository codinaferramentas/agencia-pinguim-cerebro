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

SQL=$(cat <<EOF
SELECT p.nome AS produto_nome,
  fe.id, fe.papel, fe.tipo, fe.ordem, fe.condicao_texto,
  f.nome AS funil_nome
FROM pinguim.produtos p
LEFT JOIN pinguim.funil_etapas fe ON fe.produto_id = p.id
LEFT JOIN pinguim.funis f ON f.id = fe.funil_id
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
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception as e:
    print(f'FUNIL NAO MAPEADO pra $PRODUTO_SLUG (resposta invalida da API).')
    print('Mestre assume etapa neutra OU produz versao dupla (frio + quente).')
    sys.exit(0)

# Supabase devolve dict {message: ...} quando ha erro SQL — tratar como gap silencioso
if isinstance(d, dict):
    print(f'FUNIL NAO MAPEADO pra $PRODUTO_SLUG (erro de schema: {d.get(\"message\",\"\")[:120]}).')
    print('Mestre assume etapa neutra OU produz versao dupla (frio + quente).')
    sys.exit(0)

if not isinstance(d, list) or len(d) == 0:
    print(f'FUNIL NAO MAPEADO pra $PRODUTO_SLUG (produto nao encontrado).')
    print('Mestre assume etapa neutra OU produz versao dupla (frio + quente).')
    sys.exit(0)

produto_nome = d[0].get('produto_nome') or '$PRODUTO_SLUG'
etapas = [r for r in d if r.get('id')]

if not etapas:
    print(f'FUNIL NAO MAPEADO pra {produto_nome} (0 etapas cadastradas).')
    print('Mestre assume etapa neutra OU produz versao dupla (frio + quente).')
    sys.exit(0)

# Agrupa por funil_nome
funis = {}
for e in etapas:
    fn = e.get('funil_nome') or '(sem nome)'
    funis.setdefault(fn, []).append(e)

print(f'=== FUNIL: {produto_nome} ({len(etapas)} etapas em {len(funis)} funil(is)) ===')
print()
for funil_nome, etps in funis.items():
    print(f'# Funil: {funil_nome}')
    for e in etps:
        ordem = e.get('ordem', '?')
        papel = e.get('papel') or '(sem papel)'
        tipo = e.get('tipo') or 'etapa'
        print(f'## Etapa {ordem} [{tipo}]: {papel}')
        if e.get('condicao_texto'):
            print(f'  Condicao: {e[\"condicao_texto\"]}')
        print()
"
