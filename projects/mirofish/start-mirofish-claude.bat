@echo off
echo.
echo ================================
echo  Mirofish + Claude API Mode
echo ================================
echo.

cd /d "%~dp0"

:: Check ANTHROPIC_API_KEY is set
if "%ANTHROPIC_API_KEY%"=="" (
    echo ERROR: ANTHROPIC_API_KEY is not set.
    echo.
    echo Get your key from: https://console.anthropic.com/settings/keys
    echo Then run:   set ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
    echo And re-run this file.
    pause
    exit /b 1
)

echo [1/5] Starting Neo4j in Docker...
docker compose -f docker-compose.neo4j.yml up -d
if %errorlevel% neq 0 (
    echo ERROR: Docker failed. Open Docker Desktop first.
    pause
    exit /b 1
)

echo [2/5] Waiting for Neo4j (30s)...
timeout /t 30 /nobreak >nul

echo [3/5] Checking Ollama (needed for embeddings only)...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Ollama not running — embeddings will fail.
    echo Open the Ollama app, then run: ollama pull nomic-embed-text
    echo Press any key to continue anyway, or Ctrl+C to abort.
    pause
)

echo [4/5] Starting LiteLLM proxy (routes Claude API as OpenAI)...
echo       Claude endpoint: http://localhost:8000/v1
start "LiteLLM Proxy" cmd /k "litellm --model anthropic/claude-haiku-4-5 --port 8000"
timeout /t 5 /nobreak >nul

echo [5/5] Starting Mirofish...
echo.
echo  Frontend:  http://localhost:3000
echo  Backend:   http://localhost:5001
echo  Neo4j:     http://localhost:7474  (neo4j / mirofish)
echo  LiteLLM:   http://localhost:8000
echo.

:: Override LLM to point at LiteLLM proxy
set LLM_BASE_URL=http://localhost:8000/v1
set LLM_API_KEY=fake-key-litellm-handles-auth
set LLM_MODEL_NAME=claude-haiku-4-5
set OPENAI_API_BASE_URL=http://localhost:8000/v1
set OPENAI_API_KEY=fake-key-litellm-handles-auth

npm run dev
