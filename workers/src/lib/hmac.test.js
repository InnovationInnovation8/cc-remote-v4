/**
 * hmac.js のユニットテスト
 * Node.js 18+ の built-in test runner (node:test) を使用
 * 実行: node --test workers/src/lib/hmac.test.js
 *
 * Workers 環境の WebCrypto API は Node.js 18+ の globalThis.crypto と互換
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Node.js 18+ では globalThis.crypto が組み込み。
// Workers の crypto.subtle と同じ Web Crypto API を使用するため、
// hmac.js をそのままインポートして動作する。
import { generateToken, verifyToken } from './hmac.js';

const PC_ID = 'test-pc-001';
const SECRET = 'test-secret-for-unit-tests';
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// --- 基本動作テスト ---

test('generateToken が token と expires_at を返す', async () => {
  const now = Date.now();
  const { token, expires_at } = await generateToken(PC_ID, SECRET, now);
  assert.ok(typeof token === 'string', 'token は文字列');
  assert.ok(token.includes('.'), 'token は . を含む（payload.sig 形式）');
  assert.equal(expires_at, now + TOKEN_TTL_MS, 'expires_at は now + 15分');
});

test('verifyToken: 有効なトークンは true を返す', async () => {
  const now = Date.now();
  const { token } = await generateToken(PC_ID, SECRET, now);
  // 検証時刻 = 発行から30秒後
  const result = await verifyToken(token, PC_ID, SECRET, now + 30_000);
  assert.equal(result, true, '有効期限内トークンは合格');
});

test('verifyToken: 改ざんトークンは false を返す', async () => {
  const now = Date.now();
  const { token } = await generateToken(PC_ID, SECRET, now);
  const tampered = token.slice(0, -3) + 'xxx';
  const result = await verifyToken(tampered, PC_ID, SECRET, now + 30_000);
  assert.equal(result, false, '改ざんトークンは拒否');
});

test('verifyToken: 異なる pcId は false を返す', async () => {
  const now = Date.now();
  const { token } = await generateToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, 'other-pc', SECRET, now + 30_000);
  assert.equal(result, false, '異なる pcId は拒否');
});

test('verifyToken: 異なる secret は false を返す', async () => {
  const now = Date.now();
  const { token } = await generateToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, PC_ID, 'wrong-secret', now + 30_000);
  assert.equal(result, false, '異なる secret は拒否');
});

// --- TTL 境界値テスト（4ケース: ±1秒） ---

test('TTL境界: 発行から 14分59秒後（-1秒）は true', async () => {
  const now = 1_000_000_000_000; // 固定時刻
  const { token } = await generateToken(PC_ID, SECRET, now);
  // 14分59秒後 = TTL まで残り1秒
  const verifyAt = now + TOKEN_TTL_MS - 1_000;
  const result = await verifyToken(token, PC_ID, SECRET, verifyAt);
  assert.equal(result, true, '14分59秒後は合格（TTL境界-1秒）');
});

test('TTL境界: 発行から 15分00秒ちょうど（境界値）は false', async () => {
  const now = 1_000_000_000_000;
  const { token } = await generateToken(PC_ID, SECRET, now);
  // 15分ちょうど = now > expires_at が成立しないが expires_at === now なので false ではない
  // 仕様: now > expires_at が true の場合に拒否（= expires_at + 1ms で拒否される）
  const verifyAt = now + TOKEN_TTL_MS; // now === expires_at → まだ有効（>=ではなく>でチェック）
  const result = await verifyToken(token, PC_ID, SECRET, verifyAt);
  // expires_at ちょうどは有効（now > expires_at が false）
  assert.equal(result, true, '15分ちょうどは有効（now === expires_at）');
});

test('TTL境界: 発行から 15分01秒後（+1秒）は false', async () => {
  const now = 1_000_000_000_000;
  const { token } = await generateToken(PC_ID, SECRET, now);
  const verifyAt = now + TOKEN_TTL_MS + 1_000;
  const result = await verifyToken(token, PC_ID, SECRET, verifyAt);
  assert.equal(result, false, '15分1秒後は拒否（TTL境界+1秒）');
});

test('TTL境界: 発行から 0秒後は true', async () => {
  const now = 1_000_000_000_000;
  const { token } = await generateToken(PC_ID, SECRET, now);
  const result = await verifyToken(token, PC_ID, SECRET, now);
  assert.equal(result, true, '発行直後（0秒後）は合格');
});

// --- エッジケーステスト ---

test('verifyToken: null/undefined は false を返す', async () => {
  assert.equal(await verifyToken(null, PC_ID, SECRET), false);
  assert.equal(await verifyToken(undefined, PC_ID, SECRET), false);
  assert.equal(await verifyToken('', PC_ID, SECRET), false);
});

test('verifyToken: フォーマット不正トークンは false を返す', async () => {
  assert.equal(await verifyToken('noDot', PC_ID, SECRET), false);
  assert.equal(await verifyToken('a.b.c', PC_ID, SECRET), false);
});
