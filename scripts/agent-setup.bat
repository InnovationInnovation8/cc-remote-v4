@echo off
chcp 65001 >nul
title CC Remote Agent Setup

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     CC Remote Agent セットアップ     ║
echo  ╚══════════════════════════════════════╝
echo.

:: プロジェクトルートに移動
cd /d "%~dp0\.."

:: Node.js チェック
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js がインストールされていません
    echo https://nodejs.org/ からインストールしてください
    pause
    exit /b 1
)

:: npm install チェック
if not exist "node_modules" (
    echo [SETUP] npm install を実行中...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install に失敗しました
        pause
        exit /b 1
    )
)

:: 設定ファイル
set CONFIG_DIR=%LOCALAPPDATA%\cc-remote
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"
set CONFIG_FILE=%CONFIG_DIR%\agent-config.env

:: 初回セットアップ
if not exist "%CONFIG_FILE%" (
    echo [SETUP] 初回セットアップ...
    echo.

    :: PC_SECRET を自動生成
    for /f %%i in ('node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"') do set PC_SECRET=%%i

    :: PC_ID を自動生成（ホスト名ベース）
    for /f %%i in ('node -e "const os=require('os');console.log('pc-'+os.hostname().toLowerCase().replace(/[^a-z0-9]/g,''))"') do set PC_ID=%%i

    :: 設定保存
    echo PC_ID=%PC_ID%> "%CONFIG_FILE%"
    echo PC_SECRET=%PC_SECRET%>> "%CONFIG_FILE%"
    echo CLOUD_RELAY_URL=wss://cc-remote-relay-701345803309.asia-northeast1.run.app/ws/agent>> "%CONFIG_FILE%"

    echo [SETUP] PC ID: %PC_ID%
    echo [SETUP] 設定保存: %CONFIG_FILE%
    echo.

    :: Firestore に自動登録
    echo [SETUP] Cloud Relay にPC登録中...
    node -e "const admin=require('firebase-admin');const path=require('path');const sa=require(path.resolve('firebase-admin-key.json'));admin.initializeApp({credential:admin.credential.cert(sa)});const db=admin.firestore();const crypto=require('crypto');const os=require('os');const id='%PC_ID%';const secret='%PC_SECRET%';const hash=crypto.createHash('sha256').update(secret).digest('hex');db.collection('pcs').doc(id).set({hostname:os.hostname(),platform:os.platform(),secretHash:hash,status:'offline',lastSeen:Date.now()},{merge:true}).then(()=>{console.log('[SETUP] Firestore登録完了: '+id);process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"

    if %errorlevel% neq 0 (
        echo [WARN] Firestore登録に失敗しました（手動登録が必要かもしれません）
    )
    echo.
)

:: 設定読み込み
for /f "tokens=1,2 delims==" %%a in (%CONFIG_FILE%) do set %%a=%%b

echo [INFO] PC ID: %PC_ID%
echo [INFO] Cloud Relay: %CLOUD_RELAY_URL%
echo.
echo Agent を起動します...
echo （終了するには Ctrl+C を押してください）
echo.

:: Agent 起動
node src/agent/index.js
pause
