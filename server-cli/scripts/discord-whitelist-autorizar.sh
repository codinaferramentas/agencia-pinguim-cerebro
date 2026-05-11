#!/bin/bash
# V2.14 D — Autoriza usuario Discord a falar com o bot
# Uso:
#   bash scripts/discord-whitelist-autorizar.sh <discord_user_id> <papel> "<nome_discord>" [socio_slug] [observacao]
#   bash scripts/discord-whitelist-autorizar.sh 1083728715726463068 funcionario "Rafael Sousa"
#   bash scripts/discord-whitelist-autorizar.sh 123456789 socio "Codina" codina

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

USER_ID="$1"
PAPEL="$2"
NOME="$3"
SOCIO_SLUG="${4:-}"
OBSERVACAO="${5:-}"

if [ -z "$USER_ID" ] || [ -z "$PAPEL" ] || [ -z "$NOME" ]; then
  echo "Uso: bash scripts/discord-whitelist-autorizar.sh <discord_user_id> <papel> \"<nome>\" [socio_slug] [obs]" >&2
  echo "papel: socio | funcionario | cliente" >&2
  exit 1
fi

node -e "
const whitelist = require('./server-cli/lib/whitelist-discord');
(async () => {
  try {
    const r = await whitelist.autorizar({
      discord_user_id: '$USER_ID',
      papel: '$PAPEL',
      nome_discord: '$NOME',
      socio_slug: '$SOCIO_SLUG' || null,
      observacao: '$OBSERVACAO',
    });
    console.log('[OK] Autorizado:', r.discord_user_id, '|', r.papel, '|', r.nome_discord, '| ativo=' + r.ativo);
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exit(1);
  }
})();
"
