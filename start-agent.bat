@echo off
echo ============================================
echo   Autonomous Agent - Starting
echo ============================================
echo.
echo Runtime: %~dp0
echo.
cd /d "%~dp0"
node scripts\agent.js
pause
