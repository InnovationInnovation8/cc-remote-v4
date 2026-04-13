/**
 * Feedback + Notification Settings API integration tests
 * Tests:
 *   POST /api/feedback
 *   GET  /api/notification-settings
 *   POST /api/notification-settings
 *
 * Strategy: same as shortcuts.test.js
 * - Override LOCALAPPDATA to a temp dir before importing db.js
 * - Boot a minimal Express app with auth + target routes
 * - Obtain token via /api/auth/setup then run all tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Override DB path BEFORE importing db.js
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-remote-fbn-test-'));
process.env.LOCALAPPDATA = tmpDir;

// Dynamic imports so db.js sees the overridden LOCALAPPDATA
const { initDB, getDB, saveDB } = await import('../src/server/db.js');
const { default: express } = await import('express');
const { authMiddleware, authRoutes } = await import('../src/server/auth.js');
const { setSilentHours, setErrorOnly, getSilentConfig } = await import('../src/server/notifications.js');

const TEST_PORT = 37374;
const BASE = `http://localhost:${TEST_PORT}`;

let server;
let authToken;

function authedFetch(urlPath, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-pin': authToken,
    ...(opts.headers || {}),
  };
  return fetch(`${BASE}${urlPath}`, { ...opts, headers });
}

describe('Feedback + Notification Settings API', () => {
  before(async () => {
    await initDB();

    const app = express();
    app.use(express.json());

    // Auth routes (no middleware required)
    app.use('/api/auth', authRoutes);

    // Everything under /api requires auth token
    app.use('/api', authMiddleware);

    // ---- Feedback endpoint — verbatim from src/server/index.js ----
    app.post('/api/feedback', (req, res) => {
      try {
        const { sessionId, rating, context } = req.body;
        if (!sessionId || rating === undefined) return res.status(400).json({ error: 'sessionId and rating required' });
        if (typeof sessionId === 'string' && sessionId.length > 200) return res.status(400).json({ error: 'sessionId too long' });
        if (context !== undefined && typeof context === 'string' && context.length > 2000) return res.status(400).json({ error: 'context too long' });
        const db = getDB();
        db.run('INSERT INTO feedback (session_id, rating, context, created_at) VALUES (?, ?, ?, ?)',
          [sessionId, rating, context || '', Date.now()]);
        saveDB();
        res.json({ ok: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ---- Notification settings endpoints — verbatim from src/server/index.js ----
    app.get('/api/notification-settings', (req, res) => {
      res.json(getSilentConfig());
    });
    app.post('/api/notification-settings', (req, res) => {
      const { silentStart, silentEnd, silentEnabled, errorOnly: eo } = req.body;
      if (silentStart !== undefined && silentEnd !== undefined && silentEnabled !== undefined) {
        setSilentHours(silentStart, silentEnd, silentEnabled);
      }
      if (eo !== undefined) setErrorOnly(eo);
      res.json({ ok: true, ...getSilentConfig() });
    });

    await new Promise((resolve, reject) => {
      server = app.listen(TEST_PORT, '127.0.0.1', resolve);
      server.once('error', reject);
    });

    // Obtain auth token via setup (fresh DB has no PIN)
    const setupRes = await fetch(`${BASE}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'test5678' }),
    });
    const setupBody = await setupRes.json();
    if (setupRes.status !== 200) throw new Error(`Auth setup failed: ${JSON.stringify(setupBody)}`);
    authToken = setupBody.token;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  // ---- POST /api/feedback -----------------------------------------------

  it('POST /api/feedback — success with sessionId and rating', async () => {
    const res = await authedFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'sess-abc', rating: 5 }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.ok, true, `Expected ok:true, got: ${JSON.stringify(body)}`);
  });

  it('POST /api/feedback — success with optional context', async () => {
    const res = await authedFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'sess-xyz', rating: 3, context: 'useful session' }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  it('POST /api/feedback — 400 when sessionId is missing', async () => {
    const res = await authedFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 4 }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error, 'Should return an error message');
    assert.ok(body.error.includes('required'), `Error should mention required fields, got: ${body.error}`);
  });

  it('POST /api/feedback — 400 when rating is missing', async () => {
    const res = await authedFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'sess-no-rating' }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error, 'Should return an error message');
  });

  it('POST /api/feedback — 400 when both fields missing', async () => {
    const res = await authedFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  it('POST /api/feedback — 400 when sessionId is too long', async () => {
    const res = await authedFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'x'.repeat(201), rating: 1 }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error.includes('too long'), `Expected too long error, got: ${body.error}`);
  });

  it('POST /api/feedback — 400 when context is too long', async () => {
    const res = await authedFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'sess-ctx', rating: 2, context: 'y'.repeat(2001) }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error.includes('too long'), `Expected too long error, got: ${body.error}`);
  });

  it('POST /api/feedback — 401 without auth token', async () => {
    const res = await fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-unauth', rating: 5 }),
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // ---- GET /api/notification-settings -----------------------------------

  it('GET /api/notification-settings — returns current config', async () => {
    const res = await authedFetch('/api/notification-settings');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok('silentStart' in body, 'Should have silentStart');
    assert.ok('silentEnd' in body, 'Should have silentEnd');
    assert.ok('silentEnabled' in body, 'Should have silentEnabled');
    assert.ok('errorOnly' in body, 'Should have errorOnly');
  });

  it('GET /api/notification-settings — 401 without auth token', async () => {
    const res = await fetch(`${BASE}/api/notification-settings`);
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // ---- POST /api/notification-settings ----------------------------------

  it('POST /api/notification-settings — update silentHours', async () => {
    const res = await authedFetch('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({ silentStart: 22, silentEnd: 8, silentEnabled: true }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.silentStart, 22, `silentStart should be 22, got ${body.silentStart}`);
    assert.equal(body.silentEnd, 8, `silentEnd should be 8, got ${body.silentEnd}`);
    assert.equal(body.silentEnabled, true, `silentEnabled should be true, got ${body.silentEnabled}`);
  });

  it('POST /api/notification-settings — update errorOnly', async () => {
    const res = await authedFetch('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({ errorOnly: true }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.errorOnly, true, `errorOnly should be true, got ${body.errorOnly}`);
  });

  it('POST /api/notification-settings — partial update (errorOnly only) does not reset silentHours', async () => {
    // First set known state
    await authedFetch('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({ silentStart: 23, silentEnd: 7, silentEnabled: false }),
    });
    // Then update only errorOnly
    const res = await authedFetch('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({ errorOnly: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.silentStart, 23, `silentStart should remain 23, got ${body.silentStart}`);
    assert.equal(body.silentEnd, 7, `silentEnd should remain 7, got ${body.silentEnd}`);
    assert.equal(body.errorOnly, false);
  });

  it('POST /api/notification-settings — returns updated config on GET', async () => {
    await authedFetch('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({ silentStart: 0, silentEnd: 6, silentEnabled: true, errorOnly: true }),
    });
    const res = await authedFetch('/api/notification-settings');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.silentStart, 0);
    assert.equal(body.silentEnd, 6);
    assert.equal(body.silentEnabled, true);
    assert.equal(body.errorOnly, true);
  });

  it('POST /api/notification-settings — 401 without auth token', async () => {
    const res = await fetch(`${BASE}/api/notification-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorOnly: false }),
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });
});
