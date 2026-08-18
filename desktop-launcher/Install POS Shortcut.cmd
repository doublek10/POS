@echo off
REM ============================================================
REM  POS Till — one-click setup
REM  Double-click this file once. It creates a "POS Till" icon
REM  on your Desktop with its own icon. After that, you never
REM  need this file again — just use the Desktop icon.
REM ============================================================

REM --- EDIT THIS LINE to your real POS address before installing ---
set POS_URL=http://localhost:3000

REM Optional: uncomment the next line to also open the POS
REM automatically every time this PC starts up.
REM set AUTOSTART_FLAG=-AutoStart

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -PosUrl "%POS_URL%" %AUTOSTART_FLAG%

echo.
echo Setup complete. Look for the "POS Till" icon on your Desktop.
pause
