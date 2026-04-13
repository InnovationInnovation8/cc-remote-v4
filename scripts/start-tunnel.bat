@echo off
cd /d "%~dp0.."
echo CC Remote v3 + Tunnel を起動中...
start http://localhost:3737
set TUNNEL=1
node src/server/index.js
pause
