/**
 * invite-store.js のユニットテスト
 * Node.js 18+ の built-in test runner (node:test) を使用
 * 実行: node --test workers/src/do/invite-store.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InviteStore } from './invite-store.js';

// --- インメモリ storage スタブ ---

function makeStorage() {
  const map = new Map();
  return {
    async put(key, value) {
      map.set(key, value);
    },
    async get(key) {
      return map.get(key) ?? null;
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix } = {}) {
      const result = new Map();
      for (const [k, v] of map) {
        if (!prefix || k.startsWith(prefix)) {
          result.set(k, v);
        }
      }
      return result;
    },
  };
}

function makeInviteStore() {
  const storage = makeStorage();
  const state = {
    storage,
    // Simulate blockConcurrencyWhile by executing the callback immediately
    async blockConcurrencyWhile(fn) {
      return fn();
    },
  };
  return new InviteStore(state, {});
}

function makeRequest(method, path, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://do${path}`, opts);
}

// --- /create ---

test('POST /create: 正常に招待レコードを作成する', async () => {
  const store = makeInviteStore();
  const req = makeRequest('POST', '/create', {
    token: 'abc123',
    created_by_email_hash: 'hash001',
  });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.equal(json.ok, true);
  assert.ok(typeof json.expires_at === 'number');
  assert.ok(json.expires_at > Date.now());
});

test('POST /create: token が欠けている場合は 400', async () => {
  const store = makeInviteStore();
  const req = makeRequest('POST', '/create', { created_by_email_hash: 'hash001' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 400);
  const json = await resp.json();
  assert.ok(json.error);
});

test('POST /create: created_by_email_hash が欠けている場合は 400', async () => {
  const store = makeInviteStore();
  const req = makeRequest('POST', '/create', { token: 'abc123' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 400);
});

test('POST /create: 不正 JSON は 400', async () => {
  const store = makeInviteStore();
  const req = new Request('http://do/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json{{{',
  });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 400);
});

// --- /get ---

test('GET /get: 有効な招待トークンを取得できる', async () => {
  const store = makeInviteStore();
  await store.fetch(makeRequest('POST', '/create', { token: 'tok1', created_by_email_hash: 'h1' }));

  const req = makeRequest('GET', '/get?token=tok1');
  const resp = await store.fetch(req);
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.ok(json.invite);
  assert.equal(json.invite.token, 'tok1');
  assert.equal(json.invite.used, false);
});

test('GET /get: 存在しないトークンは 404', async () => {
  const store = makeInviteStore();
  const req = makeRequest('GET', '/get?token=nonexistent');
  const resp = await store.fetch(req);
  assert.equal(resp.status, 404);
});

test('GET /get: token パラメータ省略は 400', async () => {
  const store = makeInviteStore();
  const req = makeRequest('GET', '/get');
  const resp = await store.fetch(req);
  assert.equal(resp.status, 400);
});

test('GET /get: 期限切れトークンは 410', async () => {
  const store = makeInviteStore();
  // 期限切れレコードを直接書き込む
  const expiredRecord = {
    token: 'expired-tok',
    created_by_email_hash: 'h1',
    created_at: Date.now() - 25 * 60 * 60 * 1000,
    expires_at: Date.now() - 60 * 1000, // 1分前に期限切れ
    used: false,
    used_by_email_hash: null,
    used_at: null,
  };
  await store.state.storage.put('invite:expired-tok', JSON.stringify(expiredRecord));

  const req = makeRequest('GET', '/get?token=expired-tok');
  const resp = await store.fetch(req);
  assert.equal(resp.status, 410);
  const json = await resp.json();
  assert.ok(json.error.includes('expired'));
});

test('GET /get: 使用済みトークンは 410', async () => {
  const store = makeInviteStore();
  await store.fetch(makeRequest('POST', '/create', { token: 'used-tok', created_by_email_hash: 'h1' }));
  await store.fetch(makeRequest('POST', '/use', { token: 'used-tok', used_by_email_hash: 'h2' }));

  const req = makeRequest('GET', '/get?token=used-tok');
  const resp = await store.fetch(req);
  assert.equal(resp.status, 410);
  const json = await resp.json();
  assert.ok(json.error.includes('used'));
});

// --- /use ---

test('POST /use: 正常に招待を使用済みにする', async () => {
  const store = makeInviteStore();
  await store.fetch(makeRequest('POST', '/create', { token: 'use-tok', created_by_email_hash: 'h1' }));

  const req = makeRequest('POST', '/use', { token: 'use-tok', used_by_email_hash: 'h2' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.equal(json.ok, true);

  // 再取得で used=true を確認
  const getResp = await store.fetch(makeRequest('GET', '/get?token=use-tok'));
  assert.equal(getResp.status, 410);
});

test('POST /use: 二重使用は 410', async () => {
  const store = makeInviteStore();
  await store.fetch(makeRequest('POST', '/create', { token: 'double-tok', created_by_email_hash: 'h1' }));
  await store.fetch(makeRequest('POST', '/use', { token: 'double-tok', used_by_email_hash: 'h2' }));

  const req = makeRequest('POST', '/use', { token: 'double-tok', used_by_email_hash: 'h3' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 410);
});

test('POST /use: 存在しないトークンは 404', async () => {
  const store = makeInviteStore();
  const req = makeRequest('POST', '/use', { token: 'ghost', used_by_email_hash: 'h1' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 404);
});

test('POST /use: 期限切れトークンは 410', async () => {
  const store = makeInviteStore();
  const expiredRecord = {
    token: 'exp-use',
    created_by_email_hash: 'h1',
    created_at: Date.now() - 25 * 60 * 60 * 1000,
    expires_at: Date.now() - 1000,
    used: false,
    used_by_email_hash: null,
    used_at: null,
  };
  await store.state.storage.put('invite:exp-use', JSON.stringify(expiredRecord));

  const req = makeRequest('POST', '/use', { token: 'exp-use', used_by_email_hash: 'h2' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 410);
});

// --- /cleanup ---

test('POST /cleanup: 期限切れレコードを削除する', async () => {
  const store = makeInviteStore();

  // 有効レコード
  await store.fetch(makeRequest('POST', '/create', { token: 'valid-tok', created_by_email_hash: 'h1' }));

  // 期限切れレコードを直接挿入
  const expiredRecord = {
    token: 'old-tok',
    created_by_email_hash: 'h2',
    created_at: Date.now() - 30 * 60 * 60 * 1000,
    expires_at: Date.now() - 1000,
    used: false,
    used_by_email_hash: null,
    used_at: null,
  };
  await store.state.storage.put('invite:old-tok', JSON.stringify(expiredRecord));

  const req = makeRequest('POST', '/cleanup');
  const resp = await store.fetch(req);
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.equal(json.ok, true);
  assert.equal(json.deleted, 1);
});

// --- /check-and-use ---

test('POST /check-and-use: ハッピーパス — ok を返し /get で used=true になる', async () => {
  const store = makeInviteStore();
  await store.fetch(makeRequest('POST', '/create', { token: 'cau-tok', created_by_email_hash: 'h1' }));

  const req = makeRequest('POST', '/check-and-use', { token: 'cau-tok', used_by_email_hash: 'h2' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.equal(json.ok, true);
  assert.ok(json.invite);
  assert.equal(json.invite.used, true);
  assert.equal(json.invite.used_by_email_hash, 'h2');

  // /get で used=true (410) になっていることを確認
  const getResp = await store.fetch(makeRequest('GET', '/get?token=cau-tok'));
  assert.equal(getResp.status, 410);
  const getJson = await getResp.json();
  assert.ok(getJson.error.includes('used'));
});

test('POST /check-and-use: 2回目の呼び出しは 410 already used を返す', async () => {
  const store = makeInviteStore();
  await store.fetch(makeRequest('POST', '/create', { token: 'cau-double', created_by_email_hash: 'h1' }));

  // 1回目は成功
  await store.fetch(makeRequest('POST', '/check-and-use', { token: 'cau-double', used_by_email_hash: 'h2' }));

  // 2回目は 410
  const req = makeRequest('POST', '/check-and-use', { token: 'cau-double', used_by_email_hash: 'h3' });
  const resp = await store.fetch(req);
  assert.equal(resp.status, 410);
  const json = await resp.json();
  assert.equal(json.error, 'already used');
});

// --- 不明パス ---

test('未知のパスは 404', async () => {
  const store = makeInviteStore();
  const req = makeRequest('GET', '/unknown');
  const resp = await store.fetch(req);
  assert.equal(resp.status, 404);
});
