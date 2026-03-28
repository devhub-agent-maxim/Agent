@echo off
echo ============================================
echo   Dev Ecosystem Hub - Telegram Bridge
echo ============================================
echo.
echo Bot: @maxim_devhub_bot
echo Project: %~dp0
echo.
echo Starting Telegram bridge...
echo Send messages to your bot or in Dev Projects Hub topics.
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0"
node scripts\telegram-bridge.js
pause
