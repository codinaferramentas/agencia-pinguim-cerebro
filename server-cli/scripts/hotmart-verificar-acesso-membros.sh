#!/bin/bash
# V2.14 D — G4b Verificar ACESSO REAL à área de membros (Hotmart Club / Members Area API)
# Itera nos Clubs cadastrados em pinguim.hotmart_clubs e devolve onde o aluno tem acesso.
#
# Uso: bash scripts/hotmart-verificar-acesso-membros.sh <email> [produto_id]

set -e
export PYTHONIOENCODING=utf-8

EMAIL="$1"; PRODUTO="${2:-}"
PORT="${PINGUIM_PORT:-3737}"

if [ -z "$EMAIL" ]; then
  echo "ERRO: bash scripts/hotmart-verificar-acesso-membros.sh <email> [produto_id]" >&2
  exit 1
fi

BODY=$(EMAIL="$EMAIL" PRODUTO="$PRODUTO" python -c "
import json, os
data = {'email': os.environ['EMAIL']}
if os.environ.get('PRODUTO'): data['produto_id'] = os.environ['PRODUTO']
print(json.dumps(data, ensure_ascii=False))
")

RESPONSE=$(echo "$BODY" | curl -s -X POST "http://localhost:${PORT}/api/hotmart/verificar-acesso-membros" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary @-)

echo "$RESPONSE" | python -c "
import sys, json
from datetime import datetime, timezone, timedelta
BRT = timezone(timedelta(hours=-3))

def fmt(dt_iso):
    if not dt_iso: return 'nunca'
    try: return datetime.fromisoformat(dt_iso.replace('Z','+00:00')).astimezone(BRT).strftime('%d/%m/%Y %H:%M BRT')
    except: return dt_iso

d = json.loads(sys.stdin.read())
if not d.get('ok'):
    print(f'ERRO: {d.get(\"error\", \"desconhecido\")}')
    if d.get('sugestao'): print(f'  Sugestão: {d[\"sugestao\"]}')
    sys.exit(1)

if d.get('total_clubs_consultados', 0) == 0:
    print(f'[AVISO] Nenhum Club cadastrado em pinguim.hotmart_clubs.')
    print(f'  {d.get(\"aviso\", \"\")}')
    print(f'  Pra cadastrar: bash scripts/hotmart-cadastrar-club.sh \"<subdomain>\" \"<produto_nome>\"')
    sys.exit(0)

if not d.get('tem_acesso'):
    print(f'[OK] {d.get(\"email_consultado\")} NÃO tem acesso a nenhum dos {d.get(\"total_clubs_consultados\")} Clubs cadastrados.')
    sys.exit(0)

print(f'[OK] {d.get(\"email_consultado\")} tem acesso a {d.get(\"total_acessos\")} Club(s):')
print()
for a in d.get('acessos', []):
    prog = a.get('progress') or {}
    print(f'  📚 {a.get(\"produto\")}  (subdomain={a.get(\"subdomain\")})')
    print(f'     Status: {a.get(\"status\")}  ·  Tipo: {a.get(\"tipo_entrada\")}  ·  Engajamento: {a.get(\"engagement\") or \"-\"}')
    print(f'     Aluno: {a.get(\"nome_aluno\") or \"?\"}')
    print(f'     Primeiro acesso: {fmt(a.get(\"first_access_date\"))}')
    print(f'     Último acesso:   {fmt(a.get(\"last_access_date\"))}')
    print(f'     Acessos totais:  {a.get(\"access_count\", 0)}')
    if prog: print(f'     Progresso:       {prog.get(\"completed\", 0)}/{prog.get(\"total\", 0)} aulas ({prog.get(\"completed_percentage\", 0)}%)')
    print()

if d.get('erros'):
    print(f'⚠ Erros ao consultar alguns Clubs: {d[\"erros\"]}')
"
