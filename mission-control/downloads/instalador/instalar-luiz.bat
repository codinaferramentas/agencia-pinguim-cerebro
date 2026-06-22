@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul
title Pinguim Squad - Instalador (Luiz)

REM ============================================================
REM  Pinguim Squad Installer for Windows
REM  Socio: Luiz
REM  Auto-update: diario as 06:00 (Task Scheduler)
REM ============================================================

set "SOCIO=luiz"
set "BASE_URL=https://mission-control-pink-three.vercel.app/downloads/instalador"
set "SKILLS_URL=%BASE_URL%/pinguim-squad.zip"
set "CEREBRO_URL=%BASE_URL%/cerebro-%SOCIO%.zip"
set "DEST=%USERPROFILE%\.claude\skills\pinguim"
set "TEMP_DIR=%TEMP%\pinguim-squad-install"
set "LOG=%DEST%\.install.log"

echo.
echo =========================================
echo   Pinguim Squad ??? Instalador
echo   Socio: Luiz
echo =========================================
echo.

REM Cria pasta de destino
if not exist "%USERPROFILE%\.claude\skills" mkdir "%USERPROFILE%\.claude\skills"
if not exist "%DEST%" mkdir "%DEST%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

echo [1/4] Baixando 56 skills do Pinguim Squad...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%SKILLS_URL%' -OutFile '%TEMP_DIR%\pinguim-squad.zip' -UseBasicParsing; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo  ERRO: Falha ao baixar skills. Verifica sua internet e tenta de novo.
  pause
  exit /b 1
)
echo  OK

echo [2/4] Baixando seu cerebro pessoal (Luiz)...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%CEREBRO_URL%' -OutFile '%TEMP_DIR%\cerebro.zip' -UseBasicParsing; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo  ERRO: Falha ao baixar cerebro pessoal.
  pause
  exit /b 1
)
echo  OK

echo [3/4] Instalando arquivos em %DEST%...
powershell -NoProfile -Command "Expand-Archive -Path '%TEMP_DIR%\pinguim-squad.zip' -DestinationPath '%DEST%' -Force"
powershell -NoProfile -Command "Expand-Archive -Path '%TEMP_DIR%\cerebro.zip' -DestinationPath '%DEST%\cerebro-pessoal' -Force"
echo  OK

echo [4/4] Configurando atualizacao automatica diaria (06:00)...

REM Copia o proprio instalador como atualizador (sera chamado pelo scheduler)
set "UPDATER=%DEST%\.atualizar-%SOCIO%.bat"
copy /Y "%~f0" "%UPDATER%" > nul

REM Cria/atualiza tarefa agendada do Windows
schtasks /Query /TN "PinguimSquadUpdate" >nul 2>&1
if errorlevel 1 (
  schtasks /Create /SC DAILY /ST 06:00 /TN "PinguimSquadUpdate" /TR "\"%UPDATER%\" /silent" /F >nul 2>&1
) else (
  schtasks /Change /TN "PinguimSquadUpdate" /TR "\"%UPDATER%\" /silent" >nul 2>&1
)

REM Configura: rodar se perdeu (maquina desligada) + so se houver rede
schtasks /Change /TN "PinguimSquadUpdate" /RU "%USERNAME%" /RL LIMITED >nul 2>&1

echo  OK

REM Log
echo [%date% %time%] install ok socio=%SOCIO% >> "%LOG%"

REM Limpa temp
rmdir /S /Q "%TEMP_DIR%" 2>nul

echo.
echo =========================================
echo  Pronto pra usar!
echo =========================================
echo.
echo  Abre o Claude Code (qualquer pasta) e digita:
echo.
echo      Quem sou eu? Le meu cerebro pessoal.
echo.
echo  Pinguim Squad atualiza sozinho todo dia as 06:00.
echo.
echo  Pra desinstalar: deleta a pasta %DEST%
echo  Pra parar auto-update: schtasks /Delete /TN "PinguimSquadUpdate" /F
echo.

REM Se rodou em modo silent (auto-update), nao espera tecla
if /I "%~1"=="/silent" (
  exit /b 0
)

pause
exit /b 0
