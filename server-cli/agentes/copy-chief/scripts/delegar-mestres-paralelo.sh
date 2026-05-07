#!/bin/bash
# Delega para 2-4 mestres em PARALELO (& + wait), nao sequencial.
# Cada mestre roda em processo separado simultaneamente.
# Reduz tempo de Chief de 4-7 min para ~60-90s.
#
# Uso: bash scripts/delegar-mestres-paralelo.sh \
#        "<mestre1>:<briefing1>" \
#        "<mestre2>:<briefing2>" \
#        "<mestre3>:<briefing3>" \
#        "<mestre4>:<briefing4>"
#
# Briefing usa | como separador (porque : aparece em URLs etc).
# Formato real: "<mestre>|<briefing>"
#
# Output: blocos concatenados na ordem de chamada, com cabecalho do mestre.

set -e

if [ "$#" -lt 1 ] || [ "$#" -gt 4 ]; then
  echo "ERRO: 1 a 4 chamadas. Uso: bash scripts/delegar-mestres-paralelo.sh \"mestre|briefing\" [\"mestre|briefing\"]..." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMPDIR="$(mktemp -d)"
trap "rm -rf $TMPDIR" EXIT

# Dispara cada mestre em background. Output salvo em $TMPDIR/$i.out
i=0
PIDS=()
MESTRES=()
for arg in "$@"; do
  i=$((i + 1))
  MESTRE="${arg%%|*}"
  BRIEFING="${arg#*|}"
  MESTRES+=("$MESTRE")

  echo "[delegar-mestres-paralelo] disparando $MESTRE em background (pid=...)" >&2
  bash "$SCRIPT_DIR/delegar-mestre.sh" "$MESTRE" "$BRIEFING" > "$TMPDIR/$i.out" 2> "$TMPDIR/$i.err" &
  PIDS+=($!)
done

# Aguarda todos terminarem
echo "[delegar-mestres-paralelo] aguardando ${#PIDS[@]} mestres terminarem..." >&2
for pid in "${PIDS[@]}"; do
  wait $pid
done

# Concatena outputs na ordem
i=0
for mestre in "${MESTRES[@]}"; do
  i=$((i + 1))
  echo ""
  echo "=== BLOCO $i — $mestre ==="
  echo ""
  cat "$TMPDIR/$i.out"
done

echo ""
echo "[delegar-mestres-paralelo] concluido — ${#MESTRES[@]} mestres em paralelo" >&2
