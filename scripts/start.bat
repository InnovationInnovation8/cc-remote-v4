@echo off
cd /d "%~dp0.."
echo CC Remote v3 を起動中...
echo 既存のnodeプロセスを終了中...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo サーバー起動...
start http://localhost:3737
node src/server/index.js
pause
