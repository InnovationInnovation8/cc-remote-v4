/**
 * idbStore.js unit tests
 *
 * ブラウザ環境（IndexedDB）がない Node.js では memory fallback モードで動作する。
 * このテストは memory fallback の挙動と migration ロジックを確認する。
 *
 * NOTE: IndexedDB 自体の動作はブラウザでの動的 QA で確認すること。
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// IndexedDB が未定義の Node.js 環境で動かすため、
// idbStore.js を import すると memory fallback が自動有効になる。
// ただし ESM dynamic import はモジュールキャッシュを持つので
// テスト間で state をリセットできない点に注意。

describe('idbStore — memory fallback mode', () => {
  let idbGet, idbSet, idbDelete, idbKeys;

  before(async () => {
    // Node.js には indexedDB がないため memory fallback として動作する
    const mod = await import('../src/client/utils/idbStore.js');
    idbGet = mod.idbGet;
    idbSet = mod.idbSet;
    idbDelete = mod.idbDelete;
    idbKeys = mod.idbKeys;
  });

  it('idbSet then idbGet returns stored value', async () => {
    await idbSet('test-key', 'hello');
    const val = await idbGet('test-key');
    assert.strictEqual(val, 'hello');
  });

  it('idbGet returns defaultValue when key missing', async () => {
    const val = await idbGet('nonexistent-key-xyz', 'default-val');
    assert.strictEqual(val, 'default-val');
  });

  it('idbGet returns null when key missing and no default given', async () => {
    const val = await idbGet('nonexistent-key-abc');
    assert.strictEqual(val, null);
  });

  it('idbSet works with object values', async () => {
    const obj = { a: 1, b: [1, 2, 3] };
    await idbSet('test-obj', obj);
    const val = await idbGet('test-obj');
    assert.deepStrictEqual(val, obj);
  });

  it('idbDelete removes the key', async () => {
    await idbSet('to-delete', 'bye');
    await idbDelete('to-delete');
    const val = await idbGet('to-delete', 'gone');
    assert.strictEqual(val, 'gone');
  });

  it('idbKeys returns existing keys', async () => {
    await idbSet('key-a', 1);
    await idbSet('key-b', 2);
    const keys = await idbKeys();
    assert.ok(Array.isArray(keys));
    assert.ok(keys.includes('key-a'));
    assert.ok(keys.includes('key-b'));
  });

  it('idbSet overwrites existing value', async () => {
    await idbSet('overwrite-me', 'first');
    await idbSet('overwrite-me', 'second');
    const val = await idbGet('overwrite-me');
    assert.strictEqual(val, 'second');
  });
});

describe('migrateFromLocalStorage — memory fallback mode', () => {
  it('migration is idempotent when __migrated_v4 already set', async () => {
    const { idbSet, idbGet, migrateFromLocalStorage } = await import('../src/client/utils/idbStore.js');

    // Simulate already-migrated state by setting the flag
    await idbSet('__migrated_v4', true);

    // Run migration — should be a no-op (no localStorage available in Node)
    // Just ensure it does not throw
    await assert.doesNotReject(() => migrateFromLocalStorage());
  });
});
