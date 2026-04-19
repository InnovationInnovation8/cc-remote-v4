// API Base URL management — CC Remote v4 (P2P direct, no cloud relay)
//
// v4 changes vs v3:
//   - cloudUrl / isCloudMode / cloud relay mode 完全削除（中央サーバーなし）
//   - activePcId / x-pc-id 削除（PC 選択は IndexedDB 'cc_remote_pcs' で管理）
//   - refreshRemoteBaseFromFirestore + B-2 retry 削除（Firestore 廃止）
//   - getAuthHeaders は x-pin only に単純化
//   - Bearer / X-PIN-Token / 2FA セッショントークン 削除
//   - PIN session token (sessionStorage) は保持（タブスコープの 2FA に将来使う場合）
//
// Task 3-2 追補: ccr-remote-base / ccr-token-* を localStorage から IndexedDB へ移行。
//   - モジュール変数（remoteBase, currentToken）はメモリキャッシュとして残す
//     → 既存の同期 getToken() / getRemoteBase() 呼び出し元を変更せずに済む
//   - initApiStore() を起動時に App.jsx から呼び出してもらう
//     → IDB から初期値を読み込んでメモリキャッシュを温める
//   - set*/clear* は IDB に書き込む（localStorage は使わない）

import { idbGet, idbSet, idbDelete } from './idbStore';

// ---------------------------------------------------------------------------
// Memory cache — IDB 読み込み完了前でも同期 getter が使える
// ---------------------------------------------------------------------------
let remoteBase = '';
let currentToken = '';
// 2026-04-17: トンネルURLは trycloudflare の関係で再起動毎に変わるため、
// token / google session の IDB キーを host ベース → pcLabel ベースに変更した。
// これによりサーバー再起動で URL が変わっても同じ PC なら token を引き継げる。
let currentPcLabel = '';

// ---------------------------------------------------------------------------
// IDB キー定数
// ---------------------------------------------------------------------------
const IDB_REMOTE_BASE_KEY = 'ccr-remote-base';
const IDB_ACTIVE_PCLABEL_KEY = 'ccr-active-pclabel';

function tokenIdbKey() {
  if (currentPcLabel) return `ccr-token-${currentPcLabel}`;
  if (!remoteBase) return 'ccr-token';
  try {
    return `ccr-token-${new URL(remoteBase).host}`;
  } catch {
    return 'ccr-token';
  }
}

function googleSessionIdbKey() {
  if (currentPcLabel) return `ccr-google-session-${currentPcLabel}`;
  if (!remoteBase) return 'ccr-google-session';
  try {
    return `ccr-google-session-${new URL(remoteBase).host}`;
  } catch {
    return 'ccr-google-session';
  }
}

// ---------------------------------------------------------------------------
// initApiStore — App.jsx 起動時に呼ぶ。IDB から remoteBase と token を読み込む。
// また旧 localStorage 残留値があれば IDB に移行して localStorage から削除する。
// ---------------------------------------------------------------------------
export async function initApiStore() {
  // 1. ccr-remote-base の移行
  const lsBase = localStorage.getItem(IDB_REMOTE_BASE_KEY);
  if (lsBase !== null) {
    // localStorage に残留していれば IDB に移行して削除
    try {
      await idbSet(IDB_REMOTE_BASE_KEY, lsBase);
      localStorage.removeItem(IDB_REMOTE_BASE_KEY);
    } catch (_) {}
  }
  const savedBase = await idbGet(IDB_REMOTE_BASE_KEY, '');
  remoteBase = savedBase ? savedBase.replace(/\/+$/, '') : '';

  // 2.5. activePcLabel 復元（token キー算出に使う）
  const savedPcLabel = await idbGet(IDB_ACTIVE_PCLABEL_KEY, '');
  currentPcLabel = (savedPcLabel || '').toString().trim();

  // 2. ccr-token-* の移行（remoteBase / pcLabel 確定後にキーを決定できる）
  const tokenKey = tokenIdbKey();
  const lsToken = localStorage.getItem(tokenKey);
  if (lsToken !== null) {
    try {
      await idbSet(tokenKey, lsToken);
      localStorage.removeItem(tokenKey);
    } catch (_) {}
  }
  // 旧キー ccr-token も念のため移行
  const lsTokenFallback = localStorage.getItem('ccr-token');
  if (lsTokenFallback !== null && tokenKey !== 'ccr-token') {
    try {
      await idbSet('ccr-token', lsTokenFallback);
      localStorage.removeItem('ccr-token');
    } catch (_) {}
  }
  currentToken = await idbGet(tokenKey, '') || '';
}

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

