/**
 * Shortcut API integration tests
 * Tests: POST /api/shortcuts, GET /api/shortcuts, DELETE /api/shortcuts/:id
 *
 * Strategy:
 * - Set LOCALAPPDATA to a temp dir BEFORE importing db.js so a fresh DB is used
 * - Boot a minimal Express app with only auth + shortcut routes
 * - Obtain a token via /api/auth/setup then test all shortcut endpoints
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Override DB path BEFORE importing db.js (dynamic imports respect current env)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-remote-test-'));
process.env.LOCALAPPDATA = tmpDir;

// Dynamic imports so db.js sees the overridden LOCALAPPDATA
const { initDB, getDB, saveDB } = await import('../src/server/db.js');
const { default: express } = await import('express');
const { authMiddleware, authRoutes } = await import('../src/server/auth.js');

const TEST_PORT = 37373;
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

describe('Shortcut API', () => {
  before(async () => {
    await initDB();

    const app = express();
    app.use(express.json());

    // Auth routes (no middleware required)
    app.use('/api/auth', authRoutes);

    // Everything under /api requires auth token
    app.use('/api', authMiddleware);

    // Shortcut endpoints — verbatim from src/server/index.js lines 73-101
    app.get('/api/shortcuts', (req, res) => {
      try {
        const db = getDB();
        const result = db.exec('SELECT id, label, command, sort_order FROM shortcuts ORDER BY sort_order ASC');
        const rows = result.length > 0
          ? result[0].values.map(r => ({ id: r[0], label: r[1], command: r[2], sortOrder: r[3] }))
          : [];
        res.json(rows);
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/shortcuts', (req, res) => {
      try {
        const { label, command } = req.body;
        if (!label || !command) return res.status(400).json({ error: 'label and command required' });
        if (label.length > 200 || command.length > 2000)
          return res.status(400).json({ error: 'label/command too long' });
        const db = getDB();
        db.run(
          'INSERT INTO shortcuts (label, command, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM shortcuts))',
          [label, command]
        );
        const result = db.exec('SELECT last_insert_rowid()');
        const id = result[0].values[0][0];
        saveDB();
        res.json({ id, label, command });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.delete('/api/shortcuts/:id', (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
        const db = getDB();
        db.run('DELETE FROM shortcuts WHERE id = ?', [id]);
        const changed = db.exec('SELECT changes()');
        if (changed[0].values[0][0] === 0) return res.status(404).json({ error: 'not found' });
        saveDB();
        res.json({ ok: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    await new Promise((resolve, reject) => {
      server = app.listen(TEST_PORT, '127.0.0.1', resolve);
      server.once('error', reject);
    });

    // Obtain auth token via setup (fresh DB has no PIN)
    const setupRes = await fetch(`${BASE}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'test1234' }),
    });
    const setupBody = await setupRes.json();
    if (setupRes.status !== 200) throw new Error(`Auth setup failed: ${JSON.stringify(setupBody)}`);
    authToken = setupBody.token;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  // ---- Tests ---------------------------------------------------------------

  it('GET /api/shortcuts — returns empty array initially', async () => {
    const res = await authedFetch('/api/shortcuts');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(Array.isArray(body), 'Response should be an array');
    assert.equal(body.length, 0, 'Should start empty');
  });

  it('GET /api/shortcuts — unauthenticated returns 401', async () => {
    const res = await fetch(`${BASE}/api/shortcuts`);
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it('POST /api/shortcuts — validation error when command is missing', async () => {
    const res = await authedFetch('/api/shortcuts', {
      method: 'POST',
      body: JSON.stringify({ label: 'only label' }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error, 'Should return an error message');
    assert.ok(body.error.includes('required'), `Error should mention required fields, got: ${body.error}`);
  });

  it('POST /api/shortcuts — validation error when both fields missing', async () => {
    const res = await authedFetch('/api/shortcuts', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  it('POST /api/shortcuts — creates a shortcut successfully', async () => {
    const res = await authedFetch('/api/shortcuts', {
      method: 'POST',
      body: JSON.stringify({ label: 'Hello World', command: 'echo hello' }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.id !== undefined, `id should be present, got: ${JSON.stringify(body)}`);
    assert.equal(body.label, 'Hello World');
    assert.equal(body.command, 'echo hello');
  });

  it('GET /api/shortcuts — lists created shortcuts', async () => {
    await authedFetch('/api/shortcuts', {
      method: 'POST',
      body: JSON.stringify({ label: 'List Check', command: 'ls /' }),
    });

    const res = await authedFetch('/api/shortcuts');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    const found = body.find(s => s.label === 'List Check' && s.command === 'ls /');
    assert.ok(found, 'Created shortcut should appear in list');
    assert.ok(found.id !== undefined, 'id should be present');
    assert.ok(typeof found.sortOrder === 'number', 'sortOrder should be number');
  });

  it('DELETE /api/shortcuts/:id — deletes a shortcut', async () => {
    const createRes = await authedFetch('/api/shortcuts', {
      method: 'POST',
      body: JSON.stringify({ label: 'Delete Me', command: 'echo delete' }),
    });
    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    const id = created.id;

    const delRes = await authedFetch(`/api/shortcuts/${id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200, `Expected 200, got ${delRes.status}`);
    const delBody = await delRes.json();
    assert.equal(delBody.ok, true);

    const listRes = await authedFetch('/api/shortcuts');
    const list = await listRes.json();
    const stillThere = list.some(s => s.id === id);
    assert.ok(!stillThere, `Shortcut ${id} should be deleted but still appears in list`);
  });

  it('DELETE /api/shortcuts/:id — unauthenticated returns 401', async () => {
    const res = await fetch(`${BASE}/api/shortcuts/999`, { method: 'DELETE' });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });
});
