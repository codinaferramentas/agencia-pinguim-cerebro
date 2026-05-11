#!/bin/bash
# V2.14.5 — Adiciona linha de aprendizado (geral OU pessoal)
# Uso:
#   bash scripts/aprendizados-adicionar.sh geral "<texto>"
#   bash scripts/aprendizados-adicionar.sh <socio_slug> "<texto>"

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

ALVO="$1"
TEXTO="$2"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$ALVO" ] || [ -z "$TEXTO" ]; then
  echo "Uso: bash scripts/aprendizados-adicionar.sh geral|<slug> \"<texto>\"" >&2
  exit 1
fi

if [ "$ALVO" = "geral" ]; then
  BODY=$(TEXTO="$TEXTO" python -c "
import json, os
print(json.dumps({'texto': os.environ.get('TEXTO',''), 'origem': 'cli-andre'}, ensure_ascii=False))
")
  echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/aprendizados/adicionar-geral" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary @- | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'): print('ERRO:', d.get('error')); sys.exit(1)
print(f'[OK] Aprendizado GERAL adicionado. versao={d.get(\"versao\")} atualizado={d.get(\"atualizado_em\")}')
"
  exit 0
fi

# Pessoal — resolve cliente_id via slug
SLUG="$ALVO"
node -e "
const db = require('./server-cli/lib/db');
const aprendizados = require('./server-cli/lib/aprendizados');
(async () => {
  const r = await db.rodarSQL(\"SELECT cliente_id, nome FROM pinguim.socios WHERE slug = '$SLUG' LIMIT 1;\");
  if (!Array.isArray(r) || !r[0]) { console.log('ERRO: socio \"$SLUG\" nao encontrado'); process.exit(1); }
  const cid = r[0].cliente_id;
  const result = await aprendizados.adicionarAprendizadoPessoal({ cliente_id: cid, texto: \`$(echo "$TEXTO" | sed "s/'/\\\\\\\\'/g; s/\\\$/\\\\\\\\\\\$/g; s/\\\`/\\\\\\\\\\\`/g")\`, origem: 'cli-andre' });
  console.log('[OK] Aprendizado PESSOAL adicionado pra ' + r[0].nome + '. versao=' + result.versao + ' atualizado=' + result.atualizado_em);
})();
"
