/**
 * invite.js のユニットテスト
 * Node.js 18+ の built-in test runner (node:test) を使用
 * 実行: node --test workers/src/routes/invite.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleInviteCreate, handleInviteAccept } from './invite.js';

// --- モックヘルパー ---

function makeStorage() {
  const map = new Map();
  return {
    async put(key, value) { map.set(key, value); },
    async get(key) { return map.get(key) ?? null; },
    async delete(key) { map.delete(key); },
    async list({ prefix } = {}) {
      const result = new Map();
      for (const [k, v] of map) {
        if (!prefix || k.startsWith(prefix)) result.set(k, v);
      }
      return result;
    },
  };
}

// 実際の InviteStore を使うスタブファクトリ
function makeDOBinding(handler) {
  return {
    idFromName(_name) { return 'mock-id'; },
    get(_id) { return { fetch: handler }; },
  };
}

/**
 * SessionStore スタブ: 指定した email_hash を返す、または失敗
 */
function makeSessionStoreOk(email_hash) {
  return makeDOBinding(async (_req) => {
    return Response.json({ session: { token: 'sess', email_hash, created_at: Date.now(), expires_at: Date.now() + 86400000 } });
  });
}

function makeSessionStoreUnauth() {
  return makeDOBinding(async (_req) => {
    return Response.json({ error: 'session not found' }, { status: 404 });
  });
}

/**
 * InviteStore スタブ: 実際の処理を InviteStore DO にルーティング
 */
import { InviteStore } from '../do/invite-store.js';

function makeInviteStoreBinding() {
  const storage = makeStorage();
  const state = { storage };
  const store = new InviteStore(state, {});
  return makeDOBinding((req) => store.fetch(req));
}

function makeEnv({ sessionOk = true, emailHash = 'testhash', inviteStoreOverride } = {}) {
  return {
    SESSION_STORE: sessionOk ? makeSessionStoreOk(emailHash) : makeSessionStoreUnauth(),
    INVITE_STORE: inviteStoreOverride || makeInviteStoreBinding(),
    ALLOWED_ORIGINS: 'http://localhost',
  };
}

// --- POST /api/invite/create ---

test('handleInviteCreate: セッションなしは 401', async () => {
  const req = new Request('http://worker/api/invite/create', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
  });
  const env = makeEnv({ sessionOk: false });
  const resp = await handleInviteCreate(req, env);
  assert.equal(resp.status, 401);
  const json = await resp.json();
  assert.ok(json.error.includes('unauthorized'));
});

test('handleInviteCreate: 不正な Origin は 403', async () => {
  const req = new Request('http://worker/api/invite/create', {
    method: 'POST',
    headers: {
      Origin: 'http://evil.example.com',
      Cookie: 'session=validtoken',
    },
  });
  const env = makeEnv({ sessionOk: true });
  const resp = await handleInviteCreate(req, env);
  assert.equal(resp.status, 403);
});

test('handleInviteCreate: 有効なセッションで invite_url を返す', async () => {
  const req = new Request('http://worker/api/invite/create', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      Cookie: 'session=validtoken',
    },
  });
  const env = makeEnv({ sessionOk: true, emailHash: 'creator-hash' });
  const resp = await handleInviteCreate(req, env);
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.equal(json.ok, true);
  assert.ok(typeof json.invite_url === 'string');
  assert.ok(json.invite_url.startsWith('http://worker/invite/'));
  assert.ok(typeof json.expires_at === 'number');
  assert.ok(json.expires_at > Date.now());
});

test('handleInviteCreate: SESSION_STORE 未設定は 503', async () => {
  const req = new Request('http://worker/api/invite/create', {
    method: 'POST',
    headers: { Origin: 'http://localhost', Cookie: 'session=tok' },
  });
  const resp = await handleInviteCreate(req, { INVITE_STORE: makeInviteStoreBinding() });
  assert.equal(resp.status, 503);
});

// --- GET /invite/:token ---

test('handleInviteAccept: 有効なトークンで /api/auth/google へリダイレクト', async () => {
  const env = makeEnv();
  // 先に招待トークンを作成
  const createReq = new Request('http://worker/api/invite/create', {
    method: 'POST',
    headers: { Origin: 'http://localhost', Cookie: 'session=valid' },
  });
  const createResp = await handleInviteCreate(createReq, env);
  const { invite_url } = await createResp.json();
  const token = invite_url.split('/invite/')[1];

  // GET /invite/:token
  const acceptReq = new Request(invite_url, { method: 'GET' });
  const resp = await handleInviteAccept(acceptReq, env);
  assert.equal(resp.status, 302);
  const location = resp.headers.get('Location');
  assert.ok(location.includes('/api/auth/google'));
  assert.ok(location.includes(`invite=${encodeURIComponent(token)}`));
});

test('handleInviteAccept: 存在しないトークンは 410 HTML', async () => {
  const env = makeEnv();
  const req = new Request('http://worker/invite/nonexistent-token', { method: 'GET' });
  const resp = await handleInviteAccept(req, env);
  assert.equal(resp.status, 410);
  const body = await resp.text();
  assert.ok(body.includes('招待リンクが無効です'));
});

test('handleInviteAccept: 使用済みトークンは 410 HTML', async () => {
  const env = makeEnv();
  // 招待作成
  const createReq = new Request('http://worker/api/invite/create', {
    method: 'POST',
    headers: { Origin: 'http://localhost', Cookie: 'session=valid' },
  });
  const createResp = await handleInviteCreate(createReq, env);
  const { invite_url } = await createResp.json();
  const token = invite_url.split('/invite/')[1];

  // 使用済みにする
  const inviteDoId = env.INVITE_STORE.idFromName('global');
  const inviteStub = env.INVITE_STORE.get(inviteDoId);
  await inviteStub.fetch(
    new Request(`http://do/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, used_by_email_hash: 'someone' }),
    })
  );

  const acceptReq = new Request(invite_url, { method: 'GET' });
  const resp = await handleInviteAccept(acceptReq, env);
  assert.equal(resp.status, 410);
  const body = await resp.text();
  assert.ok(body.includes('招待リンクが無効です'));
});

test('handleInviteAccept: token が空のパスは 410', async () => {
  const env = makeEnv();
  const req = new Request('http://worker/invite/', { method: 'GET' });
  const resp = await handleInviteAccept(req, env);
  assert.equal(resp.status, 410);
});

test('handleInviteAccept: INVITE_STORE 未設定は 503', async () => {
  const req = new Request('http://worker/invite/sometoken', { method: 'GET' });
  const resp = await handleInviteAccept(req, {});
  assert.equal(resp.status, 503);
});
