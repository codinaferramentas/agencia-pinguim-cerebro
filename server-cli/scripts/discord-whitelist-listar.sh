#!/bin/bash
# V2.14 D — Lista usuarios autorizados a falar com o bot Discord
# Uso: bash scripts/discord-whitelist-listar.sh

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

node -e "
const db = require('./server-cli/lib/db');
(async () => {
  const r = await db.rodarSQL(\`
    SELECT discord_user_id, papel, socio_slug, nome_discord, ativo, observacao
      FROM pinguim.discord_autorizados
     WHERE ativo = true
     ORDER BY papel, nome_discord;
  \`);
  console.log(\`[OK] \${r.length} usuario(s) Discord autorizado(s)\`);
  console.log('');
  let papelAtual = '';
  for (const u of r) {
    if (u.papel !== papelAtual) {
      console.log(\`== \${u.papel.toUpperCase()} ==\`);
      papelAtual = u.papel;
    }
    const slug = u.socio_slug ? \`(slug=\${u.socio_slug})\` : '';
    console.log(\`  \${u.discord_user_id} | \${u.nome_discord} \${slug}\`);
    if (u.observacao) console.log(\`    obs: \${u.observacao}\`);
  }
})();
"
