@echo off
title habit_tracker - keep this window open
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found, so habit_tracker cannot start.
  pause
  exit /b 1
)
node server.js
if errorlevel 1 pause
