/**
 * Cookie helpers for session management.
 *
 * Pure functions — no I/O, no side effects.
 */

/**
 * Build a Set-Cookie header string for a session token.
 *
 * @param {string} token - The session token value.
 * @param {{ maxAgeSeconds?: number }} [options]
 * @returns {string} Set-Cookie header value.
 */
export function buildSessionCookie(token, { maxAgeSeconds = 86400 } = {}) {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/**
 * Build a Set-Cookie header string that clears the session cookie.
 *
 * @returns {string} Set-Cookie header value with Max-Age=0.
 */
export function buildClearCookie() {
  return 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

/**
 * Parse the `session` cookie value from a Cookie header string.
 *
 * @param {string | null | undefined} cookieHeader - Value of the `Cookie` request header.
 * @returns {string | null} The session token, or null if not found.
 */
export function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.split('=');
    if (rawKey.trim() === 'session') {
      return rest.join('=').trim() || null;
    }
  }

  return null;
}

/**
 * Validate that a state-changing request's Origin header is in the allowed list.
 * GET requests always pass (no state mutation risk).
 *
 * Returns false on missing Origin. This is intentional browser-CSRF protection.
 * Non-browser clients (curl, server-to-server) will be rejected — surface a
 * different auth path (HMAC token, etc) for those use cases.
 *
 * @param {Request} request
 * @param {string[]} allowedOrigins - Array of exact-match origin strings (no trailing slash).
 * @returns {boolean} true if the request is allowed, false if it should be rejected.
 */
export function validateOriginCsrf(request, allowedOrigins) {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return true;

  const origin = request.headers.get('Origin');
  if (!origin) return false;

  return allowedOrigins.includes(origin);
}
