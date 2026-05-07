#!/bin/bash
# Delega bloco especifico pra mestre individual da squad copy.
# Mestre roda como UMA chamada simples ao claude CLI com prompt inline
# (sem cwd dedicado — mestre nao precisa de CLAUDE.md proprio, recebe
# system prompt direto via -p).
#
# Uso: bash scripts/delegar-mestre.sh <mestre_slug> "<briefing-do-bloco>"
# Ex:  bash scripts/delegar-mestre.sh alex-hormozi "Escreva STACK-BONUS pra Elo (R$ 1.997). Persona: criador iniciante. ..."

set -e

MESTRE_SLUG="$1"
BRIEFING="$2"

if [ -z "$MESTRE_SLUG" ] || [ -z "$BRIEFING" ]; then
  echo "ERRO: faltou parametro. Uso: bash scripts/delegar-mestre.sh <mestre_slug> \"<briefing>\"" >&2
  exit 1
fi

# Carrega .env.local — sobe ate achar (server-cli/.env.local OU raiz/.env.local)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE=""
for candidate in "$SCRIPT_DIR/../../../.env.local" "$SCRIPT_DIR/../../../../.env.local"; do
  if [ -f "$candidate" ]; then
    ENV_FILE="$candidate"
    break
  fi
done
if [ -z "$ENV_FILE" ]; then
  echo "ERRO: .env.local nao encontrado (procurei em ../../../ e ../../../../)" >&2
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

# Busca system_prompt do mestre no banco
RESOLVE_SQL="SELECT system_prompt FROM pinguim.agentes WHERE slug = '$MESTRE_SLUG';"
QUERY_JSON=$(printf '%s' "$RESOLVE_SQL" | python -c "import sys, json; print(json.dumps({'query': sys.stdin.read()}))")

SYSTEM_PROMPT=$(curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$QUERY_JSON" \
  | python -c "import sys, json; d=json.load(sys.stdin); print(d[0]['system_prompt'] if d and d[0].get('system_prompt') else '')")

if [ -z "$SYSTEM_PROMPT" ]; then
  echo "ERRO: mestre '$MESTRE_SLUG' nao encontrado ou sem system_prompt." >&2
  echo "Mestres disponiveis: alex-hormozi, eugene-schwartz, gary-halbert, gary-bencivenga, dan-kennedy, russell-brunson, john-carlton, jon-benson" >&2
  exit 1
fi

# Monta prompt completo: system + briefing
FULL_PROMPT=$(cat <<EOF
$SYSTEM_PROMPT

---

## BRIEFING DO COPY CHIEF

$BRIEFING

---

Escreva o bloco/copy pedida acima, aplicando seu metodo. Devolva apenas o conteudo do bloco em markdown — sem preambulo, sem explicacao do metodo, sem assinatura.
EOF
)

echo "[delegar-mestre] mestre=$MESTRE_SLUG | briefing=${BRIEFING:0:80}..." >&2

# Unset variaveis Claude Code antes de spawnar — necessario pra evitar
# "cannot launch inside another Claude Code session"
unset CLAUDECODE
unset CLAUDE_CODE_ENTRYPOINT

# Spawna claude CLI sem ferramentas (mestre so escreve, nao executa scripts)
echo "$FULL_PROMPT" | claude -p --output-format text
