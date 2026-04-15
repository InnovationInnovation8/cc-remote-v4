/**
 * Unit tests for cookie.js helpers.
 * Node.js 18+ built-in test runner (node:test).
 * Run: node --test workers/src/auth/cookie.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionCookie,
  buildClearCookie,
  parseSessionCookie,
  validateOriginCsrf,
} from './cookie.js';

// ---- buildSessionCookie ----

test('buildSessionCookie: contains the token value', () => {
  const result = buildSessionCookie('abc123');
  assert.ok(result.startsWith('session=abc123'));
});

test('buildSessionCookie: includes HttpOnly flag', () => {
  assert.ok(buildSessionCookie('t').includes('HttpOnly'));
});

test('buildSessionCookie: includes Secure flag', () => {
  assert.ok(buildSessionCookie('t').includes('Secure'));
});

test('buildSessionCookie: includes SameSite=Lax', () => {
  assert.ok(buildSessionCookie('t').includes('SameSite=Lax'));
});

test('buildSessionCookie: includes Path=/', () => {
  assert.ok(buildSessionCookie('t').includes('Path=/'));
});

test('buildSessionCookie: default Max-Age is 86400', () => {
  assert.ok(buildSessionCookie('t').includes('Max-Age=86400'));
});

test('buildSessionCookie: custom maxAgeSeconds is respected', () => {
  assert.ok(buildSessionCookie('t', { maxAgeSeconds: 3600 }).includes('Max-Age=3600'));
});

// ---- buildClearCookie ----

test('buildClearCookie: has Max-Age=0', () => {
  assert.ok(buildClearCookie().includes('Max-Age=0'));
});

test('buildClearCookie: has empty session value', () => {
  assert.ok(buildClearCookie().startsWith('session=;'));
});

test('buildClearCookie: includes HttpOnly', () => {
  assert.ok(buildClearCookie().includes('HttpOnly'));
});

// ---- parseSessionCookie ----

test('parseSessionCookie: extracts from single session cookie', () => {
  assert.equal(parseSessionCookie('session=abc'), 'abc');
});

test('parseSessionCookie: extracts from multiple cookies', () => {
  assert.equal(parseSessionCookie('foo=1; session=abc; bar=2'), 'abc');
});

test('parseSessionCookie: tolerates whitespace around cookie name', () => {
  assert.equal(parseSessionCookie('foo=1;  session=xyz'), 'xyz');
});

test('parseSessionCookie: returns null when session cookie missing', () => {
  assert.equal(parseSessionCookie('foo=1; bar=2'), null);
});

test('parseSessionCookie: returns null for null header', () => {
  assert.equal(parseSessionCookie(null), null);
});

test('parseSessionCookie: returns null for undefined header', () => {
  assert.equal(parseSessionCookie(undefined), null);
});

test('parseSessionCookie: returns null for empty string', () => {
  assert.equal(parseSessionCookie(''), null);
});

test('parseSessionCookie: handles token with equals sign in value', () => {
  assert.equal(parseSessionCookie('session=a=b=c'), 'a=b=c');
});

// ---- validateOriginCsrf ----

test('validateOriginCsrf: GET request always passes', () => {
  const req = new Request('https://example.com/api', { method: 'GET' });
  assert.equal(validateOriginCsrf(req, []), true);
});

test('validateOriginCsrf: HEAD request always passes', () => {
  const req = new Request('https://example.com/api', { method: 'HEAD' });
  assert.equal(validateOriginCsrf(req, ['https://other.com']), true);
});

test('validateOriginCsrf: POST with allowed origin passes', () => {
  const req = new Request('https://example.com/api', {
    method: 'POST',
    headers: { Origin: 'https://allowed.com' },
  });
  assert.equal(validateOriginCsrf(req, ['https://allowed.com']), true);
});

test('validateOriginCsrf: POST with disallowed origin fails', () => {
  const req = new Request('https://example.com/api', {
    method: 'POST',
    headers: { Origin: 'https://evil.com' },
  });
  assert.equal(validateOriginCsrf(req, ['https://allowed.com']), false);
});

test('validateOriginCsrf: POST with no Origin header fails', () => {
  const req = new Request('https://example.com/api', { method: 'POST' });
  assert.equal(validateOriginCsrf(req, ['https://allowed.com']), false);
});

test('validateOriginCsrf: multiple allowed origins — matching passes', () => {
  const req = new Request('https://example.com/api', {
    method: 'POST',
    headers: { Origin: 'https://second.com' },
  });
  assert.equal(validateOriginCsrf(req, ['https://first.com', 'https://second.com']), true);
});

test('validateOriginCsrf: DELETE with allowed origin passes', () => {
  const req = new Request('https://example.com/api', {
    method: 'DELETE',
    headers: { Origin: 'https://allowed.com' },
  });
  assert.equal(validateOriginCsrf(req, ['https://allowed.com']), true);
});
