import { handleHeartbeat } from './routes/heartbeat.js';
import { handleConnect } from './routes/connect.js';
import { handleAuthGoogle, handleAuthCallback, handleAuthLogout } from './routes/auth.js';
import { handleInviteCreate, handleInviteAccept } from './routes/invite.js';

// DO クラスを re-export（wrangler.toml の class_name と一致が必要）
export { PCRegistry } from './do/pc-registry.js';
export { SessionStore } from './do/session-store.js';
export { InviteStore } from './do/invite-store.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // ヘルスチェック（/health は Cloudflare 内部予約のため /healthz を使用）
    if (pathname === '/healthz') {
      return Response.json({ ok: true, ts: Date.now() });
    }

    // POST /api/heartbeat
    if (request.method === 'POST' && pathname === '/api/heartbeat') {
      return handleHeartbeat(request, env);
    }

    // POST /api/connect  — PC が Workers に認証・登録する
    if (request.method === 'POST' && pathname === '/api/connect') {
      return handleConnect(request, env);
    }

    // POST /api/register  (heartbeat に email_hash 付きで送ることと同義だが別エンドポイントも用意)
    if (request.method === 'POST' && pathname === '/api/register') {
      return handleHeartbeat(request, env);
    }

    // GET /api/pcs  — PC 一覧（email_hash でフィルタ、Week 3 で認証追加予定）
    if (request.method === 'GET' && pathname === '/api/pcs') {
      const email_hash = url.searchParams.get('email_hash');
      const doId = env.PC_REGISTRY.idFromName('global');
      const stub = env.PC_REGISTRY.get(doId);
      const listUrl = email_hash
        ? `http://do/list?email_hash=${encodeURIComponent(email_hash)}`
        : 'http://do/list';
      const resp = await stub.fetch(new Request(listUrl, { method: 'GET' }));
      return resp;
    }

    // GET /api/auth/google — redirect to Google OAuth2 consent screen
    if (request.method === 'GET' && pathname === '/api/auth/google') {
      return handleAuthGoogle(request, env);
    }

    // GET /api/auth/callback — handle OAuth2 callback, issue session token
    if (request.method === 'GET' && pathname === '/api/auth/callback') {
      return handleAuthCallback(request, env);
    }

    // POST /api/auth/logout — revoke session and clear cookie
    if (request.method === 'POST' && pathname === '/api/auth/logout') {
      return handleAuthLogout(request, env);
    }

    // POST /api/invite/create — 認証済みユーザーが招待URLを発行する
    if (request.method === 'POST' && pathname === '/api/invite/create') {
      return handleInviteCreate(request, env);
    }

    // GET /invite/:token — 招待トークン検証・OAuthリダイレクト
    if (request.method === 'GET' && pathname.startsWith('/invite/')) {
      return handleInviteAccept(request, env);
    }

    return new Response('cc-remote-dispatcher', { status: 404 });
  },
};
