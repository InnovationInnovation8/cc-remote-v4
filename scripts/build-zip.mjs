// CC-Remote v4 配布用 ZIP ビルドスクリプト
// Usage: node scripts/build-zip.mjs
// Output: CC-Remote-v4-YYYYMMDD.zip
//
// v4 changes vs v3:
//   - cloud-server/, firebase.json, .firebaserc, firestore.rules を INCLUDE から削除
//   - .trash/ を明示除外（v4 移行時に v3 退避ファイルが混入しないように）
//   - HARD_BLOCK に多数の追加パターン（中央サーバー由来ファイル）

import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

// ---- 設定 ----
const PROJECT_ROOT = process.cwd();
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const OUTPUT_FILE = `CC-Remote-v4-${today}.zip`;
const OUTPUT_PATH = path.join(PROJECT_ROOT, OUTPUT_FILE);

// ホワイトリスト方式: 含めるパス（ディレクトリは末尾 /、ファイルはそのまま）
const INCLUDE = [
  'src/',
  'scripts/',
  'public/',
  'docs/',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.js',
  'tailwind.config.js',
  'postcss.config.js',
  'README.md',
];

// 除外パターン（ホワイトリスト内でも除外する）
const EXCLUDE_PATTERNS = [
  /\/node_modules\//,
  /\/\.git\//,
  /\/dist\//,
  /\/build\//,
  /\/\.cache\//,
  /\/\.backups\//,
  /\/\.trash\//,
  /\/\.omc\//,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)pc\.env$/,
  /(^|\/)firebase-admin-key\.json$/,
  /_2026\d{4}_\d{4}\./,
  /\.bak$/,
  /\.log$/,
  /\.err$/,
  /(^|\/)server\.log$/,
  /(^|\/)server\.err$/,
  // v4: AI 指示ファイル禁止（CLAUDE.md / AGENTS.md / .cursorrules）
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)AGENTS\.md$/i,
  /(^|\/)\.cursorrules$/i,
  /(^|\/)\.aider\.conf/i,
  // v4: v3 中央サーバー時代の startup / pairing スクリプト
  /(^|\/)startup\.vbs$/i,
  /(^|\/)agent-setup\.bat$/i,
  /(^|\/)send-pairing-code\.ps1$/i,
  /(^|\/)register-pc\.js$/i,
  /(^|\/)migrate-pc-identity\.mjs$/i,
  /(^|\/)deploy-firestore-rules\.js$/i,
  /(^|\/)bubblewrap-/i,
  /(^|\/)find-ccremote-window\.ps1$/i,
  // v4: agent/（中央サーバー時代の relay agent）
  /(^|\/)src\/agent\//,
  // テストバックアップ
  /_backup\./i,
  /_test_/i,
  /(^|\/)check-current-session\.mjs$/i,
  /(^|\/)test-list-claude-sessions\.mjs$/i,
];

// ハードブロック: ZIP に絶対含めてはいけないパターン（検知時 process.exit(1)）
const HARD_BLOCK_PATTERNS = [
  /(^|\/)firebase-admin-key\.json$/,
  /(^|\/)\.env$/,
  /(^|\/)pc\.env$/,
  /(^|\/)\.firebaserc$/,
  /(^|\/)firebase\.json$/,
  /(^|\/)firestore\.rules$/,
  /(^|\/)cloud-server\//,
  /(^|\/)src\/cloud\//,
  /(^|\/)central-server.*\.js$/,
  /(^|\/)firestore-pc\.js$/,
  /(^|\/)multi-pc\.js$/,
  // v4: AI 指示ファイルの自動配布禁止（Stranger Test / 第三者 Claude 拒否対策）
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)AGENTS\.md$/i,
  // v4: 中央サーバー時代の永続化スクリプト
  /(^|\/)startup\.vbs$/i,
];

// ---- 関数 ----
function shouldExclude(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

function addPathRecursive(zip, sourcePath, zipPath) {
  if (!fs.existsSync(sourcePath)) {
    console.log(`  [スキップ] 存在しない: ${sourcePath}`);
    return 0;
  }

  const stat = fs.statSync(sourcePath);
  let count = 0;

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(sourcePath);
    for (const entry of entries) {
      const fullPath = path.join(sourcePath, entry);
      const zipEntry = zipPath ? `${zipPath}/${entry}` : entry;
      if (shouldExclude(fullPath)) continue;
      count += addPathRecursive(zip, fullPath, zipEntry);
    }
  } else {
    if (shouldExclude(sourcePath)) return 0;
    const data = fs.readFileSync(sourcePath);
    zip.addFile(zipPath, data);
    count = 1;
  }

  return count;
}

// ---- メイン ----
console.log(`[Build] 配布 ZIP を生成中: ${OUTPUT_FILE}`);
const zip = new AdmZip();
let totalFiles = 0;

for (const includePath of INCLUDE) {
  const isDirectory = includePath.endsWith('/');
  const cleanPath = isDirectory ? includePath.slice(0, -1) : includePath;
  const sourcePath = path.join(PROJECT_ROOT, cleanPath);
  const zipPath = cleanPath;
  const added = addPathRecursive(zip, sourcePath, zipPath);
  totalFiles += added;
  console.log(`  [追加] ${cleanPath} (${added} files)`);
}

// ---- post-archive hard block scan ----
console.log(`[Build] post-archive セキュリティチェック実行中...`);
const entries = zip.getEntries();
const violations = [];
for (const entry of entries) {
  const entryName = entry.entryName.replace(/\\/g, '/');
  for (const pattern of HARD_BLOCK_PATTERNS) {
    if (pattern.test(entryName)) {
      violations.push({ entryName, pattern: pattern.toString() });
    }
  }
}

if (violations.length > 0) {
  console.error(`\n[HARD BLOCK] 配布禁止ファイルが ZIP に含まれています:`);
  for (const v of violations) {
    console.error(`  - ${v.entryName} (matched ${v.pattern})`);
  }
  console.error(`\n中止します。ZIP ファイルを生成しません。除外パターンを確認してください。`);
  process.exit(1);
}
console.log(`[OK] セキュリティチェック (${entries.length} entries scanned, 0 violations)`);

// ---- 書き出し ----
zip.writeZip(OUTPUT_PATH);
const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
console.log(`\n配布 ZIP 生成完了`);
console.log(`  Path: ${OUTPUT_PATH}`);
console.log(`  Size: ${sizeMB} MB`);
console.log(`  Files: ${totalFiles}`);
console.log(`\n配布前に以下を確認してください:`);
console.log(`  PowerShell:`);
console.log(`    [IO.Compression.ZipFile]::OpenRead('${OUTPUT_FILE}').Entries | Where-Object {$_.Name -eq 'firebase-admin-key.json'}`);
console.log(`  期待: 結果が空 (マッチなし)`);
