@echo off
echo Stopping any existing Node.js dev servers...
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Load ANTHROPIC_API_KEY from .env.local so it isn't overridden by a blank session var
for /f "tokens=1,* delims==" %%A in (.env.local) do (
  if "%%A"=="ANTHROPIC_API_KEY" set ANTHROPIC_API_KEY=%%B
)

echo Starting dev server on port 3000...
cd /d "%~dp0"
npm run dev
