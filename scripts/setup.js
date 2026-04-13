// setup.js — CC Remote v3 初期セットアップスクリプト
// 使い方: node scripts/setup.js
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { randomUUID, randomBytes } from 'crypto';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeLocalIdentity } from '../src/server/pc-identity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(msg);
}

function logOk(msg) {
  console.log(`  ✓ ${msg}`);
}

function logWarn(msg) {
  console.log(`  ! ${msg}`);
}

function logError(msg) {
  console.error(`  ✗ ${msg}`);
}

function separator() {
  log('');
  log('─'.repeat(50));
  log('');
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// .env を解析するヘルパー
function parseEnv(content) {
  const obj = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) obj[key] = value;
  }
  return obj;
}

// .env を更新するヘルパー
function updateEnvValue(envPath, key, value) {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }
  writeFileSync(envPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// ステップ関数
// ---------------------------------------------------------------------------

// Step 0: OneDrive パス警告
async function checkOneDrivePath() {
  const cwd = process.cwd().replace(/\\/g, '/').toLowerCase();
  if (cwd.includes('/onedrive')) {
    console.warn('\n⚠️  警告: OneDrive 同期フォルダで実行されています');
    console.warn(`   現在のディレクトリ: ${process.cwd()}`);
    console.warn('   OneDrive 同期で .env や pc.env が他のPCに伝搬する可能性があります。');
    console.warn('   推奨: OneDrive 同期外のフォルダ（C:\\work\\ 等）に移動してください。\n');

    const rl0 = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => rl0.question('このまま続けますか？ (y/N): ', r));
    rl0.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('中止しました。');
      process.exit(0);
    }
  }
}

// Step 1: Node.js バージョン確認
function checkNodeVersion() {
  log('【ステップ 1/10】Node.js バージョン確認');
  const version = process.versions.node;
  const major = parseInt(version.split('.')[0], 10);
  if (major < 18) {
    logError(`Node.js 18 以上が必要です。現在のバージョン: v${version}`);
    logError('https://nodejs.org からダウンロードしてください。');
    process.exit(1);
  }
  logOk(`Node.js v${version} — OK`);
}

// Step 2: npm install
function runNpmInstall() {
  log('【ステップ 2/10】依存パッケージのインストール（npm install）');
  try {
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
    logOk('npm install 完了');
  } catch (e) {
    logError('npm install に失敗しました。');
    logError('ネットワーク接続を確認し、再度 node scripts/setup.js を実行してください。');
    process.exit(1);
  }
}

// Step 3: npm run build
function runBuild() {
  log('【ステップ 3/10】フロントエンドのビルド（npm run build）');
  try {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    logOk('ビルド完了');
  } catch (e) {
    logError('ビルドに失敗しました。');
    logError('エラー内容を確認してください。Node.js 18+ がインストール済みか確認すること。');
    process.exit(1);
  }
}

// Step 4: .env 確認（v4: 必須キーなし、PORT のみオプション）
function checkEnvFile() {
  log('【ステップ 4/10】環境設定ファイル（.env）の確認');
  const envPath = path.join(ROOT, '.env');

  if (!existsSync(envPath)) {
    log('.env ファイルが存在しません。v4 では必須ではありません（デフォルト PORT=3737 で起動）');
    return;
  }

  logOk('.env ファイルが存在します');

  const envContent = readFileSync(envPath, 'utf8');
  const envObj = parseEnv(envContent);

  const allKeysPresent = REQUIRED_KEYS.every(k => envObj[k] && envObj[k].trim() !== '');

  if (!allKeysPresent) {
    console.log('\n[Step 4] .env を確認してください。必須キー:');
    REQUIRED_KEYS.forEach(k => {
      const status = envObj[k] ? '✅' : '❌';
      console.log(`  ${status} ${k}`);
    });
    console.log('\n編集後に再度 node scripts/setup.js を実行してください。');
    process.exit(0);
  }
  console.log('[Step 4] .env 必須キー揃っています、続行します');
}

// Step 5: cloudflared 確認
async function checkCloudflared() {
  log('【ステップ 5/10】cloudflared コマンドの確認');

  // tunnel.js と同じロジックでパスを探す
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const wingetBase = path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');

  let wingetPath = null;
  try {
    const pkgs = readdirSync(wingetBase);
    const cfPkg = pkgs.find(p => p.startsWith('Cloudflare.cloudflared'));
    if (cfPkg) wingetPath = path.join(wingetBase, cfPkg, 'cloudflared.exe');
  } catch {}

  const candidates = [
    wingetPath,
    path.join(ROOT, 'cloudflared.exe'),
    'cloudflared',
  ].filter(Boolean);

  let found = false;
  for (const p of candidates) {
    try {
      execSync(`"${p}" --version`, { stdio: 'ignore' });
      found = true;
      logOk(`cloudflared が見つかりました: ${p}`);
      break;
    } catch {}
  }

  if (!found) {
    logWarn('cloudflared が見つかりません。');
    log('');
    log('  cloudflared がないとスマホからのアクセスに使うトンネルが起動できません。');
    log('  以下のいずれかでインストールしてください:');
    log('');
    log('  【方法1】winget（Windows ターミナル）:');
    log('    winget install Cloudflare.cloudflared');
    log('');
    log('  【方法2】手動ダウンロード:');
    log('    https://github.com/cloudflare/cloudflared/releases/latest');
    log('    → cloudflared-windows-amd64.exe をダウンロードして');
    log('      このフォルダに cloudflared.exe として保存');
    log('');
    log('  インストール後、再度 node scripts/setup.js を実行するか、');
    log('  そのままサーバーだけ起動することもできます（ローカル限定）。');
    log('');
  }
}

