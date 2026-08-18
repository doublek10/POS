@echo off
REM POS Till Launcher (batch fallback)
REM Edit POS_URL below to point at your deployment.
set POS_URL=http://localhost:3000

where msedge >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" msedge --app=%POS_URL%
    exit /b
)

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%POS_URL%
    exit /b
)

echo Could not find Microsoft Edge. Install it from https://www.microsoft.com/edge
pause
