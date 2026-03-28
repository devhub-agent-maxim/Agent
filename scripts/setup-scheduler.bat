@echo off
echo Setting up autonomous heartbeat scheduler...
echo.

set PROJECT_DIR=%~dp0..
set NODE_CMD=C:\Program Files\nodejs\node.exe
set SCRIPT=%~dp0heartbeat.js

:: Create the heartbeat task — runs every 30 minutes, starts at system startup
schtasks /create /tn "DevHub-Heartbeat" /tr "\"%NODE_CMD%\" \"%SCRIPT%\"" /sc minute /mo 30 /st 00:00 /ru "%USERNAME%" /f

if %errorlevel% == 0 (
    echo.
    echo SUCCESS! Heartbeat scheduled.
    echo - Runs every 30 minutes automatically
    echo - Works even when you're away from your PC
    echo - Checks memory\TASKS.md for pending work
    echo - Sends Telegram notifications when tasks complete
    echo.
    echo Your autonomous agent is now live.
) else (
    echo.
    echo Could not create scheduled task. Try running as Administrator.
    echo Right-click this file and select "Run as administrator"
)

echo.
pause
