// PC identity loader
// Rev 6: OneDrive 同期の .env とは別に、マシンローカル (%LOCALAPPDATA%) に
// PC_ID / PC_SECRET を保存することで、複数 PC で .env を共有した時の
// Firestore doc 衝突を回避する。
//
// Priority:
//   1. 既に process.env.PC_ID が設定されていれば (OS 環境変数 / CLI) そのまま使う
//   2. %LOCALAPPDATA%/cc-remote/pc.env に KEY=VALUE 形式で記述があればそれを使う
//   3. どちらもなければ .env の値 (dotenv/config で別に読み込まれる) にフォールバック
//
// index.js の冒頭で `import './pc-identity.js'` するだけで反映される。
// 初回マイグレーション時は migratePcIdentityFromSharedEnv() を一度呼ぶと
// .env から値をコピーして pc.env を作成する。
import fs from 'fs';
import os from 'os';
import path from 'path';

const LOCAL_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), '.cc-remote'),
  'cc-remote'
);
const LOCAL_ENV_PATH = path.join(LOCAL_DIR, 'pc.env');

const KEYS = ['PC_ID', 'PC_SECRET'];

function parseKeyValueFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key) out[key] = value;
    }
  } catch (_) { /* ignore */ }
  return out;
}

function writeKeyValueFile(filePath, obj) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const lines = [
    '# CC Remote PC identity (machine-local, NOT synced)',
    '# 複数 PC で .env を共有する時の PC_ID / PC_SECRET 衝突回避用。',
    ...Object.entries(obj).map(([k, v]) => `${k}=${v}`),
    '',
  ];
  fs.writeFileSync(filePath, lines.join('\n'), { mode: 0o600 });
}

function applyLocalEnv() {
  const local = parseKeyValueFile(LOCAL_ENV_PATH);
  for (const key of KEYS) {
    if (local[key]) {
      // マシンローカル値は常に shared .env より優先 (複数 PC で同じ OneDrive
      // .env を共有してもローカル設定が勝つ)
      process.env[key] = local[key];
    }
  }
  return local;
}

// マシン起動時の self-apply
applyLocalEnv();

export function getLocalIdentityPath() {
  return LOCAL_ENV_PATH;
}

export function readLocalIdentity() {
  return parseKeyValueFile(LOCAL_ENV_PATH);
}

export function writeLocalIdentity(values) {
  const existing = parseKeyValueFile(LOCAL_ENV_PATH);
  const merged = { ...existing };
  for (const key of KEYS) {
    if (values[key]) merged[key] = values[key];
  }
  writeKeyValueFile(LOCAL_ENV_PATH, merged);
  return merged;
}

// 一度だけ: shared .env から pc.env へコピーし .env 側を空にする
// (既存のホーム PC 環境を機械ローカル化する目的)
export function migratePcIdentityFromSharedEnv(envFilePath) {
  if (!envFilePath || !fs.existsSync(envFilePath)) return { migrated: false, reason: 'no .env' };
  // すでに pc.env が存在し、値が入っていればマイグレーション済み
  const existingLocal = parseKeyValueFile(LOCAL_ENV_PATH);
  if (existingLocal.PC_SECRET && existingLocal.PC_ID) {
    return { migrated: false, reason: 'already migrated' };
  }
  const shared = parseKeyValueFile(envFilePath);
  const toMigrate = {};
  for (const key of KEYS) {
    if (shared[key]) toMigrate[key] = shared[key];
  }
  if (!toMigrate.PC_SECRET) return { migrated: false, reason: 'no PC_SECRET in shared .env' };
  writeLocalIdentity(toMigrate);
  return { migrated: true, path: LOCAL_ENV_PATH, values: toMigrate };
}
