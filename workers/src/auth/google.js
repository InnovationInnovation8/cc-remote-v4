/**
 * Google OAuth helpers — pure functions, no side effects except JWKS caching.
 * Works in Cloudflare Workers (WebCrypto, fetch, caches.default).
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// ---- base64url helpers ----

/**
 * base64url string → Uint8Array
 * @param {string} str
 * @returns {Uint8Array}
 */
function base64urlToUint8Array(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * ArrayBuffer → base64url string
 * @param {ArrayBuffer} buf
 * @returns {string}
 */
function bufToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * base64url string → plain string (UTF-8 decoded)
 * @param {string} str
 * @returns {string}
 */
function base64urlToString(str) {
  const bytes = base64urlToUint8Array(str);
  return new TextDecoder().decode(bytes);
}

// ---- public API ----

/**
 * Build a Google OAuth2 authorization URL.
 * @param {{ clientId: string, redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    access_type: 'online',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 * @param {{ code: string, clientId: string, clientSecret: string, redirectUri: string }} opts
 * @returns {Promise<object>} parsed token response JSON
 */
export async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error('token exchange failed:', data);
    throw new Error('token exchange failed');
  }
  return data;
}

/**
 * Verify a Google ID token (JWT).
 * Fetches JWKS from Google and caches the response via caches.default.
 * @param {string} idToken
 * @param {string} clientId  expected audience
 * @returns {Promise<object>} JWT claims
 * @throws {Error} on any validation failure
 */
export async function verifyIdToken(idToken, clientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('invalid JWT format');

  const [headerB64, payloadB64, sigB64] = parts;

  // Decode header to get kid
  let header;
  try {
    header = JSON.parse(base64urlToString(headerB64));
  } catch {
    throw new Error('invalid JWT header');
  }

  // Decode payload
  let claims;
  try {
    claims = JSON.parse(base64urlToString(payloadB64));
  } catch {
    throw new Error('invalid JWT payload');
  }

  // Validate iss
  const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
  if (!validIssuers.includes(claims.iss)) {
    throw new Error(`invalid iss: ${claims.iss}`);
  }

  // Validate aud
  if (claims.aud !== clientId) {
    throw new Error(`invalid aud: ${claims.aud}`);
  }

  // Validate exp (with 30s skew tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (now > claims.exp + 30) {
    throw new Error('JWT expired');
  }

  // Validate nbf if present (with 30s skew tolerance)
  if (claims.nbf !== undefined && now < claims.nbf - 30) {
    throw new Error('token not yet valid');
  }

  // Fetch JWKS (cache in Cloudflare cache)
  const jwks = await fetchJwks();
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`no matching key for kid: ${header.kid}`);

  // Import the RSA public key
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Verify signature
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigBytes = base64urlToUint8Array(sigB64);
  const dataBytes = new TextEncoder().encode(signingInput);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    sigBytes,
    dataBytes
  );

  if (!valid) throw new Error('JWT signature verification failed');

  return claims;
}

/**
 * Fetch Google JWKS, using Cloudflare caches.default when available.
 * @returns {Promise<{ keys: object[] }>}
 */
async function fetchJwks() {
  const cacheKey = new Request(GOOGLE_JWKS_URL);

  // Try cache first
  if (typeof caches !== 'undefined') {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached.json();
  }

  const resp = await fetch(GOOGLE_JWKS_URL);
  if (!resp.ok) throw new Error(`failed to fetch JWKS: ${resp.status}`);

  // Store in cache (Workers cache respects Cache-Control headers from Google)
  if (typeof caches !== 'undefined') {
    try {
      await caches.default.put(cacheKey, resp.clone());
    } catch (err) {
      console.error('JWKS cache put failed (continuing):', err);
    }
  }

  return resp.json();
}

/**
 * SHA-256 hex of lowercased email.
 * @param {string} email
 * @returns {Promise<string>} hex string
 */
export async function hashEmail(email) {
  const data = new TextEncoder().encode(email.toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
