@echo off
cd /d "%~dp0.."
set PORT=3800
echo CC Remote v3 を起動中... (port 3800)
start http://localhost:3800
node src/server/index.js
pause
