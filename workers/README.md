# cc-remote-dispatcher Workers

Cloudflare Workers entry point for the CC-Remote dispatcher service.

## Development

```bash
npm run dev            # local wrangler dev
npm run deploy:staging # deploy to staging environment
```

## Running tests

```bash
node --test workers/src/lib/hmac.test.js
node --test workers/src/auth/google.test.js
node --test workers/src/auth/state.test.js
```

## Week 2 Task 2-4: Invite URLs

Authenticated users can generate invite links that allow new users to sign in via Google OAuth.

**Flow:**
1. Authenticated user calls `POST /api/invite/create` (session cookie required). Returns `{ ok, invite_url, expires_at }`. TTL is 24 hours; `expires_at` is an ISO-compatible Unix timestamp in ms.
2. Recipient opens `GET /invite/<token>`. If valid, redirected to `/api/auth/google?invite=<token>`.
3. Google OAuth completes. The callback marks the invite as used (one-time use) before issuing a session.

**Endpoints:**

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/invite/create` | Session cookie + Origin | Generate a 24h invite URL |
| `GET` | `/invite/:token` | None | Validate token; redirect to OAuth or return 410 |

**Durable Object:** `InviteStore` (v3 migration, SQLite-backed). Lazy cleanup on create/get. No Alarm API.

**Notes:**
- Allowlist enforcement (Week 3) is out of scope; this task only marks invites as used.
- `invite_url` origin mirrors the request origin; let UI format `expires_at` for display.

## Security Notes

- **Origin CSRF validation (`validateOriginCsrf`)**: State-changing endpoints (POST/PUT/DELETE) require an `Origin` header. Requests without an `Origin` are rejected by design — this guards against CSRF from browser contexts. Non-browser clients (curl, server-to-server) must use HMAC token auth instead.

## Known Open Items (Week 3)

- `/api/pcs` is currently unauthenticated. Do NOT expose the dispatcher URL publicly until Week 3 PC一覧UI auth lands.

## Week 2 Secrets

The following secrets must be configured via `wrangler secret put` before the Google OAuth flow can operate.

| Secret | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth2 Client ID (from Google Cloud Console). Stored as secret for parity even though it is technically public. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 Client Secret. Never commit this value. |
| `HMAC_SECRET` | Already exists from Week 1. Reuse the same value. Signs HMAC heartbeat tokens and OAuth CSRF state. |
| `OAUTH_REDIRECT_URI` | The authorized redirect URI registered in Google Cloud Console. For staging: `https://cc-remote-dispatcher-staging.<YOUR_SUBDOMAIN>.workers.dev/api/auth/callback` |
| `DEBUG_RETURN_TOKEN` | ⚠️ Never set in production — it leaks session tokens in OAuth callback responses. Local dev only. |

### Wrangler commands (staging)

```bash
wrangler secret put GOOGLE_CLIENT_ID       --env staging
wrangler secret put GOOGLE_CLIENT_SECRET   --env staging
# HMAC_SECRET already set — skip unless rotating
wrangler secret put HMAC_SECRET            --env staging
wrangler secret put OAUTH_REDIRECT_URI     --env staging
```

### Wrangler commands (production)

```bash
wrangler secret put GOOGLE_CLIENT_ID       --env production
wrangler secret put GOOGLE_CLIENT_SECRET   --env production
wrangler secret put HMAC_SECRET            --env production
wrangler secret put OAUTH_REDIRECT_URI     --env production
```

> Note: `OAUTH_REDIRECT_URI` for production will be the production Workers URL once it is set up.
> Register both staging and production URIs in the Google Cloud Console "Authorized redirect URIs" list.

## Environment Variables (moved to secrets)

`ALLOWED_ORIGINS` and `OAUTH_REDIRECT_URI` were previously set via `[vars]` in `wrangler.toml` but have been moved to secrets to keep deployment URLs out of the public repo.

| Variable | Description | Example value |
|---|---|---|
| `ALLOWED_ORIGINS` | Comma-separated list of origins permitted to call state-changing endpoints (e.g. `POST /api/auth/logout`). Used for Origin CSRF validation. **If unset or empty, all state-changing requests return 403.** | `https://cc-remote-dispatcher-staging.<YOUR_SUBDOMAIN>.workers.dev` |

### Setting `ALLOWED_ORIGINS` for local dev

Create `workers/.dev.vars` from `.dev.vars.example` (gitignored):

```
ALLOWED_ORIGINS=http://localhost:3000
```

### Setting `ALLOWED_ORIGINS` for staging/production

```bash
wrangler secret put ALLOWED_ORIGINS --env staging
wrangler secret put ALLOWED_ORIGINS --env production
```
