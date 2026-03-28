@echo off
REM ══════════════════════════════════════════════════════
REM  Autonomous Agent — CLI Toolbelt Setup
REM  Run this ONCE to install all required CLIs
REM  Usage: tools\setup.bat
REM ══════════════════════════════════════════════════════

echo.
echo ╔══════════════════════════════════════════╗
echo ║  Autonomous Agent — CLI Setup            ║
echo ╚══════════════════════════════════════════╝
echo.

REM ── Check Node.js ─────────────────────────────────────
echo [1/6] Checking Node.js...
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo ERROR: Node.js not found. Install from https://nodejs.org
  exit /b 1
)
node --version
echo OK

REM ── GitHub CLI ────────────────────────────────────────
echo.
echo [2/6] Installing GitHub CLI (gh)...
gh --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
  echo Already installed:
  gh --version
) ELSE (
  winget install --id GitHub.cli --silent
  echo Done. Run: gh auth login
)

REM ── Apify CLI ─────────────────────────────────────────
echo.
echo [3/6] Installing Apify CLI...
apify --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
  echo Already installed:
  apify --version
) ELSE (
  npm install -g apify-cli
  echo Done. Run: apify auth login
)

REM ── jq ────────────────────────────────────────────────
echo.
echo [4/6] Installing jq (JSON parser)...
jq --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
  echo Already installed:
  jq --version
) ELSE (
  winget install --id jqlang.jq --silent
  IF %ERRORLEVEL% NEQ 0 (
    echo winget failed, trying npm...
    npm install -g node-jq
  )
  echo Done.
)

REM ── Vercel CLI ────────────────────────────────────────
echo.
echo [5/6] Installing Vercel CLI...
vercel --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
  echo Already installed:
  vercel --version
) ELSE (
  npm install -g vercel
  echo Done. Run: vercel login
)

REM ── Playwright ────────────────────────────────────────
echo.
echo [6/6] Installing Playwright...
npx playwright --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
  echo Already installed.
) ELSE (
  npm install -g playwright
  npx playwright install chromium
  echo Done.
)

REM ── Summary ───────────────────────────────────────────
echo.
echo ══════════════════════════════════════════
echo  Setup complete! Next steps:
echo ══════════════════════════════════════════
echo.
echo  1. Copy .env.example to .env
echo     copy .env.example .env
echo.
echo  2. Fill in your tokens in .env:
echo     - TELEGRAM_BOT_TOKEN  (from @BotFather)
echo     - TELEGRAM_GROUP_ID   (your group)
echo     - GITHUB_TOKEN        (github.com/settings/tokens)
echo.
echo  3. Authenticate CLIs:
echo     gh auth login
echo     apify auth login
echo     vercel login
echo.
echo  4. Start the agent:
echo     node scripts/agent.js
echo.
pause
