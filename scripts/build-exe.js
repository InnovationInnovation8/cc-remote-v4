/**
 * build-exe.js — CC Remote PC Agent exe builder
 *
 * Steps:
 *  1. npm run build  (Vite frontend)
 *  2. pkg → build/CC Remote.exe
 *  3. Copy native addons (node-pty, sql.js) next to exe
 *  4. Copy dist/ → build/dist/
 *  5. Download cloudflared.exe if not cached
 *  6. Create CC-Remote-Setup.zip from build/
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');
const CLOUDFLARED_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const CLOUDFLARED_CACHE = path.join(ROOT, '.cache', 'cloudflared.exe');
const CLOUDFLARED_DEST = path.join(BUILD_DIR, 'cloudflared.exe');
const DIST_ASSETS_DIR = path.join(__dirname, 'dist-assets');
const ZIP_EXCLUDE = ['.env', /\.bak$/, /^\.env_/, 'server.log', 'server.err'];
const ZIP_SIZE_WARN_MB = 250;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`\n▶ ${msg}`);
}

function run(cmd, opts = {}) {
  log(cmd);
  const result = spawnSync(cmd, { shell: true, cwd: ROOT, stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${cmd}`);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    log(`Downloading ${url}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    function get(currentUrl) {
      https
        .get(currentUrl, (res) => {
          // Follow redirects (GitHub releases redirect to S3)
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
          }
          const out = createWriteStream(dest);
          res.pipe(out);
          out.on('finish', () => out.close(resolve));
          out.on('error', reject);
        })
        .on('error', reject);
    }

    get(url);
  });
}

// ─── Build Steps ─────────────────────────────────────────────────────────────

async function step1_vite() {
  log('Step 1 — Vite frontend build');
  run('npm run build');
}

async function step2_pkg() {
  log('Step 2 — pkg compile → build/CC Remote.exe');
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  // pkg entry point: exe-entry.js (minimal stub that side-effect imports index.js).
  // First-run check and server start both happen in index.js via the _main() function
  // at the bottom of the file. The process.pkg branch handles the pkg-specific flow.
  // Use --no-bytecode because index.js bytecode compilation fails and the fallback
  // source-mode loading has its own issues with pkg's snapshot path resolution.
  // --public forces source inclusion for user modules.
  run(
    `npx --package=@yao-pkg/pkg pkg src/server/exe-entry.js --config pkg.config.json --compress GZip --no-bytecode --public --public-packages "*"`
  );
  // yao-pkg quirk: when outputPath ends with .exe, it creates a DIRECTORY
  // containing <entry-name>.exe instead of using it as the filename. Fix it.
  // The nested exe name matches the entry point (index.exe now, was exe-entry.exe).
  const expectedPath = path.join(BUILD_DIR, 'CC Remote.exe');
  if (fs.existsSync(expectedPath) && fs.statSync(expectedPath).isDirectory()) {
    // Find the nested exe — try known names first, then any .exe file in the dir
    const candidates = ['index.exe', 'exe-entry.exe'];
    let nestedExe = null;
    for (const c of candidates) {
      const p = path.join(expectedPath, c);
      if (fs.existsSync(p)) { nestedExe = p; break; }
    }
    if (!nestedExe) {
      const found = fs.readdirSync(expectedPath).find(f => f.endsWith('.exe'));
      if (found) nestedExe = path.join(expectedPath, found);
    }
    if (nestedExe) {
      const tmpPath = path.join(BUILD_DIR, '_cc_remote_tmp.exe');
      fs.renameSync(nestedExe, tmpPath);
      fs.rmdirSync(expectedPath);
      fs.renameSync(tmpPath, expectedPath);
      log(`  ↳ fixed yao-pkg outputPath quirk (${path.basename(nestedExe)} → CC Remote.exe)`);
    } else {
      log('  ⚠ yao-pkg quirk detected but no nested exe found');
    }
  }
}

async function step3_native_addons() {
  log('Step 3 — Copy native addons (node-pty, sql.js)');
  const nmSrc = path.join(ROOT, 'node_modules');
  const nmDest = path.join(BUILD_DIR, 'node_modules');

  for (const addon of ['node-pty', 'sql.js']) {
    const src = path.join(nmSrc, addon);
    const dest = path.join(nmDest, addon);
    if (!fs.existsSync(src)) {
      console.warn(`  ⚠ node_modules/${addon} not found — skipping`);
      continue;
    }
    log(`  Copying node_modules/${addon}`);
    copyDir(src, dest);
  }
}

async function step4_dist() {
  log('Step 4 — Copy dist/ → build/dist/');
  const src = path.join(ROOT, 'dist');
  const dest = path.join(BUILD_DIR, 'dist');
  if (!fs.existsSync(src)) {
    throw new Error('dist/ not found — did Vite build succeed?');
  }
  copyDir(src, dest);
}

async function step5_cloudflared() {
  log('Step 5 — cloudflared.exe');

  // Use cached copy if available
  if (fs.existsSync(CLOUDFLARED_CACHE)) {
    log('  Using cached cloudflared.exe');
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    fs.copyFileSync(CLOUDFLARED_CACHE, CLOUDFLARED_DEST);
    return;
  }

  await downloadFile(CLOUDFLARED_URL, CLOUDFLARED_CACHE);
  fs.copyFileSync(CLOUDFLARED_CACHE, CLOUDFLARED_DEST);
  log('  cloudflared.exe downloaded and cached');
}

async function step6_zip() {
  log('Step 6 — Creating CC-Remote-Setup.zip');
  const zipPath = path.join(ROOT, 'CC-Remote-Setup.zip');

  // Copy dist-assets (CLAUDE.md, README.txt) into build/
  for (const f of ['CLAUDE.md', 'README.txt']) {
    const src = path.join(DIST_ASSETS_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(BUILD_DIR, f));
      log(`  Copied ${f} → build/`);
    } else {
      console.warn(`  ⚠ ${f} not found at ${src}`);
    }
  }

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeMB = Math.round(archive.pointer() / 1024 / 1024);
      log(`  ZIP created: ${sizeMB} MB → CC-Remote-Setup.zip`);
      if (sizeMB > ZIP_SIZE_WARN_MB) {
        console.warn(`  ⚠ WARNING: ZIP exceeds ${ZIP_SIZE_WARN_MB} MB (${sizeMB} MB)`);
      }
      resolve();
    });
    archive.on('error', reject);
    archive.pipe(output);

    // Add build/ contents with exclusion filter
    for (const entry of fs.readdirSync(BUILD_DIR, { withFileTypes: true })) {
      const excluded = ZIP_EXCLUDE.some(p =>
        typeof p === 'string' ? entry.name === p : p.test(entry.name)
      );
      if (excluded) {
        log(`  Excluded: ${entry.name}`);
        continue;
      }
      const fullPath = path.join(BUILD_DIR, entry.name);
      if (entry.isDirectory()) {
        archive.directory(fullPath, entry.name);
      } else {
        archive.file(fullPath, { name: entry.name });
      }
    }

    archive.finalize();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  CC Remote — exe ビルド開始              ║');
  console.log('╚══════════════════════════════════════╝\n');

  try {
    await step1_vite();
    await step2_pkg();
    await step3_native_addons();
    await step4_dist();
    await step5_cloudflared();
    await step6_zip();

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  ビルド完了！                            ║');
    console.log('╚══════════════════════════════════════╝');
    console.log('\n成果物:');
    console.log('  build/CC Remote.exe      — メインの実行ファイル');
    console.log('  build/node_modules/      — ネイティブアドオン');
    console.log('  build/dist/              — フロントエンド');
    console.log('  build/cloudflared.exe    — トンネルクライアント');
    console.log('  CC-Remote-Setup.zip      — 配布用ZIP\n');
  } catch (err) {
    console.error('\n✖ ビルドエラー:', err.message);
    process.exit(1);
  }
}

main();