// 2026-04-17: pcLabel ベースの IDB キー切替用 setter
export function setActivePcLabel(label) {
  const trimmed = (label || '').toString().trim();
  if (trimmed === currentPcLabel) return;
  currentPcLabel = trimmed;
  if (trimmed) {
    idbSet(IDB_ACTIVE_PCLABEL_KEY, trimmed).catch(() => {});
    // pcLabel 確定後の token / session キーで再ロードしてメモリキャッシュを更新
    idbGet(tokenIdbKey(), '').then((t) => { currentToken = t || ''; }).catch(() => {});
  } else {
    idbDelete(IDB_ACTIVE_PCLABEL_KEY).catch(() => {});
  }
}

export function getActivePcLabel() {
  return currentPcLabel;
}

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
    idbSet(IDB_REMOTE_BASE_KEY, remoteBase).catch(() => {});
  } else {
    remoteBase = '';
    idbDelete(IDB_REMOTE_BASE_KEY).catch(() => {});
  }
}

export function getRemoteBase() {
  return remoteBase;
}

export function isRemote() {
  return !!remoteBase;
}

// ---------------------------------------------------------------------------
// Per-PC token storage (IDB key = ccr-token-{host} for remote, ccr-token for local)
// ---------------------------------------------------------------------------
export function getToken() {
  return currentToken || null;
}

export function setToken(token) {
  currentToken = token || '';
  const key = tokenIdbKey();
  if (token) {
    idbSet(key, token).catch(() => {});
  } else {
    idbDelete(key).catch(() => {});
  }
}

export function clearToken() {
  const key = tokenIdbKey();
  currentToken = '';
  idbDelete(key).catch(() => {});
}

// 段階1+2: Google session の IDB getter/setter（非同期）
export async function getGoogleSession() {
  const key = googleSessionIdbKey();
  return (await idbGet(key, '')) || '';
}

export async function setGoogleSession(session) {
  const key = googleSessionIdbKey();
  if (session) {
    await idbSet(key, session);
  } else {
    await idbDelete(key);
  }
}

export async function clearGoogleSession() {
  const key = googleSessionIdbKey();
  await idbDelete(key);
}

// ---------------------------------------------------------------------------
// 案1 (2026-04-17): Workers Dispatcher link-ticket の取得・受け渡し
//
// fetchLinkTicket: Dispatcher の Cookie で認証済みなら、pc_id 向け HMAC チケットを取得。
//   cross-origin fetch になるので credentials:'include' と mode:'cors' が必須。
// dispatcherLink: PC側 /api/auth/dispatcher-link に ticket を渡して token を取得。
// 一時保管は sessionStorage（タブ閉じで自動消える／他タブには漏らさない）。
// ---------------------------------------------------------------------------

const PENDING_TICKET_KEY = 'ccr-pending-link-ticket';

function getDispatcherOrigin() {
  // production build では VITE_DISPATCHER_MODE=1 で「同一オリジン = Workers」
  // 開発時は VITE_DISPATCHER_URL で cross-origin 指定
  const url = import.meta.env.VITE_DISPATCHER_URL || '';
  if (url) return url.replace(/\/+$/, '');
  if (import.meta.env.VITE_DISPATCHER_MODE === '1') return window.location.origin;
  return '';
}

export async function fetchLinkTicket(pcId) {
  const dispatcher = getDispatcherOrigin();
  if (!dispatcher || !pcId) return null;
  try {
    const res = await fetch(`${dispatcher}/api/auth/link-ticket`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pc_id: pcId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ticket ? { ticket: data.ticket, pcId, exp: data.exp } : null;
  } catch {
    return null;
  }
}

export function setPendingLinkTicket(entry) {
  try {
    if (entry) sessionStorage.setItem(PENDING_TICKET_KEY, JSON.stringify(entry));
    else sessionStorage.removeItem(PENDING_TICKET_KEY);
  } catch {}
}

export function consumePendingLinkTicket(pcId) {
  try {
    const raw = sessionStorage.getItem(PENDING_TICKET_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    // 別PCへの誤流用と期限切れを弾く
    if (!entry || !entry.ticket) { sessionStorage.removeItem(PENDING_TICKET_KEY); return null; }
    if (pcId && entry.pcId && entry.pcId !== pcId) return null;
    if (entry.exp && Date.now() > entry.exp) {
      sessionStorage.removeItem(PENDING_TICKET_KEY);
      return null;
    }
    // ワンショット: 使ったら消す
    sessionStorage.removeItem(PENDING_TICKET_KEY);
    return entry;
  } catch {
    return null;
  }
}

export async function dispatcherLink(ticket) {
  const base = getApiBase();
  const res = await fetch(`${base}/auth/dispatcher-link`, {
    method: 'POST',
    mode: isRemote() ? 'cors' : undefined,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `dispatcher-link failed (${res.status})`);
  }
  return res.json(); // { ok, session, token, email }
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
