/**
 * Invite URL route handlers.
 *
 * POST /api/invite/create  — 認証済みユーザーが招待URLを発行する
 * GET  /invite/:token       — 招待トークンを検証しOAuthへリダイレクト
 */

import { parseSessionCookie, validateOriginCsrf } from '../auth/cookie.js';

/**
 * POST /api/invite/create
 * 認証済みセッションを持つユーザーが24時間有効な招待URLを生成する。
 *
 * Required env:
 *   SESSION_STORE, INVITE_STORE, ALLOWED_ORIGINS (optional)
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Response}
 */
export async function handleInviteCreate(request, env) {
  const { SESSION_STORE, INVITE_STORE } = env;

  if (!SESSION_STORE || !INVITE_STORE) {
    return Response.json(
      { error: 'invite not configured (missing env vars)' },
      { status: 503 }
    );
  }

  // Origin CSRF validation
  const allowedOrigins = (env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (allowedOrigins.length === 0 || !validateOriginCsrf(request, allowedOrigins)) {
    return Response.json({ error: 'forbidden: origin not allowed' }, { status: 403 });
  }

  // Session authentication
  const sessionToken = parseSessionCookie(request.headers.get('Cookie'));
  if (!sessionToken) {
    return Response.json({ error: 'unauthorized: no session' }, { status: 401 });
  }

  // Verify session and extract email_hash
  const sessionDoId = SESSION_STORE.idFromName('global');
  const sessionStub = SESSION_STORE.get(sessionDoId);

  let sessionResp;
  try {
    sessionResp = await sessionStub.fetch(
      new Request(`http://do/get?token=${encodeURIComponent(sessionToken)}`, { method: 'GET' })
    );
  } catch (err) {
    return Response.json({ error: `session store error: ${err.message}` }, { status: 503 });
  }

  if (!sessionResp.ok) {
    return Response.json({ error: 'unauthorized: invalid or expired session' }, { status: 401 });
  }

  const { session } = await sessionResp.json();
  const { email_hash } = session;

  // Generate invite token (32 random bytes as hex)
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Store invite in InviteStore DO
  const inviteDoId = INVITE_STORE.idFromName('global');
  const inviteStub = INVITE_STORE.get(inviteDoId);

  let inviteResp;
  try {
    inviteResp = await inviteStub.fetch(
      new Request('http://do/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, created_by_email_hash: email_hash }),
      })
    );
  } catch (err) {
    return Response.json({ error: `invite store error: ${err.message}` }, { status: 503 });
  }

  if (!inviteResp.ok) {
    const body = await inviteResp.text();
    return Response.json({ error: `invite store rejected: ${body}` }, { status: 503 });
  }

  const { expires_at } = await inviteResp.json();
  const origin = new URL(request.url).origin;
  const invite_url = `${origin}/invite/${token}`;

  return Response.json({ ok: true, invite_url, expires_at });
}

/**
 * GET /invite/:token
 * 招待トークンを検証し、有効であれば Google OAuth へリダイレクト。
 * 無効・期限切れ・使用済みの場合は 410 HTML を返す。
 *
 * Required env:
 *   INVITE_STORE
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Response}
 */
export async function handleInviteAccept(request, env) {
  const { INVITE_STORE } = env;

  if (!INVITE_STORE) {
    return Response.json({ error: 'invite not configured' }, { status: 503 });
  }

  // Extract token from path /invite/<token>
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // pathname: /invite/<token>  → parts: ['', 'invite', '<token>']
  const token = parts[2] || '';

  if (!token) {
    return _invalidInviteResponse();
  }

  // Verify invite in InviteStore
  const inviteDoId = INVITE_STORE.idFromName('global');
  const inviteStub = INVITE_STORE.get(inviteDoId);

  let inviteResp;
  try {
    inviteResp = await inviteStub.fetch(
      new Request(`http://do/get?token=${encodeURIComponent(token)}`, { method: 'GET' })
    );
  } catch {
    return _invalidInviteResponse();
  }

  if (!inviteResp.ok) {
    return _invalidInviteResponse();
  }

  // Valid invite — redirect to Google OAuth with invite token embedded in state
  const oauthUrl = `${url.origin}/api/auth/google?invite=${encodeURIComponent(token)}`;
  return Response.redirect(oauthUrl, 302);
}

/**
 * 招待リンク無効時の 410 HTML レスポンス
 * @returns {Response}
 */
function _invalidInviteResponse() {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>招待リンクが無効です</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; text-align: center; color: #333; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>招待リンクが無効です</h1>
  <p>このリンクは有効期限切れか、すでに使用済みです。<br>招待者に新しいリンクを発行してもらってください。</p>
</body>
</html>`;

  return new Response(html, {
    status: 410,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
