/**
 * first-run.js — First-time setup wizard for CC Remote PC Agent exe
 *
 * Runs when the exe is launched without a valid .env (or missing PC_SECRET).
 * Uses readline for interactive console prompts (the exe runs in a console window).
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import os from 'os';
import https from 'https';
import http from 'http';

// .env lives next to the exe (process.execPath) when running as pkg bundle,
// or at the project root (process.cwd()) in dev mode.
// We do NOT use `import.meta.url` here — pkg's babel parser chokes on it
// (Rev 4 Block A post-fix). In dev mode, `node src/server/index.js` is run
// from the project root, so `process.cwd()` reliably points there.
const EXE_DIR = process.pkg
  ? path.dirname(process.execPath)
  : process.cwd();

const ENV_PATH = path.join(EXE_DIR, '.env');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  // Strip BOM and normalize CRLF for Windows Notepad compatibility
  const raw = fs.readFileSync(ENV_PATH, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function writeEnv(vars) {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
}

/**
 * Merge new key-value pairs into the existing .env without clobbering other keys.
 * Preserves BOM stripping / CRLF normalization from readEnv().
 */
function mergeEnv(newVars) {
  const existing = readEnv();
  const merged = { ...existing, ...newVars };
  writeEnv(merged);
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function getMacAddress() {
  try {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const addr of iface) {
        if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
          return addr.mac;
        }
      }
    }
  } catch (_) {}
  return 'unknown';
}

function addToStartup(exePath) {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const cmd = `reg add "${key}" /v "CC Remote" /t REG_SZ /d "${exePath}" /f`;
  execSync(cmd, { stdio: 'ignore' });
}

/**
 * postJson with a timeout (default 10s). Uses the same http/https approach
 * as the original postJson but aborts if the request takes too long.
 */
function postJsonWithTimeout(url, data, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch (_) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch (_) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Env sync ────────────────────────────────────────────────────────────────

/**
 * Sync .env contents into process.env so that lazy getters (e.g. getPCId())
 * pick up values written by writeEnv/mergeEnv in the same process.
 */
export function syncEnvToProcess() {
  const env = readEnv();
  Object.assign(process.env, env);
}

// ─── Exported API ─────────────────────────────────────────────────────────────

/**
 * Returns true if the exe needs first-run setup.
 * (No .env file, or .env exists but PC_SECRET is missing/empty)
 */
export function checkFirstRun() {
  const env = readEnv();
  return !env.PC_SECRET || env.PC_SECRET.trim() === '';
}

/**
 * Interactive first-run wizard.
 * Writes .env, optionally adds to startup, and registers with cloud server.
 */
export async function runFirstTimeSetup() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  CC Remote — PC エージェント セットアップ  ║');
    console.log('╚══════════════════════════════════════╝\n');
    console.log('初回起動です。セットアップを開始します。\n');

    // PC name
    const defaultName = os.hostname();
    const pcNameInput = await prompt(
      rl,
      `PC名を入力してください (デフォルト: ${defaultName}): `
    );
    const pcName = pcNameInput.trim() || defaultName;

    // PC_SECRET
    const pcSecret = randomBytes(32).toString('hex'); // 64 hex chars

    // v4: CLOUD_SERVER_URL 廃止（中央サーバーなし、P2P 直通）
    const existingEnv = readEnv();

    // Write .env
    writeEnv({
      PC_SECRET: pcSecret,
      PC_NAME: pcName,
      PORT: existingEnv.PORT || '3737',
    });
    syncEnvToProcess();

    console.log('\n.env ファイルを作成しました。\n');

    // Windows startup
    if (process.pkg) {
      const startupInput = await prompt(
        rl,
        'Windows起動時に自動起動しますか？ (y/N): '
      );
      if (startupInput.trim().toLowerCase() === 'y') {
        try {
          addToStartup(process.execPath);
          console.log('✔ スタートアップに追加しました。\n');
        } catch (err) {
          console.warn('⚠ スタートアップへの追加に失敗しました:', err.message);
        }
      }
    }

    // v4: ペアリング廃止（中央レジストリなし、各PCはトンネルURL+QRで直接接続）
    console.log('\n─'.repeat(42));
    console.log('セットアップ完了。サーバー起動後、トンネルURLが表示されます。');
    console.log('スマホからそのURLにアクセスして PIN を設定してください。');
    console.log('─'.repeat(42));
    console.log('セットアップ完了。サーバーを起動します...\n');
  } finally {
    rl.close();
  }
}

// ─── CLI (non-interactive) mode ──────────────────────────────────────────────

/**
 * Non-interactive first-run setup from CLI args.
 * v4: 中央クラウドなし、ペアリングなし。PC_SECRET/PC_NAME/PORT のみを .env に書く。
 *
 * @param {object} args
 * @param {string}  [args.pcName]        --pc-name (default: os.hostname())
 * @param {boolean} [args.autoStartup]   --auto-startup flag (opt-in only)
 */
export async function runFirstTimeSetupCLI(args) {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  CC Remote v4 — CLI セットアップ          ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 1. PC name
  const pcName = args.pcName || os.hostname();
  console.log(`PC名: ${pcName}`);

  // 2. Generate PC_SECRET
  const pcSecret = randomBytes(32).toString('hex');

  // 3. Write .env (merge with existing if present)
  const existingEnv = readEnv();
  writeEnv({
    ...existingEnv,
    PC_SECRET: pcSecret,
    PC_NAME: pcName,
    PORT: existingEnv.PORT || '3737',
  });
  syncEnvToProcess();
  console.log('✔ .env を作成しました');

  // 4. Auto-startup (Windows only, exe only, opt-in)
  if (args.autoStartup && process.pkg) {
    try {
      addToStartup(process.execPath);
      console.log('✔ スタートアップに追加しました');
    } catch (err) {
      console.warn(`⚠ スタートアップ追加失敗: ${err.message}`);
    }
  }

  console.log('\n' + '─'.repeat(42));
  console.log('セットアップ完了。サーバー起動後、トンネルURL+QRが表示されます。');
  console.log('スマホからそのURLにアクセスして PIN を設定してください。');
  console.log('─'.repeat(42) + '\n');
}
