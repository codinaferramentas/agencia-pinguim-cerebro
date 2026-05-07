#!/bin/bash
# Delega trabalho criativo pra um Chief de squad-conselheira.
# Spawna outro `claude` CLI com cwd=agentes/<chief>/. Chief tem seu CLAUDE.md proprio
# e ferramentas proprias (ex: delegar-mestre).
#
# Uso: bash scripts/delegar-chief.sh <squad_slug> "<briefing>"
# Ex:  bash scripts/delegar-chief.sh copy "Pedido: copy pra pagina de venda do Elo. Cerebro: ... Persona: ... Skill: anatomia-pagina-vendas-longa ..."

set -e

SQUAD_SLUG="$1"
BRIEFING="$2"

if [ -z "$SQUAD_SLUG" ] || [ -z "$BRIEFING" ]; then
  echo "ERRO: faltou parametro. Uso: bash scripts/delegar-chief.sh <squad_slug> \"<briefing>\"" >&2
  exit 1
fi

# Mapeamento squad -> pasta do Chief
case "$SQUAD_SLUG" in
  copy)
    CHIEF_DIR="agentes/copy-chief"
    ;;
  storytelling)
    CHIEF_DIR="agentes/story-chief"
    ;;
  advisory-board|advisory)
    CHIEF_DIR="agentes/board-chair"
    ;;
  design)
    CHIEF_DIR="agentes/design-chief"
    ;;
  *)
    echo "ERRO: squad '$SQUAD_SLUG' nao tem Chief implementado. Disponivel hoje: copy" >&2
    exit 1
    ;;
esac

# Caminho absoluto pra pasta do Chief
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHIEF_PATH="$SCRIPT_DIR/../$CHIEF_DIR"

if [ ! -d "$CHIEF_PATH" ]; then
  echo "ERRO: pasta do Chief nao existe: $CHIEF_PATH" >&2
  exit 1
fi

if [ ! -f "$CHIEF_PATH/CLAUDE.md" ]; then
  echo "ERRO: $CHIEF_PATH/CLAUDE.md nao encontrado" >&2
  exit 1
fi

echo "[delegar-chief] squad=$SQUAD_SLUG | dir=$CHIEF_DIR" >&2

# Unset variaveis Claude Code antes de spawnar (evita nested session error)
unset CLAUDECODE
unset CLAUDE_CODE_ENTRYPOINT

# Spawna claude CLI com cwd na pasta do Chief.
cd "$CHIEF_PATH" && echo "$BRIEFING" | claude -p \
  --output-format text \
  --allowedTools Bash,Read,Glob,Grep
