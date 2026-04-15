/**
 * SessionStore Durable Object
 * セッショントークン管理（TTL 24時間）
 *
 * ストレージ構造（SQLite）:
 *   session:{token} -> JSON { token, email_hash, created_at, expires_at }
 *
 * cleanup() は create/get 時に lazy 削除。Alarm API は使用しない。
 */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class SessionStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    // POST /create
    if (method === 'POST' && url.pathname === '/create') {
      return this._create(request);
    }
    // GET /get?token=...
    if (method === 'GET' && url.pathname === '/get') {
      return this._get(url);
    }
    // POST /revoke
    if (method === 'POST' && url.pathname === '/revoke') {
      return this._revoke(request);
    }
    // POST /cleanup
    if (method === 'POST' && url.pathname === '/cleanup') {
      return this._cleanup();
    }

    return new Response('Not Found', { status: 404 });
  }

  async _create(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const { token, email_hash } = body;
    if (!token || !email_hash) {
      return Response.json({ error: 'token and email_hash required' }, { status: 400 });
    }

    const now = Date.now();
    const record = {
      token,
      email_hash,
      created_at: now,
      expires_at: now + SESSION_TTL_MS,
    };
    await this.state.storage.put(`session:${token}`, JSON.stringify(record));

    // lazy クリーンアップ
    await this._cleanupInternal();

    return Response.json({ ok: true, expires_at: record.expires_at });
  }

  async _get(url) {
    const token = url.searchParams.get('token');
    if (!token) {
      return Response.json({ error: 'token required' }, { status: 400 });
    }

    const raw = await this.state.storage.get(`session:${token}`);
    if (!raw) {
      return Response.json({ error: 'session not found' }, { status: 404 });
    }

    const record = JSON.parse(raw);
    if (Date.now() > record.expires_at) {
      await this.state.storage.delete(`session:${token}`);
      return Response.json({ error: 'session expired' }, { status: 410 });
    }

    return Response.json({ session: record });
  }

  async _revoke(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const { token } = body;
    if (!token) {
      return Response.json({ error: 'token required' }, { status: 400 });
    }

    await this.state.storage.delete(`session:${token}`);
    return Response.json({ ok: true });
  }

  async _cleanup() {
    const deleted = await this._cleanupInternal();
    return Response.json({ ok: true, deleted });
  }

  async _cleanupInternal() {
    const all = await this.state.storage.list({ prefix: 'session:' });
    const now = Date.now();
    const toDelete = [];

    for (const [key, raw] of all) {
      const record = JSON.parse(raw);
      if (now > record.expires_at) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      await this.state.storage.delete(key);
    }

    return toDelete.length;
  }
}
