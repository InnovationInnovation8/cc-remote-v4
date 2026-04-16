// CC-Remote v4 — PC list store (IndexedDB backed, sync API via in-memory cache)
//
// Schema: cc_remote_pcs = [{ id, label, url, addedAt }]
//
// 設計: IndexedDB を永続ストアとして使いつつ、モジュールレベルのメモリキャッシュで
// 同期 API (listPcs / findPc) を提供する。呼び出し側のシグネチャ変更を最小化するため。
//
// initPcStore() を起動時に呼ぶことで IndexedDB → キャッシュへロードする。
// それ以降は listPcs() が同期で返せる。

import { idbGet, idbSet } from './idbStore';

const KEY = 'cc_remote_pcs';

// モジュールレベルのメモリキャッシュ
let _cache = null;

/**
 * 起動時に一度呼ぶことで IndexedDB からキャッシュをロードする。
 * migrateFromLocalStorage() の後に呼ぶこと。
 */
export async function initPcStore() {
  const raw = await idbGet(KEY, []);
  try {
    _cache = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {
    _cache = [];
  }
}

function getCache() {
  if (_cache === null) {
    // initPcStore() 未呼び出し時のフォールバック（空配列）
    return [];
  }
  return _cache;
}

function persist(list) {
  _cache = list;
  idbSet(KEY, list); // 非同期で保存（fire-and-forget）
}

export function listPcs() {
  return getCache();
}

export function savePcs(list) {
  persist(list || []);
}

export function addPc({ label, url }) {
  if (!url) throw new Error('url required');
  const cleanUrl = url.replace(/\/+$/, '');
  const list = listPcs();
  // Avoid duplicates by URL
  if (list.some(p => p.url === cleanUrl)) {
    throw new Error('このPCはすでに登録されています');
  }
  const pc = {
    id: crypto.randomUUID(),
    label: (label || '').trim() || cleanUrl,
    url: cleanUrl,
    addedAt: new Date().toISOString(),
  };
  list.push(pc);
  persist(list);
  return pc;
}

export function removePc(id) {
  const list = listPcs().filter(p => p.id !== id);
  persist(list);
}

export function renamePc(id, newLabel) {
  const list = listPcs().map(p => p.id === id ? { ...p, label: newLabel } : p);
  persist(list);
}

export function findPc(id) {
  return listPcs().find(p => p.id === id) || null;
}

// Health check: ping the tunnel URL's /api/ping (auth-free in v4)
export async function pingPc(url, timeoutMs = 3000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${url}/api/ping`, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Dispatcher から PC 一覧を取得する（Cookie 認証）
 *
 * @param {string} dispatcherUrl - dispatcher の base URL（例: https://<worker>.<subdomain>.workers.dev）
 * @returns {Promise<Array<{ pc_id: string, label: string, tunnel_url: string, last_heartbeat_at: number, registered_at: number }>>}
 * @throws {Error} 401 の場合は 'unauthorized' エラー、その他エラーも throw
 */
export async function fetchPcsFromDispatcher(dispatcherUrl) {
  const resp = await fetch(`${dispatcherUrl}/api/pcs`, {
    method: 'GET',
    credentials: 'include',
  });

  if (resp.status === 401) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }

  if (!resp.ok) {
    const err = new Error(`dispatcher error: ${resp.status}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  return data.pcs || [];
}
