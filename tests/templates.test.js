/**
 * Template API integration tests
 * Tests: POST /api/templates, GET /api/templates, DELETE /api/templates/:id
 *
 * Strategy:
 * - Set LOCALAPPDATA to a temp dir BEFORE importing db.js so a fresh DB is used
 * - Boot a minimal Express app with only auth + template routes
 * - Obtain a token via /api/auth/setup then test all template endpoints
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Override DB path BEFORE importing db.js (dynamic imports respect current env)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-remote-tmpl-test-'));
process.env.LOCALAPPDATA = tmpDir;

// Dynamic imports so db.js sees the overridden LOCALAPPDATA
const { initDB, getDB, saveDB } = await import('../src/server/db.js');
const { default: express } = await import('express');
const { authMiddleware, authRoutes } = await import('../src/server/auth.js');

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

describe('Template API', () => {
  before(async () => {
    await initDB();

    const app = express();
    app.use(express.json());

    // Auth routes (no middleware required)
    app.use('/api/auth', authRoutes);

    // Everything under /api requires auth token
    app.use('/api', authMiddleware);

    // Template endpoints — verbatim from src/server/index.js (with fixes applied)
    app.get('/api/templates', (req, res) => {
      try {
        const db = getDB();
        const result = db.exec('SELECT id, name, prompt, category, sort_order FROM templates ORDER BY sort_order ASC, created_at DESC');
        const rows = result.length > 0
          ? result[0].values.map(r => ({ id: r[0], name: r[1], prompt: r[2], category: r[3], sortOrder: r[4] }))
          : [];
        res.json(rows);
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/templates', (req, res) => {
      try {
        const { name, prompt, category } = req.body;
        if (!name || !prompt) return res.status(400).json({ error: 'name and prompt required' });
        if (name.length > 200 || prompt.length > 10000)
          return res.status(400).json({ error: 'name/prompt too long' });
        const db = getDB();
        db.run(
          'INSERT INTO templates (name, prompt, category, sort_order, created_at) VALUES (?, ?, ?, 0, ?)',
          [name, prompt, category || '', Date.now()]
        );
        const result = db.exec('SELECT last_insert_rowid()');
        const id = result[0].values[0][0];
        saveDB();
        res.json({ id, name, prompt, category: category || '' });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.delete('/api/templates/:id', (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
        const db = getDB();
        db.run('DELETE FROM templates WHERE id = ?', [id]);
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

  it('GET /api/templates — returns empty array initially', async () => {
    const res = await authedFetch('/api/templates');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(Array.isArray(body), 'Response should be an array');
    assert.equal(body.length, 0, 'Should start empty');
  });

  it('GET /api/templates — unauthenticated returns 401', async () => {
    const res = await fetch(`${BASE}/api/templates`);
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it('POST /api/templates — validation error when prompt is missing', async () => {
    const res = await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'only name' }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error, 'Should return an error message');
    assert.ok(body.error.includes('required'), `Error should mention required fields, got: ${body.error}`);
  });

  it('POST /api/templates — validation error when both fields missing', async () => {
    const res = await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  it('POST /api/templates — validation error when name too long', async () => {
    const res = await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'a'.repeat(201), prompt: 'valid prompt' }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error.includes('too long'), `Error should mention too long, got: ${body.error}`);
  });

  it('POST /api/templates — validation error when prompt too long', async () => {
    const res = await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'valid name', prompt: 'p'.repeat(10001) }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error.includes('too long'), `Error should mention too long, got: ${body.error}`);
  });

  it('POST /api/templates — creates a template successfully', async () => {
    const res = await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Template', prompt: 'Do something useful', category: '開発' }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.id !== undefined, `id should be present, got: ${JSON.stringify(body)}`);
    assert.equal(body.name, 'Test Template');
    assert.equal(body.prompt, 'Do something useful');
    assert.equal(body.category, '開発');
  });

  it('POST /api/templates — creates a template with default empty category', async () => {
    const res = await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Category', prompt: 'Some prompt' }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.id !== undefined);
    assert.equal(body.category, '');
  });

  it('GET /api/templates — lists created templates', async () => {
    await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'List Check', prompt: 'List prompt', category: 'ツール' }),
    });

    const res = await authedFetch('/api/templates');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    const found = body.find(t => t.name === 'List Check' && t.prompt === 'List prompt');
    assert.ok(found, 'Created template should appear in list');
    assert.ok(found.id !== undefined, 'id should be present');
    assert.equal(found.category, 'ツール');
    assert.ok(typeof found.sortOrder === 'number', 'sortOrder should be number');
  });

  it('DELETE /api/templates/:id — deletes a template', async () => {
    const createRes = await authedFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Delete Me', prompt: 'delete prompt' }),
    });
    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    const id = created.id;

    const delRes = await authedFetch(`/api/templates/${id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200, `Expected 200, got ${delRes.status}`);
    const delBody = await delRes.json();
    assert.equal(delBody.ok, true);

    const listRes = await authedFetch('/api/templates');
    const list = await listRes.json();
    const stillThere = list.some(t => t.id === id);
    assert.ok(!stillThere, `Template ${id} should be deleted but still appears in list`);
  });

  it('DELETE /api/templates/:id — returns 400 for NaN id', async () => {
    const res = await authedFetch('/api/templates/abc', { method: 'DELETE' });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error.includes('invalid'), `Error should mention invalid id, got: ${body.error}`);
  });

  it('DELETE /api/templates/:id — returns 404 for nonexistent id', async () => {
    const res = await authedFetch('/api/templates/999999', { method: 'DELETE' });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error.includes('not found'), `Error should mention not found, got: ${body.error}`);
  });

  it('DELETE /api/templates/:id — unauthenticated returns 401', async () => {
    const res = await fetch(`${BASE}/api/templates/999`, { method: 'DELETE' });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });
});
