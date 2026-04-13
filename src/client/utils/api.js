// API Base URL management — CC Remote v4 (P2P direct, no cloud relay)
//
// v4 changes vs v3:
//   - cloudUrl / isCloudMode / cloud relay mode 完全削除（中央サーバーなし）
//   - activePcId / x-pc-id 削除（PC 選択は localStorage 'cc_remote_pcs' で管理）
//   - refreshRemoteBaseFromFirestore + B-2 retry 削除（Firestore 廃止）
//   - getAuthHeaders は x-pin only に単純化
//   - Bearer / X-PIN-Token / 2FA セッショントークン 削除
//   - PIN session token (sessionStorage) は保持（タブスコープの 2FA に将来使う場合）

let remoteBase = localStorage.getItem('ccr-remote-base') || '';

// ---------------------------------------------------------------------------
// v4 backward-compat stubs — return false/empty/no-op so existing callers
// (App.jsx, useAuth.js, PinLogin.jsx, Settings.jsx, useSSE.js, useSchedules.js,
//  PCTabs.jsx, etc.) keep building. Each consumer should be progressively
// cleaned to remove these calls entirely. Once all references are gone,
// delete the stubs.
// ---------------------------------------------------------------------------
export function isCloudMode() { return false; }
export function getCloudUrl() { return ''; }
export function setCloudUrl(_url) { /* no-op in v4 */ }
export function getActivePcId() { return ''; }
export function setActivePcId(_id) { /* no-op in v4 */ }
export function getSseBase() { return ''; /* SSE is forbidden in v3+; v4 keeps polling */ }

// ---------------------------------------------------------------------------
// Remote PC base URL (cloudflared tunnel URL)
// ---------------------------------------------------------------------------
export function getApiBase() {
  if (remoteBase) return remoteBase + '/api';
  return '/api';
}

export function setRemoteBase(url) {
  if (url) {
    remoteBase = url.replace(/\/+$/, '');
    localStorage.setItem('ccr-remote-base', remoteBase);
  } else {
    remoteBase = '';
    localStorage.removeItem('ccr-remote-base');
  }
}

export function getRemoteBase() {
  return remoteBase;
}

export function isRemote() {
  return !!remoteBase;
}

// ---------------------------------------------------------------------------
// Per-PC token storage (key = ccr-token-{host} for remote, ccr-token for local)
// ---------------------------------------------------------------------------
function tokenKey() {
  if (!remoteBase) return 'ccr-token';
  try {
    return `ccr-token-${new URL(remoteBase).host}`;
  } catch {
    return 'ccr-token';
  }
}

export function getToken() {
  return localStorage.getItem(tokenKey());
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(tokenKey(), token);
  } else {
    localStorage.removeItem(tokenKey());
  }
}

export function clearToken() {
  localStorage.removeItem(tokenKey());
}

// ---------------------------------------------------------------------------
// PIN session token (kept for forward compat; no-op in v4 MVP)
// ---------------------------------------------------------------------------
const PIN_SESSION_KEY = 'ccr-pin-session';

export function getPinSessionToken() {
  try { return sessionStorage.getItem(PIN_SESSION_KEY); } catch { return null; }
}

export function setPinSessionToken(token) {
  try {
    if (token) sessionStorage.setItem(PIN_SESSION_KEY, token);
    else sessionStorage.removeItem(PIN_SESSION_KEY);
  } catch {}
}

export function clearPinSessionToken() {
  try { sessionStorage.removeItem(PIN_SESSION_KEY); } catch {}
}

// ---------------------------------------------------------------------------
// Auth headers — v4: x-pin only
// ---------------------------------------------------------------------------
export function getAuthHeaders() {
  const token = getToken();
  return { 'x-pin': token || '' };
}

function buildHeaders(options) {
  return {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };
}

// ---------------------------------------------------------------------------
// apiFetch — single-shot, no Firestore retry (v4 has no cloud registry)
// ---------------------------------------------------------------------------
export async function apiFetch(path, options = {}) {
  const base = getApiBase();
  const headers = buildHeaders(options);
  const res = await fetch(`${base}${path}`, {
    ...options,
    mode: isRemote() ? 'cors' : options.mode,
    headers,
  });

  if (res.status === 401 && !isRemote()) {
    clearToken();
    location.reload();
    throw new Error('認証エラー');
  }
  if (res.status === 401 && isRemote()) {
    clearToken();
    throw new Error('リモートPCの認証に失敗しました。PINを再入力してください');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `エラー (${res.status})`);
  }
  return res.json();
}
