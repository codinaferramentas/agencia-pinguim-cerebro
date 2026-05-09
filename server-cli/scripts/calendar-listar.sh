#!/bin/bash
# V2.14 Fase 1.7 — Lista eventos da agenda do socio.
# Uso: bash scripts/calendar-listar.sh [janela] [calendarId]
# Janelas:  hoje (default) | amanha | proximos7
# Ex:  bash scripts/calendar-listar.sh                       # eventos de hoje, primary
#      bash scripts/calendar-listar.sh amanha                # eventos de amanha
#      bash scripts/calendar-listar.sh proximos7             # proximos 7 dias
#      bash scripts/calendar-listar.sh hoje work@dominio.com # outro calendario
#
# Nota: este script lista apenas. Para LER um evento especifico use o
# endpoint /api/calendar/ler-evento com eventId.

set -e

JANELA="${1:-hoje}"
CALENDAR_ID="${2:-primary}"
PORT="${PINGUIM_PORT:-3737}"

# Calcula timeMin/timeMax com python puro (sem dependencia do node + cwd)
RANGE=$(python -c "
import sys, json
from datetime import datetime, timezone, timedelta

j = sys.argv[1]
BRT = timezone(timedelta(hours=-3))
agora = datetime.now(BRT)

if j == 'hoje':
    inicio = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    fim = agora.replace(hour=23, minute=59, second=59, microsecond=0)
    label = 'hoje ' + inicio.strftime('%d/%m/%Y')
elif j == 'amanha':
    base = (agora + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    inicio = base
    fim = base.replace(hour=23, minute=59, second=59)
    label = 'amanha ' + inicio.strftime('%d/%m/%Y')
elif j == 'proximos7':
    inicio = agora
    fim = agora + timedelta(days=7)
    label = 'proximos 7 dias'
else:
    print('ERRO: janela invalida. Use hoje | amanha | proximos7', file=sys.stderr)
    sys.exit(1)

print(json.dumps({
    'timeMin': inicio.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'timeMax': fim.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'label': label,
}))
" "$JANELA")

TIME_MIN=$(echo "$RANGE" | python -c "import json,sys; print(json.loads(sys.stdin.read())['timeMin'])")
TIME_MAX=$(echo "$RANGE" | python -c "import json,sys; print(json.loads(sys.stdin.read())['timeMax'])")
LABEL=$(echo "$RANGE" | python -c "import json,sys; print(json.loads(sys.stdin.read())['label'])")

BODY=$(python -c "import json,sys; print(json.dumps({'calendarId': sys.argv[1], 'timeMin': sys.argv[2], 'timeMax': sys.argv[3], 'maxResults': 50}))" "$CALENDAR_ID" "$TIME_MIN" "$TIME_MAX")

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/calendar/listar-eventos" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "$RESPONSE" | LABEL="$LABEL" CALENDAR_ID="$CALENDAR_ID" python -c "
import sys, json, os
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print(f'ERRO: resposta invalida: {e}')
    sys.exit(1)

if not d.get('ok'):
    err = d.get('error', 'desconhecido')
    if 'Refresh token' in err or 'nao conectado' in err.lower() or 'CLIENT_ID' in err:
        print('GAP: Google nao conectado pra esse socio. Acessar http://localhost:3737/conectar-google primeiro.')
        print(f'Detalhe: {err}')
    elif 'calendar' in err.lower() and 'insufficient' in err.lower():
        print('GAP: escopo Calendar nao autorizado. Reconectar em /conectar-google pra autorizar.')
        print(f'Detalhe: {err}')
    else:
        print(f'ERRO Calendar API: {err}')
    sys.exit(0)

eventos = d.get('eventos', [])
total = d.get('total', 0)
latencia = d.get('latencia_ms', 0)
label = os.environ.get('LABEL', '?')
cal_id = os.environ.get('CALENDAR_ID', 'primary')

if total == 0:
    print(f'Nenhum evento encontrado em {label} ({cal_id}). [{latencia}ms]')
    sys.exit(0)

print(f'=== {total} evento(s) | janela: {label} | calendario: {cal_id} | {latencia}ms ===')
print()
ultimo_dia = None
for i, e in enumerate(eventos, 1):
    titulo = e.get('titulo', '(sem titulo)')[:80]
    dia_semana = e.get('dia_semana_br', '')
    data_curta = e.get('data_curta_br', '')
    chave_dia = data_curta
    if chave_dia and chave_dia != ultimo_dia:
        print(f'-- {dia_semana} {data_curta} --')
        ultimo_dia = chave_dia
    if e.get('dia_inteiro'):
        marca = '[dia inteiro]'
    else:
        h_ini = e.get('hora_inicio_br', '?')
        h_fim = e.get('hora_fim_br', '?')
        dur = e.get('duracao_min')
        dur_str = f' ({dur}min)' if dur else ''
        marca = f'{h_ini} -> {h_fim}{dur_str}'
    qtd_part = e.get('qtd_participantes', 0)
    part_str = f' | {qtd_part} participante(s)' if qtd_part else ''
    meet = ' | Meet' if e.get('link_meet') else ''
    local = e.get('local', '')
    local_str = f' | {local[:40]}' if local else ''
    print(f'{i}. {marca}  **{titulo}**{part_str}{meet}{local_str}')
    if e.get('link_meet'):
        print(f'   Meet: {e[\"link_meet\"]}')
    print()
"
