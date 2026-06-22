#!/bin/bash
# ============================================================
#  Pinguim Squad Installer for macOS
#  Socio: codina
#  Auto-update: diario as 06:00 (launchd)
# ============================================================

set -u  # exit on undefined vars
SOCIO="pedro"
NOME="Pedro"
BASE_URL="https://mission-control-pink-three.vercel.app/downloads/instalador"
SKILLS_URL="$BASE_URL/pinguim-squad.zip"
CEREBRO_URL="$BASE_URL/cerebro-${SOCIO}.zip"
DEST="$HOME/.claude/skills/pinguim"
TEMP_DIR="$(mktemp -d)"
LOG="$DEST/.install.log"
SILENT="${1:-}"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "========================================="
echo "  Pinguim Squad â€” Instalador"
echo "  Socio: $NOME"
echo "========================================="
echo ""

mkdir -p "$HOME/.claude/skills"
mkdir -p "$DEST"

# ---- 1/4 Skills ----
echo "[1/4] Baixando 56 skills do Pinguim Squad..."
if ! curl -fsSL --connect-timeout 30 --max-time 120 -o "$TEMP_DIR/pinguim-squad.zip" "$SKILLS_URL"; then
  echo -e " ${RED}ERRO${NC}: Falha ao baixar skills. Verifica internet."
  [ "$SILENT" != "/silent" ] && read -p "Aperta Enter pra fechar..." _
  exit 1
fi
echo -e " ${GREEN}OK${NC}"

# ---- 2/4 Cerebro pessoal ----
echo "[2/4] Baixando seu cerebro pessoal ($NOME)..."
if ! curl -fsSL --connect-timeout 30 --max-time 60 -o "$TEMP_DIR/cerebro.zip" "$CEREBRO_URL"; then
  echo -e " ${RED}ERRO${NC}: Falha ao baixar cerebro pessoal."
  [ "$SILENT" != "/silent" ] && read -p "Aperta Enter pra fechar..." _
  exit 1
fi
echo -e " ${GREEN}OK${NC}"

# ---- 3/4 Instalar ----
echo "[3/4] Instalando arquivos em $DEST..."
unzip -o -q "$TEMP_DIR/pinguim-squad.zip" -d "$DEST"
mkdir -p "$DEST/cerebro-pessoal"
unzip -o -q "$TEMP_DIR/cerebro.zip" -d "$DEST/cerebro-pessoal"
echo -e " ${GREEN}OK${NC}"

# ---- 4/4 Auto-update via launchd ----
echo "[4/4] Configurando atualizacao automatica diaria (06:00)..."

# Copia o instalador como updater
UPDATER="$DEST/.atualizar-${SOCIO}.command"
cp "$0" "$UPDATER"
chmod +x "$UPDATER"

# launchd plist
PLIST="$HOME/Library/LaunchAgents/com.pinguim.squad.update.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.pinguim.squad.update</string>
  <key>ProgramArguments</key>
  <array>
    <string>$UPDATER</string>
    <string>/silent</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$DEST/.update.log</string>
  <key>StandardErrorPath</key>
  <string>$DEST/.update.err</string>
</dict>
</plist>
EOF

# Recarrega launchd
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST" 2>/dev/null || true

echo -e " ${GREEN}OK${NC}"

# Log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] install ok socio=$SOCIO" >> "$LOG"

# Limpa temp
rm -rf "$TEMP_DIR"

echo ""
echo "========================================="
echo " Pronto pra usar!"
echo "========================================="
echo ""
echo " Abre o Claude Code (qualquer pasta) e digita:"
echo ""
echo "     Quem sou eu? Le meu cerebro pessoal."
echo ""
echo " Pinguim Squad atualiza sozinho todo dia as 06:00."
echo ""
echo " Pra desinstalar: rm -rf $DEST"
echo " Pra parar auto-update: launchctl unload $PLIST && rm $PLIST"
echo ""

# Se silent (auto-update), nao espera
if [ "$SILENT" != "/silent" ]; then
  read -p "Aperta Enter pra fechar..." _
fi
exit 0
