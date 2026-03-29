@echo off
echo.
echo ================================
echo  Starting Mirofish (Hybrid Mode)
echo  Neo4j in Docker + Local Ollama
echo ================================
echo.

cd /d "%~dp0"

echo [1/4] Starting Neo4j in Docker...
docker compose -f docker-compose.neo4j.yml up -d
if %errorlevel% neq 0 (
    echo ERROR: Docker failed. Is Docker Desktop running?
    echo Open Docker Desktop from the taskbar and try again.
    pause
    exit /b 1
)

echo [2/4] Waiting for Neo4j to be ready (30s)...
timeout /t 30 /nobreak >nul

echo [3/4] Checking Ollama is running...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Ollama is not running.
    echo Open the Ollama app from your taskbar or Start menu, then re-run this file.
    pause
    exit /b 1
)
echo Ollama is running.

echo [4/4] Starting Mirofish (frontend + backend)...
echo.
echo Once started:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5001
echo   Neo4j:    http://localhost:7474  (user: neo4j / pass: mirofish)
echo.
npm run dev
