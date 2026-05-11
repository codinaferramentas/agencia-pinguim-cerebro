#!/bin/bash
# V2.14.5 — Lista aprendizados (gerais + pessoais por sócio)
# Uso:
#   bash scripts/aprendizados-listar.sh                 # lista todos sócios + geral
#   bash scripts/aprendizados-listar.sh <socio_slug>    # mostra texto completo desse sócio
#   bash scripts/aprendizados-listar.sh geral           # mostra texto geral completo

set -e
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

ALVO="${1:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$ALVO" ]; then
  # Modo "lista todos"
  echo "=== APRENDIZADOS GERAIS (afeta todos os sócios) ==="
  curl -s -X POST "http://localhost:${PORT}/api/aprendizados/ler-geral" -H "Content-Type: application/json" -d '{}' | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print('ERRO:', d.get('error')); sys.exit(1)
a = d.get('aprendizados') or {}
if not a:
    print('  (vazio)')
else:
    print(f'  versao: {a.get(\"versao\")} | atualizado: {a.get(\"atualizado_em\")}')
    print(f'  bytes: {len(a.get(\"conteudo_md\",\"\"))}')
"

  echo ""
  echo "=== APRENDIZADOS PESSOAIS POR SÓCIO ==="
  curl -s -X POST "http://localhost:${PORT}/api/aprendizados/listar-clientes" -H "Content-Type: application/json" -d '{}' | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print('ERRO:', d.get('error')); sys.exit(1)
lista = d.get('clientes', [])
print(f'  total: {len(lista)} sócio(s) com aprendizado pessoal')
for c in lista:
    print(f'  {c.get(\"slug\") or \"(?)\":<10} | {c.get(\"nome\") or \"?\":<25} | v{c.get(\"versao\")} | {c.get(\"bytes\")} bytes | {c.get(\"atualizado_em\",\"\")[:19]}')
"
  exit 0
fi

if [ "$ALVO" = "geral" ]; then
  curl -s -X POST "http://localhost:${PORT}/api/aprendizados/ler-geral" -H "Content-Type: application/json" -d '{}' | python -c "
import sys, json
d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print('ERRO:', d.get('error')); sys.exit(1)
a = d.get('aprendizados') or {}
print('# APRENDIZADOS GERAIS')
print(a.get('conteudo_md', '(vazio)'))
"
  exit 0
fi

# Modo "1 sócio específico" — primeiro descobre o cliente_id
SLUG="$ALVO"
CID=$(curl -s -X POST "http://localhost:${PORT}/api/whatsapp/whitelist/listar" -H "Content-Type: application/json" -d '{}' | python -c "
import sys, json
d = json.loads(sys.stdin.read())
for a in d.get('autorizados', []):
    if a.get('socio_slug') == '$SLUG':
        # cliente_id não vem direto da listagem da whitelist — vamos buscar via socios
        pass
print('')
")

# Mais direto: buscar cliente_id via socio_slug -> pinguim.socios
node -e "
const db = require('$(pwd | sed 's|/c/|c:/|')/server-cli/lib/db');
const aprendizados = require('$(pwd | sed 's|/c/|c:/|')/server-cli/lib/aprendizados');
(async () => {
  const r = await db.rodarSQL(\"SELECT cliente_id, nome FROM pinguim.socios WHERE slug = '$SLUG' LIMIT 1;\");
  if (!Array.isArray(r) || !r[0]) { console.log('socio \"$SLUG\" nao encontrado'); process.exit(0); }
  const cid = r[0].cliente_id;
  console.log('# APRENDIZADOS PESSOAIS — ' + r[0].nome);
  const a = await aprendizados.lerAprendizadosDoSocio(cid);
  if (!a) { console.log('(vazio)'); return; }
  console.log('versao:', a.versao, '| atualizado:', a.atualizado_em);
  console.log('');
  console.log(a.conteudo_md || '(sem conteudo)');
})();
"
