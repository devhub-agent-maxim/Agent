@echo off
echo Killing all Node.js processes...
taskkill /F /IM node.exe /T >nul 2>&1

echo Waiting 3 seconds...
timeout /t 3 /nobreak >nul

echo Starting agent.js...
cd /d "%~dp0.."
start "Agent" node scripts\agent.js

echo.
echo Agent restarted. Check Telegram in 10 seconds.
echo Close this window when ready.
pause
