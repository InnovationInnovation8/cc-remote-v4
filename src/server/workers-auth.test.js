/**
 * workers-auth.js のユニットテスト
 * Node.js 18+ の built-in test runner (node:test) を使用
 * 実行: node --test src/server/workers-auth.test.js
 *
 * ラウンドトリップテスト:
 *   PC側（Node.js createHmac）で生成 → Workers側（WebCrypto verifyToken）で検証
 *   Node.js 20+ では globalThis.crypto.subtle が組み込みのため、
 *   workers/src/lib/hmac.js をそのままインポートして検証できる。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateWorkersToken } from './workers-auth.js';

// Workers の verifyToken（WebCrypto 版）をインポート
// Node.js 20+ の globalThis.crypto.subtle と互換するため動作する
import { verifyToken } from '../../workers/src/lib/hmac.js';

const PC_ID = 'test-pc-auth-001';
const SECRET = 'roundtrip-test-shared-secret';
const TOKEN_TTL_MS = 15 * 60 * 1000;

// --- トークン生成テスト ---

test('generateWorkersToken が token と expires_at を返す', () => {
  const now = Date.now();
  const { token, expires_at } = generateWorkersToken(PC_ID, SECRET, now);
  assert.ok(typeof token === 'string', 'token は文字列');
  assert.ok(token.includes('.'), 'token は payload.sig 形式');
  assert.equal(expires_at, now + TOKEN_TTL_MS, 'expires_at は now + 15分');
});

test('generateWorkersToken のトークンは payload.sig の 2 部構成', () => {
  const { token } = generateWorkersToken(PC_ID, SECRET);
  const parts = token.split('.');
  assert.equal(parts.length, 2, 'トークンは . で区切られた 2 部構成');
  assert.ok(parts[0].length > 0, 'payload が空でない');
  assert.ok(parts[1].length > 0, 'sig が空でない');
});

test('generateWorkersToken: payload は base64url エンコードされた pcId:expiresAt', () => {
  const now = 1_700_000_000_000;
  const { token, expires_at } = generateWorkersToken(PC_ID, SECRET, now);
  const [payloadB64] = token.split('.');
  // base64url → UTF-8 デコード
  const decoded = Buffer.from(
    payloadB64.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');
  assert.equal(decoded, `${PC_ID}:${expires_at}`, 'payload は pcId:expiresAt');
});

// --- ラウンドトリップテスト ---

test('ラウンドトリップ: PC側生成トークンを Workers WebCrypto で検証 → true', async () => {
  const now = Date.now();
  const { token } = generateWorkersToken(PC_ID, SECRET, now);
  // Workers 側の verifyToken（WebCrypto）で検証
  const result = await verifyToken(token, PC_ID, SECRET, now + 1000);
  assert.equal(result, true, 'PC側トークンを Workers側で正常に検証できる');
});

test('ラウンドトリップ: 異なる pcId では false', async () => {
  const now = Date.now();
  const { token } = generateWorkersToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, 'other-pc', SECRET, now + 1000);
  assert.equal(result, false, '異なる pcId は拒否');
});

test('ラウンドトリップ: 異なる secret では false', async () => {
  const now = Date.now();
  const { token } = generateWorkersToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, PC_ID, 'wrong-secret', now + 1000);
  assert.equal(result, false, '異なる secret は拒否');
});

test('ラウンドトリップ: 期限切れトークンは false', async () => {
  const pastNow = Date.now() - 16 * 60 * 1000; // 16分前
  const { token } = generateWorkersToken(PC_ID, SECRET, pastNow);
  // 現在時刻で検証するため期限切れ
  const result = await verifyToken(token, PC_ID, SECRET);
  assert.equal(result, false, '期限切れトークンは拒否');
});

test('ラウンドトリップ: TTL 境界 - 14分59秒後は true', async () => {
  const now = 1_000_000_000_000;
  const { token } = generateWorkersToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, PC_ID, SECRET, now + TOKEN_TTL_MS - 1000);
  assert.equal(result, true, '14分59秒後は有効');
});

test('ラウンドトリップ: TTL 境界 - 15分1秒後は false', async () => {
  const now = 1_000_000_000_000;
  const { token } = generateWorkersToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, PC_ID, SECRET, now + TOKEN_TTL_MS + 1000);
  assert.equal(result, false, '15分1秒後は拒否');
});
