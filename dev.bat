@echo off
echo Starting ILC Studios dev server on port 3001...
cd /d "%~dp0"
npm run dev -- --port 3002
