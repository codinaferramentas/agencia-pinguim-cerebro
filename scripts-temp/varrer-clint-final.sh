#!/bin/bash
# Continua varredura do Clint a partir da pagina 657 (limite das 30 ondas atingido).
# Rodar APOS a onda 30 do script principal terminar.
set -a; source c:/Squad/.env.local 2>/dev/null; set +a
URL="https://${SUPABASE_PROJECT_REF:-wmelierxzpjamiofeemh}.supabase.co/functions/v1/clint-mapear-produtos"
PAGE=657
ONDAS=0
FALHAS_SEGUIDAS=0

while true; do
  ONDAS=$((ONDAS+1))
  echo "[$(date +%H:%M:%S)] Onda $ONDAS pagina_inicial=$PAGE"
  RESP=$(curl -sS -X POST "$URL" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"modo\":\"total\",\"pagina_inicial\":$PAGE}" \
    --max-time 200 2>&1)

  PROXIMA=$(node -e "try{const d=JSON.parse(process.argv[1]);console.log(d.proxima_pagina||'null')}catch(e){console.log('parse-error')}" "$RESP" 2>/dev/null)
  TEM_MAIS=$(node -e "try{const d=JSON.parse(process.argv[1]);console.log(d.tem_mais_paginas)}catch(e){console.log('false')}" "$RESP" 2>/dev/null)
  CONTATOS=$(node -e "try{const d=JSON.parse(process.argv[1]);console.log(d.contatos_lidos||0)}catch(e){console.log(0)}" "$RESP" 2>/dev/null)
  PAGINAS=$(node -e "try{const d=JSON.parse(process.argv[1]);console.log(d.paginas_processadas||0)}catch(e){console.log(0)}" "$RESP" 2>/dev/null)
  PRODUTOS=$(node -e "try{const d=JSON.parse(process.argv[1]);console.log(d.produtos_unicos||0)}catch(e){console.log(0)}" "$RESP" 2>/dev/null)
  ULTIMA_PROC=$(node -e "try{const d=JSON.parse(process.argv[1]);console.log(d.pagina_final_processada||0)}catch(e){console.log(0)}" "$RESP" 2>/dev/null)

  echo "  paginas=$PAGINAS contatos=$CONTATOS produtos=$PRODUTOS ultima_proc=$ULTIMA_PROC tem_mais=$TEM_MAIS proxima=$PROXIMA"

  if [ "$PROXIMA" = "parse-error" ]; then
    FALHAS_SEGUIDAS=$((FALHAS_SEGUIDAS+1))
    echo "  Falha de rede. Tentativa $FALHAS_SEGUIDAS/3."
    if [ $FALHAS_SEGUIDAS -ge 3 ]; then
      echo "  3 falhas seguidas. Abortando."
      break
    fi
    sleep 10
    continue
  fi
  FALHAS_SEGUIDAS=0

  if [ "$TEM_MAIS" = "false" ] || [ "$PROXIMA" = "null" ]; then
    echo "[$(date +%H:%M:%S)] FIM"
    break
  fi
  PAGE=$PROXIMA
  if [ $ONDAS -gt 15 ]; then
    echo "Limite 15 ondas atingido — script principal precisa rodar de novo."
    break
  fi
done
echo "DONE"