// Step 6: PC名入力
async function askPcName() {
  log('【ステップ 6/10】PC 名の設定');
  const defaultName = os.hostname();
  const input = await ask(`  このPCの名前を入力してください（デフォルト: ${defaultName}）: `);
  const pcName = input || defaultName;
  logOk(`PC 名: ${pcName}`);
  return pcName;
}

// Step 8: pc.env 生成（writeLocalIdentity 経由）
async function generatePcIdentity() {
  console.log('\n[Step 8] PC identity を生成中...');
  const pcId = randomUUID();
  const pcSecret = randomBytes(32).toString('hex');
  const result = writeLocalIdentity({ PC_ID: pcId, PC_SECRET: pcSecret });
  console.log(`✅ pc.env 作成完了`);
  console.log(`   PC_ID: ${pcId}`);
  console.log(`   保存先: %LOCALAPPDATA%/cc-remote/pc.env`);
  console.log('   (PC_SECRET は表示しません)');
}

// v4: doPairing 廃止（中央サーバーなし、tunnel URL を直接スマホへ配布）

// Step 10: サーバー起動 + PIN 設定（/api/auth/setup へ POST）
async function startServerAndSetPin(pcName) {
  console.log('\n[Step 10] サーバーを起動して PIN を設定します...');

  // .env に PC_NAME を書き込む
  const envPath = path.join(ROOT, '.env');
  updateEnvValue(envPath, 'PC_NAME', pcName);
  logOk('PC_NAME を .env に保存しました');

  const serverProcess = spawn('node', ['src/server/index.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    cwd: process.cwd(),
  });

  serverProcess.stdout.on('data', (chunk) => process.stdout.write(`[Server] ${chunk}`));
  serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[Server-err] ${chunk}`));

  // /api/auth/status をポーリング
  const POLL_INTERVAL = 500;
  const POLL_TIMEOUT = 10000;
  let elapsed = 0;
  let serverReady = false;
  let hasPin = null;

  console.log('   サーバー起動を待機中（最大10秒）...');
  while (elapsed < POLL_TIMEOUT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    elapsed += POLL_INTERVAL;

    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3737/api/auth/status', { timeout: 1000 }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });

      if (res.status === 200) {
        const parsed = JSON.parse(res.body);
        hasPin = parsed.hasPin;
        serverReady = true;
        break;
      }
    } catch (e) {
      // まだ起動中、リトライ
    }
  }

  if (!serverReady) {
    console.error('\n❌ サーバーが 10 秒以内に起動しませんでした。');
    console.error('   ポート 3737 が使用中でないか確認してください:');
    console.error('   netstat -ano | findstr :3737');
    process.exit(1);
  }

  console.log(`✅ サーバー起動確認 (hasPin: ${hasPin})`);

  if (hasPin === false) {
    // 新規 readline で PIN 入力を受付
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const ask2 = (prompt) => new Promise(r => rl2.question(prompt, r));

    let pinSet = false;
    while (!pinSet) {
      const pin = (await ask2('PIN を設定してください（4〜8桁の数字）: ')).trim();
      if (!/^\d{4,8}$/.test(pin)) {
        console.error('❌ PIN は 4〜8 桁の数字で入力してください');
        continue;
      }

      // POST /api/auth/setup
      const result = await new Promise((resolve, reject) => {
        const req = http.request({
          host: 'localhost',
          port: 3737,
          path: '/api/auth/setup',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ pin }));
        req.end();
      });

      if (result.status === 200 || result.status === 201) {
        console.log(`✅ PIN 設定完了`);
        pinSet = true;
      } else {
        console.error(`❌ PIN 設定失敗: HTTP ${result.status} ${result.body}`);
      }
    }

    rl2.close();
  }

  console.log('\n✅ セットアップ完了！');
  console.log('   スマホで cc-remote.web.app にアクセスして、PIN でログインしてください。');
  console.log('   サーバーは継続実行中（停止したい場合は別ターミナルで kill）');
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  separator();
  log('  CC Remote v3 セットアップ');
  log('  スマホから Claude Code を操作するツールをセットアップします。');
  separator();

  // Step 0: OneDrive パス警告
  await checkOneDrivePath();

  // Step 1: Node.js バージョン確認
  checkNodeVersion();
  log('');

  // Step 2: npm install
  runNpmInstall();
  log('');

  // Step 3: フロントエンドビルド
  runBuild();
  log('');

  // Step 4: .env 確認
  checkEnvFile();
  log('');

  // Step 5: cloudflared 確認
  await checkCloudflared();
  log('');

  // Step 6: PC名入力
  const pcName = await askPcName();
  log('');

  // Step 7: 旧 PIN 設定 → 削除（DIST-005）
  // Step 8: pc.env 生成
  await generatePcIdentity();
  log('');

  // v4: Step 9 のペアリング廃止（中央サーバーなし、tunnel URL を直接スマホへ配布）
  log('【ステップ 9/10】v4 ではペアリング不要 — サーバー起動後の QR コードでスマホ接続');
  log('');

  // rl.close() はここのみ
  rl.close();

  // Step 10: サーバー起動 + PIN 設定
  await startServerAndSetPin(pcName);
}

main().catch((err) => {
  logError('予期しないエラーが発生しました:');
  logError(err.message || String(err));
  logError('問題が解決しない場合は開発者に連絡してください。');
  process.exit(1);
});
