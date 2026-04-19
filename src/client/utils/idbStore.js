// CC-Remote v4 — IndexedDB KV Store
//
// DB: cc-remote-v4, version: 1
// ObjectStore: kv (key-path: 'k', no auto-increment)
//
// API:
//   idbGet(key, defaultValue?)  → Promise<any>
//   idbSet(key, value)          → Promise<void>
//   idbDelete(key)              → Promise<void>
//   idbKeys()                   → Promise<string[]>
//   migrateFromLocalStorage()   → Promise<void>  (once, idempotent)

const DB_NAME = 'cc-remote-v4';
const DB_VERSION = 1;
const STORE = 'kv';
const MIGRATED_FLAG = '__migrated_v4';

// localStorage → IndexedDB 移行対象キー
// 「完全移行」: IndexedDB にコピー後、localStorage を削除する
const MIGRATE_KEYS_DELETE = [
  'ccr-active-pc',
  'ccr-tutorial-seen',
  'ccr-input-history',
  'ccr-autosave',
  'ccr-entitlements',
  'cc_remote_pcs',
];

// 「コピーのみ移行」: IndexedDB にコピーするが localStorage は残す
// （main.jsx の同期テーマ適用、sounds.js の同期読み取りのため）
const MIGRATE_KEYS_COPY = [
  'ccr-fontsize',
  'ccr-theme',
  'ccr-sound',
  'ccr-bgm',
  'ccr-font',
  'ccr-theme-accent',
  'ccr-theme-primary',
];

// フォールバック: IndexedDB 未対応時はメモリストアを使用
const memoryStore = new Map();
let useMemoryFallback = false;

// DB 接続を保持するプロミス
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      console.warn('[idbStore] IndexedDB unavailable, using memory fallback');
      useMemoryFallback = true;
      resolve(null);
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'k' });
      }
    };

    req.onsuccess = (event) => resolve(event.target.result);

    req.onerror = (event) => {
      console.warn('[idbStore] IndexedDB open failed, using memory fallback:', event.target.error);
      useMemoryFallback = true;
      resolve(null);
    };

    req.onblocked = () => {
      console.warn('[idbStore] IndexedDB blocked');
    };
  });

  return dbPromise;
}

// トランザクション実行ヘルパー
function txn(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * IndexedDB から値を取得する。
 * @param {string} key
 * @param {any} defaultValue
 * @returns {Promise<any>}
 */
export async function idbGet(key, defaultValue = null) {
  if (useMemoryFallback) {
    return memoryStore.has(key) ? memoryStore.get(key) : defaultValue;
  }
  try {
    const db = await openDb();
    if (!db) return memoryStore.has(key) ? memoryStore.get(key) : defaultValue;
    const result = await txn(db, 'readonly', (store) => store.get(key));
    return result !== undefined ? result.v : defaultValue;
  } catch (e) {
    console.warn('[idbStore] get error:', e);
    return defaultValue;
  }
}

/**
 * IndexedDB に値を保存する。
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export async function idbSet(key, value) {
  if (useMemoryFallback) {
    memoryStore.set(key, value);
    return;
  }
  try {
    const db = await openDb();
    if (!db) { memoryStore.set(key, value); return; }
    await txn(db, 'readwrite', (store) => store.put({ k: key, v: value }));
  } catch (e) {
    console.warn('[idbStore] set error:', e);
    memoryStore.set(key, value);
  }
}

/**
 * IndexedDB からキーを削除する。
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function idbDelete(key) {
  if (useMemoryFallback) {
    memoryStore.delete(key);
    return;
  }
  try {
    const db = await openDb();
    if (!db) { memoryStore.delete(key); return; }
    await txn(db, 'readwrite', (store) => store.delete(key));
  } catch (e) {
    console.warn('[idbStore] delete error:', e);
  }
}

/**
 * IndexedDB の全キー一覧を返す（デバッグ/移行用）。
 * @returns {Promise<string[]>}
 */
export async function idbKeys() {
  if (useMemoryFallback) {
    return [...memoryStore.keys()];
  }
  try {
    const db = await openDb();
    if (!db) return [...memoryStore.keys()];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAllKeys();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn('[idbStore] keys error:', e);
    return [];
  }
}

/**
 * localStorage → IndexedDB 自動マイグレーション（冪等）。
 * 起動時に一度だけ実行する。
 *
 * - MIGRATE_KEYS_DELETE: IndexedDB に移行後、localStorage を削除する
 * - MIGRATE_KEYS_COPY: IndexedDB にコピーするが localStorage は残す
 *   （main.jsx の同期テーマ適用・sounds.js の同期読み取りに必要）
 *
 * idb 書き込み失敗時は localStorage を残す（安全側に倒す）。
 */
export async function migrateFromLocalStorage() {
  // すでに移行済みかチェック
  const already = await idbGet(MIGRATED_FLAG, false);
  if (already) return;

  let allOk = true;

  // 完全移行（localStorage 削除）
  for (const key of MIGRATE_KEYS_DELETE) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) {
        let parsed;
        try { parsed = JSON.parse(val); } catch { parsed = val; }
        await idbSet(key, parsed);
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('[idbStore] migration failed for key:', key, e);
      allOk = false;
    }
  }

  // コピーのみ移行（localStorage 残す）
  for (const key of MIGRATE_KEYS_COPY) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) {
        let parsed;
        try { parsed = JSON.parse(val); } catch { parsed = val; }
        await idbSet(key, parsed);
        // localStorage は削除しない
      }
    } catch (e) {
      console.warn('[idbStore] migration failed (copy) for key:', key, e);
      allOk = false;
    }
  }

  // 認証系・廃止キーを掃除（IndexedDB には移行しない）
  try {
    localStorage.removeItem('ccr-google-session');
  } catch {}
  // ccr-remote-base / ccr-token-* は initApiStore() (api.js) が IDB 移行を担当するためここでは触らない

  if (allOk) {
    await idbSet(MIGRATED_FLAG, true);
    console.info('[idbStore] migration to IndexedDB complete');
  } else {
    console.warn('[idbStore] migration incomplete, will retry next time');
  }
}
