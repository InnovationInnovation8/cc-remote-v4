/**
 * InviteStore Durable Object
 * 招待トークン管理（TTL 24時間）
 *
 * ストレージ構造（SQLite）:
 *   invite:{token} -> JSON {
 *     token, created_by_email_hash, created_at, expires_at,
 *     used: false, used_by_email_hash: null, used_at: null
 *   }
 *
 * cleanup() は create/get 時に lazy 削除。Alarm API は使用しない。
 */

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class InviteStore {
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
    // POST /use
    if (method === 'POST' && url.pathname === '/use') {
      return this._use(request);
    }
    // POST /check-and-use (atomic: read-validate-write under blockConcurrencyWhile)
    if (method === 'POST' && url.pathname === '/check-and-use') {
      return this._checkAndUse(request);
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

    const { token, created_by_email_hash } = body;
    if (!token || !created_by_email_hash) {
      return Response.json({ error: 'token and created_by_email_hash required' }, { status: 400 });
    }

    const now = Date.now();
    const record = {
      token,
      created_by_email_hash,
      created_at: now,
      expires_at: now + INVITE_TTL_MS,
      used: false,
      used_by_email_hash: null,
      used_at: null,
    };
    await this.state.storage.put(`invite:${token}`, JSON.stringify(record));

    // lazy クリーンアップ
    await this._cleanupInternal();

    return Response.json({ ok: true, expires_at: record.expires_at });
  }

  async _get(url) {
    const token = url.searchParams.get('token');
    if (!token) {
      return Response.json({ error: 'token required' }, { status: 400 });
    }

    const raw = await this.state.storage.get(`invite:${token}`);
    if (!raw) {
      // lazy クリーンアップ（結果はレスポンスに影響しない）
      try { this._cleanupInternal(); } catch { /* ignore */ }
      return Response.json({ error: 'invite not found' }, { status: 404 });
    }

    const record = JSON.parse(raw);

    if (Date.now() > record.expires_at) {
      await this.state.storage.delete(`invite:${token}`);
      // lazy クリーンアップ（結果はレスポンスに影響しない）
      try { this._cleanupInternal(); } catch { /* ignore */ }
      return Response.json({ error: 'invite expired' }, { status: 410 });
    }

    if (record.used === true) {
      // lazy クリーンアップ（結果はレスポンスに影響しない）
      try { this._cleanupInternal(); } catch { /* ignore */ }
      return Response.json({ error: 'invite already used' }, { status: 410 });
    }

    // lazy クリーンアップ（結果はレスポンスに影響しない）
    try { this._cleanupInternal(); } catch { /* ignore */ }

    return Response.json({ invite: record });
  }

  async _use(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const { token, used_by_email_hash } = body;
    if (!token || !used_by_email_hash) {
      return Response.json({ error: 'token and used_by_email_hash required' }, { status: 400 });
    }

    const raw = await this.state.storage.get(`invite:${token}`);
    if (!raw) {
      return Response.json({ error: 'invite not found' }, { status: 404 });
    }

    const record = JSON.parse(raw);

    if (Date.now() > record.expires_at) {
      await this.state.storage.delete(`invite:${token}`);
      return Response.json({ error: 'invite expired' }, { status: 410 });
    }

    if (record.used === true) {
      return Response.json({ error: 'invite already used' }, { status: 410 });
    }

    record.used = true;
    record.used_by_email_hash = used_by_email_hash;
    record.used_at = Date.now();
    await this.state.storage.put(`invite:${token}`, JSON.stringify(record));

    return Response.json({ ok: true });
  }

  async _checkAndUse(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const { token, used_by_email_hash } = body;
    if (!token || !used_by_email_hash) {
      return Response.json({ error: 'token and used_by_email_hash required' }, { status: 400 });
    }

    return this.state.blockConcurrencyWhile(async () => {
      const raw = await this.state.storage.get(`invite:${token}`);
      if (!raw) {
        return Response.json({ error: 'invite not found' }, { status: 404 });
      }

      const record = JSON.parse(raw);
      const now = Date.now();

      if (now > record.expires_at) {
        await this.state.storage.delete(`invite:${token}`);
        return Response.json({ error: 'expired' }, { status: 410 });
      }

      if (record.used === true) {
        return Response.json({ error: 'already used' }, { status: 410 });
      }

      record.used = true;
      record.used_by_email_hash = used_by_email_hash;
      record.used_at = now;
      await this.state.storage.put(`invite:${token}`, JSON.stringify(record));

      return Response.json({ ok: true, invite: record });
    });
  }

  async _cleanup() {
    const deleted = await this._cleanupInternal();
    return Response.json({ ok: true, deleted });
  }

  async _cleanupInternal() {
    const all = await this.state.storage.list({ prefix: 'invite:' });
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
