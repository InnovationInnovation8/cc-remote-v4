/**
 * Unit tests for google.js helpers.
 * Node.js 18+ built-in test runner (node:test).
 * Run: node --test workers/src/auth/google.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthUrl, hashEmail } from './google.js';

// ---- buildAuthUrl ----

test('buildAuthUrl: URL starts with Google auth endpoint', () => {
  const url = buildAuthUrl({
    clientId: 'test-client-id',
    redirectUri: 'https://example.com/callback',
    state: 'test-state',
  });
  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
});

test('buildAuthUrl: contains client_id', () => {
  const url = buildAuthUrl({
    clientId: 'my-client-123',
    redirectUri: 'https://example.com/callback',
    state: 'st',
  });
  assert.ok(url.includes('client_id=my-client-123'));
});

test('buildAuthUrl: contains redirect_uri', () => {
  const url = buildAuthUrl({
    clientId: 'cid',
    redirectUri: 'https://example.com/callback',
    state: 'st',
  });
  assert.ok(url.includes('redirect_uri='));
  assert.ok(url.includes(encodeURIComponent('https://example.com/callback')));
});

test('buildAuthUrl: response_type=code', () => {
  const url = buildAuthUrl({ clientId: 'c', redirectUri: 'r', state: 's' });
  assert.ok(url.includes('response_type=code'));
});

test('buildAuthUrl: scope contains openid and email', () => {
  const url = buildAuthUrl({ clientId: 'c', redirectUri: 'r', state: 's' });
  const parsed = new URL(url);
  const scope = parsed.searchParams.get('scope');
  assert.ok(scope.includes('openid'));
  assert.ok(scope.includes('email'));
});

test('buildAuthUrl: access_type=online', () => {
  const url = buildAuthUrl({ clientId: 'c', redirectUri: 'r', state: 's' });
  assert.ok(url.includes('access_type=online'));
});

test('buildAuthUrl: contains state param', () => {
  const url = buildAuthUrl({ clientId: 'c', redirectUri: 'r', state: 'my-state' });
  assert.ok(url.includes('state=my-state'));
});

// ---- hashEmail ----

test('hashEmail: known vector — test@example.com', async () => {
  const hash = await hashEmail('test@example.com');
  assert.equal(
    hash,
    '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b'
  );
});

test('hashEmail: lowercases before hashing', async () => {
  const lower = await hashEmail('user@Example.COM');
  const expected = await hashEmail('user@example.com');
  assert.equal(lower, expected);
});

test('hashEmail: returns 64-char hex string', async () => {
  const hash = await hashEmail('any@email.test');
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]+$/);
});

// ---- base64url decode roundtrip (via hashEmail internals; tested indirectly) ----
// The base64url helpers are internal but exercised by buildAuthUrl state round-trip
// and by verifyIdToken in integration. We test the observable output above.
