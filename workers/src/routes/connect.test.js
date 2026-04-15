/**
 * connect.js のユニットテスト
 * Node.js 18+ の built-in test runner (node:test) を使用
 * 実行: node --test workers/src/routes/connect.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateToken, verifyToken } from '../lib/hmac.js';
import { handleConnect } from './connect.js';

const PC_ID = 'test-pc-connect-001';
const SECRET = 'shared-hmac-secret-for-connect-tests';
const EMAIL_HASH = 'abc123def456';

// --- モック PCRegistry DO stub ---

function makeMockEnv({ registryOk = true, secretOverride } = {}) {
  const secret = secretOverride !== undefined ? secretOverride : SECRET;

  const stub = {
    async fetch(_req) {
      if (registryOk) {
        return Response.json({ ok: true, registered_at: Date.now() });
      } else {
        return Response.json({ error: 'registry error' }, { status: 500 });
      }
    },
  };

  return {
    HMAC_SECRET: secret || undefined,
    PC_REGISTRY: {
      idFromName(_name) {
        return 'mock-do-id';
      },
      get(_id) {
        return stub;
      },
    },
  };
}

function makeRequest(body) {
  return new Request('http://worker/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// --- 400 系テスト ---

test('不正な JSON body は 400 を返す', async () => {
  const req = new Request('http://worker/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json{{{',
  });
  const resp = await handleConnect(req, makeMockEnv());
  assert.equal(resp.status, 400);
  const json = await resp.json();
  assert.ok(json.error);
});

test('pc_id が欠けている場合は 400 を返す', async () => {
  const { token } = await generateToken(PC_ID, SECRET);
  const req = makeRequest({ email_hash: EMAIL_HASH, workers_token: token });
  const resp = await handleConnect(req, makeMockEnv());
  assert.equal(resp.status, 400);
  const json = await resp.json();
  assert.ok(json.error.includes('required'));
});

test('workers_token が欠けている場合は 400 を返す', async () => {
  const req = makeRequest({ pc_id: PC_ID, email_hash: EMAIL_HASH });
  const resp = await handleConnect(req, makeMockEnv());
  assert.equal(resp.status, 400);
  const json = await resp.json();
  assert.ok(json.error.includes('required'));
});

test('email_hash が欠けている場合は 400 を返す', async () => {
  const { token } = await generateToken(PC_ID, SECRET);
  const req = makeRequest({ pc_id: PC_ID, workers_token: token });
  const resp = await handleConnect(req, makeMockEnv());
  assert.equal(resp.status, 400);
  const json = await resp.json();
  assert.ok(json.error.includes('required'));
});

// --- 401 系テスト ---

test('無効な HMAC トークンは 401 を返す', async () => {
  const req = makeRequest({
    pc_id: PC_ID,
    email_hash: EMAIL_HASH,
    workers_token: 'invalid.token',
  });
  const resp = await handleConnect(req, makeMockEnv());
  assert.equal(resp.status, 401);
  const json = await resp.json();
  assert.ok(json.error.includes('unauthorized'));
});

test('期限切れトークンは 401 を返す', async () => {
  // 過去のタイムスタンプでトークンを生成（TTL = 15分前に発行）
  const pastNow = Date.now() - 16 * 60 * 1000; // 16分前
  const { token } = await generateToken(PC_ID, SECRET, pastNow);
  // 検証は現在時刻で行うため期限切れになる
  const req = makeRequest({ pc_id: PC_ID, email_hash: EMAIL_HASH, workers_token: token });
  const resp = await handleConnect(req, makeMockEnv());
  assert.equal(resp.status, 401);
  const json = await resp.json();
  assert.ok(json.error.includes('unauthorized'));
});

test('異なるシークレットで生成したトークンは 401 を返す', async () => {
  const { token } = await generateToken(PC_ID, 'wrong-secret');
  const req = makeRequest({ pc_id: PC_ID, email_hash: EMAIL_HASH, workers_token: token });
  const resp = await handleConnect(req, makeMockEnv());
  assert.equal(resp.status, 401);
});

// --- 200 系テスト ---

test('有効なトークンとモック DO で 200 ok を返す', async () => {
  const { token } = await generateToken(PC_ID, SECRET);
  const req = makeRequest({
    pc_id: PC_ID,
    email_hash: EMAIL_HASH,
    workers_token: token,
    pc_url: 'https://my-tunnel.example.com',
  });
  const resp = await handleConnect(req, makeMockEnv({ registryOk: true }));
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.equal(json.ok, true);
});

test('pc_url 省略でも 200 ok を返す', async () => {
  const { token } = await generateToken(PC_ID, SECRET);
  const req = makeRequest({ pc_id: PC_ID, email_hash: EMAIL_HASH, workers_token: token });
  const resp = await handleConnect(req, makeMockEnv({ registryOk: true }));
  assert.equal(resp.status, 200);
  const json = await resp.json();
  assert.equal(json.ok, true);
});

// --- verifyToken 単体テスト（純粋関数レベル） ---

test('verifyToken: 有効なトークンは true', async () => {
  const now = Date.now();
  const { token } = await generateToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, PC_ID, SECRET, now + 1000);
  assert.equal(result, true);
});

test('verifyToken: 無効トークンは false', async () => {
  const result = await verifyToken('bad.token', PC_ID, SECRET);
  assert.equal(result, false);
});
