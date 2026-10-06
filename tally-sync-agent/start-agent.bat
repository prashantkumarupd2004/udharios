@echo off
REM Udhari OS Tally Sync Agent — double-click to start
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nahi mila! https://nodejs.org se install karein.
  pause
  exit /b 1
)
node sync-agent.js
pause
