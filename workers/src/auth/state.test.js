/**
 * Unit tests for state.js (signed OAuth CSRF state).
 * Node.js 18+ built-in test runner (node:test).
 * Run: node --test workers/src/auth/state.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { signState, verifyState } from './state.js';

const SECRET = 'test-hmac-secret-for-unit-tests';

// ---- sign / verify roundtrip ----

test('signState returns a string with exactly one dot separating two non-empty parts', async () => {
  const state = await signState({}, SECRET);
  assert.ok(typeof state === 'string');
  const dotIdx = state.lastIndexOf('.');
  assert.ok(dotIdx > 0, 'payload part is non-empty');
  assert.ok(dotIdx < state.length - 1, 'sig part is non-empty');
});

test('verifyState: valid state passes and returns payload', async () => {
  const state = await signState({ foo: 'bar' }, SECRET);
  const payload = await verifyState(state, SECRET);
  assert.equal(payload.foo, 'bar');
  assert.ok(typeof payload.nonce === 'string');
  assert.ok(typeof payload.created_at === 'number');
});

test('verifyState: nonce is unique across two calls', async () => {
  const s1 = await signState({}, SECRET);
  const s2 = await signState({}, SECRET);
  const p1 = await verifyState(s1, SECRET);
  const p2 = await verifyState(s2, SECRET);
  assert.notEqual(p1.nonce, p2.nonce, 'nonces must differ');
});

// ---- tampered state ----

test('verifyState: tampered signature throws', async () => {
  const state = await signState({}, SECRET);
  const tampered = state.slice(0, -3) + 'xxx';
  await assert.rejects(
    () => verifyState(tampered, SECRET),
    /HMAC verification failed|invalid state/
  );
});

test('verifyState: tampered payload throws', async () => {
  const state = await signState({ x: 1 }, SECRET);
  // Flip a char in the payload (before the last dot)
  const dotIdx = state.lastIndexOf('.');
  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);
  const tamperedPayload = payload.slice(0, -2) + 'ZZ';
  const tampered = `${tamperedPayload}.${sig}`;
  await assert.rejects(
    () => verifyState(tampered, SECRET),
    (err) => {
      // Accept any error: HMAC fail or payload decode fail
      return err instanceof Error;
    }
  );
});

test('verifyState: wrong secret throws', async () => {
  const state = await signState({}, SECRET);
  await assert.rejects(() => verifyState(state, 'wrong-secret'));
});

// ---- expired state ----

test('verifyState: expired state throws', async () => {
  const state = await signState({}, SECRET);
  // maxAgeMs = 0 means immediately expired
  await assert.rejects(
    () => verifyState(state, SECRET, 0),
    /expired/
  );
});

test('verifyState: state within maxAge passes', async () => {
  const state = await signState({}, SECRET);
  // maxAgeMs = 1 hour — should pass
  const payload = await verifyState(state, SECRET, 3_600_000);
  assert.ok(payload.nonce);
});

// ---- edge cases ----

test('verifyState: null input throws', async () => {
  await assert.rejects(() => verifyState(null, SECRET));
});

test('verifyState: empty string throws', async () => {
  await assert.rejects(() => verifyState('', SECRET));
});

test('verifyState: no-dot string throws', async () => {
  await assert.rejects(() => verifyState('nodothere', SECRET));
});
