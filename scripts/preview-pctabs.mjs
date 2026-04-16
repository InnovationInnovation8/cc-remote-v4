// 一時検証用: PCTabs の4状態スクショ
// node scripts/preview-pctabs.mjs

import pkg from '/Users/lkoro/projects/handover-board/node_modules/playwright/index.js';
const { chromium } = pkg;
import { mkdir } from 'fs/promises';

const OUT_DIR = 'C:/Users/lkoro/OneDrive/Claude秘書/開発部/cc-remote-v3/preview-screenshots';
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });

// Preload script to seed IDB before page scripts run
const seedIdb = `
(async () => {
  const DB = 'cc-remote-v4';
  const STORE = 'kv';
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) {
        r.result.createObjectStore(STORE, { keyPath: 'k' });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = db.transaction(STORE, 'readwrite');
  const s = tx.objectStore(STORE);
  s.put({ k: 'ccr-remote-base', v: 'http://localhost:3737' });
  s.put({ k: 'ccr-token', v: 'preview-fake-pin' });
  s.put({ k: '__migrated_v4', v: true });
  await new Promise(r => tx.oncomplete = r);
})();
`;

async function capture(name, setupRoutes) {
  const page = await ctx.newPage();
  // Route blocks for dead localhost:3737 and dispatcher mocks
  await page.route('**/localhost:3737/**', route => route.fulfill({ status: 200, body: '[]' }));
  if (setupRoutes) await setupRoutes(page);

  // First load to establish origin, then seed IDB, reload
  await page.goto('http://localhost:5173/?__preview=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // PCTabs async load + 15s poll would be too long

  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
  console.log(`captured ${name}`);
  await page.close();
}

const DISPATCHER_RE = /cc-remote-dispatcher[^/]*\.workers\.dev\/api\/pcs/;

// State 1: dispatcher unreachable (CORS/network) → networkError
await capture('01-network-error', async (page) => {
  await page.route(DISPATCHER_RE, route => route.abort('failed'));
});

// State 2: 401 → authError
await capture('02-auth-error', async (page) => {
  await page.route(DISPATCHER_RE, route =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) })
  );
});

// State 3: empty → empty guidance
await capture('03-empty', async (page) => {
  await page.route(DISPATCHER_RE, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pcs: [] }) })
  );
});

// State 4: PCあり → 通常
await capture('04-with-pc', async (page) => {
  const now = Date.now();
  await page.route(DISPATCHER_RE, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      pcs: [
        { pcId: '会社PC', tunnel_url: 'https://example.trycloudflare.com', last_heartbeat_at: now - 30000, registered_at: now - 3600000 },
        { pcId: '家PC', tunnel_url: 'https://example2.trycloudflare.com', last_heartbeat_at: now - 15 * 60 * 1000, registered_at: now - 7200000 },
      ]
    }) })
  );
});

await browser.close();
console.log('done');
